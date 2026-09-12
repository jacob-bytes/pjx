// Command master 是探针服务端：HTTP API + SSE + agent WebSocket + SQLite。
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jacob-bytes/pjx/internal/config"
	"github.com/jacob-bytes/pjx/internal/master"
	"github.com/jacob-bytes/pjx/internal/store"
)

func main() {
	configPath := flag.String("config", "", "YAML 配置文件路径")
	listen := flag.String("listen", "", "监听地址，例如 127.0.0.1:8080")
	webDir := flag.String("web-dir", "", "前端产物目录，默认 ./web/dist")
	dataDir := flag.String("data-dir", "", "SQLite 数据目录，默认 ./data")
	logLevel := flag.String("log-level", "info", "debug | info | warn | error")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(*logLevel),
	}))

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("load config", "err", err)
		os.Exit(1)
	}
	if *listen != "" {
		cfg.Listen = *listen
	}
	if *webDir != "" {
		cfg.WebDir = *webDir
	}
	if *dataDir != "" {
		cfg.DataDir = *dataDir
	}

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		logger.Error("create data dir", "err", err)
		os.Exit(1)
	}

	db, err := store.Open(cfg.DBPath())
	if err != nil {
		logger.Error("open store", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	server := master.New(cfg, db, logger)
	if err := server.Run(ctx); err != nil {
		logger.Error("master stopped", "err", err)
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
