/**
 * DUTY_TEACHER（值日老师）角色 E2E 测试
 * 登录 zhanglaoshi/123456 → 首页(仪表盘) → 侧边栏 → /scoring → /duty-history → 权限边界
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "duty-teacher-screenshots");

interface PageResult {
  name: string;
  status: "通过" | "失败" | "问题";
  checks: { name: string; ok: boolean; detail?: string }[];
  bugsOrUi: string[];
  screenshot: string;
}

function ensureDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("DUTY_TEACHER 值日老师", () => {
  test.beforeAll(ensureDir);

  test("登录、首页、侧边栏、功能页与权限边界", async ({ page }) => {
    const results: PageResult[] = [];
    const sidebarItems: string[] = [];

    // ----- 1. 登录 -----
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "00-login.png"), fullPage: true });
    await page.getByPlaceholder(/用户名|Username/).fill("zhanglaoshi");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(3500);
    const afterLoginUrl = page.url();
    const stillOnLogin = afterLoginUrl.includes("/login");
    const landed = !stillOnLogin;
    if (!landed) {
      const errMsg = await page.locator("text=/用户名|密码|错误|invalid/i").first().textContent().catch(() => "") || "";
      results.push({
        name: "登录跳转",
        status: "失败",
        checks: [{ name: "跳转", ok: false, detail: `url=${afterLoginUrl} ${errMsg}` }],
        bugsOrUi: ["登录后未跳转到首页，请确认已执行 seed 且存在用户 zhanglaoshi/123456"],
        screenshot: "01-after-login.png",
      });
      try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-after-login.png"), fullPage: true }); } catch { /* page may be closed */ }
      writeReport(results, sidebarItems);
      expect(false, `登录失败 url=${afterLoginUrl}，请确认用户 zhanglaoshi/123456 存在`).toBe(true);
      return;
    }

    // ----- 2. 首页（值日老师仪表盘） -----
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-dashboard-top.png"), fullPage: false });
    const dashChecks: { name: string; ok: boolean; detail?: string }[] = [];
    const hasStat1 = (await page.getByText("累计检查天数", { exact: false }).count()) > 0 || (await page.getByText("累计", { exact: false }).count()) > 0;
    const hasStat2 = (await page.getByText("累计检查记录", { exact: false }).count()) > 0 || (await page.getByText("记录", { exact: false }).count()) > 0;
    const hasStat3 = (await page.getByText("个人达标率", { exact: false }).count()) > 0 || (await page.getByText("达标率", { exact: false }).count()) > 0;
    dashChecks.push({ name: "三统计卡(累计检查天数)", ok: hasStat1 });
    dashChecks.push({ name: "三统计卡(累计检查记录)", ok: hasStat2 });
    dashChecks.push({ name: "三统计卡(个人达标率)", ok: hasStat3 });
    const hasToday = (await page.getByText("今日检查项", { exact: false }).count()) > 0 || (await page.getByText("今日暂无检查项", { exact: false }).count()) > 0 || (await page.getByText("今日检查", { exact: false }).count()) > 0;
    dashChecks.push({ name: "今日检查项列表/区块", ok: hasToday });
    const hasAi = (await page.getByText("AI 检查建议", { exact: false }).count()) > 0 || (await page.getByText("基础统计", { exact: false }).count()) > 0 || (await page.getByText("AI", { exact: false }).count()) > 0;
    dashChecks.push({ name: "AI 检查建议区块", ok: hasAi });
    const hasActions = (await page.getByText("历史记录", { exact: false }).count()) > 0 || (await page.getByText("去检查", { exact: false }).count()) > 0 || (await page.getByText("检查", { exact: false }).count()) > 0;
    dashChecks.push({ name: "历史记录/去检查按钮", ok: hasActions });
    results.push({
      name: "首页(仪表盘)",
      status: dashChecks.every((c) => c.ok) ? "通过" : dashChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: dashChecks,
      bugsOrUi: [],
      screenshot: "01-dashboard-top.png",
    });
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-dashboard-scroll.png"), fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-dashboard-bottom.png"), fullPage: false });

    // ----- 3. 侧边栏 -----
    const expectedNav = ["日常检查", "检查记录"];
    const notExpected = ["检查计划", "检查项管理", "周评", "成绩报表", "班级管理", "用户管理", "AI 面板", "服务器监控"];
    const aside = page.locator("aside");
    for (const label of expectedNav) {
      if ((await aside.getByText(label, { exact: false }).count()) > 0) sidebarItems.push(label);
    }
    const missingExpected = expectedNav.filter((l) => !sidebarItems.includes(l));
    let hasForbidden = false;
    for (const label of notExpected) {
      if ((await aside.getByText(label, { exact: false }).count()) > 0) hasForbidden = true;
    }
    results.push({
      name: "侧边栏",
      status: missingExpected.length === 0 && !hasForbidden ? "通过" : missingExpected.length > 0 ? "失败" : "问题",
      checks: [
        { name: "应有: 日常检查、检查记录", ok: missingExpected.length === 0, detail: missingExpected.length ? `缺: ${missingExpected.join(",")}` : "都有" },
        { name: "不应有: 检查计划/班级/用户等", ok: !hasForbidden },
      ],
      bugsOrUi: hasForbidden ? ["侧边栏出现不应见的菜单"] : [],
      screenshot: "01-dashboard-top.png",
    });

    // ----- 4. /scoring -----
    await page.goto(`${BASE_URL}/scoring`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const scoringOk = (await page.getByText("日常检查", { exact: false }).count()) > 0 || (await page.getByText("今日检查", { exact: false }).count()) > 0;
    const scoringClass = (await page.getByText("选择班级", { exact: false }).count()) > 0 || (await page.getByText("年级", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-scoring.png"), fullPage: true });
    results.push({
      name: "日常检查 /scoring",
      status: scoringOk && scoringClass ? "通过" : scoringOk ? "问题" : "失败",
      checks: [
        { name: "页面加载(今日检查项)", ok: scoringOk },
        { name: "班级列表/选择", ok: scoringClass },
      ],
      bugsOrUi: [],
      screenshot: "04-scoring.png",
    });

    // ----- 5. /duty-history -----
    await page.goto(`${BASE_URL}/duty-history`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const histTitle = (await page.getByText("检查记录", { exact: false }).count()) > 0;
    const histTotalDays = (await page.getByText("累计检查天数", { exact: false }).count()) > 0 || (await page.getByText("总天数", { exact: false }).count()) > 0;
    const histStreak = (await page.getByText("连续", { exact: false }).count()) > 0;
    const histRecords = (await page.getByText("累计", { exact: false }).count()) > 0 || (await page.getByText("总记录", { exact: false }).count()) > 0;
    const histClassFilter = (await page.getByText("班级筛选", { exact: false }).count()) > 0;
    const histResultFilter = (await page.getByText("结果筛选", { exact: false }).count()) > 0;
    const histAnyFilter = (await page.getByText("筛选", { exact: false }).count()) > 0;
    const histDetailView = (await page.getByText("检查明细", { exact: false }).count()) > 0;
    const histDailyView = (await page.getByText("按日汇总", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-duty-history.png"), fullPage: true });
    const dutyHistChecks = [
      { name: "汇总(总天数/streak/记录数)", ok: histTotalDays || histStreak || histRecords },
      { name: "筛选(班级、结果)", ok: histClassFilter || histResultFilter || histAnyFilter },
      { name: "明细视图", ok: histDetailView },
      { name: "按日汇总视图", ok: histDailyView },
    ];
    results.push({
      name: "检查记录 /duty-history",
      status: histTitle && dutyHistChecks.every((c) => c.ok) ? "通过" : histTitle ? "问题" : "失败",
      checks: [{ name: "检查记录页", ok: histTitle }, ...dutyHistChecks],
      bugsOrUi: [],
      screenshot: "05-duty-history.png",
    });

    // ----- 6. 权限边界: /classes, /users, /daily-plan, /ai-panel -----
    const boundaryTests: { url: string; name: string }[] = [
      { url: "/classes", name: "班级管理" },
      { url: "/users", name: "用户管理" },
      { url: "/daily-plan", name: "检查计划" },
      { url: "/ai-panel", name: "AI 面板" },
    ];
    for (const { url, name } of boundaryTests) {
      await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      const finalUrl = page.url();
      const redirected = !finalUrl.includes(url.replace("/", "")) || finalUrl === `${BASE_URL}/` || finalUrl === BASE_URL + "/";
      const noContent = (await page.getByText("班级管理", { exact: false }).count()) === 0 && (await page.getByText("用户管理", { exact: false }).count()) === 0 && (await page.getByText("检查计划", { exact: false }).count()) === 0 && (await page.getByText("系统模组", { exact: false }).count()) === 0;
      const noPermission = (await page.getByText("无权限", { exact: false }).count()) > 0 || (await page.getByText("仅管理员", { exact: false }).count()) > 0;
      const ok = redirected || noContent || noPermission;
      results.push({
        name: `权限: ${name}`,
        status: ok ? "通过" : "失败",
        checks: [{ name: "无权限(重定向/空白/提示)", ok, detail: redirected ? "已重定向" : noPermission ? "无权限提示" : noContent ? "无内容" : "异常" }],
        bugsOrUi: ok ? [] : [`DUTY_TEACHER 不应访问 ${name}`],
        screenshot: `06-boundary-${name.replace(/\/|管理|计划|面板/g, "")}.png`,
      });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `06-boundary-${url.replace(/\//g, "")}.png`), fullPage: true });
    }

    writeReport(results, sidebarItems);
    const failed = results.filter((r) => r.status === "失败");
    expect(failed.length, `未通过: ${failed.map((f) => f.name).join(", ")}`).toBe(0);
  });
});

function writeReport(results: PageResult[], sidebarItems: string[]) {
  const lines = [
    "# DUTY_TEACHER 值日老师测试结果",
    "",
    "## 登录后跳转",
    "预期: 仪表盘(首页 /)",
    "",
    "## 仪表盘/首页功能",
    results.find((r) => r.name === "首页(仪表盘)")?.checks?.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n") ?? "",
    "",
    "## 侧边栏菜单项",
    sidebarItems.length ? sidebarItems.map((s) => `- ${s}`).join("\n") : "- （无）",
    "",
    "## 各页面状态与权限边界",
    ...results.map((r) => {
      const icon = r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️";
      return `- ${icon} **${r.name}** — ${r.status}`;
    }),
    "",
    "## 明细",
    ...results.flatMap((r) => [
      `### ${r.name}`,
      ...(r.checks?.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`) ?? []),
      ...(r.bugsOrUi?.length ? [`**问题:** ${r.bugsOrUi.join("; ")}`] : []),
      "",
    ]),
    "## 汇总",
    `- 通过: ${results.filter((r) => r.status === "通过").length}`,
    `- 问题: ${results.filter((r) => r.status === "问题").length}`,
    `- 失败: ${results.filter((r) => r.status === "失败").length}`,
  ];
  const reportPath = path.join(SCREENSHOT_DIR, "report.md");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log("\n报告已写入:", reportPath);
}
