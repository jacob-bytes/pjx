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
  const rewrite: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ""
    const [pathname] = url.split("?")
    // 带 query 的剩余部分（"" 或 "?..."），重定向与重写都要原样带走
    const rest = url.slice(pathname.length)

    /*
      `/admin`（**没有尾斜杠**）不在下面的 startsWith("/admin/") 里，会掉进 vite 的
      SPA fallback，返回根 index.html —— 也就是**前台状态页**。
      用户在地址栏敲 /admin、或点一个没带斜杠的书签，看到的就是公网页面
      （实测 dev 与 preview 都能复现，`/admin/` 与 `/admin/probes` 则正常）。
      目录索引的正确形态本就带斜杠，所以这里补一个 301（静态托管也是这么做的）。
    */
    if (pathname === "/admin") {
      res.statusCode = 301
      res.setHeader("Location", `/admin/${rest}`)
      res.end()
      return
    }

    const isAsset = /\.[a-z0-9]+$/i.test(pathname)
    if (pathname.startsWith("/admin/") && !isAsset) {
      req.url = "/admin/index.html" + rest
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
