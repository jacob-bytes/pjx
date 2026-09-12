package store

import (
	"context"
	"testing"
	"time"

	"github.com/jacob-bytes/pjx/internal/metrics"
)

func TestQueryTaskSeries(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	base := int64(1700000000)
	base = base - base%60
	results := []TaskResult{
		{RunID: "r1", TaskID: "t1", AgentID: "a1", TS: time.Unix(base, 0), OK: true, LatencyMS: 10},
		{RunID: "r2", TaskID: "t1", AgentID: "a1", TS: time.Unix(base+10, 0), OK: true, LatencyMS: 20},
		{RunID: "r3", TaskID: "t1", AgentID: "a1", TS: time.Unix(base+20, 0), OK: true, LatencyMS: 30},
		{RunID: "r4", TaskID: "t1", AgentID: "a1", TS: time.Unix(base+30, 0), OK: true, LatencyMS: 40},
		{RunID: "r5", TaskID: "t1", AgentID: "a1", TS: time.Unix(base+40, 0), OK: false, Message: "timeout"},
	}
	for _, result := range results {
		if _, err := instance.InsertTaskResult(ctx, result); err != nil {
			t.Fatalf("insert result: %v", err)
		}
	}

	latency, err := instance.QueryTaskSeries(ctx, "t1", "a1", "latency", base, base+60, 20)
	if err != nil {
		t.Fatalf("query latency: %v", err)
	}
	if len(latency) != 2 {
		t.Fatalf("expected 2 latency buckets, got %d", len(latency))
	}
	if latency[0].Avg != 15 || latency[1].Avg != 35 {
		t.Fatalf("unexpected latency buckets: %+v", latency)
	}

	loss, err := instance.QueryTaskSeries(ctx, "t1", "a1", "loss", base, base+60, 20)
	if err != nil {
		t.Fatalf("query loss: %v", err)
	}
	if len(loss) != 3 {
		t.Fatalf("expected 3 loss buckets, got %d", len(loss))
	}
	if loss[2].Avg != 100 {
		t.Fatalf("expected last loss bucket 100%%, got %v", loss[2].Avg)
	}

	if _, err := instance.QueryTaskSeries(ctx, "t1", "a1", "nope", base, base+60, 20); err == nil {
		t.Fatalf("expected unsupported metric to error")
	}
}

func TestQueryUptimeDays(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	yesterday := today.AddDate(0, 0, -1)

	insert := func(day time.Time, count int) {
		values := map[string]metrics.Aggregate{
			metrics.KeyUptime: {Sum: 1, Min: 1, Max: 1, Count: 1},
		}
		for index := 0; index < count; index++ {
			ts := day.Unix() + int64(index*60)
			if err := instance.UpsertMetrics(ctx, "a1", ts, values); err != nil {
				t.Fatalf("upsert uptime: %v", err)
			}
		}
	}
	insert(yesterday, 720)
	insert(today, 60)

	days, err := instance.QueryUptimeDays(ctx, "a1", 2)
	if err != nil {
		t.Fatalf("query uptime: %v", err)
	}
	if len(days) != 2 {
		t.Fatalf("expected 2 days, got %d", len(days))
	}
	if days[0].Minutes != 720 || days[0].State != "partial" {
		t.Fatalf("unexpected yesterday uptime: %+v", days[0])
	}
	if days[1].Minutes != 60 {
		t.Fatalf("expected 60 minutes today, got %d", days[1].Minutes)
	}
}
