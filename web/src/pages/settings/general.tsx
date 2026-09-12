import { Segmented } from "@/components/segmented"
import { PageHeading } from "@/components/page-heading"
import {
  SettingsField,
  SettingsFooter,
  SettingsSection,
  useDraft,
} from "@/components/settings-shell"
import { useSettings } from "@/components/settings-provider"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useColorBlindMode } from "@/lib/a11y"
import { useTheme } from "@/lib/theme"

export function GeneralPage() {
  const { dark, setDark } = useTheme()
  const { colorBlindMode, setColorBlindMode } = useColorBlindMode()
  const { settings, save } = useSettings()
  const { draft, patch, reset, dirty } = useDraft({
    siteName: settings.siteName,
    timezone: settings.timezone,
  })

  return (
    <>
      <PageHeading title="通用" desc="站点展示信息与本地化设置。" />

      <div className="max-w-[520px] space-y-4">
        <SettingsSection
          title="站点"
          desc="显示在公网状态页与浏览器标题上的信息。"
        >
          <div className="space-y-3">
            <SettingsField label="站点名称" htmlFor="site-name">
              <Input
                id="site-name"
                value={draft.siteName}
                onChange={(event) => patch({ siteName: event.target.value })}
                placeholder="例如：pjx 监控"
                className="h-8 text-xs"
              />
            </SettingsField>

            <SettingsField
              label="时区"
              hint="存储始终使用 UTC，展示时按此设置转换。"
            >
              <Select
                value={draft.timezone}
                onValueChange={(value) => patch({ timezone: value })}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Shanghai" className="text-xs">
                    Asia/Shanghai (UTC+8)
                  </SelectItem>
                  <SelectItem value="Asia/Tokyo" className="text-xs">
                    Asia/Tokyo (UTC+9)
                  </SelectItem>
                  <SelectItem value="UTC" className="text-xs">
                    UTC
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsField>
          </div>

          <SettingsFooter
            dirty={dirty}
            onSave={() => save({ siteName: draft.siteName, timezone: draft.timezone })}
            onReset={reset}
          />
        </SettingsSection>

        {/*
          这两项是**本机 UI 偏好**（写 localStorage，只影响这台设备），
          和上面要保存到 master 的站点配置不是一回事 —— 原来它们混在一起，
          共用一个「保存」按钮，用户没法知道哪个改完就生效了。
          现在拆成独立区块，并在说明里写明"立即生效"。
        */}
        <SettingsSection
          title="外观"
          desc="仅影响本机浏览器，改完立即生效，不需要保存。"
        >
          <div className="space-y-3">
            <SettingsField label="主题">
              <Segmented
                ariaLabel="主题"
                value={dark}
                onChange={setDark}
                options={[
                  { value: false, label: "浅色" },
                  { value: true, label: "深色" },
                ]}
              />
            </SettingsField>

            <div className="flex items-start justify-between gap-4 rounded-md border bg-card p-3">
              <div className="min-w-0">
                <div className="text-xs font-medium">色觉友好模式</div>
                <p className="mt-0.5 text-2xs text-subtle">
                  状态指示从"只有颜色"变成"颜色 + 形状"：在线圆、告警三角、严重方块、离线短横。
                </p>
              </div>
              <Switch
                checked={colorBlindMode}
                onCheckedChange={setColorBlindMode}
                aria-label="色觉友好模式"
              />
            </div>
          </div>
        </SettingsSection>
      </div>
    </>
  )
}
