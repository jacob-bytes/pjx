import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * 品牌标记。
 *
 * 抽成组件是因为这段 ECG 折线原本内联在 public-header 里 ——
 * 页脚再抄一份就变成第三处（后台侧栏还是字母方块 "p"）。
 */
const MARK_SIZE = {
  sm: { box: "size-4 rounded-xs", svg: "size-3" },
  md: { box: "size-6 rounded-sm", svg: "size-3.5" },
} as const

export function BrandMark({
  size = "sm",
  className,
}: {
  size?: keyof typeof MARK_SIZE
  className?: string
}) {
  const dims = MARK_SIZE[size]
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-foreground text-background",
        dims.box,
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        className={dims.svg}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M1.5 10.5h3l2-5 3 8 2-6h3" />
      </svg>
    </span>
  )
}

/**
 * 公网页页脚。
 *
 * 左：品牌与版权（静态）
 * 右：数据口径说明（静态）
 *
 * 关于**不放同步时间**：顶栏的 LiveStatus 已经在显示「实时 · 1s 22:40:36」，
 * 页脚再放一次「最后同步 22:40:36」是同一个数字的两处展示 —— 已删除。
 * 实时状态属于顶栏（全局、常驻），页脚只负责"关于这个站"的静态信息。
 *
 * 对齐：版权行用 items-baseline 而不是 items-center。
 * 之前 `© 2026` 带了 .num（等宽字体），而 Inter 与系统等宽的
 * ascent/descent 比例不同 —— 两个行盒等高但**基线不齐**，2026 看着比 pjx 高一点。
 * 年份本来也不是需要对齐的表格数字，去掉 .num 并改成基线对齐。
 *
 * 年份取运行时当前年份，跨年不用改代码。
 */
export function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer
      data-testid="site-footer"
      /*
        始终一行两端（与 ink 的页脚一致）：左品牌与版权、右数据口径。
        原来窄屏用 flex-col 堆成两行，但实测两段其实放得下 ——
        列表页 190+77=267px、详情页 190+149=339px，390px 视口有 358px 可用。
        堆叠是自找的，不是被挤的。
      */
      className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 pb-8 pt-2 text-2xs sm:gap-4 sm:px-6"
    >
      {/* 左：品牌与版权 */}
      <div className="flex shrink-0 items-baseline gap-1.5 text-muted-foreground">
        <span>
          Powered by{" "}
          <span className="font-medium text-foreground">pjx</span>
        </span>
      </div>

      {/* 极窄屏（<360px）兜底：说明可截断，品牌与版权始终完整 */}
      {note && <div className="min-w-0 truncate text-right text-subtle">{note}</div>}
    </footer>
  )
}