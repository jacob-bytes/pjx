package scheduler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
	"github.com/jacob-bytes/pjx/internal/store"
)

type fakeStore struct {
	mu      sync.Mutex
	tasks   []store.Task
	agents  []store.Agent
	results []store.TaskResult
}

func (f *fakeStore) ListTasks(ctx context.Context) ([]store.Task, error) {
	return f.tasks, nil
}

func (f *fakeStore) ListAgents(ctx context.Context) ([]store.Agent, error) {
	return f.agents, nil
}

func (f *fakeStore) InsertTaskResult(ctx context.Context, result store.TaskResult) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.results = append(f.results, result)
	return true, nil
}

func (f *fakeStore) DeleteTaskResultsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	return 0, nil
}

func (f *fakeStore) snapshot() []store.TaskResult {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]store.TaskResult, len(f.results))
	copy(out, f.results)
	return out
}

type fakeDispatcher struct {
	mu     sync.Mutex
	online map[string]bool
	calls  []protocol.TaskSpec
}

func (f *fakeDispatcher) Dispatch(ctx context.Context, agentID string, spec protocol.TaskSpec) (protocol.TaskResultParams, error) {
	f.mu.Lock()
	f.calls = append(f.calls, spec)
	f.mu.Unlock()
	return protocol.TaskResultParams{RunID: spec.RunID, OK: true, LatencyMS: 12.5}, nil
}

func (f *fakeDispatcher) Online(agentID string) bool {
	return f.online[agentID]
}

func (f *fakeDispatcher) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func waitResults(t *testing.T, db *fakeStore, want int) []store.TaskResult {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		results := db.snapshot()
		if len(results) >= want {
			return results
		}
		time.Sleep(5 * time.Millisecond)
	}
	return db.snapshot()
}

func TestRunDueDispatchesToTagTargets(t *testing.T) {
	db := &fakeStore{
		tasks: []store.Task{{
			ID: "t1", Name: "主站", Kind: "http", Target: "https://example.com",
			Interval: 60, TimeoutMS: 1000, ScopeType: "tag", ScopeValue: "prod", Enabled: true,
		}},
		agents: []store.Agent{
			{ID: "a1", Tags: []string{"prod"}},
			{ID: "a2", Tags: []string{"dev"}},
		},
	}
	dispatcher := &fakeDispatcher{online: map[string]bool{"a1": true, "a2": true}}
	schedule := New(db, dispatcher, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{Tick: time.Hour})

	if err := schedule.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}
	schedule.runDue(context.Background())

	results := waitResults(t, db, 1)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].AgentID != "a1" {
		t.Fatalf("expected agent a1, got %s", results[0].AgentID)
	}
	if results[0].OK == false {
		t.Fatalf("expected success result")
	}
	if dispatcher.callCount() != 1 {
		t.Fatalf("expected 1 dispatch call, got %d", dispatcher.callCount())
	}
}

func TestOfflineAgentsAreSkipped(t *testing.T) {
	db := &fakeStore{
		tasks: []store.Task{{
			ID: "t1", Name: "主站", Kind: "http", Target: "https://example.com",
			Interval: 60, TimeoutMS: 1000, ScopeType: "all", Enabled: true,
		}},
		agents: []store.Agent{{ID: "a1"}},
	}
	dispatcher := &fakeDispatcher{online: map[string]bool{"a1": false}}
	schedule := New(db, dispatcher, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{Tick: time.Hour})

	if err := schedule.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}
	schedule.runDue(context.Background())
	time.Sleep(50 * time.Millisecond)

	if len(db.snapshot()) != 0 {
		t.Fatalf("expected no results for offline agent")
	}
	if dispatcher.callCount() != 0 {
		t.Fatalf("expected no dispatch calls")
	}
}

func TestRetryProducesFailureWithMessage(t *testing.T) {
	db := &fakeStore{
		tasks: []store.Task{{
			ID: "t1", Name: "主站", Kind: "http", Target: "https://example.com",
			Interval: 60, TimeoutMS: 100, Retries: 1, ScopeType: "all", Enabled: true,
		}},
		agents: []store.Agent{{ID: "a1"}},
	}
	dispatcher := &failingDispatcher{}
	schedule := New(db, dispatcher, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{Tick: time.Hour})

	if err := schedule.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}
	schedule.runDue(context.Background())

	results := waitResults(t, db, 1)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].OK {
		t.Fatalf("expected failure result")
	}
	if results[0].Message == "" {
		t.Fatalf("expected failure message")
	}
}

type failingDispatcher struct{}

func (f *failingDispatcher) Dispatch(ctx context.Context, agentID string, spec protocol.TaskSpec) (protocol.TaskResultParams, error) {
	return protocol.TaskResultParams{}, errors.New("probe timeout")
}

func (f *failingDispatcher) Online(agentID string) bool {
	return true
}

func TestRunTaskNowDispatchesOnlineTargets(t *testing.T) {
	db := &fakeStore{
		tasks: []store.Task{{
			ID: "t1", Name: "立即执行", Kind: "http", Target: "https://example.com",
			Interval: 60, TimeoutMS: 1000, ScopeType: "all", Enabled: true,
		}},
		agents: []store.Agent{{ID: "a1"}, {ID: "a2"}},
	}
	dispatcher := &fakeDispatcher{online: map[string]bool{"a1": true, "a2": false}}
	schedule := New(db, dispatcher, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{Tick: time.Hour})

	if err := schedule.Reload(context.Background()); err != nil {
		t.Fatalf("reload: %v", err)
	}
	dispatched, err := schedule.RunTaskNow(context.Background(), "t1")
	if err != nil {
		t.Fatalf("run now: %v", err)
	}
	if dispatched != 1 {
		t.Fatalf("expected 1 dispatched agent, got %d", dispatched)
	}

	results := waitResults(t, db, 1)
	if len(results) != 1 || results[0].AgentID != "a1" {
		t.Fatalf("unexpected results: %+v", results)
	}

	if _, err := schedule.RunTaskNow(context.Background(), "missing"); err == nil {
		t.Fatalf("expected missing task to error")
	}
}
