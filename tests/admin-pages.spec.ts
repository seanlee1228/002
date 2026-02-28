/**
 * ADMIN 角色各功能页面 E2E 测试
 * 依次访问 10 个页面，截图并检查关键元素，最后输出报告
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-pages-screenshots");

interface PageResult {
  page: string;
  url: string;
  status: "通过" | "失败" | "问题";
  checks: { name: string; ok: boolean; detail?: string }[];
  bugsOrUi: string[];
  screenshot: string;
}

function ensureDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("ADMIN 各功能页面", () => {
  test.beforeAll(ensureDir);

  test("登录后依次访问各页面并检查", async ({ page }) => {
    const results: PageResult[] = [];

    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("admin");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForURL(/\/(\?.*)?$/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (page.url().includes("/login")) {
      results.push({
        page: "登录",
        url: BASE_URL + "/login",
        status: "失败",
        checks: [{ name: "登录", ok: false, detail: "未跳转到首页" }],
        bugsOrUi: ["登录失败，无法继续后续页面测试"],
        screenshot: "00-login-fail.png",
      });
      writeReport(results);
      expect(false, "登录失败").toBe(true);
      return;
    }

    // ---------- 1. 检查计划 ----------
    await page.goto(`${BASE_URL}/daily-plan`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const dailyPlanChecks: { name: string; ok: boolean; detail?: string }[] = [];
    const tab1 = await page.getByText("学期排期", { exact: false }).count() > 0;
    const tab2 = await page.getByText("周检查计划", { exact: false }).count() > 0;
    const tab3 = await page.getByText("单日计划", { exact: false }).count() > 0;
    dailyPlanChecks.push(
      { name: "Tab 学期排期", ok: tab1 },
      { name: "Tab 周检查计划", ok: tab2 },
      { name: "Tab 单日计划", ok: tab3 },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0, detail: "main 存在" }
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-daily-plan.png"), fullPage: true });
    results.push({
      page: "检查计划",
      url: "/daily-plan",
      status: dailyPlanChecks.every((c) => c.ok) ? "通过" : dailyPlanChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: dailyPlanChecks,
      bugsOrUi: [],
      screenshot: "01-daily-plan.png",
    });

    // ---------- 2. 检查项管理 ----------
    await page.goto(`${BASE_URL}/inspection`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const inspFixed = (await page.getByText("固定检查项", { exact: false }).count()) > 0;
    const inspSwitch = (await page.getByRole("switch").count()) > 0;
    const inspectionChecks = [
      { name: "固定检查项列表", ok: inspFixed },
      { name: "Switch 开关", ok: inspSwitch },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-inspection.png"), fullPage: true });
    results.push({
      page: "检查项管理",
      url: "/inspection",
      status: inspectionChecks.every((c) => c.ok) ? "通过" : inspectionChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: inspectionChecks,
      bugsOrUi: [],
      screenshot: "02-inspection.png",
    });

    // ---------- 3. 日常检查 ----------
    await page.goto(`${BASE_URL}/scoring`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const scoringToday = (await page.getByText("今日检查", { exact: false }).count()) > 0 || (await page.getByText("今日检查项目", { exact: false }).count()) > 0;
    const scoringClass = (await page.getByText("选择班级", { exact: false }).count()) > 0 || (await page.getByText("年级", { exact: false }).count()) > 0;
    const scoringChecks = [
      { name: "今日检查项/项目", ok: scoringToday },
      { name: "班级列表/选择", ok: scoringClass },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-scoring.png"), fullPage: true });
    results.push({
      page: "日常检查",
      url: "/scoring",
      status: scoringChecks.every((c) => c.ok) ? "通过" : scoringChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: scoringChecks,
      bugsOrUi: [],
      screenshot: "03-scoring.png",
    });

    // ---------- 4. 周评 ----------
    await page.goto(`${BASE_URL}/weekly-review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const wrWeek = (await page.getByText("本周", { exact: false }).count()) > 0 || (await page.getByText("上周", { exact: false }).count()) > 0;
    const wrClass = (await page.getByText("选择班级", { exact: false }).count()) > 0 || (await page.getByText("周评", { exact: false }).count()) > 0;
    const weeklyReviewChecks = [
      { name: "周次切换(本周/上周)", ok: wrWeek },
      { name: "班级选择/周评", ok: wrClass },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-weekly-review.png"), fullPage: true });
    results.push({
      page: "周评",
      url: "/weekly-review",
      status: weeklyReviewChecks.every((c) => c.ok) ? "通过" : weeklyReviewChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: weeklyReviewChecks,
      bugsOrUi: [],
      screenshot: "04-weekly-review.png",
    });

    // ---------- 5. 成绩报表 ----------
    await page.goto(`${BASE_URL}/scores`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const scoresTable = (await page.getByText("成绩报表", { exact: false }).count()) > 0;
    const scoresFilter = (await page.getByText("本周", { exact: false }).count()) > 0 || (await page.getByText("本月", { exact: false }).count()) > 0 || (await page.getByRole("combobox").count()) > 0;
    const scoresChecks = [
      { name: "成绩报表页/数据", ok: scoresTable },
      { name: "筛选项(周期/选择)", ok: scoresFilter },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-scores.png"), fullPage: true });
    results.push({
      page: "成绩报表",
      url: "/scores",
      status: scoresChecks.every((c) => c.ok) ? "通过" : scoresChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: scoresChecks,
      bugsOrUi: [],
      screenshot: "05-scores.png",
    });

    // ---------- 6. 班级管理 ----------
    await page.goto(`${BASE_URL}/classes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const classesList = (await page.getByText("班级管理", { exact: false }).count()) > 0;
    const classesNew = (await page.getByRole("button", { name: /新增|创建|添加/ }).count()) > 0 || (await page.getByText("新增班级", { exact: false }).count()) > 0;
    const classesChecks = [
      { name: "班级列表/标题", ok: classesList },
      { name: "新建/新增按钮", ok: classesNew },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-classes.png"), fullPage: true });
    results.push({
      page: "班级管理",
      url: "/classes",
      status: classesChecks.every((c) => c.ok) ? "通过" : classesChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: classesChecks,
      bugsOrUi: [],
      screenshot: "06-classes.png",
    });

    // ---------- 7. 用户管理 ----------
    await page.goto(`${BASE_URL}/users`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const usersList = (await page.getByText("用户管理", { exact: false }).count()) > 0;
    const usersNew = (await page.getByRole("button", { name: /新增|创建|添加/ }).count()) > 0 || (await page.getByText("新增用户", { exact: false }).count()) > 0;
    const usersFilter = (await page.getByText("按班级筛选", { exact: false }).count()) > 0 || (await page.getByText("按角色筛选", { exact: false }).count()) > 0 || (await page.getByRole("combobox").count()) > 0;
    const usersChecks = [
      { name: "用户列表/标题", ok: usersList },
      { name: "新建/新增按钮", ok: usersNew },
      { name: "筛选项", ok: usersFilter },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-users.png"), fullPage: true });
    results.push({
      page: "用户管理",
      url: "/users",
      status: usersChecks.every((c) => c.ok) ? "通过" : usersChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: usersChecks,
      bugsOrUi: [],
      screenshot: "07-users.png",
    });

    // ---------- 8. AI 面板 ----------
    await page.goto(`${BASE_URL}/ai-panel`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const aiApi = (await page.getByText("已配置", { exact: false }).count()) > 0 || (await page.getByText("未配置", { exact: false }).count()) > 0 || (await page.getByText("API", { exact: false }).count()) > 0;
    const aiModules = (await page.getByText("系统模组", { exact: false }).count()) > 0 || (await page.getByText("模组", { exact: false }).count()) > 0;
    const aiChecks = [
      { name: "API 状态(已配置/未配置)", ok: aiApi },
      { name: "模组卡片/区域", ok: aiModules },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-ai-panel.png"), fullPage: true });
    results.push({
      page: "AI 面板",
      url: "/ai-panel",
      status: aiChecks.every((c) => c.ok) ? "通过" : aiChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: aiChecks,
      bugsOrUi: [],
      screenshot: "08-ai-panel.png",
    });

    // ---------- 9. 服务器监控 ----------
    await page.goto(`${BASE_URL}/server-monitor`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const smCpu = (await page.getByText("CPU", { exact: false }).count()) > 0;
    const smMem = (await page.getByText("内存", { exact: false }).count()) > 0;
    const smChecks = [
      { name: "CPU 相关卡片", ok: smCpu },
      { name: "内存相关卡片", ok: smMem },
      { name: "内容加载", ok: (await page.locator("main").count()) > 0 },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-server-monitor.png"), fullPage: true });
    results.push({
      page: "服务器监控",
      url: "/server-monitor",
      status: smChecks.every((c) => c.ok) ? "通过" : smChecks.some((c) => c.ok) ? "问题" : "失败",
      checks: smChecks,
      bugsOrUi: [],
      screenshot: "09-server-monitor.png",
    });

    // ---------- 10. 检查记录（ADMIN 无权限，应被重定向）----------
    await page.goto(`${BASE_URL}/duty-history`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    const redirectedAway = !finalUrl.includes("/duty-history") || finalUrl === `${BASE_URL}/` || finalUrl === `${BASE_URL}`;
    const noDutyContent = (await page.getByText("检查记录", { exact: false }).count()) === 0 || redirectedAway;
    const dutyChecks = [
      { name: "ADMIN 被重定向或无法看到内容", ok: redirectedAway, detail: `最终 URL: ${finalUrl}` },
      { name: "非 DUTY_TEACHER 不可用", ok: noDutyContent || redirectedAway },
    ];
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-duty-history-admin.png"), fullPage: true });
    results.push({
      page: "检查记录(权限)",
      url: "/duty-history",
      status: redirectedAway ? "通过" : "失败",
      checks: dutyChecks,
      bugsOrUi: redirectedAway ? [] : ["ADMIN 不应能访问检查记录页，应重定向到首页"],
      screenshot: "10-duty-history-admin.png",
    });

    writeReport(results);
    const failed = results.filter((r) => r.status === "失败");
    expect(failed.length, `以下页面未通过: ${failed.map((f) => f.page).join(", ")}`).toBe(0);
  });
});

function writeReport(results: PageResult[]) {
  const lines = [
    "# ADMIN 各功能页面测试结果",
    "",
    "## 每页状态",
    ...results.map((r) => {
      const icon = r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️";
      return `- ${icon} **${r.page}** (${r.url}) — ${r.status}`;
    }),
    "",
    "## 各页检查明细",
    ...results.flatMap((r) => [
      `### ${r.page}`,
      ...r.checks.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
      ...(r.bugsOrUi.length ? [`**问题:** ${r.bugsOrUi.join("; ")}`] : []),
      `截图: \`${r.screenshot}\``,
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
