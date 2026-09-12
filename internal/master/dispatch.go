package master

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// request 发送一个 JSON-RPC 请求并等待对应响应。
// 响应的 id 与请求一致，由 dispatchAgentMessage 投递到 pending。
func (s *Session) request(ctx context.Context, method string, params any) (*protocol.Response, error) {
	s.mu.Lock()
	s.nextID++
	id := s.nextID
	s.mu.Unlock()

	request, err := protocol.NewRequest(id, method, params)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	rawID, err := json.Marshal(id)
	if err != nil {
		return nil, err
	}
	key := string(rawID)

	channel := make(chan *protocol.Response, 1)
	s.mu.Lock()
	s.pending[key] = channel
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.pending, key)
		s.mu.Unlock()
	}()

	s.enqueue(payload)

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case response := <-channel:
		return response, nil
	}
}

// deliverResponse 把 agent 的响应投递给等待者。
func (s *Session) deliverResponse(id json.RawMessage, response *protocol.Response) bool {
	key := string(id)
	s.mu.Lock()
	channel, ok := s.pending[key]
	s.mu.Unlock()
	if ok == false {
		return false
	}
	select {
	case channel <- response:
		return true
	default:
		return false
	}
}

// Dispatch 实现 scheduler.Dispatcher：向指定 agent 下发任务并等待结果。
func (s *Server) Dispatch(ctx context.Context, agentID string, spec protocol.TaskSpec) (protocol.TaskResultParams, error) {
	session, ok := s.hub.Get(agentID)
	if ok == false {
		return protocol.TaskResultParams{}, fmt.Errorf("agent %s offline", agentID)
	}

	response, err := session.request(ctx, protocol.MethodDispatch, spec)
	if err != nil {
		return protocol.TaskResultParams{}, err
	}
	if response.Error != nil {
		return protocol.TaskResultParams{}, errors.New(response.Error.Message)
	}

	var result protocol.TaskResultParams
	if err := json.Unmarshal(response.Result, &result); err != nil {
		return protocol.TaskResultParams{}, err
	}
	return result, nil
}

// Online 实现 scheduler.Dispatcher。
func (s *Server) Online(agentID string) bool {
	_, ok := s.hub.Get(agentID)
	return ok
}
