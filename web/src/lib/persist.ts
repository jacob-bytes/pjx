import { useCallback, useEffect, useState } from "react"

/**
 * localStorage 支撑的 useState，用于纯本地的 UI 偏好
 * （收藏、网格/列表视图这类）。不做跨端同步；读写失败都静默退回默认值，
 * 隐私模式和配额超限下不会把页面搞崩。
 *
 * key 约定与 lib/theme.ts 一致：`pjx-*`。
 */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      // 读失败（隐私模式 / 脏数据）就用默认值
    }
    return typeof initial === "function" ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 写失败不影响本次会话内的行为
    }
  }, [key, value])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) =>
      typeof next === "function" ? (next as (p: T) => T)(prev) : next,
    )
  }, [])

  return [value, set] as const
}
