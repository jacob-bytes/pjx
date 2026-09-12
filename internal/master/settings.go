package master

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jacob-bytes/pjx/internal/alerts"
	"github.com/jacob-bytes/pjx/internal/authn"
	"github.com/jacob-bytes/pjx/internal/config"
	"github.com/jacob-bytes/pjx/internal/notify"
)

// loadStoredSettings 用 settings 表覆盖可持久化的配置（保留期、通知）。
func (s *Server) loadStoredSettings(ctx context.Context) {
	if raw, err := s.store.GetSetting(ctx, "retention"); err == nil && raw != "" {
		var stored config.Retention
		if err := json.Unmarshal([]byte(raw), &stored); err == nil {
			if stored.MemoryKeep != "" {
				s.cfg.Retention.MemoryKeep = stored.MemoryKeep
			}
			if stored.OneMinKeep != "" {
				s.cfg.Retention.OneMinKeep = stored.OneMinKeep
			}
			if stored.OneHourKeep != "" {
				s.cfg.Retention.OneHourKeep = stored.OneHourKeep
			}
			if stored.TaskKeep != "" {
				s.cfg.Retention.TaskKeep = stored.TaskKeep
			}
			if stored.AlertKeep != "" {
				s.cfg.Retention.AlertKeep = stored.AlertKeep
			}
			s.cfg.Retention.RawEnabled = stored.RawEnabled
			if stored.RawKeep != "" {
				s.cfg.Retention.RawKeep = stored.RawKeep
			}
		}
	}
	if raw, err := s.store.GetSetting(ctx, "telegram"); err == nil && raw != "" {
		var stored config.Telegram
		if err := json.Unmarshal([]byte(raw), &stored); err == nil {
			s.cfg.Telegram = stored
		}
	}
}

// loadOrCreateSessionSecret 读取或生成持久化 session secret。
func (s *Server) loadOrCreateSessionSecret(ctx context.Context) string {
	if raw, err := s.store.GetSetting(ctx, "session_secret"); err == nil && raw != "" {
		return raw
	}
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		s.log.Warn("generate session secret", "err", err)
		return "pjx-fallback-secret"
	}
	secret := base64.RawURLEncoding.EncodeToString(buffer)
	if err := s.store.SetSetting(ctx, "session_secret", secret); err != nil {
		s.log.Warn("store session secret", "err", err)
	}
	return secret
}

// buildNotifier 按当前配置构造通知渠道；未启用时返回 nil。
func (s *Server) buildNotifier() alerts.Notifier {
	if s.cfg.Telegram.Enabled && s.cfg.Telegram.Token != "" {
		return notify.NewTelegram(s.cfg.Telegram.Token, s.cfg.Telegram.ChatID, s.cfg.Telegram.TopicID)
	}
	return nil
}

// handleAdminTokens 支持 GET（列表）与 POST（新建，明文只返回一次）。
func (s *Server) handleAdminTokens(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tokens, err := s.store.ListAgentTokens(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tokens": tokens})
	case http.MethodPost:
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			name = "agent token"
		}
		plain, hash, err := authn.GenerateToken()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		id, err := authn.NewID("tok_")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if err := s.store.CreateAgentToken(r.Context(), id, name, hash); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"id":    id,
			"name":  name,
			"token": plain,
		})
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminTokenByID 撤销令牌。
func (s *Server) handleAdminTokenByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/admin/tokens/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	if err := s.store.RevokeAgentToken(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleAdminSettings 读取 / 更新可持久化设置。
func (s *Server) handleAdminSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		hash, _ := s.store.GetSetting(r.Context(), "admin_password_hash")
		siteRaw, _ := s.store.GetSetting(r.Context(), "site")
		var site any
		if siteRaw != "" {
			_ = json.Unmarshal([]byte(siteRaw), &site)
		}
		telegram := s.cfg.Telegram
		if telegram.Token != "" {
			telegram.Token = maskSecret(telegram.Token)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"site":               site,
			"retention":          s.cfg.Retention,
			"telegram":           telegram,
			"admin_password_set": hash != "",
		})
	case http.MethodPut:
		var body struct {
			Retention *config.Retention `json:"retention"`
			Telegram  *config.Telegram  `json:"telegram"`
			Site      json.RawMessage   `json:"site"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}

		restartRequired := false
		if body.Retention != nil {
			for name, value := range map[string]string{
				"memory_keep":   body.Retention.MemoryKeep,
				"raw_keep":      body.Retention.RawKeep,
				"one_min_keep":  body.Retention.OneMinKeep,
				"one_hour_keep": body.Retention.OneHourKeep,
				"task_keep":     body.Retention.TaskKeep,
				"alert_keep":    body.Retention.AlertKeep,
			} {
				if config.ValidDuration(value) == false {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": name + " is not a valid duration"})
					return
				}
			}
			raw, err := json.Marshal(body.Retention)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			if err := s.store.SetSetting(r.Context(), "retention", string(raw)); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			s.cfg.Retention = *body.Retention
			restartRequired = true
		}

		if body.Telegram != nil {
			if body.Telegram.Token == "" {
				body.Telegram.Token = s.cfg.Telegram.Token
			}
			raw, err := json.Marshal(body.Telegram)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			if err := s.store.SetSetting(r.Context(), "telegram", string(raw)); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			s.cfg.Telegram = *body.Telegram
			s.alerts.SetNotifier(s.buildNotifier())
		}

		if len(body.Site) > 0 {
			if err := s.store.SetSetting(r.Context(), "site", string(body.Site)); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status":           "ok",
			"restart_required": restartRequired,
		})
	default:
		w.Header().Set("Allow", "GET, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func maskSecret(value string) string {
	if len(value) <= 4 {
		return "••••"
	}
	return "••••" + value[len(value)-4:]
}
