import { Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * 详情页的分区卡片。p1/p2 用的是"标题 + 大留白卡片"，
 * 这里保持结构，但按 ui-spec 只给 1px 描边、不加阴影。
 */
export function DetailSection({
  title,
  icon: Icon,
  extra,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon?: Icon
  extra?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("card", className)}>
      {/*
        头部对齐 ink 的 MetricChartHeader.vue：
        - 图标放进 size-8 rounded-md 的**淡色底块**（原来只是一个裸图标）
        - 标题 text-sm font-semibold（原来 text-xs font-medium，偏小偏轻）
        - 右侧数值 text-xs text-muted-foreground（原来更深，会抢标题注意力）
      */}
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        {Icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        )}
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {extra && (
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {extra}
          </div>
        )}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

/** 指标 + 数值 + 进度条的小卡（p1 顶部那排） */
export function SummaryField({
  label,
  value,
  sub,
  ratio,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** 给了就画一条细进度条（容量类指标用） */
  ratio?: number
  tone?: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {ratio !== undefined && (
        <div className="mt-1 h-[3px] w-full max-w-[132px] overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] dur-3 ease-out",
              tone ?? "bg-chart-1",
            )}
            style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }}
          />
        </div>
      )}
      {sub && <div className="num mt-0.5 truncate text-2xs text-subtle">{sub}</div>}
    </div>
  )
}
