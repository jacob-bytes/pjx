import { cn } from "@/lib/utils"
import type { Status } from "@/lib/mock"

const FILL: Record<Status, string> = {
  ok: "fill-ok",
  warn: "fill-warn",
  crit: "fill-crit",
  off: "fill-subtle",
}

/**
 * 60 秒心跳条：最后 60 个采样点，每秒左移一格。
 * 这是"灵动"的主要载体 —— 有生命感，但不做无意义装饰。
 */
export function Heartbeat({
  data,
  className,
}: {
  data: Status[]
  className?: string
}) {
  const bars = data.slice(-60)

  return (
    <svg
      viewBox="0 0 120 16"
      className={cn("h-4 w-[120px] shrink-0", className)}
      aria-hidden
    >
      {bars.map((status, index) => {
        const latest = index === bars.length - 1
        return (
          <rect
            key={index}
            x={index * 2}
            y={latest ? 1 : 2.5}
            width={1.6}
            height={latest ? 14 : 11}
            rx={0.5}
            /*
              只有最新一根做过渡。数据每秒左移一格，如果 60 根都挂 transition
              等于每秒触发 60 个动画 —— 200 台节点就是每次 tick 1.2 万个元素。
            */
            className={cn(FILL[status], latest && "transition-colors dur-2")}
            opacity={status === "ok" ? 0.65 : 1}
          />
        )
      })}
    </svg>
  )
}
