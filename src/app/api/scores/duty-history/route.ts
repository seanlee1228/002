import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only DUTY_TEACHER can access this endpoint
  if (session.user.role !== "DUTY_TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacherId = session.user.id;
  const url = new URL(request.url);

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")));

  // Optional date range filter (default: last 90 days)
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 90);
  const fromStr = url.searchParams.get("from") || defaultFrom.toISOString().slice(0, 10);
  const toStr = url.searchParams.get("to") || now.toISOString().slice(0, 10);

  // Optional class filter
  const classId = url.searchParams.get("classId") || undefined;

  try {
    // Build where clause: always scoped to this teacher
    const where: Record<string, unknown> = {
      scoredById: teacherId,
      inspectionItem: {
        date: {
          gte: fromStr,
          lte: toStr,
        },
      },
    };

    if (classId) {
      where.classId = classId;
    }

    // Total count for pagination
    const totalCount = await prisma.score.count({ where });

    // Fetch scores with relations
    const scores = await prisma.score.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, grade: true, section: true } },
        inspectionItem: { select: { id: true, title: true, description: true, maxScore: true, date: true } },
      },
      orderBy: [
        { inspectionItem: { date: "desc" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Summary stats (all-time for this teacher, not paginated)
    const allScores = await prisma.score.findMany({
      where: { scoredById: teacherId },
      include: {
        inspectionItem: { select: { date: true, maxScore: true } },
      },
    });

    const scoredDatesSet = new Set(allScores.map((s) => s.inspectionItem.date));
    const distinctClassIds = new Set(allScores.map((s) => s.classId));

    const summary = {
      totalScoredDays: scoredDatesSet.size,
      totalScoreCount: allScores.length,
      distinctClasses: distinctClassIds.size,
    };

    // Classes this teacher has scored (for filter dropdown)
    const classesScored = await prisma.class.findMany({
      where: { id: { in: Array.from(distinctClassIds) } },
      select: { id: true, name: true, grade: true, section: true },
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });

    // Daily summary: grouped by date
    const dailyMap: Record<string, { count: number; totalScore: number; totalMaxScore: number }> = {};
    for (const s of allScores) {
      const date = s.inspectionItem.date;
      if (!dailyMap[date]) dailyMap[date] = { count: 0, totalScore: 0, totalMaxScore: 0 };
      dailyMap[date].count++;
      dailyMap[date].totalScore += s.score;
      dailyMap[date].totalMaxScore += s.inspectionItem.maxScore;
    }

    const dailySummary = Object.entries(dailyMap)
      .map(([date, d]) => ({
        date,
        count: d.count,
        totalScore: Math.round(d.totalScore * 100) / 100,
        totalMaxScore: Math.round(d.totalMaxScore * 100) / 100,
        scoreRate: d.totalMaxScore > 0 ? Math.round((d.totalScore / d.totalMaxScore) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 90); // last 90 days at most

    return NextResponse.json({
      scores: scores.map((s) => ({
        id: s.id,
        score: s.score,
        comment: s.comment,
        class: s.class,
        inspectionItem: s.inspectionItem,
        createdAt: s.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary,
      classesScored,
      dailySummary,
    });
  } catch (error) {
    console.error("Duty history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch duty history" },
      { status: 500 }
    );
  }
}
