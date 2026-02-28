import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/attendance/swap?date=YYYY-MM-DD
 * 获取指定日期的调课记录
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "缺少日期参数" }, { status: 400 });
  }

  const swaps = await prisma.courseSwap.findMany({
    where: { date },
    include: {
      courseSlot: {
        include: {
          class: { select: { name: true, grade: true } },
          period: { select: { periodNo: true, startTime: true, endTime: true } },
        },
      },
      substitute: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    swaps: swaps.map((s) => ({
      id: s.id,
      date: s.date,
      type: s.type,
      reason: s.reason,
      className: s.courseSlot.class.name,
      subject: s.courseSlot.subject,
      periodNo: s.courseSlot.period.periodNo,
      substituteName: s.substitute?.name,
      createdByName: s.createdBy.name,
      createdAt: s.createdAt,
    })),
  });
}

/**
 * POST /api/attendance/swap
 * 创建调课/代课记录
 * Body: { courseSlotId, date, type: "substitute"|"cancel", substituteId?, reason? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { role } = session.user;
  if (!["ADMIN", "GRADE_LEADER", "SUBJECT_TEACHER"].includes(role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { courseSlotId, date, type, substituteId, reason } = body as {
      courseSlotId: string;
      date: string;
      type: "substitute" | "cancel";
      substituteId?: string;
      reason?: string;
    };

    if (!courseSlotId || !date || !type) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (type === "substitute" && !substituteId) {
      return NextResponse.json(
        { error: "代课需要指定代课教师" },
        { status: 400 }
      );
    }

    // 验证课程存在
    const slot = await prisma.courseSlot.findUnique({
      where: { id: courseSlotId },
    });
    if (!slot) {
      return NextResponse.json({ error: "课程不存在" }, { status: 404 });
    }

    // SUBJECT_TEACHER 只能操作自己的课
    if (role === "SUBJECT_TEACHER" && slot.teacherId !== session.user.id) {
      return NextResponse.json({ error: "无权操作此课程" }, { status: 403 });
    }

    const swap = await prisma.courseSwap.create({
      data: {
        courseSlotId,
        date,
        type,
        substituteId: type === "substitute" ? substituteId : null,
        reason: reason || null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ success: true, swap });
  } catch (error) {
    console.error("[attendance/swap] Error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
