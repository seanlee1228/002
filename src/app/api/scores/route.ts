import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  eachDayOfInterval,
  isWeekend,
} from "date-fns";

function getDateRange(period: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  if (period === "today") {
    return { startDate: today, endDate: today };
  }
  if (period === "week") {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return {
      startDate: format(weekStart, "yyyy-MM-dd"),
      endDate: format(weekEnd, "yyyy-MM-dd"),
    };
  }
  if (period === "month") {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return {
      startDate: format(monthStart, "yyyy-MM-dd"),
      endDate: format(monthEnd, "yyyy-MM-dd"),
    };
  }
  if (period === "year") {
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);
    return {
      startDate: format(yearStart, "yyyy-MM-dd"),
      endDate: format(yearEnd, "yyyy-MM-dd"),
    };
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "today";
    const scope = searchParams.get("scope") ?? "all";
    const gradeParam = searchParams.get("grade");
    let classId = searchParams.get("classId");

    // Class teacher: force to their own class
    if (session.user.role === "CLASS_TEACHER" && session.user.classId) {
      classId = session.user.classId;
    }

    // GRADE_LEADER / DUTY_TEACHER: 默认按年级过滤
    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const isDutyTeacher = session.user.role === "DUTY_TEACHER";
    const managedGrade = session.user.managedGrade;
    const hasGradeScope = (isGradeLeader || isDutyTeacher) && managedGrade != null;

    const dateRange = getDateRange(period);
    if (!dateRange) {
      return NextResponse.json(
        { error: "Invalid period. Use today, week, month, or year" },
        { status: 400 }
      );
    }

    const dateWhere =
      period === "today"
        ? { date: dateRange.startDate }
        : { date: { gte: dateRange.startDate, lte: dateRange.endDate } };

    // ---- scope=class or CLASS_TEACHER: single class detail ----
    if (scope === "class" || classId) {
      if (!classId) {
        return NextResponse.json({ error: "classId is required for scope=class" }, { status: 400 });
      }

      const cls = await prisma.class.findUnique({ where: { id: classId } });
      if (!cls) {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }

      const scores = await prisma.score.findMany({
        where: {
          classId,
          inspectionItem: dateWhere,
        },
        include: { inspectionItem: true },
      });

      // Group by inspection item title
      const byTitle: Record<string, { totalScore: number; maxPossible: number; count: number }> = {};
      for (const s of scores) {
        const title = s.inspectionItem.title;
        if (!byTitle[title]) {
          byTitle[title] = { totalScore: 0, maxPossible: 0, count: 0 };
        }
        byTitle[title].totalScore += s.score;
        byTitle[title].maxPossible += s.inspectionItem.maxScore;
        byTitle[title].count += 1;
      }

      const itemSummaries = Object.entries(byTitle).map(([title, data]) => ({
        title,
        totalScore: Math.round(data.totalScore * 100) / 100,
        maxPossible: Math.round(data.maxPossible * 100) / 100,
        scoreRate: data.maxPossible > 0 ? Math.round((data.totalScore / data.maxPossible) * 1000) / 10 : 0,
        count: data.count,
      }));

      const total = scores.reduce((sum, s) => sum + s.score, 0);
      const avg = scores.length > 0 ? total / scores.length : 0;

      // For today, also return individual items and scores
      let items = null;
      if (period === "today") {
        items = await prisma.inspectionItem.findMany({
          where: { date: dateRange.startDate },
          orderBy: { createdAt: "asc" },
        });
      }

      return NextResponse.json({
        period,
        scope: "class",
        className: cls.name,
        classId: cls.id,
        itemSummaries,
        items,
        scores,
        total: Math.round(total * 100) / 100,
        average: Math.round(avg * 100) / 100,
      });
    }

    // ---- scope=all or scope=grade: multi-class summary ----
    const classWhere: Record<string, unknown> = {};
    if (scope === "grade" && gradeParam) {
      classWhere.grade = parseInt(gradeParam);
    }
    // GRADE_LEADER / DUTY_TEACHER: 强制按年级过滤
    if (hasGradeScope && !classWhere.grade) {
      classWhere.grade = managedGrade;
    }

    const classes = await prisma.class.findMany({
      where: classWhere,
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });

    const allScores = await prisma.score.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        inspectionItem: dateWhere,
      },
      include: { inspectionItem: true, class: true },
    });

    // Group by class
    const byClass: Record<string, typeof allScores> = {};
    for (const s of allScores) {
      if (!byClass[s.classId]) byClass[s.classId] = [];
      byClass[s.classId].push(s);
    }

    const classSummaries = classes.map((cls) => {
      const classScores = byClass[cls.id] ?? [];
      const totalScore = classScores.reduce((sum, s) => sum + s.score, 0);
      const avgScore = classScores.length > 0 ? totalScore / classScores.length : 0;
      return {
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        section: cls.section,
        totalScore: Math.round(totalScore * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        scoreCount: classScores.length,
        rank: 0, // will be set below
      };
    });

    // Sort by avgScore descending for ranking
    const ranked = [...classSummaries].sort((a, b) => b.avgScore - a.avgScore);
    ranked.forEach((item, idx) => {
      item.rank = idx + 1;
    });
    // Apply rank back to original order
    for (const cs of classSummaries) {
      const r = ranked.find((r) => r.classId === cs.classId);
      if (r) cs.rank = r.rank;
    }

    const overallTotal = allScores.reduce((sum, s) => sum + s.score, 0);
    const overallAvg = allScores.length > 0 ? overallTotal / allScores.length : 0;

    return NextResponse.json({
      period,
      scope,
      grade: gradeParam ? parseInt(gradeParam) : undefined,
      classSummaries,
      overallAvg: Math.round(overallAvg * 100) / 100,
      overallTotal: Math.round(overallTotal * 100) / 100,
    });
  } catch (error) {
    console.error("Scores query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scores" },
      { status: 500 }
    );
  }
}
