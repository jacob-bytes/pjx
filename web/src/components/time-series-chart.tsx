import { useLayoutEffect, useRef, useState } from "react"
import { tooltipShell } from "@/components/chart-tooltip"
import { formatAxisTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface ChartSeries {
  key: string
  label: string
  data: number[]
  color: string
  /** 用右轴（双 Y 轴，例如 CPU% 配负载） */
  axis?: "left" | "right"
  /** 面积填充 */
  fill?: boolean
  /** 参考线：画虚线、仍进图例（用虚线色块区分） */
  reference?: boolean
  /**
   * 自定义线型。多序列时用「颜色 + 线型」双通道区分，
   * 不能只靠颜色 —— 色盲用户和 6 条线同屏时都会失效。
   */
  dash?: string
}

/**
 * 事件带：贴在绘图区底部的窄条，标记"某个采样点发生了某件事"（例如丢包）。
 *
 * 为什么不画成第二条曲线：延迟是 ms、丢包是 %，双 Y 轴的"相关性"完全取决于
 * 两个轴怎么缩放 —— 是 dataviz 里公认的反模式。事件带不引入第二个刻度，
 * 只回答"哪一刻出过事"，不冒充趋势。
 */
export interface ChartBand {
  key: string
  /** 图例里显示的名字。不传就不进图例 */
  label?: string
  /** 每个采样点的原始强度值（0 = 无事件） */
  data: number[]
  color: string
  /** 低于这个值不算事件。默认 0.05 —— 更小的算常态噪声，不该刷屏 */
  threshold?: number
  /** 归一化用的上限：达到该值即为满高。默认 2 */
  max?: number
}

const BAND_MAX_H = 7
const PAD_TOP = 10
const PAD_BOTTOM = 22
const AXIS_W = 46
const REFERENCE_DASH = "3 3"
/** 6 条以上就分不清了，超过就循环线型 */
const DASH_CYCLE = [undefined, "6 3", "2 3", "8 3 2 3"]

/** 容器宽度测量：按真实像素渲染，文字才不会被 viewBox 缩放拉小 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

function buildPath(
  data: number[],
  max: number,
  plotW: number,
  plotH: number,
  x0: number,
  y0: number,
) {
  if (data.length < 2 || plotW <= 0) return { line: "", area: "" }
  const step = plotW / (data.length - 1)
  const points = data.map((value, index) => {
    const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
    return [x0 + index * step, y0 + plotH - ratio * plotH] as const
  })
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ")
  const area = `${line} L${(x0 + plotW).toFixed(1)} ${y0 + plotH} L${x0} ${y0 + plotH} Z`
  return { line, area }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * 纵轴气泡的中心 x。
 * 之前这里只做了 Y 平移、rect 以 x=0 为中心 —— 结果是气泡跨在画布左边界上，
 * 一半在画布外，数字被裁掉。必须让它落在左轴刻度区（0 ~ AXIS_W）里。
 */
const Y_CALLOUT_CX = (AXIS_W - 6) / 2

/**
 * 让气泡背景包住文字。
 * 量的是渲染后的真实宽度（getBBox），不是按字数估算 ——
 * 等宽字体下数字/冒号/汉字的宽度并不一致，估算一定会差几个像素。
 */
function fitBox(
  text: SVGTextElement,
  rect: SVGRectElement | null,
  minWidth: number,
) {
  if (!rect) return minWidth
  let width = minWidth
  try {
    width = Math.max(minWidth, text.getBBox().width + 12)
  } catch {
    // 尚未布局时 getBBox 可能抛错，退回最小宽度
  }
  rect.setAttribute("x", String(-width / 2))
  rect.setAttribute("width", String(width))
  return width
}

/**
 * 时间序列折线图。
 *
 * 按真实像素渲染（ResizeObserver），坐标轴文字 1:1，不被 viewBox 缩放。
 * 支持多序列、双 Y 轴、虚线参考线、颜色+线型双通道区分。
 *
 * ── 关于 hover 的实现方式 ──
 * 十字游标**不用 React state**，而是用 ref 直接改 DOM 属性。
 * 原因：之前每次 pointermove 都 setState → 整个图表重渲染 →
 * 重建全部路径（最多 180 点 × 6 条线）与网格 → 鼠标划过时明显掉帧顿挫。
 * 改成命令式之后 hover 期间 React 一次都不渲染，游标贴着指针走。
 */
export function TimeSeriesChart({
  series,
  leftMax,
  rightMax,
  leftFormat = (value) => value.toFixed(0),
  rightFormat,
  height = 160,
  ticks = 4,
  windowSeconds,
  endTime,
  ariaLabel,
  bands,
  className,
}: {
  series: ChartSeries[]
  leftMax: number
  rightMax?: number
  leftFormat?: (value: number) => string
  rightFormat?: (value: number) => string
  height?: number
  ticks?: number
  /** 横轴跨度（秒）。默认按 1Hz 采样，用点数推导 */
  windowSeconds?: number
  /** 横轴右端的时刻。默认取当前时间 */
  endTime?: Date
  ariaLabel?: string
  /** 底部事件带，见 ChartBand */
  bands?: ChartBand[]
  className?: string
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()

  const cursorRef = useRef<SVGGElement>(null)
  const vLineRef = useRef<SVGLineElement>(null)
  const hLineRef = useRef<SVGLineElement>(null)
  const yBoxRef = useRef<SVGGElement>(null)
  const xBoxRef = useRef<SVGGElement>(null)
  const yRectRef = useRef<SVGRectElement>(null)
  const xRectRef = useRef<SVGRectElement>(null)
  const yTextRef = useRef<SVGTextElement>(null)
  const xTextRef = useRef<SVGTextElement>(null)
  const dotRefs = useRef<(SVGCircleElement | null)[]>([])
  const tipRef = useRef<HTMLDivElement>(null)
  const tipValueRefs = useRef<(HTMLSpanElement | null)[]>([])
  /** 触屏：点一下锁定，再点取消（用 ref，不为锁定状态重渲染） */
  const lockedRef = useRef(false)

  const hasRight = rightMax !== undefined
  const padLeft = AXIS_W
  const padRight = hasRight ? AXIS_W : 12
  const plotW = Math.max(0, width - padLeft - padRight)
  const plotH = Math.max(0, height - PAD_TOP - PAD_BOTTOM)

  const points = Math.max(0, ...series.map((item) => item.data.length))
  const window = windowSeconds ?? Math.max(1, points)
  const step = points > 1 ? plotW / (points - 1) : 0
  const stepSeconds = points > 1 ? window / (points - 1) : 0

  const axisEnd = endTime ?? new Date()
  const axisStart = new Date(axisEnd.getTime() - window * 1000)
  const axisMid = new Date(axisEnd.getTime() - (window * 1000) / 2)

  const axisMaxFor = (item: ChartSeries) =>
    item.axis === "right" ? (rightMax ?? leftMax) : leftMax
  const formatFor = (item: ChartSeries) =>
    item.axis === "right" ? (rightFormat ?? leftFormat) : leftFormat

  /** 把游标移到第 index 个采样点。纯 DOM 操作，不触发渲染。 */
  const applyHover = (index: number) => {
    const cursor = cursorRef.current
    if (!cursor || points < 2 || step === 0) return

    const x = padLeft + index * step
    const focus = series.find(
      (item) => !item.reference && item.data[index] !== undefined,
    )
    if (!focus) return
    const y = PAD_TOP + plotH - clamp01(focus.data[index] / axisMaxFor(focus)) * plotH

    cursor.style.opacity = "1"
    vLineRef.current?.setAttribute("x1", String(x))
    vLineRef.current?.setAttribute("x2", String(x))
    hLineRef.current?.setAttribute("y1", String(y))
    hLineRef.current?.setAttribute("y2", String(y))

    // 左轴数值气泡 + 下轴时刻气泡
    const yText = yTextRef.current
    if (yText) {
      yText.textContent = formatFor(focus)(focus.data[index])
      // 按真实文字宽度撑开气泡：写死宽度会让 "1.6 GB" / "08-22 20:26" 这类长文本溢出
      const w = fitBox(yText, yRectRef.current, 26)
      /*
        居中放不下时改成左对齐。
        刻度区只有 AXIS_W 宽，气泡比它还宽时若仍以中心定位，左边缘会跑到画布外
        —— 上一版就是这样把 "1.6 GB" 的左半边裁掉的。
      */
      const cx = Math.max(w / 2, Y_CALLOUT_CX)
      yBoxRef.current?.setAttribute("transform", `translate(${cx} ${y.toFixed(1)})`)
    }
    const at = new Date(axisEnd.getTime() - (points - 1 - index) * stepSeconds * 1000)
    const xText = xTextRef.current
    if (xText) {
      xText.textContent = formatAxisTime(at, window)
      const w = fitBox(xText, xRectRef.current, 0)
      // 同样要夹住：贴着右端时居中会让气泡越出画布右边
      const cx = Math.min(Math.max(x, w / 2), Math.max(w / 2, width - w / 2))
      xBoxRef.current?.setAttribute(
        "transform",
        `translate(${cx.toFixed(1)} ${PAD_TOP + plotH + 3})`,
      )
    }

    // 各数据序列上的点（参考线不画点）
    series.forEach((item, i) => {
      const dot = dotRefs.current[i]
      if (!dot) return
      const value = item.data[index]
      if (item.reference || value === undefined) {
        dot.style.opacity = "0"
        return
      }
      dot.style.opacity = "1"
      dot.setAttribute("cx", String(x))
      dot.setAttribute(
        "cy",
        String(PAD_TOP + plotH - clamp01(value / axisMaxFor(item)) * plotH),
      )
    })

    const tip = tipRef.current
    if (tip) {
      tip.style.opacity = "1"
      tip.style.transform = `translateX(${Math.min(Math.max(x + 10, 0), Math.max(0, width - 132))}px)`
      series.forEach((item, i) => {
        const el = tipValueRefs.current[i]
        if (el) el.textContent = formatFor(item)(item.data[index] ?? 0)
      })
    }
  }

  const hideHover = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = "0"
    if (tipRef.current) tipRef.current.style.opacity = "0"
  }

  const indexFrom = (event: React.PointerEvent<SVGSVGElement>) => {
    if (points < 2 || step === 0) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - padLeft
    return Math.min(points - 1, Math.max(0, Math.round(x / step)))
  }

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse") return
    if (lockedRef.current) {
      lockedRef.current = false
      hideHover()
      return
    }
    const index = indexFrom(event)
    if (index !== null) {
      lockedRef.current = true
      applyHover(index)
    }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    // 触屏未锁定时不跟手，否则滑动页面会一路触发
    if (event.pointerType !== "mouse" && !lockedRef.current) return
    const index = indexFrom(event)
    if (index !== null) applyHover(index)
  }

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          /* touch-pan-y 而不是 touch-none：后者会连页面竖滑一起吃掉 */
          className="block touch-pan-y"
          role="img"
          aria-label={ariaLabel ?? series.map((s) => s.label).join("、")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            if (!lockedRef.current) hideHover()
          }}
        >
          {/* 网格与左右轴刻度 */}
          {Array.from({ length: ticks + 1 }, (_, index) => {
            const ratio = index / ticks
            const y = PAD_TOP + plotH - ratio * plotH
            return (
              <g key={index}>
                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--fg-subtle)"
                  className="num"
                >
                  {leftFormat(leftMax * ratio)}
                </text>
                {hasRight && (
                  <text
                    x={padLeft + plotW + 6}
                    y={y + 3}
                    textAnchor="start"
                    fontSize={10}
                    fill="var(--fg-subtle)"
                    className="num"
                  >
                    {(rightFormat ?? leftFormat)(rightMax * ratio)}
                  </text>
                )}
              </g>
            )
          })}

          {/* 序列 */}
          {series.map((item) => {
            const { line, area } = buildPath(
              item.data,
              axisMaxFor(item),
              plotW,
              plotH,
              padLeft,
              PAD_TOP,
            )
            if (!line) return null
            return (
              <g key={item.key}>
                {item.fill && !item.reference && (
                  <path d={area} fill={item.color} opacity={0.1} />
                )}
                <path
                  d={line}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={item.reference ? 1 : 1.5}
                  strokeDasharray={item.reference ? REFERENCE_DASH : item.dash}
                  strokeLinecap="round"
                  opacity={item.reference ? 0.7 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}

          {/*
            事件带。画在绘图区底部内侧，强度越高条越高 ——
            一张图同时回答"延迟多少"和"哪一刻丢了包"，且不增加第二条 Y 轴。
          */}
          {bands?.map((band) =>
            band.data.map((value, index) => {
              // 低于阈值的忽略：0.05% 的丢包画出来是一条噪点带，不构成"事件"
              if (!(value >= (band.threshold ?? 0.05)) || points < 2 || step === 0)
                return null
              const h =
                2 + Math.min(1, value / (band.max ?? 2)) * BAND_MAX_H
              const x = padLeft + index * step
              return (
                <rect
                  key={`${band.key}-${index}`}
                  x={x - Math.max(1, step * 0.35)}
                  y={PAD_TOP + plotH - h}
                  width={Math.max(1.5, step * 0.7)}
                  height={h}
                  rx={0.5}
                  fill={band.color}
                  opacity={
                    0.55 + Math.min(1, value / (band.max ?? 2)) * 0.45
                  }
                />
              )
            }),
          )}

          {/* 十字游标：横线 + 竖线 + 序列点 + 两个轴气泡 */}
          <g
            ref={cursorRef}
            className="pointer-events-none"
            style={{ opacity: 0, transition: "opacity 120ms" }}
          >
            <line
              ref={vLineRef}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
            />
            <line
              ref={hLineRef}
              x1={padLeft}
              x2={padLeft + plotW}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
            />
            {series.map((item, index) => (
              <circle
                key={item.key}
                ref={(node) => {
                  dotRefs.current[index] = node
                }}
                r={2.5}
                fill={item.color}
                stroke="var(--card)"
                style={{ opacity: 0 }}
              />
            ))}

            {/* 左轴数值气泡 */}
            <g ref={yBoxRef}>
              <rect
                ref={yRectRef}
                x={-(AXIS_W - 6) / 2}
                y={-9}
                width={AXIS_W - 6}
                height={18}
                rx={5}
                fill="var(--foreground)"
              />
              <text
                ref={yTextRef}
                /* 必须是 0：rect 以组原点为中心，文字也跟着以组原点为中心。
                   写死 20 是"组还没做 X 平移"时的遗留，会让文字跑到盒子右侧外面。*/
                x={0}
                y={4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--background)"
                className="num"
              />
            </g>

            {/* 下轴时刻气泡 */}
            <g ref={xBoxRef}>
              <rect
                ref={xRectRef}
                x={-25}
                y={0}
                width={50}
                height={16}
                rx={5}
                fill="var(--foreground)"
              />
              <text
                ref={xTextRef}
                x={0}
                y={11}
                textAnchor="middle"
                fontSize={10}
                fill="var(--background)"
                className="num"
              />
            </g>
          </g>

          {/* 横轴：给真实时刻而不是相对跨度（ink 的做法） */}
          <text x={padLeft} y={height - 6} fontSize={10} fill="var(--fg-subtle)">
            {formatAxisTime(axisStart, window)}
          </text>
          <text
            x={padLeft + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--fg-subtle)"
          >
            {formatAxisTime(axisMid, window)}
          </text>
          <text
            x={padLeft + plotW}
            y={height - 6}
            textAnchor="end"
            fontSize={10}
            fill="var(--fg-subtle)"
          >
            {formatAxisTime(axisEnd, window)}
          </text>
        </svg>
      )}

      {/* 数值提示（同样靠 ref 更新，不参与重渲染） */}
      <div
        ref={tipRef}
        className={cn(tooltipShell("popover"), "top-1 min-w-[124px]")}
        style={{ opacity: 0, transition: "opacity 120ms" }}
      >
        {series.map((item, index) => (
          <div
            key={item.key}
            className="flex items-baseline justify-between gap-3 text-2xs"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-[2px] w-3 shrink-0 rounded-full"
                style={{
                  background:
                    item.reference || item.dash
                      ? `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 5px)`
                      : item.color,
                }}
              />
              {item.label}
            </span>
            <span
              ref={(node) => {
                tipValueRefs.current[index] = node
              }}
              className="num text-foreground"
            />
          </div>
        ))}
      </div>

      {/*
        图例。事件带也要列出来 —— 底部那些小竖条不说明的话没人知道是什么。
        色块用竖条（和事件带本身的形状一致），和折线的横线色块区分开。
      */}
      {(series.length > 1 || (bands ?? []).some((band) => band.label)) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {series.map((item) => (
            <span
              key={item.key}
              className="flex items-center gap-1.5 text-2xs text-muted-foreground"
            >
              <span
                className="h-[2px] w-3.5 shrink-0 rounded-full"
                style={{
                  background:
                    item.reference || item.dash
                      ? `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 5px)`
                      : item.color,
                }}
              />
              {item.label}
            </span>
          ))}
          {(bands ?? [])
            .filter((band) => band.label)
            .map((band) => (
              <span
                key={band.key}
                className="flex items-center gap-1.5 text-2xs text-muted-foreground"
              >
                <span
                  className="h-3 w-1 shrink-0 rounded-[1px]"
                  style={{ background: band.color }}
                />
                {band.label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

export { DASH_CYCLE }
