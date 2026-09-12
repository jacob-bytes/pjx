import { useState, type ReactNode } from "react"
import { Copy, DotsThree } from "@phosphor-icons/react"
import { toast } from "sonner"
import { NodeTagsDialog } from "@/components/node-tags-dialog"
import { nodeTags, useSettings } from "@/components/settings-provider"
import { TimeSeriesChart } from "@/components/time-series-chart"
import { Sparkline } from "@/components/sparkline"
import { StatusDot } from "@/components/status-dot"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatSpan, pct, rate } from "@/lib/format"
import type { Server } from "@/lib/mock"

const TABS = [
  { value: "live", label: "实时" },
  { value: "history", label: "历史" },
  { value: "probes", label: "探测" },
  { value: "events", label: "事件" },
]

function ChartCard({
  title,
  value,
  children,
}: {
  title: string
  value: string
  children: ReactNode
}) {
  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs text-muted-foreground">{title}</span>
        <span className="num text-2xs">{value}</span>
      </div>
      {children}
    </div>
  )
}

function Hint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-10 text-center">
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 text-2xs text-subtle">{desc}</p>
    </div>
  )
}

export function ServerSheet({ server }: { server: Server }) {
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  const { settings } = useSettings()
  const offline = Boolean(server.offline)

  // 百分比类序列走固定域 [0,100]；网络没有天然上界，用自动域
  const stats: {
    label: string
    value: string
    series: number[]
    color: string
    domain?: [number, number]
  }[] = [
    {
      label: "CPU",
      value: offline ? "—" : pct(server.cpu),
      series: server.cpuSeries,
      color: "var(--chart-1)",
      domain: [0, 100],
    },
    {
      label: "内存",
      value: offline ? "—" : pct(server.mem),
      series: server.memSeries,
      color: "var(--chart-3)",
      domain: [0, 100],
    },
    {
      label: "磁盘",
      value: offline ? "—" : `${Math.round(server.disk)}%`,
      series: server.diskSeries,
      color: server.disk > 85 ? "var(--warn)" : "var(--chart-2)",
      domain: [0, 100],
    },
    {
      label: "网络 ↓ / ↑",
      value: offline
        ? "—"
        : `${rate(server.rx)} / ${rate(server.tx)}`,
      series: server.rxSeries,
      color: "var(--chart-4)",
    },
  ]

  const netMax = Math.max(
    1,
    Math.ceil(Math.max(...server.rxSeries, ...server.txSeries)),
  )

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
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">
      <SheetHeader className="gap-0 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <StatusDot status={server.status} />
          <SheetTitle className="text-base font-semibold">
            {server.name}
          </SheetTitle>
          <span className="text-2xs text-subtle">
            {nodeTags(settings, server.id, server.tags).join(" · ")}
          </span>
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
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => setEditingTags(true)}>
                  编辑标签
                </DropdownMenuItem>
                <DropdownMenuItem>查看探测结果</DropdownMenuItem>
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

      <Tabs
        defaultValue="live"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-5">
          <TabsList className="h-9 justify-start gap-1 rounded-none bg-transparent p-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-9 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {tab.value === "live"
                  ? `${tab.label} · ${formatSpan(server.cpuSeries.length)}`
                  : tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TabsContent value="live" className="mt-0 space-y-3">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-card p-3">
                  <div className="text-2xs text-subtle">{stat.label}</div>
                  <div className="num mt-1 text-lg font-medium">
                    {stat.value}
                  </div>
                  <Sparkline
                    data={offline ? [] : stat.series}
                    color={stat.color}
                    domain={stat.domain}
                    className="mt-1 h-5 w-full"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="CPU 使用率" value={offline ? "—" : pct(server.cpu)}>
                <TimeSeriesChart
                  height={140}
                  leftMax={100}
                  leftFormat={(value) => `${value.toFixed(0)}%`}
                  series={[
                    {
                      key: "cpu",
                      label: "CPU",
                      data: offline ? [] : server.cpuSeries,
                      color: "var(--chart-1)",
                      fill: true,
                    },
                    {
                      key: "cpu-threshold",
                      label: "阈值 90%",
                      data: server.cpuSeries.map(() => 90),
                      color: "var(--warn)",
                      reference: true,
                    },
                  ]}
                />
              </ChartCard>
              <ChartCard title="内存使用率" value={offline ? "—" : pct(server.mem)}>
                <TimeSeriesChart
                  height={140}
                  leftMax={100}
                  leftFormat={(value) => `${value.toFixed(0)}%`}
                  series={[
                    {
                      key: "mem",
                      label: "内存",
                      data: offline ? [] : server.memSeries,
                      color: "var(--chart-3)",
                      fill: true,
                    },
                    {
                      key: "mem-threshold",
                      label: "阈值 92%",
                      data: server.memSeries.map(() => 92),
                      color: "var(--warn)",
                      reference: true,
                    },
                  ]}
                />
              </ChartCard>
              <ChartCard
                title="网络吞吐"
                value={
                  offline
                    ? "—"
                    : `↓ ${rate(server.rx)} · ↑ ${rate(server.tx)}`
                }
              >
                <TimeSeriesChart
                  height={140}
                  leftMax={netMax}
                  leftFormat={(value) => rate(value)}
                  series={[
                    {
                      key: "rx",
                      label: "入站 MB/s",
                      data: offline ? [] : server.rxSeries,
                      color: "var(--chart-4)",
                      fill: true,
                    },
                    {
                      key: "tx",
                      label: "出站 MB/s",
                      data: offline ? [] : server.txSeries,
                      color: "var(--chart-5)",
                    },
                  ]}
                />
              </ChartCard>
              <ChartCard
                title="磁盘使用率"
                value={offline ? "—" : `${Math.round(server.disk)}%`}
                >
                <TimeSeriesChart
                  height={140}
                  leftMax={100}
                  leftFormat={(value) => `${value.toFixed(0)}%`}
                  series={[
                    {
                      key: "disk",
                      label: "磁盘",
                      data: offline ? [] : server.diskSeries,
                      color:
                        server.disk > 85 ? "var(--warn)" : "var(--chart-2)",
                      fill: true,
                    },
                    {
                      key: "disk-threshold",
                      label: "阈值 85%",
                      data: server.diskSeries.map(() => 85),
                      color: "var(--warn)",
                      reference: true,
                    },
                  ]}
                />
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <Hint
              title="历史数据"
              desc="接真实数据后在这里选择时间范围与分辨率（1m / 1h）"
            />
          </TabsContent>
          <TabsContent value="probes" className="mt-0">
            <Hint title="该节点的探测结果" desc="覆盖此节点的探测任务与延迟曲线" />
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <Hint title="事件时间线" desc="此节点的告警触发与恢复记录" />
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
        desc="该节点的历史数据会一并删除，且不可恢复；agent 端下次上报会被拒绝。"
        confirmLabel="移除"
        onConfirm={() => {
          setRemoving(false)
          toast("已移除节点（演示）")
        }}
      />
    </SheetContent>
  )
}
