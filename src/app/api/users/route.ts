import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { isManagerRole } from "@/lib/permissions";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { mapUserForAttendance, syncUserToAttendance } from "@/lib/sync-attendance";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const managedGrade = session.user.managedGrade;

    let users;
    if (isGradeLeader && managedGrade != null) {
      // GRADE_LEADER: 只返回本年级关联的用户，排除 ADMIN 和其他 GRADE_LEADER
      users = await prisma.user.findMany({
        where: {
          OR: [
            // 本年级的班主任
            { role: "CLASS_TEACHER", class: { grade: managedGrade } },
            // 本年级的值日老师
            { role: "DUTY_TEACHER", managedGrade },
          ],
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        include: {
          class: {
            select: { id: true, name: true, grade: true, section: true },
          },
        },
      });
    } else {
      // ADMIN: 返回所有用户
      users = await prisma.user.findMany({
        orderBy: [{ role: "asc" }, { name: "asc" }],
        include: {
          class: {
            select: { id: true, name: true, grade: true, section: true },
          },
        },
      });
    }

    const result = users.map(({ password: _, ...u }) => u);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Users list error:", error);
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json(
      { error: t("userLoadFailed") },
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
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  try {
    const body = await request.json();
    const { name, username, password, role, classId, managedGrade } = body;

    // 输入校验：类型 + 长度
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.length > 50) {
      return NextResponse.json(
        { error: t("invalidNameFormat") },
        { status: 400 }
      );
    }
    if (!username || typeof username !== "string" || username.trim().length < 2 || username.length > 30) {
      return NextResponse.json(
        { error: t("invalidUsernameFormat") },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 4 || password.length > 100) {
      return NextResponse.json(
        { error: t("invalidPasswordFormat") },
        { status: 400 }
      );
    }

    // GRADE_LEADER 不可创建 ADMIN 或 GRADE_LEADER
    if (session.user.role === "GRADE_LEADER") {
      if (role === "ADMIN" || role === "GRADE_LEADER") {
        return NextResponse.json(
          { error: t("gradeLeaderCannotCreateAdmin") },
          { status: 403 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        role: role ?? "CLASS_TEACHER",
        classId: classId ?? null,
        managedGrade: (role === "GRADE_LEADER" || role === "DUTY_TEACHER") ? (managedGrade ?? null) : null,
      },
      include: {
        class: {
          select: { id: true, name: true, grade: true, section: true },
        },
      },
    });

    logDataChange("CREATE", session.user, "User", { id: user.id, name, username, role: role ?? "CLASS_TEACHER", classId }, ip);

    const { password: _, ...userWithoutPassword } = user;
    syncUserToAttendance(mapUserForAttendance(user));
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    logError("创建用户", session.user, error, ip);
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json(
      { error: t("userCreateFailed") },
      { status: 500 }
    );
  }
}
