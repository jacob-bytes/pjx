//go:build !linux

package agent

import (
	"runtime"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Collect 在非 Linux 平台用 runtime 兜底，保证本机可编译、可联调。
// 真实部署目标是 Linux，采集实现在 collect_linux.go。
func Collect() protocol.Sample {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	return protocol.Sample{
		TS:       time.Now().Unix(),
		MemTotal: mem.Sys,
		MemUsed:  mem.Alloc,
		Proc:     1,
	}
}
