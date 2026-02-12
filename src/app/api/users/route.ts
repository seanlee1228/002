import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { isManagerRole } from "@/lib/permissions";

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
    return NextResponse.json(
      { error: "Failed to fetch users" },
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

  try {
    const body = await request.json();
    const { name, username, password, role, classId, managedGrade } = body;

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "name, username, and password are required" },
        { status: 400 }
      );
    }

    // GRADE_LEADER 不可创建 ADMIN 或 GRADE_LEADER
    if (session.user.role === "GRADE_LEADER") {
      if (role === "ADMIN" || role === "GRADE_LEADER") {
        return NextResponse.json(
          { error: "年级负责人不可创建管理员或年级负责人角色" },
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
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    logError("创建用户", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
