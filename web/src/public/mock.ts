import { useSyncExternalStore } from "react"
import { clamp } from "@/lib/format"

export type Status = "ok" | "warn" | "crit" | "off"

export interface IspLatency {
  id: string
  label: string
  value: number
}

/** 详情页的三网 ping 目标（比卡片上的三大运营商更细） */
export interface PingTarget {
  id: string
  label: string
  value: number
  /** 该线路自己的丢包率，不是节点级的 */
  loss: number
  history: number[]
  /** 丢包历史序列。之前只有标量 loss，画不出趋势 */
  lossHistory: number[]
}

export type UptimeState = "ok" | "partial" | "off" | "none"

export interface UptimeDay {
  date: string
  state: UptimeState
  /** 当日正常率 0-100 */
  ratio: number
}

/** 详情页的时间范围档位 */
/**
 * 延迟探测周期（秒）。
 *
 * **探测不是实时 ping** —— 每秒一次的话数据库会被打爆（一台机 6 条线路，
 * 100 台就是每秒 600 行）。实际部署里后台可配，常见 60 / 90 / 180 秒。
 * 这个值决定了：
 *   1. 每条线路的历史按这个间隔产生
 *   2. 界面上「最新值」最多可能已经这么旧
 *   3. **没有"实时"档** —— 数据本身不是实时的，给个实时档是撒谎
 *      （ink 的弹窗档位同样只有 1小时/6小时/12小时/1天/7天）
 */
export const PING_INTERVAL_SECONDS = 90

/**
 * 延迟/丢包专用的时间档位。
 * 与 RANGES 的区别：没有 live 档，且点数按探测周期换算 ——
 * 30 天按 90 秒一次是 28800 个采样，不可能全画出来，
 * 所以每个展示点是**一个时间桶的聚合**（延迟取桶内均值、丢包取桶内比例）。
 */
export const PING_RANGES: { key: RangeKey; label: string; points: number; seconds: number }[] = [
  { key: "1h", label: "1 小时", points: 60, seconds: 3600 },
  { key: "6h", label: "6 小时", points: 72, seconds: 6 * 3600 },
  { key: "1d", label: "1 天", points: 96, seconds: 24 * 3600 },
  { key: "7d", label: "7 天", points: 84, seconds: 7 * 24 * 3600 },
  { key: "30d", label: "30 天", points: 90, seconds: 30 * 24 * 3600 },
]

export type RangeKey =
  | "live"
  | "1h"
  | "4h"
  | "6h"
  | "1d"
  | "7d"
  | "30d"
  | "custom"

export const RANGES: {
  key: RangeKey
  label: string
  points: number
  /**
   * 该档位覆盖的真实秒数。
   * 不能拿 points 当秒数用 —— 只有实时档（1Hz）两者才相等，
   * 4 小时档是 120 点覆盖 14400 秒（每点 2 分钟）。
   */
  seconds: number
}[] = [
  { key: "live", label: "实时", points: 60, seconds: 60 },
  { key: "4h", label: "4 小时", points: 120, seconds: 4 * 3600 },
  { key: "1d", label: "1 天", points: 144, seconds: 24 * 3600 },
  { key: "7d", label: "7 天", points: 168, seconds: 7 * 24 * 3600 },
  { key: "30d", label: "30 天", points: 180, seconds: 30 * 24 * 3600 },
  // custom 的跨度由用户选的区间决定，运行时覆盖
  { key: "custom", label: "自定义", points: 180, seconds: 24 * 3600 },
]

/** 某档位每个采样点代表多少秒 */
export function rangeStepSeconds(range: RangeKey) {
  const item = RANGES.find((r) => r.key === range)
  if (!item) return 1
  return Math.round(item.seconds / item.points)
}

export type MetricKey =
  | "cpu"
  | "load"
  | "mem"
  | "swap"
  | "disk"
  | "rx"
  | "tx"
  | "tcp"
  | "udp"
  | "proc"

export interface PublicNode {
  id: string
  name: string
  status: Status
  country: string
  category: string
  tags: string[]
  favorite: boolean
  cpu: number
  load: number
  mem: number
  memTotal: number
  swap: number
  swapTotal: number
  disk: number
  diskTotal: number
  trafficUsed: number
  trafficTotal: number
  rx: number
  tx: number
  tcp: number
  udp: number
  proc: number
  latency: number
  loss: number
  isp: IspLatency[]
  ping: PingTarget[]
  latencyHistory: number[]
  lossHistory: number[]
  upTotal: number
  downTotal: number
  cpuSeries: number[]
  memSeries: number[]
  diskSeries: number[]
  trafficSeries: number[]
  rxSeries: number[]
  txSeries: number[]
  loadSeries: number[]
  swapSeries: number[]
  tcpSeries: number[]
  udpSeries: number[]
  procSeries: number[]
  uptimeDays: UptimeDay[]
  /** 设备信息（公开字段，见 docs/public-page.md） */
  os: string
  kernel: string
  arch: string
  virt: string
  cpuModel: string
  lastReport: string
  expireDays: number
  billing: string
  uptime: string
}

interface NodeSeed {
  id: string
  name: string
  country: string
  category: string
  tags: string[]
  cpu: number
  load: number
  mem: number
  memTotal: number
  disk: number
  diskTotal: number
  trafficUsed: number
  trafficTotal: number
  rx: number
  tx: number
  latency: number
  loss: number
  isp: [number, number, number]
  expireDays: number
  billing: string
  uptime: string
  status?: Status
  favorite?: boolean
  upTotal?: number
  downTotal?: number
  /** 覆盖自动推导的设备信息 */
  os?: string
  cpuModel?: string
}

function seedSeries(
  length: number,
  base: number,
  amplitude: number,
  noise: number,
  min: number,
  max: number,
) {
  const out: number[] = []
  for (let index = 0; index < length; index++) {
    const wave = Math.sin(index / (length / 5)) * amplitude
    out.push(clamp(base + wave + (Math.random() - 0.5) * noise, min, max))
  }
  return out
}


function pushBars(target: number[], value: number) {
  target.push(value)
  target.splice(0, Math.max(0, target.length - 40))
}

/* ------------------------------------------------------------------
   历史数据（4 小时 / 1 天 / 7 天）
   实时档用每秒在变的 live 数组；更长的档位是静态历史，按 key 确定性生成后缓存 ——
   用 PRNG 而不是 Math.random，否则每次重渲染曲线都会重新洗牌。
   ------------------------------------------------------------------ */

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 丢包序列。
 *
 * **不能复用一个连续波动的生成器** —— 真实丢包绝大多数采样点是 0，
 * 偶尔出现尖刺。用 makeHistory 生成的话每个点都 > 0，
 * 画成事件带会变成一条饱和的虚线，什么信息都读不出来。
 */
function makeLossHistory(seed: number, points: number, avg: number): number[] {
  let state = seed || 1
  const rand = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  const out: number[] = []
  for (let index = 0; index < points; index++) {
    /*
      约 3% 的采样点发生丢包 —— 用 12% 试过：六条线路并集后 45% 的时间点都有丢包，
      画成事件带是一条等高的虚线，读不出"事件"。真实网络远没这么频繁。
    */
    out.push(rand() < 0.03 ? Number((avg * (0.5 + rand() * 2.5)).toFixed(2)) : 0)
  }
  return out
}

function makeHistory(
  seed: number,
  points: number,
  base: number,
  amplitude: number,
  noise: number,
  min: number,
  max: number,
) {
  let state = seed || 1
  const rand = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  const out: number[] = []
  for (let index = 0; index < points; index++) {
    const wave = Math.sin(index / (points / 7)) * amplitude
    out.push(clamp(base + wave + (rand() - 0.5) * noise, min, max))
  }
  return out
}

/** 每个指标的基准值与波动范围；base 从节点当前值取，保证图和卡片数字对得上 */
const METRIC_SHAPE: Record<
  MetricKey,
  { amp: number; noise: number; min: number; max: number }
> = {
  cpu: { amp: 6, noise: 8, min: 0.5, max: 99 },
  load: { amp: 0.25, noise: 0.3, min: 0, max: 32 },
  mem: { amp: 4, noise: 3, min: 1, max: 99 },
  swap: { amp: 2, noise: 1.5, min: 0, max: 100 },
  disk: { amp: 0.5, noise: 0.3, min: 1, max: 99 },
  rx: { amp: 0.4, noise: 0.6, min: 0.01, max: 60 },
  tx: { amp: 0.3, noise: 0.4, min: 0.01, max: 40 },
  tcp: { amp: 8, noise: 12, min: 0, max: 4000 },
  udp: { amp: 2, noise: 3, min: 0, max: 400 },
  proc: { amp: 6, noise: 8, min: 1, max: 800 },
}

const historyCache = new Map<string, number[]>()

/**
 * 取某个节点 / 指标 / 时间档的序列。
 *
 * 实时档**必须返回 live 数组本身的引用**（每秒被 tick 原地 push），
 * 不能 slice 复制、也不能进缓存 —— 否则拿到的是首帧快照，图表会永久冻结。
 * 这个坑踩过一次：`direct.slice(-points)` + `historyCache.set` 让详情页
 * 所有实时曲线停在打开页面那一刻。
 *
 * 历史档是静态数据，才用缓存（同一个 key 永远返回同一条，避免重渲染时曲线洗牌）。
 */
export function historyFor(
  node: PublicNode,
  metric: MetricKey,
  range: RangeKey,
  /** custom 档位下用户选的跨度（秒），参与缓存 key，否则改日期拿到旧数据 */
  spanSeconds?: number,
): number[] {
  const live: Record<MetricKey, number[]> = {
    cpu: node.cpuSeries,
    mem: node.memSeries,
    disk: node.diskSeries,
    load: node.loadSeries,
    swap: node.swapSeries,
    rx: node.rxSeries,
    tx: node.txSeries,
    tcp: node.tcpSeries,
    udp: node.udpSeries,
    proc: node.procSeries,
  }

  // 实时档：直接给引用，让图表每帧读到最新内容
  if (range === "live") return live[metric]

  const key = `${node.id}:${metric}:${range}:${range === "custom" ? spanSeconds : ""}`
  const cached = historyCache.get(key)
  if (cached) return cached

  const points = RANGES.find((item) => item.key === range)?.points ?? 60
  const series = makeHistory(
    hashString(key),
    points,
    liveBase(node, metric),
    METRIC_SHAPE[metric].amp,
    METRIC_SHAPE[metric].noise,
    METRIC_SHAPE[metric].min,
    METRIC_SHAPE[metric].max,
  )
  historyCache.set(key, series)
  return series
}

/** 生成历史时的基准值：取节点当前值，让曲线和卡片上的数字一致 */
function liveBase(node: PublicNode, metric: MetricKey) {
  switch (metric) {
    case "cpu":
      return node.cpu
    case "load":
      return node.load
    case "mem":
      return node.mem
    case "swap":
      return node.swap
    case "disk":
      return node.disk
    case "rx":
      return node.rx
    case "tx":
      return node.tx
    case "tcp":
      return node.tcp
    case "udp":
      return node.udp
    case "proc":
      return node.proc
  }
}

/** 三网 ping 的历史（每个目标单独一条）。实时档同样返回引用，不复制不缓存。 */
/**
 * 各线路的丢包历史。
 * 与 pingHistoryFor 同构 —— 之前只有延迟能画趋势，丢包只有一个标量。
 */
export function pingLossHistoryFor(
  node: PublicNode,
  target: PingTarget,
  range: RangeKey,
  spanSeconds?: number,
): number[] {
  if (range === "live") range = "1h"

  const key = `${node.id}:pingloss:${target.id}:${range}:${range === "custom" ? spanSeconds : ""}`
  const cached = historyCache.get(key)
  if (cached) return cached
  const points = PING_RANGES.find((item) => item.key === range)?.points ?? 60
  const series = makeLossHistory(hashString(key), points, Math.max(0.1, target.loss))
  historyCache.set(key, series)
  return series
}

export function pingHistoryFor(
  node: PublicNode,
  target: PingTarget,
  range: RangeKey,
  spanSeconds?: number,
): number[] {
  // 探测不是实时的，没有 live 档；调用方若还传 live 就回落到 1 小时
  if (range === "live") range = "1h"

  const key = `${node.id}:ping:${target.id}:${range}:${range === "custom" ? spanSeconds : ""}`
  const cached = historyCache.get(key)
  if (cached) return cached
  // 注意用 PING_RANGES：延迟档位里没有 live，点数是按探测周期换算的
  const points = PING_RANGES.find((item) => item.key === range)?.points ?? 60
  const series = makeHistory(
    hashString(key),
    points,
    target.value,
    Math.max(6, target.value * 0.08),
    Math.max(4, target.value * 0.06),
    1,
    900,
  )
  historyCache.set(key, series)
  return series
}

/** 近 N 天估算正常率 */
export function uptimeRatio(days: UptimeDay[], last = 7) {
  const slice = days.slice(-last)
  if (slice.length === 0) return 100
  return slice.reduce((sum, day) => sum + day.ratio, 0) / slice.length
}

/** 设备信息从几个池子里按 id 确定性挑，避免手写 12 份 */
const OS_POOL = [
  { os: "Debian 12", kernel: "6.1.0-45-amd64" },
  { os: "Ubuntu 24.04", kernel: "6.8.0-45-generic" },
  { os: "Debian 12", kernel: "6.1.0-32-cloud-amd64" },
  { os: "AlmaLinux 9", kernel: "5.14.0-427.el9.x86_64" },
]
const CPU_POOL = [
  "AMD EPYC 9654 96-Core Processor",
  "AMD EPYC 7B13 64-Core Processor",
  "Intel Xeon Platinum 8375C",
  "AMD Ryzen 9 7950X 16-Core",
  "Intel Xeon E5-2680 v4",
]
const VIRT_POOL = ["kvm", "kvm", "kvm", "lxc", "none"]

function pick<T>(pool: T[], seed: number, salt = 0) {
  return pool[(seed + salt) % pool.length]
}

/** 30 天在线时间轴：绝大多数正常，偶尔部分异常 */
function makeUptimeDays(seed: number): UptimeDay[] {
  let state = seed || 1
  const rand = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  const days: UptimeDay[] = []
  const today = new Date()
  for (let back = 29; back >= 0; back--) {
    const date = new Date(today)
    date.setDate(today.getDate() - back)
    const roll = rand()
    const dayState: UptimeState =
      roll > 0.985 ? "off" : roll > 0.94 ? "partial" : roll < 0.012 ? "none" : "ok"
    days.push({
      date: `${date.getMonth() + 1}月${date.getDate()}日`,
      state: dayState,
      ratio:
        dayState === "ok"
          ? 100
          : dayState === "partial"
            ? Number((97 + rand() * 2.5).toFixed(1))
            : dayState === "off"
              ? Number((88 + rand() * 8).toFixed(1))
              : 0,
    })
  }
  return days
}

function makeNode(seed: NodeSeed): PublicNode {
  const { isp, status, favorite, os, cpuModel, ...rest } = seed
  const statusValue: Status = status ?? "ok"
  const hash = hashString(seed.id)
  const trafficRatio =
    seed.trafficTotal > 0
      ? (seed.trafficUsed / (seed.trafficTotal * 1024)) * 100
      : 0
  const swapTotal = seed.memTotal
  const swap = Number((1 + (hash % 40) / 10).toFixed(1))
  // 连接数与进程数挂在流量 / 内存上，保证不是各自乱漂的独立随机数
  const tcp = Math.round(12 + seed.rx * 60 + (hash % 90))
  const udp = Math.round(2 + seed.rx * 6 + (hash % 18))
  const proc = Math.round(90 + seed.memTotal * 12 + seed.mem)

  return {
    ...rest,
    status: statusValue,
    favorite: favorite ?? false,
    isp: [
      { id: "ct", label: "电信", value: isp[0] },
      { id: "cu", label: "联通", value: isp[1] },
      { id: "cm", label: "移动", value: isp[2] },
    ],
    ping: [
      { id: "sh-cm", label: "上海移动", value: isp[2] },
      { id: "gd-cm", label: "广东移动", value: isp[2] + 44 },
      { id: "sc-cm", label: "四川移动", value: isp[2] + 37 },
      { id: "hn-cm", label: "湖南移动", value: isp[2] + 48 },
      { id: "sc-cu", label: "四川联通", value: isp[1] + 40 },
      { id: "hn-cu", label: "湖南联通", value: isp[1] + 28 },
    ].map((target, index) => ({
      ...target,
      // 每条线路的丢包由节点级丢包派生，留出差异而不是六张卡一个数
      loss: Number((seed.loss * (0.5 + (index % 5) / 4)).toFixed(2)),
      history: seedSeries(60, target.value, 9, 14, 1, 900),
        lossHistory: makeLossHistory(
          hash + index * 31,
          60,
          Math.max(0.1, seed.loss * (0.5 + (index % 5) / 4)),
        ),
    })),
    swap,
    swapTotal,
    tcp,
    udp,
    proc,
    latencyHistory: seedSeries(40, seed.latency, 10, 16, 2, 600),
    lossHistory: seedSeries(40, seed.loss, 0.12, 0.2, 0, 5),
    upTotal: seed.upTotal ?? Number((0.4 + Math.random() * 6).toFixed(1)),
    downTotal: seed.downTotal ?? Number((0.8 + Math.random() * 9).toFixed(1)),
    cpuSeries: seedSeries(60, seed.cpu, 4, 5, 0.2, 99),
    memSeries: seedSeries(60, seed.mem, 3, 2.5, 2, 99),
    diskSeries: seedSeries(60, seed.disk, 0.4, 0.25, 1, 99),
    trafficSeries: seedSeries(60, trafficRatio, 1.4, 1, 0, 100),
    rxSeries: seedSeries(60, seed.rx, 0.3, 0.4, 0.01, 60),
    txSeries: seedSeries(60, seed.tx, 0.25, 0.3, 0.01, 40),
    loadSeries: seedSeries(60, seed.load, 0.2, 0.25, 0, 32),
    swapSeries: seedSeries(60, swap, 1.2, 1, 0, 100),
    tcpSeries: seedSeries(60, tcp, 8, 12, 0, 4000),
    udpSeries: seedSeries(60, udp, 2, 3, 0, 400),
    procSeries: seedSeries(60, proc, 5, 8, 1, 800),
    uptimeDays: makeUptimeDays(hash),
    os: os ?? pick(OS_POOL, hash).os,
    kernel: pick(OS_POOL, hash).kernel,
    arch: "amd64",
    virt: pick(VIRT_POOL, hash, 3),
    cpuModel: cpuModel ?? pick(CPU_POOL, hash, 1),
    // 首帧就要有值：否则详情页在第一次 tick 之前会显示「最后上报 —」
    lastReport: new Date().toISOString().slice(0, 19).replace("T", " "),
  }
}

export const nodes: PublicNode[] = [
  makeNode({ id: "dmit-hk-01", name: "DMIT-HK.T1", country: "HK", category: "入口集群", tags: ["dmit", "入口", "caddy"], cpu: 23.4, load: 0.62, mem: 41.2, memTotal: 2, disk: 52, diskTotal: 20, trafficUsed: 72.6, trafficTotal: 1, rx: 1.24, tx: 0.42, latency: 42, loss: 0.1, isp: [40, 45, 42], expireDays: 86, billing: "¥45/月", uptime: "43d", favorite: true }),
  makeNode({ id: "dmit-lax-01", name: "DMIT-LAX.AN4", country: "US", category: "落地服务器", tags: ["dmit", "落地", "三网"], cpu: 0.3, load: 0.01, mem: 35.1, memTotal: 1, disk: 43.8, diskTotal: 20, trafficUsed: 0.2, trafficTotal: 1, rx: 0.15, tx: 1.2, latency: 162, loss: 0, isp: [129, 167, 179], expireDays: 57, billing: "$39.9/年", uptime: "43d" }),
  makeNode({ id: "tencent-sv-01", name: "腾讯云-硅谷", country: "US", category: "落地服务器", tags: ["腾讯云", "ppanel"], cpu: 0.7, load: 0.03, mem: 17, memTotal: 1, disk: 41.1, diskTotal: 20, trafficUsed: 60, trafficTotal: 1, rx: 0.01, tx: 0.07, latency: 161, loss: 0, isp: [129, 167, 178], expireDays: 34, billing: "¥68/月", uptime: "42d" }),
  makeNode({ id: "tencent-gz-01", name: "腾讯云-广州", country: "CN", category: "建站", tags: ["腾讯云", "ppanel", "建站"], cpu: 0.8, load: 0.02, mem: 24.9, memTotal: 2, disk: 13.4, diskTotal: 40, trafficUsed: 212, trafficTotal: 2, rx: 0.02, tx: 0.01, latency: 8, loss: 0, isp: [7, 9, 8], expireDays: 145, billing: "¥340/年", uptime: "54d", favorite: true }),
  makeNode({ id: "ucloud-la-01", name: "ucloud-la", country: "US", category: "落地服务器", tags: ["ucloud", "落地"], cpu: 2.7, load: 0.08, mem: 45.8, memTotal: 2, disk: 27.4, diskTotal: 40, trafficUsed: 168, trafficTotal: 2, rx: 0.21, tx: 1.6, latency: 152, loss: 0.1, isp: [135, 170, 180], expireDays: 145, billing: "$5.9/月", uptime: "131d" }),
  makeNode({ id: "volc-gz-01", name: "火山云-广州", country: "CN", category: "建站", tags: ["火山云", "建站"], cpu: 3.1, load: 0.1, mem: 38.4, memTotal: 4, disk: 20.6, diskTotal: 40, trafficUsed: 320, trafficTotal: 3, rx: 0.42, tx: 0.33, latency: 9, loss: 0, isp: [8, 10, 9], expireDays: 342, billing: "¥340/年", uptime: "117d" }),
  makeNode({ id: "volc-gz-02", name: "火山云-广州-2", country: "CN", category: "ix互联", tags: ["火山云", "ix"], cpu: 12.4, load: 0.3, mem: 51.9, memTotal: 4, disk: 32.7, diskTotal: 80, trafficUsed: 96, trafficTotal: 3, rx: 0.86, tx: 0.31, latency: 12, loss: 0.1, isp: [11, 14, 12], expireDays: 118, billing: "¥340/年", uptime: "89d" }),
  makeNode({ id: "ali-hk-01", name: "阿里云-香港", country: "HK", category: "建站", tags: ["阿里云", "建站", "caddy"], cpu: 41.6, load: 1.2, mem: 63.2, memTotal: 4, disk: 55, diskTotal: 80, trafficUsed: 980, trafficTotal: 3, rx: 2.88, tx: 1.31, latency: 36, loss: 0.2, isp: [34, 39, 37], expireDays: 210, billing: "¥99/月", uptime: "203d" }),
  makeNode({ id: "vultr-tokyo-01", name: "vultr-东京", country: "JP", category: "落地服务器", tags: ["vultr", "落地", "软银"], cpu: 18.2, load: 0.42, mem: 36.4, memTotal: 2, disk: 44, diskTotal: 40, trafficUsed: 216, trafficTotal: 2, rx: 0.86, tx: 0.31, latency: 88, loss: 0.2, isp: [85, 92, 89], expireDays: 121, billing: "$5.9/月", uptime: "121d" }),
  makeNode({ id: "backup-nas", name: "backup-nas", country: "CN", category: "落地服务器", tags: ["家里", "备份"], cpu: 3.2, load: 0.05, mem: 12.4, memTotal: 8, disk: 92, diskTotal: 100, trafficUsed: 28, trafficTotal: 4, rx: 0.31, tx: 0.62, latency: 18, loss: 0, isp: [17, 20, 18], expireDays: 999, billing: "自建", uptime: "31d", status: "warn" }),
  makeNode({ id: "sg-web-01", name: "sg-web-01", country: "SG", category: "建站", tags: ["腾讯云", "ppanel", "建站"], cpu: 29.8, load: 0.9, mem: 52.3, memTotal: 2, disk: 61, diskTotal: 40, trafficUsed: 138, trafficTotal: 2, rx: 2.1, tx: 0.96, latency: 92, loss: 0.2, isp: [90, 96, 93], expireDays: 240, billing: "¥138/月", uptime: "61d", favorite: true }),
  makeNode({ id: "sg-entry-01", name: "sg-entry-01", country: "SG", category: "入口集群", tags: ["腾讯云", "入口"], cpu: 22.1, load: 0.6, mem: 44.5, memTotal: 2, disk: 37, diskTotal: 40, trafficUsed: 58, trafficTotal: 2, rx: 1.66, tx: 0.74, latency: 95, loss: 0.1, isp: [92, 99, 96], expireDays: 180, billing: "¥138/月", uptime: "77d" }),
]

export const rateSeries: number[] = []
for (let index = 0; index < 60; index++) {
  rateSeries.push(8 + Math.sin(index / 6) * 2 + Math.random() * 1.6)
}

let version = 0
const listeners = new Set<() => void>()
let timer: number | null = null
let paused = false
let updatedAt = Date.now()

/** 首次快照是否已到（真实实现里是 /api/public/* 的 REST 拉取） */
const SNAPSHOT_DELAY = 350
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

/** 页面隐藏时停表；回到前台补一次快照再恢复 */
function onVisibilityChange() {
  if (document.hidden) {
    stop()
  } else if (loaded && !paused) {
    tick()
    start()
  }
}

export function isLoaded() {
  return loaded
}

export function usePublicStatus() {
  return useSyncExternalStore(subscribe, isLoaded, isLoaded)
}

function pushSeries(target: number[], value: number) {
  target.push(value)
  if (target.length > 60) target.shift()
}

/** 上一次完成探测的周期序号。见 tick() 里的说明 —— 延迟不是每秒采的 */
let lastProbeEpoch = -1

function tick() {
  if (paused) return
  updatedAt = Date.now()
  for (const node of nodes) {
    node.cpu = clamp(node.cpu + (Math.random() - 0.5) * 2, 0.1, 97)
    node.load = clamp(node.load + (Math.random() - 0.5) * 0.06, 0, 32)
    node.mem = clamp(node.mem + (Math.random() - 0.5) * 1, 2, 96)
    node.disk = clamp(node.disk + (Math.random() - 0.5) * 0.03, 1, 98)
    node.trafficUsed = clamp(
      node.trafficUsed + Math.random() * 0.02,
      0,
      node.trafficTotal * 1024,
    )
    node.rx = clamp(node.rx + (Math.random() - 0.5) * 0.3, 0.01, 40)
    node.tx = clamp(node.tx + (Math.random() - 0.5) * 0.2, 0.01, 24)
    // swap / 连接数 / 进程跟着主指标温和联动，不要各漂各的
    node.swap = clamp(node.swap + (Math.random() - 0.5) * 0.3, 0, 100)
    node.tcp = clamp(
      Math.round(node.tcp + (Math.random() - 0.5) * 4 + node.rx * 0.2),
      0,
      4000,
    )
    node.udp = clamp(Math.round(node.udp + (Math.random() - 0.5) * 2), 0, 400)
    node.proc = clamp(
      Math.round(node.proc + (Math.random() - 0.5) * 3 + node.cpu * 0.05),
      1,
      800,
    )
    /*
      延迟 / 丢包不是每秒采的 —— 跟着探测周期走。
      跨过一个探测周期才更新一次，其余 tick 保持不动。
      不这么做的话界面上那个"最新延迟"会每秒跳一次，
      而它其实是 90 秒前的探测结果 —— 那是在撒谎。
    */
    const probeEpoch = Math.floor(updatedAt / (PING_INTERVAL_SECONDS * 1000))
    if (probeEpoch !== lastProbeEpoch) {
      lastProbeEpoch = probeEpoch
      node.latency = clamp(node.latency + (Math.random() - 0.5) * 8, 2, 600)
      node.loss = clamp(node.loss + (Math.random() - 0.5) * 0.06, 0, 5)
      pushSeries(node.latencyHistory, node.latency)
      pushSeries(node.lossHistory, node.loss)
      for (const item of node.isp) {
        item.value = clamp(item.value + (Math.random() - 0.5) * 5, 2, 800)
      }
      for (const target of node.ping) {
        target.value = clamp(target.value + (Math.random() - 0.5) * 6, 1, 900)
        pushSeries(target.history, target.value)
      }
    }
    const trafficRatio =
      node.trafficTotal > 0
        ? (node.trafficUsed / (node.trafficTotal * 1024)) * 100
        : 0
    pushSeries(node.cpuSeries, node.cpu)
    pushSeries(node.memSeries, node.mem)
    pushSeries(node.diskSeries, node.disk)
    pushSeries(node.trafficSeries, trafficRatio)
    pushSeries(node.rxSeries, node.rx)
    pushSeries(node.txSeries, node.tx)
    pushSeries(node.loadSeries, node.load)
    pushSeries(node.swapSeries, node.swap)
    pushSeries(node.tcpSeries, node.tcp)
    pushSeries(node.udpSeries, node.udp)
    pushSeries(node.procSeries, node.proc)

    const next: Status =
      node.loss > 1 || node.latency > 350
        ? "crit"
        : node.loss > 0.5 || node.latency > 220
          ? "warn"
          : "ok"
    node.status =
      node.cpu > 90 || node.mem > 92 || node.disk > 90 ? "warn" : next
    pushBars(node.latencyHistory, node.latency)
    pushBars(node.lossHistory, node.loss)
    node.upTotal = node.upTotal + node.rx / 61440
    node.downTotal = node.downTotal + node.tx / 61440
    node.lastReport = new Date().toISOString().slice(0, 19).replace("T", " ")
  }
  const totalRate = nodes.reduce(
    (sum, item) => sum + item.rx + item.tx,
    0,
  )
  pushSeries(rateSeries, totalRate)
  version++
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)

  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange)
    if (loaded) {
      if (!document.hidden && !paused) start()
    } else {
      // 首次订阅：模拟拉一次快照，页面在这段时间显示 Skeleton
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null
        loaded = true
        updatedAt = Date.now()
        if (!document.hidden && !paused) start()
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

export function getUpdatedAt() {
  return updatedAt
}

export function getPaused() {
  return paused
}

export function setPaused(value: boolean) {
  paused = value
  if (value) stop()
  else if (loaded && !document.hidden) start()
  version++
  for (const listener of listeners) listener()
}

export function usePublicTick() {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}
