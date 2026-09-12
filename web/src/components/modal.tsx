import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * 模态框。
 *
 * 用**原生 `<dialog>` + showModal()**，不引 Radix Dialog。
 *
 * 原生 dialog 已经自带模态框需要的全部能力：
 *   - 焦点陷阱（Tab 不会跑到后面）
 *   - Esc 关闭（触发 close 事件）
 *   - ::backdrop 遮罩
 *   - **top layer** —— 不受任何 z-index / overflow 影响，不会被父级的
 *     `overflow: hidden` 裁掉，这在卡片里嵌套弹窗时是致命的
 *   - aria-modal 语义
 *
 * 引 @radix-ui/react-dialog 要多带 FocusScope / RemoveScroll / Portal 等
 * 一整套进前台包（实测 Dialog 相关目前完全不在前台 chunk 里，约 +15~25KB gzip）。
 * 平台已经给的东西不值得再买一次。
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  /** 指向标题元素的 id，供读屏朗读 */
  labelledBy?: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    // 关闭统一走用户手势（Esc / 点遮罩），状态由父级同步
    else if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Esc 关闭时浏览器只触发 close，要把状态同步回父级
      onClose={onClose}
      // 点遮罩关闭：dialog 自身覆盖全屏，点到 ::backdrop 等价于点到自己
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        "m-auto max-h-[calc(100vh-3rem)] w-[min(960px,calc(100vw-2rem))]",
        "rounded-lg border bg-card p-0 text-foreground shadow-pop",
        "backdrop:bg-foreground/25",
        className,
      )}
    >
      {open && children}
    </dialog>
  )
}
