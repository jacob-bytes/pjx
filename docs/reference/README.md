# 上游参照

pjx 前台的视觉参照是 Komari 的 **ink** 主题：
<https://github.com/jacob-bytes/komari-theme-ink>（MIT）

线上实例：<https://srvs.dejavu.live/>

这里放的是该仓库 `docs/` 下的官方预览图，仅作对齐参考：

- `ink-preview-home.png` — 总览页（六宫格 KPI + D3 地球 + 节点卡网格）
- `ink-preview-detail.png` — **详情页改版前**的多卡片形态
- `ink-detail-dark-mobile.png` — **详情页改版后**（Playwright 视觉快照）：
  紧凑信息摘要单卡双列 + 单列图表 + 真实时间戳横轴 + 30天/自定义档位
- `ink-detail-glass-desktop.png` — 可配置渐变背景 + 毛玻璃卡片（改版前结构，但展示了背景能力）

> 注意：`ink-preview-detail.png` 是**改版前**的状态（顶部 8 张价格/指标卡 + 硬件/系统/存储/网络四张卡）。
> 该仓库的 `docs/DetailPageRework.md` 记录了把它收敛为
> 「紧凑信息头 + 极简图表」的改造清单 —— 线上 `srvs.dejavu.live` 跑的已经是改版后的版本，
> pjx 详情页参照的是改版后的形态。

## 关键设计 token（摘自其 README）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--primary` | `oklch(0.55 0.16 258)` | 图表主线 / 选中态 / hover 边框 / sparkline |
| `--success` | `oklch(0.62 0.13 154)` | **仅**在线 / 正常状态点 |
| `--danger` | `oklch(0.58 0.18 25)` | **仅**异常 / 丢包 / 85%+ 负载 |
| `--warning` | `oklch(0.72 0.14 70)` | 60-85% 负载 / 延迟中间档 |
| 深色底 | `oklch(0.14 0.022 265)` | 蓝紫倾向，非纯黑 |

技术栈：Vue 3.5 + Vite 7 + Tailwind v4 + reka-ui + vue-echarts + Pinia。
pjx 是 React 实现，只借鉴设计语言，不搬代码。
