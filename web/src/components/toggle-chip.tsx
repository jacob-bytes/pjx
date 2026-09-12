import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Check } from "@phosphor-icons/react"

/**
 * 胶囊 / 分段组的容器样式。
 *
 * 单独导出是因为它必须与 `Segmented` 的容器**完全一致** ——
 * 后台筛选区有两组同类控件（按状态、按标签），各写一份的话，
 * 迟早又变成"同一个产品里两套分段控件"（§AE 就是这么来的）。
 */
export const chipGroupClass =
  "flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5"

/**
 * 切换胶囊。
 *
 * 全站有 5 处「可切换的标签」——分类、标签筛选、ping 线路、节点标签：
 * 每处的激活态、hover、圆角、内边距都各写了一遍，而且**只有一处有 aria-pressed**。
 *
 * 统一到这里：激活态实心 + 半粗 + aria-pressed，未激活中灰 + hover 浅底。
 * 选中态用颜色**和**字重两个通道，不单靠颜色。
 */
export function ToggleChip({
  active,
  onClick,
  children,
  variant = "filled",
  className,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  /**
   * filled —— 独立标签的选中态（实心底）
   * raised —— 放在分段容器里的选中态（浮起块，用 --surface-raised）。
   *   两者不能合并：分段容器本身是灰底，容器内的选中项再用实心底就没有层次了。
   */
  variant?: "filled" | "raised"
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs",
        "transition-colors dur-2 touch:py-2.5",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        active
          ? variant === "raised"
            ? "bg-surface-raised font-semibold text-foreground shadow-card"
            : "bg-accent font-medium text-foreground"
          : variant === "raised"
            ? "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** 勾选标记：给下拉选项和胶囊复用，激活时可见 */
export function ChipCheck({ active }: { active: boolean }) {
  return (
    <Check
      className={cn(
        "size-3 shrink-0 text-brand transition-opacity dur-2",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  )
}
