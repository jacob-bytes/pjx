package store

import (
	"context"
	"database/sql"
	"time"
)

// AgentToken 是 agent 接入令牌的元信息（明文只返回一次，库里只有哈希）。
type AgentToken struct {
	ID         string
	Name       string
	CreatedAt  time.Time
	LastUsedAt time.Time
	Revoked    bool
}

// CreateAgentToken 写入一个新令牌（哈希由调用方生成）。
func (s *Store) CreateAgentToken(ctx context.Context, id, name, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO agent_tokens (id, name, token_hash, created_at)
VALUES (?, ?, ?, ?)`, id, name, tokenHash, time.Now().Unix())
	return err
}

// FindAgentTokenByHash 按哈希查未撤销的令牌。
func (s *Store) FindAgentTokenByHash(ctx context.Context, tokenHash string) (AgentToken, bool, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT id, name, created_at, last_used_at, revoked
FROM agent_tokens WHERE token_hash = ?`, tokenHash)

	var (
		token      AgentToken
		createdAt  int64
		lastUsedAt int64
		revoked    int
	)
	err := row.Scan(&token.ID, &token.Name, &createdAt, &lastUsedAt, &revoked)
	if err == sql.ErrNoRows {
		return AgentToken{}, false, nil
	}
	if err != nil {
		return AgentToken{}, false, err
	}
	token.CreatedAt = time.Unix(createdAt, 0)
	if lastUsedAt > 0 {
		token.LastUsedAt = time.Unix(lastUsedAt, 0)
	}
	token.Revoked = revoked != 0
	if token.Revoked {
		return AgentToken{}, false, nil
	}
	return token, true, nil
}

// ListAgentTokens 返回全部令牌元信息。
func (s *Store) ListAgentTokens(ctx context.Context) ([]AgentToken, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, name, created_at, last_used_at, revoked
FROM agent_tokens ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []AgentToken
	for rows.Next() {
		var (
			token      AgentToken
			createdAt  int64
			lastUsedAt int64
			revoked    int
		)
		if err := rows.Scan(&token.ID, &token.Name, &createdAt, &lastUsedAt, &revoked); err != nil {
			return nil, err
		}
		token.CreatedAt = time.Unix(createdAt, 0)
		if lastUsedAt > 0 {
			token.LastUsedAt = time.Unix(lastUsedAt, 0)
		}
		token.Revoked = revoked != 0
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}

// TouchAgentToken 更新最后使用时间。
func (s *Store) TouchAgentToken(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE agent_tokens SET last_used_at = ? WHERE id = ?`, time.Now().Unix(), id)
	return err
}

// RevokeAgentToken 撤销令牌（保留记录）。
func (s *Store) RevokeAgentToken(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE agent_tokens SET revoked = 1 WHERE id = ?`, id)
	return err
}

// CountActiveAgentTokens 返回未撤销令牌数量，用于判断是否处于开发放行模式。
func (s *Store) CountActiveAgentTokens(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_tokens WHERE revoked = 0`).Scan(&count)
	return count, err
}

// CountAgentTokens 返回令牌总数（含已撤销），用于判断是否曾经启用过令牌。
func (s *Store) CountAgentTokens(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_tokens`).Scan(&count)
	return count, err
}
