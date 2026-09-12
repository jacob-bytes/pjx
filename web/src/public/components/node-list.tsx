import { Star } from "@phosphor-icons/react"
import { IconButton } from "@/components/icon-button"
import { StatusDot } from "@/components/status-dot"
import { pct, rate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PublicNode } from "@/public/mock"

export function NodeList({
  nodes,
  favorites,
  onToggleFavorite,
  onOpen,
}: {
  nodes: PublicNode[]
  favorites: string[]
  onToggleFavorite: (id: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] text-xs">
        <thead>
          <tr className="border-b text-left text-2xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">状态</th>
            <th className="px-3 py-2 font-medium">节点</th>
            <th className="px-3 py-2 font-medium">分类</th>
            <th className="px-3 py-2 text-right font-medium">CPU</th>
            <th className="px-3 py-2 text-right font-medium">内存</th>
            <th className="px-3 py-2 text-right font-medium">硬盘</th>
            <th className="px-3 py-2 text-right font-medium">流量</th>
            <th className="px-3 py-2 text-right font-medium">↓ / ↑</th>
            <th className="px-3 py-2 text-right font-medium">延迟</th>
            <th className="px-3 py-2 text-right font-medium">丢包</th>
            <th className="px-3 py-2 text-right font-medium">剩余</th>
            <th className="px-3 py-2 font-medium">标签</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const offline = node.status === "off"
            const favorite = favorites.includes(node.id)
            return (
              <tr
                key={node.id}
                onClick={() => onOpen(node.id)}
                className={cn(
                  "cursor-pointer border-b transition-colors dur-2 last:border-0 hover:bg-muted/40",
                  offline && "opacity-70",
                )}
              >
                <td className="px-3 py-2">
                  <StatusDot status={node.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <IconButton
                      label={favorite ? "取消收藏" : "收藏节点"}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleFavorite(node.id)
                      }}
                      className={cn(favorite && "text-brand")}
                      aria-label={favorite ? "取消收藏" : "收藏节点"}
                      aria-pressed={favorite}
                    >
                      <Star
                        className="size-3"
                        weight={favorite ? "fill" : "light"}
                      />
                    </IconButton>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(node.id)
                      }}
                      className="rounded-[3px] font-medium underline-offset-2 hover:underline"
                      title={node.name}
                    >
                      {node.name}
                    </button>
                    <span className="num rounded-[3px] border px-1 text-2xs leading-4 text-subtle">
                      {node.country}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{node.category}</td>
                <td className="num px-3 py-2 text-right">{offline ? "—" : pct(node.cpu)}</td>
                <td className="num px-3 py-2 text-right">{offline ? "—" : pct(node.mem)}</td>
                <td className="num px-3 py-2 text-right">{offline ? "—" : pct(node.disk)}</td>
                <td className="num px-3 py-2 text-right text-muted-foreground">
                  {offline
                    ? "—"
                    : node.trafficUsed.toFixed(1) +
                      " GB / " +
                      node.trafficTotal.toFixed(1) +
                      " TB"}
                </td>
                <td className="num px-3 py-2 text-right text-muted-foreground">
                  {offline ? "—" : rate(node.rx) + " / " + rate(node.tx)}
                </td>
                <td
                  className={cn(
                    "num px-3 py-2 text-right",
                    !offline && node.latency >= 200 && "text-warn-text",
                  )}
                >
                  {offline ? "—" : Math.round(node.latency) + " ms"}
                </td>
                <td className="num px-3 py-2 text-right">
                  {offline ? "—" : node.loss.toFixed(1) + "%"}
                </td>
                <td className="num px-3 py-2 text-right text-muted-foreground">
                  {node.expireDays} 天
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {node.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-[3px] text-2xs leading-none text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
