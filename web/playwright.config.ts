import { defineConfig, devices } from "@playwright/test"

const PORT = 4310
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * 视觉回归。
 *
 * 两个关键约束：
 *  1. 用系统 Chrome（channel: "chrome"）而不是下载 Playwright 自带浏览器 —— 省掉 ~150MB
 *  2. mock 数据靠 Math.random + 当前时间生成，**天生每次加载都不同**，
 *     所以测试里必须同时定住随机数与时钟（见 tests/visual/fixtures/deterministic.ts），
 *     否则快照永远对不上。
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      /*
        阈值取舍（实测过，不是拍脑袋）：
        - threshold 0.35：单像素颜色距离。两次渲染 innerText 完全一致、字体全 loaded，
          但列表页有约 2300~2900 个像素的亚像素抗锯齿噪声（1px 级进度条/直方图落在
          不同子像素边界上）。0.2（默认）会把这些当成改动。
        - maxDiffPixels 3500：**刚好高于噪声底**。

        这意味着本套件的职责边界是「抓结构性回归」—— 布局位移、元素消失、
        间距变化、区块错位都会远超这个值。**小幅配色微调它抓不到**
        （实测改一个品牌色只有约 3200px，和噪声同量级）。
        配色不靠它守：token 层面的正确性由 `npm run check:contrast` 用数值保证，
        色板本身看 docs/reference 的截图。
      */
      threshold: 0.35,
      maxDiffPixels: 3500,
    },
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    // 必须显式绑 IPv4：vite 默认监听 localhost，在 macOS 上可能只绑 ::1，
    // 而 Playwright 探测的是 127.0.0.1，会一直等到超时
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    /*
      必须是 false。
      reuseExistingServer: true 会复用已在跑的 preview 而**跳过 npm run build** ——
      本地改了源码再跑测试，测的其实是上一次的产物，改了错的东西也显示"通过"。
      这个坑踩过：改品牌色 + 改间距两次试验都被"通过"骗了。
    */
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
