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
    const classId = searchParams.get("classId");
    const period = searchParams.get("period") ?? "today";

    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

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

    const itemSummaries = Object.entries(byTitle)
      .map(([title, data]) => ({
        title,
        totalScore: Math.round(data.totalScore * 100) / 100,
        maxPossible: Math.round(data.maxPossible * 100) / 100,
        scoreRate:
          data.maxPossible > 0
            ? Math.round((data.totalScore / data.maxPossible) * 1000) / 10
            : 0,
        count: data.count,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const total = scores.reduce((sum, s) => sum + s.score, 0);
    const avg = scores.length > 0 ? total / scores.length : 0;

    // Compute school-wide and grade-wide average score rates for reference lines
    const [allSchoolScores, allGradeScores] = await Promise.all([
      // School-wide: all classes, same period
      prisma.score.findMany({
        where: { inspectionItem: dateWhere },
        include: { inspectionItem: { select: { maxScore: true } } },
      }),
      // Grade-wide: same grade, same period
      prisma.score.findMany({
        where: {
          class: { grade: cls.grade },
          inspectionItem: dateWhere,
        },
        include: { inspectionItem: { select: { maxScore: true } } },
      }),
    ]);

    const calcAvgRate = (scorelist: typeof allSchoolScores) => {
      if (scorelist.length === 0) return 0;
      const totalS = scorelist.reduce((sum, s) => sum + s.score, 0);
      const totalM = scorelist.reduce((sum, s) => sum + s.inspectionItem.maxScore, 0);
      return totalM > 0 ? Math.round((totalS / totalM) * 1000) / 10 : 0;
    };

    const schoolAvgScoreRate = calcAvgRate(allSchoolScores);
    const gradeAvgScoreRate = calcAvgRate(allGradeScores);

    return NextResponse.json({
      className: cls.name,
      classId: cls.id,
      grade: cls.grade,
      section: cls.section,
      period,
      itemSummaries,
      total: Math.round(total * 100) / 100,
      average: Math.round(avg * 100) / 100,
      schoolAvgScoreRate,
      gradeAvgScoreRate,
    });
  } catch (error) {
    console.error("Scores detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch score details" },
      { status: 500 }
    );
  }
}
