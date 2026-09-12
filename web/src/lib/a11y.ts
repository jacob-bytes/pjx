import { useCallback, useEffect, useState } from "react"

/**
 * C4 色觉友好模式（对齐 ink README 的「色觉友好模式保留全彩」）。
 *
 * 打开后状态指示从"只有颜色"变成"颜色 + 形状"双通道：
 * 在线=圆、告警=三角、严重=方块、离线=短横。
 * 图表那边已经有颜色 + 线型双通道，不需要额外处理。
 */
const EVENT = "pjx:cvd"
const KEY = "pjx-cvd"

export function applyStoredColorBlindMode() {
  if (localStorage.getItem(KEY) === "on") {
    document.documentElement.dataset.cvd = "on"
  }
}

export function useColorBlindMode() {
  const [enabled, setEnabled] = useState(
    () => document.documentElement.dataset.cvd === "on",
  )

  useEffect(() => {
    const onChange = () =>
      setEnabled(document.documentElement.dataset.cvd === "on")
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  const setColorBlindMode = useCallback((value: boolean) => {
    if (value) document.documentElement.dataset.cvd = "on"
    else delete document.documentElement.dataset.cvd
    localStorage.setItem(KEY, value ? "on" : "off")
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { colorBlindMode: enabled, setColorBlindMode }
}
