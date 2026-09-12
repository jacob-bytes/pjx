import { useNavigate } from "react-router"
import { Bell, Broadcast, Gear, Moon, Plus, Sun, Waveform } from "@phosphor-icons/react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { StatusDot } from "@/components/status-dot"
import { fleet } from "@/lib/mock"
import { useTheme } from "@/lib/theme"

/** 设置子页。keywords 供搜索命中（面板按 value 做模糊匹配）。 */
const SETTINGS_PAGES = [
  {
    path: "/settings/access",
    label: "接入与令牌",
    hint: "接入",
    keywords: "token 令牌 安装 agent 接入",
  },
  {
    path: "/settings/notifications",
    label: "通知",
    hint: "通知",
    keywords: "telegram webhook 通知 渠道",
  },
  {
    path: "/settings/retention",
    label: "数据与保留",
    hint: "数据",
    keywords: "保留 数据 清理 压缩 存储",
  },
  {
    path: "/settings/general",
    label: "通用",
    hint: "通用",
    keywords: "站点 时区 主题 外观 语言",
  },
] as const

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { dark, setDark } = useTheme()

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索节点、页面或操作…" />
      <CommandList>
        <CommandEmpty>没有匹配结果</CommandEmpty>
        <CommandGroup heading="页面">
          <CommandItem onSelect={() => run(() => navigate("/"))}>
            <Waveform className="size-4 text-muted-foreground" />
            总览
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/probes"))}>
            <Broadcast className="size-4 text-muted-foreground" />
            探测
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/alerts"))}>
            <Bell className="size-4 text-muted-foreground" />
            告警
          </CommandItem>
        </CommandGroup>
        {/*
          「设置」原来只跳到 /settings（会重定向到数据与保留），
          四个子页在命令面板里一个都搜不到 —— 而它们才是后台真正要配的东西。
        */}
        <CommandGroup heading="设置">
          {SETTINGS_PAGES.map((page) => (
            <CommandItem
              key={page.path}
              value={`设置 ${page.label} ${page.keywords}`}
              onSelect={() => run(() => navigate(page.path))}
            >
              <Gear className="size-4 text-muted-foreground" />
              {page.label}
              <span className="ml-auto text-2xs text-subtle">{page.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="节点">
          {fleet.map((server) => (
            <CommandItem
              key={server.id}
              value={`${server.name} ${server.ip} ${server.tags.join(" ")}`}
              onSelect={() => run(() => navigate(`/?server=${server.id}`))}
            >
              <StatusDot status={server.status} />
              {server.name}
              <span className="num ml-auto text-xs text-subtle">{server.ip}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="操作">
          <CommandItem onSelect={() => run(() => navigate("/probes?new=1"))}>
            <Plus className="size-4 text-muted-foreground" />
            新建探测任务
          </CommandItem>
          <CommandItem onSelect={() => run(() => setDark(!dark))}>
            {dark ? (
              <Sun className="size-4 text-muted-foreground" />
            ) : (
              <Moon className="size-4 text-muted-foreground" />
            )}
            切换主题
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
