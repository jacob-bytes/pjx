/**
 * 后台的可配置项。
 *
 * 这里**只有配置**，没有监控数据 —— 监控数据在 `lib/mock.ts`（fleet）。
 * 之前令牌和默认值散在各个页面里，而"保存"按钮只弹一个 toast：
 * 页面看着能配，实际什么都没存下来。现在所有配置集中在这一处，
 * 由 `components/settings-shell.tsx` 的 provider 持久化到 localStorage，
 * 接 master 时把这一个文件换成 REST 调用即可。
 */

export interface TelegramSettings {
  enabled: boolean
  botToken: string
  chatId: string
  topicId: string
}

export interface RetentionSettings {
  memoryKeep: string
  rawEnabled: boolean
  rawKeep: string
  m1Keep: string
  h1Keep: string
}

export interface AgentToken {
  id: string
  name: string
  created: string
  lastUsed: string
  token: string
}

export interface Settings {
  siteName: string
  timezone: string
  telegram: TelegramSettings
  retention: RetentionSettings
  tokens: AgentToken[]
}

export const SETTINGS_KEY = "pjx-settings"

export const DEFAULT_SETTINGS: Settings = {
  siteName: "pjx 监控",
  timezone: "Asia/Shanghai",
  telegram: {
    enabled: true,
    botToken: "1234567890:AAH3kL9xQm2fTz8bWc4Vd6Ye1Rs7Ug",
    chatId: "-1002345678901",
    topicId: "",
  },
  retention: {
    memoryKeep: "1h",
    rawEnabled: false,
    rawKeep: "24h",
    m1Keep: "14d",
    h1Keep: "365d",
  },
  tokens: [
    {
      id: "t-01",
      name: "默认令牌",
      created: "2025-08-12",
      lastUsed: "刚刚",
      token: "7f3a1c9e4b2d8a60c15e73f9b04d2a81",
    },
    {
      id: "t-02",
      name: "扩容预留",
      created: "2025-09-01",
      lastUsed: "从未使用",
      token: "b2e05d18f7c94a36e0d2518c73f9b04d",
    },
  ],
}

/**
 * 生成一枚 32 位十六进制令牌。
 * 用 `crypto.getRandomValues` 而不是 `Math.random()` —— 后者在测试里被换成定种子 LCG
 * （见 tests/visual/fixtures/deterministic.ts），拿它生成凭据是错的。
 */
export function createToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Telegram Bot API 的 token 形如 `123456789:AA…`（冒号后 35 位左右） */
export const TELEGRAM_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/

/**
 * 深比较。用于判断草稿是否偏离已保存值。
 * 只覆盖配置这种「普通对象 / 数组 / 原始值」的形状，不做循环引用保护。
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}
