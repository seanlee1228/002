import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/attendance/records?courseSlotId=xxx&date=YYYY-MM-DD
 * 获取指定课程和日期的考勤记录
 * 也支持: ?classId=xxx&dateFrom=&dateTo= (查询记录)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const courseSlotId = req.nextUrl.searchParams.get("courseSlotId");
  const date = req.nextUrl.searchParams.get("date");
  const classId = req.nextUrl.searchParams.get("classId");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");

  if (courseSlotId && date) {
    // 查询单节课的考勤记录
    const records = await prisma.attendanceRecord.findMany({
      where: { courseSlotId, date },
      include: {
        student: { select: { id: true, name: true, studentNo: true } },
      },
      orderBy: { student: { name: "asc" } },
    });

    return NextResponse.json({
      records: records.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: r.student.name,
        studentNo: r.student.studentNo,
        status: r.status,
        comment: r.comment,
        date: r.date,
      })),
    });
  }

  if (classId) {
    // 查询班级的考勤记录（支持日期范围）
    const where: Record<string, unknown> = { classId };
    if (dateFrom && dateTo) {
      where.date = { gte: dateFrom, lte: dateTo };
    } else if (date) {
      where.date = date;
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        student: { select: { name: true, studentNo: true } },
        courseSlot: {
          include: {
            period: { select: { periodNo: true, startTime: true, endTime: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { courseSlot: { period: { periodNo: "asc" } } }],
      take: 200,
    });

    return NextResponse.json({
      records: records.map((r) => ({
        id: r.id,
        date: r.date,
        studentName: r.student.name,
        studentNo: r.student.studentNo,
        subject: r.courseSlot.subject,
        periodNo: r.courseSlot.period.periodNo,
        status: r.status,
        comment: r.comment,
      })),
    });
  }

  return NextResponse.json({ error: "缺少查询参数" }, { status: 400 });
}
