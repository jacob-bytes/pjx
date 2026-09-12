import "@fontsource-variable/inter/wght.css"
import "@/styles/globals.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { IconContext } from "@phosphor-icons/react"
import { App } from "@/app"
import { applyStoredColorBlindMode } from "@/lib/a11y"
import { applyStoredTheme } from "@/lib/theme"

applyStoredTheme()
applyStoredColorBlindMode()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <IconContext.Provider value={{ weight: "light" }}>
        <App />
      </IconContext.Provider>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  </StrictMode>,
)
