package master

import (
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Session 是一条 agent 长连接。
type Session struct {
	ID        string
	Name      string
	Hello     protocol.HelloParams
	Latest    protocol.Sample
	HasLatest bool
	RxRate    float64
	TxRate    float64
	LastSeen  time.Time

	mu        sync.Mutex
	conn      *websocket.Conn
	send      chan []byte
	pending   map[string]chan *protocol.Response
	nextID    int64
	closeOnce sync.Once
	prev      protocol.Sample
	hasPrev   bool
}

func newSession(conn *websocket.Conn) *Session {
	return &Session{
		conn:    conn,
		send:    make(chan []byte, 32),
		pending: make(map[string]chan *protocol.Response),
	}
}

// update 记录最新采样，并按累计计数器差值算速率。
func (s *Session) update(sample protocol.Sample) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.hasPrev {
		if delta := float64(sample.TS - s.prev.TS); delta > 0 {
			if sample.NetRx >= s.prev.NetRx {
				s.RxRate = float64(sample.NetRx-s.prev.NetRx) / delta / 1024 / 1024
			}
			if sample.NetTx >= s.prev.NetTx {
				s.TxRate = float64(sample.NetTx-s.prev.NetTx) / delta / 1024 / 1024
			}
		}
	}
	s.prev = sample
	s.hasPrev = true
	s.Latest = sample
	s.HasLatest = true
	s.LastSeen = time.Now()
}

// enqueue 非阻塞投递一帧；队列满说明客户端太慢，丢帧而不是拖住 hub。
func (s *Session) enqueue(payload []byte) {
	select {
	case s.send <- payload:
	default:
	}
}

func (s *Session) close(code websocket.StatusCode, reason string) {
	s.closeOnce.Do(func() {
		close(s.send)
		_ = s.conn.Close(code, reason)
	})
}

// Hub 是节点会话注册表。
type Hub struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

// NewHub 建一个空 hub。
func NewHub() *Hub {
	return &Hub{sessions: make(map[string]*Session)}
}

func (h *Hub) Add(session *Session) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sessions[session.ID] = session
}

func (h *Hub) Remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.sessions, id)
}

func (h *Hub) Get(id string) (*Session, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	session, ok := h.sessions[id]
	return session, ok
}

func (h *Hub) List() []*Session {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*Session, 0, len(h.sessions))
	for _, session := range h.sessions {
		out = append(out, session)
	}
	return out
}

func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.sessions)
}

// CleanupStale 回收长时间没有上报的会话。
func (h *Hub) CleanupStale(timeout time.Duration) {
	cutoff := time.Now().Add(-timeout)
	for _, session := range h.List() {
		if session.HasLatest && session.LastSeen.Before(cutoff) {
			session.close(websocket.StatusPolicyViolation, "stale")
			h.Remove(session.ID)
		}
	}
}

// SnapshotNode 是给公网 / SSE 用的脱敏快照。
type SnapshotNode struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Status string  `json:"status"`
	CPU    float64 `json:"cpu"`
	Mem    float64 `json:"mem"`
	Disk   float64 `json:"disk"`
	Rx     float64 `json:"rx"`
	Tx     float64 `json:"tx"`
	Uptime uint64  `json:"uptime"`
}

// Snapshot 返回当前所有在线节点的脱敏状态。
func (h *Hub) Snapshot() []SnapshotNode {
	sessions := h.List()
	out := make([]SnapshotNode, 0, len(sessions))
	for _, session := range sessions {
		session.mu.Lock()
		sample := session.Latest
		hasLatest := session.HasLatest
		name := session.Name
		rx := session.RxRate
		tx := session.TxRate
		session.mu.Unlock()

		node := SnapshotNode{ID: session.ID, Name: name, Status: "off"}
		if hasLatest {
			node.Status = statusOf(sample)
			node.CPU = sample.CPU
			node.Mem = percentOf(sample.MemUsed, sample.MemTotal)
			node.Disk = percentOf(sample.DiskUsed, sample.DiskTotal)
			node.Rx = rx
			node.Tx = tx
			node.Uptime = sample.Uptime
		}
		out = append(out, node)
	}
	return out
}

func statusOf(sample protocol.Sample) string {
	mem := percentOf(sample.MemUsed, sample.MemTotal)
	disk := percentOf(sample.DiskUsed, sample.DiskTotal)
	switch {
	case sample.CPU >= 90 || mem >= 92 || disk >= 92:
		return "crit"
	case sample.CPU >= 80 || mem >= 85 || disk >= 85:
		return "warn"
	default:
		return "ok"
	}
}

func percentOf(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}
