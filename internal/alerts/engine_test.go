package alerts

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jacob-bytes/pjx/internal/notify"
	"github.com/jacob-bytes/pjx/internal/protocol"
	"github.com/jacob-bytes/pjx/internal/store"
)

type fakeStore struct {
	mu     sync.Mutex
	rules  []store.AlertRule
	events map[string]store.AlertEvent
	agents []store.Agent
}

func newFakeStore() *fakeStore {
	return &fakeStore{events: make(map[string]store.AlertEvent)}
}

func (f *fakeStore) ListAlertRules(ctx context.Context) ([]store.AlertRule, error) {
	return f.rules, nil
}

func (f *fakeStore) UpsertAlertEvent(ctx context.Context, event store.AlertEvent) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events[event.ID] = event
	return nil
}

func (f *fakeStore) ListAlertEvents(ctx context.Context, state string, limit int) ([]store.AlertEvent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []store.AlertEvent
	for _, event := range f.events {
		if state == "" || event.State == state {
			out = append(out, event)
		}
	}
	return out, nil
}

func (f *fakeStore) ListAgents(ctx context.Context) ([]store.Agent, error) {
	return f.agents, nil
}

func (f *fakeStore) DeleteAlertEventsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	return 0, nil
}

func (f *fakeStore) event(id string) (store.AlertEvent, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	event, ok := f.events[id]
	return event, ok
}

type fakeNotifier struct {
	mu       sync.Mutex
	messages []notify.Message
}

func (f *fakeNotifier) Send(ctx context.Context, message notify.Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.messages = append(f.messages, message)
	return nil
}

func (f *fakeNotifier) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.messages)
}

type clock struct {
	now time.Time
}

func (c *clock) advance(d time.Duration) {
	c.now = c.now.Add(d)
}

func newEngine(t *testing.T, db *fakeStore, notifier *fakeNotifier, c *clock) *Engine {
	t.Helper()
	return New(db, notifier, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{
		Tick: time.Hour,
		Now:  func() time.Time { return c.now },
	})
}

func TestMetricRuleFiresAndResolves(t *testing.T) {
	db := newFakeStore()
	notifier := &fakeNotifier{}
	c := &clock{now: time.Unix(1700000000, 0)}
	db.rules = []store.AlertRule{{
		ID: "r1", Name: "CPU 高", Kind: "metric", Metric: "cpu",
		Operator: "gt", Threshold: 80, ForSeconds: 10, Severity: "warn",
		CooldownSeconds: 600, Enabled: true,
	}}

	engine := newEngine(t, db, notifier, c)
	if err := engine.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}

	engine.ObserveMetric("a1", protocol.Sample{CPU: 90})
	if notifier.count() != 0 {
		t.Fatalf("expected no notify before for duration")
	}

	c.advance(11 * time.Second)
	engine.ObserveMetric("a1", protocol.Sample{CPU: 95})

	if notifier.count() != 1 {
		t.Fatalf("expected 1 firing notify, got %d", notifier.count())
	}
	event, ok := db.event("r1|a1")
	if ok == false {
		t.Fatalf("expected firing event stored")
	}
	if event.State != "firing" {
		t.Fatalf("expected firing state, got %s", event.State)
	}

	engine.ObserveMetric("a1", protocol.Sample{CPU: 10})
	if notifier.count() != 2 {
		t.Fatalf("expected resolved notify, got %d", notifier.count())
	}
	event, _ = db.event("r1|a1")
	if event.State != "resolved" {
		t.Fatalf("expected resolved state, got %s", event.State)
	}
}

func TestProbeRuleCountsConsecutiveFailures(t *testing.T) {
	db := newFakeStore()
	notifier := &fakeNotifier{}
	c := &clock{now: time.Unix(1700000000, 0)}
	db.rules = []store.AlertRule{{
		ID: "p1", Name: "探测失败", Kind: "probe", Operator: "gt",
		Threshold: 2, ForSeconds: 0, Severity: "crit", CooldownSeconds: 600, Enabled: true,
	}}

	engine := newEngine(t, db, notifier, c)
	if err := engine.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}

	failed := store.TaskResult{TaskID: "t1", AgentID: "a1", OK: false}
	engine.ObserveProbe(failed)
	if notifier.count() != 0 {
		t.Fatalf("expected no notify after 1 failure")
	}
	engine.ObserveProbe(failed)
	if notifier.count() != 1 {
		t.Fatalf("expected firing notify after 2 failures, got %d", notifier.count())
	}

	engine.ObserveProbe(store.TaskResult{TaskID: "t1", AgentID: "a1", OK: true})
	if notifier.count() != 2 {
		t.Fatalf("expected resolved notify after success, got %d", notifier.count())
	}
}

func TestOfflineRuleFires(t *testing.T) {
	db := newFakeStore()
	notifier := &fakeNotifier{}
	c := &clock{now: time.Unix(1700000000, 0)}
	db.rules = []store.AlertRule{{
		ID: "o1", Name: "节点离线", Kind: "offline",
		ForSeconds: 60, Severity: "crit", CooldownSeconds: 600, Enabled: true,
	}}
	db.agents = []store.Agent{{ID: "a1", LastSeenAt: c.now.Add(-120 * time.Second)}}

	engine := newEngine(t, db, notifier, c)
	if err := engine.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}
	engine.checkOffline(context.Background())

	if notifier.count() != 1 {
		t.Fatalf("expected offline notify, got %d", notifier.count())
	}
	event, ok := db.event("o1|a1")
	if ok == false || event.State != "firing" {
		t.Fatalf("expected firing offline event")
	}
}
