import { useDeferredValue, useMemo, useState } from "react"
import { ToggleChip } from "@/components/toggle-chip"
import { Link, useSearchParams } from "react-router"
import { DotsThree, MagnifyingGlass } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { Heartbeat } from "@/components/heartbeat"
import { NodeTagsDialog } from "@/components/node-tags-dialog"
import { nodeTags, useSettings } from "@/components/settings-provider"
import { ResourceBar } from "@/components/resource-bar"
import { ServerSheet } from "@/components/server-sheet"
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
import { alertEvents, fleet, useFleetStatus, useFleetTick, type Server } from "@/lib/mock"
import { pct, rate } from "@/lib/format"
import { pickParam } from "@/lib/url"
import { cn } from "@/lib/utils"

const TAGS = ["全部", "生产", "备用", "香港", "东京", "新加坡"] as const

/*
  阈值：CPU ≥85 / 内存 ≥90 / 磁盘 ≥85 与前台节点卡的取值一致；
  磁盘多保留一档 ≥90 的 crit（表格原来就有这个升级档，本轮不删）。

  注意填充色与文字色是两套 token（`--warn` vs `--warn-text`）：
  填充按图形算 3:1，文字按正文算 4.5:1，不能混用。

  改前这三列各写各的：CPU 有 warn、内存**完全没有**阈值着色、磁盘的 crit 判据用
  `> 90`（而 warn 用 `> 85`，两处写法还不一致）。现在三个指标共用这一份取值，
  数值颜色与进度条颜色必然一致。
*/
type Tone = { bar: string; text: string }

function cpuTone(value: number): Tone {
  return value >= 85
    ? { bar: "bg-warn", text: "text-warn-text" }
    : { bar: "bg-brand", text: "" }
}

function memTone(value: number): Tone {
  return value >= 90
    ? { bar: "bg-warn", text: "text-warn-text" }
    : { bar: "bg-brand", text: "" }
}

function diskTone(value: number): Tone {
  if (value >= 90) return { bar: "bg-crit", text: "text-crit-text" }
  if (value >= 85) return { bar: "bg-warn", text: "text-warn-text" }
  return { bar: "bg-brand", text: "" }
}

/** 一个资源指标的单元格：数值在上、进度条在下，两个入口同一种表达 */
function MetricCell({
  value,
  ratio,
  tone,
  offline,
}: {
  value: string
  ratio: number
  tone: Tone
  offline?: boolean
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "num truncate text-right text-xs",
          offline ? "text-subtle" : tone.text,
        )}
      >
        {value}
      </div>
      <ResourceBar
        value={ratio}
        tone={tone.bar}
        inactive={offline}
        className="mt-1.5"
      />
    </div>
  )
}

export function OverviewPage() {
  useFleetTick()
  const [params, setParams] = useSearchParams()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  )
  // 「编辑标签」的落点：菜单项此前没有处理函数，点了什么都不发生
  const [editingTags, setEditingTags] = useState<Server | null>(null)

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
  const { settings } = useSettings()
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
        {/*
          统计条：标签在上、数值在下，数值用 text-sm font-semibold + num，
          标签用 text-2xs text-subtle —— 形成两级层级，一眼能扫出数字。

          改前是「在线 <b>11</b> / 12 | 告警 <b>3</b> | …」一串行内文本：
          数字与标签同为 text-xs font-medium（没有层级、扫不出数），
          5 个 text-border 的竖线分隔符对比度极低，纯粹是视觉噪声。
        */}
        <dl
          data-testid="admin-stats"
          className="flex flex-wrap items-start gap-x-6 gap-y-2"
        >
          {[
            { label: "在线", value: `${online} / ${fleet.length}` },
            { label: "告警", value: String(firing), warn: firing > 0 },
            { label: "平均 CPU", value: pct(avgCpu) },
            { label: "入站", value: `${rate(totalRx)} MB/s` },
            { label: "出站", value: `${rate(totalTx)} MB/s` },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <dt className="text-2xs text-subtle">{item.label}</dt>
              <dd
                className={`num text-sm font-semibold tracking-tight ${
                  item.warn ? "text-warn-text" : "text-foreground"
                }`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

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
            {/*
              列宽改成显式指定 + table-fixed，并且**按实测文字宽度给足**。

              改前是 auto 布局，宽度由内容撑开，量出来四处不对：
                · CPU 被折线撑到 128px，而内存 59.5 / 磁盘 48px —— 减掉 24px 内边距
                  只剩 35 / 24px，放不下任何进度条；
                · 系统列实得 147.8px —— 内容驱动下的偶然结果，换个机器名就变；
                · 速率列 102.2px 而内容要 102.2px，差 0.2px 就截成「1.24 / 0…」；
                · 地址列内容要 157.4px 而实得 140px —— **溢出 17px 压到系统列上**，
                  因为它没有 truncate，所以既不报错、截图里也看不出来（最阴的一种）。

              各列内容的最坏宽度是**用页面真实字体在 DOM 里量出来的**，不是估的：
                名称 80.8 / 标签 75.4 / IP+地区 133.4 / 系统 123.8 / 在线 49.7 / 速率 78.2

              「地址」与「系统」并成一列（两行）是这一步的关键：
              分列时这两列要占 147.8 + 157.4 = 305px，加上其余列总宽实测 1108px，
              而 1280 视口下主区可用只有 1024px —— 必然横向滚动，且改前滚出去的
              正好是最后那列「操作」，不滚到底点不到 ⋯。
              并成一列后这一格只需 max(133.4, 123.8) + 24 ≈ 164px，
              固定列合计降到 **824px**，1280 下节点列拿到 200px，
              **既不横向滚动、也不截断任何一格**。
              两者本来就是同一类信息（这台机器跑在哪、跑的是什么），
              且行高已经是两行（节点列就是名称 + 标签），并列不额外增加高度。

              （试过让操作列 sticky 吸附右侧来容忍滚动 —— 实测它会盖住
                60s 心跳条最右 44px，比滚动条更糟，已放弃。）
            */}
            <Table data-testid="admin-table" className="min-w-[936px] table-fixed">
              <colgroup>
                <col className="w-10" />
                {/* 不写宽度 = 吸收剩余，窄屏时最先被压的是它 */}
                <col />
                <col className="w-[164px]" />
                <col className="w-[76px]" />
                <col className="w-[92px]" />
                <col className="w-[92px]" />
                <col className="w-[92px]" />
                <col className="w-[104px]" />
                <col className="w-[120px]" />
                <col className="w-11" />
              </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3" />
                <TableHead className="h-9 px-3 text-xs font-medium">节点</TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">
                  地址 / 系统
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  在线
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  CPU
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  内存
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  磁盘
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  ↓ / ↑ MB/s
                </TableHead>
                <TableHead className="h-9 px-2 text-xs font-medium">
                  60s
                </TableHead>
                <TableHead className="h-9 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((item) => (
                <TableRow
                  key={item.id}
                  className="group/row cursor-pointer"
                  onClick={() => setParams({ server: item.id })}
                >
                  <TableCell className="h-11 px-3">
                    <StatusDot status={item.status} />
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/*
                      名字与标签分两行：原来并排时这一格要 176px，而进度条那几列更需要宽度。
                      上下两行共约 33px，正好落进 44px 的行高 —— 不额外抬高行，也不截断标签。
                    */}
                    <div className="min-w-0">
                      {/* 真链接：键盘可达、可中键新开、可复制地址；行点击对鼠标仍然有效 */}
                      <Link
                        to={`?server=${item.id}`}
                        onClick={(event) => event.stopPropagation()}
                        title={item.name}
                        className="block truncate rounded-[3px] text-xs font-medium hover:underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                      <div className="truncate text-2xs text-subtle">
                        {/* 标签是配置，可能被「编辑标签」改过，不能直接读 mock */}
                        {nodeTags(settings, item.id, item.tags).join(" · ")}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/* 第一行网络地址（主）、第二行操作系统（次） */}
                    <div className="truncate">
                      <span className="num text-xs text-muted-foreground">
                        {item.ip}
                      </span>
                      <span className="ml-2 text-2xs text-subtle">
                        {item.region}
                      </span>
                    </div>
                    <div
                      className="truncate text-2xs text-subtle"
                      title={item.os}
                    >
                      {item.os}
                    </div>
                  </TableCell>
                  <TableCell className="num h-11 px-3 text-right text-xs text-muted-foreground">
                    {item.uptime}
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    <MetricCell
                      value={item.offline ? "—" : pct(item.cpu)}
                      ratio={item.cpu}
                      tone={cpuTone(item.cpu)}
                      offline={item.offline}
                    />
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    <MetricCell
                      value={item.offline ? "—" : pct(item.mem)}
                      ratio={item.mem}
                      tone={memTone(item.mem)}
                      offline={item.offline}
                    />
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    <MetricCell
                      value={item.offline ? "—" : `${Math.round(item.disk)}%`}
                      ratio={item.disk}
                      tone={diskTone(item.disk)}
                      offline={item.offline}
                    />
                  </TableCell>
                  <TableCell className="num h-11 px-3 text-right text-xs text-muted-foreground">
                    {item.offline ? "—" : `${rate(item.rx)} / ${rate(item.tx)}`}
                  </TableCell>
                  <TableCell className="h-11 px-2">
                    <Heartbeat data={item.heartbeat} />
                  </TableCell>
                  {/*
                    行操作在桌面靠 hover 显形，但触屏没有 hover —— 那些设备上
                    这个按钮此前是永久 invisible（仍可点，但看不见）。
                    touch: 下改成常显，顺带把命中区从 24px 撑到 44px。
                  */}
                  <TableCell className="h-11 px-2">
                    <div
                      className="opacity-0 transition-opacity dur-2 focus-within:opacity-100 group-hover/row:opacity-100 touch:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="更多操作"
                            className="size-6 text-muted-foreground touch:size-11"
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
                        <DropdownMenuItem
                          onClick={() => setEditingTags(item)}
                        >
                          编辑标签
                        </DropdownMenuItem>
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

      {editingTags && (
        <NodeTagsDialog
          serverId={editingTags.id}
          serverName={editingTags.name}
          defaultTags={editingTags.tags}
          open
          onOpenChange={(open) => !open && setEditingTags(null)}
        />
      )}

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
