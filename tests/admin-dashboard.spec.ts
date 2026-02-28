/**
 * ADMIN 角色仪表盘 E2E 测试
 * 步骤：登录 → 仪表盘内容检查 → 滚动 → 侧边栏检查 → 输出结果报告
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-dashboard-screenshots");

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

test.describe("ADMIN 仪表盘", () => {
  test.beforeAll(async () => {
    await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  test("登录并检查仪表盘与侧边栏", async ({ page }) => {
    const results: CheckResult[] = [];

    // 1. 导航到登录页
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-login.png"), fullPage: true });
    results.push({ name: "登录页加载", ok: true, detail: "已截图 01-login.png" });

    // 2. 输入并登录
    await page.getByPlaceholder(/用户名|Username/).fill("admin");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForURL(/\/(\?.*)?$/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const afterLoginUrl = page.url();
    const loginOk = afterLoginUrl.replace(/\?.*$/, "").endsWith("/") && !afterLoginUrl.includes("/login");
    results.push({ name: "登录跳转仪表盘", ok: loginOk, detail: afterLoginUrl });
    if (!loginOk) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-after-login-fail.png"), fullPage: true });
      writeReport(results);
      expect(loginOk, "登录后应跳转到首页").toBe(true);
      return;
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-dashboard-top.png"), fullPage: false });
    results.push({ name: "仪表盘首屏", ok: true, detail: "已截图 02-dashboard-top.png" });

    // 3. 检查仪表盘区块（标题或卡片存在即可）
    const dashboardChecks: { key: string; text: string }[] = [
      { key: "达标率概览", text: "达标率总览" },
      { key: "今日检查项横幅", text: "今日检查项" },
      { key: "各年级今日检查完成度", text: "各年级今日检查完成度" },
      { key: "检查进度卡", text: "检查进度" },
      { key: "等级分布卡", text: "周等级分布" },
      { key: "本周达标率卡", text: "本周达标率" },
      { key: "流动红旗/连续标杆", text: "连续标杆班级" },
      { key: "显著进步", text: "显著进步班级" },
      { key: "连续预警", text: "连续预警班级" },
      { key: "检查项薄弱度图", text: "检查项薄弱度" },
      { key: "智能分析卡片", text: "智能分析" },
      { key: "近7日趋势图", text: "近7日达标率趋势" },
    ];

    for (const { key, text } of dashboardChecks) {
      const loc = page.getByText(text, { exact: false }).first();
      const ok = (await loc.count()) > 0;
      results.push({ name: key, ok, detail: ok ? "可见" : "未找到文案" });
    }

    // 4. 向下滚动并截图
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-dashboard-scroll1.png"), fullPage: false });

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-dashboard-scroll2.png"), fullPage: false });

    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-dashboard-bottom.png"), fullPage: false });
    results.push({ name: "页面滚动与截图", ok: true, detail: "03/04/05 已保存" });

    // 5. 侧边栏菜单项（ADMIN 应有）
    const expectedNav = [
      "仪表盘",
      "检查计划",
      "检查项管理",
      "日常检查",
      "周评",
      "成绩报表",
      "班级管理",
      "用户管理",
      "AI 面板",
      "服务器监控",
    ];
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const missingNav: string[] = [];
    for (const label of expectedNav) {
      const has = await sidebar.getByText(label, { exact: false }).count() > 0;
      if (!has) missingNav.push(label);
    }
    results.push({
      name: "侧边栏菜单完整",
      ok: missingNav.length === 0,
      detail: missingNav.length ? `缺失: ${missingNav.join(", ")}` : "全部存在",
    });

    // 6. 简单 UI 溢出检查：主内容区是否明显错位
    const main = page.locator("main");
    const mainBox = await main.boundingBox();
    const overflowX = mainBox ? await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      return (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth;
    }, "main") : false;
    results.push({ name: "主内容区无横向溢出", ok: !overflowX, detail: overflowX ? "存在横向滚动" : "正常" });

    writeReport(results);
    const failed = results.filter((r) => !r.ok);
    expect(failed.length, `以下检查未通过: ${failed.map((f) => f.name).join(", ")}`).toBe(0);
  });
});

function writeReport(results: CheckResult[]) {
  const lines = [
    "# ADMIN 仪表盘测试结果",
    "",
    "## 检查项",
    ...results.map((r) => `- ${r.ok ? "✅" : "❌"} **${r.name}**${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    "## 汇总",
    `- 通过: ${results.filter((r) => r.ok).length}`,
    `- 失败: ${results.filter((r) => !r.ok).length}`,
  ];
  const reportPath = path.join(SCREENSHOT_DIR, "report.md");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log("\n报告已写入:", reportPath);
}
