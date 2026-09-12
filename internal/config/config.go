// Package config 负责加载 master / agent 的配置。
//
// 优先级：默认值 < YAML 文件 < 环境变量（PJX_ 前缀）。
package config

import "fmt"
import "os"
import "strconv"
import "strings"
import "time"

import "gopkg.in/yaml.v3"

// Retention 是数据分层保留策略，对应后台「数据与保留」页。
type Retention struct {
	RawEnabled  bool   `yaml:"raw_enabled" json:"raw_enabled"`
	RawKeep     string `yaml:"raw_keep" json:"raw_keep"`
	MemoryKeep  string `yaml:"memory_keep" json:"memory_keep"`
	OneMinKeep  string `yaml:"one_min_keep" json:"one_min_keep"`
	OneHourKeep string `yaml:"one_hour_keep" json:"one_hour_keep"`
	TaskKeep    string `yaml:"task_keep" json:"task_keep"`
	AlertKeep   string `yaml:"alert_keep" json:"alert_keep"`
}

// Telegram 是 v1 唯一实装的通知渠道。
type Telegram struct {
	Enabled bool   `yaml:"enabled" json:"enabled"`
	Token   string `yaml:"token" json:"token"`
	ChatID  string `yaml:"chat_id" json:"chat_id"`
	TopicID string `yaml:"topic_id" json:"topic_id"`
}

// Config 是 master 的配置。
type Config struct {
	Listen        string    `yaml:"listen"`
	DataDir       string    `yaml:"data_dir"`
	WebDir        string    `yaml:"web_dir"`
	AgentTokens   []string  `yaml:"agent_tokens"`
	AdminPassword string    `yaml:"admin_password"`
	SessionSecret string    `yaml:"session_secret"`
	Retention     Retention `yaml:"retention"`
	Telegram      Telegram  `yaml:"telegram"`
}

// Default 返回一份可直接启动的默认配置。
func Default() *Config {
	return &Config{
		Listen:  "127.0.0.1:8080",
		DataDir: "./data",
		WebDir:  "./web/dist",
		Retention: Retention{
			RawEnabled:  false,
			RawKeep:     "24h",
			MemoryKeep:  "1h",
			OneMinKeep:  "14d",
			OneHourKeep: "365d",
			TaskKeep:    "30d",
			AlertKeep:   "90d",
		},
	}
}

// Load 读取 YAML 并叠加环境变量。path 为空时只用默认值。
func Load(path string) (*Config, error) {
	cfg := Default()
	if path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read config %s: %w", path, err)
		}
		if err := yaml.Unmarshal(raw, cfg); err != nil {
			return nil, fmt.Errorf("parse config %s: %w", path, err)
		}
	}
	applyEnv(cfg)
	return cfg, nil
}

func applyEnv(cfg *Config) {
	setString("PJX_LISTEN", &cfg.Listen)
	setString("PJX_DATA_DIR", &cfg.DataDir)
	setString("PJX_WEB_DIR", &cfg.WebDir)
	setString("PJX_ADMIN_PASSWORD", &cfg.AdminPassword)
	setString("PJX_SESSION_SECRET", &cfg.SessionSecret)
	setString("PJX_TELEGRAM_TOKEN", &cfg.Telegram.Token)
	setString("PJX_TELEGRAM_CHAT_ID", &cfg.Telegram.ChatID)

	if raw := os.Getenv("PJX_AGENT_TOKENS"); raw != "" {
		cfg.AgentTokens = cfg.AgentTokens[:0]
		for _, part := range strings.Split(raw, ",") {
			if token := strings.TrimSpace(part); token != "" {
				cfg.AgentTokens = append(cfg.AgentTokens, token)
			}
		}
	}
	if raw := os.Getenv("PJX_TELEGRAM_ENABLED"); raw != "" {
		if value, err := strconv.ParseBool(raw); err == nil {
			cfg.Telegram.Enabled = value
		}
	}
}

func setString(key string, target *string) {
	if value := os.Getenv(key); value != "" {
		*target = value
	}
}

// DBPath 是 SQLite 文件路径。
func (c *Config) DBPath() string {
	return c.DataDir + "/pjx.db"
}

// ParseDuration 支持配置里常见的 14d / 365d 写法；解析失败时返回 fallback。
func ParseDuration(value string, fallback time.Duration) time.Duration {
	text := strings.TrimSpace(value)
	if text == "" {
		return fallback
	}
	if strings.HasSuffix(text, "d") {
		days, err := strconv.ParseFloat(strings.TrimSuffix(text, "d"), 64)
		if err != nil {
			return fallback
		}
		return time.Duration(days * 24 * float64(time.Hour))
	}
	duration, err := time.ParseDuration(text)
	if err != nil {
		return fallback
	}
	return duration
}

// ValidDuration 校验 14d / 365d / 24h 这类保留期写法。
func ValidDuration(value string) bool {
	text := strings.TrimSpace(value)
	if text == "" {
		return false
	}
	if strings.HasSuffix(text, "d") {
		_, err := strconv.ParseFloat(strings.TrimSuffix(text, "d"), 64)
		return err == nil
	}
	_, err := time.ParseDuration(text)
	return err == nil
}
