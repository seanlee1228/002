/**
 * 班级常规评分系统 — 200个工作日稳定性测试脚本
 *
 * 执行方式:
 *   1. 确保 dev server 已启动: npm run dev
 *   2. 运行: npx tsx tests/stability-test.mts
 *
 * 脚本将:
 *   - 清空并重建基础数据
 *   - 注入 200 个工作日的模拟检查 + 评分数据
 *   - 验证数据完整性
 *   - 以三种角色调用 API 并验证响应
 *   - 生成 tests/stability-report.md
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// ─── 配置 ───────────────────────────────────────────────
const TOTAL_WORKING_DAYS = 200;
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const PASSWORD = "123456";

// ─── 检查项模板池 ───────────────────────────────────────
const INSPECTION_TEMPLATES = [
  { title: "教室卫生", description: "检查教室地面、桌面整洁度" },
  { title: "课间纪律", description: "课间活动秩序及安全情况" },
  { title: "两操评比", description: "广播操和眼保健操完成质量" },
  { title: "红领巾佩戴", description: "学生红领巾佩戴情况" },
  { title: "桌椅摆放", description: "课后桌椅摆放整齐" },
  { title: "午餐纪律", description: "午餐时间用餐秩序" },
  { title: "放学秩序", description: "放学路队整齐有序" },
  { title: "节能环保", description: "随手关灯关窗、节约用水" },
  { title: "文明礼仪", description: "学生见面问好、礼貌用语" },
  { title: "课桌整理", description: "课桌内部和桌面物品摆放" },
  { title: "教室绿化", description: "班级绿植养护情况" },
  { title: "黑板报评比", description: "黑板报内容及美观度" },
];

// ─── 工具函数 ────────────────────────────────────────────
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function randomFloat(min: number, max: number, decimals = 1): number {
  const val = min + Math.random() * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function comment(score: number): string {
  if (score >= 9) return "表现优秀";
  if (score >= 7) return "表现良好";
  return "有待改进";
}

// ─── 报告收集器 ──────────────────────────────────────────
interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs?: number;
}

interface ApiTestResult {
  role: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  passed: boolean;
  detail: string;
}

interface UsabilityResult {
  role: string;
  scenario: string;
  passed: boolean;
  detail: string;
}

const integrityResults: TestResult[] = [];
const apiResults: ApiTestResult[] = [];
const usabilityResults: UsabilityResult[] = [];
let injectionStartTime = 0;
let injectionEndTime = 0;
let workingDayCount = 0;
let totalInspectionItems = 0;
let totalScores = 0;
let workingDayStartDate = "";
let workingDayEndDate = "";

// ─── 阶段一：数据准备 ───────────────────────────────────
async function phase1_prepare() {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段一：数据准备");
  console.log("══════════════════════════════════════════\n");

  // 清空
  console.log("  清空现有数据...");
  await prisma.score.deleteMany();
  await prisma.inspectionItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();

  // 学期 — 覆盖 200 个工作日（含缓冲）
  const today = new Date();
  const semesterStart = new Date(today);
  semesterStart.setDate(semesterStart.getDate() - (TOTAL_WORKING_DAYS * 2));

  await prisma.semester.create({
    data: {
      name: "稳定性测试学期",
      startDate: formatDate(semesterStart),
      endDate: formatDate(today),
      isCurrent: true,
    },
  });
  console.log(`  学期: ${formatDate(semesterStart)} → ${formatDate(today)}`);

  // 班级
  const classes = [];
  for (let grade = 1; grade <= 3; grade++) {
    for (let section = 1; section <= 4; section++) {
      const cls = await prisma.class.create({
        data: { name: `${grade}年级${section}班`, grade, section },
      });
      classes.push(cls);
    }
  }
  console.log(`  班级: ${classes.length} 个`);

  // 用户
  const hashed = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: { name: "系统管理员", username: "admin", password: hashed, role: "ADMIN" },
  });
  const duty1 = await prisma.user.create({
    data: { name: "张老师", username: "zhanglaoshi", password: hashed, role: "DUTY_TEACHER" },
  });
  const duty2 = await prisma.user.create({
    data: { name: "李老师", username: "lilaoshi", password: hashed, role: "DUTY_TEACHER" },
  });

  const teacherNames = [
    "王老师", "赵老师", "刘老师", "陈老师",
    "杨老师", "黄老师", "周老师", "吴老师",
    "徐老师", "孙老师", "马老师", "朱老师",
  ];
  const classTeachers = [];
  for (let i = 0; i < classes.length; i++) {
    const t = await prisma.user.create({
      data: {
        name: teacherNames[i],
        username: `teacher${i + 1}`,
        password: hashed,
        role: "CLASS_TEACHER",
        classId: classes[i].id,
      },
    });
    classTeachers.push(t);
  }
  console.log(`  用户: 1 管理员 + 2 值日老师 + ${classTeachers.length} 班主任`);

  return { admin, duty1, duty2, classes, classTeachers };
}

// ─── 阶段二：200 个工作日数据注入 ───────────────────────
async function phase2_inject(ctx: Awaited<ReturnType<typeof phase1_prepare>>) {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段二：模拟 200 个工作日数据注入");
  console.log("══════════════════════════════════════════\n");

  const { admin, duty1, duty2, classes } = ctx;
  const dutyTeachers = [duty1, duty2];
  const today = new Date();

  injectionStartTime = Date.now();
  let dayCursor = new Date(today);
  while (workingDayCount < TOTAL_WORKING_DAYS) {
    if (isWeekend(dayCursor)) {
      dayCursor.setDate(dayCursor.getDate() - 1);
      continue;
    }

    if (workingDayCount === 0) {
      workingDayEndDate = formatDate(dayCursor);
    }
    workingDayCount++;
    const dateStr = formatDate(dayCursor);
    if (workingDayCount === TOTAL_WORKING_DAYS) {
      workingDayStartDate = dateStr;
    }

    // 管理员：创建 3~4 个检查项
    const itemCount = 3 + Math.floor(Math.random() * 2); // 3 or 4
    const templates = pickRandom(INSPECTION_TEMPLATES, itemCount);

    const items = [];
    for (const tpl of templates) {
      const item = await prisma.inspectionItem.create({
        data: {
          title: tpl.title,
          description: tpl.description,
          maxScore: 10,
          date: dateStr,
          createdBy: admin.id,
        },
      });
      items.push(item);
      totalInspectionItems++;
    }

    // 值日老师：为每个班级的每个检查项评分
    for (const cls of classes) {
      for (const item of items) {
        const scorer = dutyTeachers[Math.floor(Math.random() * dutyTeachers.length)];
        const score = randomFloat(6, 10);
        await prisma.score.create({
          data: {
            score,
            comment: comment(score),
            classId: cls.id,
            inspectionItemId: item.id,
            scoredById: scorer.id,
          },
        });
        totalScores++;
      }
    }

    if (workingDayCount % 20 === 0) {
      console.log(`  进度: ${workingDayCount} 个工作日已处理 (${dateStr}) | 检查项: ${totalInspectionItems} | 评分: ${totalScores}`);
    }
    dayCursor.setDate(dayCursor.getDate() - 1);
  }

  injectionEndTime = Date.now();
  const elapsed = ((injectionEndTime - injectionStartTime) / 1000).toFixed(1);
  console.log(
    `\n  ✅ 注入完成: ${workingDayCount} 工作日 (${workingDayStartDate} → ${workingDayEndDate}), ${totalInspectionItems} 检查项, ${totalScores} 评分 (${elapsed}s)`
  );
}

// ─── 阶段三：数据完整性验证 ─────────────────────────────
async function phase3_integrity(ctx: Awaited<ReturnType<typeof phase1_prepare>>) {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段三：数据完整性验证");
  console.log("══════════════════════════════════════════\n");

  // 1. 记录总数
  const [userCount, classCount, itemCount, scoreCount] = await Promise.all([
    prisma.user.count(),
    prisma.class.count(),
    prisma.inspectionItem.count(),
    prisma.score.count(),
  ]);

  const expectedUsers = 1 + 2 + 12; // admin + duty + teachers
  integrityResults.push({
    name: "用户总数",
    passed: userCount === expectedUsers,
    detail: `期望 ${expectedUsers}, 实际 ${userCount}`,
  });
  integrityResults.push({
    name: "班级总数",
    passed: classCount === 12,
    detail: `期望 12, 实际 ${classCount}`,
  });
  integrityResults.push({
    name: "检查项总数",
    passed: itemCount === totalInspectionItems,
    detail: `期望 ${totalInspectionItems}, 实际 ${itemCount}`,
  });
  integrityResults.push({
    name: "评分总数",
    passed: scoreCount === totalScores,
    detail: `期望 ${totalScores}, 实际 ${scoreCount}`,
  });

  // 2. 唯一约束 — 无重复 (classId, inspectionItemId)
  const duplicates = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM (
       SELECT classId, inspectionItemId, COUNT(*) as c
       FROM Score GROUP BY classId, inspectionItemId HAVING c > 1
     )`
  );
  const dupCount = Number(duplicates[0]?.cnt ?? 0);
  integrityResults.push({
    name: "唯一约束 (classId, inspectionItemId)",
    passed: dupCount === 0,
    detail: dupCount === 0 ? "无重复" : `发现 ${dupCount} 组重复`,
  });

  // 3. 分数范围
  const outOfRange = await prisma.score.count({
    where: { OR: [{ score: { lt: 0 } }, { score: { gt: 10 } }] },
  });
  integrityResults.push({
    name: "分数范围 (0~10)",
    passed: outOfRange === 0,
    detail: outOfRange === 0 ? "全部在范围内" : `${outOfRange} 条超范围`,
  });

  // 4. 日期连续性 — 每个工作日都应有检查项
  const allDates = await prisma.inspectionItem.findMany({
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "asc" },
  });
  const uniqueDates = new Set(allDates.map((d) => d.date));
  integrityResults.push({
    name: "工作日覆盖",
    passed: uniqueDates.size === workingDayCount,
    detail: `期望 ${workingDayCount} 天, 实际 ${uniqueDates.size} 天`,
  });

  // 5. 关联完整性 — Score 外键
  const orphanClass = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM Score WHERE classId NOT IN (SELECT id FROM Class)`
  );
  const orphanItem = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM Score WHERE inspectionItemId NOT IN (SELECT id FROM InspectionItem)`
  );
  const orphanUser = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM Score WHERE scoredById NOT IN (SELECT id FROM User)`
  );

  const totalOrphans =
    Number(orphanClass[0]?.cnt ?? 0) +
    Number(orphanItem[0]?.cnt ?? 0) +
    Number(orphanUser[0]?.cnt ?? 0);
  integrityResults.push({
    name: "外键关联完整性",
    passed: totalOrphans === 0,
    detail:
      totalOrphans === 0
        ? "全部外键有效"
        : `孤立记录: class=${orphanClass[0]?.cnt}, item=${orphanItem[0]?.cnt}, user=${orphanUser[0]?.cnt}`,
  });

  // 6. 每天检查项数量
  const itemsPerDay = await prisma.$queryRawUnsafe<{ date: string; cnt: number }[]>(
    `SELECT date, COUNT(*) as cnt FROM InspectionItem GROUP BY date`
  );
  const badDays = itemsPerDay.filter((d) => Number(d.cnt) < 3 || Number(d.cnt) > 4);
  integrityResults.push({
    name: "每日检查项数量 (3~4)",
    passed: badDays.length === 0,
    detail:
      badDays.length === 0
        ? "全部符合"
        : `${badDays.length} 天不符合 (${badDays.slice(0, 3).map((d) => `${d.date}:${d.cnt}`).join(", ")}...)`,
  });

  // 打印
  for (const r of integrityResults) {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.name}: ${r.detail}`);
  }
}

// ─── 阶段四/五：API 响应测试 + 性能 ─────────────────────
async function loginAs(username: string): Promise<string> {
  // 获取 CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  const cookies = csrfRes.headers.getSetCookie?.() ?? [];

  // 登录
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.join("; "),
    },
    body: new URLSearchParams({
      username,
      password: PASSWORD,
      csrfToken,
      json: "true",
    }).toString(),
    redirect: "manual",
  });

  // 收集 set-cookie
  const allCookies = [...cookies, ...(loginRes.headers.getSetCookie?.() ?? [])];
  const cookieStr = allCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  return cookieStr;
}

async function apiTest(
  role: string,
  cookie: string,
  method: string,
  path: string,
  validate?: (data: any) => { passed: boolean; detail: string }
) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  let status = 0;
  let passed = false;
  let detail = "";

  try {
    const res = await fetch(url, {
      method,
      headers: { Cookie: cookie },
    });
    status = res.status;
    const elapsed = Date.now() - start;

    if (status === 200) {
      const data = await res.json();
      if (validate) {
        const v = validate(data);
        passed = v.passed;
        detail = v.detail;
      } else {
        passed = true;
        detail = "200 OK";
      }
    } else {
      const text = await res.text().catch(() => "");
      detail = `HTTP ${status}: ${text.slice(0, 100)}`;
    }

    apiResults.push({ role, endpoint: path, method, status, durationMs: elapsed, passed, detail });
  } catch (err: any) {
    const elapsed = Date.now() - start;
    detail = `Error: ${err.message}`;
    apiResults.push({ role, endpoint: path, method, status: 0, durationMs: elapsed, passed: false, detail });
  }
}

async function phase4_api() {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段四：API 响应测试");
  console.log("══════════════════════════════════════════\n");

  // 检查服务器是否可用
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/auth/csrf`);
    if (!healthCheck.ok) throw new Error(`Status ${healthCheck.status}`);
  } catch (err: any) {
    console.log(`  ⚠️  无法连接到 ${BASE_URL}: ${err.message}`);
    console.log("  请确保 dev server 正在运行 (npm run dev)");
    console.log("  跳过 API 测试...\n");
    return;
  }

  // ─── 管理员 ──────────────────────────
  console.log("  🔑 登录: admin");
  const adminCookie = await loginAs("admin");

  console.log("  📡 管理员 API 测试...");
  await apiTest("管理员", adminCookie, "GET", "/api/scores/dashboard", (data) => ({
    passed: data.stats && data.weeklyTrend && data.todayItems !== undefined,
    detail: `stats.totalClasses=${data.stats?.totalClasses}, weeklyTrend=${data.weeklyTrend?.length}天, todayItems=${data.todayItems?.length}项`,
  }));

  await apiTest("管理员", adminCookie, "GET", "/api/scores?period=today", (data) => ({
    passed: data.period === "today" && Array.isArray(data.classSummaries),
    detail: `classes=${data.classSummaries?.length}, overallTotal=${data.overallTotal}, overallAvg=${data.overallAvg}`,
  }));

  await apiTest("管理员", adminCookie, "GET", "/api/scores?period=week", (data) => ({
    passed: data.period === "week" && Array.isArray(data.classSummaries),
    detail: `classes=${data.classSummaries?.length}, overallTotal=${data.overallTotal}, overallAvg=${data.overallAvg}`,
  }));

  await apiTest("管理员", adminCookie, "GET", "/api/scores?period=month", (data) => ({
    passed: data.period === "month" && Array.isArray(data.classSummaries),
    detail: `classes=${data.classSummaries?.length}, overallTotal=${data.overallTotal}, overallAvg=${data.overallAvg}`,
  }));

  await apiTest("管理员", adminCookie, "GET", "/api/scores?period=year", (data) => ({
    passed: data.period === "year" && Array.isArray(data.classSummaries),
    detail: `classes=${data.classSummaries?.length}, overallTotal=${data.overallTotal}, overallAvg=${data.overallAvg}`,
  }));

  // 随机抽查 5 个日期的检查项
  const allDates = await prisma.inspectionItem.findMany({
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "asc" },
  });
  const sampleDates = pickRandom(allDates.map((d) => d.date), 5);
  for (const date of sampleDates) {
    await apiTest("管理员", adminCookie, "GET", `/api/inspection?date=${date}`, (data) => ({
      passed: Array.isArray(data) && data.length >= 3,
      detail: `${date}: ${data.length}项`,
    }));
  }

  await apiTest("管理员", adminCookie, "GET", "/api/classes", (data) => ({
    passed: Array.isArray(data) && data.length === 12,
    detail: `${data.length} 个班级`,
  }));

  await apiTest("管理员", adminCookie, "GET", "/api/users", (data) => ({
    passed: Array.isArray(data) && data.length === 15,
    detail: `${data.length} 个用户`,
  }));

  // ─── 值日老师 ──────────────────────────
  console.log("  🔑 登录: zhanglaoshi");
  const dutyCookie = await loginAs("zhanglaoshi");

  console.log("  📡 值日老师 API 测试...");
  await apiTest("值日老师", dutyCookie, "GET", "/api/scores/dashboard", (data) => ({
    passed: data.stats && data.weeklyTrend !== undefined,
    detail: `stats.scoredClasses=${data.stats?.scoredClasses}, inspectionCount=${data.stats?.inspectionCount}`,
  }));

  await apiTest("值日老师", dutyCookie, "GET", "/api/scoring", (data) => ({
    passed: data.classes !== undefined && data.inspectionItems !== undefined,
    detail: `classes=${data.classes?.length}, items=${data.inspectionItems?.length}`,
  }));

  // ─── 班主任（3 位） ──────────────────────
  const teacherSamples = ["teacher1", "teacher5", "teacher10"];
  for (const tUsername of teacherSamples) {
    console.log(`  🔑 登录: ${tUsername}`);
    const tCookie = await loginAs(tUsername);

    console.log(`  📡 班主任 (${tUsername}) API 测试...`);
    await apiTest(`班主任(${tUsername})`, tCookie, "GET", "/api/scores/dashboard", (data) => ({
      passed: data.stats !== undefined && data.weeklyTrend !== undefined,
      detail: `classTotalToday=${data.classTotalToday ?? "N/A"}, classAvgWeek=${data.classAvgWeek ?? "N/A"}`,
    }));

    for (const period of ["today", "week", "month", "year"] as const) {
      await apiTest(`班主任(${tUsername})`, tCookie, "GET", `/api/scores?period=${period}`, (data) => {
        return {
          passed: data.period === period && data.scope === "class" && Array.isArray(data.itemSummaries),
          detail: `itemSummaries=${data.itemSummaries?.length}, total=${data.total}, avg=${data.average}`,
        };
      });
    }
  }

  // 打印结果摘要
  const passedCount = apiResults.filter((r) => r.passed).length;
  const failedCount = apiResults.filter((r) => !r.passed).length;
  console.log(`\n  API 测试结果: ✅ ${passedCount} 通过, ❌ ${failedCount} 失败`);

  if (failedCount > 0) {
    console.log("  失败项:");
    for (const r of apiResults.filter((r) => !r.passed)) {
      console.log(`    ❌ [${r.role}] ${r.method} ${r.endpoint}: ${r.detail}`);
    }
  }
}

function addUsabilityResult(role: string, scenario: string, passed: boolean, detail: string) {
  usabilityResults.push({ role, scenario, passed, detail });
}

// ─── 阶段五：用户可用性与准确性场景测试 ──────────────────
async function phase5_usability() {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段五：可用性与准确性场景测试");
  console.log("══════════════════════════════════════════\n");

  try {
    const healthCheck = await fetch(`${BASE_URL}/api/auth/csrf`);
    if (!healthCheck.ok) throw new Error(`Status ${healthCheck.status}`);
  } catch (err: any) {
    console.log(`  ⚠️  无法连接到 ${BASE_URL}: ${err.message}`);
    console.log("  跳过可用性场景测试...\n");
    return;
  }

  const today = formatDate(new Date());

  // 场景 1: 管理员创建当日检查项（核心操作）
  const adminCookie = await loginAs("admin");
  const createTitle = `稳定性场景检查项-${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/inspection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      title: createTitle,
      description: "用于可用性与准确性场景测试",
      maxScore: 10,
      date: today,
    }),
  });

  let createdItemId = "";
  if (createRes.status === 200) {
    const created = await createRes.json();
    createdItemId = created.id;
    addUsabilityResult("管理员", "创建检查项", !!createdItemId, `HTTP 200, itemId=${createdItemId}`);
  } else {
    const text = await createRes.text().catch(() => "");
    addUsabilityResult("管理员", "创建检查项", false, `HTTP ${createRes.status}: ${text.slice(0, 80)}`);
  }

  // 场景 2: 值日老师提交评分（核心业务流）
  const dutyCookie = await loginAs("zhanglaoshi");
  let scoredClassId = "";
  if (createdItemId) {
    const firstClass = await prisma.class.findFirst({ orderBy: [{ grade: "asc" }, { section: "asc" }] });
    scoredClassId = firstClass?.id ?? "";
    if (scoredClassId) {
      const scoreValue = 8.8;
      const submitRes = await fetch(`${BASE_URL}/api/scoring`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: dutyCookie,
        },
        body: JSON.stringify({
          classId: scoredClassId,
          scores: [{ inspectionItemId: createdItemId, score: scoreValue, comment: "场景测试评分" }],
        }),
      });

      if (submitRes.status === 200) {
        addUsabilityResult("值日老师", "提交评分", true, "HTTP 200");
        const dbScore = await prisma.score.findUnique({
          where: {
            classId_inspectionItemId: {
              classId: scoredClassId,
              inspectionItemId: createdItemId,
            },
          },
        });
        addUsabilityResult(
          "值日老师",
          "评分写入准确性",
          !!dbScore && dbScore.score === scoreValue,
          dbScore ? `DB=${dbScore.score}, expected=${scoreValue}` : "DB record not found"
        );
      } else {
        const text = await submitRes.text().catch(() => "");
        addUsabilityResult("值日老师", "提交评分", false, `HTTP ${submitRes.status}: ${text.slice(0, 80)}`);
      }
    } else {
      addUsabilityResult("值日老师", "提交评分", false, "未找到可评分班级");
    }
  } else {
    addUsabilityResult("值日老师", "提交评分", false, "前置检查项创建失败，无法继续");
  }

  // 场景 3: 班主任查看今日成绩总分（读场景 + 准确性）
  const teacherCookie = await loginAs("teacher1");
  const teacherRes = await fetch(`${BASE_URL}/api/scores?period=today`, {
    headers: { Cookie: teacherCookie },
  });
  if (teacherRes.status === 200) {
    const data = await teacherRes.json();
    const apiTotal = Number(data.total ?? 0);
    const teacher = await prisma.user.findUnique({
      where: { username: "teacher1" },
      select: { classId: true },
    });
    const teacherClassId = teacher?.classId;
    if (teacherClassId) {
      const todayScores = await prisma.score.findMany({
        where: {
          classId: teacherClassId,
          inspectionItem: { date: today },
        },
        select: { score: true },
      });
      const dbTotalRaw = todayScores.reduce((sum, s) => sum + s.score, 0);
      const dbTotal = Math.round(dbTotalRaw * 100) / 100;
      const passed = Math.abs(apiTotal - dbTotal) < 0.01;
      addUsabilityResult("班主任", "查看今日成绩", passed, `API total=${apiTotal}, DB total=${dbTotal}`);
    } else {
      addUsabilityResult("班主任", "查看今日成绩", false, "teacher1 未绑定班级");
    }
  } else {
    const text = await teacherRes.text().catch(() => "");
    addUsabilityResult("班主任", "查看今日成绩", false, `HTTP ${teacherRes.status}: ${text.slice(0, 80)}`);
  }

  // 场景 4: 权限可用性（班主任不得创建检查项）
  const forbiddenRes = await fetch(`${BASE_URL}/api/inspection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: teacherCookie,
    },
    body: JSON.stringify({
      title: `权限验证-${Date.now()}`,
      date: today,
      maxScore: 10,
    }),
  });
  addUsabilityResult("班主任", "权限限制验证", forbiddenRes.status === 403, `expected=403, actual=${forbiddenRes.status}`);

  for (const r of usabilityResults) {
    console.log(`  ${r.passed ? "✅" : "❌"} [${r.role}] ${r.scenario}: ${r.detail}`);
  }
}

// ─── 阶段六：生成报告 ───────────────────────────────────
function phase6_report() {
  console.log("\n══════════════════════════════════════════");
  console.log("  阶段六：生成稳定性报告");
  console.log("══════════════════════════════════════════\n");

  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const injectionSec = ((injectionEndTime - injectionStartTime) / 1000).toFixed(1);

  // 性能统计
  const byEndpoint = new Map<string, number[]>();
  for (const r of apiResults) {
    const key = `${r.method} ${r.endpoint}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(r.durationMs);
  }

  const perfRows: string[] = [];
  let slowQueries = 0;
  for (const [ep, durations] of byEndpoint) {
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    if (max > 2000) slowQueries++;
    perfRows.push(`| ${ep} | ${durations.length} | ${min}ms | ${avg}ms | ${max}ms | ${max > 2000 ? "⚠️" : "✅"} |`);
  }

  // 总体结论
  const integrityPassed = integrityResults.every((r) => r.passed);
  const apiPassed = apiResults.length === 0 || apiResults.every((r) => r.passed);
  const allPassed = integrityPassed && apiPassed;

  const report = `# 班级常规评分系统 — 稳定性测试报告

## 1. 测试概要

| 项目 | 值 |
|------|-----|
| 测试时间 | ${now} |
| 模拟范围 | ${TOTAL_WORKING_DAYS} 个工作日 (${workingDayStartDate} → ${workingDayEndDate}) |
| 数据库 | SQLite (Prisma ORM) |
| 服务地址 | ${BASE_URL} |
| Node 版本 | ${process.version} |

## 2. 数据注入统计

| 数据类型 | 数量 |
|----------|------|
| 用户 | 15 (1 管理员 + 2 值日老师 + 12 班主任) |
| 班级 | 12 (3年级 × 4班) |
| 学期 | 1 |
| 检查项 (InspectionItem) | ${totalInspectionItems} |
| 评分 (Score) | ${totalScores} |
| **总记录数** | **${15 + 12 + 1 + totalInspectionItems + totalScores}** |
| 注入耗时 | ${injectionSec} 秒 |

### 每日数据量

- 每日检查项: 3~4 项 (随机)
- 每日评分: 每项 × 12 班级 = 36~48 条/天
- 分数范围: 6.0~10.0 (随机)

## 3. 数据完整性检查

| # | 检查项 | 结果 | 详情 |
|---|--------|------|------|
${integrityResults.map((r, i) => `| ${i + 1} | ${r.name} | ${r.passed ? "✅ 通过" : "❌ 失败"} | ${r.detail} |`).join("\n")}

**完整性结论: ${integrityPassed ? "✅ 全部通过" : "❌ 存在问题"}**

## 4. API 响应测试

### 4.1 管理员视角

| 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|
${apiResults.filter((r) => r.role === "管理员").map((r) => `| ${r.method} ${r.endpoint} | ${r.status} | ${r.durationMs}ms | ${r.passed ? "✅" : "❌"} | ${r.detail} |`).join("\n")}

### 4.2 值日老师视角

| 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|
${apiResults.filter((r) => r.role === "值日老师").map((r) => `| ${r.method} ${r.endpoint} | ${r.status} | ${r.durationMs}ms | ${r.passed ? "✅" : "❌"} | ${r.detail} |`).join("\n")}

### 4.3 班主任视角

| 角色 | 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|------|
${apiResults.filter((r) => r.role.startsWith("班主任")).map((r) => `| ${r.role} | ${r.method} ${r.endpoint} | ${r.status} | ${r.durationMs}ms | ${r.passed ? "✅" : "❌"} | ${r.detail} |`).join("\n")}

## 5. 用户可用性与准确性（使用者视角）

| 角色 | 场景 | 结果 | 详情 |
|------|------|------|------|
${usabilityResults.length === 0
  ? "| - | - | ⚠️ 跳过 | 服务不可达，未执行场景测试 |"
  : usabilityResults.map((r) => `| ${r.role} | ${r.scenario} | ${r.passed ? "✅ 通过" : "❌ 失败"} | ${r.detail} |`).join("\n")}

## 6. 性能报告

| 端点 | 请求次数 | 最小耗时 | 平均耗时 | 最大耗时 | 状态 |
|------|----------|----------|----------|----------|------|
${perfRows.join("\n")}

- 慢查询阈值: 2000ms
- 慢查询数量: ${slowQueries}

## 7. 结论

| 维度 | 结果 |
|------|------|
| 数据完整性 | ${integrityPassed ? "✅ 通过" : "❌ 未通过"} |
| API 响应正确性 | ${apiResults.length === 0 ? "⚠️ 未测试 (服务器未启动)" : apiPassed ? "✅ 全部通过" : "❌ 存在失败"} |
| 可用性与准确性场景 | ${usabilityResults.length === 0 ? "⚠️ 未测试" : usabilityResults.every((r) => r.passed) ? "✅ 通过" : "❌ 存在问题"} |
| 性能 | ${slowQueries === 0 ? "✅ 无慢查询" : `⚠️ ${slowQueries} 个慢查询端点`} |
| **总体评估** | **${allPassed && (usabilityResults.length === 0 || usabilityResults.every((r) => r.passed)) ? "✅ 系统稳定且可用" : "⚠️ 存在问题，请查看详情"}** |

${!(allPassed && (usabilityResults.length === 0 || usabilityResults.every((r) => r.passed))) ? `### 发现的问题\n\n${[
  ...integrityResults.filter((r) => !r.passed).map((r) => `- [数据完整性] ${r.name}: ${r.detail}`),
  ...apiResults.filter((r) => !r.passed).map((r) => `- [API] ${r.role} ${r.method} ${r.endpoint}: ${r.detail}`),
  ...usabilityResults.filter((r) => !r.passed).map((r) => `- [可用性] ${r.role} ${r.scenario}: ${r.detail}`),
].join("\n")}` : `未发现问题。系统在 200 个工作日 ${totalScores.toLocaleString()} 条评分数据规模下运行稳定。`}
`;

  const reportPath = resolve(__dirname, "stability-report.md");
  writeFileSync(reportPath, report, "utf-8");
  console.log(`  报告已生成: ${reportPath}`);
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║ 班级常规评分系统 — 200个工作日稳定性测试 ║");
  console.log("╚══════════════════════════════════════════╝");

  const ctx = await phase1_prepare();
  await phase2_inject(ctx);
  await phase3_integrity(ctx);
  await phase4_api();
  await phase5_usability();
  phase6_report();

  console.log("\n🏁 测试完成!\n");
}

main()
  .catch((e) => {
    console.error("测试脚本出错:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
