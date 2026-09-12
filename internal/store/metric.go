package store

import "context"
import "fmt"

import "github.com/jacob-bytes/pjx/internal/metrics"

// metricTables 是允许被删除的指标表，避免表名拼接引入注入。
var metricTables = map[string]bool{
	"metric_1m": true,
	"metric_1h": true,
}

func checkMetricTable(table string) error {
	if metricTables[table] == false {
		return fmt.Errorf("unknown metric table: %s", table)
	}
	return nil
}

// UpsertMetrics 写入一个分钟桶的全部指标，重复写入按最新值覆盖（幂等）。
func (s *Store) UpsertMetrics(ctx context.Context, agentID string, bucket int64, values map[string]metrics.Aggregate) error {
	if len(values) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	statement, err := tx.PrepareContext(ctx, `
INSERT INTO metric_1m (agent_id, metric, ts, avg, min, max, count)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_id, metric, ts) DO UPDATE SET
avg = excluded.avg,
min = excluded.min,
max = excluded.max,
count = excluded.count`)
	if err != nil {
		return err
	}
	defer statement.Close()

	for metric, agg := range values {
		if _, err := statement.ExecContext(ctx, agentID, metric, bucket, agg.Avg(), agg.Min, agg.Max, agg.Count); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AggregateHour 把 metric_1m 聚合成 metric_1h。
// 平均值按 count 加权，避免某些分钟缺样本时被拉偏。
func (s *Store) AggregateHour(ctx context.Context, hourStart, hourEnd int64) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO metric_1h (agent_id, metric, ts, avg, min, max, count)
SELECT
agent_id,
metric,
?,
SUM(avg * count) / SUM(count),
MIN(min),
MAX(max),
SUM(count)
FROM metric_1m
WHERE ts >= ? AND ts < ?
GROUP BY agent_id, metric
ON CONFLICT(agent_id, metric, ts) DO UPDATE SET
avg = excluded.avg,
min = excluded.min,
max = excluded.max,
count = excluded.count`,
		hourStart, hourStart, hourEnd)
	return err
}

// QuerySeries 从指定层查询一个指标并按 step 降采样。
// step 小于该层粒度时由调用方保证不小于粒度（1m 用 60，1h 用 3600）。
func (s *Store) QuerySeries(
	ctx context.Context,
	table string,
	agentID string,
	metric string,
	from int64,
	to int64,
	step int64,
) ([]metrics.Point, error) {
	if err := checkMetricTable(table); err != nil {
		return nil, err
	}
	if step < 1 {
		step = 1
	}

	query := `
SELECT (ts / ?) * ? AS bucket,
       SUM(avg * count) / SUM(count),
       MIN(min),
       MAX(max)
FROM ` + table + `
WHERE agent_id = ? AND metric = ? AND ts >= ? AND ts < ?
GROUP BY bucket
ORDER BY bucket`

	rows, err := s.db.QueryContext(ctx, query, step, step, agentID, metric, from, to)
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

// DeleteMetricsBefore 分批删除 cutoff 之前的数据。
func (s *Store) DeleteMetricsBefore(ctx context.Context, table string, cutoff int64, batch int) (int64, error) {
	if err := checkMetricTable(table); err != nil {
		return 0, err
	}
	if batch <= 0 {
		batch = 5000
	}

	statement := `DELETE FROM ` + table + `
WHERE rowid IN (
SELECT rowid FROM ` + table + ` WHERE ts < ? LIMIT ?
)`
	result, err := s.db.ExecContext(ctx, statement, cutoff, batch)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// Optimize 回收增量 vacuum 的空闲页，并刷新查询统计。
func (s *Store) Optimize(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, "PRAGMA incremental_vacuum"); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, "PRAGMA optimize")
	return err
}
