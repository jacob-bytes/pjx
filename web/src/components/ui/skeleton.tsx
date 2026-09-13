import { cn } from "@/lib/utils"

/**
 * 加载占位。规范 §8：只用 muted 脉冲，禁止渐变 shimmer。
 */
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-xs bg-muted", className)}
      {...props}
    />
  )
}

/** 表格骨架：与真实表头同宽同高，避免加载完成时跳版 */
export function TableSkeleton({
  rows = 8,
  cols = 6,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div className="min-w-[880px]" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0"
        >
          <Skeleton className="size-[7px] rounded-full" />
          {Array.from({ length: cols }, (_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-3",
                colIndex === 0 ? "w-[120px]" : "w-[64px]",
                colIndex > 2 && "ml-auto",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
