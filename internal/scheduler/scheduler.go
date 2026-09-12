// Package scheduler 按任务周期向在线 agent 下发探活请求，并落盘结果。
//
// 设计取舍：
//   - 调度在 master，agent 不依赖本地时间
//   - run_id 由 master 生成，task_results 主键去重，重连补发不会写重复
//   - 离线节点默认 skip；queue + TTL 预留（tasks.on_offline）
package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
	"github.com/jacob-bytes/pjx/internal/store"
)

// Dispatcher 由 master 实现：把 TaskSpec 发给指定 agent 并等待结果。
type Dispatcher interface {
	Dispatch(ctx context.Context, agentID string, spec protocol.TaskSpec) (protocol.TaskResultParams, error)
	Online(agentID string) bool
}

// Store 是调度器需要的持久化能力。
type Store interface {
	ListTasks(ctx context.Context) ([]store.Task, error)
	ListAgents(ctx context.Context) ([]store.Agent, error)
	InsertTaskResult(ctx context.Context, result store.TaskResult) (bool, error)
	DeleteTaskResultsBefore(ctx context.Context, cutoff time.Time) (int64, error)
}

// Options 控制调度频率与结果保留。
type Options struct {
	Tick         time.Duration
	Grace        time.Duration
	ResultKeep   time.Duration
	CleanupEvery time.Duration
}

// Scheduler 维护任务缓存与下发节奏。
type Scheduler struct {
	store      Store
	dispatcher Dispatcher
	log        *slog.Logger
	opts       Options

	mu      sync.Mutex
	tasks   map[string]store.Task
	lastRun map[string]time.Time
	nextID  uint64

	onResult func(store.TaskResult)
}

// New 构造调度器。
func New(db Store, dispatcher Dispatcher, log *slog.Logger, opts Options) *Scheduler {
	if opts.Tick <= 0 {
		opts.Tick = time.Second
	}
	if opts.Grace <= 0 {
		opts.Grace = 2 * time.Second
	}
	if opts.ResultKeep <= 0 {
		opts.ResultKeep = 30 * 24 * time.Hour
	}
	if opts.CleanupEvery <= 0 {
		opts.CleanupEvery = 10 * time.Minute
	}
	return &Scheduler{
		store:      db,
		dispatcher: dispatcher,
		log:        log,
		opts:       opts,
		tasks:      make(map[string]store.Task),
		lastRun:    make(map[string]time.Time),
	}
}

// SetResultHook 注册结果回调（告警引擎使用）。
func (s *Scheduler) SetResultHook(hook func(store.TaskResult)) {
	s.mu.Lock()
	s.onResult = hook
	s.mu.Unlock()
}

// Reload 从 DB 重新加载任务，CRUD 之后调用。
func (s *Scheduler) Reload(ctx context.Context) error {
	tasks, err := s.store.ListTasks(ctx)
	if err != nil {
		return err
	}
	next := make(map[string]store.Task, len(tasks))
	for _, task := range tasks {
		next[task.ID] = task
	}
	s.mu.Lock()
	s.tasks = next
	s.mu.Unlock()
	return nil
}

// Run 启动调度循环，阻塞到 ctx 取消。
func (s *Scheduler) Run(ctx context.Context) {
	if err := s.Reload(ctx); err != nil {
		s.log.Warn("load tasks", "err", err)
	}

	ticker := time.NewTicker(s.opts.Tick)
	defer ticker.Stop()
	cleanup := time.NewTicker(s.opts.CleanupEvery)
	defer cleanup.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runDue(ctx)
		case <-cleanup.C:
			s.cleanup(ctx)
		}
	}
}

// runDue 找出到期任务并并发下发。
func (s *Scheduler) runDue(ctx context.Context) {
	now := time.Now()

	s.mu.Lock()
	due := make([]store.Task, 0)
	for id, task := range s.tasks {
		if task.Enabled == false {
			continue
		}
		interval := time.Duration(task.Interval) * time.Second
		if interval <= 0 {
			interval = time.Minute
		}
		if now.Sub(s.lastRun[id]) >= interval {
			s.lastRun[id] = now
			due = append(due, task)
		}
	}
	s.mu.Unlock()

	for _, task := range due {
		go s.dispatchTask(ctx, task)
	}
}

func (s *Scheduler) dispatchTask(ctx context.Context, task store.Task) {
	agents, err := s.store.ListAgents(ctx)
	if err != nil {
		s.log.Warn("list agents for task", "task", task.ID, "err", err)
		return
	}
	targets := resolveTargets(task, agents)
	for _, agent := range targets {
		if s.dispatcher.Online(agent.ID) == false {
			// 离线策略：v1 默认 skip；queue + TTL 后续在 on_offline 上扩展
			continue
		}
		go s.dispatchOne(ctx, task, agent.ID)
	}
}

func (s *Scheduler) dispatchOne(ctx context.Context, task store.Task, agentID string) {
	attempts := task.Retries + 1
	if attempts < 1 {
		attempts = 1
	}
	timeout := time.Duration(task.TimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	runID := s.newRunID(task.ID)
	var (
		lastErr error
		result  protocol.TaskResultParams
	)
	for attempt := int64(1); attempt <= attempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, timeout+s.opts.Grace)
		result, lastErr = s.dispatcher.Dispatch(attemptCtx, agentID, protocol.TaskSpec{
			RunID:   runID,
			Kind:    task.Kind,
			Target:  task.Target,
			Timeout: int(task.TimeoutMS),
		})
		cancel()
		if lastErr == nil {
			break
		}
		updated := runID + "-r" + fmt.Sprintf("%d", attempt+1)
		runID = updated
	}

	record := store.TaskResult{
		RunID:     runID,
		TaskID:    task.ID,
		AgentID:   agentID,
		TS:        time.Now(),
		LatencyMS: result.LatencyMS,
		Message:   result.Message,
	}
	if lastErr == nil {
		record.OK = result.OK
	} else {
		record.OK = false
		if record.Message == "" {
			record.Message = lastErr.Error()
		}
	}
	inserted, err := s.store.InsertTaskResult(ctx, record)
	if err != nil {
		s.log.Warn("insert task result", "task", task.ID, "agent", agentID, "err", err)
	}
	if inserted {
		s.mu.Lock()
		hook := s.onResult
		s.mu.Unlock()
		if hook != nil {
			hook(record)
		}
	}
}

func (s *Scheduler) cleanup(ctx context.Context) {
	cutoff := time.Now().Add(-s.opts.ResultKeep)
	deleted, err := s.store.DeleteTaskResultsBefore(ctx, cutoff)
	if err != nil {
		s.log.Warn("cleanup task results", "err", err)
		return
	}
	if deleted > 0 {
		s.log.Info("cleanup task results", "deleted", deleted)
	}
}

func (s *Scheduler) newRunID(taskID string) string {
	s.mu.Lock()
	s.nextID++
	sequence := s.nextID
	s.mu.Unlock()
	return fmt.Sprintf("%s-%d-%d", taskID, time.Now().UnixNano(), sequence)
}

func resolveTargets(task store.Task, agents []store.Agent) []store.Agent {
	switch task.ScopeType {
	case "tag":
		tag := strings.TrimSpace(task.ScopeValue)
		var out []store.Agent
		for _, agent := range agents {
			if containsString(agent.Tags, tag) {
				out = append(out, agent)
			}
		}
		return out
	case "agents":
		wanted := make(map[string]bool)
		for _, part := range strings.Split(task.ScopeValue, ",") {
			id := strings.TrimSpace(part)
			if len(id) > 0 {
				wanted[id] = true
			}
		}
		var out []store.Agent
		for _, agent := range agents {
			if wanted[agent.ID] {
				out = append(out, agent)
			}
		}
		return out
	default:
		return agents
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
