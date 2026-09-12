import { useDeferredValue, useMemo, useState, type ReactNode } from "react"
import { ToggleChip, chipGroupClass } from "@/components/toggle-chip"
import { Link, useSearchParams } from "react-router"
import {
  ArrowClockwise,
  Bell,
  Broadcast,
  DesktopTower,
  DotsThree,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { NodeTagsDialog } from "@/components/node-tags-dialog"
import {
  nodeMaintenance,
  nodeTags,
  useSettings,
} from "@/components/settings-provider"
import { ServerSheet } from "@/components/server-sheet"
import { StatusDot } from "@/components/status-dot"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableSkeleton } from "@/components/ui/skeleton"
import {
  alertEvents,
  alertRules,
  fleet,
  probes,
  useFleetStatus,
  useFleetTick,
  type Server,
} from "@/lib/mock"
import { METRIC_LIMITS } from "@/lib/settings"
import { pickParam } from "@/lib/url"
import { cn } from "@/lib/utils"

const TAGS = ["全部", "生产", "备用", "香港", "东京", "新加坡"] as const

/*
  「关注」列：**只在接近或越过阈值时**才显示那一项。

  §AF 定过一条规则：常态不写状态文字、只报异常 —— 因为在线是常态，
  写出来反而稀释了真正该看的那一条。这里同理：
  把「CPU 23%」这种数字列出来，等于把前台已经展示过的数据再刷一遍；
  而「磁盘 92%（阈值 85%）」回答的才是后台该回答的问题 ——
  **这台机器现在需要我做什么**。
*/
type Concern = { label: string; value: number; limit: number; over: boolean }

function tightestMetric(server: Server): Concern | null {
  let best: Concern | null = null
  for (const metric of METRIC_LIMITS) {
    const value = server[metric.key]
    if (!best || value / metric.limit > best.value / best.limit) {
      best = {
        label: metric.label,
        value,
        limit: metric.limit,
        over: value >= metric.limit,
      }
    }
  }
  // 全部在阈值的 90% 以下 = 没有需要关注的东西
  return best && best.value / best.limit >= 0.9 ? best : null
}

function compareVersion(a: string, b: string) {
  const x = a.split(".").map(Number)
  const y = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 最新 agent 版本。「落后」要有参照物，所以从机队里取最大值。 */
const LATEST_AGENT = fleet.reduce(
  (latest, item) => (compareVersion(item.agent, latest) > 0 ? item.agent : latest),
  "0.0.0",
)

/*
  软底状态徽章。

  改前表格里的"异常"只有**颜色文字**（`text-warn-text`）一个通道 ——
  颜色一淡就看不出来，对色觉障碍读者也只剩深浅差别。
  现在补上底色与描边：颜色 + 形状（圆角块）+ 文字，三个通道。

  底色由 token 加透明度得来（`--warn` / `--crit` 的 10%），不引第二套调色板。
*/
type BadgeTone = "warn" | "crit" | "neutral"

/*
  染色底的透明度是量出来的：/10 时 crit 徽章的文字只有 4.46:1（差 0.04 不达标），
  /8 是 4.60:1。正好也是全站标签徽章既有的配方（`border-brand/25 bg-brand/8`）。

  描边 /25 对卡片只有 1.26:1 —— 它是**装饰性的柔边**，不承担语义：
  徽章的含义由文字（4.6:1 以上）承载，底色与圆角是冗余通道，
  所以这里不按 1.4.11 的 3:1 要求它。
*/
const BADGE_TONE: Record<BadgeTone, string> = {
  warn: "border-warn/25 bg-warn/8 text-warn-text",
  crit: "border-crit/25 bg-crit/8 text-crit-text",
  neutral: "border-border bg-muted text-muted-foreground",
}

function ToneBadge({
  tone,
  title,
  className,
  children,
}: {
  tone: BadgeTone
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        "num inline-flex h-5 max-w-full items-center rounded-[4px] border px-1.5 text-2xs",
        BADGE_TONE[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  )
}

export function OverviewPage() {
  useFleetTick()
  const [params, setParams] = useSearchParams()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  )
  // 「编辑标签」的落点：菜单项此前没有处理函数，点了什么都不发生
  const [editingTags, setEditingTags] = useState<Server | null>(null)

  // 筛选状态放 URL：可分享、可回退、刷新不丢；与 ?server= 共存
  const query = params.get("q") ?? ""
  const filter = pickParam(params, "state", ["all", "ok", "bad"] as const, "all")
  const tag = pickParam(params, "tag", TAGS, "全部")

  const patchParams = (
    patch: Record<string, string | null>,
    options?: { replace?: boolean },
  ) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key)
      else next.set(key, value)
    }
    setParams(next, options)
  }

  const setQuery = (value: string) => patchParams({ q: value || null }, { replace: true })
  const setFilter = (value: "all" | "ok" | "bad") =>
    patchParams({ state: value === "all" ? null : value })
  const setTag = (value: string) =>
    patchParams({ tag: value === "全部" ? null : value })

  const { loaded } = useFleetStatus()
  const { settings } = useSettings()
  const selectedId = params.get("server")
  const selected = fleet.find((item) => item.id === selectedId) ?? null

  // 输入框跟着 query 立即响应，过滤跑在 deferred 值上：
  // 200 台规模下敲键盘不会被一次全表过滤卡住
  const deferredQuery = useDeferredValue(query)

  const servers = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return fleet.filter((item) => {
      if (filter === "ok" && item.status !== "ok") return false
      if (filter === "bad" && item.status === "ok") return false
      if (tag !== "全部" && !item.tags.includes(tag)) return false
      if (!keyword) return true
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.ip.includes(keyword) ||
        item.tags.join(" ").toLowerCase().includes(keyword)
      )
    })
  }, [deferredQuery, filter, tag])

  const online = fleet.filter((item) => item.status !== "off").length
  const firing = alertEvents.filter((event) => event.state === "firing").length
  const staleAgents = fleet.filter(
    (item) => compareVersion(item.agent, LATEST_AGENT) < 0,
  ).length
  const aliveProbes = probes.filter(
    (probe) => !settings.probesRemoved.includes(probe.id),
  )
  const enabledProbes = aliveProbes.filter(
    (probe) => settings.probeEnabled[probe.id] ?? true,
  ).length
  const enabledRules = alertRules.filter(
    (rule) => settings.ruleEnabled[rule.id] ?? rule.enabled,
  ).length

  return (
    <>
        {/*
          顶部 5 项统计：由 §AP 的扁平两级条改成**紧凑 KPI 卡片**。

          内容口径保留 §AT 换的那一套（在线 / 触发中告警 / agent 落后 /
          探测启用 / 规则启用）—— 后台回答的是"有没有需要我处理的事、配置齐不齐"。

          与前台的关系：前台 KPI 本来就是卡片（`kpi-tiles.tsx`，固定 112px），
          后台这 5 张是同一个族里更紧凑的一档（没有 sparkline，所以不用 112px）。
          卡片本身不接 hover、不可点：**一个静态的卡片加 hover 阴影是纯装饰**
          （§P 那轮专门扫过"每个卡片的入场动画"这类 AI 味），要可点就必须真的有去处。
        */}
        <dl
          data-testid="admin-stats"
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5"
        >
          {[
            {
              label: "在线",
              value: `${online} / ${fleet.length}`,
              tone: online === fleet.length ? "ok" : "warn",
              note:
                online === fleet.length
                  ? "全部在线"
                  : `${fleet.length - online} 台离线`,
              icon: DesktopTower,
            },
            {
              label: "触发中告警",
              value: String(firing),
              tone: firing > 0 ? "warn" : null,
              note: firing > 0 ? "需要处理" : "没有触发中的告警",
              icon: WarningCircle,
            },
            {
              label: "agent 落后",
              value: `${staleAgents} 台`,
              tone: staleAgents > 0 ? "warn" : null,
              note: staleAgents > 0 ? `最新 v${LATEST_AGENT}` : "都跑在最新版",
              icon: ArrowClockwise,
            },
            {
              label: "探测任务",
              value: `${enabledProbes} / ${aliveProbes.length} 启用`,
              // 停用探测是有意为之，不是异常 —— 不套状态色（§AF：状态色只给异常）
              tone: null,
              note:
                enabledProbes === aliveProbes.length
                  ? "全部启用"
                  : `${aliveProbes.length - enabledProbes} 个已停用`,
              icon: Broadcast,
            },
            {
              label: "告警规则",
              value: `${enabledRules} / ${alertRules.length} 启用`,
              tone: null,
              note:
                enabledRules === alertRules.length
                  ? "全部启用"
                  : `${alertRules.length - enabledRules} 个已停用`,
              icon: Bell,
            },
          ].map((item) => (
            <div key={item.label} className="card flex flex-col gap-1.5 p-3">
              <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <item.icon className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="truncate">{item.label}</span>
              </dt>
              <dd
                className={cn(
                  "num truncate text-lg font-semibold leading-none tracking-tight",
                  item.tone === "warn" && "text-warn-text",
                  item.tone === "ok" && "text-foreground",
                )}
              >
                {item.value}
              </dd>
              <div
                className={cn(
                  "flex items-center gap-1.5 text-2xs",
                  item.tone === "warn" ? "text-warn-text" : "text-subtle",
                )}
              >
                {item.tone && (
                  <span
                    aria-hidden
                    className={cn(
                      "size-[6px] shrink-0 rounded-full",
                      item.tone === "warn" ? "bg-warn" : "bg-ok",
                    )}
                  />
                )}
                <span className="truncate">{item.note}</span>
              </div>
            </div>
          ))}
        </dl>

      {/*
        筛选区。三类控件底座原来各不相同、权重分不开：
          · 搜索框   —— 透明底 + 边框（在灰页面上最"轻"）
          · 状态分段 —— 实心灰容器 + 几乎看不出的选中（见 Segmented 的注释）
          · 标签胶囊 —— **每个胶囊各带一圈边框**，高度还比容器矮 4px（h-7 vs 32px 容器内）
        现在两组筛选是**同一类控件**，共用 chipGroupClass + raised 选中态、
        高度统一 32px。§O 的教训是"不同功能的控件不能长得一样"，
        而这里两组本来就是同一功能（筛选），所以各加一个 11px 的组名消歧义
        （两个组都以「全部」开头，不加就不知道指的是哪个）。

        整个工具栏再装进一层白色 card，形成三级层次：
        页面底(<--background) < 工具栏(<--card) < 控件组(<--muted)。
        所以搜索框用"透明 + 边框"就够 —— 它四周已经是白的，不必再靠白底区分自己。
      */}
      {/*
        窄屏用**显式 grid**、宽屏回到 flex：
        flex-wrap 在 390 下会把末项「12 台」挤到第四行独占一行（实测：
        标签组 290 + 间距 12 + 计数 30.4 = 332.4，而可用宽正好 332 —— 差 0.4px）。
        0.4px 这种边界不能靠调间距去赌，grid 两列是确定的：
        第一行 [搜索 | 计数]，状态与标签各占一整行。
      */}
      <div className="card mb-3 mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 p-2 sm:flex sm:flex-wrap sm:gap-x-3">
        {/*
          窄屏让搜索框 flex-1 与右侧的「12 台」共享一行：
          它原本 w-full 独占一行，导致工具栏多一行、且计数在标签那一行被挤到
          0.4px 之外单独换行（实测 290 + 12 + 30.4 vs 可用 332）。
          flex-1 + min-w-0 让它可收缩，计数就能落在同一行的右端。
        */}
        <div className="relative min-w-0 sm:w-[220px] sm:flex-none">
          <MagnifyingGlass
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、IP、标签"
            aria-label="搜索名称、IP、标签"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="col-span-2 flex items-center gap-2 sm:w-auto">
          {/*
            组名只为消歧义（两组选项都以「全部」开头）。
            只在 xl 才显示是量出来的：1024 下内容区 768px，带组名需要 790px ——
            末项「12 台」会被挤到第二行独占一行、右侧空 96%（实测）。
            不带组名是 722px，正好一行。窄屏同理，每行本来就只放得下一组。
          */}
          <span className="hidden text-2xs text-subtle xl:inline">状态</span>
          <Segmented
            ariaLabel="按状态筛选"
            value={filter}
            onChange={setFilter}
            /* 窄屏撑满一行：否则它单独占一行只用到 38%，是最难看的"孤行" */
            className="w-full sm:w-fit"
            options={[
              { value: "all", label: "全部" },
              { value: "ok", label: "在线" },
              { value: "bad", label: "异常" },
            ]}
          />
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <span className="hidden text-2xs text-subtle xl:inline">标签</span>
          <div className={chipGroupClass} role="group" aria-label="按标签筛选">
            {TAGS.map((item) => (
              <ToggleChip
                key={item}
                variant="raised"
                active={tag === item}
                onClick={() => setTag(item)}
                className="h-7"
              >
                {item}
              </ToggleChip>
            ))}
          </div>
        </div>

        {/*
          必须显式指定格子：grid 的自动排布是"顺序游标"，
          前面两个 col-span-2 的组会把游标推到第三行之后，
          末项的计数就被排到第四行去了（实测）。定死第 1 行第 2 列。
        */}
        <span className="num col-start-2 row-start-1 justify-self-end text-2xs text-subtle sm:ml-auto">
          {servers.length} 台
        </span>
      </div>

      {!loaded ? (
        <TableSkeleton rows={8} cols={7} />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="没有匹配的节点"
          desc="换个关键词，或清掉状态 / 标签筛选。"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => patchParams({ q: null, state: null, tag: null })}
            >
              清除筛选
            </Button>
          }
        />
      ) : (
          <div className="-mx-5 max-h-[calc(100svh-11rem)] overflow-auto px-5">
            {/*
              列宽改成显式指定 + table-fixed，并且**按实测文字宽度给足**。

              改前是 auto 布局，宽度由内容撑开，量出来四处不对：
                · CPU 被折线撑到 128px，而内存 59.5 / 磁盘 48px —— 减掉 24px 内边距
                  只剩 35 / 24px，放不下任何进度条；
                · 系统列实得 147.8px —— 内容驱动下的偶然结果，换个机器名就变；
                · 速率列 102.2px 而内容要 102.2px，差 0.2px 就截成「1.24 / 0…」；
                · 地址列内容要 157.4px 而实得 140px —— **溢出 17px 压到系统列上**，
                  因为它没有 truncate，所以既不报错、截图里也看不出来（最阴的一种）。

              各列内容的最坏宽度是**用页面真实字体在 DOM 里量出来的**，不是估的：
                名称 80.8 / 标签 75.4 / IP+地区 133.4 / 系统 123.8 / 在线 49.7 / 速率 78.2

              「地址」与「系统」并成一列（两行）是这一步的关键：
              分列时这两列要占 147.8 + 157.4 = 305px，加上其余列总宽实测 1108px，
              而 1280 视口下主区可用只有 1024px —— 必然横向滚动，且改前滚出去的
              正好是最后那列「操作」，不滚到底点不到 ⋯。
              并成一列后这一格只需 max(133.4, 123.8) + 24 ≈ 164px，
              固定列合计降到 **824px**，1280 下节点列拿到 200px，
              **既不横向滚动、也不截断任何一格**。
              两者本来就是同一类信息（这台机器跑在哪、跑的是什么），
              且行高已经是两行（节点列就是名称 + 标签），并列不额外增加高度。

              （试过让操作列 sticky 吸附右侧来容忍滚动 —— 实测它会盖住
                60s 心跳条最右 44px，比滚动条更糟，已放弃。）
            */}
            <Table data-testid="admin-table" className="min-w-[704px] table-fixed">
              <colgroup>
                <col className="w-10" />
                {/* 不写宽度 = 吸收剩余 */}
                <col />
                <col className="w-[164px]" />
                <col className="w-[84px]" />
                <col className="w-[92px]" />
                <col className="w-[104px]" />
                <col className="w-11" />
              </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3" />
                <TableHead className="h-9 px-3 text-xs font-medium">节点</TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">
                  地址 / 系统
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium">agent</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium">
                  最后上报
                </TableHead>
                {/* 表头带上口径，否则「关注」是个猜谜的词 */}
                <TableHead
                  className="h-9 px-3 text-xs font-medium"
                  title="占阈值 90% 以上的那一项；都在 90% 以下时留空"
                >
                  关注
                </TableHead>
                <TableHead className="h-9 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((item) => (
                <TableRow
                  key={item.id}
                  className="group/row cursor-pointer"
                  onClick={() => setParams({ server: item.id })}
                >
                  <TableCell className="h-11 px-3">
                    <StatusDot status={item.status} />
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/*
                      §AQ 把名字与标签堆成两行，是因为那一格只有 132px；
                      监控列搬走之后它有 496px，并排更紧凑、也少一层竖直噪声。
                      行高由「地址 / 系统」那一格（两行）决定，不受这里影响。
                    */}
                    <div className="flex items-center gap-2">
                      {/* 真链接：键盘可达、可中键新开、可复制地址；行点击对鼠标仍然有效 */}
                      <Link
                        to={`?server=${item.id}`}
                        onClick={(event) => event.stopPropagation()}
                        title={item.name}
                        className="truncate rounded-[3px] text-xs font-medium hover:underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                      <span className="truncate text-2xs text-subtle">
                        {/* 标签是配置，可能被「编辑标签」改过，不能直接读 mock */}
                        {nodeTags(settings, item.id, item.tags).join(" · ")}
                      </span>
                      {/*
                        §AS 加的「维护模式」此前在列表里看不到。
                        用中性徽章而不是琥珀：维护是**有意为之**，不是告警。
                      */}
                      {nodeMaintenance(settings, item.id) && (
                        <ToneBadge tone="neutral" className="shrink-0" title="告警已静音">
                          维护中
                        </ToneBadge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/*
                      两行都用 flex 行，而不是 inline 流：
                      行内元素会按基线对齐，一个 inline-block 的徽章会把行盒从 14px
                      撑到 24.8px（实测），整行行高因此从 50 涨到 62.7 —— 而"保持 50px"
                      是明确的选择。flex 子项没有基线外溢，高度就等于徽章自己的高度。
                    */}
                    <div className="flex items-baseline gap-2">
                      <span className="num truncate text-xs text-muted-foreground">
                        {item.ip}
                      </span>
                      <span className="shrink-0 text-2xs text-subtle">
                        {item.region}
                      </span>
                    </div>
                    {/* 系统做成浅色小标签：它是次要信息，但比纯文字更容易从地址里分出来 */}
                    <div className="mt-0.5 flex">
                      <span
                        className="inline-flex h-3.5 max-w-full items-center truncate rounded-[4px] bg-muted px-1.5 text-2xs leading-none text-muted-foreground"
                        title={item.os}
                      >
                        {item.os}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    <ToneBadge
                      tone={item.agent !== LATEST_AGENT ? "warn" : "neutral"}
                      title={
                        item.agent !== LATEST_AGENT
                          ? `落后于最新 v${LATEST_AGENT}`
                          : `最新 v${LATEST_AGENT}`
                      }
                    >
                      v{item.agent}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/* 离线时"多久没上报"才是要看的数 —— 用 crit 徽章顶出来 */}
                    {item.offline ? (
                      <ToneBadge tone="crit" title="超过离线判定阈值">
                        {item.lastSeen}
                      </ToneBadge>
                    ) : (
                      <span className="num text-xs text-muted-foreground">
                        {item.lastSeen}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="h-11 px-3">
                    {/*
                      只报异常：都在阈值 90% 以下就留空。原来这里是
                      「数值 + 进度条」的 CPU/内存/磁盘 三列 —— 那是前台卡片的同一批数据。
                    */}
                    {(() => {
                      const concern = item.offline ? null : tightestMetric(item)
                      if (!concern) {
                        return <span className="text-xs text-subtle">—</span>
                      }
                      return (
                        <ToneBadge
                          tone={concern.over ? "crit" : "warn"}
                          title={`阈值 ${concern.limit}%`}
                        >
                          {concern.label} {Math.round(concern.value)}%
                        </ToneBadge>
                      )
                    })()}
                  </TableCell>
                  {/*
                    行操作在桌面靠 hover 显形，但触屏没有 hover —— 那些设备上
                    这个按钮此前是永久 invisible（仍可点，但看不见）。
                    touch: 下改成常显，顺带把命中区从 24px 撑到 44px。
                  */}
                  <TableCell className="h-11 px-2">
                    <div
                      className="opacity-0 transition-opacity dur-2 focus-within:opacity-100 group-hover/row:opacity-100 touch:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="更多操作"
                            className="size-6 text-muted-foreground touch:size-11"
                          >
                            <DotsThree className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={() => setParams({ server: item.id })}
                        >
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setEditingTags(item)}
                        >
                          编辑标签
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          // 延到下一个 tick 再开对话框，否则下拉菜单的
                          // 焦点归还会把对话框的焦点抢走
                          onSelect={() =>
                            window.setTimeout(
                              () =>
                                setRemoving({ id: item.id, name: item.name }),
                              0,
                            )
                          }
                        >
                          移除节点
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          // 只摘掉 server，别把筛选参数一起清了
          if (!open) patchParams({ server: null }, { replace: true })
        }}
      >
        {selected && <ServerSheet server={selected} />}
      </Sheet>

      {editingTags && (
        <NodeTagsDialog
          serverId={editingTags.id}
          serverName={editingTags.name}
          defaultTags={editingTags.tags}
          open
          onOpenChange={(open) => !open && setEditingTags(null)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`移除节点「${removing?.name ?? ""}」？`}
        desc="该节点的历史数据会一并删除，且不可恢复；agent 端下次上报会被拒绝。"
        confirmLabel="移除"
        onConfirm={() => {
          setRemoving(null)
          toast("已移除节点（演示）")
        }}
      />
    </>
  )
}
