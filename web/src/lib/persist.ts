import { useCallback, useEffect, useState } from "react"

/**
 * localStorage 支撑的 useState，用于纯本地的 UI 偏好
 * （收藏、网格/列表视图、后台配置这类）。不做跨端同步；读写失败都静默退回默认值，
 * 隐私模式和配额超限下不会把页面搞崩。
 *
 * key 约定与 lib/theme.ts 一致：`pjx-*`。
 *
 * `normalize` 是**给对象形状的配置准备的**：直接返回解析结果的话，
 * 浏览器里存着旧版本的对象就会缺掉后来新增的字段，读到 undefined 就崩
 * （见 lib/settings.ts 的 normalizeSettings 与 §AU 那次白屏）。
 * 传了 normalize 就一定会拿到一个完整对象；不传则保持原来的行为。
 * 归一化后的值会在挂载时被写回，所以旧数据是自愈的。
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  normalize?: (raw: unknown) => T,
) {
  const [value, setValue] = useState<T>(() => {
    const fallback =
      typeof initial === "function" ? (initial as () => T)() : initial
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      const parsed: unknown = JSON.parse(raw)
      return normalize ? normalize(parsed) : (parsed as T)
    } catch {
      // 读失败（隐私模式 / 脏数据）就用默认值
      return fallback
    }
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
