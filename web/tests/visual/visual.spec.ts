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
  /*
    路由回归：`/admin`（不带尾斜杠）曾经掉进 SPA fallback，返回根 index.html
    ——也就是**前台状态页**。断言一个只存在于后台的元素，比断言标题更硬。
  */
  test("`/admin` 不带尾斜杠也进后台", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin")
    await waitForData(page)
    await expect(page).toHaveTitle(/管理/)
    await expect(page.getByTestId("admin-table")).toBeVisible()
  })

  /*
    配置迁移回归。

    这一条是补一次真实事故：`usePersistentState` 原来直接返回解析后的 localStorage 值，
    所以**带着旧版本配置回到后台会白屏** —— §AS 给 Settings 加了 5 个字段，
    老用户读到的是 undefined，`settings.probesRemoved.includes(...)` 直接抛 TypeError。

    当时所有测试都用全新 context（localStorage 为空），一条都没走到这条路：
    只验了"第一次来"，没验"带着旧状态回来"。
  */
  test("后台 · 旧版本配置（缺字段）不会白屏", async ({ page }) => {
    await page.addInitScript(() => {
      // 只写 §AR 时代的字段，故意缺 nodes / probeEnabled / probesRemoved 等
      localStorage.setItem(
        "pjx-settings",
        JSON.stringify({
          siteName: "旧站点",
          timezone: "UTC",
          telegram: { enabled: true, botToken: "x", chatId: "1", topicId: "" },
          retention: {
            memoryKeep: "1h",
            rawEnabled: false,
            rawKeep: "24h",
            m1Keep: "14d",
            h1Keep: "365d",
          },
          tokens: [],
        }),
      )
    })
    await makeDeterministic(page)

    // 总览要能渲染出来（白屏时这里会超时）
    await page.goto("/admin/")
    await waitForData(page)
    await expect(page.getByTestId("admin-table")).toBeVisible()
    // 缺失字段补默认：统计条里那几项依赖 probesRemoved / ruleEnabled
    await expect(page.getByTestId("admin-stats")).toContainText("探测任务")

    // 四个设置子页也要能打开（telegram / retention 是分别归一化的）
    await page.goto("/admin/settings/notifications")
    await waitForData(page)
    await expect(page.getByLabel("启用 Telegram 通知")).toBeVisible()

    await page.goto("/admin/settings/retention")
    await waitForData(page)
    await expect(page.getByTestId("retention-snapshot")).toBeVisible()

    // 归一化后旧值要保留、而不是被默认值覆盖
    await page.goto("/admin/settings/general")
    await waitForData(page)
    await expect(page.locator("#site-name")).toHaveValue("旧站点")
  })

  /*
    侧栏折叠 + 面包屑（§AX）。
    折叠是纯本机偏好（localStorage），所以断言里要覆盖"刷新后还在"。
  */
  test("后台 · 侧栏折叠与面包屑", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)

    const sideW = () =>
      page.locator("aside").evaluate((el) => Math.round(el.getBoundingClientRect().width))

    await expect(page.locator('nav[aria-label="面包屑"]')).toHaveText("总览")
    expect(await sideW()).toBe(216)

    // 宽度是过渡出来的（dur-3 = 240ms），所以用 poll 而不是立刻断言
    await page.getByRole("button", { name: "折叠侧栏" }).click()
    await expect.poll(sideW).toBe(72)

    // 刷新后仍是折叠状态
    await page.reload()
    await waitForData(page)
    expect(await sideW()).toBe(72)

    // ⌘B 展开，并检查二级面包屑
    await page.keyboard.press("Meta+b")
    await expect.poll(sideW).toBe(216)
    await page.goto("/admin/settings/retention")
    await waitForData(page)
    await expect(page.locator('nav[aria-label="面包屑"]')).toHaveText(
      "设置/数据与保留",
    )
  })

  test("后台 · 侧栏折叠后的样子", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)
    await page.getByRole("button", { name: "折叠侧栏" }).click()
    await page.waitForTimeout(400) // 等宽度过渡（dur-3 = 240ms）
    await expect(page).toHaveScreenshot("admin-sidebar-collapsed.png", {
      fullPage: true,
    })
  })

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

  /*
    设置页此前完全没有快照保护，而 §AR 把四个子页全部重写了。
    抽两张有代表性的整页：retention 是最复杂的（表格 + 危险区块），
    access 有代码块与令牌表。
  */
  test("设置 · 数据与保留", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/settings/retention")
    await waitForData(page)
    await expect(page).toHaveScreenshot("admin-settings-retention.png", {
      fullPage: true,
    })
  })

  test("设置 · 接入与令牌", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/settings/access")
    await waitForData(page)
    await expect(page).toHaveScreenshot("admin-settings-access.png", {
      fullPage: true,
    })
  })

  /* 探测页 §AS 加了「启用」开关与行操作列，列数从 9 变 11 */
  test("探测任务", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/probes")
    await waitForData(page)
    await expect(page).toHaveScreenshot("admin-probes.png", { fullPage: true })
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

  /*
    后台的两处元素快照。
    总览表格的「数值 + 进度条」是 44 轮刚统一的表达（CPU/内存/磁盘三列），
    而统计条是 40 轮的产物 —— 两者在整页快照里都只占几百像素，
    落在 3500 的阈值之下，只有元素级这一层抓得到。
  */
  test("后台 · 统计条", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)
    await expect(page.getByTestId("admin-stats")).toHaveScreenshot(
      "el-admin-stats.png",
      TIGHT,
    )
  })

  test("后台 · 首行（指标进度条）", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)
    await expect(
      page.getByTestId("admin-table").locator("tbody tr").first(),
    ).toHaveScreenshot("el-admin-row.png", TIGHT)
  })

  /*
    脏状态的保存条：这是本轮的核心行为，而"按钮变灰/文字变色"这类差异
    只有元素级这层抓得到。先填一个字段让草稿偏离已保存值。
  */
  test("后台 · 设置保存条（有未保存改动）", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/settings/general")
    await waitForData(page)
    await page.fill("#site-name", "我的探针站")
    await expect(page.getByTestId("settings-footer")).toHaveScreenshot(
      "el-settings-footer-dirty.png",
      TIGHT,
    )
  })

  /* 标签编辑对话框：§AS 之前「编辑标签」是一个点了没反应的菜单项 */
  test("后台 · 标签编辑对话框", async ({ page }) => {
    await makeDeterministic(page)
    await page.goto("/admin/")
    await waitForData(page)
    const row = page.getByTestId("admin-table").locator("tbody tr").first()
    await row.hover()
    await row.getByRole("button", { name: "更多操作" }).click()
    await page.getByRole("menuitem", { name: "编辑标签" }).click()
    await expect(page.getByRole("dialog")).toHaveScreenshot(
      "el-node-tags-dialog.png",
      TIGHT,
    )
  })
})
