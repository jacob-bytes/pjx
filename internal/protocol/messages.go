package protocol

import "encoding/json"

// HelloParams 是 agent 建立会话后的第一条消息。
type HelloParams struct {
	ProtocolVersion int      `json:"protocol_version"`
	AgentVersion    string   `json:"agent_version"`
	MachineID       string   `json:"machine_id"`
	Hostname        string   `json:"hostname"`
	OS              string   `json:"os"`
	Arch            string   `json:"arch"`
	Kernel          string   `json:"kernel"`
	CPUModel        string   `json:"cpu_model"`
	CPUCores        int      `json:"cpu_cores"`
	MemTotal        uint64   `json:"mem_total"`
	DiskTotal       uint64   `json:"disk_total"`
	Tags            []string `json:"tags"`
	Capabilities    []string `json:"capabilities"`
}

// WelcomeResult 是 hello 的应答。interval_ms 由 master 决定。
type WelcomeResult struct {
	ServerTime int64  `json:"server_time"`
	AgentName  string `json:"agent_name"`
	IntervalMS int    `json:"interval_ms"`
	ConfigRev  int64  `json:"config_rev"`
}

// Sample 是一个采样点。字节类字段是累计计数器，前端按差值算速率。
type Sample struct {
	TS        int64   `json:"ts"`
	CPU       float64 `json:"cpu"`
	Load      float64 `json:"load"`
	MemUsed   uint64  `json:"mem_used"`
	MemTotal  uint64  `json:"mem_total"`
	SwapUsed  uint64  `json:"swap_used"`
	SwapTotal uint64  `json:"swap_total"`
	DiskUsed  uint64  `json:"disk_used"`
	DiskTotal uint64  `json:"disk_total"`
	NetRx     uint64  `json:"net_rx"`
	NetTx     uint64  `json:"net_tx"`
	TCP       int     `json:"tcp"`
	UDP       int     `json:"udp"`
	Proc      int     `json:"proc"`
	Uptime    uint64  `json:"uptime"`
}

// ReportParams 是指标上报。seq 用于重连补发时去重。
type ReportParams struct {
	Seq     uint64   `json:"seq"`
	Samples []Sample `json:"samples"`
}

// TaskSpec 是 master 下发给 agent 的探活任务。
type TaskSpec struct {
	RunID   string          `json:"run_id"`
	Kind    string          `json:"kind"`
	Target  string          `json:"target"`
	Timeout int             `json:"timeout_ms"`
	Args    json.RawMessage `json:"args,omitempty"`
}

// TaskResultParams 是探活结果。
type TaskResultParams struct {
	RunID     string  `json:"run_id"`
	OK        bool    `json:"ok"`
	LatencyMS float64 `json:"latency_ms"`
	Message   string  `json:"message,omitempty"`
}
