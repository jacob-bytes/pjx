import { useCallback, useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router"
import {
  ArrowSquareOut,
  Bell,
  Broadcast,
  CaretRight,
  Gear,
  List,
  MagnifyingGlass,
  SidebarSimple,
  Waveform,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { CommandPalette } from "@/components/command-palette"
import { SettingsProvider } from "@/components/settings-provider"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { LiveStatus } from "@/components/live-status"
import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { usePersistentState } from "@/lib/persist"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "总览", icon: Waveform, end: true, key: "" },
  { to: "/probes", label: "探测", icon: Broadcast, end: false, key: "probes" },
  { to: "/alerts", label: "告警", icon: Bell, end: false, key: "alerts" },
  { to: "/settings", label: "设置", icon: Gear, end: false, key: "settings" },
]

/** 侧栏展开 / 折叠（图标轨道）两种宽度 */
const SIDEBAR_W = 216
const RAIL_W = 72

/** 设置子页的标题，给面包屑用（与应用的路由一一对应） */
const SETTINGS_TITLE: Record<string, string> = {
  access: "接入与令牌",
  notifications: "通知",
  retention: "数据与保留",
  general: "通用",
}

/**
 * 面包屑。
 *
 * 原来顶栏只有一句 `<h1>总览</h1>` —— 到了设置子页就只剩「设置」，
 * 看不出自己在哪一页（子页的四项是在页面里另有一个横向导航）。
 * 现在渲染完整的路径：`设置 / 数据与保留`，最后一项是当前页。
 *
 * 页面标题仍保留一个 `sr-only` 的 h1 —— 视觉上由面包屑承担，
 * 但文档大纲与读屏不该因此少掉一级标题。
 */
function useCrumbs(pathname: string) {
  return (() => {
    const parts = pathname.split("/").filter(Boolean)
    if (parts.length === 0) return [{ label: "总览" }]
    if (parts[0] === "settings" && parts[1]) {
      return [
        { label: "设置", to: "/settings/retention" },
        { label: SETTINGS_TITLE[parts[1]] ?? parts[1] },
      ]
    }
    const item = NAV.find((nav) => nav.key === parts[0])
    return [{ label: item?.label ?? parts[0] }]
  })()
}

/**
 * 侧边栏内容。桌面端固定在左侧，移动端放进抽屉复用同一份，
 * 避免两套导航漂移。
 *
 * `onToggle` 只在桌面端传入：抽屉本身就是窄的，不需要再折叠，
 * 而且抽屉的关闭按钮已经占了右上角。
 */
function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  return (
    <>
      {/*
        pr-12 是给移动端抽屉的关闭按钮留位的（SheetContent 把它放在右上角）；
        桌面 aside 没有这个按钮，pr-4 就够 —— 否则整个头部内容会被往左推 32px。
        原来这里还有一个 `ml-auto` 靠右的「管理」字样：菜单本身已经在后台里了，
        写「管理」既是重复，又因为 pr-12 被顶到中间，看着像一句错位的标签。已删。
      */}
      <div
        className={cn(
          "flex h-12 items-center gap-2 border-b",
          collapsed ? "px-2" : "px-4 pr-12 md:pr-4",
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-xs bg-foreground font-mono text-2xs font-semibold text-background">
          p
        </span>
        <span className="truncate text-sm font-semibold tracking-tight">
          pjx
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            // 折叠时只剩图标，靠 title 补上名称（读屏仍读 sr-only 的文字）
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                /*
                  选中态原来只有 `bg-accent`，而 hover 是 `bg-muted` ——
                  两者只差 0.017 明度（约 1.05:1），**悬停和选中几乎同色**，
                  实际只靠 font-medium 撑着。现在选中态拿到三个通道：
                  底色（比 hover 重）+ 半粗 + 左侧 2px 品牌色指示条（位置通道）；
                  hover 保持轻一档，所以"悬停→选中"有明确的方向感。
                */
                "relative flex h-9 items-center gap-2.5 rounded-md text-sm text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground",
                "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-transparent",
                collapsed ? "justify-center px-0" : "px-2.5",
                isActive &&
                  "bg-accent font-semibold text-foreground before:bg-brand",
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            {collapsed ? (
              <span className="sr-only">{item.label}</span>
            ) : (
              item.label
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t p-2">
        <a
          href="/"
          onClick={onNavigate}
          title={collapsed ? "查看前台" : undefined}
          className={cn(
            "mb-1 flex h-9 items-center gap-2.5 rounded-md text-sm text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground",
            collapsed ? "justify-center px-0" : "px-2.5",
          )}
        >
          <ArrowSquareOut className="size-4 shrink-0" />
          {collapsed ? (
            <span className="sr-only">查看前台</span>
          ) : (
            "查看前台"
          )}
        </a>
        <div
          className={cn(
            "flex items-center gap-2 rounded-md py-1.5",
            collapsed ? "justify-center px-0" : "px-2",
          )}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-2xs font-medium">
            JL
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-xs">admin</div>
              <div className="truncate text-2xs text-subtle">单机模式</div>
            </div>
          )}
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
  // 折叠状态是纯本机 UI 偏好，写 localStorage（与主题、色觉模式同一约定）
  const [collapsed, setCollapsed] = usePersistentState(
    "pjx-sidebar-collapsed",
    false,
  )

  const toggleSidebar = useCallback(
    () => setCollapsed((value) => !value),
    [setCollapsed],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
      // ⌘B 折叠侧栏：与「折叠」按钮的 title 一致
      if (key === "b") {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggleSidebar])

  // 路由变化后收起抽屉，避免导航完抽屉还盖在内容上。
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const crumbs = useCrumbs(location.pathname)
  const current = crumbs[crumbs.length - 1]

  return (
    /*
      配置的 Provider 挂在这一层：设置页在写它，总览（节点标签、维护模式）、
      探测（启停/删除）、告警（规则启停）也在写它 —— 必须是同一份。
    */
    <SettingsProvider>
      {/* Radix Tooltip 的 Provider：全站共用同一份 delay 设置 */}
      <TooltipProvider>
      {/*
        §P7：外壳是**定高的 flex 列**（视口高、自己不滚），
        于是内容区能拿到确定的高度，表格区就能 `flex-1 min-h-0` 自己滚 ——
        不再需要 `max-h-[calc(100svh-Nrem)]` 那种按断点手调的魔法数。
      */}
      <div className="flex h-svh flex-col overflow-hidden">
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-card transition-[width] dur-3 md:flex"
          style={{ width: collapsed ? RAIL_W : SIDEBAR_W }}
        >
          <SidebarNav collapsed={collapsed} />
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

        {/*
          内容区在 md 以上要让开侧栏。侧栏是 `fixed`，所以这里用 padding-left；
          宽度是运行时可变的，走一个 CSS 变量而不是 Tailwind 的
          `md:pl-[216px]`（后者写死了两种宽度里的哪一种都不对）。
        */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col transition-[padding-left] dur-3 md:pl-[var(--sidebar-w)]"
          style={
            { "--sidebar-w": `${collapsed ? RAIL_W : SIDEBAR_W}px` } as React.CSSProperties
          }
        >
          {/*
            外壳已经不滚了，所以顶栏不需要 sticky/z-20 —— 它下面就是滚动区，
            不会再被内容盖住。
          */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground touch:size-11 md:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="打开导航"
            >
              <List className="size-4" />
            </Button>

            {/*
              折叠按钮 + `｜` + 面包屑（对齐参考图）。
              `SidebarSimple` 就是那个"▯｜"图标；分隔线是顶栏里的一个字面竖线，
              不是靠侧栏边框 —— 参考图里两者是同一个视觉组。
              移动端没有折叠概念（侧栏是抽屉），所以按钮与分隔线都只在 md 以上出现。
            */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
              title={collapsed ? "展开侧栏（⌘B）" : "折叠侧栏（⌘B）"}
              className="hidden size-8 shrink-0 text-muted-foreground touch:size-11 md:inline-flex"
            >
              <SidebarSimple className="size-4" />
            </Button>
            <span
              aria-hidden
              className="hidden h-4 w-px shrink-0 bg-border md:block"
            />

            <nav aria-label="面包屑" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => (
                  <li
                    key={`${crumb.label}-${index}`}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {index > 0 && (
                      <CaretRight
                        aria-hidden
                        className="size-3 shrink-0 text-subtle"
                      />
                    )}
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        className="truncate text-muted-foreground transition-colors dur-2 hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold text-foreground">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            {/* 视觉标题由面包屑承担，但文档大纲里仍要有一个 h1 */}
            <h1 className="sr-only">{current.label}</h1>

            <div className="ml-auto flex items-center gap-1.5">
              <LiveStatus />

              {/*
                原来是 variant="outline"：一圈实心边框 + 93px 宽，是顶栏里最重的元素 ——
                比侧栏的选中项还重，而它只是一个快捷入口。
                降到 ghost（无框，hover 才出底），与前台的图标按钮一致；
                ⌘K 那个 kbd 自带边框和底色，足够提示"这里可以按"。
              */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-2xs font-normal text-subtle touch:h-11 touch:min-w-11"
                onClick={() => setPaletteOpen(true)}
              >
                <MagnifyingGlass className="size-3.5" />
                <span className="hidden sm:inline">搜索</span>
                <kbd className="num hidden rounded-xs border bg-muted px-1 text-2xs sm:inline">
                  ⌘K
                </kbd>
              </Button>

              <ThemeToggle />
            </div>
          </header>

          {/*
            min-h-0 是关键：flex 子项默认 min-height:auto，不加它这一列会被
            内容顶开、滚动条跑到整页上，表格区也就没法自己滚了。
            设置页这类普通长页面由 main 自己滚；表格页把根节点设成
            `flex-1 min-h-0` 由表格区滚。
          */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-4">
            <Outlet />
          </main>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
      </TooltipProvider>
    </SettingsProvider>
  )
}
