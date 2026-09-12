# pjx

自建服务器探针：Go 全栈 + 公网状态页 + 管理后台。

前台视觉参照 Komari 的 ink 主题（MIT），只借鉴设计语言，React 实现不从上游搬代码。
参照资料与 token 摘录见 docs/reference/README.md。

## 当前状态

- 前台：公网状态页 + 节点详情页（可直链），单入口不引前端路由
- 后台：管理端（总览 / 探测 / 告警 / 设置），react-router basename 为 /admin
- 前端已完成多轮走查与美化，建立了视觉回归与对比度门禁：
  - docs/frontend-audit.md 走查报告
  - docs/polish-round3.md 第三轮
  - docs/polish-round4.md 第四至三十八轮（对齐 ink）
- 技术栈：Vite 6 + React 19 + TypeScript + Tailwind v4 + shadcn/ui +
  Inter Variable + Phosphor Icons
- 前端目前是静态 mock 数据，1s 实时模拟；master / agent（Go）尚未开始

## 技术决策（已定）

| 项 | 结论 |
| --- | --- |
| 语言 | Go 全栈，internal/protocol 共享线协议类型 |
| Agent 到 Master | WebSocket + JSON-RPC 2.0 + JSON payload；心跳、退避重连、seq 去重 |
| Master 到 Web | REST（历史 / CRUD）+ 单条 SSE（每秒一条 tick，与节点数无关） |
| 存储 | 单 master 单机，SQLite WAL；分层：内存 1s、Raw 15s（可选）、1m、1h |
| 保留策略 | Web 后台可配，默认 raw 关闭 / 1m 14 天 / 1h 365 天 |
| 任务 | 只有探活（HTTP / TCP / ICMP + 调度），无 exec、无 Job、无终端 |
| 通知 | v1 实装 Telegram（状态机 + 冷却 + 429 退避），Notifier 接口预留 Webhook |
| 规模 | 不超过 200 台，单机，不做 HA、不引 broker / MQ |
| 前后台 | 两个入口：/ 公网状态页，/admin/ 管理端 |

## 前端架构约定

- 两个 Vite 入口（index.html 与 admin/index.html），两个独立 bundle；
  公网页不打包后台页面代码
- 公网页无 react-router：筛选走 History API（可分享、可回退）；
  后台在 react-router 内使用 useSearchParams，两套不混用
- /admin/* 深链兜底：Vite 插件 pjx:admin-spa-fallback 把请求改写到
  /admin/index.html（dev 与 preview 都生效）；Go master 静态服务必须复刻同一规则
- 图表是自研 SVG 引擎（src/components/time-series-chart.tsx），不引 ECharts / Recharts
- 模态框用原生 dialog（src/components/modal.tsx），公网页不打包 Radix Dialog
- 公网页不打包 cmdk：排序菜单与节点选择器为轻量自实现
- 设计 token 唯一来源：src/styles/globals.css
- 订阅边界：后台 AppShell 不订阅 1Hz tick；LiveStatus 与数据页各自订阅；
  页面隐藏停表，回前台补一次快照
- 公网页筛选进 URL（cat / q / fav / sort / node），本地偏好进 localStorage（pjx- 前缀）
- 色觉友好模式（CVD）：状态指示颜色 + 形状双通道；触屏命中区走 touch 变体

## 目录

    .
    ├── README.md
    ├── docs/
    │   ├── frontend-audit.md    # 前端走查报告
    │   ├── polish-round3.md     # 第三轮记录
    │   ├── polish-round4.md     # 第四至三十八轮记录（对齐 ink）
    │   ├── reference/           # 上游 ink 预览图与 token 摘录
    │   ├── ui-spec.md           # 设计系统规范
    │   └── public-page.md       # 公网页规范
    └── web/
        ├── index.html           # 前台入口
        ├── admin/index.html     # 后台入口
        ├── vite.config.ts       # 多入口 + /admin 深链兜底
        ├── src/
        │   ├── public/          # 公网状态页与节点详情页
        │   ├── pages/           # 后台页面
        │   ├── layout/          # 后台 AppShell（含移动端导航抽屉）
        │   ├── components/      # 共享组件；ui 为 shadcn 生成
        │   ├── lib/             # mock、url、persist、a11y、format、svg、theme
        │   └── styles/          # globals.css（设计 token 唯一来源）
        ├── scripts/             # check-contrast.py
        ├── tests/visual/        # Playwright 视觉回归与基线
        └── .githooks/           # pre-commit 门禁

## 运行

    cd web
    npm install
    npm run dev

- 前台：http://localhost:5273/
- 后台：http://localhost:5273/admin/
- 构建：npm run build（产物含 dist/index.html 与 dist/admin/index.html）

## 校验

- npm run check:types    TypeScript 编译检查
- npm run check:contrast 对比度检查（python3 脚本，两套主题文字 token）
- npm run test:visual    Playwright 视觉回归（系统 Chrome，8 张基线）
- npm run verify         三项串行；web/ 有改动时 pre-commit 会自动跑

### 关于 npm 缓存

`web/.npmrc` 只保留了 `fund=false` / `audit=false` 两条项目级偏好，
**没有**指定缓存目录 —— 用 npm 默认的 `~/.npm` 即可。

> 早期版本在这里写过 `cache=/tmp/pjx-npm-cache`，并在文档里声称
> 「~/.npm 有 root 所属文件，需要 sudo chown」。**那个诊断是错的**：
> `find ~/.npm -user root` 结果是 0 个文件，目录本来就归当前用户所有。
> 真正的原因是在受限沙箱里执行 npm 时写不了工作区外的路径 ——
> 那是执行环境的限制，不是机器权限问题，更不该让使用者去跑 sudo。

## 下一步

1. 继续走查公网页与后台（新增改动先跑 npm run verify）
2. 起 Go 骨架：internal/protocol 定义 JSON-RPC 消息，master 的 WS 接入与 SQLite 落库
3. 前端把 mock 换成真实 REST + SSE，公网页接 /api/public 脱敏接口；
   静态服务实现 /admin/* 深链兜底与 /api/public 限流

## 许可

MIT，见 `LICENSE`。

界面设计参考了 [komari-theme-ink](https://github.com/jacob-bytes/komari-theme-ink)
（MIT，Copyright (c) 2025 Tony Liu）—— 参考的是它的设计纪律
（单一强调色 + 明度阶梯、卡片与图表的信息层级）与部分排版取舍，
代码为独立实现（React + Tailwind，与被参考项目的 Vue 技术栈不同）。
完整的归属声明见 `LICENSE` 末尾。
