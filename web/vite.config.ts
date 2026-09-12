import { fileURLToPath, URL } from "node:url"
import type { Connect, Plugin } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * 两个入口共用一套 SPA fallback 时，`/admin/probes` 这类深链会被兜到根
 * index.html —— 也就是前台状态页，带 `basename="/admin"` 的后台路由根本没机会跑。
 *
 * 后果：在后台任意子页面按 F5 会跳到公网状态页。开发与 preview 都要修。
 * 生产同样需要（Go master 的静态处理按同一规则兜底：/admin/* → /admin/index.html）。
 */
function adminSpaFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? ""
    const [pathname] = url.split("?")
    const isAsset = /\.[a-z0-9]+$/i.test(pathname)
    if (pathname.startsWith("/admin/") && !isAsset) {
      req.url = "/admin/index.html" + url.slice(pathname.length)
    }
    next()
  }

  return {
    name: "pjx:admin-spa-fallback",
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), adminSpaFallback()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5273,
  },
  build: {
    rollupOptions: {
      input: {
        public: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin/index.html", import.meta.url)),
      },
    },
  },
})
