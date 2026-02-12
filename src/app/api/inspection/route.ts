import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    // 构建查询条件: 全校通用项 + 当前用户年级的专属项
    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const managedGrade = session.user.managedGrade;

    let where: Record<string, unknown> = {};
    if (date) {
      if (isGradeLeader && managedGrade != null) {
        // GRADE_LEADER: 返回全校项 + 本年级专属项
        where = {
          date,
          OR: [
            { targetGrade: null },
            { targetGrade: managedGrade },
          ],
        };
      } else {
        where = { date };
      }
    } else {
      if (isGradeLeader && managedGrade != null) {
        where = {
          OR: [
            { targetGrade: null },
            { targetGrade: managedGrade },
          ],
        };
      }
    }

    const items = await prisma.inspectionItem.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { scores: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Inspection list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inspection items" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { title, description, maxScore, date } = body;

    if (!title || !date) {
      return NextResponse.json(
        { error: "title and date are required" },
        { status: 400 }
      );
    }

    // GRADE_LEADER 创建的检查项自动设为年级专属
    const targetGrade = session.user.role === "GRADE_LEADER"
      ? session.user.managedGrade
      : null;

    const item = await prisma.inspectionItem.create({
      data: {
        title,
        description: description ?? null,
        maxScore: maxScore ?? 10,
        date,
        createdBy: session.user.id,
        targetGrade,
      },
    });

    logDataChange("CREATE", session.user, "InspectionItem", { id: item.id, title, date, maxScore: maxScore ?? 10, targetGrade }, ip);

    return NextResponse.json(item);
  } catch (error) {
    logError("创建检查项", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to create inspection item" },
      { status: 500 }
    );
  }
}
