package master

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// staticHandler 负责两套 SPA 与静态资源：
//   - /admin/* 无扩展名 -> admin/index.html（后台深链兜底）
//   - 其他无扩展名路径   -> index.html（公网页）
//   - 带扩展名的路径     -> 直接读文件
//
// Go master 必须复刻 Vite 插件 pjx:admin-spa-fallback 的规则，
// 否则后台子页面 F5 会掉到公网页。
type staticHandler struct {
	webDir string
	log    *slog.Logger
}

func newStaticHandler(webDir string, log *slog.Logger) http.Handler {
	if _, err := os.Stat(filepath.Join(webDir, "index.html")); err != nil {
		log.Warn("web dir missing, serving placeholder", "dir", webDir, "err", err)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(placeholderHTML))
		})
	}
	return &staticHandler{webDir: webDir, log: log}
}

const placeholderHTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>pjx</title></head>
<body style="font-family:system-ui;padding:40px;line-height:1.6">
<h1>pjx master 已启动</h1>
<p>还没有找到前端产物。先在 web/ 下执行：</p>
<pre>npm install &amp;&amp; npm run build</pre>
<p>然后带上 --web-dir 指向 web/dist。</p>
</body>
</html>`

func (h *staticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	urlPath := r.URL.Path
	if strings.HasPrefix(urlPath, "/admin") {
		h.serveSPA(w, r, urlPath, "/admin/index.html")
		return
	}
	h.serveSPA(w, r, urlPath, "/index.html")
}

func (h *staticHandler) serveSPA(w http.ResponseWriter, r *http.Request, urlPath, fallback string) {
	if isAsset(urlPath) {
		h.serveFile(w, r, urlPath)
		return
	}
	h.serveFile(w, r, fallback)
}

func (h *staticHandler) serveFile(w http.ResponseWriter, r *http.Request, urlPath string) {
	if strings.Contains(urlPath, "..") {
		http.NotFound(w, r)
		return
	}
	file := filepath.Join(h.webDir, filepath.FromSlash(strings.TrimPrefix(urlPath, "/")))
	if _, err := os.Stat(file); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, file)
}

func isAsset(urlPath string) bool {
	base := urlPath[strings.LastIndex(urlPath, "/")+1:]
	return strings.Contains(base, ".")
}
