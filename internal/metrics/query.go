package metrics

import (
	"sort"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Tier 是查询命中的数据层。
type Tier string

// 三层：内存 1s、1m、1h。
const TierMemory Tier = "memory"
const Tier1m Tier = "metric_1m"
const Tier1h Tier = "metric_1h"

// ChooseTier 按数据年龄挑层：越近的越细，越远的越粗。
func ChooseTier(now time.Time, from time.Time, memoryKeep, oneMinKeep time.Duration) Tier {
	age := now.Sub(from)
	if memoryKeep > 0 && age <= memoryKeep {
		return TierMemory
	}
	if oneMinKeep > 0 && age <= oneMinKeep {
		return Tier1m
	}
	return Tier1h
}

// StepSeconds 算降采样步长：保证点数不超过 maxPoints，且不低于该层最小粒度。
func StepSeconds(from, to int64, maxPoints int, floor int64) int64 {
	if maxPoints < 2 {
		maxPoints = 2
	}
	span := to - from
	if span <= 0 {
		return floor
	}
	step := (span + int64(maxPoints) - 1) / int64(maxPoints)
	if step < floor {
		step = floor
	}
	return step
}

// Extract 从采样里取一个指标值，避免为每个样本构造 map。
func Extract(sample protocol.Sample, metric string) (float64, bool) {
	switch metric {
	case KeyCPU:
		return sample.CPU, true
	case KeyLoad:
		return sample.Load, true
	case KeyMemUsed:
		return float64(sample.MemUsed), true
	case KeyMemTotal:
		return float64(sample.MemTotal), true
	case KeySwapUsed:
		return float64(sample.SwapUsed), true
	case KeySwapTotal:
		return float64(sample.SwapTotal), true
	case KeyDiskUsed:
		return float64(sample.DiskUsed), true
	case KeyDiskTotal:
		return float64(sample.DiskTotal), true
	case KeyNetRx:
		return float64(sample.NetRx), true
	case KeyNetTx:
		return float64(sample.NetTx), true
	case KeyTCP:
		return float64(sample.TCP), true
	case KeyUDP:
		return float64(sample.UDP), true
	case KeyProc:
		return float64(sample.Proc), true
	case KeyUptime:
		return float64(sample.Uptime), true
	default:
		return 0, false
	}
}

// DownsampleMemory 把内存层的 1s 样本按 step 聚合成点。
func DownsampleMemory(samples []protocol.Sample, metric string, from, to int64, maxPoints int) []Point {
	if len(samples) == 0 {
		return nil
	}
	step := StepSeconds(from, to, maxPoints, 1)
	buckets := make(map[int64]*Aggregate, maxPoints)
	for _, sample := range samples {
		if sample.TS < from || sample.TS >= to {
			continue
		}
		value, ok := Extract(sample, metric)
		if ok == false {
			continue
		}
		bucketTS := sample.TS - sample.TS%step
		agg, exists := buckets[bucketTS]
		if exists == false {
			agg = &Aggregate{}
			buckets[bucketTS] = agg
		}
		agg.Add(value)
	}

	order := make([]int64, 0, len(buckets))
	for ts := range buckets {
		order = append(order, ts)
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })

	out := make([]Point, 0, len(order))
	for _, ts := range order {
		agg := buckets[ts]
		out = append(out, Point{
			TS:  ts,
			Avg: agg.Avg(),
			Min: agg.Min,
			Max: agg.Max,
		})
	}
	return out
}
