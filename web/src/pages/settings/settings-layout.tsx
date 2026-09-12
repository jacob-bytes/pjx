import { NavLink, Outlet } from "react-router"
import { cn } from "@/lib/utils"

const ITEMS = [
  { to: "access", label: "接入与令牌" },
  { to: "notifications", label: "通知" },
  { to: "retention", label: "数据与保留" },
  { to: "general", label: "通用" },
]

export function SettingsLayout() {
  // 配置的 Provider 挂在 AppShell 上（节点标签、探测/规则启停也要读写同一份）
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 flex-row flex-wrap gap-0.5 lg:w-[168px] lg:flex-col">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                // 与侧栏同一套选中态（底色 + 半粗 + 左侧指示条）、同一高度 h-9
                "relative flex h-9 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors dur-2 touch:h-11 hover:bg-muted hover:text-foreground",
                "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-transparent",
                isActive &&
                  "bg-accent font-semibold text-foreground before:bg-brand",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
