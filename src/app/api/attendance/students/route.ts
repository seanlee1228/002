import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageAttendance } from "@/lib/permissions";

/**
 * GET /api/attendance/students?classId=xxx
 * 获取指定班级的学生列表
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json(
      { error: "缺少 classId 参数" },
      { status: 400 }
    );
  }

  const students = await prisma.student.findMany({
    where: { classId, isActive: true },
    orderBy: [{ studentNo: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      studentNo: true,
      classId: true,
      isActive: true,
    },
  });

  return NextResponse.json({ students });
}

/**
 * POST /api/attendance/students
 * 创建或更新单个学生
 * Body: { id?, name, studentNo?, classId }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageAttendance(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, studentNo, classId } = body as {
    id?: string;
    name: string;
    studentNo?: string;
    classId: string;
  };

  if (!name?.trim() || !classId) {
    return NextResponse.json(
      { error: "姓名和班级不能为空" },
      { status: 400 }
    );
  }

  if (id) {
    // 更新
    const student = await prisma.student.update({
      where: { id },
      data: {
        name: name.trim(),
        studentNo: studentNo?.trim() || null,
        classId,
      },
    });
    return NextResponse.json({ student });
  } else {
    // 创建
    const student = await prisma.student.create({
      data: {
        name: name.trim(),
        studentNo: studentNo?.trim() || null,
        classId,
      },
    });
    return NextResponse.json({ student });
  }
}

/**
 * DELETE /api/attendance/students?id=xxx
 * 停用学生（软删除）
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageAttendance(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "缺少 id 参数" },
      { status: 400 }
    );
  }

  await prisma.student.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
