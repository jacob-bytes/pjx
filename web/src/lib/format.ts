export function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

export function rate(value: number) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

export function clockTime(date: Date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour12: false })
}

/**
 * 最后上报的展示文案。与 `lastSeenSec` 是"一份数据、一处格式"的关系 ——
 * 之前把它写死在 mock 里，排序就没法用它。
 */
export function formatLastSeen(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)}s 前`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`
  return `${Math.round(seconds / 3600)} 小时前`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 把秒数格式化成图表轴用的跨度，例如 180 → "3 分钟"。
 * 图表的横轴标签必须由数据长度推导，不能写死 —— 否则序列换长度时会静默说谎。
 */
export function formatSpan(seconds: number) {
  const [value, unit] =
    seconds < 60
      ? [seconds, "秒"]
      : seconds < 3600
        ? [seconds / 60, "分钟"]
        : seconds < 86400
          ? [seconds / 3600, "小时"]
          : [seconds / 86400, "天"]
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

/** 字节数格式化，例如 352825548 → "336.5 MB" */
export function formatBytes(bytes: number, digits = 1) {
  if (!Number.isFinite(bytes)) return "—"
  const sign = bytes < 0 ? "-" : ""
  let value = Math.abs(bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${sign}${unit === 0 ? Math.round(value) : value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}

/** GB → 字节 */
export function gb(value: number) {
  return value * 1024 ** 3
}

/** 百分比 × 总量(GB) → 字节 */
export function percentOfGb(percent: number, totalGb: number) {
  return (percent / 100) * gb(totalGb)
}

/** 按总量把百分比序列换算成字节序列（给图表画字节轴用） */
export function scaleToBytes(series: number[], totalGb: number) {
  return series.map((value) => percentOfGb(value, totalGb))
}

/**
 * 图表横轴的时间标签。
 * 相对跨度（"3 分钟前"）在长区间里不好读 —— 运维看曲线第一反应是
 * "这是几点的事"，所以按跨度选合适的粒度直接给时刻。
 */
export function formatAxisTime(date: Date, spanSeconds: number) {
  const pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (spanSeconds <= 3600) {
    // 一小时内精确到分钟就够，秒会让刻度太吵
    return hm
  }
  if (spanSeconds <= 86400) {
    return hm
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`
}
