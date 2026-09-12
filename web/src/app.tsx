import { Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/layout/app-shell"
import { OverviewPage } from "@/pages/overview"
import { ProbesPage } from "@/pages/probes"
import { AlertsPage } from "@/pages/alerts"
import { SettingsLayout } from "@/pages/settings/settings-layout"
import { AccessPage } from "@/pages/settings/access"
import { NotificationsPage } from "@/pages/settings/notifications"
import { RetentionPage } from "@/pages/settings/retention"
import { GeneralPage } from "@/pages/settings/general"

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="probes" element={<ProbesPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="retention" replace />} />
          <Route path="access" element={<AccessPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="retention" element={<RetentionPage />} />
          <Route path="general" element={<GeneralPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
