import { useMemo, useState } from "react"
import { Star } from "@phosphor-icons/react"
import { tooltipShell } from "@/components/chart-tooltip"
import { IconButton } from "@/components/icon-button"
import { ResourceBar } from "@/components/resource-bar"
import { StatusDot } from "@/components/status-dot"
import { pct, rate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PublicNode } from "@/public/mock"


function Metric({
  label,
  value,
  ratio,
  tone,
  detail,
  valueClassName,
}: {
  label: string
  value: string
  ratio: number
  tone: string
  detail: string
  /** 数值本身的颜色。ink 的流量值会按阈值变色，其余指标保持中性 */
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-2xs text-muted-foreground">{label}</span>
        <span className={cn("num text-xs font-medium", valueClassName)}>
          {value}
        </span>
      </div>
      {/* 与后台总览表格共用同一条进度条实现（见 components/resource-bar.tsx） */}
      <ResourceBar value={ratio} tone={tone} inactive={ratio <= 0} className="mt-1" />
      <div className="num mt-1 truncate text-2xs text-subtle">{detail}</div>
    </div>
  )
}

/**
 * 历史直方图。
 *
 * 原来是 40 根 1.6 宽 × 8 高的细条挤在 ~114px 里，一眼看过去像打了马赛克。
 * 现在：**降采样到 20 格**（取每两格的最大值 —— 延迟/丢包关心的就是峰值），
 * 变矮变粗（6px 高、每根约 4px 宽），颜色加深，并支持 hover 看具体数值。
 */
function MiniBars({
  values,
  tone,
  label,
  unit,
  bucketSeconds = 2,
}: {
  values: number[]
  tone: (value: number) => string
  label: string
  unit: string
  bucketSeconds?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  // 每两格合成一格，取最大值
  const bars = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < values.length; i += 2) {
      out.push(Math.max(values[i] ?? 0, values[i + 1] ?? 0))
    }
    return out
  }, [values])

  const pitch = 3
  const height = 6
  const width = bars.length * pitch

  const indexFrom = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    return Math.min(bars.length - 1, Math.max(0, Math.floor(ratio * bars.length)))
  }

  const hovered = hover === null ? null : bars[hover]
  const secondsAgo = hover === null ? 0 : (bars.length - 1 - hover) * bucketSeconds

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-3 w-full touch-pan-y rounded-sm bg-muted/40 p-0.5"
        aria-hidden
        onPointerMove={(event) => {
          const index = indexFrom(event)
          // 只在跨越格子时更新，避免每帧重渲染整张卡
          if (index !== hover) setHover(index)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {bars.map((value, index) => (
          <rect
            key={index}
            x={index * pitch}
            y={0}
            width={2.2}
            height={height}
            rx={0.6}
            className={cn(
              tone(value),
              index === hover
                ? "opacity-100"
                : index === bars.length - 1
                  ? "opacity-90"
                  : "opacity-70",
            )}
          />
        ))}
      </svg>

      {hovered !== null && (
        <div
          className={cn(tooltipShell("popover"), "-top-7 px-1.5 py-0.5")}
          style={{
            left: `${((hover! + 0.5) / bars.length) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="num text-foreground">
            {hovered >= 100 ? Math.round(hovered) : hovered.toFixed(1)}
          </span>{" "}
          <span className="text-subtle">{unit}</span>
          <span className="text-subtle"> · {secondsAgo} 秒前</span>
        </div>
      )}
      <span className="sr-only">
        {label}历史：最近 {bars.length} 格，
        {bars.length > 0 ? `最新 ${bars[bars.length - 1].toFixed(1)} ${unit}` : ""}
      </span>
    </div>
  )
}

function ispTone(value: number) {
  if (value >= 200) return "text-warn-text"
  if (value >= 100) return "text-info-text"
  return "text-ok-text"
}

function latencyTone(value: number) {
  if (value >= 200) return "text-crit-text"
  if (value >= 100) return "text-warn-text"
  return "text-foreground"
}

function latencyBarTone(value: number) {
  if (value >= 200) return "fill-crit/85"
  if (value >= 100) return "fill-warn/90"
  return "fill-ok/80"
}

function lossBarTone(value: number) {
  if (value >= 1.5) return "fill-crit/85"
  if (value >= 0.5) return "fill-warn/90"
  return "fill-ok/50"
}

export function NodeCard({
  node,
  favorite,
  onToggleFavorite,
  onOpen,
  onOpenPing,
}: {
  node: PublicNode
  favorite: boolean
  onToggleFavorite: (id: string) => void
  onOpen: (id: string) => void
  /** 点「延迟」「丢包」小块时打开详情弹窗 */
  onOpenPing?: (metric: "latency" | "loss") => void
}) {
  const offline = node.status === "off"
  const trafficPercent =
    node.trafficTotal > 0
      ? (node.trafficUsed / (node.trafficTotal * 1024)) * 100
      : 0
  const usedMem =
    ((node.mem / 100) * node.memTotal).toFixed(1) + " GB / " + node.memTotal + " GB"
  const usedDisk =
    ((node.disk / 100) * node.diskTotal).toFixed(1) + " GB / " + node.diskTotal + " GB"
  const statusText = offline
    ? "离线"
    : node.status === "warn"
      ? "告警"
      : node.status === "crit"
        ? "严重"
        : "在线"
  const statusTone =
    node.status === "warn"
      ? "text-warn-text"
      : node.status === "crit"
        ? "text-crit-text"
        : "text-subtle"

  const cpuTone = offline
    ? "bg-subtle/30"
    : node.cpu >= 85
      ? "bg-warn"
      : "bg-chart-1"
  const memTone = offline
    ? "bg-subtle/30"
    : node.mem >= 90
      ? "bg-warn"
      : "bg-chart-3"
  const diskTone = offline
    ? "bg-subtle/30"
    : node.disk >= 85
      ? "bg-warn"
      : "bg-chart-2"
  const trafficTone = offline
    ? "bg-subtle/30"
    : trafficPercent >= 90
      ? "bg-warn"
      : "bg-chart-4"

  return (
    <article
      data-testid="node-card"
      onClick={() => onOpen(node.id)}
      className={cn(
        "card flex cursor-pointer flex-col gap-0 px-3.5 pt-2.5 pb-3.5 transition-colors dur-2 hover:border-border-strong",
        offline && "opacity-75",
      )}
    >
      <div className="flex items-center gap-1.5">
        {/* 用 StatusDot 而不是裸 span：C4 色觉友好模式才有形状通道，
            顺带拿到 aria-label（裸 span 对读屏是完全沉默的） */}
        <StatusDot status={node.status} />
        <h2 className="min-w-0 truncate leading-tight">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(node.id)
            }}
            className="max-w-full truncate rounded-xs text-xs font-medium underline-offset-2 hover:underline"
            title={node.name}
          >
            {node.name}
          </button>
        </h2>
        <span className="num shrink-0 rounded-xs border px-1 text-2xs leading-4 text-subtle">
          {node.country}
        </span>
        {/*
          状态文字只在异常时出现，且放在标题行 ——
          在线是常态，顶部状态点已经表明；异常则因为整排只有它带文字而一眼跳出。
          放标题行比原来放在灰字元信息行里显眼得多。
        */}
        {statusText !== "在线" && (
          <span className={cn("shrink-0 text-2xs font-medium", statusTone)}>
            {statusText}
          </span>
        )}
        <IconButton
          label={favorite ? "取消收藏" : "收藏节点"}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite(node.id)
          }}
          /* -my-2：按钮命中区保持 32px，但不让它在 flex 行里撑高 ——
             否则这一行会被撑到 32px，文字上下各多出约 8px 空白 */
          className={cn("-my-2 -mr-1 ml-auto", favorite && "text-brand")}
          aria-label={favorite ? "取消收藏" : "收藏节点"}
          aria-pressed={favorite}
        >
          <Star
            className="size-3.5"
            weight={favorite ? "fill" : "light"}
          />
        </IconButton>
      </div>


      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric
          label="CPU"
          value={offline ? "—" : pct(node.cpu)}
          ratio={offline ? 0 : node.cpu}
          tone={cpuTone}
          detail={
            offline
              ? "—"
              : `负载 ${node.load.toFixed(2)}, ${(node.load * 1.4).toFixed(2)}, ${(node.load * 1.8).toFixed(2)}`
          }
        />
        <Metric
          label="内存"
          value={offline ? "—" : pct(node.mem)}
          ratio={offline ? 0 : node.mem}
          tone={memTone}
          detail={offline ? "—" : usedMem}
        />
        <Metric
          label="硬盘"
          value={offline ? "—" : pct(node.disk)}
          ratio={offline ? 0 : node.disk}
          tone={diskTone}
          detail={offline ? "—" : usedDisk}
        />
        <Metric
          label="流量"
          value={offline ? "—" : pct(trafficPercent)}
          /* ink 会按用量给流量值上色：<60% 正常、60~80% 提醒、≥80% 警告 */
          valueClassName={
            offline
              ? undefined
              : trafficPercent >= 80
                ? "text-warn-text"
                : trafficPercent >= 60
                  ? "text-warn-text"
                  : "text-ok-text"
          }
          ratio={offline ? 0 : trafficPercent}
          tone={trafficTone}
          detail={
            offline
              ? "—"
              : node.trafficUsed.toFixed(1) +
                " GB / " +
                node.trafficTotal.toFixed(1) +
                " TB"
          }
        />
      </div>

      {/* 任务 4：上下行速率 / 上下行累计 / 价值 三列共享行宽、间距一致 */}
      {/* ink 的卡片内部没有分隔线，靠留白分组；保留 mt 但去掉 border-t */}
      <div className="mt-3 grid grid-cols-3 gap-x-3 text-2xs">
        <div className="space-y-1">
          <div className="num text-muted-foreground">
            ↑ <span className="text-foreground">{rate(node.rx)}</span>{" "}
            <span className="text-subtle">MB/s</span>
          </div>
          <div className="num text-muted-foreground">
            ↓ <span className="text-foreground">{rate(node.tx)}</span>{" "}
            <span className="text-subtle">MB/s</span>
          </div>
        </div>
        <div className="num space-y-1 text-subtle">
          <div>↑ {node.upTotal.toFixed(1)} GB</div>
          <div>↓ {node.downTotal.toFixed(1)} GB</div>
        </div>
        <div className="space-y-1 text-subtle">
          <div>剩余 {node.expireDays} 天</div>
          <div className="num">{node.billing}</div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="shrink-0 text-2xs text-muted-foreground">三网</span>
        <span className="flex items-center gap-2">
          {node.isp.map((item) => (
            <span key={item.id} className="flex items-baseline gap-1">
              {/* 标注运营商，否则三组数字只能靠顺序猜 */}
              <span className="text-2xs text-subtle">{item.label}</span>
              <span
                className={cn(
                  "num text-2xs",
                  offline ? "text-subtle" : ispTone(item.value),
                )}
              >
                {offline ? "—" : Math.round(item.value) + "ms"}
              </span>
            </span>
          ))}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-label={`查看 ${node.name} 的延迟详情`}
          onClick={(event) => {
            // 别冒泡到卡片自身的"打开详情页"
            event.stopPropagation()
            onOpenPing?.("latency")
          }}
          className="rounded-lg bg-muted/50 px-2.5 py-2 text-left transition-colors dur-2 hover:bg-muted"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-2xs text-muted-foreground">延迟</span>
            <span
              className={cn(
                "num text-xs font-bold",
                offline ? "text-subtle" : latencyTone(node.latency),
              )}
            >
              {offline ? "—" : Math.round(node.latency) + " ms"}
            </span>
          </div>
          <div className="mt-1.5">
            {offline ? (
              <div className="h-2" />
            ) : (
              <MiniBars
                values={node.latencyHistory}
                tone={latencyBarTone}
                label="延迟"
                unit="ms"
              />
            )}
          </div>
        </button>
        <button
          type="button"
          aria-label={`查看 ${node.name} 的丢包详情`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenPing?.("loss")
          }}
          className="rounded-lg bg-muted/50 px-2.5 py-2 text-left transition-colors dur-2 hover:bg-muted"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-2xs text-muted-foreground">丢包</span>
            <span className="num text-sm font-medium">
              {offline ? "—" : node.loss.toFixed(1) + "%"}
            </span>
          </div>
          <div className="mt-1.5">
            {offline ? (
              <div className="h-2" />
            ) : (
              <MiniBars
                values={node.lossHistory}
                tone={lossBarTone}
                label="丢包"
                unit="%"
              />
            )}
          </div>
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">

        {node.tags.map((tag) => (
          <span
            key={tag}
            /* 参考 ink：标签用品牌的淡蓝，全是灰的话一排徽章看着很闷 */
            className="rounded-full border border-brand/25 bg-brand/8 px-2 py-[3px] text-2xs leading-none text-brand"
          >
            {tag}
          </span>
        ))}
        {/*
          在线时长放这里而不是标题行：标题行的名字不与它争空间，
          而 tag 行本来就有余量（实测 122px，本项需 59px）。
          tag 多到换行时它会被挤到下一行，但 ml-auto 保证仍靠右。
          原始值是紧凑写法「43d」，卡片里写全「43 天」。
        */}
        <span className="num ml-auto shrink-0 text-2xs text-subtle">
          {offline ? "—" : `在线 ${node.uptime.replace(/d$/, " 天")}`}
        </span>
      </div>
    </article>
  )
}
