// Package metrics 实现指标三层管道：
//   - 内存环形缓冲（1s，重启即丢）
//   - metric_1m（1 分钟聚合，落盘）
//   - metric_1h（1 小时聚合，落盘）
package metrics

import "github.com/jacob-bytes/pjx/internal/protocol"

// 指标名。新增指标时不需要迁移（窄表），但要同步前端字段。
const KeyCPU = "cpu"
const KeyLoad = "load"
const KeyMemUsed = "mem_used"
const KeyMemTotal = "mem_total"
const KeySwapUsed = "swap_used"
const KeySwapTotal = "swap_total"
const KeyDiskUsed = "disk_used"
const KeyDiskTotal = "disk_total"
const KeyNetRx = "net_rx"
const KeyNetTx = "net_tx"
const KeyTCP = "tcp"
const KeyUDP = "udp"
const KeyProc = "proc"
const KeyUptime = "uptime"

// Values 把一次采样展开成 metric -> value。
func Values(sample protocol.Sample) map[string]float64 {
	values := make(map[string]float64, 14)
	values[KeyCPU] = sample.CPU
	values[KeyLoad] = sample.Load
	values[KeyMemUsed] = float64(sample.MemUsed)
	values[KeyMemTotal] = float64(sample.MemTotal)
	values[KeySwapUsed] = float64(sample.SwapUsed)
	values[KeySwapTotal] = float64(sample.SwapTotal)
	values[KeyDiskUsed] = float64(sample.DiskUsed)
	values[KeyDiskTotal] = float64(sample.DiskTotal)
	values[KeyNetRx] = float64(sample.NetRx)
	values[KeyNetTx] = float64(sample.NetTx)
	values[KeyTCP] = float64(sample.TCP)
	values[KeyUDP] = float64(sample.UDP)
	values[KeyProc] = float64(sample.Proc)
	values[KeyUptime] = float64(sample.Uptime)
	return values
}

// Aggregate 是桶内聚合：延迟类看 max，容量类看 avg，最小值用于排查异常。
type Aggregate struct {
	Sum   float64
	Min   float64
	Max   float64
	Count int64
}

// Add 把一个值并入聚合。
func (a *Aggregate) Add(value float64) {
	if a.Count == 0 {
		a.Sum = value
		a.Min = value
		a.Max = value
		a.Count = 1
		return
	}
	a.Sum += value
	if value < a.Min {
		a.Min = value
	}
	if value > a.Max {
		a.Max = value
	}
	a.Count++
}

// Avg 返回算术平均。
func (a Aggregate) Avg() float64 {
	if a.Count == 0 {
		return 0
	}
	return a.Sum / float64(a.Count)
}

// Point 是查询返回的一个聚合点。
type Point struct {
	TS  int64   `json:"ts"`
	Avg float64 `json:"avg"`
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}
