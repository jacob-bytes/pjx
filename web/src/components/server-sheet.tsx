import { useState, type ReactNode } from "react"
import { ArrowSquareOut, Copy, DotsThree } from "@phosphor-icons/react"
import { toast } from "sonner"
import { NodeTagsDialog } from "@/components/node-tags-dialog"
import {
  nodeMaintenance,
  nodeTags,
  useNodeConfig,
  useSettings,
} from "@/components/settings-provider"
import { StatusDot } from "@/components/status-dot"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { alertEvents, fleet, type Server } from "@/lib/mock"
import { cn } from "@/lib/utils"

/**
 * 节点面板 = **配置 + 事件**。
 *
 * 改前它是四个指标块 + 四张时间序列图（CPU / 内存 / 网络吞吐 / 磁盘，
 * 7 条序列 + 3 条阈值线），也就是公网详情页第一屏的副本；
 * 而四个 tab 里有三个是空占位（历史 / 探测 / 事件）。
 *
 * 现在曲线交回前台（菜单里有「查看前台」），后台这一层只回答
 * 「这台机器的配置对不对、最近出过什么事」——宽度也跟着从 640 收到 520。
 */

function compareVersion(a: string, b: string) {
  const x = a.split(".").map(Number)
  const y = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 最新 agent 版本。「落后」要有参照物，所以从机队里取最大值。 */
const LATEST_AGENT = fleet.reduce(
  (latest, item) => (compareVersion(item.agent, latest) > 0 ? item.agent : latest),
  "0.0.0",
)

/** 面板内的分区。不用 `card`：这是面板里的嵌套块，同心圆角按 §P 用小一号的 rounded-md */
function Block({
  title,
  desc,
  action,
  children,
}: {
  title: string
  desc?: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-2xs font-medium text-muted-foreground">{title}</h4>
          {desc && <p className="mt-0.5 text-2xs text-subtle">{desc}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </section>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-2xs text-subtle">{label}</span>
      <span className="num min-w-0 truncate text-xs">{value}</span>
    </div>
  )
}

/**
 * 维护模式的开关。行内开关 = 改完立即生效（不需要再按"保存"）。
 * 单独抽出来是因为要调 `useNodeConfig` —— hook 不能写在 JSX 的表达式里。
 */
function MaintenanceSwitch({ server }: { server: Server }) {
  const { maintenance, setMaintenance } = useNodeConfig(server.id, {
    tags: server.tags,
  })
  return (
    <Switch
      checked={maintenance}
      onCheckedChange={(checked) => {
        setMaintenance(checked)
        toast(
          checked
            ? `「${server.name}」进入维护模式，告警已静音`
            : `「${server.name}」退出维护模式`,
        )
      }}
      aria-label={`维护模式 ${server.name}`}
    />
  )
}

export function ServerSheet({ server }: { server: Server }) {
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  const { settings } = useSettings()

  const tags = nodeTags(settings, server.id, server.tags)
  const maintenance = nodeMaintenance(settings, server.id)
  const offline = Boolean(server.offline)
  const events = alertEvents.filter((event) => event.object === server.name)

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(server.ip)
      setCopied(true)
      toast("已复制 IP 地址")
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast("复制失败，请手动选择")
    }
  }

  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
      <SheetHeader className="gap-0 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <StatusDot status={server.status} />
          <SheetTitle className="text-base font-semibold">
            {server.name}
          </SheetTitle>
          {maintenance && (
            <Badge
              variant="outline"
              className="h-5 rounded-[4px] border-warn/40 px-1.5 text-2xs font-normal text-warn-text"
            >
              维护中
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={copyIp}
            >
              <Copy className="size-3.5" />
              {copied ? "已复制" : "复制 IP"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="更多操作"
                  className="size-7 text-muted-foreground"
                >
                  <DotsThree className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setEditingTags(true)}>
                  编辑标签
                </DropdownMenuItem>
                {/*
                  曲线与心跳在前台，这里给一条明路。
                  只能落到前台首页，拼不出对应节点的深链 —— 两套 mock 的节点 id 不同
                  （后台 hk-01 / 前台 dmit-hk-01）。统一数据源后可改成 ?node=<id>。
                */}
                <DropdownMenuItem asChild>
                  <a href="/">
                    <ArrowSquareOut className="size-3.5" />
                    查看前台
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  // 同上：延一个 tick 再开对话框，避开下拉菜单的焦点归还
                  onSelect={() =>
                    window.setTimeout(() => setRemoving(true), 0)
                  }
                >
                  移除节点
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <SheetDescription className="num mt-1.5 text-2xs text-subtle">
          {server.ip} · {server.region} · {server.os} · agent v{server.agent} ·
          最后上报 {server.lastSeen}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-5">
          <TabsList className="h-9 justify-start gap-1 rounded-none bg-transparent p-0">
            {[
              { value: "config", label: "配置" },
              { value: "events", label: `事件 · ${events.length}` },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-9 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TabsContent value="config" className="mt-0 space-y-3">
            <Block
              title="标签"
              desc="用于分组筛选与探测范围。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-2xs"
                  onClick={() => setEditingTags(true)}
                >
                  编辑
                </Button>
              }
            >
              {tags.length === 0 ? (
                <p className="text-2xs text-subtle">还没有标签</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-brand/25 bg-brand/8 px-2 py-[3px] text-2xs leading-none text-brand"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Block>

            <Block
              title="维护模式"
              desc="静音这台节点的告警；指标照常采集，前台也不隐藏。"
              action={<MaintenanceSwitch server={server} />}
            />

            <Block title="接入" desc="agent 上报与身份标识，只读。">
              <div className="divide-y">
                <Field
                  label="agent 版本"
                  value={
                    <span className="flex items-center justify-end gap-1.5">
                      v{server.agent}
                      {server.agent !== LATEST_AGENT && (
                        <span className="text-2xs text-warn-text">
                          落后于 v{LATEST_AGENT}
                        </span>
                      )}
                    </span>
                  }
                />
                <Field label="节点 ID" value={server.id} />
                <Field label="IP" value={server.ip} />
                <Field label="地区" value={server.region} />
                <Field label="系统" value={server.os} />
                <Field label="在线时长" value={offline ? "—" : server.uptime} />
                <Field
                  label="最后上报"
                  value={
                    <span className={cn(offline && "text-crit-text")}>
                      {server.lastSeen}
                    </span>
                  }
                />
              </div>
            </Block>
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            {events.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-10 text-center">
                <p className="text-xs font-medium">没有事件</p>
                <p className="mt-1 text-2xs text-subtle">
                  这台节点还没有触发过告警。
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={event.id} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={event.level === "crit" ? "crit" : "warn"}
                      />
                      <span className="min-w-0 truncate text-xs font-medium">
                        {event.rule}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-auto h-5 shrink-0 rounded-[4px] px-1.5 text-2xs font-normal",
                          event.state === "firing"
                            ? "border-destructive/40 text-destructive"
                            : "text-subtle",
                        )}
                      >
                        {event.state === "firing" ? "Firing" : "Resolved"}
                      </Badge>
                    </div>
                    <div className="num mt-1.5 text-2xs text-subtle">
                      {event.time} · 持续 {event.duration}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {editingTags && (
        <NodeTagsDialog
          serverId={server.id}
          serverName={server.name}
          defaultTags={server.tags}
          open
          onOpenChange={(open) => !open && setEditingTags(false)}
        />
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`移除节点「${server.name}」？`}
        desc="该节点的历史数据会一并删除，且不可恢复；agent 端下次上报将被拒绝。"
        confirmLabel="移除"
        onConfirm={() => {
          setRemoving(false)
          toast("已移除节点（演示）")
        }}
      />
    </SheetContent>
  )
}
