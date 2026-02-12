import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole, canManageGrade } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const { id } = await context.params;

    // GRADE_LEADER: 检查目标班级是否属于本年级
    if (session.user.role === "GRADE_LEADER") {
      const targetClass = await prisma.class.findUnique({ where: { id } });
      if (!targetClass || !canManageGrade(session.user.role, session.user.managedGrade, targetClass.grade)) {
        return NextResponse.json({ error: "年级负责人只能编辑本年级的班级" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { name, grade, section } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (grade !== undefined) updateData.grade = grade;
    if (section !== undefined) updateData.section = section;

    const cls = await prisma.class.update({
      where: { id },
      data: updateData,
    });

    logDataChange("UPDATE", session.user as Parameters<typeof logDataChange>[1], "Class", { id, ...updateData }, ip);

    return NextResponse.json(cls);
  } catch (error) {
    logError("更新班级", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: "Failed to update class" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const { id } = await context.params;

    // GRADE_LEADER: 检查目标班级是否属于本年级
    if (session.user.role === "GRADE_LEADER") {
      const targetClass = await prisma.class.findUnique({ where: { id } });
      if (!targetClass || !canManageGrade(session.user.role, session.user.managedGrade, targetClass.grade)) {
        return NextResponse.json({ error: "年级负责人只能删除本年级的班级" }, { status: 403 });
      }
    }

    await prisma.$transaction([
      prisma.score.deleteMany({ where: { classId: id } }),
      prisma.class.delete({ where: { id } }),
    ]);

    logDataChange("DELETE", session.user as Parameters<typeof logDataChange>[1], "Class", { id }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("删除班级", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: "Failed to delete class" },
      { status: 500 }
    );
  }
}
