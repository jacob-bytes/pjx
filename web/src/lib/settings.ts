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

/**
 * 节点级配置。`undefined` 的字段 = 用 mock（将来是 master）给的默认值 ——
 * 这一层只存"被改过的部分"，接真实接口时提交的就是这些差量。
 */
export interface NodeConfig {
  /** 覆盖默认标签；`undefined` 表示没改过 */
  tags?: string[]
  /** 维护模式：该节点的告警静音（但指标照常采集） */
  maintenance?: boolean
}

/**
 * 用户新建的探测任务。
 *
 * 只有配置，**没有运行时数据** —— mock（将来是 master）才是 avg/p95/成功率/最近检查
 * 的来源。新建的任务在收到第一次上报之前，那几个格子显示「—」，
 * 而不是编一个 0.0 / 100% 出来。
 */
export interface CreatedProbe {
  id: string
  name: string
  kind: "HTTP" | "TCP" | "ICMP"
  target: string
  interval: string
  timeoutSec: string
  scope: string
  failThreshold: string
  notifications: string
}

export interface Settings {
  siteName: string
  timezone: string
  telegram: TelegramSettings
  retention: RetentionSettings
  tokens: AgentToken[]
  /** 按 server.id 索引的节点配置差量 */
  nodes: Record<string, NodeConfig>
  /**
   * 探测任务的启停、删除与新建。
   * mock 是只读数据源，写操作在这里以"叠加"的方式表达：
   * 接 master 后换成 POST/PATCH/DELETE /probes/:id。
   */
  probeEnabled: Record<string, boolean>
  probesRemoved: string[]
  probesCreated: CreatedProbe[]
  /** 告警规则的启停（只记被改过的，没改过的走 mock 默认值） */
  ruleEnabled: Record<string, boolean>
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
  nodes: {},
  probeEnabled: {},
  probesCreated: [],
  probesRemoved: [],
  ruleEnabled: {},
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
 * 阈值。表格里那个「最紧指标」列与告警规则的默认条件共用这一份 ——
 * 之前服务器详情 Sheet 里的阈值参考线是**硬编码** 90/92/85，
 * 而告警规则里同样写着 cpu > 90 / mem > 92 / disk > 85，两处各写一份。
 */
export const METRIC_LIMITS = [
  { key: "cpu", label: "CPU", limit: 90 },
  { key: "mem", label: "内存", limit: 92 },
  { key: "disk", label: "磁盘", limit: 85 },
] as const


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
