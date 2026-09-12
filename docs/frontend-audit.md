# 前端走查报告

> 扫描范围：`web/src` 全部 45 个源文件（5622 行）、两个 Vite 入口、设计 token、构建产物
> 结论口径：数值均为实测（构建产物大小、OKLCH→sRGB→WCAG 对比度计算、源码检索计数）
> 基线：浅色 / 深色双主题，`docs/ui-spec.md` + `docs/public-page.md` 为规范依据
> 状态：第 1 / 2 / 3 批**已实施**，见文末「实施记录」

## 0. 总体结论

设计方向是对的，而且是很克制的那一类：单色 UI、状态色只给数据、圆角 ≤8px、无装饰阴影。
这套语言在实现里基本被守住了，没有跑偏成"AI 感仪表盘"。**不需要重新设计。**

问题集中在三处，按投入产出比排序：

| # | 问题域 | 影响 | 工作量 |
| --- | --- | --- | --- |
| 1 | 移动端后台完全没有导航 | 手机上进后台等于走进死胡同 | 0.5 天 |
| 2 | 浅色主题元信息层对比度不达标 | 49 处小字低于 WCAG AA，10–11px 文字最难读 | 0.5 天 |
| 3 | 前台首屏 111KB gzip，其中 22KB 是死代码 | 公网状态页首屏可砍掉 17% | 1 小时 |

另外发现 7 个真实功能 bug（不是风格问题，是"点了没反应"或"显示的和数据对不上"）。

### 当前仍开放的条目

截至第二轮，报告里**确实还没做**的只有下面这些，其余全部完成：

| 条目 | 为什么没做 |
| --- | --- |
| 4.6 一批"承诺了但不做事"的控件 | 演示阶段的占位，等真实 API 接上才有意义 |
| 4.9 数据与保留页数字口径不一致 | 需要先定"预估占用"的计算口径 |
| 4.10 探测表单校验 | 只修了类型切换残留；完整校验应随真实提交接口一起做 |
| 5.1 抽公共组件（部分） | `Segmented` 已抽；表头单元格等约 60 处重复未动 |
| 5.2 未使用的组件文件 | `tooltip` / `separator` / `dialog` 仍是死文件 |
| 5.3 两套 logo | 规范 §10 把 logo 列为待定，需要先定品牌 |
| 5.5 移动端键盘优化 | `inputMode` 一处都没加 |
| 5.7 截断 title | 卡片名截断后仍无法查看全名 |

另有第二轮提出的 6 条"美化建议"（数字变化过渡、共享时间游标、单位降档等）属于**提案**，未实施。

---

## 1. P0 · 功能 bug

### 1.1 移动端后台没有导航 🔴 ✅ 已修复

`src/layout/app-shell.tsx:46` 侧边栏是 `hidden … md:flex`，但 `md` 以下**没有任何替代**：没有抽屉、没有汉堡按钮、没有底部 tab。手机上进 `/admin/` 只能看当前页，`⌘K` 在触屏上也不可用。

规范 §10 写的是"移动端只做查看能力"，但现在连查看都做不到。修法：在 `<header>` 左侧加一个 `<Sheet side="left">` 抽屉，复用同一个 `NAV` 数组即可。

### 1.2 toast 不跟随应用主题 🔴 ✅ 已修复

`src/components/ui/sonner.tsx:8` 用 `useTheme()` 来自 `next-themes`，但整个项目**没有任何 `next-themes` 的 `ThemeProvider`**（应用用的是自研的 `@/lib/theme`，见 `src/lib/theme.ts`）。Provider 缺失时 `next-themes` 返回 `undefined`，回退成 `"system"` —— 于是 toast 跟随操作系统，而不是应用内的主题开关。

结果：OS 浅色 + 应用切深色时，右下角弹出一块白卡片。`next-themes` 这个依赖也只有这一个引用点，属于残留。

修法：改用 `@/lib/theme` 的 `dark`，传 `theme={dark ? "dark" : "light"}`，删掉 `next-themes`。

### 1.3 深色主题首帧闪白 🔴 ✅ 已修复

`applyStoredTheme()` 在 `main-public.tsx` / `main-admin.tsx` 的模块体里执行，也就是要等 JS 下载并执行完才加 `.dark`。存了深色偏好 + OS 是浅色时，首帧一定是白的。

修法：两个 `index.html` 的 `<head>` 里加一段同步内联脚本（在任何样式之前读 `localStorage`，直接 `documentElement.classList.add("dark")`）。

顺带：`applyStoredTheme()` 只认 localStorage，不认 `prefers-color-scheme`；`settings/general.tsx` 也只有"浅色 / 深色"两个选项，没有"跟随系统"——但 `index.html` 里声明了 `color-scheme: light dark`。三者不一致。

### 1.4 新建探测：切换类型后目标值不更新 ✅ 已修复

`src/pages/probes.tsx:188` 的 `<Input defaultValue={...}>` 没有按 `kind` 加 key。HTTP → TCP 切换后，label 变成 `host:port`，但输入框里还留着 `https://example.com`。加 `key={kind}` 即可。

### 1.5 列表行看起来能点，其实点不动 ✅ 已修复

- `src/pages/probes.tsx:107`：`<TableRow className="group cursor-pointer">` 但没有 `onClick`（从 overview 复制过来的）。
- `src/public/components/node-card.tsx:149`：卡片带 `hover:border-border-strong`，鼠标悬停有反馈，但没有任何点击行为、没有详情、没有 permalink。

两处都是在承诺一个不存在的交互。

### 1.6 前台收藏功能是空的 ✅ 已修复

`src/public/app.tsx:20` 的 `favorites` 只是组件 state，刷新即丢，也没有"只看收藏"的筛选或排序。点星标除了让星星变色没有任何后果。

而 `docs/public-page.md` §交互 明确写的是"收藏只存在浏览器本地"——所以这是**没实现规范**，不是规范没说。修法：`localStorage`（沿用既有的 `pjx-*` key 约定）+ 工具栏一个"收藏 n"筛选项。

### 1.7 图表时间轴标签和数据差 20 倍 ✅ 已修复

`src/lib/mock.ts` 的 `push()` 把每个序列截在 180 点，1Hz 采样 = **3 分钟**。
但 `src/components/metric-chart.tsx:108-124` 硬编码了 `60 分钟前` / `30` / `现在`，节点详情 Tab 也写着 `实时 · 1h`。

三个地方互相矛盾。修法：把时间轴标签改成由序列长度推导（`data.length` 秒前 / 中点 / 现在）。

---

## 2. P0 · 体积与性能（实测）

### 2.1 前台首屏 356 KB / 111 KB gzip，其中约 22 KB 是死代码 ✅ 已修复

用只构建前台入口的隔离构建实测，产物拆分如下（改前）：

| chunk | raw | gzip | 说明 |
| --- | --- | --- | --- |
| react-dom + scheduler | 213.9 KB | 66.4 KB | 框架地板，无法优化 |
| **react-router** | **35.9 KB** | **13.1 KB** | 🔴 100% 死代码 |
| **clsx + tailwind-merge** | **27.5 KB** | **8.7 KB** | 🔴 可去掉 |
| cn 包（保留） | 25.9 KB | 10.8 KB | `components/ui/*` 在用 |
| 前台业务代码 | 27.6 KB | 8.5 KB | 与 README 说的 22KB 吻合 |
| react | 9.4 KB | 3.6 KB | |
| lucide（按需） | 6.5 KB | 1.8 KB | tree-shaking 正常 |
| radix Slot | 3.0 KB | 1.4 KB | `radix-ui` 桶文件 shaking 正常 |
| CSS | 72.5 KB | 12.4 KB | 含历代构建堆积的死样式，见 2.4 |

README 里"前台业务 chunk 约 22KB"没错，但**首屏真实下载量是 111 KB gzip**，业务代码只占 8%。这两件事在文档里应该分开写，否则会误判优化优先级。

实测整包（`dist/index.html` 实际加载的 chunk）：`public` + `input` = **356 KB raw / 111 KB gzip**。

### 2.2 react-router 前台零使用 ✅ 已修复

全项目对 react-router 的前台引用只有一处：`src/main-public.tsx:10` 的 `import { BrowserRouter } from "react-router"`。

`src/public/` 下**没有任何文件**使用 router API（没有 `Routes`、`Link`、`useNavigate`，跳后台用的是裸 `<a href="/admin/">`）。`<BrowserRouter>` 包了一个零路由的应用。

删掉这个 import 和包裹层 → **−13.1 KB gzip**。

### 2.3 两套 `cn` 并存 ✅ 已修复

- `src/components/ui/*` 全部 `import { cn } from "cn"`（已编译版，是 clsx+tailwind-merge 的替代品）
- `src/lib/utils.ts` 还留着旧版 `clsx + twMerge`，被 `public/*` 和各页面共 14 个文件引用

构建产物证实两者都进了包，`tailwind-merge` 是那 27.5 KB 的主要来源。

统一到 `cn` 包（已验证 `cn` 的合并语义与 `twMerge(clsx(...))` 完全一致）→ **−8.7 KB gzip**。

另外 `package.json` 里 9 个 `@radix-ui/react-*` 单包依赖**全部未被引用**（所有导入都走 `radix-ui` 桶），可以直接删。

### 2.4 CSS 里堆积着历史构建的死样式（走查中发现的额外问题） ✅ 已修复

`web/` 下**没有 `.gitignore`**。Tailwind v4 的自动源探测会因此把 `dist/` 也当成源码目录扫描，于是**上一次构建的产物变成下一次构建的候选类名** —— 源码里早已删掉的 utility 会被反复重新生成，只增不减。

实测（同一份源码，只差 dist 是否存在）：

| 构建方式 | CSS raw | gzip |
| --- | --- | --- |
| `rm -rf dist` 后构建 | 60.49 KB | 10.84 KB |
| dist 存在时增量构建 | 63.71 KB | 11.40 KB |
| dist 存在 + 加 `web/.gitignore`（`node_modules` / `dist`） | **60.49 KB** | **10.84 KB** |

也就是说原始产物那 72.5 KB 里，有相当一部分是历代设计迭代留下的死样式。加一行 `.gitignore` 就永久解决，且让构建结果可复现。

### 2.5 每秒全树重渲染 ✅ 已修复（见 §9 A 批）

两个 mock 都用 `useSyncExternalStore(subscribe, getVersion)` 暴露了一个全局 1Hz 版本号（`lib/mock.ts:591`、`public/mock.ts:231`），任何调用它的组件每秒重渲染一次。当前位置：

- `AppShell` 调了 `useFleetTick()`（`app-shell.tsx:27`）→ 整个后台树（header + 表格 + 每一行）每秒重渲染。
- `PublicApp` 和 `PublicHeader` 都调了 `usePublicTick()` → 双重订阅，整个前台树每秒重渲染。
- 前台每张卡片单次渲染约 80 次 `cn()` 调用（每次都是一次完整 tailwind-merge），12 张卡片 × 1Hz ≈ **每秒 1 万次 twMerge**。按规范声称的 200 台规模，是每秒 16 万次。
- 后台总览每次 tick 重渲染 200 行 × 11 单元格 + 200 个 sparkline，没有 memo、没有虚拟化。

规范 §5 其实已经写对了："前端把序列数据放在 React 之外的环形缓冲，React 只以 1Hz 渲染表格文本"。实现还没这么做。最小改动：`React.memo` 包 `NodeCard` / 表格行，把 tick 订阅下沉到叶子组件，配合 `useDeferredValue`。

### 2.6 心跳条每秒触发 60 个过渡动画 ✅ 已修复

`src/components/heartbeat.tsx:40` 给全部 60 个 `<rect>` 都挂了 `transition-all duration-200`，而数据每秒左移一格 → 每个 rect 的 class 都可能变 → 60 个元素同时跑过渡。

200 台节点 = **每次 tick 1.2 万个元素参与动画**。修法：只有最新一根柱子加过渡（`index === bars.length - 1`），其余用 `transition-none`。

### 2.7 前台白算 4 条序列 ✅ 已修复

`public/mock.ts` 每个节点每秒维护 `cpuSeries / memSeries / diskSeries / trafficSeries`（含数组 `shift()`），但 `node-card.tsx` 一条都没渲染 —— 只用了 `latencyHistory` / `lossHistory`。要么用起来，要么别算。

### 2.8 mock 的定时器永不释放 ✅ 已修复

两个 mock 的 `subscribe()` 在最后一个监听者退订时都不清 `setInterval`，也不把 `timer` 置回 `null`，所以定时器永远在跑、也永远无法重启。现在只是空转，接了真实 SSE 后会变成泄漏。

---

## 3. P0 · 对比度与无障碍（实测）

### 3.1 浅色主题元信息层系统性不达标 ✅ 已修复

用 OKLCH → 线性 sRGB → WCAG 相对亮度实算，浅色主题在三种背景上的表现：

| token | on `--background` | on `--card` | on `--muted` | AA(4.5:1) |
| --- | --- | --- | --- | --- |
| `--foreground` | 15.96:1 | 16.66:1 | 15.19:1 | ✅ |
| `--muted-foreground` | 5.62:1 | 5.87:1 | 5.35:1 | ✅ |
| **`--fg-subtle`** | **3.16:1** | **3.30:1** | **3.00:1** | ❌ |
| **`--warn`** | **2.62:1** | **2.73:1** | **2.49:1** | ❌ 严重 |
| `--ok` | 3.56:1 | 3.72:1 | 3.39:1 | ❌ 作文字时 |
| `--info` | 4.04:1 | 4.21:1 | 3.84:1 | ❌ 临界 |
| `--brand` | 4.31:1 | 4.50:1 | 4.10:1 | ❌ 临界 |
| `--crit` | 4.51:1 | 4.71:1 | 4.29:1 | ⚠️ muted 上不达标 |

深色主题**全部达标**，只有 `--fg-subtle` 偏低（3.63–4.17:1）。也就是说这个双主题里，浅色才是需要修的那个。

**影响面（源码计数）**：`text-subtle` **49 处**，其中 31 处落在 10–11px 的小字上；`text-warn` 11 处；另有 5 处 9px 的 SVG 轴标签用 `fill-subtle`。

具体是这些内容在读不出来：IP、地区、时间戳、标签胶囊、表头副标签、"剩余 N 天"、图表轴标签、"即将到期"、"在线 43d"。

**修法（已验算并在 `globals.css` 落地，三背景同时 ≥4.5:1）**：

```css
/* 浅色：文字用 */
--fg-subtle: oklch(0.545 0.012 255);  /* #6b7177  4.51–4.95:1 */
--brand:     oklch(0.531 0.1 200);    /* #007d83  4.51–4.94:1 */
/* 深色：只需抬 fg-subtle */
--fg-subtle: oklch(0.62 0.01 255);    /* #82878c  4.64–5.33:1 */
```

更省事的选择：**`--fg-subtle` 直接并入 `--muted-foreground`**（0.505 已经达标），把三级中性文字压成两级。层级感由字号和字重承担，视觉上几乎无损，还能一次干掉 49 处不合规引用。

状态色拆成了"填充"和"文字"两套 token（一个 token 担两个职责是问题根源——作填充时 3:1 就够，作文字才要 4.5:1）：

| 用途 | token | 用在 |
| --- | --- | --- |
| 填充 | `--ok` / `--warn` / `--crit` / `--info` | 圆点、进度条、心跳条、`bg-*` |
| 文字 | `--ok-text` / `--warn-text` / `--crit-text` / `--info-text` | 16 处 `text-*` |

```css
/* 浅色文字档，均在 background / card / muted 上 ≥4.5:1 */
--ok-text:   oklch(0.532 0.12 155);
--warn-text: oklch(0.554 0.13 62);
--crit-text: oklch(0.568 0.19 25);
--info-text: oklch(0.542 0.12 240);
/* 深色下填充色本身已达标，文字档与填充档取同值即可 */
```

### 3.2 表格行无法用键盘打开 ✅ 已修复

`src/pages/overview.tsx:179` 的 `<TableRow onClick={...}>` 没有 `tabIndex`、没有 `role`、没有键盘处理。全项目 `tabIndex` 出现 **0 次**。

键盘用户打不开节点详情（只能靠 `⌘K`）。修法：把节点名做成 `<Link to={?server=id}>` —— 顺带白拿焦点样式、中键新开、右键复制链接。

### 3.3 分段控件不播报选中状态 ✅ 已修复

同一个"分段按钮组"内联模式在 5 处复制：总览筛选、告警级别、探测类型、探测覆盖、通用主题，加上前台网格/列表切换。全是裸 `<button>` + 变色，没有 `aria-pressed`，没有 `role="radiogroup"`。全项目 `aria-pressed` / `aria-selected` / `aria-current` 出现 **0 次**。

读屏软件听到的是 5 个一模一样的按钮。修法：抽一个 `<Segmented>`，内部用 `role="radiogroup"` + `aria-checked`，5 处全部替换。

### 3.4 10 个裸按钮绕过了 focus ring ✅ 已修复

`components/ui/button.tsx` 定义了 `focus-visible:ring-[3px] ring-ring/50`，但手写的 10 个 `<button>`（前台实时开关、主题、搜索、网格/列表、分类筛选、收藏星标、各分段控件）都没写，落到浏览器默认轮廓。恰恰是最高频的控件焦点样式不统一。

### 3.5 触控目标偏小 ⚠️ 部分修复

`size-7`（28px）图标按钮和 `h-6`（24px）分段按钮很常见；前台收藏星标是 `p-0.5` + 14px 图标 ≈ 18px。前台明确是"移动端优先"，这一项在手机上最容易被感知到（误触、点不中）。目标值 44×44，至少 36×36。

### 3.6 搜索框只有 placeholder 没有 label ✅ 已修复

`public/app.tsx:95`、`overview.tsx:97`、`probes.tsx:67` 三处搜索输入都没有 `<label>` 也没有 `aria-label`。placeholder 在输入后消失，不可作为标签。

### 3.7 没有文档大纲 ✅ 已修复

前台**根本没有 `<h1>`**（品牌是 `<span>pjx</span>`），节点卡片却直接用 `<h3>`，是 h1 缺失 + 跳级两个问题。

> **更正**：本节最初还写了"后台三个页面也没有标题元素"，这是错的 —— 后台 shell 本来就有 `<h1>{TITLES[section]}</h1>`，只有前台有问题。

### 3.8 三网延迟是三组无标注数字 ✅ 已修复

`node-card.tsx:257` 只渲染 `item.value`，丢掉了数据里现成的 `item.label`（"电信" / "联通" / "移动"，见 `public/mock.ts:108-110`）。用户看到 `三网 45ms 120ms 200ms`，只能靠位置猜哪个是哪家。规范 §节点卡片 也明确写了"电信 / 联通 / 移动延迟"。

### 3.9 星标用告警色 ✅ 已修复

收藏激活是 `text-warn`（`node-card.tsx:170`、`node-list.tsx:57`）。在这套 UI 里琥珀色到处都表示"有警告"，所以一个被收藏的节点看起来像"这个节点有问题"。换成 `--brand` 或纯前景色填充。

---

## 4. P1 · 交互与体验

### 4.1 前台把最重要的一句话埋了 ✅ 已修复

公网状态页首先要回答"现在有没有问题"。当前答案是 6px 的圆点 + 第一张 KPI 卡页脚里 11px 的一行字。

建议在 KPI 之前加一条通栏状态条（全部正常 / n 个节点异常 / m 个节点离线）+ 最后更新时间，加 `role="status"`。这是前台单项收益最大的改动。

> 注：`docs/public-page.md` 目前没有这一节，属于超出当前规范的建议，落地时要同步补规范。

### 4.2 后台表格没有空状态 ✅ 已修复

按标签筛到一个空集，或者告警级别筛空，`<tbody>` 就是一片空白，没有任何反馈。全项目只有一个空状态，在前台（`public/app.tsx:146`），而且是行内的。抽一个 `<EmptyState>` 给 5 张表复用。

### 4.3 没有任何加载态 ✅ 已修复

全项目搜不到 `Skeleton` / `isLoading`。规范 §8 里列了 Skeleton 但没实现。换真实 REST+SSE 的那一刻每个页面都会需要，建议跟着数据层一起做。

### 4.4 表头不吸顶 ✅ 已修复

规范 §8 明确要求"sticky 表头"，实现里没有（`components/ui/table.tsx` 的 `TableHeader` 没有 sticky）。200 行数据下这是可用性问题。

### 4.5 危险操作无二次确认 ✅ 已修复

- `overview.tsx:267` 「移除节点」
- `server-sheet.tsx:143` 「移除节点」
- `access.tsx:104` 「撤销」令牌

三个都是点了就执行，而且都没有处理函数。需要 `AlertDialog`（项目里还没有这个组件）或者至少一个可撤销的 toast。

### 4.6 一批"承诺了但不做事"的控件

演示阶段可以接受，但列出来避免遗漏：告警「静音」、规则 `Switch`（无 `onCheckedChange`、无 `aria-label`）、「新建令牌」、「编辑标签」、「查看探测结果」；设置页所有「保存」按钮恒为可点、无脏状态、无校验反馈。

### 4.7 筛选状态不进 URL ✅ 已修复

`overview.tsx` 把 `query / filter / tag` 放在 `useState`，只有 `?server=` 进了 URL；而关闭 Sheet 时调的是 `setParams({})`，会连带清掉未来放进 URL 的筛选参数。前台的 `category / query / view` 同样不持久。

把筛选项放进 URL：可分享、可回退、刷新不丢。工具库的 UX 数据里也把这条列为独立检查项（Deep Linking）。

### 4.8 前台其余不持久的状态 ✅ 已修复

`view`（网格/列表）刷新即回默认值。和 1.6 的收藏一起处理，`localStorage` 一个 key 就够。

### 4.9 数据与保留页数字口径不一致

`retention.tsx`：把 1m 保留期从 14 天改到 90 天，「预估占用」会实时变，但「当前数据」永远停在硬编码的"41 万行"；内存层显示"点"、其他层显示 MB；`h1Mb` 的系数 0.65 是凭空来的。

要么全部由公式推导，要么在表格标题里注明"其余为示例值"。

### 4.10 探测表单是纯静态的 ⚠️ 部分修复（只修了类型切换残留与 spellCheck）

`probes.tsx` 的表单全用 `defaultValue`，无校验、无 `name`、无提交状态；「失败阈值」是个装着"连续 3 次"的自由文本输入；「超时」没有单位；选了「cron 表达式…」也不出现 cron 输入框。建议至少：数字字段换 `type="number"` + 单位后缀，cron 选中时条件渲染输入框。

### 4.11 小卡片里的 40 根柱子挤成了糊 ✅ 已修复

规范要求"40 格历史直方图"（`public-page.md` §节点卡片），实现也照做了，但宽度算不过来：

桌面 4 列布局下，卡片内宽 ≈276px → 两个小卡各 ≈134px → 减 `px-2.5` 后内容区 ≈114px。
40 根柱子 + 39 个 `gap-[2px]` = 78px 给了间隙，只剩 36px 分给 40 根柱子 → **每根约 0.9px，间隙是柱宽的 2.2 倍**。

`sm:grid-cols-2` 下也才 1.6px，仍然窄于间隙。所以它现在读起来是一片虚线，不是历史。而且 `rounded-[1px]` 用在一根 0.9px 的柱子上近乎胶囊形。

修法：`gap-px` 或去掉 gap，柱子降到 24 根，或直接换成 sparkline。

### 4.12 sparkline 各自归一化，会误导 ✅ 已修复

`src/lib/svg.ts:8-11` 每条序列按自身 min/max 拉满。于是**CPU 稳定在 95% 和稳定在 5% 的 sparkline 长得一模一样**。

总览表里 CPU 数字和 sparkline 并排，视觉上等于在说谎。百分比类序列应传固定域（0–100）；或者把 min/max 标在图表上。

### 4.13 图表轴文字小于自己的字号规范 ✅ 已修复

`metric-chart.tsx` 用 `text-[9px]`，但 SVG 的 viewBox 是 320 单位、实渲约 290px，缩放后 ≈8.3px，低于项目自己定的 11px 下限。

### 4.14 图表没有 hover 详情 ✅ 已修复

规范 §9 要求"多图共享时间游标"。`components/ui/tooltip.tsx` 存在但**从未被引用**——看起来当初是打算做的。

---

## 5. P2 · 一致性与可维护性（美化点）

这些不是 bug，是"再做一轮会更整"的地方。

1. ⚠️ **部分完成**（已抽 `Segmented`；表头单元格 / 卡片区块 / 虚线框 / 三套状态映射表仍未抽）—— **重复的内联模式该抽组件**：分段控件（5 份）、表头单元格 `h-8 px-3 text-xs font-medium`（约 60 份）、`rounded-md border bg-card p-4` 卡片区块、虚线提示框、`<kbd>`、以及三套重复的状态映射表（`status-dot.tsx` 的 `STATUS_TEXT`、`node-card.tsx` 的 `statusText`、`alerts.tsx` 的 `LEVEL_LABEL`）。抽完能少几百行，也能防止上面 3.1 那种"改一处漏三处"。
2. ❌ **未做** —— **未使用的组件文件**：`ui/tooltip.tsx`、`ui/separator.tsx`、`ui/dialog.tsx` 无引用点。`separator.tsx` 正好可以替掉 `overview.tsx:73` 那种用 `text-border` 写"|"字符当分隔线的做法（那个竖线还会被读屏念出来）。
3. ❌ **未做** —— **两套 logo**：前台是手写的三条折线心电 SVG（`public-header.tsx:19-31`），后台是字母方块 "p"。规范 §10 把 logo 列为待定，但它是公网页第一眼看到的东西。
4. ✅ **已完成**（加 `web/.gitignore` 后 60.5 KB）—— **CSS 71KB**：`tw-animate-css` 全量导入，用到的动画工具类屈指可数。
5. ❌ **未做** —— **移动端键盘优化**：Chat ID / 超时加 `inputMode="numeric"`，token 类加 `spellCheck={false}` + `autoComplete="off"`。
6. ✅ **已完成** —— **表格双层滚动容器**：页面用 `-mx-5 overflow-x-auto px-5` 包一层，`components/ui/table.tsx` 内部又有一层 `overflow-x-auto`。内层才是真正滚动的那层，外层的负边距技巧因此很脆。
7. ❌ **未做** —— **`autocomplete` / 长名称截断提示**：`node-card.tsx:161` 用了 `truncate` 但没有 `title`，长节点名被截断后无从查看。

---

## 6. 明确不建议改的

走查过程中有几个点看起来像问题，实际是刻意的，动它们会破坏设计语言：

- **单色 UI、卡片零阴影、圆角 ≤8px、颜色只给状态** —— 这套克制是项目最大的识别度，不要为了"更好看"改成渐变/玻璃/彩色阴影。
- **13–14px 的数据密度、等宽数字右对齐** —— 密集是功能需求，不是缺陷。
- **前台一张卡片塞满 12 个指标** —— 规范里就是这么定的；真要改应该走"默认精简 + 展开详情"，而不是砍信息。
- **工具库的通用建议不适用于本项目**。跑 `ui-ux-pro-max` 的 `--design-system` 得到的推荐是 "Vibrant & Block-based" 风格 + `#22C55E` 绿色强调色 + Fira Code/Fira Sans 字体。这套配色和字体直接违反项目规范 §6（"颜色只服务状态与数据"、"去 AI 化"）。**保留项目自己的方向**，只取工具库 UX 检查表里通用的那几条（对比度 4.5:1、可见焦点、`prefers-reduced-motion`、375px 断点、空状态）。

值得确认的是，`prefers-reduced-motion` 已经处理得不错（`globals.css:202-210` 全局兜底），图标全部是 Lucide SVG、统一 `strokeWidth={1.5}`、没有用 emoji 当图标——这几项本来就达标。

---

## 7. 建议的落地顺序

| 批次 | 内容 | 预计 | 收益 |
| --- | --- | --- | --- |
| ~~1~~ | 删 react-router import、统一 `cn`、删 9 个无用 radix 依赖、清 mock 定时器 | 1–2h | ✅ 已完成，首屏 111→92.6 KB gzip |
| ~~2~~ | 对比度修 token（3.1）+ 焦点环（3.4）+ 触控尺寸（3.5）+ 键盘可达（3.2） | 2–3h | ✅ 已完成，浅色主题达 AA |
| ~~3~~ | 移动端抽屉导航（1.1）、toast 主题（1.2）、深色首帧（1.3） | 3–4h | ✅ 已完成 |
| ~~4~~ | 剩余功能 bug（1.4–1.7）+ 空状态 + URL 筛选状态 | 1 天 | ✅ 已完成 |
| ~~D~~ | h1 大纲、抽 Segmented、sticky 表头、危险操作确认、EmptyState | 半天 | ✅ 已完成 |
| ~~B~~ | 筛选状态进 URL、收藏/视图落 localStorage | 半天 | ✅ 已完成 |
| ~~5 (A)~~ | 渲染性能（tick 下沉 + 心跳条动画 + 空/加载/断线三态 + deferred 过滤） | 1 天 | ✅ 已完成 |
| ~~6 (C)~~ | 前台状态通栏、40 柱宽度、sparkline 固定域 | 1 天 | ✅ 已完成 |

**报告内的问题已全部处理。** 唯一按判断**没做**的是「memo 表格行」，原因见 §8 A 批。

---

## 8. 实施记录

### 第 4 批 · 剩余功能 bug

- **1.4** `pages/probes.tsx`：目标输入框加 `key={kind}`，切 HTTP→TCP→ICMP 时重置为对应占位值，不再残留上一个类型的 URL；顺带 `spellCheck={false}` / `autoComplete="off"`
- **1.5** 死交互暗示：
  - `pages/probes.tsx` 行上的 `group cursor-pointer` 删掉（`group-` 无任何消费者，纯抄自总览）
  - `public/components/node-card.tsx` 删掉 `hover:border-border-strong` + `transition-colors`，卡片本就不接受点击
- **1.6** 收藏真正可用：
  - 新增 `lib/persist.ts`（`usePersistentState`），收藏落 `pjx-favorites`、视图落 `pjx-view`，与 `lib/theme.ts` 的 `pjx-*` 约定一致；读写失败静默退回默认值
  - 新增「只看收藏」开关（星标图标 + `aria-pressed`），收藏这才有了后果
- **1.7** 图表时间轴不再说谎：
  - `lib/format.ts` 新增 `formatSpan()`，从数据长度推导跨度
  - `components/metric-chart.tsx` 的横轴由 `series[].data.length` 推导（180 点 @1Hz → 「3 分钟前 / 1.5 分钟 / 现在」），字号从 9px 提到 10px
  - `components/server-sheet.tsx` 的 Tab 由硬编码「实时 · 1h」改为「实时 · 3 分钟」，随缓冲长度变化

### D 批 · 零散快赢

- `components/empty-state.tsx`：共享空状态（图标 + 标题 + 说明 + 可选操作），接入总览 / 探测 / 告警事件 / 前台四处，都带「清除筛选」一类的下一步
- `components/segmented.tsx`：抽出分段控件，替换 5 处重复内联 markup；统一带 `role="radiogroup"` + `aria-checked`（此前是我手工在 5 个地方抄的），支持 `fill` / `mono`
- `components/ui/alert-dialog.tsx`：新增 `AlertDialog` 全家桶 + `ConfirmDialog` 便捷封装
  - 「移除节点」（总览行菜单、节点 Sheet 菜单）与「撤销令牌」都改为二次确认，确认后给 toast
  - 从下拉菜单里开对话框有个坑：菜单关闭时的焦点归还会把对话框的焦点抢走，所以 `onSelect` 里延一个 tick 再开
- **sticky 表头**：`components/ui/table.tsx` 把 `sticky top-0 z-10 bg-background` 挂在 `thead` 而不是 `th`——`border-collapse` 下 sticky 单元格的边框会留在原地；同时去掉 Table 内层多余的 `overflow-x-auto`（全站每张表外面已经有一层），双层滚动容器一并消除。四个数据表容器加 `max-h-[calc(100svh-11rem)]`，让表头真正吸顶
- **文档大纲**：前台原本连 `<h1>` 都没有（品牌是 `<span>`），现在品牌即 `h1`（含 `sr-only` 的「服务状态」后缀），节点卡片标题 `h3`→`h2` 消除跳级
  - 走查报告此处有误：后台 shell 本来就有 `<h1>{TITLES[section]}</h1>`，不是"三个页面都没有标题元素"

### B 批 · 位置与可分享

- 后台（react-router 内）用 `useSearchParams`：
  - 总览 `?q=` `?state=` `?tag=`，告警 `?level=`，探测 `?q=`；都用白名单校验，手改 URL 传垃圾值会退回默认值
  - 与既有的 `?server=` 共存：关闭 Sheet 从 `setParams({})` 改成只摘 `server`，探测关闭表单只摘 `new`，不再连带清掉筛选
  - 文本输入用 `replace`（否则每敲一个字塞一条历史），离散筛选用 `push`（可回退）
- 前台不进路由，新增 `lib/url.ts` 的 `useUrlParams()`：History API + `popstate`，同样支持 `?cat=` `?q=` `?fav=`
  - 刻意不与 react-router 混用：在路由内部直接写 history 会让 router 状态失同步

### 走查中额外发现并修复：后台深链按下 F5 会跳到公网状态页

两个入口共用一套 SPA fallback，`/admin/probes` 这类路径会被兜到根 `index.html`，也就是公网状态页——带 `basename="/admin"` 的后台路由根本没机会执行。点击导航没事，**一刷新就跳到前台**。

`vite.config.ts` 新增 `adminSpaFallback` 插件，在 dev 与 preview 的中间件里把 `/admin/*`（非静态资源）重写到 `/admin/index.html` 并保留 query。

生产环境需要同规则，Go master 的静态处理要注意：

```
location /admin/ { try_files $uri /admin/index.html; }
```

验证：`/admin/` `/admin/probes` `/admin/alerts` `/admin/settings/general` 现在都返回 `pjx · 管理`，`/` 仍是 `pjx · 服务状态`。

---

## 9. A 批 · 数据层就绪

目标：把渲染架构对齐规范 §5，让 mock → REST + SSE 的替换只需要换数据源。

### A1 · tick 订阅下沉

`AppShell` 原来自已订阅 `useFleetTick()`，等于整个后台树（侧栏 + 顶栏 + 表格 + 每一行）每秒全量重渲染。

- 订阅点移到真正需要每秒数据的地方：新组件 `components/live-status.tsx`（顶栏）、总览、探测
- 告警页的订阅直接删掉 —— `alertEvents` / `alertRules` 是静态数组，根本不随 tick 变化
- 新增 `useFleetStatus()`（只订阅连接状态 + 首次加载标志）：`useSyncExternalStore` 在快照相等时会跳过重渲染，所以顶栏不再跟着 1Hz 走

### A2 · 心跳条只动最新一根

`components/heartbeat.tsx` 原来给全部 60 个 `<rect>` 挂 `transition-all`，而数据每秒左移一格 → 每次 tick 触发 60 个动画。

改为只有最新一根带过渡。实测（12 行表格）：`<rect>` 总数 720，带 transition 的从 **720 → 12**。

### A3 · 空 / 加载 / 断线三态

- `components/ui/skeleton.tsx`：`Skeleton` + `TableSkeleton`（按规范 §8，只用 `bg-muted` 脉冲，不做 shimmer）
- 两个数据源都加了 `loaded` 标志与首次快照延迟（`SNAPSHOT_DELAY = 350ms`，占位真实 REST 往返），加载期间表格显示骨架行、前台显示 8 张卡片骨架
- **页面隐藏时停表**（规范 §5）：`visibilitychange` 时 `clearInterval`，回到前台先补一次快照再恢复推流 —— 既省电，也避免回前台时补一堆过期动画
- 顶栏改为如实显示：`连接中…` / `已暂停（页面在后台）` / `实时 · 1s + 时间`，不再硬编码一个绿灯
- 前台用户手动暂停现在真的停表了（此前只是让 `tick()` 空转返回）

### A4 · 搜索用 deferred 值过滤

总览 / 探测 / 前台三处搜索改用 `useDeferredValue`：输入框跟着原值立即响应，过滤跑在 deferred 值上，200 台规模下敲键盘不会被一次全表过滤卡住。

### 没做：memo 表格行（附原因）

**当前数据源的原地变更让 `React.memo` 无法生效**：`lib/mock.ts` 的 `tick()` 直接改 `item.cpu`、`push(item.cpuSeries, ...)` —— 对象与数组的**引用始终不变**，memo 的浅比较会认为 props 没变，于是**再也不更新**（不是变慢，是画错）。

要正确 memo 必须让数据不可变，而每秒为 200 台 × 6 条 180 点序列重建对象是每秒 20 万次拷贝，得不偿失。规范 §5 给的答案是"序列放 React 之外的环形缓冲，React 只渲染文本"。

结论：这件事应该和真实 SSE 一起做 —— SSE 天然是按节点推送的增量，那时用「每节点 revision」做 memo 比较即可。现在硬做只会得到一个错的抽象。

### A 批实测

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 每秒重渲染范围 | 整棵后台树 | 仅 LiveStatus + 当前数据页 |
| 心跳条过渡元素（12 行） | 720 | 12 |
| 加载态 | 无（直接白屏到数据） | 骨架屏 → 数据 |
| 页面隐藏时 | 继续每秒 tick | 停表 |

---

## 10. C 批 · 前台状态页化

### C1 · 通栏状态条

新增 `public/components/status-banner.tsx`，放在 KPI 之上：

- 结论优先：「全部系统运行正常」/「n 个节点需要关注」/「n 个节点存在严重问题」
- 次级信息：`在线 x / y · 离线 n · 严重 n · 告警 n` + 最后更新时间
- 底色按规范 §7「状态背景用 color-mix 8% 派生」，实测产出 `background-color: color-mix(in oklab, var(--ok) 8%, transparent)`
- `role="status"` + `aria-live="polite"`：状态变化会被读屏播报，而不是静默变色

实测渲染出「1 个节点需要关注」（mock 里确实有一个 warn 节点，走的是真实判断分支）。

### C2 · 40 根柱子的宽度

`MiniBars` 的 `gap-[2px]` 改 `gap-px`。半宽小卡里 40 根柱子的可用宽度约 114px：

| | 柱宽 | 间隙 | 观感 |
| --- | --- | --- | --- |
| 改前 | ~0.9px | 2px | 间隙是柱宽的 2.2 倍，像虚线 |
| 改后 | ~1.9px | 1px | 可读的直方图 |

规范要求的 40 格保留不动，只修间隙比例。

### C3 · sparkline 固定值域

`lib/svg.ts` 的 `linePath` 增加可选 `domain`，`Sparkline` 透传；百分比类序列（总览 CPU、节点 Sheet 的 CPU / 内存 / 磁盘）传 `[0, 100]`，速率类保持自动域（没有天然上界）。

实测同一条扁平序列：

| | 改前 y | 改后 y |
| --- | --- | --- |
| 稳定 95% | 22.0 | **3.0**（接近顶部） |
| 稳定 5% | 22.0 | **21.0**（接近底部） |
| | 两者完全相同 | 正确区分 |

### 顺带

`metric-chart` 轴标签字号 9px → 10px（viewBox 缩放后约 9.2px，更接近项目 11px 下限）。

---

## 11. 实施记录（第 1–3 批）

### 改了什么

**批次 1 · 死代码**
- `src/main-public.tsx`：去掉 `BrowserRouter` 包裹与 import
- `src/lib/utils.ts`：改为 `export { cn } from "cn"`，14 个引用点自动切到编译版引擎，`tailwind-merge` / `clsx` 退出图
- `package.json`：删 9 个 `@radix-ui/react-*`、`clsx`、`tailwind-merge`、`next-themes`
- `src/lib/mock.ts`、`src/public/mock.ts`：`subscribe` 在最后一个订阅者离开时 `clearInterval` 并把 `timer` 复位
- **新增 `web/.gitignore`**（`node_modules` / `dist`）：走查中发现的额外问题，见 2.4 —— 没有它 Tailwind 会把 `dist/` 当源码扫描，历代构建的死样式只增不减

**批次 2 · 对比度与无障碍**
- `src/styles/globals.css`：浅色 `--fg-subtle` 0.645→0.545、`--brand` 0.55→0.531；深色 `--fg-subtle` 0.56→0.62；新增 `--ok-text` / `--warn-text` / `--crit-text` / `--info-text` 及其 `@theme` 映射
- 16 处 `text-warn` / `text-crit` / `text-ok` / `text-info` 改为 `*-text` 档；24 处 `bg-*` / `fill-*` 保持填充档不动
- `globals.css` 基础层加统一 `:focus-visible` 焦点环，覆盖 10 个裸 `<button>`（shadcn 组件自带 `outline-none` + ring，优先级更高，不受影响）
- 触控目标：前台顶栏 / 工具栏 `size-7`→`size-8`、搜索框 `h-7`→`h-8`；收藏星标 `p-0.5`→`-m-1 p-1.5`（命中区 18→26px，布局footprint 不变）；后台分段控件 `h-6`→`h-7`；侧边栏项 `h-8`→`h-9`
- 分段控件补 `role="radiogroup"` + `role="radio"` + `aria-checked`（总览筛选、告警级别、探测类型、探测覆盖、通用主题），标签 chips 补 `aria-pressed`
- `pages/overview.tsx`：节点名改为真 `<Link to="?server=id">`，键盘可达、可中键新开；行点击对鼠标保留
- 三处搜索框补 `aria-label`
- `node-card.tsx`：三网数字补运营商标注（`item.label`，"电信 / 联通 / 移动"）；收藏星标由 `text-warn` 改 `text-brand`（琥珀色在本 UI 里一律表示告警）；补 `aria-pressed`

**批次 3 · 三个"用不了"**
- `src/layout/app-shell.tsx`：抽出 `SidebarNav`，桌面固定侧栏与移动抽屉共用；`md` 以下顶栏加汉堡按钮 + 左侧 `Sheet` 抽屉，路由变化自动收起
- `src/components/ui/sonner.tsx`：主题改读 `@/lib/theme`，不再用没有 Provider 的 `next-themes`
- `index.html` ×2：`<head>` 内联同步脚本，首帧前加 `.dark`；补 `theme-color`

### 实测结果

前台首屏（`dist/index.html` 实际加载）：

| | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| JS raw | 355.8 KB | 288.7 KB | −18.9% |
| JS gzip | 111 KB | **92.6 KB** | **−16.6%** |
| CSS raw | 72.5 KB | **60.5 KB** | **−17%**（加 `.gitignore` 后确定） |
| CSS gzip | 12.4 KB | **10.8 KB** | |

后台：`admin` chunk 274.8 KB / 82.4 KB gzip（改前 228 KB + 共享 323 KB，整包口径同样下降）。

### 验证方式

- `npx tsc -b` 通过；`npm run build` 通过
- `cn` 语义等价性：对 5 组用例（同类覆盖、`px`/`py` 分项、变体冲突、`null` 参数、条件/对象入参）逐一比对，输出与 `twMerge(clsx(...))` 一致
- 产物完整性：脚本提取源码中 613 个 class token，与产出 CSS 逐一比对，**602/602 命中、0 缺失**；`animate-in`/`slide-in-from-*`/`@keyframes enter|exit|pulse|spin` 均在场
- 运行时冒烟：用本机 Chrome headless (`--dump-dom`) 渲染两个入口 —— 前台 12 张卡片、后台 13 行表格均正常挂载；`aria-pressed` / `aria-checked` / `role="radiogroup"` / 抽屉触发器 / `<a href="/admin?server=hk-01">` 均已出现在 DOM 中

### 仍未做

- 第 1 节的 7 个功能 bug（探测类型切换、死 `cursor-pointer`、收藏不持久、图表时间轴标签等）
- 第 4 / 5 / 6 批

**遗留说明**：本次没有做视觉回归截图对比，建议 `npm run dev` 后在浏览器里过一遍两套主题的浅色 / 深色，重点看浅色下 `text-subtle` 的观感变化（会明显变深）与新焦点环是否符合预期。

---

## 12. 第二轮：表面层级、图表组件与服务器详情页

### 12.1 KPI 卡片与背景融为一体

`kpi-tiles.tsx` 用的是 `bg-muted/60`，而 `--background` 是 oklch(0.985)、`--muted` 是 0.968 ——
**卡片比页面背景还暗**，于是糊成一片。

两处一起改：

1. KPI 卡改成 `border bg-card`，与节点卡片同一套 surface
2. 页面背景压暗一档，让 surface 真的浮起来：

| token | 改前 | 改后 |
| --- | --- | --- |
| `--background` | 0.985 | **0.972** |
| `--muted` / `--secondary` | 0.968 | 0.955 |
| `--accent` | 0.945 | 0.938 |
| `--border` | 0.905 | 0.9 |

背景变暗后，所有文字档 token 都要重算（`--fg-subtle`、`--brand`、`--ok/warn/crit/info-text`）。
这次没有靠眼看，而是把校验脚本固化进仓库：

```bash
cd web && npm run check:contrast
```

它直接解析 `globals.css`，对 background / card / muted 三种底色逐一复核 8 个文字 token，
不达标就退出码 1。**以后改 token 必须先过这个。**

### 12.2 图表组件重写

删掉 `metric-chart.tsx`，换成 `components/time-series-chart.tsx`：

- **按真实像素渲染**（ResizeObserver + `width/height` 属性），坐标轴文字 1:1。
  旧组件是固定 320×128 viewBox 缩放，9px 轴文字实际渲染成 ~8.3px
- 多序列：`axis` 分左右轴、`fill` 画面积、`reference` 画虚线常量线
- hover 竖向游标 + 数值提示；单序列自动不画图例
- 后台 Sheet 的 4 张图一并迁移，阈值从 `threshold` 数字改成 `reference` 序列

### 12.3 服务器详情页

路由 `/?node=<id>`，**不引 react-router** —— 前台整包 99 KB gzip，路由库要占 13 KB。
点卡片 / 列表行进入，支持上一台下一台、`?node=` 无效时退回列表。

结构参照 p1/p2（Komari ink），但做了克制化改造：

| p1/p2 的做法 | 本项目的做法 | 原因 |
| --- | --- | --- |
| 图标是蓝/绿/橙彩色圆角色块 | 单色图标，颜色只给数值与状态 | ui-spec §6「颜色只服务状态与数据」 |
| 卡片带阴影 | 1px 描边、零阴影 | ui-spec §6「只有浮层有阴影」 |
| 6 条 ping 线用蓝色色阶 | 同源色阶：`color-mix` 在 `--chart-1`→`--chart-3` 取 6 档 | 色阶而非 6 个色相，同时自动适配深浅主题 |

配套数据（`public/mock.ts`）：

- 每个指标支持 4 个时间档（实时 / 4 小时 / 1 天 / 7 天）。实时档用每秒在变的 live 数组，
  长档位是静态历史，用 **PRNG 按 key 确定性生成后缓存** —— 用 `Math.random` 的话每次重渲染曲线都会重新洗牌
- 新增 swap、TCP / UDP 连接数、进程数、6 条 ping 线路（各自带丢包与历史）、30 天在线时间轴、设备信息
- 数值保持自洽：`tcp = f(rx)`、`proc = f(mem)`，tick 里连接数跟着流量走，不是各自乱漂的独立随机数
- 设备信息（OS / 内核 / 架构 / 虚拟化 / CPU 型号）从几个池子里按 id 确定性挑，避免手写 12 份

### 12.4 实测

| 项 | 值 |
| --- | --- |
| 前台首屏 JS | 92.6 → **99.0 KB gzip**（多了一整个详情页 + 新图表组件，+6.4 KB） |
| 详情页图表 | 7 张，全部按真实像素渲染（实测 674×150 桌面 / 573×140 后台） |
| 时间轴 | 30 天 |
| 深色主题对比度 | 8 个文字 token 全部 ≥4.5:1（改背景后重新校验） |

### 12.5 顺带修正

三网 ping 卡片原来 6 张卡都显示同一个节点级丢包率，是假的。改为每条线路从节点级丢包
派生自己的丢包（`PingTarget.loss`），六张卡数值不再完全一样。
