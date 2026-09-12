package master

import (
	"bufio"
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jacob-bytes/pjx/internal/alerts"
	"github.com/jacob-bytes/pjx/internal/config"
	"github.com/jacob-bytes/pjx/internal/metrics"
	"github.com/jacob-bytes/pjx/internal/scheduler"
	"github.com/jacob-bytes/pjx/internal/store"
	"github.com/jacob-bytes/pjx/web"
)

// Server 组装 HTTP 路由、agent hub 与后台鉴权。
type Server struct {
	cfg       *config.Config
	store     *store.Store
	hub       *Hub
	auth      *Auth
	pipeline  *metrics.Pipeline
	scheduler *scheduler.Scheduler
	alerts    *alerts.Engine
	log       *slog.Logger

	mu        sync.Mutex
	seq       uint64
	configRev int64

	startedAt  time.Time
	sseClients atomic.Int64
}

// New 构造 master。
func New(cfg *config.Config, db *store.Store, log *slog.Logger) *Server {
	ctx := context.Background()
	server := &Server{
		cfg:       cfg,
		store:     db,
		hub:       NewHub(),
		log:       log,
		configRev: 1,
		startedAt: time.Now(),
	}

	// 先应用持久化设置，再按最终配置构建子系统。
	server.loadStoredSettings(ctx)

	secret := cfg.SessionSecret
	if secret == "" {
		secret = server.loadOrCreateSessionSecret(ctx)
	}
	server.auth = NewAuth(db, secret, cfg.AdminPassword, log)

	server.pipeline = metrics.NewPipeline(db, log, metrics.Options{
		MemoryPoints: int(config.ParseDuration(cfg.Retention.MemoryKeep, time.Hour).Seconds()),
		OneMinKeep:   config.ParseDuration(cfg.Retention.OneMinKeep, 14*24*time.Hour),
		OneHourKeep:  config.ParseDuration(cfg.Retention.OneHourKeep, 365*24*time.Hour),
	})
	server.scheduler = scheduler.New(db, server, log, scheduler.Options{
		ResultKeep: config.ParseDuration(cfg.Retention.TaskKeep, 30*24*time.Hour),
	})
	server.alerts = alerts.New(db, server.buildNotifier(), log, alerts.Options{
		EventKeep: config.ParseDuration(cfg.Retention.AlertKeep, 90*24*time.Hour),
	})
	server.scheduler.SetResultHook(server.alerts.ObserveProbe)

	return server
}

// Handler 返回完整路由。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/public/overview", s.handlePublicOverview)
	mux.HandleFunc("/api/public/series", s.handlePublicSeries)
	mux.HandleFunc("/api/public/probes", s.handlePublicProbes)
	mux.HandleFunc("/api/public/probes/", s.handlePublicProbeSeries)
	mux.HandleFunc("/api/public/agents/", s.handlePublicUptime)

	mux.HandleFunc("/api/admin/login", s.auth.LoginHandler())
	mux.HandleFunc("/api/admin/logout", s.auth.LogoutHandler())
	mux.HandleFunc("/api/admin/session", s.auth.SessionHandler())
	mux.HandleFunc("/api/admin/state", s.auth.Require(s.handleAdminState))
	mux.HandleFunc("/api/admin/agents", s.auth.Require(s.handleAdminAgents))
	mux.HandleFunc("/api/admin/agents/", s.auth.Require(s.handleAdminAgentByID))
	mux.HandleFunc("/api/admin/tasks", s.auth.Require(s.handleAdminTasks))
	mux.HandleFunc("/api/admin/tasks/", s.auth.Require(s.handleAdminTaskByID))
	mux.HandleFunc("/api/admin/alert-rules", s.auth.Require(s.handleAdminAlertRules))
	mux.HandleFunc("/api/admin/alert-rules/", s.auth.Require(s.handleAdminAlertRuleByID))
	mux.HandleFunc("/api/admin/alert-events", s.auth.Require(s.handleAdminAlertEvents))
	mux.HandleFunc("/api/admin/notify/test", s.auth.Require(s.handleAdminNotifyTest))
	mux.HandleFunc("/api/admin/tokens", s.auth.Require(s.handleAdminTokens))
	mux.HandleFunc("/api/admin/tokens/", s.auth.Require(s.handleAdminTokenByID))
	mux.HandleFunc("/api/admin/settings", s.auth.Require(s.handleAdminSettings))
	mux.HandleFunc("/api/admin/password", s.auth.ChangePasswordHandler())

	mux.HandleFunc("/api/agent/ws", s.handleAgentWS)

	mux.Handle("/", newStaticHandler(s.cfg.WebDir, web.FS(), s.log))

	return recoverMiddleware(s.log, logMiddleware(s.log, mux))
}

// Run 启动 HTTP 服务并阻塞到 ctx 取消。
func (s *Server) Run(ctx context.Context) error {
	httpServer := &http.Server{
		Addr:              s.cfg.Listen,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.hub.CleanupStale(90 * time.Second)
			}
		}
	}()

	go s.pipeline.Run(ctx)
	go s.scheduler.Run(ctx)
	go s.alerts.Run(ctx)

	s.log.Info("master listening", "addr", s.cfg.Listen, "web_dir", s.cfg.WebDir)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	// 退出前同步落盘当前分钟桶，避免丢最后一段数据。
	flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.pipeline.FlushAll(flushCtx)
	return nil
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Unwrap 让 http.ResponseController 能穿透中间件拿到 Hijacker / Flusher。
// 没有它，WebSocket 升级会因为中间件不实现 http.Hijacker 而返回 501。
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

// Flush 让 SSE 的 w.(http.Flusher) 断言成立。
func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Hijack 兼容直接做类型断言的库。
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if ok == false {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

func logMiddleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		log.Debug("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration", time.Since(start).String(),
		)
	})
}

func recoverMiddleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				log.Error("panic recovered", "value", value, "path", r.URL.Path)
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
