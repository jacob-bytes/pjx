import { expect, test } from "@playwright/test"
import {
  makeDeterministic,
  useDarkTheme,
  waitForData,
} from "./fixtures/deterministic"

/**
 * 视觉回归。四张基线覆盖两个入口、两套主题、列表与详情两种形态。
 *
 * 快照存在 tests/visual/snapshots/，首次运行用 --update-snapshots 生成基线。
 */

test.describe("公网状态页", () => {
  test("节点列表 · 浅色", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/")
    await waitForData(page)
    await expect(page).toHaveScreenshot("public-list-light.png", {
      fullPage: true,
    })
  })

  test("服务器详情 · 浅色", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/?node=dmit-hk-01")
    await waitForData(page)
    await expect(page).toHaveScreenshot("detail-light.png", {
      fullPage: true,
    })
  })

  test("服务器详情 · 深色", async ({ page }) => {
    await useDarkTheme(page)
    await makeDeterministic(page)
    await page.goto("/?node=dmit-hk-01")
    await waitForData(page)
    await expect(page).toHaveScreenshot("detail-dark.png", {
      fullPage: true,
    })
  })

  test("服务器详情 · 移动端", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await makeDeterministic(page)
    await page.goto("/?node=dmit-hk-01")
    await waitForData(page)
    await expect(page).toHaveScreenshot("detail-mobile.png", {
      fullPage: true,
    })
  })
})

test.describe("后台", () => {
  test("总览 · 浅色", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)
    await expect(page).toHaveScreenshot("admin-overview-light.png", {
      fullPage: true,
    })
  })

  test("节点详情 Sheet · 浅色", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/?server=hk-01")
    await waitForData(page)
    await expect(page).toHaveScreenshot("admin-sheet-light.png")
  })
})

/*
  元素级快照。
  整页快照的 maxDiffPixels 是 3500（为了盖住列表页的亚像素噪声底），
  这个量级会把"给几个按钮加个容器边框"（几百像素）这类改动直接放过去。
  元素小、噪声低，阈值就能收到个位数 —— 这一组才是抓小改动的那张网。
*/
const TIGHT = { maxDiffPixels: 20, threshold: 0.2 } as const

test.describe("元素级快照", () => {
  test("公网页 · 工具栏", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/")
    await waitForData(page)
    await expect(page.getByTestId("toolbar")).toHaveScreenshot(
      "el-toolbar.png",
      TIGHT,
    )
  })

  test("公网页 · KPI 排", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/")
    await waitForData(page)
    await expect(page.getByTestId("kpi-row")).toHaveScreenshot(
      "el-kpi-row.png",
      TIGHT,
    )
  })

  test("公网页 · 首张节点卡", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/")
    await waitForData(page)
    await expect(page.getByTestId("node-card").first()).toHaveScreenshot(
      "el-node-card.png",
      TIGHT,
    )
  })

  test("公网页 · 页脚", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/")
    await waitForData(page)
    await expect(page.getByTestId("site-footer")).toHaveScreenshot(
      "el-footer.png",
      TIGHT,
    )
  })

  test("详情页 · 时间轴", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/?node=dmit-hk-01")
    await waitForData(page)
    await expect(page.getByTestId("uptime-timeline")).toHaveScreenshot(
      "el-uptime.png",
      TIGHT,
    )
  })

  test("详情页 · CPU 图表", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/?node=dmit-hk-01")
    await waitForData(page)
    await expect(
      page.locator('svg[aria-label="CPU 使用率与负载"]'),
    ).toHaveScreenshot("el-chart-cpu.png", TIGHT)
  })
})
