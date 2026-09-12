// Package protocol 定义 agent 与 master 之间的线协议。
//
// 传输：WebSocket（wss）
// 消息：JSON-RPC 2.0
//   - 指标上报用 notification（无 id，不等应答）
//   - 握手、任务下发、任务结果用 request/response（带 id，可关联）
package protocol

import "encoding/json"
import "errors"

// Version 是线协议版本。agent 在 hello 里上报，master 决定是否兼容。
const Version = 1

// 方法名常量。反过来也成立：master 会主动向 agent 发 request。
const MethodHello = "agent.hello"
const MethodReport = "agent.report"
const MethodTaskResult = "agent.taskResult"
const MethodWelcome = "master.welcome"
const MethodDispatch = "master.task.dispatch"
const MethodConfig = "master.config.update"

const CodeParse = -32700
const CodeInvalidRequest = -32600
const CodeMethodNotFound = -32601
const CodeInvalidParams = -32602
const CodeInternal = -32603

// Request 是 JSON-RPC 2.0 请求。
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Notification 是 JSON-RPC 2.0 通知：没有 id，不应答。
type Notification struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response 是 JSON-RPC 2.0 响应。
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
}

// Error 是 JSON-RPC 2.0 错误对象。
type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewRequest 构造一个带 id 的请求。
func NewRequest(id int64, method string, params any) (*Request, error) {
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	idRaw, err := json.Marshal(id)
	if err != nil {
		return nil, err
	}
	return &Request{JSONRPC: "2.0", ID: idRaw, Method: method, Params: raw}, nil
}

// NewNotification 构造一个通知。
func NewNotification(method string, params any) (*Notification, error) {
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	return &Notification{JSONRPC: "2.0", Method: method, Params: raw}, nil
}

// NewResult 构造成功响应。
func NewResult(id json.RawMessage, result any) (*Response, error) {
	raw, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	return &Response{JSONRPC: "2.0", ID: id, Result: raw}, nil
}

// NewError 构造错误响应。
func NewError(id json.RawMessage, code int, message string) *Response {
	return &Response{JSONRPC: "2.0", ID: id, Error: &Error{Code: code, Message: message}}
}

// DecodeParams 把 params 解到具体类型。
func DecodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return errors.New("empty params")
	}
	return json.Unmarshal(raw, out)
}
