import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  CaretDown,
  Check,
  Clock,
  List,
  MagnifyingGlass,
  SquaresFour,
  Star,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/empty-state"
import { KpiTiles } from "@/public/components/kpi-tiles"
import {
  NodeDetail,
  NodeDetailSkeleton,
} from "@/public/components/node-detail"
import { ToggleChip } from "@/components/toggle-chip"
import type { PublicNode } from "@/public/mock"
import { PingDetailDialog } from "@/public/components/ping-detail-dialog"
import { SiteFooter } from "@/public/components/site-footer"
import { StatusBanner } from "@/public/components/status-banner"
import { NodeCard } from "@/public/components/node-card"
import { NodeList } from "@/public/components/node-list"
import { PublicHeader } from "@/public/components/public-header"
import { Skeleton } from "@/components/ui/skeleton"
import {
  nodes,
  usePublicTick,
  usePublicStatus,
} from "@/public/mock"
import { usePersistentState } from "@/lib/persist"
import { pickParam, useUrlParams } from "@/lib/url"
import { cn } from "@/lib/utils"

const CATEGORIES = ["全部节点", "建站", "入口集群", "ix互联", "落地服务器"] as const

/** 排序键：直接从 SORTS 推导，避免两处各写一份联合类型 */
type SortKey = (typeof SORTS)[number]["key"]

/**
 * B1：排序入口（对齐 ink 总览的 ⇅ 排序 chips）。
 * 卡片视图里"按流量排"比逐张看有用得多，30 台以上尤其明显。
 */
const SORTS = [
  { key: "default", label: "默认" },
  { key: "cpu", label: "CPU" },
  { key: "mem", label: "内存" },
  { key: "traffic", label: "流量" },
  { key: "latency", label: "延迟" },
  { key: "expire", label: "剩余天数" },
] as const

/**
 * 排序下拉。
 * 自己实现而不是引 Radix DropdownMenu —— 后者会给前台包再加一份基础组件，
 * 而这里只需要"按钮 + 面板 + 外点关闭"。
 */
function SortMenu({
  value,
  onChange,
}: {
  value: SortKey
  onChange: (key: SortKey) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = SORTS.find((item) => item.key === value) ?? SORTS[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`排序方式：${current.label}`}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors dur-2 touch:h-11 hover:bg-muted hover:text-foreground"
      >
        排序
        <span className="font-medium text-foreground">{current.label}</span>
        <CaretDown
          className={cn(
            "size-3 transition-transform dur-2",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-md border bg-popover p-1 shadow-pop">
          <ul role="listbox" aria-label="排序方式">
            {SORTS.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.key === value}
                  onClick={() => {
                    setOpen(false)
                    onChange(item.key)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors dur-1 hover:bg-accent",
                    item.key === value && "font-medium",
                  )}
                >
                  <Check
                    className={cn(
                      "size-3 shrink-0 text-brand",
                      item.key === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function PublicApp() {
  usePublicTick()
  const loaded = usePublicStatus()
  // 筛选进 URL：可分享、可回退、刷新不丢
  const [params, setParams] = useUrlParams()
  const category = pickParam(params, "cat", CATEGORIES, "全部节点")
  const openId = params.get("node")
  const opened = openId ? (nodes.find((n) => n.id === openId) ?? null) : null
  const openIndex = opened ? nodes.findIndex((n) => n.id === opened.id) : -1

  const openNode = (id: string) => setParams({ node: id })
  const closeNode = () => setParams({ node: null })
  const selectSibling = (id: string) =>
    setParams({ node: id }, { replace: true })
  const query = params.get("q") ?? ""
  const onlyFavorites = params.get("fav") === "1"
  const sort = pickParam(params, "sort", SORTS.map((s) => s.key), "default")
  const [searchOpen, setSearchOpen] = useState(() => query !== "")
  // 关闭状态通栏：只存在内存里，刷新页面会重新出现（不做持久化，避免永久丢掉状态提示）
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // 延迟 / 丢包详情弹窗。小块每秒刷新只够看趋势，细节放到弹窗里 ——
  // 这也是节点卡不必再塞更多内容的理由
  const [pingDialog, setPingDialog] = useState<{
    node: PublicNode
    metric: "latency" | "loss"
  } | null>(null)

  const setCategory = (value: string) =>
    setParams({ cat: value === "全部节点" ? null : value })
  // 逐字输入用 replace，否则每敲一个字都会往历史里塞一条
  const setQuery = (value: string) =>
    setParams({ q: value || null }, { replace: true })
  const setOnlyFavorites = (next: boolean) =>
    setParams({ fav: next ? "1" : null })

  // 视图与收藏都是纯本地偏好，刷新不该丢
  const [view, setView] = usePersistentState<"grid" | "list">("pjx-view", "grid")
  const [favorites, setFavorites] = usePersistentState<string[]>(
    "pjx-favorites",
    () => nodes.filter((node) => node.favorite).map((node) => node.id),
  )

  useEffect(() => {
    if (opened) window.scrollTo({ top: 0 })
  }, [opened])

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const deferredQuery = useDeferredValue(query)

  const visible = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    const rows = nodes.filter((node) => {
      if (category !== "全部节点" && node.category !== category) return false
      if (onlyFavorites && !favorites.includes(node.id)) return false
      if (!keyword) return true
      return (
        node.name.toLowerCase().includes(keyword) ||
        node.country.toLowerCase().includes(keyword) ||
        node.tags.join(" ").toLowerCase().includes(keyword)
      )
    })
    if (sort === "default") return rows
    // 离线的一律沉底：排序是为了找"最忙的"，不是把断线的排最前
    const score = (node: (typeof rows)[number]) =>
      sort === "cpu"
        ? node.cpu
        : sort === "mem"
          ? node.mem
          : sort === "traffic"
            ? node.trafficUsed
            : sort === "latency"
              ? node.latency
              : -node.expireDays
    return [...rows].sort((a, b) => {
      if ((a.status === "off") !== (b.status === "off")) {
        return a.status === "off" ? 1 : -1
      }
      return score(b) - score(a)
    })
  }, [category, deferredQuery, onlyFavorites, favorites, sort])

  const expiring = nodes.filter((node) => node.expireDays <= 7).length

  return (
    <div className="min-h-svh">
      <PublicHeader />

      {opened ? (
        <main>
          {!loaded ? (
            <NodeDetailSkeleton />
          ) : (
          <NodeDetail
            key={opened.id}
            node={opened}
            favorite={favorites.includes(opened.id)}
            onToggleFavorite={toggleFavorite}
            onBack={closeNode}
            onSelect={selectSibling}
            prev={openIndex > 0 ? nodes[openIndex - 1] : null}
            next={
              openIndex >= 0 && openIndex < nodes.length - 1
                ? nodes[openIndex + 1]
                : null
            }
          />
          )}
        </main>
      ) : (
      <main className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6">


        {!bannerDismissed && (
          <StatusBanner nodes={nodes} onDismiss={() => setBannerDismissed(true)} />
        )}

        <div className="mt-2.5">
          <KpiTiles nodes={nodes} />
        </div>

        <div
          data-testid="toolbar"
          className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          {/*
            分类：一个整体微灰容器包住所有选项，选中项浮成白块。
            比"每个按钮各自带边框"少一层离散感，选中态也更容易一眼找到。
          */}
          <div
            className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5"
            role="group"
            aria-label="节点分类"
          >
            {CATEGORIES.map((item) => (
              <ToggleChip
                key={item}
                variant="raised"
                active={category === item}
                onClick={() => setCategory(item)}
                className="h-7 touch:h-11"
              >
                {item}
              </ToggleChip>
            ))}
          </div>

          {/* 「高负载」本来就和上面的 KPI 卡重复，已删；只留 KPI 没有的「即将到期」 */}
          {expiring > 0 && (
            <div className="hidden items-center text-2xs text-subtle sm:flex">
              <span className="flex items-center gap-1 text-warn-text">
                <Clock className="size-3" />
                即将到期 {expiring}
              </span>
            </div>
          )}

          {/* 分组分隔线：明确"筛选"与"排序"是两个功能区 */}
          <span aria-hidden className="h-4 w-px bg-border" />

          {/*
            排序改成下拉。
            六个排序项平铺时和左边的分类长得一模一样，扫过去分不清哪个是
            筛选、哪个是排序；收进下拉后语义清楚，也省出一大截横向空间。
          */}
          <SortMenu
            value={sort}
            onChange={(key) => setParams({ sort: key === "default" ? null : key })}
          />

          <div className="ml-auto flex items-center gap-1">
            {searchOpen ? (
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onBlur={() => {
                  if (query === "") setSearchOpen(false)
                }}
                placeholder="搜索节点、地区、标签"
                aria-label="搜索节点、地区、标签"
                className="h-8 w-[180px] text-xs"
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 touch:size-11 text-muted-foreground"
                onClick={() => setSearchOpen(true)}
                aria-label="搜索"
              >
                <MagnifyingGlass className="size-3.5" />
              </Button>
            )}
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 touch:size-11",
                onlyFavorites ? "text-brand" : "text-subtle",
              )}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              aria-label={`只看收藏（${favorites.length}）`}
              aria-pressed={onlyFavorites}
            >
              <Star
                className="size-3.5"
                weight={onlyFavorites ? "fill" : "light"}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 touch:size-11",
                view === "grid" ? "text-foreground" : "text-subtle",
              )}
              onClick={() => setView("grid")}
              aria-label="网格视图"
            >
              <SquaresFour className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 touch:size-11",
                view === "list" ? "text-foreground" : "text-subtle",
              )}
              onClick={() => setView("list")}
              aria-label="列表视图"
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3.5">
          {!loaded ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-[318px] rounded-lg" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={onlyFavorites ? Star : MagnifyingGlass}
              title={
                onlyFavorites
                  ? favorites.length === 0
                    ? "还没有收藏任何节点"
                    : "收藏的节点都不符合当前筛选"
                  : "没有匹配的节点"
              }
              desc={
                onlyFavorites
                  ? favorites.length === 0
                    ? "点卡片右上角的星标即可收藏。"
                    : "换个分类或清掉搜索关键词。"
                  : "换个关键词，或切换分类。"
              }
              action={
                (onlyFavorites || query !== "" || category !== "全部节点") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => {
                      setParams({ cat: null, q: null, fav: null })
                    }}
                  >
                    清除筛选
                  </Button>
                )
              }
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((node) => (
                <NodeCard
                  onOpenPing={(metric) => setPingDialog({ node, metric })}
                  key={node.id}
                  node={node}
                  favorite={favorites.includes(node.id)}
                  onToggleFavorite={toggleFavorite}
                  onOpen={openNode}
                />
              ))}
            </div>
          ) : (
            <NodeList
              nodes={visible}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onOpen={openNode}
            />
          )}
        </div>
      </main>
      )}

      <PingDetailDialog
        node={pingDialog?.node ?? null}
        metric={pingDialog?.metric ?? null}
        onClose={() => setPingDialog(null)}
      />

      {!opened && <SiteFooter note="仅展示公开指标" />}
    </div>
  )
}
