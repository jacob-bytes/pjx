import { useState } from "react"
import { tooltipShell } from "@/components/chart-tooltip"
import { cn } from "@/lib/utils"
import { type UptimeDay } from "@/public/mock"

const STATE_CLASS: Record<UptimeDay["state"], string> = {
  ok: "bg-ok/70",
  partial: "bg-warn/80",
  off: "bg-crit/80",
  none: "bg-muted",
}

const STATE_LABEL: Record<UptimeDay["state"], string> = {
  ok: "正常",
  partial: "部分异常",
  off: "离线",
  none: "无数据",
}

/**
 * 30 天在线时间轴（p1 的绿色长条）。
 * 每格一天，颜色按当日状态；鼠标悬停给出日期与正常率。
 */
/** 每天按 24 次上报折算，用于气泡里的「上报 n/24 次」 */
const CHECKS_PER_DAY = 24

export function UptimeTimeline({ days }: { days: UptimeDay[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const hovered = hover === null ? null : days[hover]
  const hoveredChecks = hovered
    ? Math.round((hovered.ratio / 100) * CHECKS_PER_DAY)
    : 0

  return (
    <div data-testid="uptime-timeline">
      <div className="relative flex items-center gap-1">
        {days.map((day, index) => (
          <button
            key={day.date}
            type="button"
            /* 保留原生 title 作为兜底（键盘聚焦 / 读屏），视觉上用下面的自绘气泡 */
            title={`${day.date} · ${STATE_LABEL[day.state]}`}
            aria-label={`${day.date} ${STATE_LABEL[day.state]}`}
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover((v) => (v === index ? null : v))}
            onFocus={() => setHover(index)}
            onBlur={() => setHover((v) => (v === index ? null : v))}
            className={cn(
              "h-7 min-w-0 flex-1 cursor-default rounded-[2px] transition-opacity dur-2",
              STATE_CLASS[day.state],
              hover !== null && hover !== index ? "opacity-55" : "opacity-100",
            )}
          />
        ))}

        {/*
          气泡紧贴绿块，且做成单行紧凑 ——
          两行版有 40px 高，悬停时会飘到卡片外面盖住上一张卡的内容。
          单行只有约 22px，加上 4px 间距正好落在卡片顶部的留白里。
        */}
        {hovered && (
          <div
            className={cn(tooltipShell("inverted"), "bottom-full mb-1")}
            style={{
              left: `${((hover! + 0.5) / days.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <span className="num font-medium">{hovered.date}</span>
            <span className="opacity-75">
              {" · "}
              {STATE_LABEL[hovered.state]}
              {hovered.state !== "none" &&
                ` · 上报 ${hoveredChecks}/${CHECKS_PER_DAY} 次`}
            </span>
          </div>
        )}
      </div>

        {/*
          两个端点 + 图例，用 flex order 精确排布，**两个断点都要成立**：
            窄屏  第 1 行「12月3日 → 1月1日」（成对），第 2 行图例
            宽屏  单行「起始日 ─ 图例 ─ 结束日」，分居两端、图例居中

          上一版用 sm:contents 把外层 span「化掉」，结果结束日在 DOM 上
          排到了图例**前面** —— 而 ml-auto 只能把它之后的元素推到右边，
          于是桌面端两个日期挤在了左边。order 是显式的，不会出这种错。
        */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-subtle">
          <span className="order-1">{days[0]?.date}</span>
          <span aria-hidden className="order-2 text-border sm:hidden">
            →
          </span>
          <span className="order-2 sm:order-3">
            {days[days.length - 1]?.date}
          {/* 宽屏图例用 mx-auto 居中：两个端点等宽，剩余空间会对称分配；
              用 ml-auto 会让它紧贴结束日，看起来像「属于结束日」的图例 */}
          </span>
          <span className="order-3 flex w-full items-center gap-3 sm:order-2 sm:mx-auto sm:w-auto">
            {(["ok", "partial", "off", "none"] as const).map((state) => (
              <span key={state} className="flex items-center gap-1.5">
                <span
                  className={cn("size-[8px] rounded-[2px]", STATE_CLASS[state])}
                />
                {STATE_LABEL[state]}
              </span>
            ))}
          </span>
        </div>

    </div>
  )
}
