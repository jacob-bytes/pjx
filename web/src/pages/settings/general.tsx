import { toast } from "sonner"
import { Segmented } from "@/components/segmented"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

  return (
    <>
      <PageHeading title="通用" desc="站点展示信息与本地化设置。" />

      <div className="max-w-[420px] space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">站点名称</Label>
          <Input defaultValue="pjx 监控" className="h-8 text-xs" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">时区</Label>
          <Select defaultValue="Asia/Shanghai">
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
          <p className="text-2xs text-subtle">
            存储始终使用 UTC，展示时按此设置转换。
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">主题</Label>
          <Segmented
            ariaLabel="主题"
            value={dark}
            onChange={setDark}
            options={[
              { value: false, label: "浅色" },
              { value: true, label: "深色" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">语言</Label>
          <Select defaultValue="zh-CN">
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN" className="text-xs">
                简体中文
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

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

        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => toast("已保存通用设置")}
        >
          保存
        </Button>
      </div>
    </>
  )
}
