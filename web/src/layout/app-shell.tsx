import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router"
import { ArrowSquareOut, Bell, Broadcast, Gear, List, MagnifyingGlass, Waveform } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { CommandPalette } from "@/components/command-palette"
import { SettingsProvider } from "@/components/settings-provider"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { LiveStatus } from "@/components/live-status"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "总览", icon: Waveform, end: true },
  { to: "/probes", label: "探测", icon: Broadcast, end: false },
  { to: "/alerts", label: "告警", icon: Bell, end: false },
  { to: "/settings", label: "设置", icon: Gear, end: false },
]

const TITLES: Record<string, string> = {
  "": "总览",
  probes: "探测",
  alerts: "告警",
  settings: "设置",
}

/**
 * 侧边栏内容。桌面端固定在左侧，移动端放进抽屉复用同一份，
 * 避免两套导航漂移。
 */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {/*
        pr-12 是给移动端抽屉的关闭按钮留位的（SheetContent 把它放在右上角）；
        桌面 aside 没有这个按钮，pr-4 就够 —— 否则整个头部内容会被往左推 32px。
        原来这里还有一个 `ml-auto` 靠右的「管理」字样：菜单本身已经在后台里了，
        写「管理」既是重复，又因为 pr-12 被顶到中间，看着像一句错位的标签。已删。
      */}
      <div className="flex h-12 items-center gap-2 border-b px-4 pr-12 md:pr-4">
        <span className="grid size-5 place-items-center rounded-[5px] bg-foreground font-mono text-2xs font-semibold text-background">
          p
        </span>
        <span className="text-sm font-semibold tracking-tight">pjx</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground",
                isActive && "bg-accent font-medium text-foreground",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t p-2">
        <a
          href="/"
          onClick={onNavigate}
          className="mb-1 flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground"
        >
          <ArrowSquareOut className="size-4" />
          查看前台
        </a>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <span className="grid size-6 place-items-center rounded-full bg-muted text-2xs font-medium">
            JL
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs">admin</div>
            <div className="truncate text-2xs text-subtle">单机模式</div>
          </div>
        </div>
      </div>
    </>
  )
}

export function AppShell() {
  // 注意：这里不能订阅 useFleetTick()。订阅点放在真正需要每秒数据的地方
  // （LiveStatus / 各数据页），否则整个后台树每秒全量重渲染。
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // 路由变化后收起抽屉，避免导航完抽屉还盖在内容上。
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const section = location.pathname.split("/")[1] ?? ""

  return (
    /*
      配置的 Provider 挂在这一层：设置页在写它，总览（节点标签、维护模式）、
      探测（启停/删除）、告警（规则启停）也在写它 —— 必须是同一份。
    */
    <SettingsProvider>
      <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r bg-card md:flex">
        <SidebarNav />
      </aside>

      {/* 移动端导航：md 以下没有侧边栏，用抽屉补上 */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="flex w-[248px] flex-col gap-0 p-0 sm:max-w-[248px]"
        >
          <SheetTitle className="sr-only">导航</SheetTitle>
          <SidebarNav onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col md:pl-[216px]">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground md:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="打开导航"
          >
            <List className="size-4" />
          </Button>

          <h1 className="truncate text-sm font-semibold">
            {TITLES[section] ?? "总览"}
          </h1>

          <div className="ml-auto flex items-center gap-1.5">
            <LiveStatus />

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-2xs font-normal text-muted-foreground"
              onClick={() => setPaletteOpen(true)}
            >
              <MagnifyingGlass className="size-3.5" />
              <span className="hidden sm:inline">搜索</span>
              <kbd className="num hidden rounded-[4px] border bg-muted px-1 text-2xs sm:inline">
                ⌘K
              </kbd>
            </Button>

            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 pb-16 pt-4">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </SettingsProvider>
  )
}
