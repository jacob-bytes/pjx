import { useSyncExternalStore } from "react"
import { clamp } from "@/lib/format"

/**
 * 演示用的内存数据源。
 *
 * 真实实现里这里会换成：
 *   - REST 拉一次快照（列表 + 历史）
 *   - SSE `/api/events` 每秒推一条 tick，写入 React 之外的环形缓冲
 * 组件仍然只通过 useFleetTick() 订阅，所以换成真实数据流时上层不用动。
 */

export type Status = "ok" | "warn" | "crit" | "off"

export interface Server {
  id: string
  name: string
  tags: string[]
  ip: string
  region: string
  os: string
  agent: string
  uptime: string
  cpu: number
  mem: number
  disk: number
  rx: number
  tx: number
  load: number
  status: Status
  offline?: boolean
  lastSeen: string
  heartbeat: Status[]
  cpuSeries: number[]
  memSeries: number[]
  diskSeries: number[]
  rxSeries: number[]
  txSeries: number[]
}

export interface Probe {
  id: string
  name: string
  kind: "HTTP" | "TCP" | "ICMP"
  target: string
  interval: string
  scope: string
  avg: number
  p95: number
  success: number
  status: Status
  lastCheck: string
}

export interface AlertEvent {
  id: string
  time: string
  level: "crit" | "warn" | "info"
  object: string
  rule: string
  state: "firing" | "resolved"
  duration: string
}

export interface AlertRule {
  id: string
  name: string
  condition: string
  hold: string
  level: "crit" | "warn" | "info"
  channel: string
  enabled: boolean
}

function series(
  length: number,
  base: number,
  amplitude: number,
  noise: number,
  min: number,
  max: number,
) {
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(i / (length / 6)) * amplitude
    out.push(clamp(base + wave + (Math.random() - 0.5) * noise, min, max))
  }
  return out
}

function heartbeat(base: Status, warnRatio = 0.06): Status[] {
  if (base === "off") return Array.from({ length: 60 }, () => "off" as Status)
  return Array.from({ length: 60 }, () => {
    if (base === "warn") return Math.random() < 0.75 ? ("warn" as Status) : ("ok" as Status)
    return Math.random() < warnRatio ? ("warn" as Status) : ("ok" as Status)
  })
}

function server(
  input: Omit<
    Server,
    "heartbeat" | "cpuSeries" | "memSeries" | "diskSeries" | "rxSeries" | "txSeries"
  >,
): Server {
  return {
    ...input,
    heartbeat: heartbeat(input.offline ? "off" : input.status, input.status === "warn" ? 0.75 : 0.05),
    cpuSeries: series(180, input.cpu, 7, 5, 1, 99),
    memSeries: series(180, input.mem, 4, 2.5, 2, 99),
    diskSeries: series(180, input.disk, 0.6, 0.25, 1, 99),
    rxSeries: series(180, input.rx, input.rx * 0.5, input.rx * 0.35, 0.01, 60),
    txSeries: series(180, input.tx, input.tx * 0.5, input.tx * 0.35, 0.01, 60),
  }
}

export const fleet: Server[] = [
  server({
    id: "hk-01",
    name: "hk-01",
    tags: ["香港", "生产"],
    ip: "203.0.113.21",
    region: "香港",
    os: "Debian 12",
    agent: "0.3.1",
    uptime: "86d 4h",
    cpu: 23.4,
    mem: 41.2,
    disk: 52,
    rx: 1.24,
    tx: 0.42,
    load: 0.8,
    status: "ok",
    lastSeen: "0.6s 前",
  }),
  server({
    id: "hk-02",
    name: "hk-02",
    tags: ["香港", "生产"],
    ip: "203.0.113.22",
    region: "香港",
    os: "Debian 12",
    agent: "0.3.1",
    uptime: "52d 11h",
    cpu: 34.8,
    mem: 58.1,
    disk: 87,
    rx: 2.1,
    tx: 0.96,
    load: 1.4,
    status: "warn",
    lastSeen: "0.7s 前",
  }),
  server({
    id: "tokyo-01",
    name: "tokyo-01",
    tags: ["东京", "生产"],
    ip: "198.51.100.11",
    region: "东京",
    os: "Ubuntu 24.04",
    agent: "0.3.1",
    uptime: "128d 2h",
    cpu: 18.2,
    mem: 36.4,
    disk: 44,
    rx: 0.86,
    tx: 0.31,
    load: 0.5,
    status: "ok",
    lastSeen: "0.5s 前",
  }),
  server({
    id: "tokyo-02",
    name: "tokyo-02",
    tags: ["东京", "备用"],
    ip: "198.51.100.12",
    region: "东京",
    os: "Ubuntu 24.04",
    agent: "0.3.0",
    uptime: "9d 6h",
    cpu: 8.6,
    mem: 21.8,
    disk: 31,
    rx: 0.12,
    tx: 0.05,
    load: 0.1,
    status: "ok",
    lastSeen: "0.6s 前",
  }),
  server({
    id: "singapore-01",
    name: "singapore-01",
    tags: ["新加坡", "生产"],
    ip: "192.0.2.31",
    region: "新加坡",
    os: "AlmaLinux 9",
    agent: "0.3.1",
    uptime: "74d 19h",
    cpu: 41.6,
    mem: 63.2,
    disk: 55,
    rx: 3.42,
    tx: 1.18,
    load: 2.1,
    status: "ok",
    lastSeen: "0.6s 前",
  }),
  server({
    id: "frankfurt-01",
    name: "frankfurt-01",
    tags: ["法兰克福", "生产"],
    ip: "192.0.2.77",
    region: "法兰克福",
    os: "Debian 12",
    agent: "0.3.1",
    uptime: "61d 3h",
    cpu: 27.9,
    mem: 49.5,
    disk: 61,
    rx: 1.66,
    tx: 0.74,
    load: 1.2,
    status: "ok",
    lastSeen: "0.7s 前",
  }),
  server({
    id: "lax-01",
    name: "lax-01",
    tags: ["洛杉矶", "生产"],
    ip: "198.51.100.88",
    region: "洛杉矶",
    os: "CentOS 9",
    agent: "0.2.9",
    uptime: "—",
    cpu: 0,
    mem: 0,
    disk: 0,
    rx: 0,
    tx: 0,
    load: 0,
    status: "off",
    offline: true,
    lastSeen: "38 分钟前",
  }),
  server({
    id: "hz-01",
    name: "aliyun-hz-01",
    tags: ["杭州", "生产"],
    ip: "203.0.113.90",
    region: "杭州",
    os: "Alibaba Cloud Linux 3",
    agent: "0.3.1",
    uptime: "203d 8h",
    cpu: 52.3,
    mem: 71.8,
    disk: 68,
    rx: 4.21,
    tx: 2.06,
    load: 3.4,
    status: "ok",
    lastSeen: "0.5s 前",
  }),
  server({
    id: "sh-01",
    name: "tencent-sh-01",
    tags: ["上海", "生产"],
    ip: "203.0.113.91",
    region: "上海",
    os: "OpenCloudOS 9",
    agent: "0.3.1",
    uptime: "44d 12h",
    cpu: 44.1,
    mem: 66.3,
    disk: 71,
    rx: 2.88,
    tx: 1.31,
    load: 2.7,
    status: "ok",
    lastSeen: "0.6s 前",
  }),
  server({
    id: "gz-01",
    name: "gz-01",
    tags: ["广州", "备用"],
    ip: "203.0.113.92",
    region: "广州",
    os: "Debian 12",
    agent: "0.3.0",
    uptime: "12d 1h",
    cpu: 7.8,
    mem: 18.6,
    disk: 27,
    rx: 0.09,
    tx: 0.04,
    load: 0.1,
    status: "ok",
    lastSeen: "0.6s 前",
  }),
  server({
    id: "sin-aws-01",
    name: "aws-sin-01",
    tags: ["新加坡", "生产"],
    ip: "192.0.2.140",
    region: "新加坡",
    os: "Amazon Linux 2023",
    agent: "0.3.1",
    uptime: "97d 22h",
    cpu: 31.4,
    mem: 52.7,
    disk: 59,
    rx: 1.92,
    tx: 0.88,
    load: 1.1,
    status: "ok",
    lastSeen: "0.5s 前",
  }),
  server({
    id: "nas-01",
    name: "backup-nas",
    tags: ["家里", "备用"],
    ip: "192.168.1.10",
    region: "本机",
    os: "Debian 12",
    agent: "0.3.1",
    uptime: "31d 7h",
    cpu: 3.2,
    mem: 12.4,
    disk: 92,
    rx: 0.31,
    tx: 0.62,
    load: 0.2,
    status: "warn",
    lastSeen: "0.6s 前",
  }),
]

export const probes: Probe[] = [
  {
    id: "p-01",
    name: "主站可用性",
    kind: "HTTP",
    target: "https://example.com",
    interval: "30s",
    scope: "全部 12 台",
    avg: 182,
    p95: 310,
    success: 99.98,
    status: "ok",
    lastCheck: "8s 前",
  },
  {
    id: "p-02",
    name: "API 健康检查",
    kind: "HTTP",
    target: "https://api.example.com/healthz",
    interval: "10s",
    scope: "生产 · 9 台",
    avg: 45,
    p95: 88,
    success: 99.91,
    status: "ok",
    lastCheck: "3s 前",
  },
  {
    id: "p-03",
    name: "MySQL 端口",
    kind: "TCP",
    target: "db.internal:3306",
    interval: "30s",
    scope: "生产 · 9 台",
    avg: 2.1,
    p95: 5.4,
    success: 100,
    status: "ok",
    lastCheck: "12s 前",
  },
  {
    id: "p-04",
    name: "对象存储静态资源",
    kind: "HTTP",
    target: "https://cdn.example.com/logo.png",
    interval: "60s",
    scope: "全部 12 台",
    avg: 96,
    p95: 180,
    success: 99.7,
    status: "warn",
    lastCheck: "21s 前",
  },
  {
    id: "p-05",
    name: "东京出口延迟",
    kind: "ICMP",
    target: "1.1.1.1",
    interval: "10s",
    scope: "东京 · 2 台",
    avg: 38,
    p95: 62,
    success: 99.99,
    status: "ok",
    lastCheck: "4s 前",
  },
  {
    id: "p-06",
    name: "内网备份服务",
    kind: "TCP",
    target: "10.0.0.8:9000",
    interval: "5m",
    scope: "备用 · 3 台",
    avg: 12.4,
    p95: 25.1,
    success: 98.2,
    status: "warn",
    lastCheck: "2 分钟前",
  },
]

export const alertEvents: AlertEvent[] = [
  {
    id: "e-01",
    time: "14:02:11",
    level: "crit",
    object: "lax-01",
    rule: "节点离线 > 1m",
    state: "firing",
    duration: "38m",
  },
  {
    id: "e-02",
    time: "13:47:30",
    level: "warn",
    object: "hk-02",
    rule: "磁盘使用率 > 85% 持续 10m",
    state: "firing",
    duration: "52m",
  },
  {
    id: "e-03",
    time: "11:20:05",
    level: "warn",
    object: "backup-nas",
    rule: "磁盘使用率 > 85% 持续 10m",
    state: "firing",
    duration: "3h 9m",
  },
  {
    id: "e-04",
    time: "09:12:44",
    level: "info",
    object: "对象存储静态资源",
    rule: "探测连续失败 3 次",
    state: "resolved",
    duration: "6m",
  },
  {
    id: "e-05",
    time: "昨天 22:41",
    level: "warn",
    object: "aliyun-hz-01",
    rule: "CPU > 90% 持续 5m",
    state: "resolved",
    duration: "11m",
  },
]

export const alertRules: AlertRule[] = [
  {
    id: "r-01",
    name: "节点离线",
    condition: "agent 心跳丢失 > 1 分钟",
    hold: "1m",
    level: "crit",
    channel: "Telegram",
    enabled: true,
  },
  {
    id: "r-02",
    name: "磁盘使用率过高",
    condition: "disk > 85%",
    hold: "10m",
    level: "warn",
    channel: "Telegram",
    enabled: true,
  },
  {
    id: "r-03",
    name: "CPU 持续高负载",
    condition: "cpu > 90%",
    hold: "5m",
    level: "warn",
    channel: "Telegram",
    enabled: true,
  },
  {
    id: "r-04",
    name: "内存接近耗尽",
    condition: "mem > 92%",
    hold: "5m",
    level: "crit",
    channel: "Telegram",
    enabled: true,
  },
  {
    id: "r-05",
    name: "探测连续失败",
    condition: "probe failed >= 3 次",
    hold: "—",
    level: "warn",
    channel: "Telegram",
    enabled: false,
  },
]

// agentTokens 已移到 lib/settings.ts：令牌是**配置**，不是监控数据，
// 而且它现在真的会被写入（新建/撤销），不能再放在只读的 mock 里。

let version = 0
const listeners = new Set<() => void>()
let timer: number | null = null
let lastTick = Date.now()

/**
 * 连接状态。真实实现里这三个值由 REST 快照 + SSE 驱动：
 *   loading  —— 首次快照还没回来，页面显示 Skeleton
 *   live     —— SSE 正常推流
 *   paused   —— 页面被切到后台，主动停表省电（回到前台补一次快照）
 * 接 SSE 时把 setConnection 换成 EventSource 的 onopen/onerror 即可。
 */
export type Connection = "live" | "paused"

const SNAPSHOT_DELAY = 350 // 占位：真实实现里是 REST 快照的往返时间
let connection: Connection = "live"
let loaded = false
let snapshotTimer: number | null = null

function emit() {
  version++
  for (const listener of listeners) listener()
}

function start() {
  if (timer === null) timer = window.setInterval(tick, 1000)
}

function stop() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function setConnection(next: Connection) {
  if (connection === next) return
  connection = next
  emit()
}

/** 页面隐藏时停表：既省电，也避免回到前台时补一堆过期动画 */
function onVisibilityChange() {
  if (document.hidden) {
    stop()
    setConnection("paused")
  } else {
    tick() // 回到前台先补一次快照，再恢复推流
    start()
    setConnection("live")
  }
}

export function getConnection() {
  return connection
}

export function isLoaded() {
  return loaded
}

function push(target: number[], value: number) {
  target.push(value)
  if (target.length > 180) target.shift()
}

function tick() {
  lastTick = Date.now()
  for (const item of fleet) {
    if (item.offline) {
      item.heartbeat = [...item.heartbeat.slice(1), "off"]
      continue
    }
    item.cpu = clamp(item.cpu + (Math.random() - 0.5) * 3, 2, 97)
    item.mem = clamp(item.mem + (Math.random() - 0.5) * 1.2, 5, 96)
    item.disk = clamp(item.disk + (Math.random() - 0.5) * 0.04, 5, 98)
    item.rx = clamp(item.rx + (Math.random() - 0.5) * 0.3, 0.02, 40)
    item.tx = clamp(item.tx + (Math.random() - 0.5) * 0.2, 0.01, 24)
    item.load = clamp(item.load + (Math.random() - 0.5) * 0.2, 0.01, 16)
    push(item.cpuSeries, item.cpu)
    push(item.memSeries, item.mem)
    push(item.diskSeries, item.disk)
    push(item.rxSeries, item.rx)
    push(item.txSeries, item.tx)

    const next: Status =
      item.disk > 85 || item.cpu > 90 || item.mem > 92 ? "warn" : "ok"
    item.heartbeat = [...item.heartbeat.slice(1), next]
    item.status = next
  }

  for (const probe of probes) {
    const drift = (Math.random() - 0.5) * probe.avg * 0.08
    probe.avg = clamp(probe.avg + drift, 0.4, 2500)
    probe.p95 = Math.max(probe.avg * 1.4, probe.p95 + drift * 0.6)
  }

  version++
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)

  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange)
    if (loaded) {
      if (!document.hidden) start()
    } else {
      // 首次订阅：模拟拉一次 REST 快照，页面在这段时间显示 Skeleton
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null
        loaded = true
        lastTick = Date.now()
        if (!document.hidden) {
          start()
          setConnection("live")
        } else {
          setConnection("paused")
        }
        emit()
      }, SNAPSHOT_DELAY)
    }
  }

  return () => {
    listeners.delete(listener)
    // 最后一个订阅者离开时停表并复位，否则定时器永远空转、也无法重启。
    if (listeners.size === 0) {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (snapshotTimer !== null) {
        window.clearTimeout(snapshotTimer)
        snapshotTimer = null
      }
    }
  }
}

export function getVersion() {
  return version
}

export function lastTickAt() {
  return new Date(lastTick)
}

export function useFleetTick() {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/**
 * 只订阅连接状态与首次加载标志的小 hook。
 * 给顶栏、Skeleton 这类"不需要每秒数据、但要知道现在是不是在推流"的地方用，
 * 避免它们跟着 1Hz 的 version 一起重渲染。
 */
export function useFleetStatus() {
  const connection = useSyncExternalStore(
    subscribe,
    getConnection,
    getConnection,
  )
  const loaded = useSyncExternalStore(subscribe, isLoaded, isLoaded)
  return { connection, loaded }
}
