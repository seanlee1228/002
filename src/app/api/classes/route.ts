import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";

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

    const result = classes.map((cls) => ({
      ...cls,
      teacherNames: cls.teachers.map((t) => t.name).filter(Boolean),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Classes list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch classes" },
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

    if (!name || grade === undefined || section === undefined) {
      return NextResponse.json(
        { error: "name, grade, and section are required" },
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

    return NextResponse.json(cls);
  } catch (error) {
    logError("创建班级", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to create class" },
      { status: 500 }
    );
  }
}
