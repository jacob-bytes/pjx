import { useState } from "react"
import { Copy } from "@phosphor-icons/react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { agentTokens } from "@/lib/mock"

const INSTALL_COMMAND = `curl -fsSL https://probe.example.com/install.sh | bash -s -- \\
  --master wss://probe.example.com/api/v1/agent/ws \\
  --token 7f3a1c9e4b2d8a60c15e73f9b04d2a81`

export function AccessPage() {
  const [revoking, setRevoking] = useState<(typeof agentTokens)[number] | null>(
    null,
  )

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(message)
    } catch {
      toast("复制失败，请手动选择")
    }
  }

  return (
    <>
      <PageHeading
        title="接入与令牌"
        desc="每个节点使用独立令牌接入；令牌泄漏时单独撤销即可，不必动其他机器。"
      />

      <section className="card p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium">安装命令</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-2xs"
            onClick={() => copy(INSTALL_COMMAND, "已复制安装命令")}
          >
            <Copy className="size-3" />
            复制
          </Button>
        </div>
        <pre className="num overflow-x-auto rounded-md border bg-muted/40 p-3 text-2xs leading-relaxed text-muted-foreground">
          {INSTALL_COMMAND}
        </pre>
        <p className="mt-2 text-2xs text-subtle">
          支持 Linux amd64 / arm64，单文件静态二进制；Windows 需要 WSL 或改用 TCP
          探测节点。
        </p>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium">令牌</h3>
          <Button size="sm" className="h-7 px-2 text-2xs">
            新建令牌
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-3 text-xs font-medium">名称</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">令牌</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">创建时间</TableHead>
                <TableHead className="h-8 px-3 text-xs font-medium">最后使用</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs font-medium">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentTokens.map((token) => (
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
                  <TableCell className="h-9 px-3 text-xs">
                    <Badge
                      variant="outline"
                      className="h-5 rounded-[4px] px-1.5 text-2xs font-normal text-muted-foreground"
                    >
                      {token.lastUsed}
                    </Badge>
                  </TableCell>
                  <TableCell className="h-9 px-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-2xs text-destructive"
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
      </section>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={`撤销令牌「${revoking?.name ?? ""}」？`}
        desc="使用该令牌的 agent 会立即断开，重连会被拒绝；需要重新签发令牌才能接回。"
        confirmLabel="撤销令牌"
        onConfirm={() => {
          setRevoking(null)
          toast("已撤销令牌（演示）")
        }}
      />
    </>
  )
}
