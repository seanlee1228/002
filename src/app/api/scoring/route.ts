import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logDataChange, logError, getClientIP } from "@/lib/logger";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    // GRADE_LEADER / DUTY_TEACHER: 只显示本年级班级
    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const isDutyTeacher = session.user.role === "DUTY_TEACHER";
    const managedGrade = session.user.managedGrade;
    const hasGradeFilter = (isGradeLeader || isDutyTeacher) && managedGrade != null;
    const classWhere = hasGradeFilter ? { grade: managedGrade } : {};

    // GRADE_LEADER: 检查项显示全校通用 + 本年级专属; DUTY_TEACHER 同理
    const inspectionWhere = hasGradeFilter
      ? { date: today, OR: [{ targetGrade: null }, { targetGrade: managedGrade }] }
      : { date: today };

    const [classes, inspectionItems] = await Promise.all([
      prisma.class.findMany({
        where: classWhere,
        orderBy: [{ grade: "asc" }, { section: "asc" }],
      }),
      prisma.inspectionItem.findMany({
        where: inspectionWhere,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const scores = await prisma.score.findMany({
      where: {
        inspectionItem: { date: today },
      },
      include: { inspectionItem: true },
    });

    const scoresByClass = scores.reduce(
      (acc, s) => {
        if (!acc[s.classId]) acc[s.classId] = [];
        acc[s.classId].push(s);
        return acc;
      },
      {} as Record<string, typeof scores>
    );

    const scoringData = classes.map((cls) => {
      const classScores = scoresByClass[cls.id] ?? [];
      const scoredItemIds = classScores.map((s) => s.inspectionItemId);
      const itemsWithScores = inspectionItems.map((item) => ({
        ...item,
        score: classScores.find((s) => s.inspectionItemId === item.id) ?? null,
        hasBeenScored: scoredItemIds.includes(item.id),
      }));

      return {
        ...cls,
        scores: itemsWithScores,
        scoredItemIds,
      };
    });

    return NextResponse.json({
      date: today,
      classes: scoringData,
      inspectionItems,
    });
  } catch (error) {
    console.error("Scoring get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scoring data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "GRADE_LEADER" &&
    session.user.role !== "DUTY_TEACHER"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { classId, scores: scoreInputs } = body;

    if (!classId || !Array.isArray(scoreInputs)) {
      return NextResponse.json(
        { error: "classId and scores array are required" },
        { status: 400 }
      );
    }

    // GRADE_LEADER / DUTY_TEACHER: 只能评本年级班级
    if ((session.user.role === "GRADE_LEADER" || session.user.role === "DUTY_TEACHER") && session.user.managedGrade != null) {
      const targetClass = await prisma.class.findUnique({ where: { id: classId } });
      if (!targetClass || targetClass.grade !== session.user.managedGrade) {
        return NextResponse.json(
          { error: "只能为本年级班级评分" },
          { status: 403 }
        );
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const itemIds = scoreInputs.map((s: { inspectionItemId: string }) => s.inspectionItemId);

    const items = await prisma.inspectionItem.findMany({
      where: { id: { in: itemIds } },
    });
    const invalidItems = items.filter((i) => i.date !== today);
    if (invalidItems.length > 0) {
      return NextResponse.json(
        { error: "Some inspection items are not for today" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      scoreInputs.map((s: { inspectionItemId: string; score: number; comment?: string }) =>
        prisma.score.upsert({
          where: {
            classId_inspectionItemId: {
              classId,
              inspectionItemId: s.inspectionItemId,
            },
          },
          create: {
            classId,
            inspectionItemId: s.inspectionItemId,
            score: s.score,
            comment: s.comment ?? null,
            scoredById: session.user!.id,
          },
          update: {
            score: s.score,
            comment: s.comment ?? null,
          },
        })
      )
    );

    logDataChange("UPSERT", session.user, "Score", {
      classId,
      itemCount: scoreInputs.length,
      scores: scoreInputs.map((s: { inspectionItemId: string; score: number; comment?: string }) => ({
        inspectionItemId: s.inspectionItemId,
        score: s.score,
        comment: s.comment,
      })),
    }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("提交评分", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to submit scores" },
      { status: 500 }
    );
  }
}
