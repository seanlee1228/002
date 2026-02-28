import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subDays, isWeekend, format, startOfWeek, endOfWeek } from "date-fns";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { getChinaToday } from "@/lib/deadline";
import { getCurrentWeek, CURRENT_CALENDAR } from "@/lib/school-calendar";
import { analyzeJSON } from "@/lib/ai-client";
import { buildGradeReportPrompt, getGradeReportSystemPrompt } from "@/app/api/ai/daily-analysis/route";

function getLast7WorkingDays(): string[] {
  const dates: string[] = [];
  let day = new Date();
  while (dates.length < 7) {
    if (!isWeekend(day)) {
      dates.push(format(day, "yyyy-MM-dd"));
    }
    day = subDays(day, 1);
  }
  return dates.reverse();
}

/**
 * [固定规则] ADMIN 全局分析
 *
 * 规则版本: v2.0
 * 最后更新: 2026-02-14
 *
 * 输入: 近30天所有日评记录 + 本周/上周/4周前达标率
 * 输出: trendData, riskAlerts(含建议), gradeComparisonData, focusClasses(含不达标原因)
 *
 * 规则说明:
 * - trendData: 结构化对象，含环比(weekDiff)和月同比(monthDiff)数据，供图表渲染
 * - riskAlerts: 不达标率 > 30% → "high"；> 15% → "medium"；合计最多5条，每条含 suggestion
 * - gradeComparisonData: 各年级达标率数组 + 全校均值 + 数据周期，供柱状图渲染
 * - focusClasses: 达标率最低的 TOP5 班级，含具体不达标检查项(failedItems)
 *
 * 注意: 此规则不使用 AI/LLM，完全基于数据计算
 */
async function buildAdminAnalysis(
  scopedClassIds: string[],
  today: string,
  weekPassRate: number,
  prevWeekRate: number,
  fourWeeksAgoRate: number,
  ta: (key: string, params?: Record<string, string | number>) => string,
) {
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const recentRecords = await prisma.checkRecord.findMany({
    where: {
      date: { gte: thirtyDaysAgo },
      checkItem: { module: "DAILY" },
      ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
    },
    include: { checkItem: true, class: true },
  });

  // 各检查项不达标率
  const itemFailMap: Record<string, { title: string; total: number; failed: number }> = {};
  for (const r of recentRecords) {
    const key = r.checkItem.code || r.checkItemId;
    if (!itemFailMap[key]) {
      itemFailMap[key] = { title: r.checkItem.title, total: 0, failed: 0 };
    }
    itemFailMap[key].total++;
    if (r.passed === false) itemFailMap[key].failed++;
  }

  // 各班级达标率
  const classFailMap: Record<string, { name: string; grade: number; total: number; passed: number }> = {};
  for (const r of recentRecords) {
    if (!classFailMap[r.classId]) {
      classFailMap[r.classId] = { name: r.class.name, grade: r.class.grade, total: 0, passed: 0 };
    }
    classFailMap[r.classId].total++;
    if (r.passed === true) classFailMap[r.classId].passed++;
  }

  // 各班级各检查项不达标明细（用于 focusClasses 详细原因）
  const classItemFailMap: Record<string, Record<string, { title: string; total: number; failed: number }>> = {};
  for (const r of recentRecords) {
    if (!classItemFailMap[r.classId]) classItemFailMap[r.classId] = {};
    const key = r.checkItem.code || r.checkItemId;
    if (!classItemFailMap[r.classId][key]) {
      classItemFailMap[r.classId][key] = { title: r.checkItem.title, total: 0, failed: 0 };
    }
    classItemFailMap[r.classId][key].total++;
    if (r.passed === false) classItemFailMap[r.classId][key].failed++;
  }

  // 各年级达标率
  const gradeStatsMap: Record<number, { total: number; passed: number }> = {};
  for (const r of recentRecords) {
    const g = r.class.grade;
    if (!gradeStatsMap[g]) gradeStatsMap[g] = { total: 0, passed: 0 };
    gradeStatsMap[g].total++;
    if (r.passed === true) gradeStatsMap[g].passed++;
  }

  // --- trendData（环比 + 月同比） ---
  const weekDiff = weekPassRate - prevWeekRate;
  const monthDiff = weekPassRate - fourWeeksAgoRate;
  let summary: string;
  if (weekDiff > 2) {
    summary = ta("trendUp", { rate: weekPassRate, diff: weekDiff });
  } else if (weekDiff < -2) {
    summary = ta("trendDown", { rate: weekPassRate, diff: Math.abs(weekDiff) });
  } else {
    summary = ta("trendStable", { rate: weekPassRate });
  }
  const trendData = {
    weekRate: weekPassRate,
    prevWeekRate,
    fourWeeksAgoRate,
    weekDiff,
    monthDiff,
    summary,
  };

  // --- riskAlerts（合并建议，合计最多5条） ---
  const allAlerts: Array<{ title: string; detail: string; level: "high" | "medium"; suggestion: string }> = [];
  for (const [, stats] of Object.entries(itemFailMap)) {
    const failRate = stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
    if (failRate > 30) {
      allAlerts.push({
        title: stats.title,
        detail: ta("riskHighDetail", { rate: failRate }),
        level: "high",
        suggestion: ta("riskHighSuggestion", { title: stats.title }),
      });
    } else if (failRate > 15) {
      allAlerts.push({
        title: stats.title,
        detail: ta("riskMediumDetail", { rate: failRate }),
        level: "medium",
        suggestion: ta("riskMediumSuggestion", { title: stats.title }),
      });
    }
  }
  allAlerts.sort((a, b) => (a.level === "high" ? -1 : 1) - (b.level === "high" ? -1 : 1));
  const riskAlerts = allAlerts.slice(0, 5);

  // --- gradeComparisonData（结构化，供柱状图渲染） ---
  const gradeRates = Object.entries(gradeStatsMap)
    .map(([g, s]) => ({ grade: Number(g), rate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0 }))
    .sort((a, b) => a.grade - b.grade);
  const totalPassed = recentRecords.filter((r) => r.passed === true).length;
  const average = recentRecords.length > 0 ? Math.round((totalPassed / recentRecords.length) * 100) : 0;
  const gradeComparisonData = {
    period: ta("period30Days"),
    average,
    grades: gradeRates,
  };

  // --- focusClasses（含具体不达标检查项原因） ---
  const focusClasses = Object.entries(classFailMap)
    .map(([classId, c]) => {
      const rate = c.total > 0 ? Math.round((c.passed / c.total) * 100) : 100;
      const classItems = classItemFailMap[classId] || {};
      const failedItems = Object.values(classItems)
        .map((item) => ({
          title: item.title,
          failRate: item.total > 0 ? Math.round((item.failed / item.total) * 100) : 0,
        }))
        .filter((item) => item.failRate > 15)
        .sort((a, b) => b.failRate - a.failRate)
        .slice(0, 3);
      return { name: c.name, rate, failedItems };
    })
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5);

  // 兼容降级模式字段
  const riskAreas = Object.values(itemFailMap)
    .map((d) => ({
      title: d.title,
      failRate: d.total > 0 ? Math.round((d.failed / d.total) * 100) : 0,
      total: d.total,
      failed: d.failed,
    }))
    .filter((d) => d.failRate > 15)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 5);

  return {
    source: "rule" as const,
    trendData,
    riskAlerts,
    gradeComparisonData,
    focusClasses,
    riskAreas,
    recommendations: riskAlerts.map((a) => ({ title: a.title, reason: a.detail, priority: a.level })),
  };
}

/**
 * [固定规则] GRADE_LEADER 年级分析
 *
 * 规则版本: v2.0
 * 最后更新: 2026-02-14
 *
 * 输入: 指定年级班级的近30天日评记录 + 本周/上周/4周前达标率
 * 输出: trendData, classRanking, weakAreas(含建议)
 *
 * 规则说明:
 * - trendData: 结构化对象，含环比(weekDiff)和月同比(monthDiff)数据
 * - classRanking: 按达标率降序排列（直接从 DB 聚合）
 * - weakAreas: 该年级不达标率 > 15% 的检查项，合计最多5条，每条含 suggestion
 *
 * 注意: 此规则不使用 AI/LLM，完全基于数据计算
 */
async function buildGradeLeaderAnalysis(
  grade: number,
  scopedClassIds: string[],
  today: string,
  weekPassRate: number,
  prevWeekRate: number,
  fourWeeksAgoRate: number,
  ta: (key: string, params?: Record<string, string | number>) => string,
) {
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const recentRecords = await prisma.checkRecord.findMany({
    where: {
      date: { gte: thirtyDaysAgo },
      checkItem: { module: "DAILY" },
      classId: { in: scopedClassIds },
    },
    include: { checkItem: true, class: true },
  });

  // 各班级达标率
  const classStats: Record<string, { name: string; total: number; passed: number }> = {};
  for (const r of recentRecords) {
    if (!classStats[r.classId]) {
      classStats[r.classId] = { name: r.class.name, total: 0, passed: 0 };
    }
    classStats[r.classId].total++;
    if (r.passed === true) classStats[r.classId].passed++;
  }

  // 各检查项不达标率
  const itemFailMap: Record<string, { title: string; total: number; failed: number }> = {};
  for (const r of recentRecords) {
    const key = r.checkItem.code || r.checkItemId;
    if (!itemFailMap[key]) {
      itemFailMap[key] = { title: r.checkItem.title, total: 0, failed: 0 };
    }
    itemFailMap[key].total++;
    if (r.passed === false) itemFailMap[key].failed++;
  }

  // --- trendData（环比 + 月同比） ---
  const weekDiff = weekPassRate - prevWeekRate;
  const monthDiff = weekPassRate - fourWeeksAgoRate;
  let summary: string;
  if (weekDiff > 2) {
    summary = ta("gradeTrendUp", { grade, rate: weekPassRate, diff: weekDiff });
  } else if (weekDiff < -2) {
    summary = ta("gradeTrendDown", { grade, rate: weekPassRate, diff: Math.abs(weekDiff) });
  } else {
    summary = ta("gradeTrendStable", { grade, rate: weekPassRate });
  }
  const trendData = {
    weekRate: weekPassRate,
    prevWeekRate,
    fourWeeksAgoRate,
    weekDiff,
    monthDiff,
    summary,
  };

  // --- classRanking ---
  const classRanking = Object.values(classStats)
    .map((c) => ({ name: c.name, rate: c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate);

  // --- weakAreas（合并建议，合计最多5条） ---
  const allWeakAreas = Object.values(itemFailMap)
    .map((d) => ({
      title: d.title,
      failRate: d.total > 0 ? Math.round((d.failed / d.total) * 100) : 0,
    }))
    .filter((d) => d.failRate > 15)
    .sort((a, b) => b.failRate - a.failRate);

  const weakAreas = allWeakAreas.slice(0, 5).map((area) => ({
    ...area,
    suggestion: area.failRate > 30
      ? ta("weakHighSuggestion", { title: area.title })
      : ta("weakMediumSuggestion", { title: area.title }),
  }));

  // 兼容降级字段
  const riskAreas = weakAreas.map((d) => ({
    title: d.title,
    failRate: d.failRate,
    total: 0,
    failed: 0,
  }));

  return {
    source: "rule" as const,
    trendData,
    classRanking,
    weakAreas,
    riskAreas,
    recommendations: weakAreas.map((a) => ({
      title: a.title,
      reason: a.failRate > 30 ? ta("fallbackRiskHigh", { rate: a.failRate }) : ta("fallbackRiskMedium", { rate: a.failRate }),
      priority: (a.failRate > 30 ? "high" : "medium") as "high" | "medium",
    })),
  };
}

/**
 * [固定规则] 通用降级分析（用于无数据或异常情况）
 *
 * 规则版本: v1.0
 * 最后更新: 2026-02-14
 *
 * 注意: 此规则不使用 AI/LLM，完全基于数据计算
 */
async function buildFallbackAnalysis(scopedClassIds: string[], today: string, ta: (key: string, params?: Record<string, string | number>) => string) {
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const recentRecords = await prisma.checkRecord.findMany({
    where: {
      date: { gte: thirtyDaysAgo },
      checkItem: { module: "DAILY" },
      ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
    },
    include: { checkItem: true },
  });

  const itemFailMap: Record<string, { title: string; total: number; failed: number }> = {};
  for (const r of recentRecords) {
    const key = r.checkItem.code || r.checkItemId;
    if (!itemFailMap[key]) {
      itemFailMap[key] = { title: r.checkItem.title, total: 0, failed: 0 };
    }
    itemFailMap[key].total++;
    if (r.passed === false) itemFailMap[key].failed++;
  }

  const riskAreas = Object.values(itemFailMap)
    .map((d) => ({
      title: d.title,
      failRate: d.total > 0 ? Math.round((d.failed / d.total) * 100) : 0,
      total: d.total,
      failed: d.failed,
    }))
    .filter((d) => d.failRate > 15)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 5);

  const recommendations: Array<{ title: string; reason: string; priority: "high" | "medium" }> = [];
  for (const area of riskAreas) {
    if (area.failRate > 30) {
      recommendations.push({
        title: area.title,
        reason: ta("fallbackFocusHigh", { rate: area.failRate }),
        priority: "high",
      });
    } else {
      recommendations.push({
        title: area.title,
        reason: ta("fallbackFocusMedium", { rate: area.failRate }),
        priority: "medium",
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: ta("keepCurrentPace"),
      reason: ta("keepCurrentPaceReason"),
      priority: "medium",
    });
  }

  return { source: "fallback" as const, riskAreas, recommendations };
}

export async function GET(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const ta = createTranslator(locale, "api.analysis");

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getChinaToday();
  // 智能周范围：校历开学后用校历周，否则用自然周
  const chinaToday = new Date(today + "T12:00:00+08:00");
  const inSchoolSemester = today >= CURRENT_CALENDAR.startDate && today <= CURRENT_CALENDAR.endDate;
  const schoolWeek = inSchoolSemester ? getCurrentWeek() : undefined;
  let weekStart: string;
  let weekEnd: string;
  let weekMode: "school" | "natural";
  let schoolWeekNumber: number | null = null;
  if (schoolWeek) {
    weekStart = schoolWeek.startDate;
    weekEnd = schoolWeek.endDate;
    weekMode = "school";
    schoolWeekNumber = schoolWeek.week;
  } else {
    weekStart = format(startOfWeek(chinaToday, { weekStartsOn: 1 }), "yyyy-MM-dd");
    weekEnd = format(endOfWeek(chinaToday, { weekStartsOn: 1 }), "yyyy-MM-dd");
    weekMode = "natural";
  }

  const isGradeLeader = session.user.role === "GRADE_LEADER";
  const isDutyTeacher = session.user.role === "DUTY_TEACHER";
  const managedGrade = session.user.managedGrade;
  const hasGradeScope = (isGradeLeader || isDutyTeacher) && managedGrade != null;
  const gradeClassFilter = hasGradeScope ? { grade: managedGrade } : {};

  try {
    const scopedClasses = await prisma.class.findMany({
      where: gradeClassFilter,
      select: { id: true, name: true, grade: true },
    });
    const scopedClassIds = scopedClasses.map((c) => c.id);

    // ===== 基础统计 =====

    // 今日计划数量（含检查项详情）
    const todayPlans = await prisma.dailyPlan.findMany({
      where: { date: today },
      include: {
        items: {
          include: {
            checkItem: { select: { id: true, code: true, title: true } },
          },
        },
      },
    });
    const todayPlanItemCount = todayPlans.reduce((sum, p) => sum + p.items.length, 0);

    // 今日动态临增项（含详情）
    const todayDynamicItems = await prisma.checkItem.findMany({
      where: { isDynamic: true, date: today, isActive: true },
      select: { id: true, code: true, title: true },
    });
    const todayDynamicCount = todayDynamicItems.length;

    // 今日计划选中的检查项（计划固定项 + 动态临增项，去重）
    const plannedItemMap = new Map<string, { id: string; code: string | null; title: string }>();
    for (const plan of todayPlans) {
      for (const pi of plan.items) {
        plannedItemMap.set(pi.checkItem.id, pi.checkItem);
      }
    }
    for (const di of todayDynamicItems) {
      plannedItemMap.set(di.id, di);
    }
    const todayPlannedItems = Array.from(plannedItemMap.values());

    // 今日已检查的班级数
    const todayScoredClasses = await prisma.checkRecord.findMany({
      where: {
        date: today,
        checkItem: { module: "DAILY" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
      select: { classId: true },
      distinct: ["classId"],
    });

    const totalClasses = scopedClasses.length;

    // 本周日评达标率
    const weekDailyRecords = await prisma.checkRecord.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        checkItem: { module: "DAILY" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
    });
    const weekTotal = weekDailyRecords.length;
    const weekPassed = weekDailyRecords.filter((r) => r.passed === true).length;
    const weekPassRate = weekTotal > 0 ? Math.round((weekPassed / weekTotal) * 100) : 0;

    // 本周周评等级分布
    const weekGrades = await prisma.checkRecord.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        checkItem: { code: "W-5" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
    });
    const gradeDistribution = { A: 0, B: 0, C: 0, unrated: 0 };
    const ratedClassIds = new Set<string>();
    for (const g of weekGrades) {
      if (g.optionValue === "A" || g.optionValue === "B" || g.optionValue === "C") {
        gradeDistribution[g.optionValue]++;
        ratedClassIds.add(g.classId);
      }
    }
    gradeDistribution.unrated = totalClasses - ratedClassIds.size;

    // 周等级分布对应班级明细（hover 用）
    const gradeDistributionClasses: Record<string, string[]> = { A: [], B: [], C: [], unrated: [] };
    for (const g of weekGrades) {
      const cls = scopedClasses.find((c) => c.id === g.classId);
      if (cls && (g.optionValue === "A" || g.optionValue === "B" || g.optionValue === "C")) {
        gradeDistributionClasses[g.optionValue].push(cls.name);
      }
    }
    for (const cls of scopedClasses) {
      if (!ratedClassIds.has(cls.id)) {
        gradeDistributionClasses.unrated.push(cls.name);
      }
    }

    // 获取最近4周的 W-5 等级（用于流动红旗和连续预警）
    const fourWeeksAgo = format(subDays(new Date(weekStart), 28), "yyyy-MM-dd");
    const recentAllGrades = await prisma.checkRecord.findMany({
      where: {
        date: { gte: fourWeeksAgo },
        checkItem: { code: "W-5" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
      orderBy: { date: "asc" },
    });

    // 按班级分组最近的等级序列
    const recentGradesByClass: Record<string, string[]> = {};
    for (const r of recentAllGrades) {
      if (!recentGradesByClass[r.classId]) recentGradesByClass[r.classId] = [];
      if (r.optionValue) recentGradesByClass[r.classId].push(r.optionValue);
    }

    // 流动红旗班级：连续2周及以上 A
    const excellentClasses: Array<{ id: string; name: string; grade: number; weeks: number }> = [];
    for (const cls of scopedClasses) {
      const grades = recentGradesByClass[cls.id] ?? [];
      if (grades.length >= 2) {
        // 统计末尾连续A的次数
        let consecutiveA = 0;
        for (let i = grades.length - 1; i >= 0; i--) {
          if (grades[i] === "A") consecutiveA++;
          else break;
        }
        if (consecutiveA >= 2) {
          excellentClasses.push({ id: cls.id, name: cls.name, grade: cls.grade, weeks: consecutiveA });
        }
      }
    }

    // 连续预警班级：连续2周及以上 C
    const warningClasses: Array<{
      classId: string; className: string; grade: number; weeks: number;
      failedItems?: Array<{ code: string | null; title: string }>;
    }> = [];
    for (const cls of scopedClasses) {
      const grades = recentGradesByClass[cls.id] ?? [];
      if (grades.length >= 2) {
        let consecutiveC = 0;
        for (let i = grades.length - 1; i >= 0; i--) {
          if (grades[i] === "C") consecutiveC++;
          else break;
        }
        if (consecutiveC >= 2) {
          warningClasses.push({ classId: cls.id, className: cls.name, grade: cls.grade, weeks: consecutiveC });
        }
      }
    }

    // 为预警班级附加不达标条目明细（hover 用）— 批量查询避免 N+1
    if (warningClasses.length > 0) {
      const warningClassIds = warningClasses.map((wc) => wc.classId);
      const allFailedRecords = await prisma.checkRecord.findMany({
        where: {
          classId: { in: warningClassIds },
          passed: false,
          date: { gte: fourWeeksAgo },
        },
        include: { checkItem: { select: { code: true, title: true } } },
      });
      // 按班级分组，并对检查项去重
      const failedByClass: Record<string, Map<string, { code: string | null; title: string }>> = {};
      for (const r of allFailedRecords) {
        if (!failedByClass[r.classId]) failedByClass[r.classId] = new Map();
        failedByClass[r.classId].set(r.checkItemId, {
          code: r.checkItem.code,
          title: r.checkItem.title,
        });
      }
      for (const wc of warningClasses) {
        wc.failedItems = Array.from(failedByClass[wc.classId]?.values() ?? []);
      }
    }

    // 显著进步班级：上一次是 C 或 B，最新是 A 或从 C 升到 B
    const improvedClasses: Array<{ classId: string; className: string; grade: number; from: string; to: string }> = [];
    for (const cls of scopedClasses) {
      const grades = recentGradesByClass[cls.id] ?? [];
      if (grades.length >= 2) {
        const prev = grades[grades.length - 2];
        const curr = grades[grades.length - 1];
        const gradeVal: Record<string, number> = { A: 3, B: 2, C: 1 };
        if ((gradeVal[curr] ?? 0) > (gradeVal[prev] ?? 0)) {
          improvedClasses.push({ classId: cls.id, className: cls.name, grade: cls.grade, from: prev, to: curr });
        }
      }
    }

    const stats = {
      todayPlanItems: todayPlanItemCount + todayDynamicCount,
      scoredClasses: todayScoredClasses.length,
      totalClasses,
      weekPassRate,
      weekTotal,
      weekPassed,
    };

    // ===== 近7工作日达标率趋势（按年级） =====
    const workingDays = getLast7WorkingDays();
    const distinctGrades = await prisma.class.findMany({ select: { grade: true }, distinct: ["grade"], orderBy: { grade: "asc" } });
    const grades = hasGradeScope ? [managedGrade!] : distinctGrades.map(g => g.grade);

    // 批量查询所有工作日的记录（避免 N+1），再在内存中按日期分组
    const allTrendRecords = await prisma.checkRecord.findMany({
      where: {
        date: { in: workingDays },
        checkItem: { module: "DAILY" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
      include: { class: { select: { grade: true } } },
    });
    const trendByDate: Record<string, typeof allTrendRecords> = {};
    for (const r of allTrendRecords) {
      if (!trendByDate[r.date]) trendByDate[r.date] = [];
      trendByDate[r.date].push(r);
    }
    const weeklyTrend = workingDays.map((date) => {
      const dayRecords = trendByDate[date] ?? [];
      const result: Record<string, number | string> = { date };
      for (const grade of grades) {
        const gradeRecords = dayRecords.filter((r) => r.class.grade === grade);
        const gTotal = gradeRecords.length;
        const gPassed = gradeRecords.filter((r) => r.passed === true).length;
        result[`grade${grade}Rate`] = gTotal > 0 ? Math.round((gPassed / gTotal) * 100) : 0;
      }
      const allTotal = dayRecords.length;
      const allPassed = dayRecords.filter((r) => r.passed === true).length;
      result.overallRate = allTotal > 0 ? Math.round((allPassed / allTotal) * 100) : 0;
      return result;
    });

    // ===== 今日检查项 =====
    const todayCheckItems = await prisma.checkItem.findMany({
      where: {
        OR: [
          { isDynamic: false, module: "DAILY", isActive: true },
          { isDynamic: true, date: today, isActive: true },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });

    // 今日未检查的班级
    const scoredClassIdSet = new Set(todayScoredClasses.map((s) => s.classId));
    const unscoredClasses = scopedClasses.filter((c) => !scoredClassIdSet.has(c.id));

    // ===== 分析模块（ADMIN/GRADE_LEADER 使用固定规则，DUTY_TEACHER 使用 LLM） =====
    // 计算上周达标率用于趋势环比
    const prevWeekStart = format(subDays(new Date(weekStart), 7), "yyyy-MM-dd");
    const prevWeekEnd = format(subDays(new Date(weekStart), 1), "yyyy-MM-dd");
    const prevWeekRecords = await prisma.checkRecord.findMany({
      where: {
        date: { gte: prevWeekStart, lte: prevWeekEnd },
        checkItem: { module: "DAILY" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
    });
    const prevWeekTotal = prevWeekRecords.length;
    const prevWeekPassed = prevWeekRecords.filter((r) => r.passed === true).length;
    const prevWeekRate = prevWeekTotal > 0 ? Math.round((prevWeekPassed / prevWeekTotal) * 100) : 0;

    // 计算4周前同期达标率用于月同比
    const fourWeeksAgoStart = format(subDays(new Date(weekStart), 28), "yyyy-MM-dd");
    const fourWeeksAgoEnd = format(subDays(new Date(weekStart), 22), "yyyy-MM-dd");
    const fourWeeksAgoRecords = await prisma.checkRecord.findMany({
      where: {
        date: { gte: fourWeeksAgoStart, lte: fourWeeksAgoEnd },
        checkItem: { module: "DAILY" },
        ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
      },
    });
    const fourWeeksAgoTotal = fourWeeksAgoRecords.length;
    const fourWeeksAgoPassed = fourWeeksAgoRecords.filter((r) => r.passed === true).length;
    const fourWeeksAgoRate = fourWeeksAgoTotal > 0 ? Math.round((fourWeeksAgoPassed / fourWeeksAgoTotal) * 100) : 0;

    let aiAnalysis: Record<string, unknown>;

    if (isDutyTeacher) {
      // DUTY_TEACHER: 使用 LLM 文字建议
      const llmResult = await prisma.aiAnalysis.findUnique({
        where: { date_scope: { date: today, scope: "duty" } },
      });
      if (llmResult) {
        try {
          const parsed = JSON.parse(llmResult.content);
          aiAnalysis = { source: "llm", ...parsed };
        } catch {
          aiAnalysis = await buildFallbackAnalysis(scopedClassIds, today, ta);
        }
      } else {
        aiAnalysis = await buildFallbackAnalysis(scopedClassIds, today, ta);
      }
    } else if (isGradeLeader && managedGrade != null) {
      // GRADE_LEADER: 固定规则分析
      aiAnalysis = await buildGradeLeaderAnalysis(managedGrade, scopedClassIds, today, weekPassRate, prevWeekRate, fourWeeksAgoRate, ta);
    } else {
      // ADMIN: 固定规则分析
      aiAnalysis = await buildAdminAnalysis(scopedClassIds, today, weekPassRate, prevWeekRate, fourWeeksAgoRate, ta);
    }
    // CLASS_TEACHER 在下方单独处理

    const response: Record<string, unknown> = {
      stats,
      gradeDistribution,
      gradeDistributionClasses,
      excellentClasses,
      warningClasses,
      improvedClasses,
      weeklyTrend,
      todayCheckItems,
      todayPlannedItems,
      unscoredClasses,
      weekMode,
      schoolWeekNumber,
    };

    if (hasGradeScope) {
      response.managedGrade = managedGrade;
    }

    // ===== ADMIN 专属扩展指标 =====
    if (session.user.role === "ADMIN") {
      // --- 1. 总览仪表盘：本周 / 近30天 / 本学期 达标率 ---
      const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const monthRecords = await prisma.checkRecord.findMany({
        where: { date: { gte: thirtyDaysAgo }, checkItem: { module: "DAILY" } },
      });
      const monthPassCount = monthRecords.filter((r) => r.passed === true).length;
      const monthRate = monthRecords.length > 0 ? Math.round((monthPassCount / monthRecords.length) * 100) : 0;

      const semester = await prisma.semester.findFirst({ where: { isCurrent: true } });
      let semesterRate = 0;
      if (semester) {
        const semesterRecords = await prisma.checkRecord.findMany({
          where: { date: { gte: semester.startDate }, checkItem: { module: "DAILY" } },
        });
        const semPassCount = semesterRecords.filter((r) => r.passed === true).length;
        semesterRate = semesterRecords.length > 0 ? Math.round((semPassCount / semesterRecords.length) * 100) : 0;
      } else {
        semesterRate = monthRate; // 无学期数据时降级为月数据
      }

      response.overallGauge = {
        weekRate: weekPassRate,
        monthRate,
        semesterRate,
      };

      // --- 2. 各年级今日检查完成度 ---
      const scoredClassIdSetForGrade = new Set(todayScoredClasses.map((s) => s.classId));
      const gradeMap: Record<number, { total: number; scored: number }> = {};
      for (const cls of scopedClasses) {
        if (!gradeMap[cls.grade]) gradeMap[cls.grade] = { total: 0, scored: 0 };
        gradeMap[cls.grade].total++;
        if (scoredClassIdSetForGrade.has(cls.id)) gradeMap[cls.grade].scored++;
      }
      response.gradeProgress = Object.entries(gradeMap)
        .map(([g, v]) => ({
          grade: Number(g),
          totalClasses: v.total,
          scoredClasses: v.scored,
          percentage: v.total > 0 ? Math.round((v.scored / v.total) * 100) : 0,
        }))
        .sort((a, b) => a.grade - b.grade);

      // --- 3. 值日教师工作状态 ---
      const dutyTeachers = await prisma.user.findMany({
        where: { role: "DUTY_TEACHER" },
        select: { id: true, name: true, managedGrade: true },
      });
      const dutyTeacherScoringToday = await prisma.checkRecord.findMany({
        where: {
          date: today,
          checkItem: { module: "DAILY" },
          scoredById: { in: dutyTeachers.map((d) => d.id) },
        },
        select: { scoredById: true, classId: true, createdAt: true },
      });
      const dutyTeacherScoreMap: Record<string, { classIds: Set<string>; lastAt: Date | null }> = {};
      for (const r of dutyTeacherScoringToday) {
        if (!dutyTeacherScoreMap[r.scoredById]) {
          dutyTeacherScoreMap[r.scoredById] = { classIds: new Set(), lastAt: null };
        }
        dutyTeacherScoreMap[r.scoredById].classIds.add(r.classId);
        if (!dutyTeacherScoreMap[r.scoredById].lastAt || r.createdAt > dutyTeacherScoreMap[r.scoredById].lastAt!) {
          dutyTeacherScoreMap[r.scoredById].lastAt = r.createdAt;
        }
      }
      response.dutyTeacherStatus = {
        totalDutyTeachers: dutyTeachers.length,
        activeTodayCount: Object.keys(dutyTeacherScoreMap).length,
        teachers: dutyTeachers.map((dt) => ({
          id: dt.id,
          name: dt.name,
          managedGrade: dt.managedGrade,
          scoredCount: dutyTeacherScoreMap[dt.id]?.classIds.size ?? 0,
          lastActiveAt: dutyTeacherScoreMap[dt.id]?.lastAt?.toISOString() ?? null,
        })),
      };

      // --- 4. 检查项薄弱度排名（近30天全校） ---
      const itemFailMap30: Record<string, { code: string | null; title: string; total: number; failed: number }> = {};
      const monthRecordsWithItem = await prisma.checkRecord.findMany({
        where: { date: { gte: thirtyDaysAgo }, checkItem: { module: "DAILY" } },
        include: { checkItem: { select: { code: true, title: true } } },
      });
      for (const r of monthRecordsWithItem) {
        const key = r.checkItem.code || r.checkItemId;
        if (!itemFailMap30[key]) {
          itemFailMap30[key] = { code: r.checkItem.code, title: r.checkItem.title, total: 0, failed: 0 };
        }
        itemFailMap30[key].total++;
        if (r.passed === false) itemFailMap30[key].failed++;
      }
      response.checkItemFailRates = Object.values(itemFailMap30)
        .map((d) => ({
          code: d.code,
          title: d.title,
          failRate: d.total > 0 ? Math.round((d.failed / d.total) * 100) : 0,
          total: d.total,
          failed: d.failed,
        }))
        .sort((a, b) => b.failRate - a.failRate);

      // --- 5. 最佳检查尺度教师（近14天偏差最小的3位值日教师） ---
      const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");
      const allDutyTeachers = await prisma.user.findMany({
        where: { role: "DUTY_TEACHER" },
        select: { id: true, name: true, managedGrade: true },
      });
      const recentDutyRecords = await prisma.checkRecord.findMany({
        where: {
          date: { gte: fourteenDaysAgo },
          checkItem: { module: "DAILY" },
          scoredById: { in: allDutyTeachers.map((d) => d.id) },
        },
        select: { scoredById: true, passed: true, createdAt: true },
      });
      // 全校平均达标率（近14天）
      const totalRecentPassed = recentDutyRecords.filter((r) => r.passed === true).length;
      const schoolAvg14 = recentDutyRecords.length > 0
        ? Math.round((totalRecentPassed / recentDutyRecords.length) * 1000) / 10
        : 0;
      // 每位教师的个人达标率和偏差
      const teacherStats = allDutyTeachers.map((dt) => {
        const myRecords = recentDutyRecords.filter((r) => r.scoredById === dt.id);
        const myPassed = myRecords.filter((r) => r.passed === true).length;
        const myRate = myRecords.length > 0
          ? Math.round((myPassed / myRecords.length) * 1000) / 10
          : null;
        return {
          id: dt.id,
          name: dt.name,
          grade: dt.managedGrade,
          passRate: myRate,
          schoolAvg: schoolAvg14,
          deviation: myRate !== null ? Math.round((myRate - schoolAvg14) * 10) / 10 : null,
          recordCount: myRecords.length,
        };
      }).filter((t) => t.recordCount >= 5); // 至少5条记录才有统计意义
      // 按偏差绝对值排序，取最小的3位
      teacherStats.sort((a, b) => Math.abs(a.deviation ?? 999) - Math.abs(b.deviation ?? 999));
      response.balancedTeachers = {
        teachers: teacherStats.slice(0, 3),
      };

      // --- 5b. 评价时间分布（近14天，按小时统计） ---
      const hourCountMap: Record<number, number> = {};
      for (const r of recentDutyRecords) {
        const hour = r.createdAt.getHours();
        hourCountMap[hour] = (hourCountMap[hour] ?? 0) + 1;
      }
      response.scoringTimeDistribution = Object.entries(hourCountMap)
        .map(([h, count]) => ({ hour: Number(h), count }))
        .sort((a, b) => a.hour - b.hour);

      // --- 6. 本周周评完成状态（按年级） ---
      const weeklyW5Records = weekGrades; // 已在上方查询过
      const reviewByGrade: Record<number, Set<string>> = {};
      for (const r of weeklyW5Records) {
        const cls = scopedClasses.find((c) => c.id === r.classId);
        if (cls) {
          if (!reviewByGrade[cls.grade]) reviewByGrade[cls.grade] = new Set();
          reviewByGrade[cls.grade].add(r.classId);
        }
      }
      const allGradeNums = [...new Set(scopedClasses.map((c) => c.grade))].sort();
      response.weeklyReviewStatus = {
        grades: allGradeNums.map((g) => {
          const gradeTotal = scopedClasses.filter((c) => c.grade === g).length;
          const reviewed = reviewByGrade[g]?.size ?? 0;
          return {
            grade: g,
            totalClasses: gradeTotal,
            reviewedClasses: reviewed,
            isComplete: reviewed >= gradeTotal,
          };
        }),
      };
    }

    // ===== GRADE_LEADER 专属扩展指标 =====
    if (isGradeLeader && managedGrade != null) {
      // --- 1. classRanking 增强：prevRate、trend、recentGrades、标签、failedItems ---
      const prevWeekClassRecords = await prisma.checkRecord.findMany({
        where: {
          date: { gte: prevWeekStart, lte: prevWeekEnd },
          checkItem: { module: "DAILY" },
          classId: { in: scopedClassIds },
        },
        select: { classId: true, passed: true },
      });
      const prevClassStats: Record<string, { total: number; passed: number }> = {};
      for (const r of prevWeekClassRecords) {
        if (!prevClassStats[r.classId]) prevClassStats[r.classId] = { total: 0, passed: 0 };
        prevClassStats[r.classId].total++;
        if (r.passed === true) prevClassStats[r.classId].passed++;
      }
      const excellentClassIds = new Set(excellentClasses.map((c) => c.id));
      const warningClassMap = new Map(warningClasses.map((c) => [c.className, c]));
      const classNameToId = new Map(scopedClasses.map((c) => [c.name, c.id]));

      const baseRanking = (aiAnalysis as Record<string, unknown>).classRanking as Array<{ name: string; rate: number }> | undefined;
      if (baseRanking) {
        (aiAnalysis as Record<string, unknown>).classRanking = baseRanking.map((cls) => {
          const classId = classNameToId.get(cls.name);
          const ps = classId ? prevClassStats[classId] : null;
          const prevRate = ps && ps.total > 0 ? Math.round((ps.passed / ps.total) * 100) : null;
          const trend = prevRate !== null
            ? (cls.rate - prevRate > 2 ? "up" : cls.rate - prevRate < -2 ? "down" : "stable")
            : "stable";
          const grades = classId ? (recentGradesByClass[classId] ?? []) : [];
          const isExcellent = classId ? excellentClassIds.has(classId) : false;
          const wc = warningClassMap.get(cls.name);
          return {
            ...cls,
            prevRate,
            trend,
            recentGrades: grades.slice(-4),
            isExcellent,
            isWarning: !!wc,
            failedItems: wc?.failedItems ?? [],
          };
        });
      }

      // --- 2. 值日教师活跃度（增强：weekTotal、passRate14d、deviation） ---
      const gradeDutyTeachers = await prisma.user.findMany({
        where: { role: "DUTY_TEACHER", managedGrade },
        select: { id: true, name: true, managedGrade: true },
      });
      if (gradeDutyTeachers.length > 0) {
        const gradeDtIds = gradeDutyTeachers.map((dt) => dt.id);
        // 今日评分
        const gradeDtRecordsToday = await prisma.checkRecord.findMany({
          where: { date: today, scoredById: { in: gradeDtIds }, checkItem: { module: "DAILY" } },
          select: { scoredById: true, classId: true, createdAt: true },
        });
        const dtTodayMap: Record<string, { classIds: Set<string>; lastAt: Date | null }> = {};
        for (const r of gradeDtRecordsToday) {
          if (!dtTodayMap[r.scoredById]) dtTodayMap[r.scoredById] = { classIds: new Set(), lastAt: null };
          dtTodayMap[r.scoredById].classIds.add(r.classId);
          if (!dtTodayMap[r.scoredById].lastAt || r.createdAt > dtTodayMap[r.scoredById].lastAt!) {
            dtTodayMap[r.scoredById].lastAt = r.createdAt;
          }
        }
        // 本周评分数量
        const gradeDtRecordsWeek = await prisma.checkRecord.findMany({
          where: { date: { gte: weekStart, lte: weekEnd }, scoredById: { in: gradeDtIds }, checkItem: { module: "DAILY" } },
          select: { scoredById: true },
        });
        const dtWeekCount: Record<string, number> = {};
        for (const r of gradeDtRecordsWeek) {
          dtWeekCount[r.scoredById] = (dtWeekCount[r.scoredById] ?? 0) + 1;
        }
        // 近14天个人达标率 + 全校均值
        const fourteenDaysAgoGl = format(subDays(new Date(), 14), "yyyy-MM-dd");
        const gradeDt14dRecords = await prisma.checkRecord.findMany({
          where: { date: { gte: fourteenDaysAgoGl }, scoredById: { in: gradeDtIds }, checkItem: { module: "DAILY" } },
          select: { scoredById: true, passed: true },
        });
        const allSchool14dRecords = await prisma.checkRecord.findMany({
          where: { date: { gte: fourteenDaysAgoGl }, checkItem: { module: "DAILY" } },
          select: { passed: true },
        });
        const schoolPassed14d = allSchool14dRecords.filter((r) => r.passed === true).length;
        const schoolAvg14d = allSchool14dRecords.length > 0
          ? Math.round((schoolPassed14d / allSchool14dRecords.length) * 1000) / 10
          : 0;
        const dtPassMap: Record<string, { total: number; passed: number }> = {};
        for (const r of gradeDt14dRecords) {
          if (!dtPassMap[r.scoredById]) dtPassMap[r.scoredById] = { total: 0, passed: 0 };
          dtPassMap[r.scoredById].total++;
          if (r.passed === true) dtPassMap[r.scoredById].passed++;
        }

        response.dutyTeacherStatus = {
          totalDutyTeachers: gradeDutyTeachers.length,
          activeTodayCount: Object.keys(dtTodayMap).length,
          schoolAvg14d,
          teachers: gradeDutyTeachers.map((dt) => {
            const pm = dtPassMap[dt.id];
            const passRate14d = pm && pm.total >= 5
              ? Math.round((pm.passed / pm.total) * 1000) / 10
              : null;
            return {
              id: dt.id,
              name: dt.name,
              managedGrade: dt.managedGrade,
              scoredCount: dtTodayMap[dt.id]?.classIds.size ?? 0,
              lastActiveAt: dtTodayMap[dt.id]?.lastAt?.toISOString() ?? null,
              weekTotal: dtWeekCount[dt.id] ?? 0,
              passRate14d,
              deviation: passRate14d !== null ? Math.round((passRate14d - schoolAvg14d) * 10) / 10 : null,
            };
          }),
        };
      }

      // --- 3. 跨年级对比 ---
      const allGradeWeekRecords = await prisma.checkRecord.findMany({
        where: { date: { gte: weekStart, lte: weekEnd }, checkItem: { module: "DAILY" } },
        include: { class: { select: { grade: true } } },
      });
      const gradeRateMap: Record<number, { total: number; passed: number }> = {};
      let gcAllTotal = 0;
      let gcAllPassed = 0;
      for (const r of allGradeWeekRecords) {
        const g = r.class.grade;
        if (!gradeRateMap[g]) gradeRateMap[g] = { total: 0, passed: 0 };
        gradeRateMap[g].total++;
        gcAllTotal++;
        if (r.passed === true) { gradeRateMap[g].passed++; gcAllPassed++; }
      }
      const schoolAvgWeek = gcAllTotal > 0 ? Math.round((gcAllPassed / gcAllTotal) * 100) : 0;
      response.gradeComparison = {
        myGrade: managedGrade,
        myRate: weekPassRate,
        schoolAvg: schoolAvgWeek,
        grades: Object.entries(gradeRateMap)
          .map(([g, s]) => ({ grade: Number(g), rate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0 }))
          .sort((a, b) => a.grade - b.grade),
      };

      // --- 4. 全校检查项不达标率基准（年级 vs 全校对比用） ---
      const thirtyDaysAgoItems = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const allSchoolItemRecords = await prisma.checkRecord.findMany({
        where: { date: { gte: thirtyDaysAgoItems }, checkItem: { module: "DAILY" } },
        include: { checkItem: { select: { code: true, title: true } } },
      });
      const schoolItemMap: Record<string, { code: string | null; title: string; total: number; failed: number }> = {};
      for (const r of allSchoolItemRecords) {
        const key = r.checkItem.code || r.checkItemId;
        if (!schoolItemMap[key]) {
          schoolItemMap[key] = { code: r.checkItem.code, title: r.checkItem.title, total: 0, failed: 0 };
        }
        schoolItemMap[key].total++;
        if (r.passed === false) schoolItemMap[key].failed++;
      }
      response.schoolItemFailRates = Object.values(schoolItemMap)
        .map((d) => ({
          code: d.code,
          title: d.title,
          failRate: d.total > 0 ? Math.round((d.failed / d.total) * 100) : 0,
        }))
        .sort((a, b) => b.failRate - a.failRate);

      // --- 5. 最近评分修正记录（本年级近7天有审核的记录） ---
      const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const recentRevisions = await prisma.checkRecord.findMany({
        where: {
          date: { gte: sevenDaysAgo },
          reviewAction: { not: null },
          class: { grade: managedGrade },
        },
        include: {
          checkItem: { select: { code: true, title: true } },
          class: { select: { name: true } },
        },
        orderBy: { reviewedAt: "desc" },
        take: 10,
      });
      response.recentRevisions = recentRevisions.map((r) => ({
        id: r.id,
        date: r.date,
        className: r.class.name,
        checkItemCode: r.checkItem.code,
        checkItemTitle: r.checkItem.title,
        passed: r.passed,
        originalPassed: r.originalPassed,
        scoredByName: r.scoredByName,
        reviewedByName: r.reviewedByName,
        reviewAction: r.reviewAction,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      }));

      // --- 6. 年级 AI 日报（全部班级完成检查后自动生成一次） ---
      const gradeClassIds = scopedClasses.map((c) => c.id);
      const gradeScoredClassIds = new Set(todayScoredClasses.map((s) => s.classId).filter((id) => gradeClassIds.includes(id)));
      const allClassesScored = gradeScoredClassIds.size >= scopedClasses.length && scopedClasses.length > 0;
      response.allClassesScored = allClassesScored;

      if (allClassesScored) {
        const gradeReportScope = `grade-report-${managedGrade}`;
        // 先查缓存
        const cachedReport = await prisma.aiAnalysis.findUnique({
          where: { date_scope: { date: today, scope: gradeReportScope } },
        });
        if (cachedReport) {
          // 已生成，直接返回
          try {
            const parsed = JSON.parse(cachedReport.content);
            response.gradeAiReport = parsed.report ?? cachedReport.content;
          } catch {
            response.gradeAiReport = cachedReport.content;
          }
        } else {
          // 尚未生成，自动触发
          try {
            // 读取模组配置（如有）
            const moduleConfig = await prisma.aiModuleConfig.findUnique({
              where: { scope: gradeReportScope },
            });
            const isActive = moduleConfig?.isActive !== false; // 默认开启
            if (isActive) {
              // 准备提示词数据
              const gradeClasses = scopedClasses;
              const gradeAnalysis = aiAnalysis as Record<string, unknown>;
              const classRanking = gradeAnalysis.classRanking as Array<{ name: string; rate: number }> | undefined;
              const sortedClasses = classRanking ?? [];
              const top3 = sortedClasses.slice(0, 3).map((c) => `${c.name}(${c.rate}%)`).join("、") || "暂无";
              const bottom3 = sortedClasses.slice(-3).reverse().map((c) => `${c.name}(${c.rate}%)`).join("、") || "暂无";
              const weakAreas = (gradeAnalysis.weakAreas as Array<{ title: string; failRate: number }> | undefined) ?? [];
              const weakItems = weakAreas.slice(0, 3).map((w) => `- ${w.title}：不达标率 ${w.failRate}%`).join("\n");
              const checkItemNames = todayPlannedItems.map((i) => i.title).join("、") || "暂无";
              const dtStatus = response.dutyTeacherStatus as { activeTodayCount: number; totalDutyTeachers: number } | undefined;

              const userPrompt = buildGradeReportPrompt({
                grade: managedGrade,
                date: today,
                scored: gradeClasses.length,
                total: gradeClasses.length,
                checkItems: checkItemNames,
                weekRate: weekPassRate,
                weekDiff: weekPassRate - prevWeekRate,
                top3,
                bottom3,
                weakItems,
                activeTeachers: dtStatus?.activeTodayCount ?? 0,
                totalTeachers: dtStatus?.totalDutyTeachers ?? 0,
              }, locale);
              const systemPrompt = moduleConfig?.systemPrompt || getGradeReportSystemPrompt(locale);
              const llmOptions = {
                temperature: moduleConfig?.temperature ?? 0.1,
                maxTokens: moduleConfig?.maxTokens ?? 500,
                model: moduleConfig?.model ?? undefined,
              };

              const { result, tokens } = await analyzeJSON<{ report: string }>(systemPrompt, userPrompt, llmOptions);
              // 缓存结果
              await prisma.aiAnalysis.create({
                data: {
                  date: today,
                  scope: gradeReportScope,
                  content: JSON.stringify(result),
                  tokens,
                },
              });
              response.gradeAiReport = result.report ?? JSON.stringify(result);
              console.log(`[AI GradeReport] ${today} grade=${managedGrade} | ${tokens} tokens | auto-generated`);
            }
          } catch (err) {
            console.error(`[AI GradeReport] 生成失败 grade=${managedGrade}:`, err);
            // 生成失败不影响整体返回，前端会显示"未完成"状态
          }
        }
      }
    }

    // ===== DUTY_TEACHER 专属指标 =====
    if (isDutyTeacher) {
      const teacherId = session.user.id;
      const teacherRecords = await prisma.checkRecord.findMany({
        where: { scoredById: teacherId, checkItem: { module: "DAILY" } },
        include: { checkItem: true },
      });

      const scoredDatesSet = new Set(teacherRecords.map((r) => r.date));
      const totalPassed = teacherRecords.filter((r) => r.passed === true).length;
      const personalPassRate = teacherRecords.length > 0
        ? Math.round((totalPassed / teacherRecords.length) * 100)
        : 0;

      response.dutyTeacherMetrics = {
        totalScoredDays: scoredDatesSet.size,
        totalRecordCount: teacherRecords.length,
        distinctClasses: new Set(teacherRecords.map((r) => r.classId)).size,
        personalPassRate,
      };
    }

    // ===== CLASS_TEACHER 专属指标 =====
    if (session.user.role === "CLASS_TEACHER" && session.user.classId) {
      const classId = session.user.classId;

      const classRecords = await prisma.checkRecord.findMany({
        where: { classId, date: today, checkItem: { module: "DAILY" } },
        include: { checkItem: true },
      });

      const classTotal = classRecords.length;
      const classPassed = classRecords.filter((r) => r.passed === true).length;
      const classPassRate = classTotal > 0 ? Math.round((classPassed / classTotal) * 100) : 0;

      response.classRecords = classRecords;
      response.classPassRateToday = classPassRate;

      // 本周日评达标率
      const classWeekRecords = await prisma.checkRecord.findMany({
        where: {
          classId,
          date: { gte: weekStart, lte: weekEnd },
          checkItem: { module: "DAILY" },
        },
      });
      const cwTotal = classWeekRecords.length;
      const cwPassed = classWeekRecords.filter((r) => r.passed === true).length;
      response.classPassRateWeek = cwTotal > 0 ? Math.round((cwPassed / cwTotal) * 100) : 0;

      // 本周等级
      const classGrade = await prisma.checkRecord.findFirst({
        where: {
          classId,
          date: { gte: weekStart, lte: weekEnd },
          checkItem: { code: "W-5" },
        },
      });
      response.classWeekGrade = classGrade?.optionValue ?? null;

      // CLASS_TEACHER 的 AI 分析：从 class-summary scope 获取 LLM 文字建议
      const classObj = await prisma.class.findUnique({ where: { id: classId } });
      if (classObj) {
        const classSummaryScope = `class-summary-${classObj.name}`;
        const classLlm = await prisma.aiAnalysis.findUnique({
          where: { date_scope: { date: today, scope: classSummaryScope } },
        });
        if (classLlm) {
          try {
            const classData = JSON.parse(classLlm.content);
            aiAnalysis = {
              source: "llm",
              classSummary: classData.classSummary,
              classAdvice: classData.classAdvice,
              weakAreas: classData.weakAreas,
            };
          } catch { /* keep fallback */ }
        }
        // 如果无 LLM 结果，使用固定规则生成简单的数据描述
        if ((aiAnalysis as Record<string, unknown>).source !== "llm") {
          const cwRate = response.classPassRateWeek as number;
          const cwGrade = response.classWeekGrade as string | null;
          aiAnalysis = {
            source: "rule" as const,
            classSummary: ta("classTeacherSummary", { rate: cwRate, gradeInfo: cwGrade ? ta("classTeacherGradeInfo", { grade: cwGrade }) : "" }),
            classAdvice: cwRate < 80
              ? [ta("classTeacherAdviceBad1"), ta("classTeacherAdviceBad2")]
              : [ta("classTeacherAdviceGood1"), ta("classTeacherAdviceGood2")],
          };
        }
      }
    }

    // 确保 aiAnalysis 有 source 字段
    if (!(aiAnalysis as Record<string, unknown>).source) {
      (aiAnalysis as Record<string, unknown>).source = "fallback";
    }
    response.aiAnalysis = aiAnalysis;

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: t("dashboardLoadFailed") }, { status: 500 });
  }
}
