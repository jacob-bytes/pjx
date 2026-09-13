import { useState } from "react"
import { CheckCircle, Copy, Plus } from "@phosphor-icons/react"
import { toast } from "sonner"
import { PageHeading } from "@/components/page-heading"
import { SettingsSection } from "@/components/settings-shell"
import { useSettings } from "@/components/settings-provider"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createToken, today, type AgentToken } from "@/lib/settings"

const INSTALL_COMMAND = `curl -fsSL https://probe.example.com/install.sh | bash -s -- \\
  --master wss://probe.example.com/api/v1/agent/ws \\
  --token 7f3a1c9e4b2d8a60c15e73f9b04d2a81`

export function AccessPage() {
  const { settings, save } = useSettings()
  const [revoking, setRevoking] = useState<AgentToken | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  /** 刚创建的令牌：只在这里完整展示一次 */
  const [issued, setIssued] = useState<AgentToken | null>(null)

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(message)
    } catch {
      toast("复制失败，请手动选择")
    }
  }

  const closeCreate = () => {
    setCreating(false)
    setName("")
    setIssued(null)
  }

  const trimmed = name.trim()
  const canCreate = trimmed.length > 0 && trimmed.length <= 32

  return (
    <>
      <PageHeading
        title="接入与令牌"
        desc="每个节点使用独立令牌接入；令牌泄漏时单独撤销即可，不必动其他机器。"
      />

      <div className="max-w-[720px] space-y-4">
        <SettingsSection
          title="安装命令"
          desc="支持 Linux amd64 / arm64，单文件静态二进制；Windows 需要 WSL 或改用 TCP 探测节点。"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-2xs touch:h-11"
              onClick={() => copy(INSTALL_COMMAND, "已复制安装命令")}
            >
              <Copy className="size-3" />
              复制
            </Button>
          }
        >
          <pre className="num text-2xs overflow-x-auto rounded-md border bg-canvas p-3 leading-relaxed text-muted-foreground">
            {INSTALL_COMMAND}
          </pre>
        </SettingsSection>

        <SettingsSection
          title="令牌"
          desc="每个令牌对应一台（或一批）agent；令牌只在创建时完整显示一次。"
          action={
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2 text-2xs touch:h-11"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3" />
              新建令牌
            </Button>
          }
        >
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[404px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-3 text-xs font-medium">名称</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">令牌</TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">
                    创建时间
                  </TableHead>
                  <TableHead className="h-8 px-3 text-xs font-medium">
                    最后使用
                  </TableHead>
                  <TableHead className="h-8 px-3 text-right text-xs font-medium">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="h-9 px-3 text-xs font-medium">
                      {token.name}
                    </TableCell>
                    <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
                      {token.token.slice(0, 6)}…{token.token.slice(-4)}
                    </TableCell>
                    <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
                      {token.created}
                    </TableCell>
                    {/* 时间戳就是时间戳，原来套了个 Badge —— Badge 是状态标签的形态 */}
                    <TableCell className="num h-9 px-3 text-xs text-muted-foreground">
                      {token.lastUsed}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-2xs text-destructive touch:h-11 touch:min-w-11"
                        onClick={() => setRevoking(token)}
                      >
                        撤销
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SettingsSection>
      </div>

      {/* ---------------------------------------------------------- 新建令牌 */}
      <Sheet open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-sm font-semibold">
              {issued ? "令牌已创建" : "新建令牌"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {issued
                ? "这是唯一一次完整展示，关闭后只能看到前后几位。"
                : "给令牌起个能认出来的名字（例如机器名或用途）。"}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {issued ? (
              <>
                <div className="flex items-center gap-1.5 text-2xs text-ok-text">
                  <CheckCircle className="size-3.5" />
                  已加入令牌列表
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">令牌</Label>
                  <pre className="num text-2xs overflow-x-auto rounded-md border bg-canvas p-3 leading-relaxed">
                    {issued.token}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-2xs touch:h-11"
                    onClick={() => copy(issued.token, "已复制令牌")}
                  >
                    <Copy className="size-3" />
                    复制令牌
                  </Button>
                </div>
                <p className="rounded-md border border-dashed p-3 text-2xs leading-relaxed text-muted-foreground">
                  把它填进 agent 的安装命令：<span className="num">--token {issued.token.slice(0, 6)}…</span>
                  。令牌泄漏时在列表里撤销即可，不影响其他节点。
                </p>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="token-name" className="text-xs">
                  名称
                </Label>
                <Input
                  id="token-name"
                  value={name}
                  maxLength={32}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：dmit-hk-01 生产"
                  className="h-8 text-xs touch:h-11"
                />
                <p className="text-2xs text-subtle">
                  令牌由 16 字节随机数生成，只保存在本机配置里。
                </p>
              </div>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
            {issued ? (
              <Button
                size="sm"
                className="h-8 px-3 text-xs touch:h-11"
                onClick={closeCreate}
              >
                完成
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs touch:h-11"
                  onClick={closeCreate}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs touch:h-11"
                  disabled={!canCreate}
                  onClick={() => {
                    const next: AgentToken = {
                      id: `t-${Date.now().toString(36)}`,
                      name: trimmed,
                      created: today(),
                      lastUsed: "从未使用",
                      token: createToken(),
                    }
                    save({ tokens: [...settings.tokens, next] })
                    setIssued(next)
                  }}
                >
                  生成令牌
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={`撤销令牌「${revoking?.name ?? ""}」？`}
        desc="使用该令牌的 agent 会立即断开，重连会被拒绝；需要重新签发令牌才能接回。"
        confirmLabel="撤销令牌"
        onConfirm={() => {
          if (revoking) {
            save({
              tokens: settings.tokens.filter((item) => item.id !== revoking.id),
            })
          }
          setRevoking(null)
          toast("已撤销令牌")
        }}
      />
    </>
  )
}
