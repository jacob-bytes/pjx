import { toast } from "sonner"
import { useNodeConfig } from "@/components/settings-provider"
import { Switch } from "@/components/ui/switch"
import type { Server } from "@/lib/mock"

/**
 * 维护模式开关（静音该节点的告警）。
 *
 * 抽成组件是因为它有两处入口：节点面板的「配置」区，以及总览表格的「维护」列。
 * 两处各写一份的话，语义（行内开关 = 改完立即生效）迟早会漂移。
 */
export function MaintenanceSwitch({
  server,
  className,
}: {
  server: Server
  className?: string
}) {
  const { maintenance, setMaintenance } = useNodeConfig(server.id, {
    tags: server.tags,
  })

  return (
    <Switch
      checked={maintenance}
      onCheckedChange={(checked) => {
        setMaintenance(checked)
        toast(
          checked
            ? `「${server.name}」进入维护模式，告警已静音`
            : `「${server.name}」退出维护模式`,
        )
      }}
      aria-label={`维护模式 ${server.name}`}
      className={className}
    />
  )
}
