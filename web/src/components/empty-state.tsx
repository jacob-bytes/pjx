import type { ReactNode } from "react"
import { Icon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

/**
 * 表格 / 列表的空状态。替代"渲染出一片空白 tbody"，
 * 并明确告诉用户下一步能做什么。
 */
export function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: Icon
  title: string
  desc?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-md border border-dashed px-4 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <Icon className="size-4 text-subtle" aria-hidden />
      )}
      <p className="mt-2 text-xs font-medium">{title}</p>
      {desc && <p className="mt-1 text-2xs text-subtle">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
