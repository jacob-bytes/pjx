/**
 * 折线 + 面积路径。
 *
 * `domain` 给定时按固定域归一化（百分比类序列必须传 [0, 100]）：
 * 否则每条序列都按自身 min/max 拉满，CPU 稳定 95% 和稳定 5% 会画得一模一样。
 * 不传则退回自动域，适合没有天然上界的序列（如速率）。
 */
export function linePath(
  data: number[],
  width: number,
  height: number,
  pad = 1,
  domain?: [number, number],
) {
  if (data.length < 2) return { line: "", area: "" }
  const min = domain ? domain[0] : Math.min(...data)
  const max = domain ? domain[1] : Math.max(...data)
  const span = max - min || 1
  const plotW = width - pad * 2
  const plotH = height - pad * 2
  const step = plotW / (data.length - 1)
  const points = data.map((value, index) => {
    const x = pad + index * step
    // 越界值夹住，避免超出绘图区
    const ratio = Math.min(1, Math.max(0, (value - min) / span))
    const y = pad + plotH - ratio * plotH
    return [x, y] as const
  })
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ")
  const area = `${line} L${(pad + plotW).toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`
  return { line, area }
}
