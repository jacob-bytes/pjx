import { useSearchParams } from "react-router"
import { BellSlash } from "@phosphor-icons/react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { useRuleEnabled } from "@/components/settings-provider"
import { Segmented } from "@/components/segmented"
import { StatusDot } from "@/components/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { alertEvents, alertRules, type AlertRule } from "@/lib/mock"
import { pickParam } from "@/lib/url"
import { cn } from "@/lib/utils"

const LEVEL_LABEL = { crit: "严重", warn: "警告", info: "信息" } as const
const LEVEL_COLOR = {
  crit: "bg-crit",
  warn: "bg-warn",
  info: "bg-info",
} as const

/**
 * 告警规则的一行。
 * 「启用」原来是 `defaultChecked`（无 state，刷新即回默认）—— 现在落进配置 store。
 * 行内开关 = 改完立即生效，并给一句提示。
 */
function RuleRow({ rule }: { rule: AlertRule }) {
  const { enabled, setEnabled } = useRuleEnabled(rule.id, rule.enabled)

  return (
    <TableRow className={cn(!enabled && "text-subtle")}>
      <TableCell className="h-9 px-3 text-xs font-medium">
        <div className="flex items-center gap-2">
          <span className={cn(enabled && "text-foreground")}>{rule.name}</span>
          {!enabled && (
            <Badge
              variant="outline"
              className="h-5 rounded-[4px] px-1.5 text-2xs font-normal text-subtle"
            >
              已停用
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
        {rule.condition}
      </TableCell>
      <TableCell className="num h-9 px-3 text-xs">{rule.hold}</TableCell>
      <TableCell className="h-9 px-3">
        <span className="flex items-center gap-1.5 text-xs">
          <StatusDot status={rule.level === "crit" ? "crit" : "warn"} />
          {LEVEL_LABEL[rule.level]}
        </span>
      </TableCell>
      <TableCell className="h-9 px-3 text-xs text-muted-foreground">
        {rule.channel}
      </TableCell>
      <TableCell className="h-9 px-3 text-right">
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            toast(checked ? `已启用规则「${rule.name}」` : `已停用规则「${rule.name}」`)
          }}
          aria-label={`启用告警规则 ${rule.name}`}
        />
      </TableCell>
    </TableRow>
  )
}

export function AlertsPage() {
  const [params, setParams] = useSearchParams()
  const level = pickParam(params, "level", ["all", "crit", "warn"] as const, "all")
  const setLevel = (value: "all" | "crit" | "warn") => {
    const next = new URLSearchParams(params)
    if (value === "all") next.delete("level")
    else next.set("level", value)
    setParams(next)
  }

  const events = alertEvents.filter(
    (event) => level === "all" || event.level === level,
  )

  return (
    <Tabs defaultValue="events" className="gap-3">
      <div className="flex items-center">
        <TabsList className="h-8 justify-start gap-1 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="events"
            className="h-8 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            事件
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="h-8 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            规则
          </TabsTrigger>
        </TabsList>

        <Segmented
          ariaLabel="按级别筛选"
          value={level}
          onChange={setLevel}
          className="ml-auto"
          options={[
            { value: "all", label: "全部" },
            { value: "crit", label: "严重" },
            { value: "warn", label: "警告" },
          ]}
        />
      </div>

      <TabsContent value="events" className="mt-0">
        {events.length === 0 ? (
          <EmptyState
            icon={BellSlash}
            title="该级别下没有事件"
            desc="当前没有触发中的告警，或换个级别看看。"
            action={
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setLevel("all")}
              >
                查看全部
              </Button>
            }
          />
        ) : (
            <div className="-mx-5 max-h-[calc(100svh-11rem)] overflow-auto px-5">
              <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="num h-8 px-3 text-xs font-medium">时间</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">级别</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">对象</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">规则</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">状态</TableHead>
                  <TableHead className="h-8 px-3 text-right text-xs font-medium">
                    持续
                  </TableHead>
                  <TableHead className="h-8 px-3 text-right text-xs font-medium">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
                      {event.time}
                    </TableCell>
                    <TableCell className="h-9 px-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span
                          className={cn(
                            "size-[7px] rounded-full",
                            LEVEL_COLOR[event.level],
                          )}
                        />
                        {LEVEL_LABEL[event.level]}
                      </span>
                    </TableCell>
                    <TableCell className="h-9 px-3 text-xs font-medium">
                      {event.object}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-xs text-muted-foreground">
                      {event.rule}
                    </TableCell>
                    <TableCell className="h-9 px-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 rounded-[4px] px-1.5 text-2xs font-normal",
                          event.state === "firing"
                            ? "border-destructive/40 text-destructive"
                            : "text-subtle",
                        )}
                      >
                        {event.state === "firing" ? "Firing" : "Resolved"}
                      </Badge>
                    </TableCell>
                    <TableCell className="num h-9 px-3 text-right text-xs text-muted-foreground">
                      {event.duration}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs text-muted-foreground"
                      >
                        静音
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
        )}
      </TabsContent>

      <TabsContent value="rules" className="mt-0">
        <div className="-mx-5 max-h-[calc(100svh-11rem)] overflow-auto px-5">
          <Table className="min-w-[840px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-3 text-xs font-medium">规则</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">条件</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">持续</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">级别</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">通知</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  启用
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertRules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  )
}
