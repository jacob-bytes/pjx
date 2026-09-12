import { cn } from "@/lib/utils"

/**
 * 资源占用条：轨道 + 可着色填充。
 *
 * 抽出来是因为**同一个指标在两个入口长得不一样**：前台节点卡是「数值 + 3px 进度条」，
 * 后台总览表格的 CPU 是「数值 + 折线」、内存与磁盘干脆只有纯文本。
 * 现在两个入口共用这一份实现，阈值与颜色由调用处传入，形状与动效只有一份。
 *
 * 默认填充是**满不透明的品牌蓝**，与前台节点卡进度条用的 `bg-chart-1` 同色
 * （亮色主题下 chart-1 就是 --brand）。一开始用的是 `bg-brand/40`
 * （照 ink 的 `bg-primary/40`），实测它对着 `bg-muted` 轨道只有 **1.74:1** ——
 * 低于图形元素 3:1 的下限，整条进度条淡到几乎看不见。满不透明是 **4.71:1**。
 */
export function ResourceBar({
  value,
  tone = "bg-brand",
  inactive = false,
  className,
}: {
  /** 0–100 的占用百分比，超出范围会被夹住 */
  value: number
  /** 填充色，由调用处按阈值决定 */
  tone?: string
  /** 无数据（离线 / 未上报）：只留轨道，不画填充 */
  inactive?: boolean
  className?: string
}) {
  return (
    <div
      className={cn("h-[3px] overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] dur-3 ease-out",
          tone,
        )}
        // 不再保底 2%：原来离线的节点也会画出一小截填充，
        // 看起来像"占用 2%"，而它其实是没有数据。
        style={{ width: inactive ? "0%" : `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
