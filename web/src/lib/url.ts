import { useCallback, useEffect, useState } from "react"

export type ParamPatch = Record<string, string | null>

/**
 * 公网状态页没有路由（刻意不引 react-router），但又需要可分享、可回退的
 * 筛选状态，所以直接用 History API + popstate。
 *
 * 后台在 react-router 里，用 useSearchParams；两套不要混用，
 * 在路由内部直接写 history 会让 router 的内部状态失同步。
 */
export function useUrlParams() {
  const [params, setParamsState] = useState(
    () => new URLSearchParams(window.location.search),
  )

  useEffect(() => {
    const onPopState = () =>
      setParamsState(new URLSearchParams(window.location.search))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const setParams = useCallback(
    (patch: ParamPatch, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      const search = next.toString()
      const url = `${window.location.pathname}${search ? `?${search}` : ""}`
      // pushState 不触发任何事件，所以本地 state 要自己同步
      if (options?.replace) window.history.replaceState(null, "", url)
      else window.history.pushState(null, "", url)
      setParamsState(next)
    },
    [],
  )

  return [params, setParams] as const
}

/**
 * 从 URLSearchParams 里取一个受白名单约束的值。
 * 手改 URL 传垃圾值时要退回默认值，而不是把界面带崩。
 */
export function pickParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(key)
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}
