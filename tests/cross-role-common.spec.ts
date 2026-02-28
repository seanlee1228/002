/**
 * 跨角色通用功能测试：登录/登出、移动端适配、主题切换、语言切换
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "cross-role-common-screenshots");
const IPHONE_16 = { width: 393, height: 852 };

function ensureDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("跨角色通用功能", () => {
  test.beforeAll(ensureDir);

  test("登录/登出 + 移动端 + 主题 + 语言", async ({ page }) => {
    const loginResults: string[] = [];
    const mobileIssues: string[] = [];
    let themeOk = "";
    let localeOk = "";

    // ---------- 1. 登录/登出 ----------
    await page.context().clearCookies();
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const urlAfterRoot = page.url();
    const redirectedToLogin = urlAfterRoot.includes("/login");
    loginResults.push(redirectedToLogin ? "✅ 未登录访问 / → 重定向到 /login" : "⚠️ 未登录访问 / 未重定向到 /login（当前为骨架屏）");

    await page.goto(BASE_URL + "/login", { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("admin");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(3500);
    const afterLogin = page.url();
    const loginOk = !afterLogin.includes("/login");
    loginResults.push(loginOk ? "✅ admin/123456 登录成功" : "❌ 登录失败");
    if (!loginOk) {
      writeReport(loginResults, mobileIssues, themeOk, localeOk);
      expect(loginOk).toBe(true);
      return;
    }

    await page.locator("aside").getByText("退出登录", { exact: false }).first().click();
    await page.waitForTimeout(2500);
    loginResults.push(page.url().includes("/login") ? "✅ 点击登出 → 重定向到 /login" : "❌ 登出后未到 /login");

    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    loginResults.push(page.url().includes("/login") ? "✅ 登出后再访问 / → 重定向到 /login" : "⚠️ 登出后访问 / 未重定向");

    // 重新登录以便后续移动端/主题/语言
    await page.goto(BASE_URL + "/login", { waitUntil: "networkidle" });
    await page.getByPlaceholder(/用户名|Username/).fill("admin");
    await page.getByPlaceholder(/密码|Password/).fill("123456");
    await page.getByRole("button", { name: /登\s*录|Sign in/ }).click();
    await page.waitForTimeout(3000);

    // ---------- 2. 移动端 393x852 ----------
    await page.setViewportSize(IPHONE_16);
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (bodyScrollWidth > IPHONE_16.width) mobileIssues.push("首页存在横向溢出 (scrollWidth=" + bodyScrollWidth + ")");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-01-dashboard.png"), fullPage: false });

    const menuBtn = page.locator("header button").first();
    await menuBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-02-sidebar-open.png"), fullPage: false });
    const asideVisible = await page.locator("aside").isVisible();
    const asideInView = await page.locator("aside").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= -10;
    }).catch(() => false);
    if (!asideVisible || !asideInView) mobileIssues.push("移动端侧边栏展开后不可见或未滑入");

    await page.goto(BASE_URL + "/scoring", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-03-scoring.png"), fullPage: false });

    await page.goto(BASE_URL + "/daily-plan", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-04-daily-plan.png"), fullPage: false });

    await page.goto(BASE_URL + "/scores", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-05-scores.png"), fullPage: false });

    // ---------- 3. 主题切换 ----------
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const themeBtn = page.getByRole("button", { name: /浅色|深色|light|dark|Light|Dark/i });
    if ((await themeBtn.count()) > 0) {
      await themeBtn.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "theme-after-toggle.png"), fullPage: false });
      themeOk = "✅ 主题切换按钮已点击并截图";
      await themeBtn.first().click();
      await page.waitForTimeout(600);
    } else {
      themeOk = "⚠️ 未找到主题切换按钮（可能被其他按钮匹配）";
    }

    // ---------- 4. 语言切换 ----------
    const localeBtn = page.getByRole("button", { name: /EN|中|switchLocale/i }).or(page.locator("header").getByText("EN").first()).or(page.locator("header").getByText("中").first());
    if ((await localeBtn.count()) > 0) {
      await localeBtn.first().click();
      await page.waitForTimeout(1500);
      const hasEn = (await page.getByText("Dashboard", { exact: false }).count()) > 0 || (await page.getByText("Welcome", { exact: false }).count()) > 0 || (await page.getByText("Management", { exact: false }).count()) > 0;
      localeOk = hasEn ? "✅ 切换到英文后页面显示英文文案" : "⚠️ 已点击语言切换，部分文案可能仍为中文";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "locale-en.png"), fullPage: false });
      await localeBtn.first().click();
      await page.waitForTimeout(1000);
    } else {
      localeOk = "⚠️ 未找到语言切换按钮";
    }

    writeReport(loginResults, mobileIssues, themeOk, localeOk);
  });
});

function writeReport(login: string[], mobile: string[], theme: string, locale: string) {
  const lines = [
    "# 跨角色通用功能测试结果",
    "",
    "## 1. 登录/登出流程",
    ...login.map((l) => `- ${l}`),
    "",
    "## 2. 移动端适配 (393×852 iPhone 16)",
    mobile.length ? mobile.map((m) => `- ${m}`).join("\n") : "- 未发现横向溢出或侧边栏异常",
    "截图: mobile-01-dashboard.png ~ mobile-05-scores.png",
    "",
    "## 3. 主题切换",
    theme || "- 未执行",
    "",
    "## 4. 语言切换",
    locale || "- 未执行",
  ];
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "report.md"), lines.join("\n"), "utf-8");
  console.log("\n报告:", path.join(SCREENSHOT_DIR, "report.md"));
}
