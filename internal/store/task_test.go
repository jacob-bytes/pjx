package store

import (
	"context"
	"testing"
	"time"
)

func TestTaskCRUDAndResults(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	task := Task{
		ID: "t1", Name: "主站", Kind: "http", Target: "https://example.com",
		Interval: 60, TimeoutMS: 3000, ScopeType: "all", Enabled: true,
	}
	if err := instance.UpsertTask(ctx, task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}

	loaded, err := instance.GetTask(ctx, "t1")
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if loaded.Name != "主站" || loaded.Enabled == false {
		t.Fatalf("unexpected task: %+v", loaded)
	}

	tasks, err := instance.ListTasks(ctx)
	if err != nil {
		t.Fatalf("list tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	now := time.Now()
	first := TaskResult{RunID: "r1", TaskID: "t1", AgentID: "a1", TS: now, OK: true, LatencyMS: 10}
	inserted, err := instance.InsertTaskResult(ctx, first)
	if err != nil {
		t.Fatalf("insert result: %v", err)
	}
	if inserted == false {
		t.Fatalf("expected first insert to succeed")
	}

	duplicate, err := instance.InsertTaskResult(ctx, first)
	if err != nil {
		t.Fatalf("duplicate insert: %v", err)
	}
	if duplicate {
		t.Fatalf("expected duplicate run_id to be ignored")
	}

	for index := 0; index < 4; index++ {
		result := TaskResult{
			RunID: "r-ok-" + string(rune('a'+index)), TaskID: "t1", AgentID: "a1",
			TS: now.Add(time.Duration(index) * time.Second), OK: true, LatencyMS: float64(20 + index*10),
		}
		if _, err := instance.InsertTaskResult(ctx, result); err != nil {
			t.Fatalf("insert ok result: %v", err)
		}
	}
	failed := TaskResult{RunID: "r-fail", TaskID: "t1", AgentID: "a1", TS: now, OK: false, Message: "timeout"}
	if _, err := instance.InsertTaskResult(ctx, failed); err != nil {
		t.Fatalf("insert fail result: %v", err)
	}

	results, err := instance.ListTaskResults(ctx, "t1", now.Add(-time.Minute), 10)
	if err != nil {
		t.Fatalf("list results: %v", err)
	}
	if len(results) != 6 {
		t.Fatalf("expected 6 results, got %d", len(results))
	}

	stats, err := instance.TaskStats(ctx, "t1", now.Add(-time.Minute))
	if err != nil {
		t.Fatalf("task stats: %v", err)
	}
	if stats.Total != 6 || stats.OK != 5 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
	if stats.SuccessRate < 83 || stats.SuccessRate > 84 {
		t.Fatalf("expected success rate about 83.3, got %v", stats.SuccessRate)
	}
	if stats.P95MS <= 0 {
		t.Fatalf("expected p95 latency, got %v", stats.P95MS)
	}

	if err := instance.DeleteTask(ctx, "t1"); err != nil {
		t.Fatalf("delete task: %v", err)
	}
	if _, err := instance.GetTask(ctx, "t1"); err == nil {
		t.Fatalf("expected task to be deleted")
	}
}
