import { useDeferredValue, useMemo, useState } from "react"
import { ToggleChip } from "@/components/toggle-chip"
import { Link, useSearchParams } from "react-router"
import { DotsThree, MagnifyingGlass } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { Heartbeat } from "@/components/heartbeat"
import { ServerSheet } from "@/components/server-sheet"
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
import { Input } from "@/components/ui/input"
import { Sheet } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableSkeleton } from "@/components/ui/skeleton"
import { alertEvents, fleet, useFleetStatus, useFleetTick } from "@/lib/mock"
import { pct, rate } from "@/lib/format"
import { pickParam } from "@/lib/url"
import { cn } from "@/lib/utils"

const TAGS = ["全部", "生产", "备用", "香港", "东京", "新加坡"] as const

export function OverviewPage() {
  useFleetTick()
  const [params, setParams] = useSearchParams()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  )

  // 筛选状态放 URL：可分享、可回退、刷新不丢；与 ?server= 共存
  const query = params.get("q") ?? ""
  const filter = pickParam(params, "state", ["all", "ok", "bad"] as const, "all")
  const tag = pickParam(params, "tag", TAGS, "全部")

  const patchParams = (
    patch: Record<string, string | null>,
    options?: { replace?: boolean },
  ) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key)
      else next.set(key, value)
    }
    setParams(next, options)
  }

  const setQuery = (value: string) => patchParams({ q: value || null }, { replace: true })
  const setFilter = (value: "all" | "ok" | "bad") =>
    patchParams({ state: value === "all" ? null : value })
  const setTag = (value: string) =>
    patchParams({ tag: value === "全部" ? null : value })

  const { loaded } = useFleetStatus()
  const selectedId = params.get("server")
  const selected = fleet.find((item) => item.id === selectedId) ?? null

  // 输入框跟着 query 立即响应，过滤跑在 deferred 值上：
  // 200 台规模下敲键盘不会被一次全表过滤卡住
  const deferredQuery = useDeferredValue(query)

  const servers = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return fleet.filter((item) => {
      if (filter === "ok" && item.status !== "ok") return false
      if (filter === "bad" && item.status === "ok") return false
      if (tag !== "全部" && !item.tags.includes(tag)) return false
      if (!keyword) return true
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.ip.includes(keyword) ||
        item.tags.join(" ").toLowerCase().includes(keyword)
      )
    })
  }, [deferredQuery, filter, tag])

  const online = fleet.filter((item) => item.status !== "off").length
  const firing = alertEvents.filter((event) => event.state === "firing").length
  const avgCpu = fleet.reduce((sum, item) => sum + item.cpu, 0) / fleet.length
  const totalRx = fleet.reduce((sum, item) => sum + item.rx, 0)
  const totalTx = fleet.reduce((sum, item) => sum + item.tx, 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          在线{" "}
          <b className="num font-medium text-foreground">
            {online}
          </b>{" "}
          / {fleet.length}
        </span>
        <span className="text-border">|</span>
        <span>
          告警 <b className="num font-medium text-warn-text">{firing}</b>
        </span>
        <span className="text-border">|</span>
        <span>
          平均 CPU <b className="num font-medium text-foreground">{pct(avgCpu)}</b>
        </span>
        <span className="text-border">|</span>
        <span>
          入站 <b className="num font-medium text-foreground">{rate(totalRx)}</b> MB/s
        </span>
        <span className="text-border">|</span>
        <span>
          出站 <b className="num font-medium text-foreground">{rate(totalTx)}</b> MB/s
        </span>
      </div>

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <MagnifyingGlass
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、IP、标签"
            aria-label="搜索名称、IP、标签"
            className="h-8 w-[220px] pl-8 text-xs"
          />
        </div>

        <Segmented
          ariaLabel="按状态筛选"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部" },
            { value: "ok", label: "在线" },
            { value: "bad", label: "异常" },
          ]}
        />

        <div className="flex items-center gap-1" role="group" aria-label="按标签筛选">
          {TAGS.map((item) => (
            <ToggleChip
              key={item}
              active={tag === item}
              onClick={() => setTag(item)}
              className={cn("h-7 border text-2xs", tag === item && "border-transparent")}
            >
              {item}
            </ToggleChip>
          ))}
        </div>

        <span className="ml-auto num text-2xs text-subtle">
          {servers.length} 台
        </span>
      </div>

      {!loaded ? (
        <TableSkeleton rows={8} cols={7} />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="没有匹配的节点"
          desc="换个关键词，或清掉状态 / 标签筛选。"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => patchParams({ q: null, state: null, tag: null })}
            >
              清除筛选
            </Button>
          }
        />
      ) : (
          <div className="-mx-5 max-h-[calc(100svh-11rem)] overflow-auto px-5">
            <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 w-8 px-3" />
                <TableHead className="h-8 px-3 text-xs font-medium">节点</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">地址</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">系统</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  在线
                </TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  CPU
                </TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  内存
                </TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  磁盘
                </TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  ↓ / ↑ MB/s
                </TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">
                  60s
                </TableHead>
                <TableHead className="h-8 w-10 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((item) => (
                <TableRow
                  key={item.id}
                  className="group cursor-pointer"
                  onClick={() => setParams({ server: item.id })}
                >
                  <TableCell className="h-9 px-3">
                    <StatusDot status={item.status} />
                  </TableCell>
                  <TableCell className="h-9 px-3">
                    <div className="flex items-center gap-2">
                      {/* 真链接：键盘可达、可中键新开、可复制地址；行点击对鼠标仍然有效 */}
                      <Link
                        to={`?server=${item.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs font-medium rounded-[3px] hover:underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                      <span className="text-2xs text-subtle">
                        {item.tags.join(" · ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="h-9 px-3">
                    <span className="num text-xs text-muted-foreground">
                      {item.ip}
                    </span>
                    <span className="ml-2 text-2xs text-subtle">{item.region}</span>
                  </TableCell>
                  <TableCell className="h-9 px-3 text-xs text-muted-foreground">
                    {item.os}
                  </TableCell>
                  <TableCell className="num h-9 px-3 text-right text-xs text-muted-foreground">
                    {item.uptime}
                  </TableCell>
                  <TableCell className="h-9 px-3">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={cn(
                          "num w-10 text-right text-xs",
                          item.cpu > 85 && "text-warn-text",
                        )}
                      >
                        {item.offline ? "—" : pct(item.cpu)}
                    </span>
                    <Sparkline
                      data={item.cpuSeries}
                      color="var(--chart-1)"
                      domain={[0, 100]}
                      className="h-4 w-[56px]"
                    />
                  </div>
                </TableCell>
                <TableCell className="num h-9 px-3 text-right text-xs">
                  {item.offline ? "—" : pct(item.mem)}
                </TableCell>
                <TableCell className="h-9 px-3 text-right">
                  <span
                    className={cn(
                      "num text-xs",
                      item.disk > 85 && "text-warn-text",
                      item.disk > 90 && "text-crit-text",
                    )}
                  >
                    {item.offline ? "—" : `${Math.round(item.disk)}%`}
                  </span>
                </TableCell>
                <TableCell className="num h-9 px-3 text-right text-xs text-muted-foreground">
                  {item.offline ? "—" : `${rate(item.rx)} / ${rate(item.tx)}`}
                </TableCell>
                <TableCell className="h-9 px-3">
                  <Heartbeat data={item.heartbeat} />
                </TableCell>
                <TableCell className="h-9 px-2">
                  <div
                    className="opacity-0 transition-opacity dur-2 group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground"
                        >
                          <DotsThree className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={() => setParams({ server: item.id })}
                        >
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem>编辑标签</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          // 延到下一个 tick 再开对话框，否则下拉菜单的
                          // 焦点归还会把对话框的焦点抢走
                          onSelect={() =>
                            window.setTimeout(
                              () =>
                                setRemoving({ id: item.id, name: item.name }),
                              0,
                            )
                          }
                        >
                          移除节点
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          // 只摘掉 server，别把筛选参数一起清了
          if (!open) patchParams({ server: null }, { replace: true })
        }}
      >
        {selected && <ServerSheet server={selected} />}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`移除节点「${removing?.name ?? ""}」？`}
        desc="该节点的历史数据会一并删除，且不可恢复；agent 端下次上报会被拒绝。"
        confirmLabel="移除"
        onConfirm={() => {
          setRemoving(null)
          toast("已移除节点（演示）")
        }}
      />
    </>
  )
}
