// Package store 封装 SQLite 持久化。
//
// 设计：
//   - WAL + synchronous=NORMAL + busy_timeout：单机 200 agent 足够
//   - 指标用窄表（一行一个 metric），新增指标不需要迁移
//   - 原始秒级数据只在内存，落盘的是 1m / 1h 聚合（见 internal/metrics）
package store

import "context"
import "database/sql"
import "encoding/json"
import "fmt"
import "time"

import _ "modernc.org/sqlite"

// migrations 顺序执行，索引即 PRAGMA user_version。
var migrations = []string{
	`CREATE TABLE IF NOT EXISTS agents (
id           TEXT PRIMARY KEY,
name         TEXT NOT NULL DEFAULT '',
alias        TEXT NOT NULL DEFAULT '',
public       INTEGER NOT NULL DEFAULT 1,
created_at   INTEGER NOT NULL,
last_seen_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
key   TEXT PRIMARY KEY,
value TEXT NOT NULL
);`,

	`DROP TABLE IF EXISTS metric_1m;
 DROP TABLE IF EXISTS metric_1h;
 CREATE TABLE metric_1m (
agent_id TEXT NOT NULL,
metric   TEXT NOT NULL,
ts       INTEGER NOT NULL,
avg      REAL NOT NULL DEFAULT 0,
min      REAL NOT NULL DEFAULT 0,
max      REAL NOT NULL DEFAULT 0,
count    INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (agent_id, metric, ts)
 );
 CREATE INDEX IF NOT EXISTS idx_metric_1m_ts ON metric_1m (ts);
 CREATE TABLE metric_1h (
agent_id TEXT NOT NULL,
metric   TEXT NOT NULL,
ts       INTEGER NOT NULL,
avg      REAL NOT NULL DEFAULT 0,
min      REAL NOT NULL DEFAULT 0,
max      REAL NOT NULL DEFAULT 0,
count    INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (agent_id, metric, ts)
 );
 CREATE INDEX IF NOT EXISTS idx_metric_1h_ts ON metric_1h (ts);`,

	`ALTER TABLE agents ADD COLUMN tags TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, interval INTEGER NOT NULL DEFAULT 60, timeout_ms INTEGER NOT NULL DEFAULT 5000, retries INTEGER NOT NULL DEFAULT 0, scope_type TEXT NOT NULL DEFAULT 'all', scope_value TEXT NOT NULL DEFAULT '', on_offline TEXT NOT NULL DEFAULT 'skip', enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS task_results (run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL, latency_ms REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_task_results_task_ts ON task_results (task_id, ts);
CREATE INDEX IF NOT EXISTS idx_task_results_agent_ts ON task_results (agent_id, ts);`,

	`CREATE TABLE IF NOT EXISTS alert_rules (
id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, metric TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT 'gt', threshold REAL NOT NULL DEFAULT 0, for_seconds INTEGER NOT NULL DEFAULT 60, severity TEXT NOT NULL DEFAULT 'warn', cooldown_seconds INTEGER NOT NULL DEFAULT 600, target TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL DEFAULT 'telegram', enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alert_events (
id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, target TEXT NOT NULL, severity TEXT NOT NULL, state TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, resolved_at INTEGER NOT NULL DEFAULT 0, notified_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_alert_events_state ON alert_events (state, updated_at);
CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON alert_events (rule_id, target);`,

	`CREATE TABLE IF NOT EXISTS agent_tokens (
id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens (token_hash);`,
}

// Agent 是节点元信息。
type Agent struct {
	ID         string
	Name       string
	Alias      string
	Tags       []string
	Public     bool
	LastSeenAt time.Time
}

// Store 是 SQLite 句柄。
type Store struct {
	db *sql.DB
}

// Open 打开数据库、执行迁移。
func Open(path string) (*Store, error) {
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=busy_timeout(5000)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=auto_vacuum(INCREMENTAL)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	instance := &Store{db: db}
	if err := instance.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return instance, nil
}

// Close 关闭数据库。
func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	var version int
	if err := s.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	for index := version; index < len(migrations); index++ {
		if _, err := s.db.ExecContext(ctx, migrations[index]); err != nil {
			return fmt.Errorf("migration %d: %w", index+1, err)
		}
		statement := fmt.Sprintf("PRAGMA user_version = %d", index+1)
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("set user_version %d: %w", index+1, err)
		}
	}
	return nil
}

// EnsureAgent 在 agent 首次 hello 时登记或更新节点。
func (s *Store) EnsureAgent(ctx context.Context, id, name string, public bool, tags []string) error {
	now := time.Now().Unix()
	rawTags, err := json.Marshal(tags)
	if err != nil {
		rawTags = []byte("[]")
	}
	_, err = s.db.ExecContext(ctx, `
INSERT INTO agents (id, name, public, tags, created_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
name = excluded.name,
tags = excluded.tags,
last_seen_at = excluded.last_seen_at`,
		id, name, boolInt(public), string(rawTags), now, now)
	return err
}

// TouchAgent 更新最后上报时间。
func (s *Store) TouchAgent(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE agents SET last_seen_at = ? WHERE id = ?`, time.Now().Unix(), id)
	return err
}

// ListAgents 按创建时间返回全部节点。
func (s *Store) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, name, alias, public, tags, last_seen_at FROM agents ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var item Agent
		var public int
		var lastSeenAt int64
		var tags string
		if err := rows.Scan(&item.ID, &item.Name, &item.Alias, &public, &tags, &lastSeenAt); err != nil {
			return nil, err
		}
		item.Public = public != 0
		item.LastSeenAt = time.Unix(lastSeenAt, 0)
		if len(tags) > 0 {
			_ = json.Unmarshal([]byte(tags), &item.Tags)
		}
		agents = append(agents, item)
	}
	return agents, rows.Err()
}

// GetSetting 读取一个设置项。
func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetSetting 写入一个设置项。
func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO settings (key, value) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
