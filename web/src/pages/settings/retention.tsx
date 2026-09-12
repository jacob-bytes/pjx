import { useState } from "react"
import { toast } from "sonner"
import { PageHeading } from "@/components/page-heading"
import {
  SettingsFooter,
  SettingsSection,
  useDraft,
} from "@/components/settings-shell"
import { useSettings } from "@/components/settings-provider"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { RetentionSettings } from "@/lib/settings"

const MEMORY_OPTIONS = [
  { value: "30m", label: "30 分钟", hours: 0.5 },
  { value: "1h", label: "1 小时", hours: 1 },
  { value: "3h", label: "3 小时", hours: 3 },
]

const RAW_OPTIONS = [
  { value: "6h", label: "6 小时", hours: 6 },
  { value: "24h", label: "24 小时", hours: 24 },
  { value: "72h", label: "3 天", hours: 72 },
]

const M1_OPTIONS = [
  { value: "7d", label: "7 天", days: 7 },
  { value: "14d", label: "14 天", days: 14 },
  { value: "30d", label: "30 天", days: 30 },
  { value: "90d", label: "90 天", days: 90 },
  { value: "365d", label: "365 天", days: 365 },
]

const H1_OPTIONS = [
  { value: "90d", label: "90 天", days: 90 },
  { value: "365d", label: "365 天", days: 365 },
  { value: "1095d", label: "3 年", days: 1095 },
  // days 为 null = 无上界。给"永久"编一个 5 年的占用估算是在编数据，
  // 所以下面直接把这一格显示成「—」。
  { value: "forever", label: "永久", days: null },
] as const

/** master 的最近一次快照，只读 */
const SNAPSHOT = [
  { label: "数据库文件", value: "412 MB" },
  { label: "磁盘剩余", value: "38.2 GB" },
  { label: "最早数据", value: "2025-08-12" },
  { label: "上次清理", value: "12 分钟前" },
]

export function RetentionPage() {
  const { settings, save } = useSettings()
  const { draft, patch, reset, dirty } = useDraft<RetentionSettings>(
    settings.retention,
  )
  const [confirming, setConfirming] = useState<"vacuum" | "purge" | null>(null)

  const memory =
    MEMORY_OPTIONS.find((item) => item.value === draft.memoryKeep) ?? MEMORY_OPTIONS[1]
  const raw = RAW_OPTIONS.find((item) => item.value === draft.rawKeep) ?? RAW_OPTIONS[1]
  const m1 = M1_OPTIONS.find((item) => item.value === draft.m1Keep) ?? M1_OPTIONS[1]
  const h1 = H1_OPTIONS.find((item) => item.value === draft.h1Keep) ?? H1_OPTIONS[1]

  // 估算口径：200 台节点、每节点约 40 个指标字段
  const memoryPoints = Math.round(200 * 3600 * memory.hours)
  const memoryMb = Math.round((memoryPoints * 45) / 1024 / 1024)
  const rawMb = Math.round((raw.hours / 24) * 110)
  const m1Mb = Math.round(m1.days * 32)
  const h1Mb = h1.days === null ? null : Math.round(h1.days * 0.65)

  return (
    <>
      <PageHeading
        title="数据与保留"
        desc="分层存储：实时数据放内存，落盘数据按档位降采样。保留期可按需调整，估算值实时更新。"
      />

      <div className="max-w-[720px] space-y-4">
        {/*
          原来这一条是「412 MB | 38.2 GB | 2025-08-12 | 12 分钟前」——
          4 个 `text-border` 竖线，正是 §AP 在总览统计条上删掉的那种噪声；
          更麻烦的是它和下面随选择实时变化的估算值混在一起，看不出哪几个是真的。
          现在拆成独立区块：上面是 master 快照（只读），下面是估算（跟着选择变）。
        */}
        <SettingsSection title="当前状态" desc="来自 master 的最近一次快照，只读。">
          <dl
            data-testid="retention-snapshot"
            /*
              用 grid 而不是 flex-wrap：4 项在窄容器里 flex 换行会排成 3+1，
              最后一项孤零零占一行（实测 768px 下「上次清理」那格 61/290px，
              其余 79% 是空的）。grid 固定 2 列 / 4 列，换行必然均分。
            */
            className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4"
          >
            {SNAPSHOT.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <dt className="text-2xs text-subtle">{item.label}</dt>
                <dd className="num text-sm font-semibold tracking-tight">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </SettingsSection>

        <SettingsSection
          title="分层与保留期"
          desc="改完点下面的「保存更改」才会生效；右侧占用是按当前选择实时估算的。"
        >
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[544px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-3 text-xs font-medium">层</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">
                    分辨率
                  </TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">
                    保留期
                  </TableHead>
                  <TableHead className="num h-8 px-3 text-right text-xs font-medium">
                    当前数据
                  </TableHead>
                  <TableHead className="num h-8 px-3 text-right text-xs font-medium">
                    预估占用
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="h-10 px-3">
                    <div className="text-xs font-medium">内存层</div>
                    <div className="text-2xs text-subtle">不落盘，重启即丢</div>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-xs">1s</TableCell>
                  <TableCell className="h-10 px-3">
                    <Select
                      value={draft.memoryKeep}
                      onValueChange={(value) => patch({ memoryKeep: value })}
                    >
                      <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMORY_OPTIONS.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="text-xs"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs text-muted-foreground">
                    {memoryPoints.toLocaleString()} 点
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs">
                    ≈ {memoryMb} MB
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="h-10 px-3">
                    <div className="text-xs font-medium">Raw 原始点</div>
                    <div className="text-2xs text-subtle">事故复盘用，默认关闭</div>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-xs">15s</TableCell>
                  <TableCell className="h-10 px-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={draft.rawEnabled}
                        onCheckedChange={(checked) =>
                          patch({ rawEnabled: checked })
                        }
                        aria-label="启用 Raw 层"
                      />
                      <Select
                        value={draft.rawKeep}
                        onValueChange={(value) => patch({ rawKeep: value })}
                        disabled={!draft.rawEnabled}
                      >
                        <SelectTrigger size="sm" className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RAW_OPTIONS.map((item) => (
                            <SelectItem
                              key={item.value}
                              value={item.value}
                              className="text-xs"
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs text-muted-foreground">
                    {draft.rawEnabled ? "5.8 万行" : "关闭"}
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs">
                    {draft.rawEnabled ? `≈ ${rawMb} MB` : "—"}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="h-10 px-3">
                    <div className="text-xs font-medium">1m 汇总</div>
                    <div className="text-2xs text-subtle">主力历史曲线</div>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-xs">1 分钟</TableCell>
                  <TableCell className="h-10 px-3">
                    <Select
                      value={draft.m1Keep}
                      onValueChange={(value) => patch({ m1Keep: value })}
                    >
                      <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {M1_OPTIONS.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="text-xs"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs text-muted-foreground">
                    41 万行
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs">
                    ≈ {m1Mb} MB
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="h-10 px-3">
                    <div className="text-xs font-medium">1h 汇总</div>
                    <div className="text-2xs text-subtle">长期趋势 / 容量规划</div>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-xs">1 小时</TableCell>
                  <TableCell className="h-10 px-3">
                    <Select
                      value={draft.h1Keep}
                      onValueChange={(value) => patch({ h1Keep: value })}
                    >
                      <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {H1_OPTIONS.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="text-xs"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs text-muted-foreground">
                    6.8 万行
                  </TableCell>
                  <TableCell className="num h-10 px-3 text-right text-xs">
                    {h1Mb === null ? (
                      <span title="永久保留没有上界，无法估算占用">—</span>
                    ) : (
                      `≈ ${h1Mb} MB`
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
            按 200 台规模、每节点约 40 个指标字段估算，实际占用以 master 统计为准。
            调长保留期不会恢复已删除的数据；调短后会在下一次维护任务中分批删除，
            再执行「压缩数据库」才会真正释放磁盘。
          </p>

          <SettingsFooter
            dirty={dirty}
            onSave={() => save({ retention: draft })}
            onReset={reset}
          />
        </SettingsSection>

        {/*
          这两个操作原来点了就执行（只弹一个 toast），没有确认 ——
          而同一套界面里「撤销令牌」「移除节点」都是有确认的。
          压缩数据库会锁表，属于最该确认的一类。
        */}
        <SettingsSection
          danger
          title="维护操作"
          desc="立即在 master 上执行，不可撤销。"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setConfirming("purge")}
            >
              立即清理
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setConfirming("vacuum")}
            >
              压缩数据库
            </Button>
          </div>
        </SettingsSection>
      </div>

      <ConfirmDialog
        open={confirming === "purge"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="立即执行一次清理？"
        desc="会按当前保留期删除超期的降采样数据。删除不可恢复；调长保留期也找不回来。"
        confirmLabel="立即清理"
        onConfirm={() => {
          setConfirming(null)
          toast("已触发清理（演示）")
        }}
      />
      <ConfirmDialog
        open={confirming === "vacuum"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="压缩数据库？"
        desc="SQLite VACUUM 会重写整个数据库文件，期间占用额外磁盘并锁表，master 的写入会短暂阻塞。"
        confirmLabel="压缩"
        onConfirm={() => {
          setConfirming(null)
          toast("已开始压缩数据库（演示）")
        }}
      />
    </>
  )
}
