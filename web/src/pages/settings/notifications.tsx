import { toast } from "sonner"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function NotificationsPage() {
  return (
    <>
      <PageHeading
        title="通知"
        desc="告警触发与恢复各发一次，带冷却期与状态机，避免抖动刷屏。"
      />

      <section className="card p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium">Telegram</h3>
            <p className="mt-0.5 text-2xs text-subtle">
              Bot API · HTML 格式 · 支持群组 Topic
            </p>
          </div>
          <Switch defaultChecked aria-label="启用 Telegram 通知" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Bot Token</Label>
            <Input
              type="password"
              defaultValue="1234567890:AAH3kL9xQm2fTz8bWc4Vd6Ye1Rs7Ug"
              className="num h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chat ID</Label>
            <Input defaultValue="-1002345678901" className="num h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Topic ID（可选）</Label>
            <Input placeholder="群组话题 ID" className="num h-8 text-xs" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => toast("测试消息已发送，请检查 Telegram")}
          >
            发送测试消息
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => toast("已保存通知设置")}
          >
            保存
          </Button>
          <span className="text-2xs text-subtle">
            遇到 429 会按 retry_after 退避重试
          </span>
        </div>
      </section>

      <section className="card mt-4 p-3.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium">Webhook</h3>
          <Badge
            variant="outline"
            className="h-5 rounded-[4px] px-1.5 text-2xs font-normal text-muted-foreground"
          >
            预留
          </Badge>
        </div>
        <p className="mt-1 text-2xs text-subtle">
          Notifier 接口已按多渠道路由设计，v1 只实装 Telegram；接入 Webhook
          时不需要改告警核心。
        </p>
        <Input
          disabled
          placeholder="https://example.com/hooks/pjx"
          className="num mt-3 h-8 text-xs"
        />
      </section>
    </>
  )
}
