import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string | number | boolean> {
  value: T
  label: string
}

/**
 * 分段控件。全站 5 处（总览筛选 / 告警级别 / 探测类型 / 探测覆盖 / 通用主题）
 * 原本是同一段内联 markup 复制，连 role/aria 都是手抄的。
 *
 * 语义用 radiogroup + radio，保证读屏能播报"选中了哪个"——
 * 之前只有颜色变化，读屏听到的是一排一模一样的按钮。
 */
export function Segmented<T extends string | number | boolean>({
  value,
  onChange,
  options,
  ariaLabel,
  fill = false,
  mono = false,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  ariaLabel: string
  /** 容器内等分（表单里的三选一），而不是按内容宽度排布（工具栏） */
  fill?: boolean
  mono?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-0.5 rounded-md bg-muted p-0.5",
        fill ? "w-full" : "w-fit",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded-[4px] px-2.5 text-2xs text-muted-foreground transition-colors dur-2 hover:text-foreground",
              fill && "flex-1",
              mono && "num",
              active && "bg-accent font-medium text-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
