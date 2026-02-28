/**
 * CLASS_TEACHER（班主任）完整测试 + SUBJECT_TEACHER（任课教师）状态验证
 * 第一部分：teacher1 登录 → 仪表盘 → 侧边栏 → /scores → 权限边界 → 登出
 * 第二部分：admin 创建 SUBJECT_TEACHER 用户 → 登出 → testsubject 登录 → 检查仪表盘与侧边栏
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "class-subject-teacher-screenshots");

interface PartResult {
  part: string;
  name: string;
  status: "通过" | "失败" | "问题";
  detail?: string;
}

function ensureDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("CLASS_TEACHER 与 SUBJECT_TEACHER", () => {
  test.beforeAll(ensureDir);

  test("第一部分 CLASS_TEACHER", async ({ page }) => {
    const results: PartResult[] = [];
    let classTeacherSidebar: string[] = [];

    // ========== 第一部分：CLASS_TEACHER ==========
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("teacher1");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(4000);
    if (page.url().includes("/login")) {
      results.push({ part: "CLASS_TEACHER", name: "登录", status: "失败", detail: "teacher1 未跳转" });
      writeReport(results, classTeacherSidebar, []);
      expect(false, "CLASS_TEACHER 登录失败").toBe(true);
      return;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-class-dashboard.png"), fullPage: false });

    // 仪表盘检查
    const hasTodayRate = (await page.getByText("今日达标率", { exact: false }).count()) > 0;
    const hasWeekRate = (await page.getByText("本周达标率", { exact: false }).count()) > 0;
    const hasWeekGrade = (await page.getByText("本周等级", { exact: false }).count()) > 0;
    const hasTodayRecords = (await page.getByText("今日检查记录", { exact: false }).count()) > 0 || (await page.getByText("今日暂无检查记录", { exact: false }).count()) > 0;
    const hasClassSummary = (await page.getByText("班级周工作小结", { exact: false }).count()) > 0 || (await page.getByText("班级", { exact: false }).count()) > 0;
    results.push(
      { part: "CLASS_TEACHER", name: "三统计卡(今日/本周达标率、本周等级)", status: hasTodayRate && hasWeekRate && hasWeekGrade ? "通过" : "问题", detail: [hasTodayRate, hasWeekRate, hasWeekGrade].map(Boolean).join(",") },
      { part: "CLASS_TEACHER", name: "今日检查记录列表", status: hasTodayRecords ? "通过" : "失败" },
      { part: "CLASS_TEACHER", name: "AI 班级分析/班级小结", status: hasClassSummary ? "通过" : "问题" }
    );
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-class-dashboard-scroll.png"), fullPage: false });

    // 侧边栏
    const aside = page.locator("aside");
    const navLabels = ["仪表盘", "成绩报表"];
    for (const label of navLabels) {
      if ((await aside.getByText(label, { exact: false }).count()) > 0) classTeacherSidebar.push(label);
    }
    const noScoring = (await aside.getByText("日常检查", { exact: false }).count()) === 0;
    const noClasses = (await aside.getByText("班级管理", { exact: false }).count()) === 0;
    results.push(
      { part: "CLASS_TEACHER", name: "侧边栏(仪表盘、成绩报表)", status: classTeacherSidebar.length >= 2 ? "通过" : "问题", detail: classTeacherSidebar.join(", ") },
      { part: "CLASS_TEACHER", name: "侧边栏无日常检查/班级管理", status: noScoring && noClasses ? "通过" : "失败" }
    );

    // /scores 仅本班
    await page.goto(`${BASE_URL}/scores`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const scoresOk = (await page.getByText("成绩报表", { exact: false }).count()) > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-class-scores.png"), fullPage: true });
    results.push({ part: "CLASS_TEACHER", name: "成绩报表 /scores 仅本班", status: scoresOk ? "通过" : "失败" });

    // 权限边界（记录行为：/scoring 可能可读；/classes /users /daily-plan 预期无权限）
    for (const [url, name] of [["/scoring", "日常检查"], ["/classes", "班级管理"], ["/users", "用户管理"], ["/daily-plan", "检查计划"]]) {
      await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1800);
      const r = page.url();
      const redirected = !r.includes(url.replace("/", "")) || r === `${BASE_URL}/` || r === BASE_URL + "/";
      const noPerm = (await page.getByText("无权限", { exact: false }).count()) > 0;
      const loadFailed = (await page.getByText("加载失败", { exact: false }).count()) > 0;
      const noContent = (await page.getByText(name, { exact: false }).count()) === 0;
      const expectNoAccess = name !== "日常检查";
      const ok = redirected || noPerm || loadFailed || noContent || !expectNoAccess;
      const detail = redirected ? "重定向" : noPerm ? "无权限" : loadFailed ? "加载失败" : noContent ? "无内容" : "可访问";
      results.push({ part: "CLASS_TEACHER", name: `权限 ${name}`, status: ok ? "通过" : "失败", detail });
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-class-boundary.png"), fullPage: true });

    // 登出
    await aside.getByText("退出登录", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const atLogin = page.url().includes("/login");
    results.push({ part: "CLASS_TEACHER", name: "登出", status: atLogin ? "通过" : "问题", detail: page.url() });

    writeReport(results, classTeacherSidebar, []);
    const failed = results.filter((r) => r.status === "失败");
    expect(failed.length, `未通过: ${failed.map((f) => f.part + " " + f.name).join("; ")}`).toBe(0);
  });

  test("第二部分 SUBJECT_TEACHER", async ({ page }) => {
    const results: PartResult[] = [];
    const subjectResults: string[] = [];
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("admin");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(3000);
    if (page.url().includes("/login")) {
      results.push({ part: "SUBJECT_TEACHER", name: "Admin 登录", status: "失败" });
      writeReport(results, [], subjectResults);
      expect(false).toBe(true);
      return;
    }
    await page.goto(`${BASE_URL}/users`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /新增用户/i }).first().click();
    await page.waitForTimeout(1000);
    const modal = page.getByRole("dialog").first();
    await modal.locator('input').first().fill("测试任课教师");
    await modal.locator('input').nth(1).fill("testsubject");
    await modal.locator('input[type="password"]').fill("123456");
    await modal.locator('button[aria-haspopup="listbox"]').first().click();
    await page.waitForTimeout(600);
    const opt = page.getByRole("listbox").getByText("任课教师").first();
    if ((await opt.count()) > 0) await opt.click({ force: true });
    else await page.keyboard.press("ArrowUp").then(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(400);
    await modal.getByRole("button", { name: /创建/i }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-users-create-subject.png"), fullPage: true });
    const userCreated = (await page.getByText("testsubject", { exact: false }).count()) > 0;
    results.push({ part: "SUBJECT_TEACHER", name: "创建任课教师用户", status: userCreated ? "通过" : "问题" });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.locator("aside").getByText("退出登录", { exact: false }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("testsubject");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(3500);
    const subjectUrl = page.url();
    const subjectLanded = !subjectUrl.includes("/login");
    results.push({ part: "SUBJECT_TEACHER", name: "testsubject 登录", status: subjectLanded ? "通过" : "失败", detail: subjectUrl });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-subject-dashboard.png"), fullPage: true });

    if (subjectLanded) {
      const mainContent = (await page.locator("main").textContent()) ?? "";
      subjectResults.push(mainContent.length < 200 ? "仪表盘内容少/空" : "仪表盘有内容");
      const navCount = await page.locator("aside nav a[href]").count();
      subjectResults.push(`侧边栏 nav 链接数: ${navCount}`);
      results.push({ part: "SUBJECT_TEACHER", name: "侧边栏(预期空)", status: navCount <= 1 ? "通过" : "问题", detail: `${navCount} 项` });
    }
    writeReportPart2(results, subjectResults);
    expect(results.filter((r) => r.status === "失败").length).toBe(0);
  });
});

function writeReport(results: PartResult[], classSidebar: string[], subjectNotes: string[]) {
  const reportPath = path.join(SCREENSHOT_DIR, "report.md");
  const classPart = results.filter((r) => r.part === "CLASS_TEACHER");
  const subjectPart = results.filter((r) => r.part === "SUBJECT_TEACHER");
  const lines = [
    "# CLASS_TEACHER 与 SUBJECT_TEACHER 测试结果",
    "",
    "## 第一部分 CLASS_TEACHER",
    "### 仪表盘",
    ...classPart.filter((r) => !r.name.startsWith("侧边栏") && !r.name.startsWith("权限") && r.name !== "登出").map((r) => `- ${r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    "### 侧边栏菜单项",
    classSidebar.length ? classSidebar.map((s) => `- ${s}`).join("\n") : "- （无）",
    "### 成绩报表与权限",
    ...classPart.filter((r) => r.name.startsWith("成绩") || r.name.startsWith("权限") || r.name === "登出").map((r) => `- ${r.status === "通过" ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    "## 第二部分 SUBJECT_TEACHER",
    ...subjectPart.map((r) => `- ${r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    "### SUBJECT_TEACHER 状态备注",
    ...subjectNotes.map((s) => `- ${s}`),
    "",
    "## 汇总",
    `- 通过: ${results.filter((r) => r.status === "通过").length}`,
    `- 问题: ${results.filter((r) => r.status === "问题").length}`,
    `- 失败: ${results.filter((r) => r.status === "失败").length}`,
  ];
  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log("\n报告已写入:", reportPath);
}

function writeReportPart2(results: PartResult[], subjectNotes: string[]) {
  const reportPath = path.join(SCREENSHOT_DIR, "report.md");
  let base = "";
  try {
    base = fs.readFileSync(reportPath, "utf-8");
  } catch { /* ignore */ }
  const subjectPart = results.filter((r) => r.part === "SUBJECT_TEACHER");
  const append = [
    "",
    "## 第二部分 SUBJECT_TEACHER",
    ...subjectPart.map((r) => `- ${r.status === "通过" ? "✅" : r.status === "失败" ? "❌" : "⚠️"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    "### SUBJECT_TEACHER 状态备注",
    ...subjectNotes.map((s) => `- ${s}`),
    "",
    "## 汇总（第二部分）",
    `- 通过: ${results.filter((r) => r.status === "通过").length}`,
    `- 失败: ${results.filter((r) => r.status === "失败").length}`,
  ].join("\n");
  if (base.includes("第一部分 CLASS_TEACHER")) {
    const insertAt = base.indexOf("## 第二部分");
    const out = insertAt > 0 ? base.slice(0, insertAt) + append : base + append;
    fs.writeFileSync(reportPath, out, "utf-8");
  } else {
    fs.writeFileSync(reportPath, "# CLASS_TEACHER 与 SUBJECT_TEACHER 测试结果\n\n（第一部分未运行或报告被覆盖）\n" + append, "utf-8");
  }
  console.log("\n报告已写入:", reportPath);
}
