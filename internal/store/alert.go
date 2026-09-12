package store

import (
	"context"
	"time"
)

// AlertRule 是告警规则。
type AlertRule struct {
	ID              string
	Name            string
	Kind            string // metric | offline | probe
	Metric          string
	Operator        string // gt | lt
	Threshold       float64
	ForSeconds      int64
	Severity        string // info | warn | crit
	CooldownSeconds int64
	Target          string // probe 规则对应 task id；空表示全部
	Channel         string
	Enabled         bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AlertEvent 是一条告警事件（rule + target 唯一）。
type AlertEvent struct {
	ID         string
	RuleID     string
	Target     string
	Severity   string
	State      string // firing | resolved
	Value      float64
	Message    string
	StartedAt  time.Time
	UpdatedAt  time.Time
	ResolvedAt time.Time
	NotifiedAt time.Time
}

// UpsertAlertRule 新增或更新规则。
func (s *Store) UpsertAlertRule(ctx context.Context, rule AlertRule) error {
	now := time.Now().Unix()
	if rule.CreatedAt.IsZero() {
		rule.CreatedAt = time.Now()
	}
	if rule.Kind == "" {
		rule.Kind = "metric"
	}
	if rule.Operator == "" {
		rule.Operator = "gt"
	}
	if rule.Severity == "" {
		rule.Severity = "warn"
	}
	if rule.ForSeconds <= 0 {
		rule.ForSeconds = 60
	}
	if rule.CooldownSeconds <= 0 {
		rule.CooldownSeconds = 600
	}
	if rule.Channel == "" {
		rule.Channel = "telegram"
	}

	_, err := s.db.ExecContext(ctx, `
INSERT INTO alert_rules (
id, name, kind, metric, operator, threshold, for_seconds, severity,
cooldown_seconds, target, channel, enabled, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
name = excluded.name,
kind = excluded.kind,
metric = excluded.metric,
operator = excluded.operator,
threshold = excluded.threshold,
for_seconds = excluded.for_seconds,
severity = excluded.severity,
cooldown_seconds = excluded.cooldown_seconds,
target = excluded.target,
channel = excluded.channel,
enabled = excluded.enabled,
updated_at = excluded.updated_at`,
		rule.ID, rule.Name, rule.Kind, rule.Metric, rule.Operator, rule.Threshold,
		rule.ForSeconds, rule.Severity, rule.CooldownSeconds, rule.Target, rule.Channel,
		boolInt(rule.Enabled), rule.CreatedAt.Unix(), now)
	return err
}

// GetAlertRule 按 id 取规则。
func (s *Store) GetAlertRule(ctx context.Context, id string) (AlertRule, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT id, name, kind, metric, operator, threshold, for_seconds, severity,
       cooldown_seconds, target, channel, enabled, created_at, updated_at
FROM alert_rules WHERE id = ?`, id)
	return scanAlertRule(row)
}

// ListAlertRules 返回全部规则。
func (s *Store) ListAlertRules(ctx context.Context) ([]AlertRule, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, name, kind, metric, operator, threshold, for_seconds, severity,
       cooldown_seconds, target, channel, enabled, created_at, updated_at
FROM alert_rules ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AlertRule
	for rows.Next() {
		rule, err := scanAlertRule(rows)
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

// DeleteAlertRule 删除规则（保留历史事件）。
func (s *Store) DeleteAlertRule(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM alert_rules WHERE id = ?`, id)
	return err
}

// UpsertAlertEvent 写入或更新事件，id 为 ruleID:target。
func (s *Store) UpsertAlertEvent(ctx context.Context, event AlertEvent) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO alert_events (
id, rule_id, target, severity, state, value, message,
started_at, updated_at, resolved_at, notified_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
severity = excluded.severity,
state = excluded.state,
value = excluded.value,
message = excluded.message,
updated_at = excluded.updated_at,
resolved_at = excluded.resolved_at,
notified_at = excluded.notified_at`,
		event.ID, event.RuleID, event.Target, event.Severity, event.State, event.Value,
		event.Message, event.StartedAt.Unix(), event.UpdatedAt.Unix(),
		unixOrZero(event.ResolvedAt), unixOrZero(event.NotifiedAt))
	return err
}

// GetAlertEvent 按 id 取事件。
func (s *Store) GetAlertEvent(ctx context.Context, id string) (AlertEvent, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT id, rule_id, target, severity, state, value, message,
       started_at, updated_at, resolved_at, notified_at
FROM alert_events WHERE id = ?`, id)
	return scanAlertEvent(row)
}

// ListAlertEvents 按更新时间倒序返回事件；state 为空表示全部。
func (s *Store) ListAlertEvents(ctx context.Context, state string, limit int) ([]AlertEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	query := `
SELECT id, rule_id, target, severity, state, value, message,
       started_at, updated_at, resolved_at, notified_at
FROM alert_events`
	args := []any{}
	if state != "" {
		query += ` WHERE state = ?`
		args = append(args, state)
	}
	query += ` ORDER BY updated_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []AlertEvent
	for rows.Next() {
		event, err := scanAlertEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// DeleteAlertEventsBefore 删除 cutoff 之前的事件。
func (s *Store) DeleteAlertEventsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM alert_events WHERE updated_at < ?`, cutoff.Unix())
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func scanAlertRule(row rowScanner) (AlertRule, error) {
	var (
		rule      AlertRule
		enabled   int
		createdAt int64
		updatedAt int64
	)
	err := row.Scan(
		&rule.ID, &rule.Name, &rule.Kind, &rule.Metric, &rule.Operator, &rule.Threshold,
		&rule.ForSeconds, &rule.Severity, &rule.CooldownSeconds, &rule.Target,
		&rule.Channel, &enabled, &createdAt, &updatedAt,
	)
	if err != nil {
		return AlertRule{}, err
	}
	rule.Enabled = enabled != 0
	rule.CreatedAt = time.Unix(createdAt, 0)
	rule.UpdatedAt = time.Unix(updatedAt, 0)
	return rule, nil
}

func scanAlertEvent(row rowScanner) (AlertEvent, error) {
	var (
		event      AlertEvent
		startedAt  int64
		updatedAt  int64
		resolvedAt int64
		notifiedAt int64
	)
	err := row.Scan(
		&event.ID, &event.RuleID, &event.Target, &event.Severity, &event.State,
		&event.Value, &event.Message, &startedAt, &updatedAt, &resolvedAt, &notifiedAt,
	)
	if err != nil {
		return AlertEvent{}, err
	}
	event.StartedAt = time.Unix(startedAt, 0)
	event.UpdatedAt = time.Unix(updatedAt, 0)
	if resolvedAt > 0 {
		event.ResolvedAt = time.Unix(resolvedAt, 0)
	}
	if notifiedAt > 0 {
		event.NotifiedAt = time.Unix(notifiedAt, 0)
	}
	return event, nil
}

func unixOrZero(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.Unix()
}
