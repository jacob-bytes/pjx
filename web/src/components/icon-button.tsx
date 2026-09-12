import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * 图标按钮。
 *
 * 之前全站手写了 6 个同类按钮（返回、上/下一个、收藏星标、关闭通栏…），
 * 每处的 hover / focus / disabled 写法都不一样，disabled 语义只覆盖了 2/20。
 *
 * 直接用 shadcn Button 的 ghost + icon 变体作为底座：它的
 * hover 色（--accent）与原来手写的 --muted 只差 0.017 明度，视觉几乎无变化，
 * 但白拿了 focus-visible 环、disabled 语义和「所有图标按钮长得一样」。
 */
export function IconButton({
  label,
  children,
  className,
  ...props
}: {
  label: string
  children: ReactNode
  className?: string
} & Omit<React.ComponentProps<typeof Button>, "children" | "className">) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn(
        "size-8 shrink-0 text-muted-foreground touch:size-11",
        // shadcn 的 size=icon 是 size-9，这里统一收到 32px 以匹配现有密度
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  )
}
