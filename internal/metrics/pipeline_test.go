package metrics

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

type fakeStore struct {
	mu      sync.Mutex
	upserts map[string]map[int64]map[string]Aggregate
	hours   int
	deletes int
}

func newFakeStore() *fakeStore {
	return &fakeStore{upserts: make(map[string]map[int64]map[string]Aggregate)}
}

func (f *fakeStore) UpsertMetrics(ctx context.Context, agentID string, bucket int64, values map[string]Aggregate) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	agent, ok := f.upserts[agentID]
	if ok == false {
		agent = make(map[int64]map[string]Aggregate)
		f.upserts[agentID] = agent
	}
	bucketValues := make(map[string]Aggregate, len(values))
	for key, value := range values {
		bucketValues[key] = value
	}
	agent[bucket] = bucketValues
	return nil
}

func (f *fakeStore) AggregateHour(ctx context.Context, hourStart, hourEnd int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.hours++
	return nil
}

func (f *fakeStore) DeleteMetricsBefore(ctx context.Context, table string, cutoff int64, batch int) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deletes++
	return 0, nil
}

func (f *fakeStore) SetSetting(ctx context.Context, key, value string) error {
	return nil
}

func TestPipelineFlushesMinuteBuckets(t *testing.T) {
	store := newFakeStore()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pipeline := NewPipeline(store, logger, Options{
		MemoryPoints: 600,
		FlushEvery:   time.Hour,
		CleanupEvery: time.Hour,
	})

	base := int64(1700000000)
	for index := 0; index < 125; index++ {
		sample := protocol.Sample{TS: base + int64(index), CPU: float64(index)}
		pipeline.Observe(context.Background(), "node-1", sample)
	}

	pipeline.FlushAll(context.Background())

	agent := store.upserts["node-1"]
	if len(agent) < 3 {
		t.Fatalf("expected at least 3 stored buckets, got %d", len(agent))
	}

	bucket := base - base%60
	values, ok := agent[bucket]
	if ok == false {
		t.Fatalf("bucket %d not found", bucket)
	}
	cpu, exists := values[KeyCPU]
	if exists == false {
		t.Fatalf("cpu aggregate missing")
	}
	if cpu.Count == 0 {
		t.Fatalf("cpu aggregate count is zero")
	}
	if cpu.Max < cpu.Avg() || cpu.Min > cpu.Avg() {
		t.Fatalf("aggregate order broken: %+v", cpu)
	}
}

func TestRingWrapsAndRanges(t *testing.T) {
	ring := NewRing(60)
	for index := 0; index < 75; index++ {
		ring.Add(protocol.Sample{TS: int64(index)})
	}
	if ring.Len() != 60 {
		t.Fatalf("expected ring length 60, got %d", ring.Len())
	}
	samples := ring.Range(70)
	if len(samples) != 5 {
		t.Fatalf("expected 5 samples after ts=70, got %d", len(samples))
	}
	if samples[0].TS != 70 {
		t.Fatalf("expected first sample ts=70, got %d", samples[0].TS)
	}
}

func TestChooseTierAndStep(t *testing.T) {
	now := time.Unix(1700000000, 0)
	if tier := ChooseTier(now, now.Add(-10*time.Minute), time.Hour, 14*24*time.Hour); tier != TierMemory {
		t.Fatalf("expected memory tier, got %s", tier)
	}
	if tier := ChooseTier(now, now.Add(-48*time.Hour), time.Hour, 14*24*time.Hour); tier != Tier1m {
		t.Fatalf("expected 1m tier, got %s", tier)
	}
	if tier := ChooseTier(now, now.Add(-60*24*time.Hour), time.Hour, 14*24*time.Hour); tier != Tier1h {
		t.Fatalf("expected 1h tier, got %s", tier)
	}
	if step := StepSeconds(0, 3600, 60, 60); step != 60 {
		t.Fatalf("expected step 60, got %d", step)
	}
}
