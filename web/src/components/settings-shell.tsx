import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { Check, WarningCircle } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { usePersistentState } from "@/lib/persist"
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  deepEqual,
  type Settings,
} from "@/lib/settings"
import { cn } from "@/lib/utils"

/**
 * 设置页的外壳：一份共享的配置 + 统一的区块与本页表单的草稿语义。
 *
 * 改这一块的原因是四件具体的事（见 docs/polish-round4.md §AR）：
 *  1. 四个子页原来是三种外壳（card / 裸 div / 裸表格）
 *  2. 「保存」按钮点了只弹 toast —— 页面上有 12 个控件是 `defaultValue`，
 *     根本没有 state，改了等于没改
 *  3. 同一个页面里「改即生效」（主题、色觉）和「要按保存」（站点名称）混在一起，
 *     用户分不出哪个是哪个
 *  4. 没有未保存标记 —— 改完切走就静默丢了
 */

/* ------------------------------------------------------------------ 配置 store */

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

/* ------------------------------------------------------------------ 草稿 */

/**
 * 本页表单的草稿。`dirty` 为真表示草稿偏离了已保存值。
 * 保存后父级的 settings 会变成草稿的同一份内容，`dirty` 自动回到假 —— 不需要手动复位。
 */
export function useDraft<T extends object>(saved: T) {
  const [draft, setDraft] = useState<T>(saved)
  const dirty = !deepEqual(draft, saved)

  const patch = useCallback((next: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...next }))
  }, [])

  const reset = useCallback(() => setDraft(saved), [saved])

  return { draft, patch, reset, dirty }
}

/* ------------------------------------------------------------------ 区块外壳 */

/** 统一的设置区块：card + 标题 + 说明，四个子页共用 */
export function SettingsSection({
  title,
  desc,
  action,
  danger,
  className,
  children,
}: {
  title: string
  desc?: string
  /** 右上角的操作（例如「新建令牌」） */
  action?: ReactNode
  /** 危险区块：标题带警示色 */
  danger?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <section className={cn("card p-3.5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              danger && "text-crit-text",
            )}
          >
            {danger && <WarningCircle className="size-3.5" />}
            {title}
          </h3>
          {desc && <p className="mt-0.5 text-2xs text-subtle">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** 统一的字段：标签 + 控件 + 说明，行距一致 */
export function SettingsField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <div className="text-2xs text-subtle">{hint}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ 保存条 */

/**
 * 保存条。三个状态各有明确反馈：
 *   未保存 → 文字警示 + 保存按钮可用 + 离开页面前 beforeunload 拦一下
 *   保存中/已保存 → 按钮禁用，旁边出现持久的时间戳（不是只弹一个 toast）
 *   从未改动 → 按钮禁用
 *
 * 用 aria-live 让读屏也能听到"已保存" —— 纯视觉的按钮变灰对读屏是沉默的。
 */
export function SettingsFooter({
  dirty,
  onSave,
  onReset,
}: {
  dirty: boolean
  onSave: () => void
  onReset: () => void
}) {
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // 有未保存改动时拦一下刷新/关闭。注意：BrowserRouter 没有 useBlocker，
  // 站内跳转拦不住 —— 所以未保存状态必须在界面上写清楚，不能只靠这个。
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  return (
    <div
      data-testid="settings-footer"
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <Button
        size="sm"
        className="h-8 px-3 text-xs"
        disabled={!dirty}
        onClick={() => {
          onSave()
          setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }))
        }}
      >
        保存更改
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs"
        disabled={!dirty}
        onClick={onReset}
      >
        放弃改动
      </Button>

      <span
        data-testid="settings-save-status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-1.5 text-2xs",
          dirty ? "text-warn-text" : "text-subtle",
        )}
      >
        {dirty ? (
          <>
            <WarningCircle className="size-3.5" />
            有未保存的改动，刷新或离开会丢失
          </>
        ) : savedAt ? (
          <>
            <Check className="size-3.5 text-ok-text" />
            已保存 · {savedAt}
          </>
        ) : (
          "没有改动"
        )}
      </span>
    </div>
  )
}
