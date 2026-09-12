import { useDeferredValue, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { StatusDot } from "@/components/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { probes, useFleetTick } from "@/lib/mock"
import { cn } from "@/lib/utils"

const SCENES = ["全部节点", "按标签", "指定节点"] as const
const KINDS = ["HTTP", "TCP", "ICMP"] as const

export function ProbesPage() {
  useFleetTick()
  const [params, setParams] = useSearchParams()
  const creating = params.get("new") === "1"
  // 搜索词同样进 URL，刷新和分享都不丢
  const query = params.get("q") ?? ""
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set("q", value)
    else next.delete("q")
    setParams(next, { replace: true })
  }
  const [kind, setKind] = useState<(typeof KINDS)[number]>("HTTP")
  const [scope, setScope] = useState<(typeof SCENES)[number]>("全部节点")

  const deferredQuery = useDeferredValue(query)

  const list = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) return probes
    return probes.filter(
      (probe) =>
        probe.name.toLowerCase().includes(keyword) ||
        probe.target.toLowerCase().includes(keyword),
    )
  }, [deferredQuery])

  // 只摘掉 new，保留 q 等其它参数
  const closeCreate = () => {
    const next = new URLSearchParams(params)
    next.delete("new")
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <MagnifyingGlass
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务或目标"
            aria-label="搜索任务或目标"
            className="h-8 w-[220px] pl-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          className="ml-auto h-8 gap-1.5 px-3 text-xs"
          onClick={() => setParams({ new: "1" })}
        >
          <Plus className="size-3.5" />
          新建探测
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="没有匹配的探测任务"
          desc="换个关键词，或新建一个任务。"
          action={
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setParams({ new: "1" })}
            >
              <Plus className="size-3.5" />
              新建探测
            </Button>
          }
        />
      ) : (
          <div className="-mx-5 max-h-[calc(100svh-11rem)] overflow-auto px-5">
            <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 w-8 px-3" />
                <TableHead className="h-8 px-3 text-xs font-medium">名称</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">类型</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">目标</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">调度</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">覆盖</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  延迟 avg / p95
                </TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  成功率
                </TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">
                  最近检查
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((probe) => (
                <TableRow key={probe.id}>
                  <TableCell className="h-9 px-3">
                    <StatusDot status={probe.status} />
                  </TableCell>
                  <TableCell className="h-9 px-3 text-xs font-medium">
                    {probe.name}
                  </TableCell>
                  <TableCell className="h-9 px-3">
                    <Badge
                      variant="outline"
                      className="num h-5 rounded-[4px] px-1.5 text-2xs font-medium"
                    >
                      {probe.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
                    {probe.target}
                  </TableCell>
                  <TableCell className="num h-9 px-3 text-xs">
                    {probe.interval}
                  </TableCell>
                  <TableCell className="h-9 px-3 text-xs text-muted-foreground">
                    {probe.scope}
                  </TableCell>
                  <TableCell className="num h-9 px-3 text-right text-xs">
                    {probe.avg.toFixed(1)} / {probe.p95.toFixed(1)} ms
                  </TableCell>
                  <TableCell
                    className={cn(
                      "num h-9 px-3 text-right text-xs",
                      probe.success < 99 && "text-warn-text",
                    )}
                  >
                    {probe.success.toFixed(2)}%
                  </TableCell>
                  <TableCell className="h-9 px-3 text-xs text-subtle">
                    {probe.lastCheck}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
      )}

      <Sheet open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-sm font-semibold">新建探测任务</SheetTitle>
            <SheetDescription className="text-xs">
              由 master 按调度下发到目标节点执行，结果用于告警与历史曲线。
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs">名称</Label>
              <Input placeholder="例如：主站可用性" className="h-8 text-xs" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">类型</Label>
              <Segmented
                ariaLabel="探测类型"
                fill
                mono
                value={kind}
                onChange={setKind}
                options={[
                  { value: "HTTP", label: "HTTP" },
                  { value: "TCP", label: "TCP" },
                  { value: "ICMP", label: "ICMP" },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {kind === "HTTP" ? "URL" : kind === "TCP" ? "host:port" : "目标地址"}
              </Label>
              <Input
                key={kind}
                defaultValue={
                  kind === "HTTP"
                    ? "https://example.com"
                    : kind === "TCP"
                      ? "db.internal:3306"
                      : "1.1.1.1"
                }
                spellCheck={false}
                autoComplete="off"
                className="num h-8 text-xs"
              />
              {kind === "ICMP" && (
                <p className="text-2xs text-subtle">
                  节点没有 CAP_NET_RAW 权限时会自动降级为 TCP ping。
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">调度</Label>
                <Select defaultValue="30s">
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10s">每 10 秒</SelectItem>
                    <SelectItem value="30s">每 30 秒</SelectItem>
                    <SelectItem value="1m">每分钟</SelectItem>
                    <SelectItem value="5m">每 5 分钟</SelectItem>
                    <SelectItem value="cron">cron 表达式…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">超时</Label>
                <Input defaultValue="5" className="num h-8 text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">目标节点</Label>
              <Segmented
                ariaLabel="目标节点范围"
                fill
                value={scope}
                onChange={setScope}
                options={[
                  { value: "全部节点", label: "全部节点" },
                  { value: "按标签", label: "按标签" },
                  { value: "指定节点", label: "指定节点" },
                ]}
              />
              <p className="text-2xs text-subtle">
                {scope === "全部节点"
                  ? "将在全部 12 台节点上执行"
                  : scope === "按标签"
                    ? "选择标签：生产 / 备用 / 香港 / 东京…"
                    : "手动勾选节点"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">失败阈值</Label>
                <Input defaultValue="连续 3 次" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">通知渠道</Label>
                <Select defaultValue="telegram">
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="all">全部渠道</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={closeCreate}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                closeCreate()
                toast("已创建探测任务（演示）")
              }}
            >
              创建任务
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
