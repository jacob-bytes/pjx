// Command agent 采集指标并通过 WebSocket 上报给 master。
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jacob-bytes/pjx/internal/agent"
)

func main() {
	masterURL := flag.String("master", "ws://127.0.0.1:8080/api/agent/ws", "master WebSocket 地址")
	token := flag.String("token", "", "agent 令牌")
	name := flag.String("name", "", "节点名，默认取主机名")
	interval := flag.Duration("interval", time.Second, "上报间隔")
	tags := flag.String("tags", "", "节点标签，逗号分隔")
	logLevel := flag.String("log-level", "info", "debug | info | warn | error")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(*logLevel),
	}))

	if *name == "" {
		hostname, err := os.Hostname()
		if err == nil {
			*name = hostname
		} else {
			*name = "agent"
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	runner := agent.New(agent.Config{
		MasterURL: *masterURL,
		Token:     *token,
		Name:      *name,
		Interval:  *interval,
		Tags:      agent.ParseTags(*tags),
	}, logger)

	if err := runner.Run(ctx); err != nil && ctx.Err() == nil {
		logger.Error("agent stopped", "err", err)
		os.Exit(1)
	}
}

func parseLevel(value string) slog.Level {
	switch value {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
