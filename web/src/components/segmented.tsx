import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string | number | boolean> {
  value: T
  label: string
}

/**
 * 分段控件。全站 9 处（总览筛选 / 告警级别 / 探测类型 / 探测覆盖 / 主题 /
 * 时间范围 / 弹窗页签…）共用这一份。
 *
 * 语义用 radiogroup + radio，保证读屏能播报"选中了哪个"——
 * 之前只有颜色变化，读屏听到的是一排一模一样的按钮。
 *
 * ## 选中态为什么是"白浮块"
 *
 * §AE 就定过这个方向（"灰容器 + 选中项白色浮块 + 微阴影"），但**代码里一直没落地** ——
 * 实际是 `bg-accent`：`--muted` 0.955 与 `--accent` 0.938 只差 **0.017 明度**
 * （约 1.05:1），肉眼几乎同色，选中与否实际上只靠 font-medium 撑着。
 * 这不只是"不显眼"，是 WCAG 1.4.1 的问题：**不能只用颜色传达信息**。
 *
 * 现在选中态有四个通道：**容器内浮起 + 阴影 + 半粗 + 位置**，不依赖颜色。
 *
 * 底色用 `--surface-raised` 而不是 `--card`：card 在暗色下比容器**更暗**，
 * 会读成"下沉"（见 globals.css 里该 token 的注释）。
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
        // rounded-lg 与前台分类容器一致（原来这里也是 rounded-md，两种圆角并存）
        "flex items-center gap-0.5 rounded-lg bg-muted p-0.5",
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
              // touch:h-11：触屏下 28 → 44px（与前台分类胶囊同一套做法）
              // touch:min-w-11：两字标签只有 42px 宽，补到 44（高度由 touch:h-11 给）
              "h-7 min-w-0 rounded-md px-2.5 text-2xs text-muted-foreground transition-colors dur-2 touch:h-11 touch:min-w-11 hover:text-foreground",
              fill && "flex-1",
              mono && "num",
              active
                ? "bg-surface-raised font-semibold text-foreground shadow-card hover:text-foreground"
                : "hover:bg-surface-raised/60",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
