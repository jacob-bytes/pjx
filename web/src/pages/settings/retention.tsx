import { useState } from "react"
import { toast } from "sonner"
import { PageHeading } from "@/components/page-heading"
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
  { value: "forever", label: "永久", days: 1825 },
]

export function RetentionPage() {
  const [memoryKeep, setMemoryKeep] = useState("1h")
  const [rawEnabled, setRawEnabled] = useState(false)
  const [rawKeep, setRawKeep] = useState("24h")
  const [m1Keep, setM1Keep] = useState("14d")
  const [h1Keep, setH1Keep] = useState("365d")

  const memory = MEMORY_OPTIONS.find((item) => item.value === memoryKeep) ?? MEMORY_OPTIONS[1]
  const raw = RAW_OPTIONS.find((item) => item.value === rawKeep) ?? RAW_OPTIONS[1]
  const m1 = M1_OPTIONS.find((item) => item.value === m1Keep) ?? M1_OPTIONS[1]
  const h1 = H1_OPTIONS.find((item) => item.value === h1Keep) ?? H1_OPTIONS[1]

  // 估算口径：200 台节点、每节点约 40 个指标字段
  const memoryPoints = Math.round(200 * 3600 * memory.hours)
  const memoryMb = Math.round(memoryPoints * 45 / 1024 / 1024)
  const rawMb = Math.round((raw.hours / 24) * 110)
  const m1Mb = Math.round(m1.days * 32)
  const h1Mb = Math.round(h1.days * 0.65)

  return (
    <>
      <PageHeading
        title="数据与保留"
        desc="分层存储：实时数据放内存，落盘数据按档位降采样。保留期可按需调整，估算值实时更新。"
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        <span>
          数据库文件 <b className="num font-medium text-foreground">412 MB</b>
        </span>
        <span className="text-border">|</span>
        <span>
          磁盘剩余 <b className="num font-medium text-foreground">38.2 GB</b>
        </span>
        <span className="text-border">|</span>
        <span>
          最早数据 <b className="num font-medium text-foreground">2025-08-12</b>
        </span>
        <span className="text-border">|</span>
        <span>
          上次清理 <b className="num font-medium text-foreground">12 分钟前</b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 px-3 text-xs font-medium">层</TableHead>
              <TableHead className="h-8 px-3 text-xs font-medium">分辨率</TableHead>
              <TableHead className="h-8 px-3 text-xs font-medium">保留期</TableHead>
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
                <Select value={memoryKeep} onValueChange={setMemoryKeep}>
                  <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMORY_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-xs">
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
                    checked={rawEnabled}
                    onCheckedChange={setRawEnabled}
                    aria-label="启用 Raw 层"
                  />
                  <Select
                    value={rawKeep}
                    onValueChange={setRawKeep}
                    disabled={!rawEnabled}
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
                {rawEnabled ? "5.8 万行" : "关闭"}
              </TableCell>
              <TableCell className="num h-10 px-3 text-right text-xs">
                {rawEnabled ? `≈ ${rawMb} MB` : "—"}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="h-10 px-3">
                <div className="text-xs font-medium">1m 汇总</div>
                <div className="text-2xs text-subtle">主力历史曲线</div>
              </TableCell>
              <TableCell className="num h-10 px-3 text-xs">1 分钟</TableCell>
              <TableCell className="h-10 px-3">
                <Select value={m1Keep} onValueChange={setM1Keep}>
                  <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {M1_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-xs">
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
                <Select value={h1Keep} onValueChange={setH1Keep}>
                  <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {H1_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-xs">
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
                ≈ {h1Mb} MB
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 rounded-md border border-dashed p-3 text-2xs leading-relaxed text-muted-foreground">
        按 200 台规模、每节点约 40 个指标字段估算，实际占用以 master 统计为准。
        调长保留期不会恢复已删除的数据；调短后会在下一次维护任务中分批删除，
        再点「压缩数据库」才会真正释放磁盘。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => toast("保留策略已保存，下次清理立即生效")}
        >
          保存更改
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => toast("已触发清理（演示）")}
        >
          立即清理
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => toast("已开始压缩数据库（演示）")}
        >
          压缩数据库
        </Button>
      </div>
    </>
  )
}
