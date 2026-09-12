package metrics

import (
	"testing"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

func TestToRate(t *testing.T) {
	points := []Point{
		{TS: 0, Avg: 0},
		{TS: 1, Avg: 1024 * 1024},
		{TS: 2, Avg: 3 * 1024 * 1024},
	}
	rates := ToRate(points)
	if len(rates) != 2 {
		t.Fatalf("expected 2 rate points, got %d", len(rates))
	}
	if rates[0].Avg < 0.99 || rates[0].Avg > 1.01 {
		t.Fatalf("expected 1 MB/s, got %v", rates[0].Avg)
	}
	if rates[1].Avg < 1.99 || rates[1].Avg > 2.01 {
		t.Fatalf("expected 2 MB/s, got %v", rates[1].Avg)
	}
}

func TestPercentPoints(t *testing.T) {
	used := []Point{{TS: 60, Avg: 512, Min: 500, Max: 520}}
	total := []Point{{TS: 60, Avg: 1024, Min: 1024, Max: 1024}}
	out := PercentPoints(used, total)
	if len(out) != 1 {
		t.Fatalf("expected 1 point, got %d", len(out))
	}
	if out[0].Avg < 49.9 || out[0].Avg > 50.1 {
		t.Fatalf("expected 50%%, got %v", out[0].Avg)
	}
}

func TestRateAndPercentValues(t *testing.T) {
	samples := []protocol.Sample{
		{TS: 0, NetRx: 0, MemUsed: 256, MemTotal: 1024},
		{TS: 1, NetRx: 1024 * 1024, MemUsed: 512, MemTotal: 1024},
	}

	rates := RateValues(samples, KeyNetRx)
	if len(rates) != 1 || rates[0].Value < 0.99 {
		t.Fatalf("expected 1 MB/s rate, got %+v", rates)
	}

	percents := PercentValues(samples, "mem")
	if len(percents) != 2 {
		t.Fatalf("expected 2 percent points, got %d", len(percents))
	}
	if percents[1].Value != 50 {
		t.Fatalf("expected 50%%, got %v", percents[1].Value)
	}
}

func TestKnownAndDownsampleValues(t *testing.T) {
	if Known("cpu") == false {
		t.Fatalf("expected cpu to be known")
	}
	if Known("not-a-metric") {
		t.Fatalf("expected unknown metric to be rejected")
	}

	values := []ValuePoint{{TS: 0, Value: 1}, {TS: 1, Value: 3}, {TS: 2, Value: 2}}
	points := DownsampleValues(values, 0, 3, 2)
	if len(points) > 2 {
		t.Fatalf("expected at most 2 points, got %d", len(points))
	}
	if points[0].Avg != 2 {
		t.Fatalf("expected first bucket avg 2, got %v", points[0].Avg)
	}
}
