package store

import (
	"context"
	"encoding/json"
)

// UpdateAgent 修改节点别名、公开状态与标签。
func (s *Store) UpdateAgent(ctx context.Context, id, alias string, public bool, tags []string) error {
	rawTags, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
UPDATE agents SET alias = ?, public = ?, tags = ? WHERE id = ?`,
		alias, boolInt(public), string(rawTags), id)
	return err
}

// DeleteAgent 删除节点及其指标与任务结果。
func (s *Store) DeleteAgent(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	for _, statement := range []string{
		`DELETE FROM metric_1m WHERE agent_id = ?`,
		`DELETE FROM metric_1h WHERE agent_id = ?`,
		`DELETE FROM task_results WHERE agent_id = ?`,
		`DELETE FROM agents WHERE id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, statement, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
