package master

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/jacob-bytes/pjx/internal/authn"
	"github.com/jacob-bytes/pjx/internal/protocol"
)

// handleAgentWS 处理 /api/agent/ws：升级后进入 JSON-RPC 循环。
func (s *Server) handleAgentWS(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !s.tokenAllowed(r.Context(), token) {
		http.Error(w, "invalid agent token", http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// agent 不是浏览器，不发送 Origin。放开校验是为了本地自测，
		// 生产建议只允许同域或直接要求 token。
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		s.log.Warn("accept agent websocket", "err", err)
		return
	}
	conn.SetReadLimit(1 << 20)

	session := newSession(conn)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go s.writeLoop(ctx, session)
	go s.pingLoop(ctx, session)

	defer func() {
		s.hub.Remove(session.ID)
		session.close(websocket.StatusNormalClosure, "bye")
	}()

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		s.dispatchAgentMessage(ctx, session, data)
	}
}

func (s *Server) writeLoop(ctx context.Context, session *Session) {
	for {
		select {
		case <-ctx.Done():
			return
		case payload, ok := <-session.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := session.conn.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (s *Server) pingLoop(ctx context.Context, session *Session) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := session.conn.Ping(pingCtx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (s *Server) dispatchAgentMessage(ctx context.Context, session *Session, data []byte) {
	var envelope struct {
		ID     json.RawMessage `json:"id"`
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
		Result json.RawMessage `json:"result"`
		Error  *protocol.Error `json:"error"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		s.log.Warn("bad agent frame", "err", err)
		return
	}
	isRequest := len(envelope.ID) > 0

	// master 发起的 request（如下发任务）的响应
	if envelope.Method == "" && len(envelope.ID) > 0 {
		session.deliverResponse(envelope.ID, &protocol.Response{
			JSONRPC: "2.0",
			ID:      envelope.ID,
			Result:  envelope.Result,
			Error:   envelope.Error,
		})
		return
	}

	switch envelope.Method {
	case protocol.MethodHello:
		s.handleHello(ctx, session, envelope.ID, envelope.Params)
	case protocol.MethodReport:
		s.handleReport(ctx, session, envelope.Params)
	case protocol.MethodTaskResult:
		s.log.Info("task result", "agent", session.ID, "payload", string(envelope.Params))
	default:
		if isRequest {
			s.reply(session, protocol.NewError(envelope.ID, protocol.CodeMethodNotFound, "unknown method: "+envelope.Method))
		}
	}
}

func (s *Server) handleHello(ctx context.Context, session *Session, id json.RawMessage, params json.RawMessage) {
	var hello protocol.HelloParams
	if err := protocol.DecodeParams(params, &hello); err != nil {
		s.reply(session, protocol.NewError(id, protocol.CodeInvalidParams, err.Error()))
		return
	}
	if hello.ProtocolVersion != protocol.Version {
		s.reply(session, protocol.NewError(id, protocol.CodeInvalidParams, "protocol version mismatch"))
		return
	}

	session.ID = agentIDFromHello(hello)
	session.Name = hello.Hostname
	session.Hello = hello
	s.hub.Add(session)

	if err := s.store.EnsureAgent(ctx, session.ID, session.Name, true, hello.Tags); err != nil {
		s.log.Error("ensure agent", "id", session.ID, "err", err)
	}

	result := protocol.WelcomeResult{
		ServerTime: time.Now().Unix(),
		AgentName:  session.Name,
		IntervalMS: 1000,
		ConfigRev:  s.configRev,
	}
	response, err := protocol.NewResult(id, result)
	if err != nil {
		return
	}
	s.reply(session, response)
	s.log.Info("agent online", "id", session.ID, "name", session.Name, "os", hello.OS, "arch", hello.Arch)
}

func (s *Server) handleReport(ctx context.Context, session *Session, params json.RawMessage) {
	var report protocol.ReportParams
	if err := protocol.DecodeParams(params, &report); err != nil {
		s.log.Warn("bad report", "agent", session.ID, "err", err)
		return
	}
	for _, sample := range report.Samples {
		session.update(sample)
		s.pipeline.Observe(ctx, session.ID, sample)
		s.alerts.ObserveMetric(session.ID, sample)
	}
	if len(report.Samples) == 0 {
		return
	}
	_ = s.store.TouchAgent(ctx, session.ID)
}

func (s *Server) reply(session *Session, response *protocol.Response) {
	if response == nil {
		return
	}
	payload, err := json.Marshal(response)
	if err != nil {
		return
	}
	session.enqueue(payload)
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

func (s *Server) tokenAllowed(ctx context.Context, token string) bool {
	if token == "" {
		return s.allowAnonymousAgent(ctx)
	}
	hash := authn.HashToken(token)
	if record, ok, err := s.store.FindAgentTokenByHash(ctx, hash); err == nil && ok {
		_ = s.store.TouchAgentToken(ctx, record.ID)
		return true
	}
	for _, allowed := range s.cfg.AgentTokens {
		if subtle.ConstantTimeCompare([]byte(token), []byte(allowed)) == 1 {
			return true
		}
	}
	return s.allowAnonymousAgent(ctx)
}

// allowAnonymousAgent 仅在没有任何令牌来源时放行，方便本地联调。
func (s *Server) allowAnonymousAgent(ctx context.Context) bool {
	if len(s.cfg.AgentTokens) > 0 {
		return false
	}
	count, err := s.store.CountAgentTokens(ctx)
	if err != nil {
		return false
	}
	return count == 0
}

func agentIDFromHello(hello protocol.HelloParams) string {
	if hello.MachineID != "" {
		return hello.MachineID
	}
	if hello.Hostname != "" {
		return hello.Hostname
	}
	return "unknown"
}
