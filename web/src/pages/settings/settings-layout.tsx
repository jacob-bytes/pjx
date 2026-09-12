import { NavLink, Outlet } from "react-router"
import { cn } from "@/lib/utils"

const ITEMS = [
  { to: "access", label: "接入与令牌" },
  { to: "notifications", label: "通知" },
  { to: "retention", label: "数据与保留" },
  { to: "general", label: "通用" },
]

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="flex shrink-0 flex-row flex-wrap gap-0.5 md:w-[168px] md:flex-col">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex h-8 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground",
                isActive && "bg-accent font-medium text-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 max-w-[720px] flex-1">
        <Outlet />
      </div>
    </div>
  )
}
