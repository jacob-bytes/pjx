import { linePath } from "@/lib/svg"
import { cn } from "@/lib/utils"

export function Sparkline({
  data,
  color = "var(--chart-1)",
  className,
  fill = true,
  domain,
}: {
  data: number[]
  color?: string
  className?: string
  fill?: boolean
  /**
   * 固定值域。百分比类序列必须传 [0, 100]，
   * 否则会各自归一化，把"稳定 95%"和"稳定 5%"画成同一张图。
   * 速率这类没有天然上界的序列可以不传。
   */
  domain?: [number, number]
}) {
  const width = 100
  const height = 24
  const { line, area } = linePath(data, width, height, 2, domain)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-6 w-[100px]", className)}
      aria-hidden
    >
      {/* 填充极淡：折线是背景信息，不该和卡片里的数字抢注意力 */}
      {fill && <path d={area} fill={color} opacity={0.07} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
