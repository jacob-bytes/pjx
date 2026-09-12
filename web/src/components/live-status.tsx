import { StatusDot } from "@/components/status-dot"
import { clockTime } from "@/lib/format"
import { lastTickAt, useFleetStatus, useFleetTick } from "@/lib/mock"

/**
 * 顶栏的实时状态。
 *
 * 规范 §5：断线/暂停不能静默失败，要如实显示。
 * 这里刻意只订阅连接状态 + 时间，不把 1Hz 的整棵后台树拖着重渲染。
 */
export function LiveStatus() {
  const { connection, loaded } = useFleetStatus()
  useFleetTick() // 只为刷新时钟

  if (!loaded) {
    return (
      <span className="mr-1 hidden items-center gap-1.5 text-2xs text-muted-foreground lg:flex">
        <StatusDot status="off" />
        连接中…
      </span>
    )
  }

  if (connection === "paused") {
    return (
      <span className="mr-1 hidden items-center gap-1.5 text-2xs text-muted-foreground lg:flex">
        <StatusDot status="warn" />
        已暂停
        <span className="num text-subtle">（页面在后台）</span>
      </span>
    )
  }

  return (
    <span className="mr-1 hidden items-center gap-1.5 text-2xs text-muted-foreground lg:flex">
      <StatusDot status="ok" />
      实时 · 1s
      <span className="num text-subtle">{clockTime(lastTickAt())}</span>
    </span>
  )
}
