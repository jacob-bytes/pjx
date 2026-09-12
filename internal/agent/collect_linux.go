//go:build linux

package agent

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

type cpuSnapshot struct {
	idle  uint64
	total uint64
}

var lastCPU cpuSnapshot

// Collect 读 /proc 与根分区，得到一个采样点。
func Collect() protocol.Sample {
	sample := protocol.Sample{TS: time.Now().Unix()}

	sample.CPU = readCPUPercent()
	sample.Load = readLoad()
	memTotal, memAvailable := readMemInfo()
	sample.MemTotal = memTotal
	if memTotal > memAvailable {
		sample.MemUsed = memTotal - memAvailable
	}
	sample.SwapTotal, sample.SwapUsed = readSwap()
	sample.Uptime = readUptime()
	sample.NetRx, sample.NetTx = readNetDev()
	sample.TCP, sample.UDP = readSockStat()
	sample.DiskTotal, sample.DiskUsed = readDisk("/")
	sample.Proc = countProcesses()
	return sample
}

func readCPUPercent() float64 {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if scanner.Scan() == false {
		return 0
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 5 {
		return 0
	}

	var values []uint64
	for _, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			break
		}
		values = append(values, value)
	}
	if len(values) < 4 {
		return 0
	}

	var total uint64
	for _, value := range values {
		total += value
	}
	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}

	current := cpuSnapshot{idle: idle, total: total}
	previous := lastCPU
	lastCPU = current

	if previous.total == 0 || total <= previous.total {
		return 0
	}
	totalDelta := total - previous.total
	idleDelta := idle - previous.idle
	if idleDelta > totalDelta {
		idleDelta = totalDelta
	}
	return float64(totalDelta-idleDelta) / float64(totalDelta) * 100
}

func readLoad() float64 {
	raw, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		return 0
	}
	value, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}
	return value
}

func readMemInfo() (uint64, uint64) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	var total, available uint64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch strings.TrimSuffix(fields[0], ":") {
		case "MemTotal":
			total = value * 1024
		case "MemAvailable":
			available = value * 1024
		}
	}
	return total, available
}

func readSwap() (uint64, uint64) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	var total, free uint64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch strings.TrimSuffix(fields[0], ":") {
		case "SwapTotal":
			total = value * 1024
		case "SwapFree":
			free = value * 1024
		}
	}
	if total < free {
		return total, 0
	}
	return total, total - free
}

func readUptime() uint64 {
	raw, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		return 0
	}
	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}
	return uint64(seconds)
}

func readNetDev() (uint64, uint64) {
	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	var rx, tx uint64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, ":") == false {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) < 9 {
			continue
		}
		received, err := strconv.ParseUint(fields[0], 10, 64)
		if err == nil {
			rx += received
		}
		transmitted, err := strconv.ParseUint(fields[8], 10, 64)
		if err == nil {
			tx += transmitted
		}
	}
	return rx, tx
}

func readSockStat() (int, int) {
	file, err := os.Open("/proc/net/sockstat")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	var tcp, udp int
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 {
			continue
		}
		value, err := strconv.Atoi(fields[2])
		if err != nil {
			continue
		}
		switch fields[0] {
		case "TCP:":
			tcp = value
		case "UDP:":
			udp = value
		}
	}
	return tcp, udp
}

func readDisk(path string) (uint64, uint64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0
	}
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	if total < free {
		return total, 0
	}
	return total, total - free
}

func countProcesses() int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() == false {
			continue
		}
		if _, err := strconv.Atoi(entry.Name()); err == nil {
			count++
		}
	}
	return count
}
