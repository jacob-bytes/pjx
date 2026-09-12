import { useDeferredValue, useMemo, useState } from "react"
import { ToggleChip } from "@/components/toggle-chip"
import { Link, useSearchParams } from "react-router"
import { DotsThree, MagnifyingGlass } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { NodeTagsDialog } from "@/components/node-tags-dialog"
import { nodeTags, useSettings } from "@/components/settings-provider"
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
import {
  alertEvents,
  alertRules,
  fleet,
  probes,
  useFleetStatus,
  useFleetTick,
  type Server,
} from "@/lib/mock"
import { METRIC_LIMITS } from "@/lib/settings"
import { pickParam } from "@/lib/url"
import { cn } from "@/lib/utils"

const TAGS = ["全部", "生产", "备用", "香港", "东京", "新加坡"] as const

/*
  「关注」列：**只在接近或越过阈值时**才显示那一项。

  §AF 定过一条规则：常态不写状态文字、只报异常 —— 因为在线是常态，
  写出来反而稀释了真正该看的那一条。这里同理：
  把「CPU 23%」这种数字列出来，等于把前台已经展示过的数据再刷一遍；
  而「磁盘 92%（阈值 85%）」回答的才是后台该回答的问题 ——
  **这台机器现在需要我做什么**。
*/
type Concern = { label: string; value: number; limit: number; over: boolean }

function tightestMetric(server: Server): Concern | null {
  let best: Concern | null = null
  for (const metric of METRIC_LIMITS) {
    const value = server[metric.key]
    if (!best || value / metric.limit > best.value / best.limit) {
      best = {
        label: metric.label,
        value,
        limit: metric.limit,
        over: value >= metric.limit,
      }
    }
  }
  // 全部在阈值的 90% 以下 = 没有需要关注的东西
  return best && best.value / best.limit >= 0.9 ? best : null
}

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
  const staleAgents = fleet.filter(
    (item) => compareVersion(item.agent, LATEST_AGENT) < 0,
  ).length
  const aliveProbes = probes.filter(
    (probe) => !settings.probesRemoved.includes(probe.id),
  )
  const enabledProbes = aliveProbes.filter(
    (probe) => settings.probeEnabled[probe.id] ?? true,
  ).length
  const enabledRules = alertRules.filter(
    (rule) => settings.ruleEnabled[rule.id] ?? rule.enabled,
  ).length

  return (
    <>
        {/*
          统计条：标签在上、数值在下（§AP 定的两级层级），但**内容换了一套**。

          改前是「在线 · 告警 · 平均 CPU · 入站 · 出站」—— 后三项就是前台 KPI 的
          同一批展示数据。后台该回答的是"有没有需要我处理的事、配置齐不齐"，
          所以换成：在线 / 触发中告警 / agent 落后 / 探测启用 / 规则启用。

          顺带修一个口径问题：原来的「告警 3」数的是**触发中的告警事件条数**，
          而前台状态通栏的「1 告警」数的是**告警节点数** —— 同一个词两个口径。
          现在标签写明「触发中告警」。
        */}
        <dl
          data-testid="admin-stats"
          /*
            窄屏用 grid、宽屏回到 flex：
            5 项在 390px 下 flex-wrap 会排成 4+1，末项独占一行、右侧空出 85%（实测），
            grid 的行是规整的所以不显突兀；而宽屏下 flex 让它们紧凑地靠左排，
            保持 §AP 定的形态（grid 会把 5 项摊满整行，5 列里每列大半是空的）。
          */
          className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-start lg:gap-y-2"
        >
          {[
            { label: "在线", value: `${online} / ${fleet.length}` },
            {
              label: "触发中告警",
              value: String(firing),
              warn: firing > 0,
            },
            {
              label: "agent 落后",
              value: `${staleAgents} 台`,
              warn: staleAgents > 0,
            },
            {
              label: "探测任务",
              value: `${enabledProbes} / ${aliveProbes.length} 启用`,
            },
            {
              label: "告警规则",
              value: `${enabledRules} / ${alertRules.length} 启用`,
            },
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
            className="h-8 w-full pl-8 text-xs sm:w-[220px]"
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
            <Table data-testid="admin-table" className="min-w-[704px] table-fixed">
              <colgroup>
                <col className="w-10" />
                {/* 不写宽度 = 吸收剩余 */}
                <col />
                <col className="w-[164px]" />
                <col className="w-[84px]" />
                <col className="w-[92px]" />
                <col className="w-[104px]" />
                <col className="w-11" />
              </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3" />
                <TableHead className="h-9 px-3 text-xs font-medium">节点</TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">
                  地址 / 系统
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">agent</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  最后上报
                </TableHead>
                {/* 表头带上口径，否则「关注」是个猜谜的词 */}
                <TableHead
                  className="h-9 px-3 text-xs font-medium"
                  title="占阈值 90% 以上的那一项；都在 90% 以下时留空"
                >
                  关注
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
                      §AQ 把名字与标签堆成两行，是因为那一格只有 132px；
                      监控列搬走之后它有 496px，并排更紧凑、也少一层竖直噪声。
                      行高由「地址 / 系统」那一格（两行）决定，不受这里影响。
                    */}
                    <div className="flex items-center gap-2">
                      {/* 真链接：键盘可达、可中键新开、可复制地址；行点击对鼠标仍然有效 */}
                      <Link
                        to={`?server=${item.id}`}
                        onClick={(event) => event.stopPropagation()}
                        title={item.name}
                        className="truncate rounded-[3px] text-xs font-medium hover:underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                      <span className="truncate text-2xs text-subtle">
                        {/* 标签是配置，可能被「编辑标签」改过，不能直接读 mock */}
                        {nodeTags(settings, item.id, item.tags).join(" · ")}
                      </span>
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
                  <TableCell className="num h-11 px-3 text-xs">
                    <span
                      className={cn(
                        item.agent !== LATEST_AGENT
                          ? "text-warn-text"
                          : "text-muted-foreground",
                      )}
                      title={
                        item.agent !== LATEST_AGENT
                          ? `落后于最新 v${LATEST_AGENT}`
                          : `最新 v${LATEST_AGENT}`
                      }
                    >
                      v{item.agent}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "num h-11 px-3 text-right text-xs",
                      item.offline ? "text-crit-text" : "text-muted-foreground",
                    )}
                  >
                    {item.lastSeen}
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/*
                      只报异常：都在阈值 90% 以下就留空。原来这里是
                      「数值 + 进度条」的 CPU/内存/磁盘 三列 —— 那是前台卡片的同一批数据。
                    */}
                    {(() => {
                      const concern = item.offline ? null : tightestMetric(item)
                      if (!concern) {
                        return <span className="text-xs text-subtle">—</span>
                      }
                      return (
                        <span
                          className={cn(
                            "num text-xs",
                            concern.over ? "text-crit-text" : "text-warn-text",
                          )}
                          title={`阈值 ${concern.limit}%`}
                        >
                          {concern.label} {Math.round(concern.value)}%
                        </span>
                      )
                    })()}
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
