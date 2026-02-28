import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  subWeeks,
} from "date-fns";

function getDateRange(period: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  if (period === "today") return { startDate: today, endDate: today };
  if (period === "week") {
    return {
      startDate: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      endDate: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }
  if (period === "month") {
    return {
      startDate: format(startOfMonth(now), "yyyy-MM-dd"),
      endDate: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }
  if (period === "year") {
    return {
      startDate: format(startOfYear(now), "yyyy-MM-dd"),
      endDate: format(endOfYear(now), "yyyy-MM-dd"),
    };
  }
  return null;
}

// 检测趋势：最近4周等级走向
function detectTrend(grades: string[]): "improving" | "declining" | "stable" {
  if (grades.length < 2) return "stable";

  const gradeValue: Record<string, number> = { A: 3, B: 2, C: 1 };
  const recent = grades.slice(-4).map((g) => gradeValue[g] ?? 0);

  // 简单线性趋势
  let sumDiff = 0;
  for (let i = 1; i < recent.length; i++) {
    sumDiff += recent[i] - recent[i - 1];
  }

  if (sumDiff > 0) return "improving";
  if (sumDiff < 0) return "declining";
  return "stable";
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "week";
    const scope = searchParams.get("scope") ?? "all";
    const gradeParam = searchParams.get("grade");
    let classId = searchParams.get("classId");

    if (session.user.role === "CLASS_TEACHER" && session.user.classId) {
      classId = session.user.classId;
    }

    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const isDutyTeacher = session.user.role === "DUTY_TEACHER";
    const managedGrade = session.user.managedGrade;
    const hasGradeScope = (isGradeLeader || isDutyTeacher) && managedGrade != null;

    const dateRange = getDateRange(period);
    if (!dateRange) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const dateWhere =
      period === "today"
        ? { date: dateRange.startDate }
        : { date: { gte: dateRange.startDate, lte: dateRange.endDate } };

    // ---- scope=class: 单个班级详情 ----
    if (scope === "class" || classId) {
      if (!classId) {
        return NextResponse.json({ error: "classId is required for scope=class" }, { status: 400 });
      }

      const cls = await prisma.class.findUnique({ where: { id: classId } });
      if (!cls) {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }

      const dailyRecords = await prisma.checkRecord.findMany({
        where: { classId, ...dateWhere, checkItem: { module: "DAILY" } },
        include: { checkItem: true },
        orderBy: { date: "desc" },
      });

      const weeklyRecords = await prisma.checkRecord.findMany({
        where: { classId, ...dateWhere, checkItem: { module: "WEEKLY" } },
        include: { checkItem: true },
        orderBy: { date: "desc" },
      });

      const total = dailyRecords.length;
      const passed = dailyRecords.filter((r) => r.passed === true).length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      const byItem: Record<string, { total: number; passed: number; title: string; code: string | null }> = {};
      for (const r of dailyRecords) {
        const key = r.checkItem.code || r.checkItemId;
        if (!byItem[key]) {
          byItem[key] = { total: 0, passed: 0, title: r.checkItem.title, code: r.checkItem.code };
        }
        byItem[key].total++;
        if (r.passed === true) byItem[key].passed++;
      }

      const itemSummaries = Object.values(byItem).map((d) => ({
        title: d.title,
        code: d.code,
        total: d.total,
        passed: d.passed,
        passRate: d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0,
      }));

      const grades = weeklyRecords
        .filter((r) => r.checkItem.code === "W-5")
        .map((r) => ({ date: r.date, grade: r.optionValue }));

      return NextResponse.json({
        period,
        scope: "class",
        className: cls.name,
        classId: cls.id,
        grade: cls.grade,
        dailyPassRate: passRate,
        dailyTotal: total,
        dailyPassed: passed,
        itemSummaries,
        weeklyRecords,
        grades,
        dailyRecords,
      });
    }

    // ---- scope=all / scope=grade: 多班级汇总 ----
    const classWhere: Record<string, unknown> = {};
    if (scope === "grade" && gradeParam) {
      classWhere.grade = parseInt(gradeParam);
    }
    if (hasGradeScope && !classWhere.grade) {
      classWhere.grade = managedGrade;
    }

    const classes = await prisma.class.findMany({
      where: classWhere,
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });

    const allDailyRecords = await prisma.checkRecord.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        ...dateWhere,
        checkItem: { module: "DAILY" },
      },
    });

    const allWeeklyGrades = await prisma.checkRecord.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        ...dateWhere,
        checkItem: { code: "W-5" },
      },
      include: { checkItem: true },
    });

    // 为了趋势检测，额外获取最近4周的 W-5 等级
    const fourWeeksAgo = format(subWeeks(new Date(), 4), "yyyy-MM-dd");
    const allRecentGrades = await prisma.checkRecord.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        date: { gte: fourWeeksAgo },
        checkItem: { code: "W-5" },
      },
      include: { checkItem: true },
      orderBy: { date: "asc" },
    });

    const dailyByClass: Record<string, typeof allDailyRecords> = {};
    for (const r of allDailyRecords) {
      if (!dailyByClass[r.classId]) dailyByClass[r.classId] = [];
      dailyByClass[r.classId].push(r);
    }

    const gradeByClass: Record<string, string[]> = {};
    for (const r of allWeeklyGrades) {
      if (!gradeByClass[r.classId]) gradeByClass[r.classId] = [];
      if (r.optionValue) gradeByClass[r.classId].push(r.optionValue);
    }

    // 最近4周等级（用于趋势和流动红旗判断）
    const recentGradesByClass: Record<string, string[]> = {};
    for (const r of allRecentGrades) {
      if (!recentGradesByClass[r.classId]) recentGradesByClass[r.classId] = [];
      if (r.optionValue) recentGradesByClass[r.classId].push(r.optionValue);
    }

    const classSummaries = classes.map((cls) => {
      const records = dailyByClass[cls.id] ?? [];
      const total = records.length;
      const passed = records.filter((r) => r.passed === true).length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
      const weekGrades = gradeByClass[cls.id] ?? [];
      const recentGrades = recentGradesByClass[cls.id] ?? [];
      const latestGrade = recentGrades.length > 0 ? recentGrades[recentGrades.length - 1] : null;

      // 连续预警：最近4周内任意连续2周 C
      const consecutiveWarnings =
        recentGrades.length >= 2 &&
        recentGrades[recentGrades.length - 1] === "C" &&
        recentGrades[recentGrades.length - 2] === "C";

      // 流动红旗：连续2周及以上 A
      const isExcellent =
        recentGrades.length >= 2 &&
        recentGrades[recentGrades.length - 1] === "A" &&
        recentGrades[recentGrades.length - 2] === "A";

      // 趋势检测
      const trend = detectTrend(recentGrades);

      return {
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        section: cls.section,
        dailyPassRate: passRate,
        dailyTotal: total,
        dailyPassed: passed,
        latestGrade,
        weekGrades,
        recentGrades,
        consecutiveWarnings,
        isExcellent,
        trend,
      };
    });

    // 按等级分组排序（A组 > B组 > C组 > 未评定），组内按达标率
    const gradeOrder: Record<string, number> = { A: 3, B: 2, C: 1 };
    classSummaries.sort((a, b) => {
      const ga = gradeOrder[a.latestGrade ?? ""] ?? 0;
      const gb = gradeOrder[b.latestGrade ?? ""] ?? 0;
      if (ga !== gb) return gb - ga;
      return b.dailyPassRate - a.dailyPassRate;
    });

    const overallTotal = allDailyRecords.length;
    const overallPassed = allDailyRecords.filter((r) => r.passed === true).length;
    const overallPassRate = overallTotal > 0 ? Math.round((overallPassed / overallTotal) * 100) : 0;

    return NextResponse.json({
      period,
      scope,
      grade: gradeParam ? parseInt(gradeParam) : undefined,
      classSummaries,
      overallPassRate,
      overallTotal,
      overallPassed,
    });
  } catch (error) {
    console.error("Scores query error:", error);
    return NextResponse.json({ error: t("scoresLoadFailed") }, { status: 500 });
  }
}
