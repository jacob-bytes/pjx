import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  CaretDown,
  CaretLeft,
  CaretRight,
  Cpu,
  HardDrive,
  Info,
  Memory,
  Network,
  ShareNetwork,
  Star,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react"
import { Segmented } from "@/components/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { IconButton } from "@/components/icon-button"
import { StatusDot } from "@/components/status-dot"
import { DASH_CYCLE, TimeSeriesChart } from "@/components/time-series-chart"
import {
  formatBytes,
  formatSpan,
  gb,
  pct,
  percentOfGb,
  rate,
  scaleToBytes,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  historyFor,
  nodes,
  PING_RANGES,
  pingHistoryFor,
  pingLossHistoryFor,
  RANGES,
  rangeStepSeconds,
  uptimeRatio,
  type PublicNode,
  type RangeKey,
} from "@/public/mock"
import {
  DetailSection,
  SummaryField,
} from "@/public/components/detail-section"
import { SiteFooter } from "@/public/components/site-footer"
import { UptimeTimeline } from "@/public/components/uptime-timeline"

/*
  三网 ping 有 6 条线，用【单一蓝的 6 档明度阶梯】而不是 6 个色相。

  这条弯路走过两次：
    1) 最初用 chart-1 → chart-3 做色阶 —— 两个 token 明度只差 0.02，
       实测相邻档亮度差不到 1%，等于六条线一个颜色；
    2) 改成 6 个色相 —— 能分开了，但违反 ink 的核心原则
       「3 语义色收敛，无紫橙青绿噪音」，ink 全站只用一个蓝色画图表线。

  现在是第三条路：一个色相（258 深蓝）拉出 6 档明度，实测最浅档 3.21:1
  （图形需 ≥3:1）、两两最小色距 0.113。单色阶梯的可分性天然弱于多色相
  （0.113 vs 0.171），所以【线型必须同时用上】—— 这也是图表无障碍的硬要求：
  只靠颜色区分对色盲用户无效。颜色 + 线型两个通道乘起来才够 6 条。
*/
const PING_COLORS = [
  "var(--ping-1)",
  "var(--ping-2)",
  "var(--ping-3)",
  "var(--ping-4)",
  "var(--ping-5)",
  "var(--ping-6)",
]

function maxOf(series: number[][], pad = 1.15) {
  const peak = Math.max(1, ...series.flat())
  return peak * pad
}

/**
 * 深链直接打开 ?node= 时的骨架屏。
 * 之前骨架只做在列表分支里，直接打开详情会没有加载态，行为不一致。
 */
export function NodeDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-[7px] rounded-full" />
        <Skeleton className="h-4 w-[160px]" />
        <Skeleton className="ml-auto h-7 w-[120px]" />
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-3.5 h-[148px] rounded-lg" />
      <Skeleton className="mt-3.5 h-[132px] rounded-lg" />
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[196px] rounded-lg" />
        ))}
      </div>
    </div>
  )
}

/**
 * A4：头部节点选择器。
 *
 * 一开始用 cmdk 的 CommandDialog 实现，功能没问题，但**把 cmdk 拖进了前台包**
 * （共享 chunk +25KB gzip）—— 前台首屏从 102.7 涨到 127.3 KB。
 * 为了一个节点选择器付这个代价不值得，改成自带的轻量面板：
 * 一个输入框 + 一个过滤列表，外点/ Esc 关闭，零新依赖。
 */
function NodePicker({
  current,
  onPick,
  children,
}: {
  current: PublicNode
  onPick: (id: string) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return nodes
    return nodes.filter((item) =>
      `${item.name} ${item.country} ${item.category} ${item.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          setQuery("")
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="切换节点"
        className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors dur-2 hover:bg-muted"
      >
        <span className="truncate">{children}</span>
        <CaretDown className="size-3.5 shrink-0 text-subtle" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover shadow-pop">
          <div className="border-b p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索节点、地区、标签…"
              aria-label="搜索节点"
              className="h-8 w-full rounded-[4px] border bg-background px-2.5 text-xs outline-none focus-visible:border-ring"
            />
          </div>
          <ul role="listbox" className="max-h-[320px] overflow-y-auto p-1">
            {matches.length === 0 && (
              <li className="px-2.5 py-6 text-center text-2xs text-subtle">
                没有匹配的节点
              </li>
            )}
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === current.id}
                  onClick={() => {
                    setOpen(false)
                    onPick(item.id)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-xs transition-colors dur-1 hover:bg-accent",
                    item.id === current.id && "bg-accent font-medium",
                  )}
                >
                  <StatusDot status={item.status} />
                  <span className="truncate">{item.name}</span>
                  <span className="num ml-auto shrink-0 text-2xs text-subtle">
                    {item.country} · {item.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function NodeDetail({
  node,
  favorite,
  onToggleFavorite,
  onBack,
  onSelect,
  prev,
  next,
}: {
  node: PublicNode
  favorite: boolean
  onToggleFavorite: (id: string) => void
  onBack: () => void
  onSelect: (id: string) => void
  prev: PublicNode | null
  next: PublicNode | null
}) {
  const [group, setGroup] = useState<"resource" | "ping">("resource")
  const [range, setRange] = useState<RangeKey>("live")
  // 自定义区间的起止（date input 的 value 格式 YYYY-MM-DD）
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [hiddenPing, setHiddenPing] = useState<string[]>([])
  const offline = node.status === "off"

  // custom 档位：由两个日期算出跨度，并让右端对齐结束日期
  const customSpan = (() => {
    if (range !== "custom" || !customFrom || !customTo) return null
    const from = new Date(`${customFrom}T00:00:00`)
    const to = new Date(`${customTo}T23:59:59`)
    const seconds = Math.round((to.getTime() - from.getTime()) / 1000)
    return seconds > 60 ? { seconds, end: to } : null
  })()

  const windowSeconds = customSpan
    ? customSpan.seconds
    : (RANGES.find((item) => item.key === range)?.seconds ?? 60)
  const stepSeconds = customSpan
    ? Math.max(1, Math.round(customSpan.seconds / 180))
    : rangeStepSeconds(range)
  const axisEnd = customSpan?.end

  /*
    这里刻意【不用】 useMemo。
    node 是同一个对象（mock 原地改数据），依赖 [node, range] 永远不变，
    于是 memo 会把首帧结果锁死 —— 而 scaleToBytes 返回的是新数组，
    不像 live 数组那样会被原地更新，结果就是图表永久停在打开页面那一刻。
    历史档的 historyFor 自带缓存，实时档只是取引用，这里重算的代价可以忽略。
  */
  const series = {
    cpu: historyFor(node, "cpu", range, customSpan?.seconds),
    load: historyFor(node, "load", range, customSpan?.seconds),
    mem: scaleToBytes(historyFor(node, "mem", range, customSpan?.seconds), node.memTotal),
    swap: scaleToBytes(historyFor(node, "swap", range, customSpan?.seconds), node.swapTotal),
    disk: scaleToBytes(historyFor(node, "disk", range, customSpan?.seconds), node.diskTotal),
    rx: historyFor(node, "rx", range, customSpan?.seconds),
    tx: historyFor(node, "tx", range, customSpan?.seconds),
    tcp: historyFor(node, "tcp", range, customSpan?.seconds),
    udp: historyFor(node, "udp", range, customSpan?.seconds),
    proc: historyFor(node, "proc", range, customSpan?.seconds),
  }

  const pingSeries = node.ping.map((target) => ({
    target,
    data: pingHistoryFor(node, target, range, customSpan?.seconds),
  }))

    /* 丢包也要有趋势图 —— 之前只有延迟能画，丢包只有一个标量数字 */
    const lossSeries = node.ping.map((target) => ({
      target,
      data: pingLossHistoryFor(node, target, range, customSpan?.seconds),
    }))

    /* 当前档位的采样点数 —— 原来写死用 RANGES 算、custom 还硬编码 180，
       切到「网络延迟」后仍显示资源档位的点数 */
    const activeRanges = group === "ping" ? PING_RANGES : RANGES
    const samplePoints = customSpan
      ? 180
      : (activeRanges.find((item) => item.key === range)?.points ?? 0)


  const visiblePing = pingSeries.filter(
    (item) => !hiddenPing.includes(item.target.id),
  )

  const memTotalBytes = gb(node.memTotal)
  const swapTotalBytes = gb(node.swapTotal)
  const diskTotalBytes = gb(node.diskTotal)
  const trafficTotalBytes = gb(node.trafficTotal)
  const trafficUsedBytes = percentOfGb(
    (node.trafficUsed / (node.trafficTotal * 1024)) * 100,
    node.trafficTotal,
  )
  const memUsedBytes = percentOfGb(node.mem, node.memTotal)
  const swapUsedBytes = percentOfGb(node.swap, node.swapTotal)
  const diskUsedBytes = percentOfGb(node.disk, node.diskTotal)

  const dayCount = node.uptimeDays.length

  return (
    <>
    <div className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6">
      {/* 返回 + 标题行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <IconButton label="返回节点列表" onClick={onBack} className="-m-1">
          <ArrowLeft className="size-4" />
        </IconButton>

        <StatusDot status={node.status} />
        <h1 className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
          <NodePicker current={node} onPick={onSelect}>
            {node.name}
          </NodePicker>
        </h1>
        {/* 国家徽章窄屏隐藏：给右侧的收藏/上一个/下一个腾出同行空间，
            否则整簇会换到第二行、左边留一大片空 */}
        <span className="num hidden shrink-0 rounded-[3px] border px-1 text-2xs leading-4 text-subtle sm:inline">
          {node.country}
        </span>
        <span
          className="hidden truncate text-2xs text-subtle sm:inline"
          title={node.tags.join(" · ")}
        >
          {node.tags.join(" · ")}
        </span>

        <div className="ml-auto flex items-center gap-1">
            <IconButton
              label={favorite ? "取消收藏" : "收藏节点"}
              aria-pressed={favorite}
              onClick={() => onToggleFavorite(node.id)}
              className={cn("-m-1", favorite ? "text-brand" : undefined)}
            >
            <Star
              className="size-4"
              weight={favorite ? "fill" : "light"}
            />
          </IconButton>

          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />

          <IconButton
            label="上一个节点"
            disabled={!prev}
            onClick={() => prev && onSelect(prev.id)}
          >
            <CaretLeft className="size-4" />
          </IconButton>
          <IconButton
            label="下一个节点"
            disabled={!next}
            onClick={() => next && onSelect(next.id)}
          >
            <CaretRight className="size-4" />
          </IconButton>
          <span className="ml-1 hidden text-2xs text-subtle sm:inline">
            {node.category}
          </span>
        </div>
      </div>

      {/* 紧凑信息摘要：一张卡、两列、八格（对齐 ink 改版后的详情页头） */}
      <DetailSection title="设备信息" icon={Info} className="mt-3.5">
        {/*
          任务 1：按"变化频率"分两行 ——
          第一行是几乎不变的静态信息，第二行是每秒都在动的动态指标。
          眼睛扫的时候先落在静态信息上定位，再往下看动态值，不会混在一起。
        */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 静态 */}
          <SummaryField
            label="系统"
            value={node.os}
            sub={`内核 ${node.kernel}`}
          />
          <SummaryField
            label="CPU"
            value={node.cpuModel}
            sub={`${node.virt} · ${node.arch}`}
          />
          <SummaryField
            label="运行时长"
            value={node.uptime}
            sub={`最后上报 ${node.lastReport || "—"}`}
          />
          <SummaryField
            label="续费"
            value={node.billing}
            sub={`剩余 ${node.expireDays} 天`}
          />

          {/* 动态 */}
          <SummaryField
            label="内存"
            value={offline ? "—" : `${formatBytes(memUsedBytes)} / ${formatBytes(memTotalBytes)}`}
            sub={offline ? undefined : `Swap ${formatBytes(swapUsedBytes)} / ${formatBytes(swapTotalBytes)}`}
            ratio={offline ? 0 : node.mem}
            tone={node.mem >= 90 ? "bg-warn" : "bg-chart-3"}
          />
          <SummaryField
            label="硬盘"
            value={offline ? "—" : `${formatBytes(diskUsedBytes)} / ${formatBytes(diskTotalBytes)}`}
            sub={offline ? undefined : `已用 ${pct(node.disk)}`}
            ratio={offline ? 0 : node.disk}
            tone={node.disk >= 85 ? "bg-warn" : "bg-chart-2"}
          />
          <SummaryField
            label="流量"
            value={offline ? "—" : `${formatBytes(trafficUsedBytes)} / ${formatBytes(trafficTotalBytes)}`}
            sub={offline ? undefined : `↑ ${rate(node.rx)} · ↓ ${rate(node.tx)} MB/s`}
            ratio={offline ? 0 : (trafficUsedBytes / trafficTotalBytes) * 100}
            tone="bg-chart-1"
          />
          <SummaryField
            label="负载"
            value={offline ? "—" : node.load.toFixed(2)}
            sub={
              offline
                ? undefined
                : `${(node.load * 1.4).toFixed(2)} · ${(node.load * 1.8).toFixed(2)} · CPU ${pct(node.cpu)}`
            }
            ratio={offline ? 0 : node.cpu}
            tone={node.cpu >= 85 ? "bg-warn" : "bg-chart-1"}
          />
        </div>
      </DetailSection>

      {/* 在线状态时间轴 */}
      <DetailSection
        title={`在线状态时间轴 · ${dayCount} 天`}
        icon={Waveform}
        className="mt-3.5"
        extra={
          <span className="text-2xs text-subtle">
            近 7 天 {uptimeRatio(node.uptimeDays, 7).toFixed(1)}%
          </span>
        }
      >
        <UptimeTimeline days={node.uptimeDays} />
      </DetailSection>

      {/*
        时间范围 + 采样说明 + 分组切换，合成一行。
        原来这是上下两行、两个长得一模一样的带框分段控件，三个问题：
          1. 两行占掉约 76px，图表被推下去
          2. 两个控件视觉权重相同，看不出"看哪段时间"和"看哪类指标"是两件事
          3. 采样说明紧贴时间控件（gap-2），读起来像控件自身的一部分
        现在：范围在左（主）、说明跟在后面（解释）、切换靠右且形态更轻（次）。
      */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          ariaLabel="时间范围"
          value={range}
          onChange={setRange}
          /*
            延迟/丢包没有「实时」档 —— 探测按固定周期跑（PING_INTERVAL_SECONDS），
            最新一条数据本身就可能已经过期，给个实时档是撒谎。
            资源类图表仍是原来的档位（那些确实是每秒采一次）。
          */
          options={(group === "ping" ? PING_RANGES : RANGES).map((item) => ({
            value: item.key,
            label: item.label,
          }))}
        />

        {range === "custom" && (
          <span className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => setCustomFrom(event.target.value)}
              aria-label="起始日期"
              className="num h-7 rounded-[4px] border bg-card px-2 text-2xs"
            />
            <span aria-hidden>→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => setCustomTo(event.target.value)}
              aria-label="结束日期"
              className="num h-7 rounded-[4px] border bg-card px-2 text-2xs"
            />
            {!customSpan && (
              <span className="text-warn-text">两个日期都选上才有数据</span>
            )}
          </span>
        )}

        {/* 采样说明：解释数据粒度。极轻的字色，不和控件抢 */}
        <span className="num hidden text-2xs text-subtle sm:inline">
          {samplePoints} 个采样点
          {stepSeconds > 1 ? ` · 每点 ${formatSpan(stepSeconds)}` : " · 每秒"}
        </span>

        {/*
          分组切换靠右，用更轻的形态（无底无边、hover 才出底）——
          它比"看哪段时间"低一档；两个同款带框控件并排会把层级压平。
        */}
        {/*
          分组切换回到 Segmented，与左侧时间范围同一种形态。
          上一版降级成纯文字 tab 是错的：没有容器边界就不像一个控件，
          而且选中态只靠字色 —— 只凭颜色传达状态违反 WCAG 1.4.1。
          两者本来就是同一层级的交互（都是"切换看什么"），
          做成两种形态是在暗示一个不存在的层级差。
        */}
                <div className="sm:ml-auto">
          <Segmented
            ariaLabel="图表分组"
            value={group}
            onChange={setGroup}
            options={[
              { value: "resource", label: "资源" },
              { value: "ping", label: "网络延迟" },
            ]}
          />
        </div>
      </div>

      {group === "resource" && (
        <div className="mt-3">
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <DetailSection
              title="CPU 与负载"
              icon={Cpu}
              extra={
                <span className="num text-2xs">
                  {offline ? "—" : pct(node.cpu)}
                </span>
              }
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={100}
                rightMax={maxOf([series.load])}
                leftFormat={(value) => `${value.toFixed(0)}%`}
                rightFormat={(value) => value.toFixed(2)}
                ariaLabel="CPU 使用率与负载"
                series={[
                  {
                    key: "cpu",
                    label: "CPU %",
                    data: offline ? [] : series.cpu,
                    color: "var(--chart-1)",
                    // 多序列图不铺面积（ink：去掉大面积 areaStyle），避免叠线互相糊
                  },
                  {
                    key: "load",
                    label: "负载",
                    data: offline ? [] : series.load,
                    color: "var(--chart-3)",
                    axis: "right",
                  },
                ]}
              />
            </DetailSection>

            <DetailSection
              title="内存与 Swap"
              icon={Memory}
              extra={
                <span className="num text-2xs">
                  {offline
                    ? "—"
                    : `${formatBytes(memUsedBytes)} · ${formatBytes(swapUsedBytes)}`}
                </span>
              }
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={Math.max(memTotalBytes, swapTotalBytes) * 1.08}
                leftFormat={(value) => formatBytes(value, value >= gb(1) ? 1 : 0)}
                ariaLabel="内存与 Swap 使用量"
                series={[
                  {
                    key: "mem",
                    label: "内存",
                    data: offline ? [] : series.mem,
                    color: "var(--chart-3)",
                    // 多序列图不铺面积（ink：去掉大面积 areaStyle），避免叠线互相糊
                  },
                  {
                    key: "mem-total",
                    label: "内存总量",
                    data: series.mem.map(() => memTotalBytes),
                    color: "var(--chart-3)",
                    reference: true,
                  },
                  {
                    key: "swap",
                    label: "Swap",
                    data: offline ? [] : series.swap,
                    color: "var(--chart-2)",
                  },
                  {
                    key: "swap-total",
                    label: "Swap 总量",
                    data: series.swap.map(() => swapTotalBytes),
                    color: "var(--chart-2)",
                    reference: true,
                  },
                ]}
              />
            </DetailSection>

            <DetailSection
              title="磁盘"
              icon={HardDrive}
              extra={
                <span className="num text-2xs">
                  {offline
                    ? "—"
                    : `${formatBytes(diskUsedBytes)} · ${formatBytes(diskTotalBytes)}`}
                </span>
              }
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={diskTotalBytes * 1.08}
                leftFormat={(value) => formatBytes(value, value >= gb(1) ? 1 : 0)}
                ariaLabel="磁盘使用量"
                series={[
                  {
                    key: "disk",
                    label: "磁盘已用",
                    data: offline ? [] : series.disk,
                    color: node.disk > 85 ? "var(--warn)" : "var(--chart-2)",
                    fill: true,
                  },
                  {
                    key: "disk-total",
                    label: "磁盘总量",
                    data: series.disk.map(() => diskTotalBytes),
                    color: "var(--chart-2)",
                    reference: true,
                  },
                ]}
              />
            </DetailSection>

            <DetailSection
              title="实时网络"
              icon={Network}
              extra={
                <span className="num text-2xs">
                  {offline
                    ? "—"
                    : `↓ ${rate(node.rx)} · ↑ ${rate(node.tx)} MB/s`}
                </span>
              }
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={maxOf([series.rx, series.tx])}
                leftFormat={(value) => rate(value)}
                ariaLabel="上下行速率"
                series={[
                  {
                    key: "rx",
                    label: "下行 MB/s",
                    data: offline ? [] : series.rx,
                    color: "var(--chart-4)",
                    // 多序列图不铺面积（ink：去掉大面积 areaStyle），避免叠线互相糊
                  },
                  {
                    key: "tx",
                    label: "上行 MB/s",
                    data: offline ? [] : series.tx,
                    color: "var(--chart-5)",
                  },
                ]}
              />
            </DetailSection>

            <DetailSection
              title="网络连接"
              icon={ShareNetwork}
              extra={
                <span className="num text-2xs">
                  TCP {node.tcp} · UDP {node.udp}
                </span>
              }
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={maxOf([series.tcp, series.udp])}
                leftFormat={(value) => value.toFixed(0)}
                ariaLabel="TCP 与 UDP 连接数"
                series={[
                  {
                    key: "tcp",
                    label: "TCP",
                    data: offline ? [] : series.tcp,
                    color: "var(--chart-3)",
                    // 多序列图不铺面积（ink：去掉大面积 areaStyle），避免叠线互相糊
                  },
                  {
                    key: "udp",
                    label: "UDP",
                    data: offline ? [] : series.udp,
                    color: "var(--chart-1)",
                  },
                ]}
              />
            </DetailSection>

            <DetailSection
              title="进程"
              icon={Waveform}
              extra={<span className="num text-2xs">{node.proc}</span>}
            >
              <TimeSeriesChart
                height={150}
                windowSeconds={windowSeconds}
                endTime={axisEnd}
                leftMax={maxOf([series.proc])}
                leftFormat={(value) => value.toFixed(0)}
                ariaLabel="进程数"
                series={[
                  {
                    key: "proc",
                    label: "进程数",
                    data: offline ? [] : series.proc,
                    color: "var(--chart-1)",
                    fill: true,
                  },
                ]}
              />
            </DetailSection>
          </div>
        </div>
      )}

      {group === "ping" && (
        <div className="mt-3 space-y-2.5">
        <DetailSection
          title="三网延迟"
          icon={Network}
          className="mt-3.5"
          extra={
            <button
              type="button"
              onClick={() =>
                setHiddenPing(
                  hiddenPing.length === 0
                    ? node.ping.map((target) => target.id)
                    : [],
                )
              }
              className="text-2xs text-muted-foreground transition-colors dur-2 hover:text-foreground"
            >
              {hiddenPing.length === 0 ? "全不选" : "全选"}
            </button>
          }
          bodyClassName="p-2.5"
        >
          <div className="flex flex-wrap gap-1.5">
            {node.ping.map((target, index) => {
              const hidden = hiddenPing.includes(target.id)
              return (
                <button
                  key={target.id}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() =>
                    setHiddenPing((current) =>
                      current.includes(target.id)
                        ? current.filter((id) => id !== target.id)
                        : [...current, target.id],
                    )
                  }
                  /* A7：改成轻量 pill（ink：任务统计卡改为轻量列表 / pill，去掉大卡片 hover 变色） */
                  className={cn(
                    "rounded-full px-3 py-1.5 text-left transition-colors dur-2",
                    hidden
                      ? "bg-muted/50 opacity-55"
                      : "bg-muted/60 hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-[2px] w-3.5 shrink-0 rounded-full"
                      style={{
                        background: hidden
                          ? "var(--border-strong)"
                          : `repeating-linear-gradient(90deg, ${PING_COLORS[index % PING_COLORS.length]} 0 3px, transparent 3px 5px)`,
                      }}
                    />
                    <span
                      className="truncate text-2xs text-muted-foreground"
                      title={target.label}
                    >
                      {target.label}
                    </span>
                    <span className="num ml-auto flex items-baseline gap-0.5">
                      <span className="text-sm font-medium">
                        {offline ? "—" : Math.round(target.value)}
                      </span>
                      {!offline && <span className="text-2xs text-subtle">ms</span>}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </DetailSection>

        <DetailSection
          title="延迟趋势"
          icon={Waveform}
          className="mt-3.5"
          extra={
            <span className="text-2xs text-subtle">
              单位 ms · 已选 {visiblePing.length} / {node.ping.length}
            </span>
          }
        >
          <TimeSeriesChart
            height={220}
            windowSeconds={windowSeconds}
              endTime={axisEnd}
            leftMax={maxOf(visiblePing.map((item) => item.data))}
            leftFormat={(value) => value.toFixed(0)}
            /*
              丢包事件带：延迟图底部标出"哪一刻丢了包"。
              没有做成第二条曲线 —— 延迟 ms、丢包 %，双 Y 轴的"相关性"完全取决于
              两个轴怎么缩放，是 dataviz 里公认的反模式。事件带不引入第二个刻度。
            */
            bands={[
              {
                key: "loss",
                label: "丢包时刻",
                color: "var(--chart-5)",
                // 六条线路取最大值：只要有一条丢了就标出来，强度按 2% 封顶
                data:
                  lossSeries[0]?.data.map((_, index) =>
                    Math.min(
                      1,
                      Math.max(
                        ...lossSeries.map((item) => (item.data[index] ?? 0) / 2),
                      ),
                    ),
                  ) ?? [],
              },
            ]}
            ariaLabel="各线路延迟趋势"
            series={visiblePing.map((item) => {
              const index =
                node.ping.findIndex((t) => t.id === item.target.id) %
                PING_COLORS.length
              return {
                key: item.target.id,
                label: item.target.label,
                data: item.data,
                color: PING_COLORS[index],
                // 颜色 + 线型双通道，避免 6 条线只靠颜色区分
                dash: DASH_CYCLE[Math.floor(index / 2) % DASH_CYCLE.length],
              }
            })}
          />
          {visiblePing.length === 0 && (
            <p className="py-6 text-center text-2xs text-subtle">
              所有线路都已隐藏，点上方的「全选」恢复。
            </p>
          )}
          </DetailSection>

          {/* 丢包率单独一张图：与延迟共用同一套线路选择，但量纲不同（% vs ms），
              合在一张图里要靠双 Y 轴，12 条线反而看不清 */}
          <DetailSection
            title="丢包率"
            icon={WarningCircle}
            className="mt-3.5"
            extra={
              <span className="text-2xs text-subtle">
                单位 % · 已选 {visiblePing.length} / {node.ping.length}
              </span>
            }
          >
            <TimeSeriesChart
              height={180}
              windowSeconds={windowSeconds}
              endTime={axisEnd}
              leftMax={Math.max(
                0.5,
                maxOf(
                  lossSeries
                    .filter((item) => !hiddenPing.includes(item.target.id))
                    .map((item) => item.data),
                ),
              )}
              leftFormat={(value) => value.toFixed(1)}
              ariaLabel="各线路丢包率"
              series={lossSeries
                .filter((item) => !hiddenPing.includes(item.target.id))
                .map((item) => {
                  const index =
                    node.ping.findIndex((t) => t.id === item.target.id) %
                    PING_COLORS.length
                  return {
                    key: item.target.id,
                    label: item.target.label,
                    data: item.data,
                    color: PING_COLORS[index],
                    dash: DASH_CYCLE[Math.floor(index / 2) % DASH_CYCLE.length],
                  }
                })}
            />
          </DetailSection>
        </div>
      )}
    </div>

    <SiteFooter
      note={<>历史曲线为降采样 · {formatSpan(windowSeconds)}窗口</>}
    />
    </>
  )
}
