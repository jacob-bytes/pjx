/**
 * **全站唯一的节点清单。**
 *
 * 以前前台和后台各有一份手写数据：同一台机器在前台叫 `dmit-hk-01`、在后台叫 `hk-01`，
 * 指标还各自抄了一遍（于是同一台 LA 机器后台报"离线"、前台报"正常"）。
 * 现在两侧都从这里投影：
 *
 *   - 前台状态页：`nodes = NODES.map(makeNode)`（取合规字段）
 *   - 后台监控：  `fleet = NODES.map(toServer)`（加上 agent / 最后上报等运维字段）
 *
 * 于是「后台点进某台机器 → 去前台看它的公开状态」能真的用同一个 id 串起来，
 * 数字也不会互相矛盾。
 */
export type Status = "ok" | "warn" | "crit" | "off"

export type UptimeState = "ok" | "partial" | "off" | "none"

export interface UptimeDay {
  date: string
  state: UptimeState
  /** 当日正常率 0-100 */
  ratio: number
}

/** 稳定的字符串散列：同一个 id 每次得到同一份 mock 数据 */
export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 30 天在线时间轴（绝大多数正常、偶尔部分异常）。
 *
 * **放在规范数据里而不是前台 mock 里** —— 同一台机器的 30 天历史和它叫什么、
 * 在哪个机房一样，属于节点自身的事实。后台的「30 天」列与前台卡片读的是这一份，
 * 两边不会各推一份（§BB 统一 mock 的延续）。
 */
const UPTIME_CACHE = new Map<string, UptimeDay[]>()
export function uptimeDaysFor(id: string): UptimeDay[] {
  const cached = UPTIME_CACHE.get(id)
  if (cached) return cached
  let state = hashString(id) || 1
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
  UPTIME_CACHE.set(id, days)
  return days
}

export interface NodeSeed {
  /** 全站唯一 id，同时是前台详情页的 URL(`/?node=<id>`) 与后台 `?server=<id>` */
  id: string
  name: string
  /** 中文地区名 —— 后台表格与标签用它 */
  region: string
  /** ISO 国家码 —— 前台按地区分组用它 */
  country: string
  category: string
  /** 用途：生产 / 备用 / 备份。后台标签的第二段 */
  env: string
  ip: string
  os: string
  /** 前台展示用的关键词（服务商 / 角色） */
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
  /** 三网延迟基数：[电信, 联通, 移动] */
  isp: [number, number, number]
  expireDays: number
  billing: string
  uptime: string
  /** 不填 = 正常。只有异常状态才需要显式写 */
  status?: Status
  favorite?: boolean
  cpuModel?: string
  /** 累计上下行流量（TB）。不填由 makeNode 推导 */
  upTotal?: number
  downTotal?: number
  /**
   * agent 版本。**不填 = 与最新版同版本**（后台的「agent 落后」就是数这里
   * 显式写了旧版本号的机器），所以新增机器默认不会凭空变成"落后"。
   */
  agent?: string
}

/**
 * 12 台机器，前后台共用。
 *
 * IP 全部取 RFC 5737 的文档用网段（192.0.2.0/24、198.51.100.0/24、203.0.113.0/24）
 * 与内网段，不会指向任何真实主机。
 *
 * 注意 `dmit-lax-01` 是**离线**的：统一之前后台说它离线（agent 停在 0.2.9），
 * 前台却显示"正常" —— 这正是两套数据各自漂移的典型症状。统一后取后台这一侧
 * （后台是监控事实源，而状态页本来就该把这次故障显示出来）。
 */
export const NODES: NodeSeed[] = [
  {
    // 身份
    id: "dmit-hk-01", name: "DMIT-HK.T1", region: "香港", country: "HK",
    category: "入口集群", env: "生产",
    // 连接与标签
    ip: "203.0.113.21", os: "Debian 12", tags: ["dmit", "入口", "caddy"],
    // 指标
    cpu: 23.4, load: 0.62, mem: 41.2, memTotal: 2, disk: 52, diskTotal: 20,
    // 流量
    trafficUsed: 72.6, trafficTotal: 1, rx: 1.24, tx: 0.42,
    // 网络质量
    latency: 42, loss: 0.1, isp: [40, 45, 42],
    // 合约
    expireDays: 86, billing: "¥45/月", uptime: "43d",
    // 状态
    favorite: true,
  },
  {
    // 身份
    id: "dmit-lax-01", name: "DMIT-LAX.AN4", region: "洛杉矶", country: "US",
    category: "落地服务器", env: "备用",
    // 连接与标签
    ip: "198.51.100.88", os: "CentOS 9", tags: ["dmit", "落地", "三网"],
    // 指标
    cpu: 0.3, load: 0.01, mem: 35.1, memTotal: 1, disk: 43.8, diskTotal: 20,
    // 流量
    trafficUsed: 0.2, trafficTotal: 1, rx: 0.15, tx: 1.2,
    // 网络质量
    latency: 162, loss: 0, isp: [129, 167, 179],
    // 合约
    expireDays: 57, billing: "$39.9/年", uptime: "43d",
    // 状态
    status: "off", agent: "0.2.9",
  },
  {
    // 身份
    id: "tencent-sv-01", name: "腾讯云-硅谷", region: "硅谷", country: "US",
    category: "落地服务器", env: "备用",
    // 连接与标签
    ip: "198.51.100.12", os: "Ubuntu 24.04", tags: ["腾讯云", "ppanel"],
    // 指标
    cpu: 0.7, load: 0.03, mem: 17, memTotal: 1, disk: 41.1, diskTotal: 20,
    // 流量
    trafficUsed: 60, trafficTotal: 1, rx: 0.01, tx: 0.07,
    // 网络质量
    latency: 161, loss: 0, isp: [129, 167, 178],
    // 合约
    expireDays: 34, billing: "¥68/月", uptime: "42d",
  },
  {
    // 身份
    id: "tencent-gz-01", name: "腾讯云-广州", region: "广州", country: "CN",
    category: "建站", env: "生产",
    // 连接与标签
    ip: "203.0.113.92", os: "Debian 12", tags: ["腾讯云", "ppanel", "建站"],
    // 指标
    cpu: 0.8, load: 0.02, mem: 24.9, memTotal: 2, disk: 13.4, diskTotal: 40,
    // 流量
    trafficUsed: 212, trafficTotal: 2, rx: 0.02, tx: 0.01,
    // 网络质量
    latency: 8, loss: 0, isp: [7, 9, 8],
    // 合约
    expireDays: 145, billing: "¥340/年", uptime: "54d",
    // 状态
    favorite: true,
  },
  {
    // 身份
    id: "ucloud-la-01", name: "ucloud-la", region: "洛杉矶", country: "US",
    category: "落地服务器", env: "备用",
    // 连接与标签
    ip: "192.0.2.140", os: "Ubuntu 24.04", tags: ["ucloud", "落地"],
    // 指标
    cpu: 2.7, load: 0.08, mem: 45.8, memTotal: 2, disk: 27.4, diskTotal: 40,
    // 流量
    trafficUsed: 168, trafficTotal: 2, rx: 0.21, tx: 1.6,
    // 网络质量
    latency: 152, loss: 0.1, isp: [135, 170, 180],
    // 合约
    expireDays: 145, billing: "$5.9/月", uptime: "131d",
    // 状态
    agent: "0.3.0",
  },
  {
    // 身份
    id: "volc-gz-01", name: "火山云-广州", region: "广州", country: "CN", category: "建站",
    env: "备用",
    // 连接与标签
    ip: "192.0.2.33", os: "Debian 12", tags: ["火山云", "建站"],
    // 指标
    cpu: 3.1, load: 0.1, mem: 38.4, memTotal: 4, disk: 20.6, diskTotal: 40,
    // 流量
    trafficUsed: 320, trafficTotal: 3, rx: 0.42, tx: 0.33,
    // 网络质量
    latency: 9, loss: 0, isp: [8, 10, 9],
    // 合约
    expireDays: 342, billing: "¥340/年", uptime: "117d",
  },
  {
    // 身份
    id: "volc-gz-02", name: "火山云-广州-2", region: "广州", country: "CN",
    category: "ix互联", env: "生产",
    // 连接与标签
    ip: "192.0.2.34", os: "AlmaLinux 9", tags: ["火山云", "ix"],
    // 指标
    cpu: 12.4, load: 0.3, mem: 51.9, memTotal: 4, disk: 32.7, diskTotal: 80,
    // 流量
    trafficUsed: 96, trafficTotal: 3, rx: 0.86, tx: 0.31,
    // 网络质量
    latency: 12, loss: 0.1, isp: [11, 14, 12],
    // 合约
    expireDays: 118, billing: "¥340/年", uptime: "89d",
    // 状态
    agent: "0.3.0",
  },
  {
    // 身份
    id: "ali-hk-01", name: "阿里云-香港", region: "香港", country: "HK", category: "建站",
    env: "生产",
    // 连接与标签
    ip: "203.0.113.22", os: "Debian 12", tags: ["阿里云", "建站", "caddy"],
    // 指标
    cpu: 41.6, load: 1.2, mem: 63.2, memTotal: 4, disk: 55, diskTotal: 80,
    // 流量
    trafficUsed: 980, trafficTotal: 3, rx: 2.88, tx: 1.31,
    // 网络质量
    latency: 36, loss: 0.2, isp: [34, 39, 37],
    // 合约
    expireDays: 210, billing: "¥99/月", uptime: "203d",
  },
  {
    // 身份
    id: "vultr-tokyo-01", name: "vultr-东京", region: "东京", country: "JP",
    category: "落地服务器", env: "生产",
    // 连接与标签
    ip: "198.51.100.11", os: "Ubuntu 24.04", tags: ["vultr", "落地", "软银"],
    // 指标
    cpu: 18.2, load: 0.42, mem: 36.4, memTotal: 2, disk: 44, diskTotal: 40,
    // 流量
    trafficUsed: 216, trafficTotal: 2, rx: 0.86, tx: 0.31,
    // 网络质量
    latency: 88, loss: 0.2, isp: [85, 92, 89],
    // 合约
    expireDays: 121, billing: "$5.9/月", uptime: "121d",
    // 状态
    agent: "0.3.0",
  },
  {
    // 身份
    id: "backup-nas", name: "backup-nas", region: "本机", country: "CN",
    category: "落地服务器", env: "备份",
    // 连接与标签
    ip: "192.168.1.10", os: "Debian 12", tags: ["家里", "备份"],
    // 指标
    cpu: 3.2, load: 0.05, mem: 12.4, memTotal: 8, disk: 92, diskTotal: 100,
    // 流量
    trafficUsed: 28, trafficTotal: 4, rx: 0.31, tx: 0.62,
    // 网络质量
    latency: 18, loss: 0, isp: [17, 20, 18],
    // 合约
    expireDays: 999, billing: "自建", uptime: "31d",
    // 状态
    status: "warn",
  },
  {
    // 身份
    id: "sg-web-01", name: "sg-web-01", region: "新加坡", country: "SG",
    category: "建站", env: "生产",
    // 连接与标签
    ip: "192.0.2.31", os: "AlmaLinux 9", tags: ["腾讯云", "ppanel", "建站"],
    // 指标
    cpu: 29.8, load: 0.9, mem: 52.3, memTotal: 2, disk: 61, diskTotal: 40,
    // 流量
    trafficUsed: 138, trafficTotal: 2, rx: 2.1, tx: 0.96,
    // 网络质量
    latency: 92, loss: 0.2, isp: [90, 96, 93],
    // 合约
    expireDays: 240, billing: "¥138/月", uptime: "61d",
    // 状态
    favorite: true,
  },
  {
    // 身份
    id: "sg-entry-01", name: "sg-entry-01", region: "新加坡", country: "SG",
    category: "入口集群", env: "生产",
    // 连接与标签
    ip: "192.0.2.35", os: "Debian 12", tags: ["腾讯云", "入口"],
    // 指标
    cpu: 22.1, load: 0.6, mem: 44.5, memTotal: 2, disk: 37, diskTotal: 40,
    // 流量
    trafficUsed: 58, trafficTotal: 2, rx: 1.66, tx: 0.74,
    // 网络质量
    latency: 95, loss: 0.1, isp: [92, 99, 96],
    // 合约
    expireDays: 180, billing: "¥138/月", uptime: "77d",
  },
]
