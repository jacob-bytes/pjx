# UI 规范

前台视觉参照 Komari 的 ink 主题（MIT），只借鉴设计语言，不从上游搬代码。
详细轮次记录与实测数据见 docs/polish-round4.md，本文件是稳定下来的规范。

## 1. 目标与约束

- 规模：不超过 200 台节点，单 master 单机
- 实时性：公网页秒级（SSE），探测类数据按周期模型展示
- 无终端 / webssh；计划任务只做定时探活
- 单色 UI：颜色只服务状态与数据，不做装饰

## 2. 技术栈与依赖原则

- Vite 6 + React 19 + TypeScript + Tailwind v4 + shadcn/ui（radix-ui 统一包）
- 字体：Inter Variable（@fontsource-variable/inter，wght.css）
- 图标：Phosphor Icons，全局 IconContext weight 为 light（比 regular 柔和）
- 公网页不引 react-router：筛选走 History API，首屏省约 13KB gzip
- 公网页不引 cmdk：排序菜单与节点选择器为轻量自实现
- 公网页不引 Radix Dialog：模态框用原生 dialog
- 不引 ECharts / Recharts：图表是自研 SVG 引擎
- 加依赖前先回答：平台或现有组件是否已经提供

## 3. 设计 token

唯一来源 src/styles/globals.css。

### 颜色

- 中性色：冷灰 hue 255，浅色背景 oklch(0.972) 比 card 纯白明显暗一档，
  卡片才浮得起来；深色底带蓝紫倾向 hue 265，不使纯黑
- 品牌色：对齐 ink 的深蓝 oklch(0.53 0.16 258)；
  明度压到 0.53 是为了在 muted 底上也满足 4.5:1
- 状态填充（圆点 / 进度条 / 心跳条）：ok / warn / crit / info，图形按 3:1
- 状态文字：ok-text / warn-text / crit-text / info-text 与填充色分开，
  要求 background、card、muted 三种底上均不低于 4.5:1
- ping 多线：单一蓝色相拉 6 档明度（ping-1 到 ping-6），
  最浅档不低于 3:1，两两最小色距约 0.113
- 数据序列：chart-1 品牌蓝为主线；chart-3 走中性，避免与 chart-1 在双轴图里混淆

### 形状 / 层级 / 动效

- 圆角：基础 10px（经过 ink 对齐后从 6px 加深）
- 阴影：elevation-card 给卡片微浮起；elevation-pop 只给浮层
- 动效：三档时长 120 / 180 / 240ms，单条缓动 cubic-bezier(0.2, 0, 0, 1)
- 触屏变体：touch 变体基于 pointer: coarse，把命中区撑到不小于 44px，
  视觉尺寸不变

## 4. 组件规范

| 组件 | 约定 |
| --- | --- |
| IconButton | 统一 icon 按钮：ghost 底座，必须有 label（aria-label + title），触屏 size 放大 |
| ToggleChip | 可切换胶囊：aria-pressed；选中态同时用颜色与字重；raised 变体用于分段容器内 |
| Segmented | radiogroup + radio 语义；全站 5 处共用，禁止再手写同行控件 |
| EmptyState | 标题 + 说明 + 可选操作；禁止出现空白表格 |
| Skeleton / TableSkeleton | muted 脉冲，禁止渐变 shimmer；尺寸与真实内容一致 |
| Modal | 原生 dialog + showModal；自带焦点陷阱 / Esc / top layer，不引 Radix Dialog |
| LiveStatus | 连接中 / 实时 / 已暂停三态，断线不静默 |
| StatusDot | 默认颜色；CVD 模式下叠加形状：在线圆、告警三角、严重方块、离线短横 |
| StatusBanner | 页面第一结论；role=status + aria-live=polite，可关闭 |

## 5. 图表规范

图表引擎：src/components/time-series-chart.tsx（自研 SVG）。

- 按容器真实像素渲染（ResizeObserver），文字不随 viewBox 缩放
- 横轴用真实时间戳（formatAxisTime），相对跨度只用于短区间说明
- 双 Y 轴只用于量纲不同但需要同屏的量；不允许把两个独立趋势强行叠轴
- 多序列区分必须颜色 + 线型双通道（DASH_CYCLE），只靠颜色对色盲用户无效
- 事件带（ChartBand）贴在绘图区底部表示「哪一刻出过事」，
  丢包这类事件不画成第二条曲线，避免双轴伪相关
- 十字游标：hover 跟随；触屏点一下锁定，再点取消；hover 期间用 ref 直接改 DOM
- 面积填充克制，仅 0.07 到 0.1 透明度；折线不抢数字注意力
- 参考线用虚线且进图例；单序列不画图例
- 时间范围与采样说明同行展示；采样点数与每点跨度由数据推导，禁止写死

## 6. 数据与实时

- 订阅边界：AppShell 不订阅 1Hz tick；LiveStatus 与数据页各自订阅
- 页面 hidden 时停表；回到前台补一次快照再恢复；订阅者归零时清理定时器
- 首个快照未到显示骨架屏，不渲染零值
- 公网页筛选进 URL：cat / q / fav / sort / node；输入类用 replaceState
- 本地偏好进 localStorage：pjx- 前缀，读写失败静默退回默认值
- 探测周期模型：PING_INTERVAL_SECONDS 为 90，延迟 / 丢包没有「实时」档，
  每个展示点是一个时间桶的聚合（延迟取均值、丢包取比例）

## 7. 无障碍与触控

- 所有图标按钮有 aria-label；收藏类按钮带 aria-pressed
- 分段控件用 radiogroup / radio，读屏能播报选中项
- 状态不只用颜色：CVD 模式提供形状通道，图表提供线型通道
- 对比度由 scripts/check-contrast.py 用数值守住，两套主题文字 token 均不低于 4.5:1
- 触控目标不小于 44px（touch 变体）
- sr-only 补充标题；图表 aria-hidden，数值以文本呈现

## 8. 后台约定

- 路由：react-router，basename 为 /admin；使用 useSearchParams，不直接写 history
- 移动端导航：复用同一份 SidebarNav，放进左侧 Sheet 抽屉
- 深链兜底：Vite 插件把 /admin/* 改写到 /admin/index.html；
  Go master 静态服务必须复刻，否则后台子页面 F5 会掉到前台
- 后台详情 Sheet 同样使用 TimeSeriesChart，保持与前台同一套图表语言

## 9. 文档优先级

- 实现与 token 以代码为准：src/styles/globals.css 与 src/components/
- 轮次决策与实测数据见 docs/polish-round4.md（含明确不做的项）
- 本文档是稳定规范；走查结论见 docs/frontend-audit.md
- 公网页细节见 docs/public-page.md
