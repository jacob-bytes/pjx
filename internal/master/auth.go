package master

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jacob-bytes/pjx/internal/authn"
	"github.com/jacob-bytes/pjx/internal/store"
)

const sessionCookie = "pjx_session"

// Auth 负责后台口令校验与签名 session。
//
// 密码优先用 settings.admin_password_hash（Argon2id）；
// 若库里还没有哈希，则允许用配置里的明文作为一次性引导，成功后自动写入哈希。
type Auth struct {
	db        *store.Store
	secret    []byte
	bootstrap string
	log       *slog.Logger
	limiter   *loginLimiter
}

// NewAuth 构造 Auth。
func NewAuth(db *store.Store, secret, bootstrap string, log *slog.Logger) *Auth {
	return &Auth{
		db:        db,
		secret:    []byte(secret),
		bootstrap: bootstrap,
		log:       log,
		limiter:   newLoginLimiter(),
	}
}

// LoginHandler 处理 POST /api/admin/login。
func (a *Auth) LoginHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if a.limiter.allow(ip) == false {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try later"})
			return
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}

		ok, err := a.verifyPassword(r.Context(), body.Password)
		if err != nil {
			a.log.Warn("verify admin password", "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		if ok == false {
			a.limiter.fail(ip)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid password"})
			return
		}

		a.limiter.reset(ip)
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookie,
			Value:    a.issue(),
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   int((7 * 24 * time.Hour).Seconds()),
		})
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ChangePasswordHandler 处理 POST /api/admin/password。
func (a *Auth) ChangePasswordHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.validRequest(r) == false {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		var body struct {
			OldPassword string `json:"old_password"`
			NewPassword string `json:"new_password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if len(body.NewPassword) < 8 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "new password must be at least 8 characters"})
			return
		}

		ok, err := a.verifyPassword(r.Context(), body.OldPassword)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		if ok == false {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "old password is incorrect"})
			return
		}

		encoded, err := authn.HashPassword(body.NewPassword)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		if err := a.db.SetSetting(r.Context(), "admin_password_hash", encoded); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (a *Auth) verifyPassword(ctx context.Context, password string) (bool, error) {
	hash, err := a.db.GetSetting(ctx, "admin_password_hash")
	if err != nil {
		return false, err
	}
	if hash != "" {
		return authn.VerifyPassword(password, hash)
	}
	if a.bootstrap == "" {
		return false, nil
	}
	if subtle.ConstantTimeCompare([]byte(password), []byte(a.bootstrap)) != 1 {
		return false, nil
	}
	encoded, err := authn.HashPassword(password)
	if err != nil {
		return false, err
	}
	if err := a.db.SetSetting(ctx, "admin_password_hash", encoded); err != nil {
		a.log.Warn("store bootstrap password hash", "err", err)
	}
	return true, nil
}

// LogoutHandler 处理 POST /api/admin/logout。
func (a *Auth) LogoutHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookie,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
		})
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// SessionHandler 处理 GET /api/admin/session，供前端判断登录态。
func (a *Auth) SessionHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.validRequest(r) == false {
			writeJSON(w, http.StatusUnauthorized, map[string]bool{"authenticated": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
	}
}

// Require 是后台接口的鉴权中间件。
func (a *Auth) Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.validRequest(r) == false {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func (a *Auth) validRequest(r *http.Request) bool {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	return a.valid(cookie.Value)
}

func (a *Auth) issue() string {
	expires := time.Now().Add(7 * 24 * time.Hour).Unix()
	payload := "admin:" + strconv.FormatInt(expires, 10)
	return encode(payload) + "." + encode(string(a.sign(payload)))
}

func (a *Auth) valid(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return false
	}
	payload, err := decode(parts[0])
	if err != nil {
		return false
	}
	signature, err := decode(parts[1])
	if err != nil {
		return false
	}
	if hmac.Equal([]byte(signature), a.sign(payload)) == false {
		return false
	}
	values := strings.Split(payload, ":")
	if len(values) != 2 {
		return false
	}
	expires, err := strconv.ParseInt(values[1], 10, 64)
	if err != nil {
		return false
	}
	return time.Now().Unix() < expires
}

func (a *Auth) sign(payload string) []byte {
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func encode(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decode(value string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]*loginAttempt
}

type loginAttempt struct {
	count int
	until time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{attempts: make(map[string]*loginAttempt)}
}

func (l *loginLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	attempt, ok := l.attempts[key]
	if ok == false {
		return true
	}
	if time.Now().After(attempt.until) {
		delete(l.attempts, key)
		return true
	}
	return attempt.count < 5
}

func (l *loginLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	attempt, ok := l.attempts[key]
	if ok == false || time.Now().After(attempt.until) {
		attempt = &loginAttempt{}
		l.attempts[key] = attempt
	}
	attempt.count++
	if attempt.count >= 5 {
		attempt.until = time.Now().Add(5 * time.Minute)
	}
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
