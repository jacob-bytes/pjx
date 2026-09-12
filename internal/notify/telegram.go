package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Telegram 通过 Bot API 的 sendMessage 发通知。
// 内置两件事：全局最小发送间隔（默认 20 msg/s）与 429 retry_after 退避。
type Telegram struct {
	Token   string
	ChatID  string
	TopicID string
	client  *http.Client

	mu          sync.Mutex
	lastSent    time.Time
	minInterval time.Duration
}

// NewTelegram 构造 Telegram 渠道。
func NewTelegram(token, chatID, topicID string) *Telegram {
	return &Telegram{
		Token:       token,
		ChatID:      chatID,
		TopicID:     topicID,
		client:      &http.Client{Timeout: 10 * time.Second},
		minInterval: 50 * time.Millisecond,
	}
}

func (t *Telegram) Name() string {
	return "telegram"
}

// Send 发送一条 HTML 消息，遇到 429 按 retry_after 退避重试。
func (t *Telegram) Send(ctx context.Context, message Message) error {
	if t.Token == "" || t.ChatID == "" {
		return fmt.Errorf("telegram token or chat_id is empty")
	}

	body := map[string]any{
		"chat_id":                  t.ChatID,
		"text":                     message.Body,
		"parse_mode":               "HTML",
		"disable_web_page_preview": true,
	}
	if t.TopicID != "" {
		body["message_thread_id"] = t.TopicID
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}

	const maxAttempts = 3
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if err := t.waitTurn(ctx); err != nil {
			return err
		}

		status, responseBody, err := t.post(ctx, raw)
		if err != nil {
			return err
		}
		if status == http.StatusTooManyRequests {
			wait := retryAfter(responseBody, 5*time.Second)
			lastErr = fmt.Errorf("telegram rate limited, retry after %s", wait)
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
			continue
		}
		if status >= 300 {
			return fmt.Errorf("telegram returned status %d", status)
		}
		return nil
	}
	return lastErr
}

func (t *Telegram) post(ctx context.Context, body []byte) (int, []byte, error) {
	endpoint := "https://api.telegram.org/bot" + t.Token + "/sendMessage"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := t.client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()

	buffer := make([]byte, 0, 1024)
	chunk := make([]byte, 1024)
	for {
		read, err := response.Body.Read(chunk)
		if read > 0 {
			buffer = append(buffer, chunk[:read]...)
		}
		if err != nil {
			break
		}
	}
	return response.StatusCode, buffer, nil
}

// waitTurn 用全局最小间隔把并发发送串开，避免触发限流。
func (t *Telegram) waitTurn(ctx context.Context) error {
	t.mu.Lock()
	now := time.Now()
	wait := t.lastSent.Add(t.minInterval).Sub(now)
	if wait < 0 {
		wait = 0
	}
	t.lastSent = now.Add(wait)
	t.mu.Unlock()

	if wait <= 0 {
		return nil
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func retryAfter(body []byte, fallback time.Duration) time.Duration {
	var payload struct {
		Parameters struct {
			RetryAfter int `json:"retry_after"`
		} `json:"parameters"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return fallback
	}
	if payload.Parameters.RetryAfter <= 0 {
		return fallback
	}
	wait := time.Duration(payload.Parameters.RetryAfter) * time.Second
	if wait > 30*time.Second {
		wait = 30 * time.Second
	}
	return wait
}
