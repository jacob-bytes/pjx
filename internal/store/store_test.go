package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/jacob-bytes/pjx/internal/metrics"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	instance, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = instance.Close()
	})
	return instance
}

func TestUpsertAndQuerySeries(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	base := int64(1700000000)
	base = base - base%60

	values := map[string]metrics.Aggregate{
		metrics.KeyCPU: {Sum: 30, Min: 10, Max: 20, Count: 2},
	}
	for index := int64(0); index < 5; index++ {
		if err := instance.UpsertMetrics(ctx, "node-1", base+index*60, values); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	points, err := instance.QuerySeries(ctx, "metric_1m", "node-1", metrics.KeyCPU, base, base+300, 60)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(points) != 5 {
		t.Fatalf("expected 5 points, got %d", len(points))
	}
	if points[0].Avg != 15 {
		t.Fatalf("expected avg 15, got %v", points[0].Avg)
	}
	if points[0].Min != 10 || points[0].Max != 20 {
		t.Fatalf("expected min/max 10/20, got %v/%v", points[0].Min, points[0].Max)
	}

	downsampled, err := instance.QuerySeries(ctx, "metric_1m", "node-1", metrics.KeyCPU, base, base+300, 150)
	if err != nil {
		t.Fatalf("downsample query: %v", err)
	}
	if len(downsampled) != 2 {
		t.Fatalf("expected 2 downsampled points, got %d", len(downsampled))
	}
}

func TestAggregateHourAndDelete(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	hourStart := int64(1700000000)
	hourStart = hourStart - hourStart%3600

	values := map[string]metrics.Aggregate{
		metrics.KeyCPU: {Sum: 20, Min: 10, Max: 10, Count: 2},
	}
	for index := int64(0); index < 3; index++ {
		if err := instance.UpsertMetrics(ctx, "node-1", hourStart+index*60, values); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	if err := instance.AggregateHour(ctx, hourStart, hourStart+3600); err != nil {
		t.Fatalf("aggregate hour: %v", err)
	}

	points, err := instance.QuerySeries(ctx, "metric_1h", "node-1", metrics.KeyCPU, hourStart, hourStart+3600, 3600)
	if err != nil {
		t.Fatalf("query hour: %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("expected 1 hour point, got %d", len(points))
	}
	if points[0].Avg != 10 {
		t.Fatalf("expected weighted avg 10, got %v", points[0].Avg)
	}

	deleted, err := instance.DeleteMetricsBefore(ctx, "metric_1m", hourStart+200, 5000)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if deleted != 3 {
		t.Fatalf("expected 3 deleted rows, got %d", deleted)
	}

	if _, err := instance.QuerySeries(ctx, "bad table", "node-1", metrics.KeyCPU, 0, 60, 60); err == nil {
		t.Fatalf("expected error for unknown table")
	}
}
