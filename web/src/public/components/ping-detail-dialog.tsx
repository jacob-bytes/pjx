import { Fragment, useState } from "react"
import { X } from "@phosphor-icons/react"
import { Modal } from "@/components/modal"
import { Segmented } from "@/components/segmented"
import { IconButton } from "@/components/icon-button"
import { TimeSeriesChart } from "@/components/time-series-chart"
import { formatSpan } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  PING_INTERVAL_SECONDS,
  pingHistoryFor,
  pingLossHistoryFor,
  PING_RANGES,
  type PublicNode,
  type RangeKey,
} from "@/public/mock"

/** 与详情页保持一致：6 条线的颜色阶梯 + 线型双通道 */
const COLORS = [
  "var(--ping-1)",
  "var(--ping-2)",
  "var(--ping-3)",
  "var(--ping-4)",
  "var(--ping-5)",
  "var(--ping-6)",
]
const DASH = [undefined, "6 3", "2 3", "8 3 2 3"]

const TABS = [
  { key: "latency", label: "延迟" },
  { key: "loss", label: "丢包" },
] as const

/** 一段序列的最小 / 最大 / 平均，供悬浮面板使用 */
function statsOf(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  return {
    min: Math.round(min),
    max: Math.round(max),
    avg: Math.round(sum / values.length),
  }
}

/** 波动 = 相邻采样点差值的平均绝对值，比标准差更贴近"抖动"的直觉 */
function jitter(values: number[]) {
  if (values.length < 2) return 0
  let sum = 0
  for (let i = 1; i < values.length; i++) sum += Math.abs(values[i] - values[i - 1])
  return sum / (values.length - 1)
}

/**
 * 单台节点的延迟 / 丢包详情。
 *
 * 由节点卡上的「延迟」「丢包」小块点开 —— 那两块每秒刷新的小图只够看趋势，
 * 看不出"哪条线路在抖""丢包是哪条"，所以需要一个能看细节的地方。
 * 这也是节点卡不必再塞更多内容的理由。
 */
export function PingDetailDialog({
  node,
  metric,
  onClose,
}: {
  node: PublicNode | null
  metric: "latency" | "loss" | null
  onClose: () => void
}) {
  const [range, setRange] = useState<RangeKey>("1h")
  const [tab, setTab] = useState<"latency" | "loss">("latency")
  const [hidden, setHidden] = useState<string[]>([])

  const open = node !== null && metric !== null
  if (!open || !node) {
    return <Modal open={false} onClose={onClose}>{null}</Modal>
  }

  const windowSeconds = PING_RANGES.find((item) => item.key === range)?.seconds ?? 3600
  const endTime = new Date(node.lastReport || Date.now())

  const rows = node.ping.map((target, index) => ({
    target,
    index,
    latency: pingHistoryFor(node, target, range),
    loss: pingLossHistoryFor(node, target, range),
  }))
  const shown = rows.filter((row) => !hidden.includes(row.target.id))

  const seriesOf = (key: "latency" | "loss") =>
    shown.map((row) => ({
      key: row.target.id,
      label: row.target.label,
      data: key === "latency" ? row.latency : row.loss,
      color: COLORS[row.index % COLORS.length],
      dash: DASH[Math.floor(row.index / 2) % DASH.length],
    }))

  const maxOf = (key: "latency" | "loss") =>
    Math.max(
      key === "loss" ? 0.5 : 10,
      ...shown.flatMap((row) => (key === "latency" ? row.latency : row.loss)),
    )

  return (
    <Modal open={open} onClose={onClose} labelledBy="ping-dialog-title">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col">
        {/* 头部 */}
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id="ping-dialog-title" className="truncate text-sm font-medium">
              {node.name} · 延迟 / 丢包
            </h2>
            <p className="mt-0.5 text-2xs text-subtle">
              探测任务延迟、丢包率与波动统计 ·{" "}
              <span className="num">{PING_INTERVAL_SECONDS}s</span> 一次探测
            </p>
          </div>
          <IconButton label="关闭" onClick={onClose} className="ml-auto -my-1">
            <X className="size-3.5" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* 时间范围 + 指标切换 */}
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              ariaLabel="时间范围"
              value={range}
              onChange={setRange}
              options={PING_RANGES.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
            />
            <div className="ml-auto flex items-center gap-2">
              <Segmented
                ariaLabel="指标"
                value={tab}
                onChange={setTab}
                options={TABS.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
              />
              <button
                type="button"
                onClick={() =>
                  setHidden(
                    hidden.length === 0 ? node.ping.map((t) => t.id) : [],
                  )
                }
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground"
              >
                {hidden.length === 0 ? "全不选" : "全选"}
              </button>
            </div>
          </div>

          {/*
            每条线路一张小卡。取值对齐 ink 的 PingChart.vue：
            - 网格 4 列而不是 6 列（6 列时每张太窄，指标挤成两行）
            - 色块是**竖条**（h-3 w-1）而不是横线 —— 竖条更像素引标记
            - 名称 text-xs font-medium，指标**一行三段**用 · 分隔
            - 未选中降到 opacity-30（原来是 45，选中/未选中的对比不够）
          */}
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {rows.map((row) => {
              const off = hidden.includes(row.target.id)
              const color = COLORS[row.index % COLORS.length]
              const stat = statsOf(row.latency)
              return (
                <div
                  key={row.target.id}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2.5 rounded-md bg-muted/60 px-2.5 py-2",
                    "transition-colors dur-2 hover:bg-muted",
                    off && "opacity-30",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={!off}
                    aria-label={`${off ? "显示" : "隐藏"} ${row.target.label}`}
                    onClick={() =>
                      setHidden((current) =>
                        current.includes(row.target.id)
                          ? current.filter((id) => id !== row.target.id)
                          : [...current, row.target.id],
                      )
                    }
                    className="absolute inset-0 rounded-md focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                  />
                  {/* 竖条色块：与图表线型一一对应 */}
                  <span
                    aria-hidden
                    className="h-3 w-1 shrink-0 rounded-[2px]"
                    style={{
                      background: off ? "var(--border-strong)" : color,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">
                        {row.target.label}
                      </span>
                      {/* ⓘ 悬浮看分布。用纯 CSS 的 group-hover，不引 tooltip 组件 */}
                      <span
                        aria-hidden
                        className="ml-auto grid size-4 shrink-0 cursor-help place-items-center rounded-full text-[10px] text-muted-foreground/60"
                      >
                        ⓘ
                      </span>
                    </div>
                    <div className="num mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {Math.round(row.target.value)}ms
                      </span>
                      <span className="opacity-60">·</span>
                      <span>{row.target.loss.toFixed(2)}%</span>
                      <span className="opacity-60">·</span>
                      <span>{jitter(row.latency).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* 悬浮面板：最小 / 最大 / 平均 / 抖动 */}
                  <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-max rounded-md border bg-popover px-2.5 py-2 shadow-pop group-hover:block">
                    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-2xs">
                      {(
                        [
                          ["最小", `${stat.min} ms`],
                          ["最大", `${stat.max} ms`],
                          ["平均", `${stat.avg} ms`],
                          ["抖动", jitter(row.latency).toFixed(2)],
                        ] as const
                      ).map(([label, value]) => (
                        <Fragment key={label}>
                          <span className="text-muted-foreground">{label}</span>
                          <span className="num text-right font-medium">
                            {value}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 趋势图。套一层带边框的圆角容器（ink 是 rounded-xl border p-4）——
              图例落在这个容器里，和图表成为一个整体，不再飘在页面背景上 */}
          <div className="mt-4 rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">
                {tab === "latency" ? "延迟趋势" : "丢包率趋势"}
              </span>
              <span className="text-2xs text-subtle">
                单位 {tab === "latency" ? "ms" : "%"} · 已选 {shown.length} /{" "}
                {node.ping.length} · {formatSpan(windowSeconds)}窗口
              </span>
            </div>
            <TimeSeriesChart
              height={200}
              windowSeconds={windowSeconds}
              endTime={endTime}
              leftMax={maxOf(tab)}
              leftFormat={(value) =>
                tab === "latency" ? value.toFixed(0) : value.toFixed(1)
              }
              ariaLabel={tab === "latency" ? "各线路延迟趋势" : "各线路丢包率趋势"}
              series={seriesOf(tab)}
            />
            {shown.length === 0 && (
              <p className="py-6 text-center text-2xs text-subtle">
                所有线路都已隐藏，点右上角「全选」恢复。
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
