package master

import (
	"bytes"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// staticHandler 负责两套 SPA 与静态资源：
//   - /admin/* 无扩展名 -> admin/index.html（后台深链兜底）
//   - 其他无扩展名路径   -> index.html（公网页）
//   - 带扩展名的路径     -> 直接读文件
//
// 资源来源优先级：磁盘目录（开发）> 嵌入产物（embedweb 构建）> 占位页。
type staticHandler struct {
	webDir string
	assets fs.FS
	log    *slog.Logger
}

func newStaticHandler(webDir string, assets fs.FS, log *slog.Logger) http.Handler {
	if _, err := os.Stat(filepath.Join(webDir, "index.html")); err == nil {
		return &staticHandler{webDir: webDir, log: log}
	}
	if assets != nil {
		if _, err := fs.Stat(assets, "index.html"); err == nil {
			log.Info("serving embedded frontend assets")
			return &staticHandler{assets: assets, log: log}
		}
	}
	log.Warn("no frontend assets, serving placeholder", "web_dir", webDir)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(placeholderHTML))
	})
}

const placeholderHTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>pjx</title></head>
<body style="font-family:system-ui;padding:40px;line-height:1.6">
<h1>pjx master 已启动</h1>
<p>还没有找到前端产物。先在 web/ 下执行：</p>
<pre>npm install &amp;&amp; npm run build</pre>
<p>然后带上 --web-dir 指向 web/dist，或用 -tags embedweb 编译单二进制。</p>
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
		h.serve(w, r, urlPath)
		return
	}
	h.serve(w, r, fallback)
}

func (h *staticHandler) serve(w http.ResponseWriter, r *http.Request, urlPath string) {
	if strings.Contains(urlPath, "..") {
		http.NotFound(w, r)
		return
	}
	if h.assets != nil {
		h.serveEmbedded(w, r, urlPath)
		return
	}
	h.serveDisk(w, r, urlPath)
}

func (h *staticHandler) serveEmbedded(w http.ResponseWriter, r *http.Request, urlPath string) {
	name := strings.TrimPrefix(urlPath, "/")
	data, err := fs.ReadFile(h.assets, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, filepath.Base(name), time.Time{}, bytes.NewReader(data))
}

func (h *staticHandler) serveDisk(w http.ResponseWriter, r *http.Request, urlPath string) {
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
