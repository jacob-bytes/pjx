// Package agent 负责采集指标、连接 master 并执行下发的探活任务。
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Config 是 agent 的运行参数。
type Config struct {
	MasterURL string
	Token     string
	Name      string
	Interval  time.Duration
	Tags      []string
}

// Agent 是 agent 实例。
type Agent struct {
	cfg    Config
	log    *slog.Logger
	seq    uint64
	nextID int64
}

// New 构造 agent。
func New(cfg Config, log *slog.Logger) *Agent {
	if cfg.Interval <= 0 {
		cfg.Interval = time.Second
	}
	return &Agent{cfg: cfg, log: log}
}

// Run 保持长连接，断开后指数退避重连。
func (a *Agent) Run(ctx context.Context) error {
	backoff := time.Second
	for {
		err := a.connectOnce(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			a.log.Warn("connection lost", "err", err)
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		if backoff < time.Minute {
			backoff *= 2
			if backoff > time.Minute {
				backoff = time.Minute
			}
		}
	}
}

func (a *Agent) connectOnce(ctx context.Context) error {
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	header := http.Header{}
	if a.cfg.Token != "" {
		header.Set("Authorization", "Bearer "+a.cfg.Token)
	}

	conn, _, err := websocket.Dial(dialCtx, a.cfg.MasterURL, &websocket.DialOptions{
		HTTPHeader: header,
	})
	if err != nil {
		return fmt.Errorf("dial master: %w", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	if err := a.handshake(ctx, conn); err != nil {
		return err
	}
	a.log.Info("connected to master", "url", a.cfg.MasterURL, "name", a.cfg.Name)

	readErr := make(chan error, 1)
	go func() {
		readErr <- a.readLoop(ctx, conn)
	}()

	reportCtx, cancelReport := context.WithCancel(ctx)
	defer cancelReport()
	go a.reportLoop(reportCtx, conn)

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-readErr:
		return err
	}
}

func (a *Agent) handshake(ctx context.Context, conn *websocket.Conn) error {
	hello := protocol.HelloParams{
		ProtocolVersion: protocol.Version,
		AgentVersion:    "0.1.0",
		MachineID:       machineID(),
		Tags:            a.cfg.Tags,
		Hostname:        a.cfg.Name,
		OS:              runtime.GOOS,
		Arch:            runtime.GOARCH,
		CPUCores:        runtime.NumCPU(),
		Capabilities:    []string{"http", "tcp"},
	}

	id := a.id()
	request, err := protocol.NewRequest(id, protocol.MethodHello, hello)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(request)
	if err != nil {
		return err
	}

	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	err = conn.Write(writeCtx, websocket.MessageText, raw)
	cancel()
	if err != nil {
		return fmt.Errorf("send hello: %w", err)
	}

	for {
		readCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		_, data, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			return fmt.Errorf("wait welcome: %w", err)
		}

		var response protocol.Response
		if err := json.Unmarshal(data, &response); err != nil {
			continue
		}
		if len(response.ID) == 0 {
			continue
		}
		if response.Error != nil {
			return fmt.Errorf("hello rejected: %s", response.Error.Message)
		}

		var welcome protocol.WelcomeResult
		if err := json.Unmarshal(response.Result, &welcome); err != nil {
			return fmt.Errorf("decode welcome: %w", err)
		}
		if welcome.IntervalMS > 0 {
			a.cfg.Interval = time.Duration(welcome.IntervalMS) * time.Millisecond
		}
		return nil
	}
}

func (a *Agent) reportLoop(ctx context.Context, conn *websocket.Conn) {
	ticker := time.NewTicker(a.cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.seq++
			payload, err := protocol.NewNotification(protocol.MethodReport, protocol.ReportParams{
				Seq:     a.seq,
				Samples: []protocol.Sample{Collect()},
			})
			if err != nil {
				continue
			}
			raw, err := json.Marshal(payload)
			if err != nil {
				continue
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = conn.Write(writeCtx, websocket.MessageText, raw)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (a *Agent) readLoop(ctx context.Context, conn *websocket.Conn) error {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}

		var envelope struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			continue
		}
		if envelope.Method != protocol.MethodDispatch || len(envelope.ID) == 0 {
			continue
		}

		var spec protocol.TaskSpec
		if err := protocol.DecodeParams(envelope.Params, &spec); err != nil {
			continue
		}
		result := RunProbe(ctx, spec)
		response, err := protocol.NewResult(envelope.ID, result)
		if err != nil {
			continue
		}
		raw, err := json.Marshal(response)
		if err != nil {
			continue
		}
		writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = conn.Write(writeCtx, websocket.MessageText, raw)
		cancel()
		if err != nil {
			return err
		}
	}
}

func (a *Agent) id() int64 {
	a.nextID++
	return a.nextID
}

func machineID() string {
	if value := os.Getenv("PJX_MACHINE_ID"); value != "" {
		return value
	}
	if hostname, err := os.Hostname(); err == nil {
		return hostname
	}
	return "agent"
}

// ParseTags 把逗号分隔的标签解析成切片，供 CLI 使用。
func ParseTags(value string) []string {
	var tags []string
	for _, part := range strings.Split(value, ",") {
		tag := strings.TrimSpace(part)
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}
