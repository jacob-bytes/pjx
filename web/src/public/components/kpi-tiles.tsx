import { Gauge, HardDrive, WarningCircle, Waveform } from "@phosphor-icons/react"
import { Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { Sparkline } from "@/components/sparkline"
import { rate } from "@/lib/format"
import { rateSeries } from "@/public/mock"
import type { PublicNode } from "@/public/mock"
import { cn } from "@/lib/utils"

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  footer,
  chart,
}: {
  icon: Icon
  label: string
  value: ReactNode
  sub?: string
  /** 可选：实时速率卡不放 footer，让整排卡片跟着矮下来 */
  footer?: ReactNode
  chart?: ReactNode
}) {
  return (
    // 白底 + 描边：与节点卡片同一套 surface，页面背景已经压暗一档，
    // 卡片才浮得起来（原来是 bg-muted/60，比背景还暗，糊成一片）
    /*
      布局对齐 ink（NodeGeneralCards.vue）：
      - 固定 112px 高 + justify-between —— 四张卡严格等高，内容各归其位
      - 标签 text-xs + font-medium + tracking-wider，图标降到 60% 不透明度：
        标签是"说明"，该退到背景里，把注意力让给数字
      - 数值 font-bold + tracking-tight（原来是 font-medium，比 ink 轻一档；
        数字是这个页面的主角，太轻就立不住）
    */
    <div className="card flex h-[112px] flex-col justify-between p-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="truncate text-xs font-medium tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-1">
        {/*
          响应式字号，取值与 ink 一致（text-base sm:text-lg md:text-2xl）。
          原来固定 text-2xl：移动端两列时「↑ 11.4 · ↓ 7.88 MB/s」需要约 310px，
          而卡片内只有 150px，被 truncate 裁掉 —— 截图里能直接看到「↓ 7」没了。
        */}
        <span className="num truncate text-sm font-bold leading-none tracking-tight sm:text-lg md:text-2xl">
          {value}
        </span>
        {sub && <span className="num text-xs text-subtle">{sub}</span>}
      </div>
      {chart && <div className="mt-auto">{chart}</div>}
      {footer && (
        <div className="mt-auto text-2xs text-muted-foreground">{footer}</div>
      )}
    </div>
  )
}

export function KpiTiles({ nodes }: { nodes: PublicNode[] }) {
  const online = nodes.filter((node) => node.status !== "off").length
  const offline = nodes.length - online
  const highLoad = nodes.filter(
    (node) =>
      node.status !== "off" &&
      (node.cpu > 80 ||
        node.mem > 85 ||
        node.disk > 85 ||
        node.trafficUsed / (node.trafficTotal * 1024) * 100 > 90),
  ).length
  const totalTraffic = nodes.reduce((sum, node) => sum + node.trafficUsed, 0) / 1024
  const totalRx = nodes.reduce((sum, node) => sum + (node.status === "off" ? 0 : node.rx), 0)
  const totalTx = nodes.reduce((sum, node) => sum + (node.status === "off" ? 0 : node.tx), 0)

  return (
    <div
      data-testid="kpi-row"
      className="grid auto-rows-fr grid-cols-2 gap-2.5 lg:grid-cols-4"
    >
      <Tile
        icon={Waveform}
        label="在线节点"
        value={online}
        sub={"/ " + nodes.length + " · 离线 " + offline}
        footer={
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-[6px] rounded-full",
                offline === 0 ? "bg-ok" : "bg-warn",
              )}
            />
            {offline === 0 ? "全部在线" : offline + " 台离线"}
          </span>
        }
      />
      <Tile
        icon={WarningCircle}
        label="高负载节点"
        value={highLoad}
        /* 带分母：单看「1」不知道是多是少，ink 同样是「0 / 22」 */
        sub={"/ " + nodes.length}
        footer={
          /* ink 这里是状态陈述（「无高负载节点」），不是静态说明 ——
             说明文字只是重复标题，状态陈述才带信息 */
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-[6px] rounded-full",
                highLoad === 0 ? "bg-ok" : "bg-warn",
              )}
            />
            {highLoad === 0 ? "无高负载节点" : `${highLoad} 台超阈值`}
          </span>
        }
      />
      <Tile
        icon={HardDrive}
        label="累计流量"
        value={totalTraffic.toFixed(2)}
        sub="TB"
        footer="全部节点已用流量"
      />
      <Tile
        icon={Gauge}
        label="实时速率"
        value={
          <span className="flex items-baseline gap-1.5">
            <span>↑ {rate(totalRx)}</span>
            <span className="text-subtle">·</span>
            <span>↓ {rate(totalTx)}</span>
            <span className="text-xs text-subtle">MB/s</span>
          </span>
        }
        chart={
          /*
            中性灰而不是品牌蓝，且去掉大面积填充（ink 用 currentColor + 0.08 渐变）。
            原因：这张卡的主角是上面那个大数字，折线是背景信息 ——
            用品牌蓝 + 面积填充会和数字抢注意力。
          */
          <Sparkline
            data={rateSeries}
            color="var(--fg-subtle)"
            className="h-9 w-full"
          />
        }
      />
    </div>
  )
}
