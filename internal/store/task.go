package store

import (
	"context"
	"database/sql"
	"sort"
	"time"
)

// Task 是探活任务定义。
type Task struct {
	ID         string
	Name       string
	Kind       string
	Target     string
	Interval   int64
	TimeoutMS  int64
	Retries    int64
	ScopeType  string
	ScopeValue string
	OnOffline  string
	Enabled    bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// TaskResult 是一次探活执行结果。
type TaskResult struct {
	RunID     string
	TaskID    string
	AgentID   string
	TS        time.Time
	OK        bool
	LatencyMS float64
	Message   string
}

// TaskStats 是任务在时间窗内的汇总。
type TaskStats struct {
	Total       int64
	OK          int64
	SuccessRate float64
	AvgMS       float64
	MaxMS       float64
	P95MS       float64
	LastTS      int64
}

// UpsertTask 新增或更新任务。
func (s *Store) UpsertTask(ctx context.Context, task Task) error {
	now := time.Now().Unix()
	if task.CreatedAt.IsZero() {
		task.CreatedAt = time.Now()
	}
	if task.Interval <= 0 {
		task.Interval = 60
	}
	if task.TimeoutMS <= 0 {
		task.TimeoutMS = 5000
	}
	if task.ScopeType == "" {
		task.ScopeType = "all"
	}
	if task.OnOffline == "" {
		task.OnOffline = "skip"
	}

	_, err := s.db.ExecContext(ctx, `
INSERT INTO tasks (
id, name, kind, target, interval, timeout_ms, retries,
scope_type, scope_value, on_offline, enabled, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
name = excluded.name,
kind = excluded.kind,
target = excluded.target,
interval = excluded.interval,
timeout_ms = excluded.timeout_ms,
retries = excluded.retries,
scope_type = excluded.scope_type,
scope_value = excluded.scope_value,
on_offline = excluded.on_offline,
enabled = excluded.enabled,
updated_at = excluded.updated_at`,
		task.ID, task.Name, task.Kind, task.Target, task.Interval, task.TimeoutMS, task.Retries,
		task.ScopeType, task.ScopeValue, task.OnOffline, boolInt(task.Enabled),
		task.CreatedAt.Unix(), now)
	return err
}

// GetTask 按 id 取任务。
func (s *Store) GetTask(ctx context.Context, id string) (Task, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT id, name, kind, target, interval, timeout_ms, retries,
       scope_type, scope_value, on_offline, enabled, created_at, updated_at
FROM tasks WHERE id = ?`, id)
	return scanTask(row)
}

// ListTasks 返回全部任务。
func (s *Store) ListTasks(ctx context.Context) ([]Task, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, name, kind, target, interval, timeout_ms, retries,
       scope_type, scope_value, on_offline, enabled, created_at, updated_at
FROM tasks ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

// DeleteTask 删除任务及其历史结果。
func (s *Store) DeleteTask(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM task_results WHERE task_id = ?`, id); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM tasks WHERE id = ?`, id)
	return err
}

// InsertTaskResult 写入结果，run_id 冲突时忽略（去重）。返回是否真正插入。
func (s *Store) InsertTaskResult(ctx context.Context, result TaskResult) (bool, error) {
	execResult, err := s.db.ExecContext(ctx, `
INSERT INTO task_results (run_id, task_id, agent_id, ts, ok, latency_ms, message)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(run_id) DO NOTHING`,
		result.RunID, result.TaskID, result.AgentID, result.TS.Unix(),
		boolInt(result.OK), result.LatencyMS, result.Message)
	if err != nil {
		return false, err
	}
	affected, err := execResult.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

// ListTaskResults 返回某个任务在 since 之后的结果，按时间倒序。
func (s *Store) ListTaskResults(ctx context.Context, taskID string, since time.Time, limit int) ([]TaskResult, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.QueryContext(ctx, `
SELECT run_id, task_id, agent_id, ts, ok, latency_ms, message
FROM task_results
WHERE task_id = ? AND ts >= ?
ORDER BY ts DESC
LIMIT ?`, taskID, since.Unix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TaskResult
	for rows.Next() {
		var (
			item TaskResult
			ok   int
			ts   int64
		)
		if err := rows.Scan(&item.RunID, &item.TaskID, &item.AgentID, &ts, &ok, &item.LatencyMS, &item.Message); err != nil {
			return nil, err
		}
		item.TS = time.Unix(ts, 0)
		item.OK = ok != 0
		results = append(results, item)
	}
	return results, rows.Err()
}

// TaskStats 汇总任务在 since 之后的表现。p95 取最近 1000 次成功样本近似。
func (s *Store) TaskStats(ctx context.Context, taskID string, since time.Time) (TaskStats, error) {
	var stats TaskStats
	err := s.db.QueryRowContext(ctx, `
SELECT
COUNT(*),
COALESCE(SUM(ok), 0),
COALESCE(AVG(CASE WHEN ok = 1 THEN latency_ms END), 0),
COALESCE(MAX(latency_ms), 0),
COALESCE(MAX(ts), 0)
FROM task_results
WHERE task_id = ? AND ts >= ?`, taskID, since.Unix()).
		Scan(&stats.Total, &stats.OK, &stats.AvgMS, &stats.MaxMS, &stats.LastTS)
	if err != nil {
		return stats, err
	}
	if stats.Total > 0 {
		stats.SuccessRate = float64(stats.OK) / float64(stats.Total) * 100
	}

	rows, err := s.db.QueryContext(ctx, `
SELECT latency_ms FROM task_results
WHERE task_id = ? AND ts >= ? AND ok = 1
ORDER BY ts DESC LIMIT 1000`, taskID, since.Unix())
	if err != nil {
		return stats, err
	}
	defer rows.Close()

	var values []float64
	for rows.Next() {
		var value float64
		if err := rows.Scan(&value); err != nil {
			return stats, err
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return stats, err
	}
	if len(values) > 0 {
		sort.Float64s(values)
		index := int(float64(len(values)-1) * 0.95)
		stats.P95MS = values[index]
	}
	return stats, nil
}

// DeleteTaskResultsBefore 删除 cutoff 之前的结果。
func (s *Store) DeleteTaskResultsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM task_results WHERE ts < ?`, cutoff.Unix())
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(row rowScanner) (Task, error) {
	var (
		task      Task
		enabled   int
		createdAt int64
		updatedAt int64
	)
	err := row.Scan(
		&task.ID, &task.Name, &task.Kind, &task.Target,
		&task.Interval, &task.TimeoutMS, &task.Retries,
		&task.ScopeType, &task.ScopeValue, &task.OnOffline,
		&enabled, &createdAt, &updatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return Task{}, err
		}
		return Task{}, err
	}
	task.Enabled = enabled != 0
	task.CreatedAt = time.Unix(createdAt, 0)
	task.UpdatedAt = time.Unix(updatedAt, 0)
	return task, nil
}
