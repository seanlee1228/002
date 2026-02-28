import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeJSON } from "@/lib/ai-client";
import { subDays, format, isWeekend, startOfWeek, endOfWeek } from "date-fns";
import { getLocale, createTranslator } from "@/lib/server-i18n";

/**
 * AI 分析管线（精简版）
 *
 * 规则版本: v2.0
 * 最后更新: 2026-02-14
 *
 * 仅保留以下 LLM scope（AI 仅用于文字建议，不用于数据客观推荐）：
 * - duty: 值日老师检查建议（文字建议：focusPoints, tips, recentIssues）
 * - class-summary-{班级名}: 班级周工作小结建议（文字建议：classSummary, classAdvice）
 *
 * 已移除的 scope（改为固定规则，见 dashboard/route.ts 和 daily-plan/suggest/route.ts）：
 * - daily-recommend: 改为公式算法（见 /api/daily-plan/suggest）
 * - global: 改为 buildAdminAnalysis 固定规则（见 /api/scores/dashboard）
 * - grade-{1,2,3}: 改为 buildGradeLeaderAnalysis 固定规则（见 /api/scores/dashboard）
 */

// ===== 鉴权：AI_CRON_SECRET 或 ADMIN session =====
function verifySecret(request: Request): boolean {
  const auth = request.headers.get("Authorization")?.replace("Bearer ", "");
  return auth === process.env.AI_CRON_SECRET && !!auth;
}

// ===== 工具函数 =====
function getLast30WorkingDays(from: Date): string[] {
  const dates: string[] = [];
  let day = from;
  while (dates.length < 30) {
    day = subDays(day, 1);
    if (!isWeekend(day)) dates.push(format(day, "yyyy-MM-dd"));
  }
  return dates;
}

// ===== 数据收集 =====
async function collectData() {
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const workingDays = getLast30WorkingDays(now);
  const startDate = workingDays[workingDays.length - 1];

  // 所有班级
  const classes = await prisma.class.findMany({
    select: { id: true, name: true, grade: true, section: true },
    orderBy: [{ grade: "asc" }, { section: "asc" }],
  });

  // 所有活跃的固定日评项
  const dailyItems = await prisma.checkItem.findMany({
    where: { module: "DAILY", isDynamic: false, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // 近 30 天日评记录
  const dailyRecords = await prisma.checkRecord.findMany({
    where: {
      date: { gte: startDate },
      checkItem: { module: "DAILY" },
    },
    include: { checkItem: true, class: true },
  });

  // 近 30 天周评记录（W-5 等级）
  const weeklyGrades = await prisma.checkRecord.findMany({
    where: {
      date: { gte: startDate },
      checkItem: { code: "W-5" },
    },
    include: { class: true },
  });

  // 今日计划
  const todayPlans = await prisma.dailyPlan.findMany({
    where: { date: today },
    include: { items: { include: { checkItem: true } } },
  });

  // ===== 聚合统计 =====

  // 1. 各检查项不达标率
  const itemStats: Record<string, { code: string; title: string; total: number; failed: number; lastChecked: string }> = {};
  for (const r of dailyRecords) {
    const key = r.checkItem.code || r.checkItemId;
    if (!itemStats[key]) {
      itemStats[key] = { code: r.checkItem.code || "临增", title: r.checkItem.title, total: 0, failed: 0, lastChecked: "" };
    }
    itemStats[key].total++;
    if (r.passed === false) itemStats[key].failed++;
    if (r.date > itemStats[key].lastChecked) itemStats[key].lastChecked = r.date;
  }

  // 2. 各班级达标率 + 等级
  const classStats: Record<string, { name: string; grade: number; total: number; passed: number; grades: string[] }> = {};
  for (const cls of classes) {
    classStats[cls.id] = { name: cls.name, grade: cls.grade, total: 0, passed: 0, grades: [] };
  }
  for (const r of dailyRecords) {
    if (classStats[r.classId]) {
      classStats[r.classId].total++;
      if (r.passed === true) classStats[r.classId].passed++;
    }
  }
  for (const g of weeklyGrades) {
    if (classStats[g.classId] && g.optionValue) {
      classStats[g.classId].grades.push(g.optionValue);
    }
  }

  // 本周/上周对比
  const thisWeekRecords = dailyRecords.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  const thisWeekRate = thisWeekRecords.length > 0
    ? Math.round((thisWeekRecords.filter((r) => r.passed === true).length / thisWeekRecords.length) * 100)
    : 0;

  return {
    today,
    weekStart,
    weekEnd,
    dailyItems,
    itemStats,
    classes,
    classStats,
    thisWeekRate,
    todayPlans,
  };
}

// ===== Prompt 构造 =====

function getSystemPrompt(locale: string): string {
  if (locale === "en") {
    return `You are a primary school routine management data analyst. Analyze the provided data and give professional, specific, actionable suggestions.
Requirements:
1. Must return strict JSON format
2. All text must be in English
3. Analysis must be based on data, do not fabricate non-existent data
4. Suggestions should be specific and actionable, avoid vagueness
5. Keep each text item within 50 words`;
  }
  return `你是一个小学常规管理数据分析师。请根据提供的数据进行分析，给出专业、具体、可操作的建议。
要求：
1. 必须返回严格的 JSON 格式
2. 所有文字使用中文
3. 分析要基于数据，不要编造不存在的数据
4. 建议要具体可操作，避免空泛
5. 控制每项文字在50字以内`;
}

/**
 * [LLM 文字建议] 值日老师检查建议 Prompt
 *
 * 输入: 今日计划检查项 + 近期高频不达标项 + 本周达标率
 * 输出: focusPoints（关注重点）, tips（检查技巧）, recentIssues（近期问题）
 *
 * 注意: 此 scope 使用 AI/LLM 生成文字建议
 */
function buildDutyPrompt(data: Awaited<ReturnType<typeof collectData>>, locale: string): string {
  const plannedItems = data.todayPlans.flatMap((p) =>
    p.items.map((i) => `${i.checkItem.code ?? "临增"} ${i.checkItem.title}`)
  );

  const recentHighFail = Object.values(data.itemStats)
    .map((s) => ({ ...s, failRate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0 }))
    .filter((s) => s.failRate > 15)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 3);

  if (locale === "en") {
    return `## Task
Generate today's inspection suggestions and practical tips for the duty teacher.

## Today's Planned Check Items
${plannedItems.length > 0 ? plannedItems.join("\n") : "No plan today"}

## Recent High-Failure Items
${recentHighFail.map((s) => `- ${s.code} ${s.title}: fail rate ${s.failRate}%`).join("\n") || "None"}

## Trend
- This week's pass rate: ${data.thisWeekRate}%

## Output JSON format
{
  "focusPoints": [{ "title": "Focus item", "reason": "Why (within 30 words)" }],
  "tips": ["Inspection tip 1 (within 30 words)", "Inspection tip 2"],
  "recentIssues": ["Recent frequent issue 1 (within 30 words)"]
}`;
  }

  return `## 任务
为值日教师生成今日检查建议和实用提示。

## 今日计划检查项
${plannedItems.length > 0 ? plannedItems.join("\n") : "暂无今日计划"}

## 近期高频不达标项
${recentHighFail.map((s) => `- ${s.code} ${s.title}：不达标率 ${s.failRate}%`).join("\n") || "暂无"}

## 趋势
- 本周达标率: ${data.thisWeekRate}%

## 输出 JSON 格式
{
  "focusPoints": [{ "title": "重点关注项", "reason": "为什么关注（30字内）" }],
  "tips": ["检查技巧提示1（30字内）", "检查技巧提示2"],
  "recentIssues": ["近期高频问题描述1（30字内）"]
}`;
}

/**
 * [LLM 文字建议] 班级周工作小结 Prompt
 *
 * 输入: 班级名称、达标率、最近等级、班级不达标项详情
 * 输出: classSummary（班级总结）, classAdvice（改进建议）, weakAreas（薄弱项）
 *
 * 注意: 此 scope 使用 AI/LLM 生成文字建议，不包含数据排名
 */
function buildClassSummaryPrompt(
  className: string,
  classData: { total: number; passed: number; grades: string[] },
  classFailItems: Array<{ title: string; failRate: number }>,
  thisWeekRate: number,
  locale: string,
): string {
  const passRate = classData.total > 0 ? Math.round((classData.passed / classData.total) * 100) : 0;
  const recentGrade = classData.grades.length > 0 ? classData.grades[classData.grades.length - 1] : (locale === "en" ? "Unrated" : "未评");

  if (locale === "en") {
    return `## Task
Generate a weekly class work summary and improvement suggestions for "${className}" for the class teacher's reference.

## Class Data
- Class name: ${className}
- 30-day pass rate: ${passRate}%
- Latest weekly grade: ${recentGrade}
- School-wide pass rate this week: ${thisWeekRate}%

## Non-compliant Items
${classFailItems.length > 0
    ? classFailItems.map((i) => `- ${i.title}: fail rate ${i.failRate}%`).join("\n")
    : "No significant non-compliant items"}

## Output JSON format
{
  "classSummary": "Class weekly performance summary (within 80 words, including pass rate and overall assessment)",
  "classAdvice": ["Improvement suggestion 1 (within 50 words)", "Improvement suggestion 2 (within 50 words)"],
  "weakAreas": [{ "title": "Weak area name", "failRate": 25 }]
}

Notes:
- Summary should be objective, specific, and data-driven
- Suggestions should be actionable, avoid generic advice
- If performance is good, suggest ways to maintain and further improve`;
  }

  return `## 任务
为"${className}"生成一段班级周工作小结和改进建议，用于班主任参考。

## 班级数据
- 班级名称: ${className}
- 近30天达标率: ${passRate}%
- 最新周评等级: ${recentGrade}
- 本周全校达标率: ${thisWeekRate}%

## 该班不达标项目
${classFailItems.length > 0
    ? classFailItems.map((i) => `- ${i.title}：不达标率 ${i.failRate}%`).join("\n")
    : "无明显不达标项目"}

## 输出 JSON 格式
{
  "classSummary": "班级本周表现总结（80字内，包含达标率描述和整体评价）",
  "classAdvice": ["改进建议1（50字内）", "改进建议2（50字内）"],
  "weakAreas": [{ "title": "薄弱项名称", "failRate": 25 }]
}

注意：
- 总结要客观、具体，结合数据分析
- 建议要可操作，避免空泛的套话
- 如果表现良好，给出保持优势和进一步提升的建议`;
}

/**
 * [LLM 文字建议] 年级日报 System Prompt
 *
 * 注意: 导出供 dashboard/route.ts 自动触发时使用
 */
export function getGradeReportSystemPrompt(locale: string): string {
  if (locale === "en") {
    return `You are a primary school grade routine inspection report writer. Write a concise daily report based on the provided data.
Requirements:
1. Return strict JSON format: {"report": "report content"}
2. Report should be about 100 words, concise and objective
3. Must include: inspection completion status, pass rate and trends, classes or items needing attention
4. Do not fabricate data, only use provided information
5. Tone should be formal but approachable, suitable for grade supervisors`;
  }
  return `你是小学年级常规检查报告撰写员。根据提供的数据，撰写一段简洁的年级每日常规检查报告。
要求：
1. 返回严格 JSON 格式：{"report": "报告内容"}
2. 报告控制在100字左右，语言简洁客观
3. 必须包含：今日检查完成情况、达标率及趋势、需重点关注的班级或检查项
4. 不要编造数据，仅基于提供的信息
5. 语气正式但不生硬，适合年级主管阅读`;
}

/**
 * [LLM 文字建议] 年级日报 User Prompt
 *
 * 输入: 年级统计数据
 * 输出: { "report": "约100字的年级日报" }
 *
 * 注意: 导出供 dashboard/route.ts 自动触发时使用
 */
export function buildGradeReportPrompt(params: {
  grade: number;
  date: string;
  scored: number;
  total: number;
  checkItems: string;
  weekRate: number;
  weekDiff: number;
  top3: string;
  bottom3: string;
  weakItems: string;
  activeTeachers: number;
  totalTeachers: number;
}, locale: string): string {
  const p = params;
  if (locale === "en") {
    return `## Grade ${p.grade} Daily Inspection Report Data (${p.date})

### Inspection Progress
- All ${p.total} classes completed inspection
- Today's check items: ${p.checkItems}

### Pass Rate
- This week: ${p.weekRate}% (${p.weekDiff >= 0 ? "+" : ""}${p.weekDiff}pp vs last week)

### Class Ranking
- Top performers: ${p.top3}
- Need attention: ${p.bottom3}

### Weak Check Items
${p.weakItems || "None"}

### Duty Teachers
- Active today: ${p.activeTeachers}/${p.totalTeachers}

Generate a ~100-word grade daily report.`;
  }
  return `## ${p.grade}年级 ${p.date} 常规检查日报数据

### 检查完成
- 全部 ${p.total} 个班级已完成检查
- 今日检查项: ${p.checkItems}

### 达标率
- 本周达标率: ${p.weekRate}% (较上周 ${p.weekDiff >= 0 ? "+" : ""}${p.weekDiff}pp)

### 班级排名
- 表现最优: ${p.top3}
- 需要关注: ${p.bottom3}

### 薄弱检查项
${p.weakItems || "暂无"}

### 值日教师
- 今日活跃: ${p.activeTeachers}/${p.totalTeachers}

请生成100字左右的年级日报。`;
}

// ===== 模组配置加载 =====
type ModuleOptions = {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  isActive: boolean;
};

/** 从 AiModuleConfig 表加载配置；scope 映射：class-summary-* → "class-summary" */
async function loadModuleConfigs(): Promise<Record<string, ModuleOptions>> {
  const configs = await prisma.aiModuleConfig.findMany();
  const map: Record<string, ModuleOptions> = {};
  for (const c of configs) {
    map[c.scope] = {
      systemPrompt: c.systemPrompt || undefined,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      model: c.model,
      isActive: c.isActive,
    };
  }
  return map;
}

function getModuleConfig(
  configs: Record<string, ModuleOptions>,
  scope: string,
): ModuleOptions {
  // class-summary-{班级名} 共享 "class-summary" 配置
  const configKey = scope.startsWith("class-summary-") ? "class-summary" : scope;
  return configs[configKey] ?? { isActive: true };
}

// ===== 单个分析任务 =====
async function runAnalysis(
  date: string,
  scope: string,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<{ success: boolean; tokens: number; error?: string }> {
  try {
    const modelName = options?.model ?? "deepseek-chat";
    const { result, tokens } = await analyzeJSON<Record<string, unknown>>(
      systemPrompt,
      userPrompt,
      options,
    );

    await prisma.aiAnalysis.upsert({
      where: { date_scope: { date, scope } },
      update: {
        content: JSON.stringify(result),
        tokens,
        model: modelName,
        createdAt: new Date(),
      },
      create: {
        date,
        scope,
        content: JSON.stringify(result),
        tokens,
        model: modelName,
      },
    });

    return { success: true, tokens };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`AI analysis failed [${scope}]:`, msg);
    return { success: false, tokens: 0, error: msg };
  }
}

// ===== POST: 分析入口（定时任务 or 管理员手动触发） =====
export async function POST(request: Request) {
  // 鉴权：优先检查 cron secret，其次检查 ADMIN session
  const hasCronSecret = verifySecret(request);
  if (!hasCronSecret) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // 检查 API Key 是否配置
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  // 解析可选的 scopes 参数
  let requestedScopes: string[] | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body?.scopes && Array.isArray(body.scopes) && body.scopes.length > 0) {
      requestedScopes = body.scopes as string[];
    }
  } catch { /* no body, run all */ }

  const startTime = Date.now();

  try {
    const data = await collectData();
    const moduleConfigs = await loadModuleConfigs();
    const results: Record<string, { success: boolean; tokens: number; error?: string }> = {};
    const shouldRun = (scope: string) => !requestedScopes || requestedScopes.includes(scope);

    /** 获取某模组的有效 system prompt（自定义 > 默认） */
    const getPrompt = (scope: string) => {
      const cfg = getModuleConfig(moduleConfigs, scope);
      return cfg.systemPrompt || getSystemPrompt(locale);
    };

    /** 获取某模组的 LLM 调用参数 */
    const getLLMOptions = (scope: string) => {
      const cfg = getModuleConfig(moduleConfigs, scope);
      return {
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        model: cfg.model,
      };
    };

    /** 检查某模组是否启用 */
    const isActive = (scope: string) => {
      const cfg = getModuleConfig(moduleConfigs, scope);
      return cfg.isActive;
    };

    // 1. 值日教师建议（LLM 文字建议）
    if (shouldRun("duty") && isActive("duty")) {
      results["duty"] = await runAnalysis(
        data.today,
        "duty",
        getPrompt("duty"),
        buildDutyPrompt(data, locale),
        getLLMOptions("duty"),
      );
    }

    // 2. 班级周工作小结（LLM 文字建议，每个班级独立 scope）
    if (shouldRun("class-summary") && isActive("class-summary")) {
      for (const cls of data.classes) {
        const scope = `class-summary-${cls.name}`;
        const stats = data.classStats[cls.id];
        if (!stats) continue;

        // 收集该班的不达标项
        const classRecords = await prisma.checkRecord.findMany({
          where: {
            classId: cls.id,
            date: { gte: data.weekStart },
            checkItem: { module: "DAILY" },
            passed: false,
          },
          include: { checkItem: true },
        });
        const failItemMap: Record<string, { title: string; count: number; total: number }> = {};
        for (const r of classRecords) {
          const key = r.checkItem.code || r.checkItemId;
          if (!failItemMap[key]) failItemMap[key] = { title: r.checkItem.title, count: 0, total: 0 };
          failItemMap[key].count++;
        }
        // 计算不达标率（基于全校该项统计）
        const classFailItems = Object.values(failItemMap).map((f) => ({
          title: f.title,
          failRate: f.count > 0 ? Math.round((f.count / Math.max(f.total, 1)) * 100) : 0,
        }));

        results[scope] = await runAnalysis(
          data.today,
          scope,
          getPrompt(scope),
          buildClassSummaryPrompt(cls.name, stats, classFailItems, data.thisWeekRate, locale),
          getLLMOptions(scope),
        );
      }
    }

    // 3. 年级日报（LLM 文字报告，管理员手动触发模式）
    if (shouldRun("grade-report") && isActive("grade-report")) {
      const gradeNums = [...new Set(data.classes.map((c) => c.grade))].sort();
      for (const grade of gradeNums) {
        const scope = `grade-report-${grade}`;
        const gradeClasses = data.classes.filter((c) => c.grade === grade);
        const gradeStats = gradeClasses.map((cls) => {
          const s = data.classStats[cls.id];
          const rate = s && s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0;
          return { name: cls.name, rate };
        }).sort((a, b) => b.rate - a.rate);
        const top3 = gradeStats.slice(0, 3).map((c) => `${c.name}(${c.rate}%)`).join("、");
        const bottom3 = gradeStats.slice(-3).reverse().map((c) => `${c.name}(${c.rate}%)`).join("、");
        const gradeItemStats: Record<string, { title: string; total: number; failed: number }> = {};
        const gradeClassIds = new Set(gradeClasses.map((c) => c.id));
        for (const key of Object.keys(data.itemStats)) {
          gradeItemStats[key] = { title: data.itemStats[key].title, total: 0, failed: 0 };
        }
        // 简化：复用全校 itemStats 作为薄弱项参考
        const weakItems = Object.values(data.itemStats)
          .map((s) => ({ title: s.title, failRate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0 }))
          .filter((s) => s.failRate > 15)
          .sort((a, b) => b.failRate - a.failRate)
          .slice(0, 3)
          .map((s) => `- ${s.title}：不达标率 ${s.failRate}%`)
          .join("\n");
        const checkItemNames = data.todayPlans.flatMap((p) => p.items.map((i) => i.checkItem.title)).join("、") || "暂无";
        const gradeReportPrompt = buildGradeReportPrompt({
          grade,
          date: data.today,
          scored: gradeClasses.length,
          total: gradeClasses.length,
          checkItems: checkItemNames,
          weekRate: data.thisWeekRate,
          weekDiff: 0,
          top3: top3 || "暂无",
          bottom3: bottom3 || "暂无",
          weakItems,
          activeTeachers: 0,
          totalTeachers: 0,
        }, locale);
        const sysPrompt = getModuleConfig(moduleConfigs, scope).systemPrompt || getGradeReportSystemPrompt(locale);
        results[scope] = await runAnalysis(data.today, scope, sysPrompt, gradeReportPrompt, getLLMOptions(scope));
      }
    }

    const totalTokens = Object.values(results).reduce((sum, r) => sum + r.tokens, 0);
    const elapsed = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    console.log(
      `[AI Analysis] ${data.today} | ${allSuccess ? "SUCCESS" : "PARTIAL"} | ` +
      `${totalTokens} tokens | ${elapsed}ms | scopes: ${Object.keys(results).join(", ")}`
    );

    return NextResponse.json({
      date: data.today,
      status: allSuccess ? "success" : "partial",
      results,
      totalTokens,
      elapsedMs: elapsed,
    });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json(
      { error: t("analysisFailed"), detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// GET: 查看当日分析状态（调试用）
export async function GET() {
  const today = format(new Date(), "yyyy-MM-dd");
  const analyses = await prisma.aiAnalysis.findMany({
    where: { date: today },
    select: { scope: true, tokens: true, model: true, createdAt: true },
  });

  return NextResponse.json({
    date: today,
    analyses,
    configured: !!process.env.DEEPSEEK_API_KEY,
  });
}
