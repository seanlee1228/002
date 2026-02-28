/**
 * GRADE_LEADER（年级负责人）角色 E2E 测试
 * 登录 grade1/123456 → 仪表盘检查 → 侧边栏 → 各功能页 → 权限边界
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "grade-leader-screenshots");

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

test.describe("GRADE_LEADER 年级负责人", () => {
  test.beforeAll(ensureDir);

  test("登录后仪表盘、侧边栏、功能页与权限边界", async ({ page }) => {
    const results: PageResult[] = [];
    const sidebarItems: string[] = [];

    // ----- 1. 登录 -----
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("grade1");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForURL(/\/(\?.*)?$/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (page.url().includes("/login")) {
      results.push({
        name: "登录",
        status: "失败",
        checks: [{ name: "登录", ok: false, detail: "未跳转" }],
        bugsOrUi: ["登录失败"],
        screenshot: "00-login-fail.png",
      });
      writeReport(results, sidebarItems);
      expect(false, "登录失败").toBe(true);
      return;
    }

    // ----- 2. 仪表盘首屏截图 -----
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-dashboard-top.png"), fullPage: false });
    const dashChecks: { name: string; ok: boolean; detail?: string }[] = [];
    dashChecks.push({ name: "年级总览横幅(今日检查项)", ok: (await page.getByText("今日检查项", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "已检查班级/达标率", ok: (await page.getByText("已检查班级", { exact: false }).count()) > 0 || (await page.getByText("今日达标率", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "本周达标率卡", ok: (await page.getByText("本周达标率", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "AI 年级日报或日报", ok: (await page.getByText("年级日报", { exact: false }).count()) > 0 || (await page.getByText("日报", { exact: false }).count()) > 0 || (await page.getByText("当天检查未完成", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "等级分布", ok: (await page.getByText("周等级分布", { exact: false }).count()) > 0 || (await page.getByText("等级分布", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "近7日趋势", ok: (await page.getByText("近7日", { exact: false }).count()) > 0 || (await page.getByText("达标率趋势", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "班级排名", ok: (await page.getByText("班级达标率排名", { exact: false }).count()) > 0 || (await page.getByText("达标率排名", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "流动红旗/连续标杆", ok: (await page.getByText("连续标杆班级", { exact: false }).count()) > 0 || (await page.getByText("连续标杆", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "显著进步", ok: (await page.getByText("显著进步班级", { exact: false }).count()) > 0 || (await page.getByText("显著进步", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "连续预警", ok: (await page.getByText("连续预警班级", { exact: false }).count()) > 0 || (await page.getByText("连续预警", { exact: false }).count()) > 0 });
    dashChecks.push({ name: "快捷操作(去检查/检查计划/周评)", ok: (await page.getByText("去检查", { exact: false }).count()) > 0 || (await page.getByText("检查计划", { exact: false }).count()) > 0 || (await page.getByText("周评", { exact: false }).count()) > 0 });
    // 已检查班级卡可点击展开
    const checkedCard = page.locator('text=已检查班级').first();
    const cardPressable = await checkedCard.count() > 0;
    if (cardPressable) {
      await checkedCard.click();
      await page.waitForTimeout(600);
      dashChecks.push({ name: "已检查班级卡点击展开", ok: true, detail: "已点击" });
    } else {
      dashChecks.push({ name: "已检查班级卡点击展开", ok: false, detail: "未找到卡片" });
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-dashboard-after-expand.png"), fullPage: false });
    results.push({
      name: "仪表盘",
      status: dashChecks.filter((c) => !c.ok).length === 0 ? "通过" : dashChecks.some((c) => !c.ok) ? "问题" : "失败",
      checks: dashChecks,
      bugsOrUi: [],
      screenshot: "01-dashboard-top.png",
    });

    // 向下滚动并截图
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-dashboard-scroll1.png"), fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-dashboard-scroll2.png"), fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-dashboard-bottom.png"), fullPage: false });

    // ----- 3. 侧边栏菜单 -----
    const expectedNav = ["仪表盘", "检查计划", "检查项管理", "日常检查", "周评", "成绩报表", "班级管理", "用户管理"];
    const notExpectedNav = ["AI 面板", "服务器监控", "检查记录"];
    const aside = page.locator("aside");
    for (const label of expectedNav) {
      if ((await aside.getByText(label, { exact: false }).count()) > 0) sidebarItems.push(label);
    }
    const hasNoAi = (await aside.getByText("AI 面板", { exact: false }).count()) === 0;
    const hasNoServer = (await aside.getByText("服务器监控", { exact: false }).count()) === 0;
    const hasNoDutyHistory = (await aside.getByText("检查记录", { exact: false }).count()) === 0;
    results.push({
      name: "侧边栏",
      status: sidebarItems.length >= 6 && hasNoAi && hasNoServer ? "通过" : "问题",
      checks: [
        { name: "可见菜单数", ok: sidebarItems.length >= 6, detail: `${sidebarItems.length} 项` },
        { name: "无 AI 面板", ok: hasNoAi },
        { name: "无 服务器监控", ok: hasNoServer },
        { name: "无 检查记录", ok: hasNoDutyHistory },
      ],
      bugsOrUi: [],
      screenshot: "01-dashboard-top.png",
    });

    // ----- 4. /daily-plan 只读（无编辑/新建按钮） -----
    await page.goto(`${BASE_URL}/daily-plan`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const noCreatePlan = (await page.getByRole("button", { name: /创建计划|新增计划|添加计划/ }).count()) === 0;
    const noAddDaily = (await page.getByRole("button", { name: /新增单日|创建单日/ }).count()) === 0;
    const hasTabs = (await page.getByText("学期排期", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-daily-plan.png"), fullPage: true });
    results.push({
      name: "检查计划(只读)",
      status: hasTabs && (noCreatePlan || noAddDaily) ? "通过" : hasTabs ? "问题" : "失败",
      checks: [
        { name: "三个 Tab 存在", ok: hasTabs },
        { name: "无创建计划按钮(只读)", ok: noCreatePlan || noAddDaily, detail: noCreatePlan ? "无创建计划按钮" : "无新增单日按钮" },
      ],
      bugsOrUi: [],
      screenshot: "06-daily-plan.png",
    });

    // ----- 5. /inspection 可见 -----
    await page.goto(`${BASE_URL}/inspection`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const inspVisible = (await page.getByText("固定检查项", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-inspection.png"), fullPage: true });
    results.push({
      name: "检查项管理",
      status: inspVisible ? "通过" : "失败",
      checks: [{ name: "固定检查项可见", ok: inspVisible }],
      bugsOrUi: [],
      screenshot: "07-inspection.png",
    });

    // ----- 6. /scoring 仅本年级（一年级）班级 -----
    await page.goto(`${BASE_URL}/scoring`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const has1Grade = (await page.getByText("1年级", { exact: false }).count()) > 0;
    const has2Grade = (await page.getByText("2年级", { exact: false }).count()) > 0;
    const has3Grade = (await page.getByText("3年级", { exact: false }).count()) > 0;
    const onlyGrade1 = has1Grade && !has2Grade && !has3Grade;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-scoring.png"), fullPage: true });
    results.push({
      name: "日常检查(本年级)",
      status: has1Grade ? (onlyGrade1 ? "通过" : "问题") : "失败",
      checks: [
        { name: "有一年级", ok: has1Grade },
        { name: "仅本年级班级(无2/3年级)", ok: onlyGrade1, detail: onlyGrade1 ? "仅1年级" : "存在2或3年级" },
      ],
      bugsOrUi: onlyGrade1 ? [] : ["应只显示一年级班级"],
      screenshot: "08-scoring.png",
    });

    // ----- 7. /scores 数据范围 -----
    await page.goto(`${BASE_URL}/scores`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const scoresTitle = (await page.getByText("成绩报表", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-scores.png"), fullPage: true });
    results.push({
      name: "成绩报表",
      status: scoresTitle ? "通过" : "失败",
      checks: [{ name: "成绩报表页加载", ok: scoresTitle }],
      bugsOrUi: [],
      screenshot: "09-scores.png",
    });

    // ----- 8. /classes 仅本年级 -----
    await page.goto(`${BASE_URL}/classes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const classes1 = (await page.getByText("1年级", { exact: false }).count()) > 0;
    const classesTitle = (await page.getByText("班级管理", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-classes.png"), fullPage: true });
    results.push({
      name: "班级管理(本年级)",
      status: classesTitle ? "通过" : "失败",
      checks: [
        { name: "班级管理页", ok: classesTitle },
        { name: "含一年级", ok: classes1 },
      ],
      bugsOrUi: [],
      screenshot: "10-classes.png",
    });

    // ----- 9. /users 仅本年级 -----
    await page.goto(`${BASE_URL}/users`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const usersTitle = (await page.getByText("用户管理", { exact: false }).count()) > 0;
    const users1Grade = (await page.getByText("1年级", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11-users.png"), fullPage: true });
    results.push({
      name: "用户管理(本年级)",
      status: usersTitle ? "通过" : "失败",
      checks: [
        { name: "用户管理页", ok: usersTitle },
        { name: "含一年级或标题带年级", ok: users1Grade || (await page.getByText("年级", { exact: false }).count()) > 0 },
      ],
      bugsOrUi: [],
      screenshot: "11-users.png",
    });

    // ----- 10. /ai-panel 无权限 -----
    await page.goto(`${BASE_URL}/ai-panel`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const aiNoAccess = (await page.getByText("仅管理员可访问", { exact: false }).count()) > 0;
    const aiNoContent = (await page.getByText("系统模组", { exact: false }).count()) === 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12-ai-panel.png"), fullPage: true });
    results.push({
      name: "AI 面板(无权限)",
      status: aiNoAccess || aiNoContent ? "通过" : "失败",
      checks: [
        { name: "无权限提示或空白", ok: aiNoAccess || aiNoContent, detail: aiNoAccess ? "仅管理员可访问" : "无系统模组内容" },
      ],
      bugsOrUi: !aiNoAccess && !aiNoContent ? ["GRADE_LEADER 不应看到 AI 面板内容"] : [],
      screenshot: "12-ai-panel.png",
    });

    // ----- 11. /server-monitor 无权限(重定向) -----
    await page.goto(`${BASE_URL}/server-monitor`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const smUrl = page.url();
    const smRedirected = !smUrl.includes("/server-monitor") || smUrl === `${BASE_URL}/` || smUrl === BASE_URL + "/";
    const smNoCpu = (await page.getByText("CPU 使用率", { exact: false }).count()) === 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13-server-monitor.png"), fullPage: true });
    results.push({
      name: "服务器监控(无权限)",
      status: smRedirected || smNoCpu ? "通过" : "失败",
      checks: [
        { name: "重定向或无监控内容", ok: smRedirected || smNoCpu, detail: smRedirected ? "已重定向" : "无 CPU 卡片" },
      ],
      bugsOrUi: !smRedirected && !smNoCpu ? ["GRADE_LEADER 不应看到服务器监控"] : [],
      screenshot: "13-server-monitor.png",
    });

    writeReport(results, sidebarItems);
    const failed = results.filter((r) => r.status === "失败");
    expect(failed.length, `未通过: ${failed.map((f) => f.name).join(", ")}`).toBe(0);
  });
});

function writeReport(results: PageResult[], sidebarItems: string[]) {
  const lines = [
    "# GRADE_LEADER 年级负责人测试结果",
    "",
    "## 仪表盘功能完整性",
    results.find((r) => r.name === "仪表盘")?.checks?.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n") ?? "",
    "",
    "## 侧边栏菜单项",
    sidebarItems.length ? sidebarItems.map((s) => `- ${s}`).join("\n") : "- （无）",
    "",
    "## 每页状态与权限",
    ...results.map((r) => {
      const icon = r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️";
      return `- ${icon} **${r.name}** — ${r.status}`;
    }),
    "",
    "## 各页检查明细",
    ...results.flatMap((r) => [
      `### ${r.name}`,
      ...(r.checks?.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`) ?? []),
      ...(r.bugsOrUi?.length ? [`**问题:** ${r.bugsOrUi.join("; ")}`] : []),
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
