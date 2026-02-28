import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/attendance/setup
 * 获取当前考勤配置状态（已导入的数据概览）
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const [periods, slots, outdoorSlots, teachers, students, logs] =
    await Promise.all([
      prisma.periodSchedule.count(),
      prisma.courseSlot.count({ where: { isActive: true } }),
      prisma.courseSlot.count({
        where: { isActive: true, isOutdoor: true },
      }),
      prisma.user.count({ where: { role: "SUBJECT_TEACHER" } }),
      prisma.student.count({ where: { isActive: true } }),
      prisma.fileUploadLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { uploadedBy: { select: { name: true } } },
      }),
    ]);

  // 获取室外课涉及的科目
  const outdoorSubjects = await prisma.courseSlot.findMany({
    where: { isActive: true, isOutdoor: true },
    select: { subject: true },
    distinct: ["subject"],
  });

  return NextResponse.json({
    configured: periods > 0 && slots > 0,
    stats: {
      periods,
      totalSlots: slots,
      outdoorSlots,
      teachers,
      students,
      outdoorSubjects: outdoorSubjects.map((s) => s.subject),
    },
    recentUploads: logs.map((l) => ({
      id: l.id,
      type: l.type,
      filename: l.filename,
      rowCount: l.rowCount,
      status: l.status,
      uploadedBy: l.uploadedBy.name,
      createdAt: l.createdAt,
    })),
  });
}
