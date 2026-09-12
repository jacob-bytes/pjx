import type { Page } from "@playwright/test"

/** 固定时钟：2026-01-01 12:00:00 UTC。所有 Date / 定时器都从这里出发。 */
export const FIXED_TIME = new Date("2026-01-01T12:00:00Z")

/**
 * 把页面变成可复现的。
 *
 * 两件必须做的事，缺一个快照就永远对不上：
 *
 * 1. **定住 Math.random** —— `public/mock.ts` 的 `seedSeries` / `makeUptimeDays` /
 *    每次 tick 的漂移全靠它，否则每次加载出来的曲线、节点状态都不一样。
 *    这里换成一个线性同余 PRNG，种子固定。
 *
 * 2. **定住时钟** —— 头部时钟、`lastReport`、30 天时间轴的日期标签都取当前时间，
 *    跨天跑测试就会失败。用 Playwright 的 clock API 冻结。
 *
 * 注意 clock.install 之后 setInterval 不会自己推进，所以 tick 不会跑 ——
 * 这正是我们要的：截图停在"首次快照到达后"的稳定状态。
 */
export async function makeDeterministic(page: Page) {
  await page.addInitScript(() => {
    let seed = 0x2f6e2b1
    Math.random = () => {
      // 数值来自 Numerical Recipes 的 LCG，够用且不引依赖
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }
  })

  // 只冻结，不推进 —— 页面还没加载，这时推进没有意义：
  // mock 的首次快照定时器是在 mount 时才创建的。
  await page.clock.install({ time: FIXED_TIME })
}

/** 打开深色主题：走应用自己的 localStorage key，与 lib/theme.ts 一致 */
export async function useDarkTheme(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("pjx-theme", "dark")
  })
}

/**
 * 等页面"画完"再截图。
 *
 * 两个必须等的：
 *  1. 骨架屏消失（数据落定）
 *  2. **自托管字体加载完成** —— IBM Plex Sans / JetBrains Mono 是异步的 woff2，
 *     不等的话截到哪一帧不确定，全页每个字形边缘都会有零点几像素的差异。
 *     这个坑踩过：6 张里 5 张失败，diff 是散落在所有数字上的小点而不是结构变化。
 */
export async function waitForData(page: Page) {
  // 先推进虚拟时钟让"SNAPSHOT_DELAY=350ms 的首次快照"到点（但别跑满 1000ms
  // 的 tick 间隔，否则数据会随 tick 漂移）。
  // 这一步必须在 goto 之后 —— 定时器是 mount 时才注册的。
  // 踩过的坑：把 runFor 放在 goto 之前，定时器可能永远不触发，
  // 表现为偶发失败（同一套代码这次过下次不过）。
  await page.clock.runFor(500)
  await page.waitForSelector('[data-slot="skeleton"]', {
    state: "detached",
    timeout: 10_000,
  })
  await page.evaluate(() => document.fonts.ready)
  // 字体就位后再等两帧，避免过渡动画的中间态
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}
