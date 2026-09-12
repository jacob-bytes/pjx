import { cn } from "@/lib/utils"
import type { Status } from "@/lib/mock"

const STATUS_TEXT: Record<Status, string> = {
  ok: "在线",
  warn: "告警",
  crit: "严重",
  off: "离线",
}

export function StatusDot({
  status,
  className,
}: {
  status: Status
  className?: string
}) {
  const color =
    status === "ok"
      ? "bg-ok"
      : status === "warn"
        ? "bg-warn"
        : status === "crit"
          ? "bg-crit"
          : "bg-subtle"

  /*
    C4：默认只有颜色 —— 色盲用户分不出"在线"和"严重"。
    data-cvd=on 时叠加形状通道：圆 / 三角 / 方块 / 短横。
    用 clip-path 做形状，不额外包元素，尺寸与对齐都不变。
  */
  const shape =
    status === "ok"
      ? undefined
      : status === "warn"
        ? "polygon(50% 0%, 100% 100%, 0% 100%)"
        : status === "crit"
          ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
          : "polygon(0 35%, 100% 35%, 100% 65%, 0 65%)"

  return (
    <span
      role="img"
      aria-label={STATUS_TEXT[status]}
      style={
        shape
          ? ({ "--dot-shape": shape } as React.CSSProperties)
          : undefined
      }
      data-shape={shape ? status : undefined}
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        color,
        status === "crit" && "animate-pulse",
        className,
      )}
    />
  )
}

export function StatusLabel({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot status={status} />
      {STATUS_TEXT[status]}
    </span>
  )
}
