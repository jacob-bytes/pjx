import { useEffect, useState } from "react"

const EVENT = "pjx:theme"
const KEY = "pjx-theme"

export function applyStoredTheme() {
  if (localStorage.getItem(KEY) === "dark") {
    document.documentElement.classList.add("dark")
  }
}

export function useTheme() {
  const [dark, setDarkState] = useState(() =>
    document.documentElement.classList.contains("dark"),
  )

  useEffect(() => {
    const onChange = () =>
      setDarkState(document.documentElement.classList.contains("dark"))
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  const setDark = (value: boolean) => {
    document.documentElement.classList.toggle("dark", value)
    localStorage.setItem(KEY, value ? "dark" : "light")
    window.dispatchEvent(new Event(EVENT))
  }

  return { dark, setDark }
}
