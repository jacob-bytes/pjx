package master

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"
)

// tickPayload 是 SSE 每秒推给前端的批量 tick。
// 数组而不是对象：200 台规模下少一层键名开销，前端按位置解包。
type tickPayload struct {
	Seq uint64  `json:"seq"`
	TS  int64   `json:"ts"`
	A   [][]any `json:"a"`
}

// handleEvents 处理 GET /api/events。
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keepalive")
	// nginx 下必须禁用缓冲，否则事件会被攒着一起发。
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			// 注释行：保持连接不被中间层掐断。
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		case <-tick.C:
			payload := s.nextTick()
			raw, err := json.Marshal(payload)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: tick\ndata: %s\n\n", raw)
			flusher.Flush()
		}
	}
}

func (s *Server) nextTick() tickPayload {
	s.mu.Lock()
	s.seq++
	seq := s.seq
	s.mu.Unlock()

	nodes := s.hub.Snapshot()
	rows := make([][]any, 0, len(nodes))
	for _, node := range nodes {
		rows = append(rows, []any{
			node.ID,
			round2(node.CPU),
			round2(node.Mem),
			round2(node.Disk),
			round2(node.Rx),
			round2(node.Tx),
			node.Status,
		})
	}
	return tickPayload{Seq: seq, TS: time.Now().Unix(), A: rows}
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
