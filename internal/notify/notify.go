// Package notify 定义通知渠道抽象。
//
// v1 只实装 Telegram；Webhook 已在 Notifier 接口层面预留，
// 接入时不需要改告警核心。
package notify

import "context"

// Message 是一条待发送的通知。
type Message struct {
	Title string
	Body  string
	Level string
}

// Notifier 是通知渠道。
type Notifier interface {
	Name() string
	Send(ctx context.Context, message Message) error
}
