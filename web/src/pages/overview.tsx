import { useDeferredValue, useMemo, useState, type ReactNode } from "react"
import { ToggleChip, chipGroupBareClass } from "@/components/toggle-chip"
import { Link, useSearchParams } from "react-router"
import {
  ArrowClockwise,
  Bell,
  Broadcast,
  CaretUp,
  DesktopTower,
  DotsThree,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { MaintenanceSwitch } from "@/components/maintenance-switch"
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
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
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
import { formatLastSeen } from "@/lib/format"
import { TABLE_VIEWPORT } from "@/lib/layout"
import { uptimeDaysFor } from "@/lib/nodes"
import { Tooltip } from "@/components/ui/tooltip"
import { UptimeStrip, uptimeAvailability } from "@/components/uptime-strip"
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

/*
  软底状态徽章。

  改前表格里的"异常"只有**颜色文字**（`text-warn-text`）一个通道 ——
  颜色一淡就看不出来，对色觉障碍读者也只剩深浅差别。
  现在补上底色与描边：颜色 + 形状（圆角块）+ 文字，三个通道。

  底色由 token 加透明度得来（`--warn` / `--crit` 的 10%），不引第二套调色板。
*/
type BadgeTone = "warn" | "crit" | "neutral"

/*
  染色底的透明度是量出来的：/10 时 crit 徽章的文字只有 4.46:1（差 0.04 不达标），
  /8 是 4.60:1。正好也是全站标签徽章既有的配方（`border-brand/25 bg-brand/8`）。

  描边 /25 对卡片只有 1.26:1 —— 它是**装饰性的柔边**，不承担语义：
  徽章的含义由文字（4.6:1 以上）承载，底色与圆角是冗余通道，
  所以这里不按 1.4.11 的 3:1 要求它。
*/
const BADGE_TONE: Record<BadgeTone, string> = {
  warn: "border-warn/25 bg-warn/8 text-warn-text",
  crit: "border-crit/25 bg-crit/8 text-crit-text",
  neutral: "border-border bg-muted text-muted-foreground",
}

function ToneBadge({
  tone,
  title,
  className,
  children,
}: {
  tone: BadgeTone
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip label={title}>
      <span
        className={cn(
        "num inline-flex h-5 max-w-full items-center rounded-xs border px-1.5 text-2xs",
        BADGE_TONE[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
      </span>
    </Tooltip>  )
}

/*
  表格排序。

  这是盘点里价值最高的一条：**前台有 6 个排序项，后台一个都没有** ——
  而后台的主要用途恰恰是"找出最需要处理的那几台"（§B1 给前台做了排序）。

  做成**可点表头**而不是工具栏里的下拉：表格的惯例就是点列头排序，
  而且不用再往已经排满的工具栏里塞一个控件（移动端工具栏已经三行）。
  排序键进 URL（`?sort=`&`?dir=`），可分享、可回退，与其它筛选一致。

  离线节点一律沉底（照 §B1 的判断）：排序是为了找"最忙/最旧"的，
  把断线的排最前会盖住真正要看的东西。
*/
const SORTS = {
  name: "节点",
  agent: "agent",
  uptime: "30 天可用率",
  lastSeen: "最后上报",
  concern: "关注",
} as const

type SortKey = keyof typeof SORTS

function SortableHead({
  sortKey,
  active,
  dir,
  onSort,
  className,
  children,
}: {
  sortKey: SortKey
  active: boolean
  dir: "asc" | "desc"
  onSort: (key: SortKey, dir: "asc" | "desc") => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <TableHead
      className={cn("h-9 px-3", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Tooltip label={`按${SORTS[sortKey]}排序`}>
      <button
        type="button"
        onClick={() => onSort(sortKey, active && dir === "asc" ? "desc" : "asc")}
        aria-label={`按${SORTS[sortKey]}排序`}
        // 表头按钮只有 40×17：补高度，触屏下再用伪元素把命中区撑开
        data-tap-area
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-xs text-xs font-medium transition-colors dur-2 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        {/* 指示器用形状而不是颜色：未排序时是一条淡横线，排序后是箭头 */}
        <CaretUp
          className={cn(
            "size-3 shrink-0 transition-opacity dur-2",
            active ? "opacity-100" : "opacity-0",
            active && dir === "desc" && "rotate-180",
          )}
        />
      </button>
      </Tooltip>    </TableHead>
  )
}

/*
  告警态 KPI 卡片：**不铺大面积底色**。

  §BA 那版是整卡染色（底 + 描边）。前端同事的反馈是那样"整块彩色"太重、
  5 张卡的信息层级被底色盖住了，改用三个更克制的通道：
    1. 左边缘 3px 指示条（形状 + 颜色，位置固定在卡片外沿，不干扰阅读区）
    2. **只有关键数字**上警示色（文字）
    3. 状态点（圆点）
  底色保持纯白，异常卡片与正常卡片的"体量"仍然一样，靠这三处区分。

  ⚠️ 注意"呼吸灯"：同事建议正常用呼吸圆点。本项目有一条硬约束 ——
  **健康的点不许 pulse**（§P：只有离线/告警才允许呼吸），所以这里所有圆点都是静态的。
*/
const TONE_BAR: Record<"warn" | "crit", string> = {
  warn: "bg-warn",
  crit: "bg-crit",
}
const TONE_TEXT: Record<"warn" | "crit", string> = {
  warn: "text-warn-text",
  crit: "text-crit-text",
}
const TONE_DOT: Record<"warn" | "crit" | "ok", string> = {
  warn: "bg-warn",
  crit: "bg-crit",
  ok: "bg-ok",
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
  const sortKey = pickParam(
    params,
    "sort",
    ["name", "agent", "uptime", "lastSeen", "concern"] as const,
    "name",
  )
  const sortDir = pickParam(params, "dir", ["asc", "desc"] as const, "asc")

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
  const setSort = (key: SortKey, dir: "asc" | "desc") =>
    patchParams({ sort: key === "name" ? null : key, dir: dir === "asc" ? null : dir })

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

  /*
    离线沉底 + 选中列的值比较。`concern` 用"最紧指标占阈值的比例"，
    没有超阈值的节点按 -1 排在最后。
  */
  const sorted = useMemo(() => {
    const ratioOf = (item: Server) => {
      const concern = tightestMetric(item)
      return concern ? concern.value / concern.limit : -1
    }
    const compare = (a: Server, b: Server) => {
      switch (sortKey) {
        case "agent":
          return compareVersion(a.agent, b.agent)
        case "uptime":
          // 升序 = 可用率最低的排最前（"谁最不稳"）
          return (
            uptimeAvailability(uptimeDaysFor(a.id)) -
            uptimeAvailability(uptimeDaysFor(b.id))
          )
        case "lastSeen":
          return a.lastSeenSec - b.lastSeenSec
        case "concern":
          return ratioOf(a) - ratioOf(b)
        default:
          return a.name.localeCompare(b.name, "zh")
      }
    }
    const direction = sortDir === "asc" ? 1 : -1
    return [...servers].sort(
      (a, b) =>
        Number(Boolean(a.offline)) - Number(Boolean(b.offline)) ||
        compare(a, b) * direction,
    )
  }, [servers, sortKey, sortDir])

  const online = fleet.filter((item) => item.status !== "off").length
  /** 离线的是哪几台 —— 主卡里直接点名，省得再去表里找 */
  const offlineNames = fleet
    .filter((item) => item.offline)
    .map((item) => item.name)
    .join("、")
  /*
    机队 30 天：**机队级事件**，而不是"任意一台抖了一下"。

    一开始按"逐日取最坏"聚合，实测发现问题：每台机器约 6% 的天数有抖动，
    12 台下来 `1-0.94^12 ≈ 52%` —— 条子一半是琥珀色，看起来像机队很不稳，
    而每台自己的可用率其实都在 99% 上下。聚合口径必须比单机更"钝"：

      任一台离线            → off（真的出事了）
      两台及以上同时异常     → partial（面够宽，算机队级劣化）
      只有一台抖了一下      → ok（单机噪声，那一台自己的行里看得到）

    每日 ratio 取当天所有节点可用率的均值 —— 于是"可用率 X%"是真实的机队均值，
    不是从段颜色反推出来的。
  */
  const fleetDays = uptimeDaysFor(fleet[0].id).map((day) => ({ ...day }))
  fleetDays.forEach((_, index) => {
    let offCount = 0
    let degradedCount = 0
    let ratioSum = 0
    for (const node of fleet) {
      const day = uptimeDaysFor(node.id)[index]
      if (day.state === "off") offCount++
      else if (day.state === "partial") degradedCount++
      ratioSum += day.state === "none" ? 0 : day.ratio
    }
    const state =
      offCount > 0 ? "off" : degradedCount >= 2 ? "partial" : "ok"
    fleetDays[index] = {
      ...fleetDays[index],
      state,
      ratio: Number((ratioSum / fleet.length).toFixed(1)),
    }
  })

  /*
    「需要处理」清单：把"扫 12 行找徽章"变成抬头就看到该管什么。
    纯派生（离线 / 关注项超阈值 / agent 落后），不是新数据；每条直接打开对应节点面板。
  */
  const concerns: { id: string; name: string; reason: string; tone: "crit" | "warn" }[] = []
  for (const node of fleet) {
    if (node.offline) {
      concerns.push({ id: node.id, name: node.name, reason: "已离线", tone: "crit" })
      continue
    }
    const concern = tightestMetric(node)
    if (concern?.over) {
      concerns.push({
        id: node.id,
        name: node.name,
        reason: `${concern.label} ${Math.round(concern.value)}%`,
        tone: "crit",
      })
    }
  }
  for (const node of fleet) {
    if (!node.offline && compareVersion(node.agent, LATEST_AGENT) < 0) {
      concerns.push({
        id: node.id,
        name: node.name,
        reason: `agent v${node.agent}`,
        tone: "warn",
      })
    }
  }
  const topConcerns = concerns.slice(0, 3)

  const firingEvents = alertEvents.filter((event) => event.state === "firing")
  const firing = firingEvents.length
  const firingCrit = firingEvents.filter((event) => event.level === "crit").length
  const staleAgents = fleet.filter(
    // 离线机器不计入"agent 落后"：它已经在「在线」那张卡里算过一次了，
    // 而离线机器的 agent 版本本来就无从升级（§AF：同一件事只报一次）
    (item) => !item.offline && compareVersion(item.agent, LATEST_AGENT) < 0,
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
    <div className="flex min-h-0 flex-1 flex-col">
        {/*
          顶部 5 项统计：由 §AP 的扁平两级条改成**紧凑 KPI 卡片**。

          内容口径保留 §AT 换的那一套（在线 / 触发中告警 / agent 落后 /
          探测启用 / 规则启用）—— 后台回答的是"有没有需要我处理的事、配置齐不齐"。

          与前台的关系：前台 KPI 本来就是卡片（`kpi-tiles.tsx`，固定 112px），
          后台这 5 张是同一个族里更紧凑的一档（没有 sparkline，所以不用 112px）。
          卡片本身不接 hover、不可点：**一个静态的卡片加 hover 阴影是纯装饰**
          （§P 那轮专门扫过"每个卡片的入场动画"这类 AI 味），要可点就必须真的有去处。
        */}
        {/*
          KPI 卡片此前**不受 loaded 约束** —— 表格在转骨架屏时它已经在出数。
          mock 是同步的所以看不出来，接真实接口后会出现"先闪 0 / 旧值，再跳真值"。
          现在与表格共用一个加载门；骨架高度对齐真实卡片（83px），不会跳版。
        */}
        {!loaded ? (
          <div
            className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-[minmax(0,2.15fr)_repeat(4,minmax(0,1fr))]"
            aria-busy="true"
            aria-label="加载中"
          >
            <Skeleton className="col-span-2 h-[124px] sm:col-span-4 xl:col-span-1" />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[104px]" />
            ))}
          </div>
        ) : (
        <dl
          data-testid="admin-stats"
          /*
            items-start：卡片**贴合自己的内容**，不互相拉伸。
            拉伸过一次才知道代价 —— 主卡因为多一条 30 天条和「需要处理」而更高，
            旁边 4 张 tile 被拉到同样高度，实测每张 170px 里只有 44.6px 是内容，
            59% 是空白，单个「3」飘在中间。
          */
          className="grid shrink-0 grid-cols-2 items-start gap-2.5 sm:grid-cols-4 xl:grid-cols-[minmax(0,2.15fr)_repeat(4,minmax(0,1fr))]"
        >
          {/*
            v2：从"5 张完全等价的卡"改成"1 个状态主卡 + 4 个紧凑指标"。
            等价卡片无法表达优先级，而运维台的第一个问题是"现在要不要管" ——
            所以把"在线/离线"放大成主卡，并给它机队 30 天历史与待处理清单；
            其余四项降为紧凑指标（宽度 1fr），主次靠**宽度**分层而不是高度
            （§BD 刚把卡片收敛成"纯白 + 3px 指示条"，再用高度做层级会把节奏弄乱）。
          */}
          <div className="card col-span-2 flex flex-col gap-2 p-3 sm:col-span-4 xl:col-span-1">
            <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <DesktopTower className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="truncate">机队状态</span>
            </dt>
            <dd className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    "num text-2xl font-semibold leading-none tracking-tight",
                    fleet.length - online > 0 && "text-crit-text",
                  )}
                >
                  {online} / {fleet.length}
                </span>
                <span className="flex items-center gap-1.5 text-2xs text-subtle">
                  <span
                    aria-hidden
                    className={cn(
                      "size-[6px] shrink-0 rounded-full",
                      fleet.length - online > 0 ? "bg-crit" : "bg-ok",
                    )}
                  />
                  {fleet.length - online > 0
                    ? `在线 · ${fleet.length - online} 台离线（${offlineNames}）`
                    : "在线 · 全部在线"}
                </span>
              </div>
              {/*
                机队 30 天：日期 / 条 / 可用率**并成一行**。
                原来分两行（条一行、轴一行）把主卡撑到比 tile 高 30px，
                卡片就只能互相拉伸 —— 单看一张 tile，"3" 上下各空 100px。
                整条只给一个汇总结论（读屏与 title），逐格不做交互元素。
              */}
              <div className="flex items-center gap-2 text-2xs text-subtle">
                <span className="shrink-0">{fleetDays[0]?.date}</span>
                <UptimeStrip
                  days={fleetDays}
                  label="机队"
                  className="min-w-0 flex-1"
                  segmentClassName="h-4"
                />
                {/* 数值以文字可见（skill 的可视化规范：不能只靠颜色） */}
                <span className="num shrink-0">
                  可用率 {uptimeAvailability(fleetDays)}%
                </span>
              </div>
            </dd>
          </div>

          {[
            {
              label: "触发中告警",
              value: String(firing),
              // 触发中的事件里有 crit 级别的才是 crit，否则 warn
              tone:
                firing === 0
                  ? null
                  : firingCrit > 0
                    ? ("crit" as const)
                    : ("warn" as const),
              note: firing > 0 ? "需要处理" : "没有触发中的告警",
              icon: WarningCircle,
              to: "/alerts",
            },
            {
              label: "agent 落后",
              value: `${staleAgents} 台`,
              tone: staleAgents > 0 ? ("warn" as const) : null,
              note: staleAgents > 0 ? `最新 v${LATEST_AGENT}` : "都跑在最新版",
              icon: ArrowClockwise,
              // 排序而不是筛选：落后的那几台会排到最前，一眼就能看到
              to: "?sort=agent&dir=asc",
            },
            {
              label: "探测任务",
              value: `${enabledProbes} / ${aliveProbes.length} 启用`,
              // 停用探测是有意为之，不是异常 —— 不套状态色（§AF：状态色只给异常）
              tone: null,
              note:
                enabledProbes === aliveProbes.length
                  ? "全部启用"
                  : `${aliveProbes.length - enabledProbes} 个已停用`,
              icon: Broadcast,
              to: "/probes",
            },
            {
              label: "告警规则",
              value: `${enabledRules} / ${alertRules.length} 启用`,
              tone: null,
              note:
                enabledRules === alertRules.length
                  ? "全部启用"
                  : `${alertRules.length - enabledRules} 个已停用`,
              icon: Bell,
              to: "/alerts?tab=rules",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                /*
                  纯白 + 微边框 + 轻阴影（card 工具类），异常态**不加底色**。
                  justify-between：4 张 tile 与主卡同高（grid 拉伸），
                  内容按"标签 / 数字 / 说明"三段分布，否则底部会空出一大块。
                */
                "card relative flex flex-col justify-between gap-1.5 overflow-hidden p-3",
                // 可点之后 hover 必须有反馈；hover 底色统一用 /50（与数据行同一个步骤）
                "transition-colors dur-2 has-[a:hover]:bg-muted/50",
                /*
                  F2：焦点环画在**卡片自己**身上。
                  原来指望 stretched link 的 outline，但链接是 `absolute inset-0`、
                  而卡片有 `overflow-hidden` —— 全局 `outline-offset: 2px` 是向外画的，
                  于是整个环被卡片裁掉，键盘用户看不到焦点。
                */
                "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
                item.tone && "pl-3.5",
              )}
            >
              {/* 异常态：左边缘 3px 指示条（绝对定位，不用 border-l-4 —— 边框会挤内容） */}
              {item.tone && (
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[item.tone])}
                />
              )}
              {/*
                整卡可点：把 link 铺满卡片（stretched link），而不是把整张卡换成 <a> ——
                这样 <dl>/<dt>/<dd> 的语义还在（标签:数值 本来就是 description list）。
              */}
              <Link
                to={item.to}
                aria-label={`${item.label}：${item.value}（${item.note}）`}
                className="absolute inset-0 rounded-[inherit] focus-visible:outline-none"
              />
              <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                {/*
                  F5：图标回中性色。原来"指示条 + 图标 + 数字 + 说明文字 + 圆点"
                  一共 5 处上色在说同一件事；现在图标与说明文字都是中性色，
                  只剩指示条（形状）、数字（文字）、圆点（形状）三个通道。
                */}
                <item.icon className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="truncate">{item.label}</span>
              </dt>
              {/* 只有关键数字上色 —— 底色留白，靠这一处把异常"顶"出来 */}
              <dd
                className={cn(
                  "num truncate text-lg font-semibold leading-none tracking-tight",
                  item.tone && TONE_TEXT[item.tone],
                )}
              >
                {item.value}
              </dd>
              <div className="flex items-center gap-1.5 text-2xs text-subtle">
                {/*
                  状态点：正常=绿、异常=对应警示色（静态，不呼吸 —— §P 的硬约束）。
                  只给**有健康语义**的卡：探测任务与告警规则是配置数量，停用是有意为之。
                */}
                {item.label !== "探测任务" && item.label !== "告警规则" && (
                  <span
                    aria-hidden
                    className={cn(
                      "size-[6px] shrink-0 rounded-full",
                      item.tone ? TONE_DOT[item.tone] : TONE_DOT.ok,
                    )}
                  />
                )}
                <span className="truncate">{item.note}</span>
              </div>
            </div>
          ))}
        </dl>
        )}
        {/*
          「需要处理」从主卡里搬出来，单独占一行。
          搬出来的原因：塞在主卡里会把主卡撑高一大截，逼得旁边 4 张 tile 一起拉伸
          （实测每张 tile 170px 高、内容只有 44.6px，**59% 是空白**）；
          而且它本来就有 3 条，窄卡里会折成两行。整行之后不折行、更好扫。
        */}
        {loaded && topConcerns.length > 0 && (
          <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <WarningCircle className="size-3.5 shrink-0 text-warn-text" />
              需要处理 {concerns.length} 项
            </span>
            <span aria-hidden className="h-3.5 w-px bg-border" />
            {topConcerns.map((concern) => (
              <Link
                key={concern.id + concern.reason}
                to={`?server=${concern.id}`}
                className="rounded-xs text-muted-foreground underline-offset-2 transition-colors dur-2 hover:text-foreground hover:underline"
              >
                <span
                  className={cn(
                    "num",
                    concern.tone === "crit" ? "text-crit-text" : "text-warn-text",
                  )}
                >
                  {concern.name}
                </span>{" "}
                {concern.reason}
              </Link>
            ))}
            <Link
              to="?state=bad"
              className="ml-auto shrink-0 text-muted-foreground underline-offset-2 transition-colors dur-2 hover:text-foreground hover:underline"
            >
              查看全部异常 →
            </Link>
          </div>
        )}

      {/*
        筛选区。三类控件底座原来各不相同、权重分不开：
          · 搜索框   —— 透明底 + 边框（在灰页面上最"轻"）
          · 状态分段 —— 实心灰容器 + 几乎看不出的选中（见 Segmented 的注释）
          · 标签胶囊 —— **每个胶囊各带一圈边框**，高度还比容器矮 4px（h-7 vs 32px 容器内）
        现在两组筛选是**同一类控件**，共用 chipGroupClass + raised 选中态、
        高度统一 32px。§O 的教训是"不同功能的控件不能长得一样"，
        而这里两组本来就是同一功能（筛选），所以各加一个 11px 的组名消歧义
        （两个组都以「全部」开头，不加就不知道指的是哪个）。

        **工具栏本身是"浅灰画布 + 白浮块"（Cards-on-Canvas）**：
        容器用 `--muted`，搜索框与两组筛选的选中块都是白的浮在画布上。
        所以两组筛选**不再各自套灰容器**（画布已经是灰的，再套一层边界就糊了），
        改用一条竖分隔线把"输入"与"筛选"分开 —— 这是 §AV 那条"三级层次"的改写：
        原来刻意避开"画布与控件组同色"，现在反过来把画布提上来、让控件组消失。
      */}
      {/*
        窄屏用**显式 grid**、宽屏回到 flex：
        flex-wrap 在 390 下会把末项「12 台」挤到第四行独占一行（实测：
        标签组 290 + 间距 12 + 计数 30.4 = 332.4，而可用宽正好 332 —— 差 0.4px）。
        0.4px 这种边界不能靠调间距去赌，grid 两列是确定的：
        第一行 [搜索 | 计数]，状态与标签各占一整行。
      */}
      <div className="mt-3 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-lg border bg-canvas p-1.5 sm:flex sm:flex-wrap sm:gap-x-2.5">
        {/*
          窄屏让搜索框 flex-1 与右侧的「12 台」共享一行：
          它原本 w-full 独占一行，导致工具栏多一行、且计数在标签那一行被挤到
          0.4px 之外单独换行（实测 290 + 12 + 30.4 vs 可用 332）。
          flex-1 + min-w-0 让它可收缩，计数就能落在同一行的右端。
        */}
        <div className="relative min-w-0 sm:w-[220px] sm:flex-none">
          <MagnifyingGlass
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、IP、标签"
            aria-label="搜索名称、IP、标签"
            className="h-8 bg-card pl-8 text-xs"
          />
        </div>

        {/* 输入与筛选之间的竖分隔线（参考图里的那条线） */}
        <span
          aria-hidden
          className="hidden h-5 w-px shrink-0 bg-border sm:block"
        />

        <div className="col-span-2 flex items-center gap-2 sm:w-auto">
          {/*
            组名只为消歧义（两组选项都以「全部」开头）。
            只在 xl 才显示是量出来的：1024 下内容区 768px，带组名需要 790px ——
            末项「12 台」会被挤到第二行独占一行、右侧空 96%（实测）。
            不带组名是 722px，正好一行。窄屏同理，每行本来就只放得下一组。
          */}
          <span className="hidden text-2xs text-subtle xl:inline">状态</span>
          <Segmented
            ariaLabel="按状态筛选"
            value={filter}
            onChange={setFilter}
            /* 窄屏撑满一行：否则它单独占一行只用到 38%，是最难看的"孤行" */
            bare
            className="w-full sm:w-fit"
            options={[
              { value: "all", label: "全部" },
              { value: "ok", label: "在线" },
              { value: "bad", label: "异常" },
            ]}
          />
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <span className="hidden text-2xs text-subtle xl:inline">标签</span>
          <div className={chipGroupBareClass} role="group" aria-label="按标签筛选">
            {TAGS.map((item) => (
              <ToggleChip
                key={item}
                variant="raised"
                active={tag === item}
                onClick={() => setTag(item)}
                /* 触屏下撑到 44px（与前台分类胶囊一致：那边写的是 h-7 touch:h-11） */
                className="h-7 touch:h-11"
              >
                {item}
              </ToggleChip>
            ))}
          </div>
        </div>

        {/*
          必须显式指定格子：grid 的自动排布是"顺序游标"，
          前面两个 col-span-2 的组会把游标推到第三行之后，
          末项的计数就被排到第四行去了（实测）。定死第 1 行第 2 列。
        */}
        <span className="num col-start-2 row-start-1 justify-self-end text-2xs text-subtle sm:ml-auto">
          {servers.length} 台
        </span>
      </div>

      {!loaded ? (
        <TableSkeleton rows={8} cols={8} />
      ) : sorted.length === 0 ? (
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
          <div className={TABLE_VIEWPORT}>
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
            {/*
              回到 auto 布局 + `min-w`。

              §AQ 当年从 auto 改成 table-fixed，是因为**那时有 CPU/内存/磁盘 三列进度条**
              需要保证宽度（内容驱动下它们只剩 35/24px）。§AT 把那些列搬走之后，
              这个理由就不存在了，而 table-fixed 留下一个副作用：
              「节点」是唯一没有写死宽度的列 → 它把全部余量吃掉。

              实测：表格内容的自然宽度只有 **704px**，容器 1024px ——
              于是 320px 的余量全堆进节点列（496px 装 176px 的内容，右侧一大片空白）。
              auto 布局会把这 320px **按各列的自然宽度成比例摊开**，
              每列大约多 45%，读起来是"列宽宽松"而不是"某一列空了一块"。

              min-w 取自然宽度：容器比它窄时（≤768）表格横向滚动，
              且**任何一列都不会被压到内容宽度以下** —— 这正是 §AQ 那次的教训。
            */}
            <Table data-testid="admin-table" className="min-w-[716px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3" />
                <SortableHead
                  sortKey="name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onSort={setSort}
                >
                  节点
                </SortableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">
                  地址 / 系统
                </TableHead>
                {/*
                  30 天可用率。窄屏（< lg）隐藏：1024 下已经 8 列，再加一列会开始截断；
                  而这一列的信息在宽屏才有比较价值（一眼看出"谁不稳"）。
                */}
                <SortableHead
                  sortKey="uptime"
                  active={sortKey === "uptime"}
                  dir={sortDir}
                  onSort={setSort}
                  className="hidden lg:table-cell"
                >
                  30 天
                </SortableHead>
                <SortableHead
                  sortKey="agent"
                  active={sortKey === "agent"}
                  dir={sortDir}
                  onSort={setSort}
                >
                  agent
                </SortableHead>
                {/* 维护是配置，直接在列表里开关（行内开关 = 改完立即生效） */}
                <TableHead className="h-9 px-3 text-xs font-medium">维护</TableHead>
                <SortableHead
                  sortKey="lastSeen"
                  active={sortKey === "lastSeen"}
                  dir={sortDir}
                  onSort={setSort}
                >
                  最后上报
                </SortableHead>
                {/* 表头带上口径，否则「关注」是个猜谜的词 */}
                <SortableHead
                  sortKey="concern"
                  active={sortKey === "concern"}
                  dir={sortDir}
                  onSort={setSort}
                >
                  <Tooltip label="占阈值 90% 以上的那一项；都在 90% 以下时留空">
                    <span>关注</span>
                  </Tooltip>
                </SortableHead>
                <TableHead className="h-9 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => (
                <TableRow
                  key={item.id}
                  /*
                    F7：去掉斑马纹。原来"斑马纹 + 行分隔线 + 行 hover"是三套并行的
                    行区分机制 —— 而 Linear / Vercel 这类克制的标杆一条都不用斑马纹，
                    它更接近旧式后台模板。现在只留**分隔线 + hover** 两套。
                  */
                  className="group/row cursor-pointer"
                  onClick={() => setParams({ server: item.id })}
                >
                  <TableCell className="h-11 px-3 py-1.5">
                    <StatusDot status={item.status} />
                  </TableCell>
                  <TableCell className="h-11 px-3 py-1.5">
                    {/*
                      §AQ 把名字与标签堆成两行，是因为那一格只有 132px；
                      监控列搬走之后它有 496px，并排更紧凑、也少一层竖直噪声。
                      行高由「地址 / 系统」那一格（两行）决定，不受这里影响。
                    */}
                    <div className="flex items-center gap-2">
                      {/* 真链接：键盘可达、可中键新开、可复制地址；行点击对鼠标仍然有效 */}
                      <Tooltip label={item.name}>
                        <Link
                          to={`?server=${item.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate rounded-xs text-xs font-medium hover:underline underline-offset-2"
                        >
                          {item.name}
                        </Link>
                      </Tooltip>
                      {/*
                        F6：节点列不再摆标签胶囊。
                        原来一行有 7~8 个带底色/描边的小块（2 个标签胶囊 + OS 胶囊 +
                        agent 徽章 + 开关 + 关注徽章 + ⋯），而且**地区是重复的**：
                        这里一个「香港」胶囊，地址列又写着「… · 香港」。
                        现在地区与用途合并到地址那一行，这一列只留名字。
                      */}
                    </div>
                  </TableCell>
                  <TableCell className="h-11 px-3 py-1.5">
                    {/*
                      两行都用 flex 行，而不是 inline 流：
                      行内元素会按基线对齐，一个 inline-block 的徽章会把行盒从 14px
                      撑到 24.8px（实测），整行行高因此从 50 涨到 62.7 —— 而"保持 50px"
                      是明确的选择。flex 子项没有基线外溢，高度就等于徽章自己的高度。
                    */}
                    <div className="flex items-baseline gap-2">
                      <span className="num truncate text-xs text-muted-foreground">
                        {item.ip}
                      </span>
                      {/*
                        地区 + 用途合成一行纯文本。标签是配置、可能被「编辑标签」改过，
                        所以仍然读 nodeTags 而不是直接读 mock。
                      */}
                      <span className="truncate text-2xs text-subtle">
                        {nodeTags(settings, item.id, item.tags).join(" · ")}
                      </span>
                    </div>
                    {/*
                      F6：系统也改回纯文本 —— 它本来就是次要信息，不值得再占一个底色块。
                      v2：去掉 mt-0.5 —— 两行的 line-height 已经提供了间距，
                      省下这 2px 让整行落进 44px 档（12 行一屏能多看一行）。
                    */}
                    <div className="flex">
                      <Tooltip label={item.os}>
                        <span className="truncate text-2xs text-subtle">
                          {item.os}
                        </span>
                      </Tooltip>
                    </div>
                  </TableCell>
                  {/*
                    v2 的「30 天」列：一条小状态条 + 可用率数字。
                    数字必须以**文字**出现（skill 的可视化规范：不能只靠颜色/hover），
                    整条的状态汇总在 aria-label 里给读屏。
                  */}
                  <TableCell className="hidden h-11 px-3 py-1.5 lg:table-cell">
                    <div className="flex items-center gap-2">
                      <UptimeStrip
                        days={uptimeDaysFor(item.id)}
                        label={item.name}
                        className="w-[54px] shrink-0"
                        segmentClassName="h-3.5"
                      />
                      <span className="num shrink-0 text-2xs text-subtle">
                        {uptimeAvailability(uptimeDaysFor(item.id))}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="h-11 px-3 py-1.5">
                    {/*
                      F6：只有**落后**的才是徽章（要看的异常），同版本的用纯文本。
                      原来每行都有一个 v0.3.1 徽章，12 行就是 12 个没有信息量的底色块。
                    */}
                    {item.agent === LATEST_AGENT ? (
                      <Tooltip label={`最新 v${LATEST_AGENT}`}>
                        <span className="num text-xs text-muted-foreground">
                          v{item.agent}
                        </span>
                      </Tooltip>
                    ) : (
                      <ToneBadge tone="warn" title={`落后于最新 v${LATEST_AGENT}`}>
                        v{item.agent}
                      </ToneBadge>
                    )}
                  </TableCell>
                  <TableCell
                    className="h-11 px-3"
                    // 行本身可点击（打开面板），开关不能把它一起触发
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MaintenanceSwitch server={item} />
                  </TableCell>
                  <TableCell className="h-11 px-3 py-1.5">
                    {/* 离线时"多久没上报"才是要看的数 —— 用 crit 徽章顶出来 */}
                    {item.offline ? (
                      <ToneBadge tone="crit" title="超过离线判定阈值">
                        {formatLastSeen(item.lastSeenSec)}
                      </ToneBadge>
                    ) : (
                      <span className="num text-xs text-muted-foreground">
                        {formatLastSeen(item.lastSeenSec)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="h-11 px-3 py-1.5">
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
                        <ToneBadge
                          tone={concern.over ? "crit" : "warn"}
                          title={`阈值 ${concern.limit}%`}
                        >
                          {concern.label} {Math.round(concern.value)}%
                        </ToneBadge>
                      )
                    })()}
                  </TableCell>
                  {/*
                    行操作在桌面靠 hover 显形，但触屏没有 hover —— 那些设备上
                    这个按钮此前是永久 invisible（仍可点，但看不见）。
                    touch: 下改成常显，顺带把命中区从 24px 撑到 44px。
                  */}
                  <TableCell className="h-11 px-2 py-1.5">
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
                            className="size-7 text-muted-foreground touch:size-11"
                          >
                            <DotsThree className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                      {/*
                        原来第一项是「查看详情」—— 而**点整行就是查看详情**，
                        同一个动作两个入口。删掉，菜单只留"点行做不到的事"。
                      */}
                      <DropdownMenuContent align="end" className="w-36">
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
    </div>
  )
}
