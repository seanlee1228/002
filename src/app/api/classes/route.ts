import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { syncClassToAttendance } from "@/lib/sync-attendance";
import { getLocale, createTranslator } from "@/lib/server-i18n";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const isDutyTeacher = session.user.role === "DUTY_TEACHER";
    const managedGrade = session.user.managedGrade;

    const where = (isGradeLeader || isDutyTeacher) && managedGrade != null
      ? { grade: managedGrade }
      : {};

    const classes = await prisma.class.findMany({
      where,
      orderBy: [{ grade: "asc" }, { section: "asc" }],
      include: {
        teachers: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    // 查询各年级的年级负责人
    const gradeLeaders = await prisma.user.findMany({
      where: { role: "GRADE_LEADER", managedGrade: { not: null } },
      select: { name: true, managedGrade: true },
    });
    const gradeLeaderMap: Record<number, string[]> = {};
    for (const gl of gradeLeaders) {
      if (gl.managedGrade != null) {
        if (!gradeLeaderMap[gl.managedGrade]) gradeLeaderMap[gl.managedGrade] = [];
        gradeLeaderMap[gl.managedGrade].push(gl.name);
      }
    }

    const result = classes.map((cls) => ({
      ...cls,
      teacherNames: cls.teachers.map((t) => t.name).filter(Boolean),
    }));

    return NextResponse.json({ classes: result, gradeLeaders: gradeLeaderMap });
  } catch (error) {
    console.error("Classes list error:", error);
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json(
      { error: t("classLoadFailed") },
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

  // GRADE_LEADER 只能创建自己年级的班级
  const isGradeLeader = session.user.role === "GRADE_LEADER";
  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { name, grade, section } = body;

    // 输入校验：类型 + 长度 + 范围
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.length > 50) {
      return NextResponse.json(
        { error: "班级名称格式不正确（1-50字符）" },
        { status: 400 }
      );
    }
    if (grade === undefined || grade === null || isNaN(Number(grade)) || Number(grade) < 1 || Number(grade) > 9) {
      return NextResponse.json(
        { error: "年级必须为 1-9 之间的数字" },
        { status: 400 }
      );
    }
    if (section === undefined || section === null || isNaN(Number(section)) || Number(section) < 1 || Number(section) > 30) {
      return NextResponse.json(
        { error: "班号必须为 1-30 之间的数字" },
        { status: 400 }
      );
    }

    if (isGradeLeader && Number(grade) !== session.user.managedGrade) {
      return NextResponse.json(
        { error: "年级负责人只能创建本年级的班级" },
        { status: 403 }
      );
    }

    const cls = await prisma.class.create({
      data: {
        name,
        grade: Number(grade),
        section: Number(section),
      },
    });

    logDataChange("CREATE", session.user, "Class", { id: cls.id, name, grade, section }, ip);
    syncClassToAttendance({ id: cls.id, name: cls.name, grade: cls.grade, section: cls.section });

    return NextResponse.json(cls);
  } catch (error) {
    logError("创建班级", session.user, error, ip);
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json(
      { error: t("classCreateFailed") },
      { status: 500 }
    );
  }
}
