import { useState } from "react"
import { tooltipShell } from "@/components/chart-tooltip"
import { cn } from "@/lib/utils"
import { type UptimeDay, type UptimeState } from "@/lib/nodes"

/*
  段颜色用**满不透明度**的语义 token，不用 /70 那档柔和色。

  原因：状态条的颜色本身就是信息，属于 WCAG 1.4.11 的"非文本对比度"，
  要求 ≥3:1。实测（亮色、叠在 --card 上）：
    --ok/70   2.42:1  ✗     --ok   3.72:1  ✓
    --warn/70 2.42:1  ✗     --warn 3.72:1  ✓
    --crit/70 3.00:1  ~     --crit 4.71:1  ✓
  这套 /70 /80 是从前台卡片继承来的，前台那条时间轴同样不达标 —— 一起修掉。

  `none`（无数据）单靠填充色**任何深浅都到不了 3:1**（--muted 1.14、--border-strong 1.69），
  所以它换一个**形状**通道：不填充 = 留一个空槽。这也是项目既有的纪律
  "徽章要有颜色 + 形状 + 文字三个通道"。
*/
export const UPTIME_STATE_CLASS: Record<UptimeState, string> = {
  ok: "bg-ok",
  partial: "bg-warn",
  off: "bg-crit",
  none: "bg-transparent",
}

export const UPTIME_STATE_LABEL: Record<UptimeState, string> = {
  ok: "正常",
  partial: "部分异常",
  off: "离线",
  none: "无数据",
}

/** 每天按 24 次上报折算，用于气泡与汇总文案里的「上报 n/24 次」 */
const CHECKS_PER_DAY = 24

/** 把 30 天折算成一句可读的汇总（给读屏、也给"数值必须有文字"的规范要求） */
export function uptimeSummary(days: UptimeDay[]) {
  const count = (state: UptimeState) =>
    days.filter((day) => day.state === state).length
  const ok = count("ok")
  const parts: string[] = [`${ok} 天正常`]
  if (count("partial")) parts.push(`${count("partial")} 天部分异常`)
  if (count("off")) parts.push(`${count("off")} 天离线`)
  if (count("none")) parts.push(`${count("none")} 天无数据`)
  return parts.join("、")
}

/** 可用率（正常 + 部分异常按比例折算），用于"数值以文字呈现" */
export function uptimeAvailability(days: UptimeDay[]) {
  if (!days.length) return 0
  const scored = days.reduce(
    (sum, day) => sum + (day.state === "none" ? 0 : day.ratio),
    0,
  )
  return Number((scored / days.length).toFixed(1))
}

/**
 * 30 天状态条（每格一天，颜色按当日状态）。
 *
 * **前后台共用**：前台是卡片里那条可悬停的长条，后台是表格每行那条小条 ——
 * 后者的每一格不做成交互元素（12 行 × 30 格 = 360 个可聚焦按钮是不可接受的），
 * 而是整条给一个汇总结论（`uptimeSummary`），旁边再用文字给出可用率。
 *
 * 这也是 skill 的可视化规范要求的：**数值必须始终以文字可见，不能只靠颜色或 hover**。
 */
export function UptimeStrip({
  days,
  /** 悬停时逐格给气泡（前台用）。后台的行内小条关掉它，改成整条一个汇总 */
  interactive = false,
  label,
  className,
  segmentClassName,
}: {
  days: UptimeDay[]
  interactive?: boolean
  /** 无障碍名称，例如「DMIT-HK.T1 近 30 天」 */
  label?: string
  className?: string
  segmentClassName?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const hovered = hover === null ? null : days[hover]
  const hoveredChecks = hovered
    ? Math.round((hovered.ratio / 100) * CHECKS_PER_DAY)
    : 0

  if (!interactive) {
    return (
      <div
        className={cn("flex items-center gap-1", className)}
        role="img"
        aria-label={`${label ? label + " " : ""}近 ${days.length} 天：${uptimeSummary(days)}`}
      >
        {days.map((day) => (
          <span
            key={day.date}
            aria-hidden
            className={cn(
              "min-w-0 flex-1 rounded-[2px]",
              UPTIME_STATE_CLASS[day.state],
              segmentClassName,
            )}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      {days.map((day, index) => (
        <button
          key={day.date}
          type="button"
          /* 保留原生 title 作为兜底（键盘聚焦 / 读屏），视觉上用下面的自绘气泡 */
          title={`${day.date} · ${UPTIME_STATE_LABEL[day.state]}`}
          aria-label={`${day.date} ${UPTIME_STATE_LABEL[day.state]}`}
          onPointerEnter={() => setHover(index)}
          onPointerLeave={() => setHover((value) => (value === index ? null : value))}
          onFocus={() => setHover(index)}
          onBlur={() => setHover((value) => (value === index ? null : value))}
          className={cn(
            "min-w-0 flex-1 cursor-default rounded-[2px] transition-opacity dur-2",
            UPTIME_STATE_CLASS[day.state],
            hover !== null && hover !== index ? "opacity-55" : "opacity-100",
            segmentClassName,
          )}
        />
      ))}

      {/*
        气泡紧贴色块，且做成单行紧凑 ——
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
            {UPTIME_STATE_LABEL[hovered.state]}
            {hovered.state !== "none" &&
              ` · 上报 ${hoveredChecks}/${CHECKS_PER_DAY} 次`}
          </span>
        </div>
      )}
    </div>
  )
}
