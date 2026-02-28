import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageAttendance } from "@/lib/permissions";

/**
 * POST /api/attendance/students/batch
 * 批量添加学生
 * Body: { classId: string, students: Array<{ name: string, studentNo?: string }> }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageAttendance(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await req.json();
  const { classId, students } = body as {
    classId: string;
    students: Array<{ name: string; studentNo?: string }>;
  };

  if (!classId || !students?.length) {
    return NextResponse.json(
      { error: "缺少班级或学生数据" },
      { status: 400 }
    );
  }

  const created = await prisma.$transaction(
    students
      .filter((s) => s.name?.trim())
      .map((s) =>
        prisma.student.create({
          data: {
            name: s.name.trim(),
            studentNo: s.studentNo?.trim() || null,
            classId,
          },
        })
      )
  );

  return NextResponse.json({
    success: true,
    count: created.length,
  });
}
