package metrics

import (
	"sort"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// ValuePoint 是任意 (时间, 数值) 对，用于承载派生序列。
type ValuePoint struct {
	TS    int64
	Value float64
}

// Known 判断指标名是否受支持。
func Known(metric string) bool {
	switch metric {
	case KeyCPU, KeyLoad, KeyMemUsed, KeyMemTotal, KeySwapUsed, KeySwapTotal,
		KeyDiskUsed, KeyDiskTotal, KeyNetRx, KeyNetTx, KeyTCP, KeyUDP, KeyProc, KeyUptime:
		return true
	default:
		return false
	}
}

// ExtractPair 返回 used / total 两个绝对值，供百分比视图使用。
func ExtractPair(sample protocol.Sample, metric string) (float64, float64, bool) {
	switch metric {
	case "mem":
		return float64(sample.MemUsed), float64(sample.MemTotal), true
	case "disk":
		return float64(sample.DiskUsed), float64(sample.DiskTotal), true
	case "swap":
		return float64(sample.SwapUsed), float64(sample.SwapTotal), true
	default:
		return 0, 0, false
	}
}

// DownsampleValues 把 (ts, value) 序列按 step 聚合成点。
func DownsampleValues(values []ValuePoint, from, to int64, maxPoints int) []Point {
	if len(values) == 0 {
		return nil
	}
	step := StepSeconds(from, to, maxPoints, 1)
	buckets := make(map[int64]*Aggregate, maxPoints)
	for _, item := range values {
		if item.TS < from || item.TS >= to {
			continue
		}
		bucketTS := item.TS - item.TS%step
		agg, ok := buckets[bucketTS]
		if ok == false {
			agg = &Aggregate{}
			buckets[bucketTS] = agg
		}
		agg.Add(item.Value)
	}

	order := make([]int64, 0, len(buckets))
	for ts := range buckets {
		order = append(order, ts)
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })

	out := make([]Point, 0, len(order))
	for _, ts := range order {
		agg := buckets[ts]
		out = append(out, Point{TS: ts, Avg: agg.Avg(), Min: agg.Min, Max: agg.Max})
	}
	return out
}

// ValuePointsFromSamples 提取单指标原始序列。
func ValuePointsFromSamples(samples []protocol.Sample, metric string) []ValuePoint {
	out := make([]ValuePoint, 0, len(samples))
	for _, sample := range samples {
		value, ok := Extract(sample, metric)
		if ok {
			out = append(out, ValuePoint{TS: sample.TS, Value: value})
		}
	}
	return out
}

// PercentValues 由原始采样计算百分比序列（used / total * 100）。
func PercentValues(samples []protocol.Sample, metric string) []ValuePoint {
	out := make([]ValuePoint, 0, len(samples))
	for _, sample := range samples {
		used, total, ok := ExtractPair(sample, metric)
		if ok == false || total <= 0 {
			continue
		}
		out = append(out, ValuePoint{TS: sample.TS, Value: used / total * 100})
	}
	return out
}

// RateValues 用累计计数器相邻差值计算 MB/s。
func RateValues(samples []protocol.Sample, metric string) []ValuePoint {
	out := make([]ValuePoint, 0, len(samples))
	for index := 1; index < len(samples); index++ {
		previous := samples[index-1]
		current := samples[index]
		delta := float64(current.TS - previous.TS)
		if delta <= 0 {
			continue
		}
		var bytes uint64
		switch metric {
		case KeyNetRx:
			if current.NetRx >= previous.NetRx {
				bytes = current.NetRx - previous.NetRx
			}
		case KeyNetTx:
			if current.NetTx >= previous.NetTx {
				bytes = current.NetTx - previous.NetTx
			}
		default:
			continue
		}
		out = append(out, ValuePoint{
			TS:    current.TS,
			Value: float64(bytes) / delta / 1024 / 1024,
		})
	}
	return out
}

// ToRate 把 store 聚合后的累计点转换为速率点（丢一个点用于做差）。
func ToRate(points []Point) []Point {
	if len(points) < 2 {
		return nil
	}
	out := make([]Point, 0, len(points)-1)
	for index := 1; index < len(points); index++ {
		previous := points[index-1]
		current := points[index]
		delta := float64(current.TS - previous.TS)
		if delta <= 0 {
			continue
		}
		bytes := current.Avg - previous.Avg
		if bytes < 0 {
			bytes = 0
		}
		rate := bytes / delta / 1024 / 1024
		out = append(out, Point{TS: current.TS, Avg: rate, Min: rate, Max: rate})
	}
	return out
}

// PercentPoints 用同 ts 的 used / total 聚合点求百分比。
func PercentPoints(used, total []Point) []Point {
	if len(used) == 0 || len(total) == 0 {
		return nil
	}
	totalByTS := make(map[int64]Point, len(total))
	for _, point := range total {
		totalByTS[point.TS] = point
	}
	out := make([]Point, 0, len(used))
	for _, point := range used {
		totalPoint, ok := totalByTS[point.TS]
		if ok == false || totalPoint.Avg <= 0 {
			continue
		}
		minValue := point.Min
		if totalPoint.Max > 0 {
			minValue = point.Min / totalPoint.Max * 100
		}
		maxValue := point.Max
		if totalPoint.Min > 0 {
			maxValue = point.Max / totalPoint.Min * 100
		}
		out = append(out, Point{
			TS:  point.TS,
			Avg: point.Avg / totalPoint.Avg * 100,
			Min: minValue,
			Max: maxValue,
		})
	}
	return out
}
