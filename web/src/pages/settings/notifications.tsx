import { useState } from "react"
import { CheckCircle, Eye, EyeSlash, SpinnerGap, XCircle } from "@phosphor-icons/react"
import { toast } from "sonner"
import { IconButton } from "@/components/icon-button"
import { PageHeading } from "@/components/page-heading"
import {
  SettingsField,
  SettingsFooter,
  SettingsSection,
  useDraft,
} from "@/components/settings-shell"
import { useSettings } from "@/components/settings-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { TELEGRAM_TOKEN_RE } from "@/lib/settings"

type TestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok" }
  | { kind: "fail"; reason: string }

/** 发送前先按 Telegram Bot API 的实际约束校验 —— 一个永远成功的"测试"按钮等于没有 */
function validate(telegram: { botToken: string; chatId: string }): string | null {
  if (!telegram.botToken.trim()) return "Bot Token 为空"
  if (!TELEGRAM_TOKEN_RE.test(telegram.botToken.trim())) {
    return "Bot Token 格式不对：应为「<数字>:<35 位字符>」"
  }
  if (!/^-?\d+$/.test(telegram.chatId.trim())) {
    return "Chat ID 应为数字（群组 ID 以 -100 开头）"
  }
  return null
}

export function NotificationsPage() {
  const { settings, save } = useSettings()
  const { draft, patch, reset, dirty } = useDraft(settings.telegram)
  const [reveal, setReveal] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: "idle" })

  const runTest = () => {
    const reason = validate(draft)
    if (reason) {
      setTest({ kind: "fail", reason })
      return
    }
    setTest({ kind: "sending" })
    // 真实实现里这里是一次 Telegram sendMessage 往返
    window.setTimeout(() => {
      setTest({ kind: "ok" })
      toast("测试消息已发送（演示，未接入 master）")
    }, 600)
  }

  return (
    <>
      <PageHeading
        title="通知"
        desc="告警触发与恢复各发一次，带冷却期与状态机，避免抖动刷屏。"
      />

      <div className="max-w-[520px] space-y-4">
        <SettingsSection
          title="Telegram"
          desc="Bot API · HTML 格式 · 支持群组 Topic"
          action={
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) => patch({ enabled: checked })}
              aria-label="启用 Telegram 通知"
            />
          }
        >
          <div className="space-y-3">
            <SettingsField
              label="Bot Token"
              htmlFor="bot-token"
              hint="在 @BotFather 里创建机器人后获得；只保存在本机配置里。"
            >
              <div className="relative">
                <Input
                  id="bot-token"
                  type={reveal ? "text" : "password"}
                  value={draft.botToken}
                  onChange={(event) => patch({ botToken: event.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                  className="num h-8 pr-9 text-xs touch:h-11"
                />
                {/* 输入密钥时总得能核对一遍自己粘了什么 —— 只能盲目粘贴是没法排错的 */}
                <IconButton
                  label={reveal ? "隐藏令牌" : "显示令牌"}
                  onClick={() => setReveal((value) => !value)}
                  className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2"
                  aria-pressed={reveal}
                >
                  {reveal ? (
                    <EyeSlash className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </IconButton>
              </div>
            </SettingsField>

            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsField label="Chat ID" htmlFor="chat-id">
                <Input
                  id="chat-id"
                  value={draft.chatId}
                  onChange={(event) => patch({ chatId: event.target.value })}
                  className="num h-8 text-xs touch:h-11"
                />
              </SettingsField>
              <SettingsField label="Topic ID（可选）" htmlFor="topic-id">
                <Input
                  id="topic-id"
                  value={draft.topicId}
                  onChange={(event) => patch({ topicId: event.target.value })}
                  placeholder="群组话题 ID"
                  className="num h-8 text-xs touch:h-11"
                />
              </SettingsField>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-3 text-xs touch:h-11"
                disabled={test.kind === "sending"}
                onClick={runTest}
              >
                {test.kind === "sending" && (
                  <SpinnerGap className="size-3.5 animate-spin" />
                )}
                发送测试消息
              </Button>

              {/*
                测试按钮原来**永远报成功** —— 拿它去验证一个填错的 Token
                会得到"已发送，请检查 Telegram"，然后就没有然后了。
                现在先按 Bot API 的真实约束校验，再给出三态结果。
              */}
              {test.kind === "ok" && (
                <span className="flex items-center gap-1.5 text-2xs text-ok-text">
                  <CheckCircle className="size-3.5" />
                  已送达（演示）
                </span>
              )}
              {test.kind === "fail" && (
                <span className="flex items-center gap-1.5 text-2xs text-crit-text">
                  <XCircle className="size-3.5" />
                  {test.reason}
                </span>
              )}
              {test.kind === "idle" && (
                <span className="text-2xs text-subtle">
                  遇到 429 会按 retry_after 退避重试
                </span>
              )}
            </div>
          </div>

          <SettingsFooter
            dirty={dirty}
            onSave={() => {
              save({ telegram: draft })
              setTest({ kind: "idle" })
            }}
            onReset={() => {
              reset()
              setTest({ kind: "idle" })
            }}
          />
        </SettingsSection>

        <SettingsSection title="Webhook">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="h-5 rounded-[4px] px-1.5 text-2xs font-normal text-muted-foreground"
            >
              预留
            </Badge>
            <span className="text-2xs text-subtle">
              Notifier 接口已按多渠道路由设计，v1 只实装 Telegram
            </span>
          </div>
          {/* 原来这里放了一个 disabled 的输入框：看得出形状，但既不能填也不会生效 */}
        </SettingsSection>
      </div>
    </>
  )
}
