import { useEffect, useState } from "react"
import { Plus, X } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useNodeConfig } from "@/components/settings-provider"
import { useDraft } from "@/components/settings-shell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fleet } from "@/lib/mock"
import { cn } from "@/lib/utils"

const MAX_TAGS = 6
const MAX_LEN = 16

/**
 * 节点标签编辑。
 *
 * 这是「编辑标签」菜单项的落点 —— 它在总览的 ⋯ 菜单与服务器详情 Sheet 的 ⋯ 菜单里
 * 各有一个入口，但此前**两处都没有处理函数**，点了什么都不发生。
 *
 * 一起放在总览与 Sheet 之外，是因为两个入口要打开同一个东西；
 * 标签属于配置，写进 settings store（`nodes[id].tags`）。
 */
export function NodeTagsDialog({
  serverId,
  serverName,
  defaultTags,
  open,
  onOpenChange,
}: {
  serverId: string
  serverName: string
  defaultTags: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { tags, setTags } = useNodeConfig(serverId, { tags: defaultTags })
  // 草稿：关掉对话框时未保存的改动丢掉（对话框的常规语义）
  const { draft, set: setDraft, reset, dirty: changed } = useDraft<string[]>(tags)
  const [input, setInput] = useState("")

  // 打开时从已保存值重新开始，避免上次关掉时留下的草稿粘过来
  useEffect(() => {
    if (!open) return
    reset()
    setInput("")
  }, [open, reset])

  // 机队里已用过的标签，作为可点选的建议 —— 手打最容易打错的是大小写与空格
  const suggestions = [
    ...new Set(fleet.flatMap((item) => item.tags)),
  ].filter((tag) => !draft.includes(tag))

  const trimmed = input.trim().slice(0, MAX_LEN)
  const canAdd = trimmed.length > 0 && !draft.includes(trimmed) && draft.length < MAX_TAGS

  const add = (tag: string) => {
    const next = tag.trim().slice(0, MAX_LEN)
    if (!next || draft.includes(next) || draft.length >= MAX_TAGS) return
    setDraft([...draft, next])
    setInput("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            编辑标签 · {serverName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            标签用于分组筛选与探测范围。最多 {MAX_TAGS} 个、每个 {MAX_LEN} 字符以内。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">当前标签</Label>
            {draft.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-2xs text-subtle">
                还没有标签
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {draft.map((tag) => (
                  <li key={tag}>
                    <span className="flex items-center gap-1 rounded-full border border-brand/25 bg-brand/8 py-[3px] pl-2 pr-1 text-2xs leading-none text-brand">
                      {tag}
                      <button
                        type="button"
                        aria-label={`移除标签 ${tag}`}
                        onClick={() =>
                          setDraft(draft.filter((item) => item !== tag))
                        }
                        className="grid size-4 place-items-center rounded-full text-brand/70 transition-colors dur-2 hover:bg-brand/15 hover:text-brand"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-tag" className="text-xs">
              添加标签
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-tag"
                value={input}
                maxLength={MAX_LEN}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (canAdd) add(input)
                  }
                }}
                placeholder="例如：生产"
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1 px-3 text-xs"
                disabled={!canAdd}
                onClick={() => add(input)}
              >
                <Plus className="size-3.5" />
                添加
              </Button>
            </div>
            {draft.length >= MAX_TAGS && (
              <p className="text-2xs text-warn-text">
                已达 {MAX_TAGS} 个上限，先移除一个再加
              </p>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">机队里用过的</Label>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={draft.length >= MAX_TAGS}
                    onClick={() => add(tag)}
                    className={cn(
                      "rounded-full border px-2 py-[3px] text-2xs leading-none transition-colors dur-2",
                      "text-muted-foreground hover:border-border-strong hover:text-foreground",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!changed}
            onClick={() => {
              setTags(draft)
              onOpenChange(false)
              toast(`已更新「${serverName}」的标签`)
            }}
          >
            保存标签
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
