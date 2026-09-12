import "@fontsource-variable/inter/wght.css"
import "@/styles/globals.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { IconContext } from "@phosphor-icons/react"
import { PublicApp } from "@/public/app"
import { applyStoredColorBlindMode } from "@/lib/a11y"
import { applyStoredTheme } from "@/lib/theme"

applyStoredTheme()
applyStoredColorBlindMode()

// 状态页没有路由：不引入 react-router（首屏 −13KB gzip）。
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* 全局 light 笔画：比 regular 柔和，且免去逐个传 weight */}
    <IconContext.Provider value={{ weight: "light" }}>
      <PublicApp />
    </IconContext.Provider>
  </StrictMode>,
)
