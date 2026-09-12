package store

import (
	"context"
	"time"
)

// UptimeDay 是某一天的在线率。
type UptimeDay struct {
	Date    string  `json:"date"`
	Ratio   float64 `json:"ratio"`
	Minutes int     `json:"minutes"`
	State   string  `json:"state"`
}

// QueryUptimeDays 用 metric_1m 的分钟桶覆盖数推算每天的在线率。
// 这是近似值：某分钟有任意采样即算在线；真实部署里通常每 10 秒上报一次。
func (s *Store) QueryUptimeDays(ctx context.Context, agentID string, days int) ([]UptimeDay, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	now := time.Now().UTC()
	endDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	startDay := endDay.AddDate(0, 0, -(days - 1))

	rows, err := s.db.QueryContext(ctx, `
SELECT (ts / 86400) * 86400 AS day, COUNT(DISTINCT ts) AS minutes
FROM metric_1m
WHERE agent_id = ? AND metric = ? AND ts >= ?
GROUP BY day
ORDER BY day`, agentID, "uptime", startDay.Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[int64]int)
	for rows.Next() {
		var day int64
		var minutes int
		if err := rows.Scan(&day, &minutes); err != nil {
			return nil, err
		}
		counts[day] = minutes
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]UptimeDay, 0, days)
	for index := 0; index < days; index++ {
		day := startDay.AddDate(0, 0, index)
		expected := 1440.0
		if day.Equal(endDay) {
			expected = float64(now.Hour()*60 + now.Minute())
			if expected < 1 {
				expected = 1
			}
		}
		minutes := counts[day.Unix()]
		ratio := float64(minutes) / expected * 100
		if ratio > 100 {
			ratio = 100
		}

		state := "none"
		switch {
		case minutes == 0:
			state = "none"
		case ratio >= 99:
			state = "ok"
		default:
			state = "partial"
		}

		out = append(out, UptimeDay{
			Date:    day.Format("2006-01-02"),
			Ratio:   ratio,
			Minutes: minutes,
			State:   state,
		})
	}
	return out, nil
}
