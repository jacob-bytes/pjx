import { UptimeStrip, UPTIME_STATE_CLASS, UPTIME_STATE_LABEL } from "@/components/uptime-strip"
import { cn } from "@/lib/utils"
import { type UptimeDay } from "@/lib/nodes"

/**
 * 30 天在线时间轴（p1 的绿色长条）。
 *
 * 色块与悬停气泡都在 `@/components/uptime-strip` —— **前后台共用**；
 * 这里只负责前台卡片需要、而后台表格行内小条不需要的两样：**轴 + 图例**。
 */
export function UptimeTimeline({ days, label }: { days: UptimeDay[]; label?: string }) {
  return (
    <div data-testid="uptime-timeline">
      <UptimeStrip days={days} interactive label={label} segmentClassName="h-7" />

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
        <span className="order-2 sm:order-3">{days[days.length - 1]?.date}</span>
        {/* 宽屏图例用 mx-auto 居中：两个端点等宽，剩余空间会对称分配；
            用 ml-auto 会让它紧贴结束日，看起来像「属于结束日」的图例 */}
        <span className="order-3 flex w-full items-center gap-3 sm:order-2 sm:mx-auto sm:w-auto">
          {(["ok", "partial", "off", "none"] as const).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-[8px] rounded-[2px]",
                  // 无数据是"空槽"，图例里用虚线框表示（颜色到不了 3:1，改用形状）
                  state === "none"
                    ? "border border-dashed border-border-strong"
                    : UPTIME_STATE_CLASS[state],
                )}
              />
              {UPTIME_STATE_LABEL[state]}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
