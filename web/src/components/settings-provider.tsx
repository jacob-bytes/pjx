import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import { usePersistentState } from "@/lib/persist"
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type CreatedProbe,
  type NodeConfig,
  type Settings,
} from "@/lib/settings"

/**
 * 后台配置的单一来源。
 *
 * 放在 AppShell 这一层（而不是 SettingsLayout）—— 因为节点标签、探测启停、
 * 告警规则启停这些**同样属于配置**的写操作散在总览 / 探测 / 告警页面上，
 * 它们也要读写同一份 store。
 *
 * 写操作分两类，语义不同、不要混：
 *   1. **页面级表单**（设置页）：草稿 + 「保存更改」+ 未保存警示（见 useDraft）
 *   2. **行内开关**（维护模式、探测启停、规则启停）：**改完立即生效**并给 toast
 *      —— 一个 Switch 如果还要再点"保存"才生效，就是在骗人
 */

interface SettingsContextValue {
  settings: Settings
  save: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersistentState<Settings>(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  )

  const save = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [setSettings],
  )

  const value = useMemo(() => ({ settings, save }), [settings, save])
  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) {
    throw new Error("useSettings 必须在 SettingsProvider 内使用")
  }
  return value
}

/* ------------------------------------------------------------------ 领域读取 */

/*
  表格行是在 `.map()` 里渲染的，不能逐行调 hook —— 所以配置读取也提供纯函数版本，
  页面用一次 `useSettings()` 拿到 settings，再按 id 取值。
  少了这一层就会出现"对话框写进去了、表格还显示 mock 的旧值"。
*/
export function nodeTags(settings: Settings, id: string, fallback: string[]) {
  return settings.nodes[id]?.tags ?? fallback
}

export function nodeMaintenance(settings: Settings, id: string) {
  return settings.nodes[id]?.maintenance ?? false
}

/* ------------------------------------------------------------------ 领域 hook */

/** 节点配置差量。未改过的字段回落到调用处给的默认值。 */
export function useNodeConfig(
  id: string,
  fallback: { tags: string[]; maintenance?: boolean },
) {
  const { settings, save } = useSettings()
  const stored = settings.nodes[id]

  const setTags = useCallback(
    (tags: string[]) => {
      // 与默认值一致时删掉这条差量，免得 store 里积一堆"改了但等于没改"的记录
      const same =
        tags.length === fallback.tags.length &&
        tags.every((tag, index) => tag === fallback.tags[index])
      save({
        nodes: {
          ...settings.nodes,
          [id]: { ...stored, tags: same ? undefined : tags },
        },
      })
    },
    [fallback.tags, id, save, settings.nodes, stored],
  )

  const setMaintenance = useCallback(
    (maintenance: boolean) => {
      save({
        nodes: {
          ...settings.nodes,
          [id]: { ...stored, maintenance: maintenance || undefined },
        },
      })
    },
    [id, save, settings.nodes, stored],
  )

  const config: NodeConfig = stored ?? {}
  return {
    tags: config.tags ?? fallback.tags,
    maintenance: config.maintenance ?? fallback.maintenance ?? false,
    setTags,
    setMaintenance,
  }
}

/** 探测任务：默认启用，只记被停用过的 */
export function useProbeConfig(id: string, fallbackEnabled = true) {
  const { settings, save } = useSettings()
  const enabled = settings.probeEnabled[id] ?? fallbackEnabled

  const setEnabled = useCallback(
    (next: boolean) => {
      save({ probeEnabled: { ...settings.probeEnabled, [id]: next } })
    },
    [id, save, settings.probeEnabled],
  )

  return { enabled, setEnabled }
}

/** 探测任务的增删（mock 里的任务被删、以及用户新建的任务） */
export function useProbeList() {
  const { settings, save } = useSettings()
  return {
    removed: settings.probesRemoved,
    created: settings.probesCreated,
    remove: (id: string) =>
      save({ probesRemoved: [...settings.probesRemoved, id] }),
    create: (probe: CreatedProbe) =>
      save({ probesCreated: [...settings.probesCreated, probe] }),
    removeCreated: (id: string) =>
      save({ probesCreated: settings.probesCreated.filter((p) => p.id !== id) }),
  }
}

/** 告警规则启停：默认走 mock 给的值 */
export function useRuleEnabled(id: string, fallback: boolean) {
  const { settings, save } = useSettings()
  return {
    enabled: settings.ruleEnabled[id] ?? fallback,
    setEnabled: (next: boolean) =>
      save({ ruleEnabled: { ...settings.ruleEnabled, [id]: next } }),
  }
}
