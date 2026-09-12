import { CheckCircle, WarningCircle, X as CloseIcon, XCircle } from "@phosphor-icons/react"
import { getUpdatedAt, type PublicNode } from "@/public/mock"
import { IconButton } from "@/components/icon-button"
import { cn } from "@/lib/utils"

type Tone = "ok" | "warn" | "crit"

const TONE = {
  ok: {
    icon: CheckCircle,
    label: "text-ok-text",
    ring: "border-ok/30 bg-ok/8",
  },
  warn: {
    icon: WarningCircle,
    label: "text-warn-text",
    ring: "border-warn/40 bg-warn/8",
  },
  crit: {
    icon: XCircle,
    label: "text-crit-text",
    ring: "border-crit/40 bg-crit/8",
  },
} as const

/**
 * 公网状态页的第一句话。
 *
 * 之前"现在到底有没有问题"要自己去看 6px 圆点和 KPI 卡页脚里的小字，
 * 这里给一个一眼可读、且能被读屏播报的结论。
 * role=status + aria-live 让状态变化会被朗读，而不是静默变色。
 */
export function StatusBanner({
  nodes,
  onDismiss,
}: {
  nodes: PublicNode[]
  onDismiss: () => void
}) {
  const offline = nodes.filter((node) => node.status === "off").length
  const crit = nodes.filter((node) => node.status === "crit").length
  const warn = nodes.filter((node) => node.status === "warn").length
  const online = nodes.length - offline

  const tone: Tone = crit > 0 || offline > 0 ? "crit" : warn > 0 ? "warn" : "ok"
  const config = TONE[tone]
  const Icon = config.icon

  const title =
    tone === "ok"
      ? "全部系统运行正常"
      : crit > 0
        ? `${crit + offline} 个节点存在严重问题`
        : `${warn} 个节点需要关注`

  const detail = [
    `${online} / ${nodes.length} 在线`,
    offline > 0 && `${offline} 离线`,
    crit > 0 && `${crit} 严重`,
    warn > 0 && `${warn} 告警`,
  ]
    .filter(Boolean)
    .join(" · ")

  const updated = new Date(getUpdatedAt()).toLocaleTimeString("zh-CN", {
    hour12: false,
  })

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3",
        config.ring,
      )}
    >
      <Icon className={cn("size-4 shrink-0", config.label)} />
      <span className={cn("text-sm font-medium", config.label)}>{title}</span>
      {/* 详情窄屏隐藏：实测行 1 余 100px 而「最后更新」要 102px —— 差 10px 就换行。
          而且「12 / 12 在线 · 1 告警」在下面的 KPI 卡里已有同一份数据。 */}
        <span className="num hidden text-2xs text-muted-foreground sm:inline">
          {detail}
        </span>
      <span className="num ml-auto text-2xs text-subtle">
        最后更新 {updated}
      </span>

      <IconButton
        label="关闭状态提示"
        onClick={onDismiss}
        className="-my-1 -mr-1 size-auto p-1.5 text-subtle"
      >
        <CloseIcon className="size-3.5" />
      </IconButton>
    </div>
  )
}
