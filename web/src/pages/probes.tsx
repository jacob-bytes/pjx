import { useDeferredValue, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { DotsThree, MagnifyingGlass, Play, Plus, Trash } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { useProbeConfig, useProbeList } from "@/components/settings-provider"
import { StatusDot } from "@/components/status-dot"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { probes, useFleetTick, type Probe } from "@/lib/mock"
import { createToken, type CreatedProbe } from "@/lib/settings"
import { TABLE_VIEWPORT } from "@/lib/layout"
import { cn } from "@/lib/utils"

const INTERVALS = [
  { value: "10s", label: "每 10 秒" },
  { value: "30s", label: "每 30 秒" },
  { value: "1m", label: "每分钟" },
  { value: "5m", label: "每 5 分钟" },
] as const
const FAIL_THRESHOLDS = ["连续 2 次", "连续 3 次", "连续 5 次"] as const
const CHANNELS = [
  { value: "telegram", label: "Telegram" },
  { value: "all", label: "全部渠道" },
] as const

/** 表格行：`runtime` 为空表示这条任务还没有收到过上报 */
interface ProbeRowData {
  id: string
  name: string
  kind: Probe["kind"]
  target: string
  interval: string
  scope: string
  runtime: Probe | null
}

/**
 * 探测任务的一行。
 *
 * 单独抽成组件是因为要按行调用 `useProbeConfig` —— hook 不能写在 `.map()` 里。
 * 「启用」是一个**行内开关**：改完立即生效并给提示，不再要求按"保存"
 * （一个 Switch 如果还要再点保存才生效，就是在骗人）。
 */
function ProbeRow({
  row,
  onRemove,
}: {
  row: ProbeRowData
  onRemove: (row: ProbeRowData) => void
}) {
  const { enabled, setEnabled } = useProbeConfig(row.id)
  const dimmed = !enabled
  const runtime = row.runtime

  return (
    <TableRow className={cn(dimmed && "text-subtle")}>
      <TableCell className="h-9 px-3">
        {runtime ? (
          <StatusDot status={dimmed ? "off" : runtime.status} />
        ) : (
          /* 新建的任务还没有上报过，别拿状态点假装它"在线"或"离线" */
          <span className="text-2xs text-subtle">待执行</span>
        )}
      </TableCell>
      <TableCell className="h-9 px-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              dimmed && "text-muted-foreground line-through",
            )}
          >
            {row.name}
          </span>
          {dimmed && (
            <Badge
              variant="outline"
              className="h-5 rounded-xs px-1.5 text-2xs font-normal text-subtle"
            >
              已停用
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="h-9 px-3">
        <Badge
          variant="outline"
          className="num h-5 rounded-xs px-1.5 text-2xs font-medium"
        >
          {row.kind}
        </Badge>
      </TableCell>
      <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
        {row.target}
      </TableCell>
      <TableCell className="num h-9 px-3 text-xs">{row.interval}</TableCell>
      <TableCell className="h-9 px-3 text-xs text-muted-foreground">
        {row.scope}
      </TableCell>
      {/*
        停用后这些运行时数字不再更新，继续按正常字色显示会让人以为它还在跑；
        新建的任务则**根本没有数据**——两种情况都退到 subtle 并显示「—」。
      */}
      <TableCell
        className={cn(
          "num h-9 px-3 text-right text-xs",
          dimmed && "text-subtle",
        )}
      >
        {runtime ? `${runtime.avg.toFixed(1)} / ${runtime.p95.toFixed(1)} ms` : "—"}
      </TableCell>
      <TableCell
        className={cn(
          "num h-9 px-3 text-right text-xs",
          !runtime || dimmed
            ? "text-subtle"
            : runtime.success < 99 && "text-warn-text",
        )}
      >
        {runtime ? `${runtime.success.toFixed(2)}%` : "—"}
      </TableCell>
      <TableCell className="h-9 px-3 text-xs text-subtle">
        {runtime ? runtime.lastCheck : "尚未执行"}
      </TableCell>
      <TableCell className="h-9 px-3">
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            toast(checked ? `已启用「${row.name}」` : `已停用「${row.name}」`)
          }}
          aria-label={`启用探测任务 ${row.name}`}
        />
      </TableCell>
      <TableCell className="h-9 px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground touch:size-11"
              aria-label={`${row.name} 的更多操作`}
            >
              <DotsThree className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              disabled={!enabled}
              onClick={() =>
                toast(`已下发一次「${row.name}」（演示，未接入 master）`)
              }
            >
              <Play className="size-3.5" />
              立即执行一次
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(row)}>
              <Trash className="size-3.5" />
              删除任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

/* ---------------------------------------------------------------- 新建表单 */

interface FormState {
  name: string
  kind: Probe["kind"]
  target: string
  interval: string
  timeoutSec: string
  scope: string
  failThreshold: string
  notifications: string
}

const EMPTY_FORM: FormState = {
  name: "",
  kind: "HTTP",
  target: "",
  interval: "30s",
  timeoutSec: "5",
  scope: "全部节点",
  failThreshold: "连续 3 次",
  notifications: "telegram",
}

const TARGET_HINT: Record<Probe["kind"], { label: string; placeholder: string }> = {
  HTTP: { label: "URL", placeholder: "https://example.com/healthz" },
  TCP: { label: "host:port", placeholder: "db.internal:3306" },
  ICMP: { label: "目标地址", placeholder: "1.1.1.1" },
}

/** 按各类型探测的真实约束校验，而不是只检查非空 */
function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {}
  const name = form.name.trim()
  if (!name) errors.name = "必填"
  else if (name.length > 32) errors.name = "不超过 32 个字符"

  const target = form.target.trim()
  if (!target) errors.target = "必填"
  else if (form.kind === "HTTP" && !/^https?:\/\/\S+$/i.test(target)) {
    errors.target = "HTTP 探测需要以 http:// 或 https:// 开头"
  } else if (form.kind === "TCP" && !/^[^\s:]+:\d{1,5}$/.test(target)) {
    errors.target = "TCP 探测需要 host:port 形式（例如 db.internal:3306）"
  } else if (form.kind === "ICMP" && !/^[a-z0-9.-]+$/i.test(target)) {
    errors.target = "填主机名或 IP，不要带协议与路径"
  }

  const timeout = Number(form.timeoutSec)
  if (!/^\d+$/.test(form.timeoutSec) || timeout < 1 || timeout > 60) {
    errors.timeoutSec = "1–60 秒"
  }
  return errors
}

function CreateProbeSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (probe: CreatedProbe) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [touched, setTouched] = useState(false)

  const errors = validate(form)
  const valid = Object.keys(errors).length === 0
  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }))

  const close = () => {
    setForm(EMPTY_FORM)
    setTouched(false)
    onClose()
  }

  const show = (key: keyof FormState) =>
    touched && errors[key] ? errors[key] : undefined

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-sm font-semibold">新建探测任务</SheetTitle>
          <SheetDescription className="text-xs">
            由 master 按调度下发到目标节点执行；结果用于告警与历史曲线。
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="probe-name" className="text-xs">
              名称
            </Label>
            <Input
              id="probe-name"
              value={form.name}
              maxLength={32}
              onChange={(event) => patch({ name: event.target.value })}
              onBlur={() => setTouched(true)}
              placeholder="例如：主站可用性"
              aria-invalid={Boolean(show("name"))}
              className="h-8 text-xs touch:h-11"
            />
            {show("name") && (
              <p className="text-2xs text-crit-text">{show("name")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <Segmented
              ariaLabel="探测类型"
              fill
              mono
              value={form.kind}
              /* 换了类型，原来的目标多半不再合法 —— 清掉并换提示，别留一个必然报错的旧值 */
              onChange={(kind) => patch({ kind, target: "" })}
              options={[
                { value: "HTTP", label: "HTTP" },
                { value: "TCP", label: "TCP" },
                { value: "ICMP", label: "ICMP" },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="probe-target" className="text-xs">
              {TARGET_HINT[form.kind].label}
            </Label>
            <Input
              id="probe-target"
              value={form.target}
              onChange={(event) => patch({ target: event.target.value })}
              onBlur={() => setTouched(true)}
              placeholder={TARGET_HINT[form.kind].placeholder}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={Boolean(show("target"))}
              className="num h-8 text-xs touch:h-11"
            />
            {show("target") ? (
              <p className="text-2xs text-crit-text">{show("target")}</p>
            ) : (
              form.kind === "ICMP" && (
                <p className="text-2xs text-subtle">
                  节点没有 CAP_NET_RAW 权限时会自动降级为 TCP ping。
                </p>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">调度</Label>
              <Select
                value={form.interval}
                onValueChange={(value) => patch({ interval: value })}
              >
                <SelectTrigger className="h-8 w-full text-xs touch:h-11!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-xs">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="probe-timeout" className="text-xs">
                超时（秒）
              </Label>
              <Input
                id="probe-timeout"
                value={form.timeoutSec}
                onChange={(event) => patch({ timeoutSec: event.target.value })}
                onBlur={() => setTouched(true)}
                inputMode="numeric"
                aria-invalid={Boolean(show("timeoutSec"))}
                className="num h-8 text-xs touch:h-11"
              />
              {show("timeoutSec") && (
                <p className="text-2xs text-crit-text">{show("timeoutSec")}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">目标节点</Label>
            <Segmented
              ariaLabel="目标节点范围"
              fill
              value={form.scope}
              onChange={(scope) => patch({ scope })}
              options={[
                { value: "全部节点", label: "全部节点" },
                { value: "按标签", label: "按标签" },
                { value: "指定节点", label: "指定节点" },
              ]}
            />
            <p className="text-2xs text-subtle">
              {form.scope === "全部节点"
                ? "将在全部 12 台节点上执行"
                : form.scope === "按标签"
                  ? "选择标签：生产 / 备用 / 香港 / 东京…"
                  : "手动勾选节点"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">失败阈值</Label>
              {/* 原来是自由文本输入框，而它的取值本来就是一个枚举 */}
              <Select
                value={form.failThreshold}
                onValueChange={(value) => patch({ failThreshold: value })}
              >
                <SelectTrigger className="h-8 w-full text-xs touch:h-11!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAIL_THRESHOLDS.map((item) => (
                    <SelectItem key={item} value={item} className="text-xs">
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">通知渠道</Label>
              <Select
                value={form.notifications}
                onValueChange={(value) => patch({ notifications: value })}
              >
                <SelectTrigger className="h-8 w-full text-xs touch:h-11!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-xs">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs touch:h-11"
            onClick={close}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs touch:h-11"
            onClick={() => {
              setTouched(true)
              if (!valid) return
              onCreate({
                id: `p-${createToken().slice(0, 8)}`,
                name: form.name.trim(),
                kind: form.kind,
                target: form.target.trim(),
                interval: form.interval,
                timeoutSec: form.timeoutSec,
                scope: form.scope,
                failThreshold: form.failThreshold,
                notifications: form.notifications,
              })
              close()
            }}
          >
            创建任务
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/* ---------------------------------------------------------------- 页面 */

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
  const [deleting, setDeleting] = useState<ProbeRowData | null>(null)
  const probeList = useProbeList()

  const deferredQuery = useDeferredValue(query)

  const alive = useMemo(
    () => probes.filter((probe) => !probeList.removed.includes(probe.id)),
    [probeList.removed],
  )

  const rows = useMemo<ProbeRowData[]>(() => {
    const fromMock: ProbeRowData[] = alive.map((probe) => ({
      id: probe.id,
      name: probe.name,
      kind: probe.kind,
      target: probe.target,
      interval: probe.interval,
      scope: probe.scope,
      runtime: probe,
    }))
    // 用户新建的任务没有任何运行时数据，运行时列一律显示「—」
    const created: ProbeRowData[] = probeList.created.map((probe) => ({
      id: probe.id,
      name: probe.name,
      kind: probe.kind,
      target: probe.target,
      interval: probe.interval,
      scope: probe.scope,
      runtime: null,
    }))
    return [...created, ...fromMock]
  }, [alive, probeList.created])

  const list = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(keyword) ||
        row.target.toLowerCase().includes(keyword),
    )
  }, [rows, deferredQuery])

  // 只摘掉 new，保留 q 等其它参数
  const closeCreate = () => {
    const next = new URLSearchParams(params)
    next.delete("new")
    setParams(next, { replace: true })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[220px]">
          <MagnifyingGlass
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务或目标"
            aria-label="搜索任务或目标"
            className="h-8 bg-card pl-8 text-xs touch:h-11"
          />
        </div>
        <Button
          size="sm"
          className="ml-auto h-8 gap-1.5 px-3 text-xs touch:h-11"
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
              className="h-8 gap-1.5 px-3 text-xs touch:h-11"
              onClick={() => setParams({ new: "1" })}
            >
              <Plus className="size-3.5" />
              新建探测
            </Button>
          }
        />
      ) : (
        <div className={TABLE_VIEWPORT}>
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-3 text-xs font-medium">状态</TableHead>
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
                {/* 启用是配置，放在表里直接改（行内开关 = 改完立即生效） */}
                <TableHead className="h-8 px-3 text-xs font-medium">启用</TableHead>
                <TableHead className="h-8 w-11 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <ProbeRow key={row.id} row={row} onRemove={setDeleting} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateProbeSheet
        open={creating}
        onClose={closeCreate}
        onCreate={(probe) => {
          probeList.create(probe)
          toast(`已创建「${probe.name}」，等待 master 首次下发`)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`删除探测任务「${deleting?.name ?? ""}」？`}
        desc="该任务的延迟与成功率历史会一并删除，且不可恢复；已触发的告警记录保留。"
        confirmLabel="删除"
        onConfirm={() => {
          if (deleting) {
            if (deleting.runtime) probeList.remove(deleting.id)
            else probeList.removeCreated(deleting.id)
            toast(`已删除「${deleting.name}」`)
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}
