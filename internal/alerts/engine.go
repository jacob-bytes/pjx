// Package alerts 评估告警规则，维护 firing / resolved 状态机并触发通知。
//
// 设计：
//   - 只在状态跃迁时通知（首次 firing、恢复 resolved）；冷却期内重复触发不刷屏
//   - 事件 id 为 ruleID:target，重启后从 DB 恢复 firing 状态，避免重复通知
//   - 指标规则与离线规则走 ObserveMetric / Run；探测规则走 ObserveProbe
package alerts

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jacob-bytes/pjx/internal/notify"
	"github.com/jacob-bytes/pjx/internal/protocol"
	"github.com/jacob-bytes/pjx/internal/store"
)

// Store 是引擎需要的持久化能力。
type Store interface {
	ListAlertRules(ctx context.Context) ([]store.AlertRule, error)
	UpsertAlertEvent(ctx context.Context, event store.AlertEvent) error
	ListAlertEvents(ctx context.Context, state string, limit int) ([]store.AlertEvent, error)
	ListAgents(ctx context.Context) ([]store.Agent, error)
	DeleteAlertEventsBefore(ctx context.Context, cutoff time.Time) (int64, error)
}

// Notifier 是通知渠道；nil 表示只记录事件不发送。
type Notifier interface {
	Send(ctx context.Context, message notify.Message) error
}

// Options 控制检查频率与事件保留。
type Options struct {
	Tick         time.Duration
	EventKeep    time.Duration
	CleanupEvery time.Duration
	Now          func() time.Time
}

// Engine 是告警引擎。
type Engine struct {
	store    Store
	notifier Notifier
	log      *slog.Logger
	opts     Options

	mu         sync.Mutex
	rules      map[string]store.AlertRule
	pending    map[string]*pendingState
	events     map[string]store.AlertEvent
	probeFails map[string]int
}

type pendingState struct {
	since   time.Time
	value   float64
	message string
}

// New 构造引擎。
func New(db Store, notifier Notifier, log *slog.Logger, opts Options) *Engine {
	if opts.Tick <= 0 {
		opts.Tick = 15 * time.Second
	}
	if opts.EventKeep <= 0 {
		opts.EventKeep = 90 * 24 * time.Hour
	}
	if opts.CleanupEvery <= 0 {
		opts.CleanupEvery = 10 * time.Minute
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &Engine{
		store:      db,
		notifier:   notifier,
		log:        log,
		opts:       opts,
		rules:      make(map[string]store.AlertRule),
		pending:    make(map[string]*pendingState),
		events:     make(map[string]store.AlertEvent),
		probeFails: make(map[string]int),
	}
}

// Reload 重新加载规则，并恢复仍然 firing 的事件状态。
func (e *Engine) Reload(ctx context.Context) error {
	rules, err := e.store.ListAlertRules(ctx)
	if err != nil {
		return err
	}
	next := make(map[string]store.AlertRule, len(rules))
	for _, rule := range rules {
		next[rule.ID] = rule
	}

	firing, err := e.store.ListAlertEvents(ctx, "firing", 1000)
	if err != nil {
		return err
	}
	events := make(map[string]store.AlertEvent, len(firing))
	for _, event := range firing {
		events[event.ID] = event
	}

	e.mu.Lock()
	e.rules = next
	e.events = events
	e.mu.Unlock()
	return nil
}

// Run 启动周期任务：离线检查与事件清理。
func (e *Engine) Run(ctx context.Context) {
	if err := e.Reload(ctx); err != nil {
		e.log.Warn("load alert rules", "err", err)
	}

	ticker := time.NewTicker(e.opts.Tick)
	defer ticker.Stop()
	cleanup := time.NewTicker(e.opts.CleanupEvery)
	defer cleanup.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.checkOffline(ctx)
		case <-cleanup.C:
			e.cleanup(ctx)
		}
	}
}

// ObserveMetric 评估指标规则（cpu / mem / disk / load / swap / tcp / udp / proc）。
func (e *Engine) ObserveMetric(agentID string, sample protocol.Sample) {
	now := e.opts.Now()
	for _, rule := range e.enabledRules("metric") {
		value, ok := metricValue(sample, rule.Metric)
		if ok == false {
			continue
		}
		breach := compare(value, rule.Operator, rule.Threshold)
		message := fmt.Sprintf("%s = %.2f（阈值 %s %.2f）", rule.Metric, value, operatorText(rule.Operator), rule.Threshold)
		e.evaluate(context.Background(), rule, agentID, breach, value, message, now, true)
	}
}

// ObserveProbe 评估探测规则：目标任务连续失败达到阈值即触发。
func (e *Engine) ObserveProbe(result store.TaskResult) {
	now := e.opts.Now()
	for _, rule := range e.enabledRules("probe") {
		if rule.Target != "" && rule.Target != result.TaskID {
			continue
		}
		key := rule.ID + "|" + result.TaskID + "|" + result.AgentID

		e.mu.Lock()
		if result.OK {
			delete(e.probeFails, key)
		} else {
			e.probeFails[key]++
		}
		fails := e.probeFails[key]
		e.mu.Unlock()

		target := result.TaskID + ":" + result.AgentID
		breach := float64(fails) >= rule.Threshold
		message := fmt.Sprintf("任务 %s 在 %s 上连续失败 %d 次", result.TaskID, result.AgentID, fails)
		e.evaluate(context.Background(), rule, target, breach, float64(fails), message, now, false)
	}
}

// TestNotify 发送一条测试通知，供后台「发送测试消息」使用。
func (e *Engine) TestNotify(ctx context.Context) error {
	notifier := e.notifierRef()
	if notifier == nil {
		return fmt.Errorf("notifier is not configured")
	}
	return notifier.Send(ctx, notify.Message{
		Title: "pjx 测试通知",
		Body:  "<b>pjx 通知测试</b>\n如果你收到这条消息，说明渠道配置正确。",
		Level: "info",
	})
}

// SetNotifier 热替换通知渠道（设置页保存 Telegram 后调用）。
func (e *Engine) SetNotifier(notifier Notifier) {
	e.mu.Lock()
	e.notifier = notifier
	e.mu.Unlock()
}

func (e *Engine) notifierRef() Notifier {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.notifier
}

func (e *Engine) enabledRules(kind string) []store.AlertRule {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]store.AlertRule, 0, len(e.rules))
	for _, rule := range e.rules {
		if rule.Enabled && rule.Kind == kind {
			out = append(out, rule)
		}
	}
	return out
}

func (e *Engine) checkOffline(ctx context.Context) {
	agents, err := e.store.ListAgents(ctx)
	if err != nil {
		e.log.Warn("list agents for offline check", "err", err)
		return
	}
	rules := e.enabledRules("offline")
	if len(rules) == 0 {
		return
	}
	now := e.opts.Now()
	for _, agent := range agents {
		if agent.LastSeenAt.IsZero() {
			continue
		}
		seconds := now.Sub(agent.LastSeenAt).Seconds()
		for _, rule := range rules {
			breach := seconds >= float64(rule.ForSeconds)
			message := fmt.Sprintf("最后上报在 %.0f 秒前", seconds)
			e.evaluate(ctx, rule, agent.ID, breach, seconds, message, now, false)
		}
	}
}

func (e *Engine) evaluate(ctx context.Context, rule store.AlertRule, target string, breach bool, value float64, message string, now time.Time, requireFor bool) {
	key := rule.ID + "|" + target
	cooldown := time.Duration(rule.CooldownSeconds) * time.Second
	if cooldown <= 0 {
		cooldown = 10 * time.Minute
	}

	e.mu.Lock()
	event, hasEvent := e.events[key]
	pending, hasPending := e.pending[key]

	if breach {
		if hasEvent && event.State == "firing" {
			event.Value = value
			event.Message = message
			event.UpdatedAt = now
			e.events[key] = event
			e.mu.Unlock()
			_ = e.store.UpsertAlertEvent(ctx, event)
			return
		}
		since := now
		if hasPending {
			if requireFor && now.Sub(pending.since) < time.Duration(rule.ForSeconds)*time.Second {
				pending.value = value
				pending.message = message
				e.mu.Unlock()
				return
			}
			since = pending.since
		} else if requireFor {
			e.pending[key] = &pendingState{since: now, value: value, message: message}
			e.mu.Unlock()
			return
		}

		delete(e.pending, key)
		notifyNow := event.NotifiedAt.IsZero() || now.Sub(event.NotifiedAt) >= cooldown
		firing := store.AlertEvent{
			ID: key, RuleID: rule.ID, Target: target, Severity: rule.Severity,
			State: "firing", Value: value, Message: message,
			StartedAt: since, UpdatedAt: now,
		}
		if notifyNow {
			firing.NotifiedAt = now
		} else {
			firing.NotifiedAt = event.NotifiedAt
		}
		e.events[key] = firing
		e.mu.Unlock()

		_ = e.store.UpsertAlertEvent(ctx, firing)
		if notifyNow {
			e.notify(rule, firing, "firing")
		}
		return
	}

	delete(e.pending, key)
	if hasEvent && event.State == "firing" {
		resolved := event
		resolved.State = "resolved"
		resolved.Value = value
		resolved.Message = message
		resolved.UpdatedAt = now
		resolved.ResolvedAt = now
		resolved.NotifiedAt = now
		e.events[key] = resolved
		e.mu.Unlock()

		_ = e.store.UpsertAlertEvent(ctx, resolved)
		e.notify(rule, resolved, "resolved")
		return
	}
	e.mu.Unlock()
}

func (e *Engine) notify(rule store.AlertRule, event store.AlertEvent, state string) {
	notifier := e.notifierRef()
	if notifier == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := notifier.Send(ctx, renderMessage(rule, event, state)); err != nil {
		e.log.Warn("send alert notification", "rule", rule.ID, "target", event.Target, "err", err)
	}
}

func (e *Engine) cleanup(ctx context.Context) {
	deleted, err := e.store.DeleteAlertEventsBefore(ctx, e.opts.Now().Add(-e.opts.EventKeep))
	if err != nil {
		e.log.Warn("cleanup alert events", "err", err)
		return
	}
	if deleted > 0 {
		e.log.Info("cleanup alert events", "deleted", deleted)
	}
}

func renderMessage(rule store.AlertRule, event store.AlertEvent, state string) notify.Message {
	title := "告警"
	if state == "resolved" {
		title = "恢复"
	}
	body := strings.Join([]string{
		fmt.Sprintf("<b>[%s] %s</b>", title, html.EscapeString(rule.Name)),
		"对象: " + html.EscapeString(event.Target),
		fmt.Sprintf("值: %.2f（阈值 %.2f）", event.Value, rule.Threshold),
		html.EscapeString(event.Message),
		"时间: " + event.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, "\n")
	return notify.Message{
		Title: title + " " + rule.Name,
		Body:  body,
		Level: rule.Severity,
	}
}

func metricValue(sample protocol.Sample, metric string) (float64, bool) {
	switch metric {
	case "cpu":
		return sample.CPU, true
	case "load":
		return sample.Load, true
	case "mem":
		return percent(sample.MemUsed, sample.MemTotal), true
	case "disk":
		return percent(sample.DiskUsed, sample.DiskTotal), true
	case "swap":
		return percent(sample.SwapUsed, sample.SwapTotal), true
	case "tcp":
		return float64(sample.TCP), true
	case "udp":
		return float64(sample.UDP), true
	case "proc":
		return float64(sample.Proc), true
	default:
		return 0, false
	}
}

func compare(value float64, operator string, threshold float64) bool {
	switch operator {
	case "lt":
		return value < threshold
	default:
		return value > threshold
	}
}

func operatorText(operator string) string {
	if operator == "lt" {
		return "<"
	}
	return ">"
}

func percent(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}
