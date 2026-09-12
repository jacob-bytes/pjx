package store

import (
	"context"
	"fmt"

	"github.com/jacob-bytes/pjx/internal/metrics"
)

// QueryTaskSeries 聚合某个 task + agent 的探活历史。
// metric 支持 latency（只统计成功样本的延迟）与 loss（失败占比 %）。
func (s *Store) QueryTaskSeries(
	ctx context.Context,
	taskID string,
	agentID string,
	metric string,
	from int64,
	to int64,
	step int64,
) ([]metrics.Point, error) {
	if step < 1 {
		step = 1
	}

	var query string
	switch metric {
	case "latency":
		query = `
SELECT (ts / ?) * ? AS bucket,
       AVG(latency_ms),
       MIN(latency_ms),
       MAX(latency_ms)
FROM task_results
WHERE task_id = ? AND agent_id = ? AND ts >= ? AND ts < ? AND ok = 1
GROUP BY bucket
ORDER BY bucket`
	case "loss":
		query = `
SELECT (ts / ?) * ? AS bucket,
       SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
       0,
       0
FROM task_results
WHERE task_id = ? AND agent_id = ? AND ts >= ? AND ts < ?
GROUP BY bucket
ORDER BY bucket`
	default:
		return nil, fmt.Errorf("unsupported probe metric: %s", metric)
	}

	rows, err := s.db.QueryContext(ctx, query, step, step, taskID, agentID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []metrics.Point
	for rows.Next() {
		var point metrics.Point
		if err := rows.Scan(&point.TS, &point.Avg, &point.Min, &point.Max); err != nil {
			return nil, err
		}
		points = append(points, point)
	}
	return points, rows.Err()
}
