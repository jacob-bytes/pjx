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
          <CommandItem onSelect={() => run(() => navigate("/settings"))}>
            <Gear className="size-4 text-muted-foreground" />
            设置
          </CommandItem>
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
