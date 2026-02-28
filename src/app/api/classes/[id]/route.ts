import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole, canManageGrade } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { syncClassToAttendance, syncClassDeleteToAttendance } from "@/lib/sync-attendance";
import { getLocale, createTranslator } from "@/lib/server-i18n";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
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
        return NextResponse.json({ error: t("gradeLeaderOnlyOwnGradeEdit") }, { status: 403 });
      }
    }

    const body = await request.json();
    const { name, grade, section } = body;

    // 参数验证
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json({ error: "班级名称不能为空" }, { status: 400 });
    }
    if (grade !== undefined && (typeof grade !== "number" || grade < 1 || grade > 9)) {
      return NextResponse.json({ error: "年级必须是 1-9 的数字" }, { status: 400 });
    }
    if (section !== undefined && (typeof section !== "number" || section < 1 || section > 30)) {
      return NextResponse.json({ error: "班级编号必须是 1-30 的数字" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (grade !== undefined) updateData.grade = grade;
    if (section !== undefined) updateData.section = section;

    const cls = await prisma.class.update({
      where: { id },
      data: updateData,
    });

    logDataChange("UPDATE", session.user as Parameters<typeof logDataChange>[1], "Class", { id, ...updateData }, ip);
    syncClassToAttendance({ id: cls.id, name: cls.name, grade: cls.grade, section: cls.section });

    return NextResponse.json(cls);
  } catch (error) {
    logError("更新班级", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: t("classUpdateFailed") },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
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
        return NextResponse.json({ error: t("gradeLeaderOnlyOwnGradeDelete") }, { status: 403 });
      }
    }

    await prisma.$transaction([
      prisma.checkRecord.deleteMany({ where: { classId: id } }),
      prisma.class.delete({ where: { id } }),
    ]);

    logDataChange("DELETE", session.user as Parameters<typeof logDataChange>[1], "Class", { id }, ip);
    syncClassDeleteToAttendance(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("删除班级", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: t("classDeleteFailed") },
      { status: 500 }
    );
  }
}
