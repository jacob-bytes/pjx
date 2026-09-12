import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * 图表气泡的外壳。
 *
 * 时间轴、延迟直方图、折线图各手写了一套气泡 —— 三份外观定义
 * （圆角、内边距、阴影、底色）各自维护，改一处另外两处不会跟着变。
 *
 * 这里只统一**外观**，定位仍由使用处给：三个气泡的锚点逻辑
 * （贴顶 / 贴底 / 跟随游标）本来就不同，强行统一反而会互相将就。
 *
 * popover —— 浅色浮层，配浅底图表
 * inverted —— 深色反白，配时间轴（对齐 ink 的观感）
 */
/**
 * 气泡外观。导出成函数是为了让**命令式更新**的那处也能共用 ——
 * 折线图的游标气泡用 ref 直接改 DOM（hover 期间零重渲染），
 * 渲染不出 React 组件，只能共用同一份 class。
 */
export function tooltipShell(variant: "popover" | "inverted" = "popover") {
  return cn(
    "pointer-events-none absolute z-20 whitespace-nowrap rounded-md shadow-pop",
    variant === "popover"
      ? "border bg-popover px-2 py-1.5 text-2xs"
      : "bg-foreground px-2 py-1 text-2xs text-background",
  )
}

export function ChartTooltip({
  variant = "popover",
  className,
  style,
  children,
}: {
  variant?: "popover" | "inverted"
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={cn(tooltipShell(variant), className)} style={style}>
      {children}
    </div>
  )
}
