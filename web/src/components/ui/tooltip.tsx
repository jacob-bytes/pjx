import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * 悬停 / 聚焦提示。
 *
 * 为什么要有它：后台此前用原生 `title` 承载**数据解释**
 * （"关注"那一列的阈值口径、"agent 落后"的含义、保留期里那个 `—`）——
 * 原生 title 有三个硬伤：延迟约 1 秒、样式不可控、**移动端完全不显示**。
 * §P 已经记过"图表里手写了三套 tooltip 外壳"，原生 title 等于第四种。
 *
 * 用 Radix 而不是手写：项目里 Dialog / DropdownMenu / Switch 都来自 `radix-ui`，
 * 补一个 Tooltip 不引入新依赖；手写要自己处理 hover+focus、Esc、碰撞翻转、
 * 以及"移进气泡别关"这些细节。
 */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  /** 气泡内容。空值时直接渲染 children，不套一层无意义的气泡 */
  label: React.ReactNode
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}) {
  if (!label) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-[280px] rounded-md border bg-popover px-2 py-1 text-2xs text-popover-foreground shadow-pop",
            "origin-(--radix-tooltip-content-transform-origin) data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0",
            className,
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
