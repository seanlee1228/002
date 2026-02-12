import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isManagerRole, canEditUser } from "@/lib/permissions";
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
    const body = await request.json();
    const { name, username, password, role, classId, managedGrade } = body;

    // 查找目标用户
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // GRADE_LEADER 权限检查
    if (!canEditUser(session.user.role, session.user.id, targetUser.role, targetUser.id)) {
      return NextResponse.json(
        { error: "年级负责人不可修改管理员、其他年级负责人或自身" },
        { status: 403 }
      );
    }

    // GRADE_LEADER 不可将角色提升为 ADMIN 或 GRADE_LEADER
    if (session.user.role === "GRADE_LEADER" && role !== undefined) {
      if (role === "ADMIN" || role === "GRADE_LEADER") {
        return NextResponse.json(
          { error: "年级负责人不可将用户角色设为管理员或年级负责人" },
          { status: 403 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (username !== undefined) updateData.username = username;
    if (role !== undefined) updateData.role = role;
    if (classId !== undefined) {
      updateData.class =
        classId && typeof classId === "string"
          ? { connect: { id: classId } }
          : { disconnect: true };
    }
    if (managedGrade !== undefined) updateData.managedGrade = managedGrade;

    // 非 GRADE_LEADER/DUTY_TEACHER 角色清除 managedGrade
    if (role !== undefined && role !== "GRADE_LEADER" && role !== "DUTY_TEACHER") {
      updateData.managedGrade = null;
    }
    // 非班主任角色清除班级关联
    if (role !== undefined && role !== "CLASS_TEACHER") {
      updateData.class = { disconnect: true };
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        class: {
          select: { id: true, name: true, grade: true, section: true },
        },
      },
    });

    logDataChange("UPDATE", session.user as Parameters<typeof logDataChange>[1], "User", { id, ...updateData }, ip);

    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    logError("更新用户", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: "Failed to update user" },
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

    // 查找目标用户
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // GRADE_LEADER 权限检查
    if (!canEditUser(session.user.role, session.user.id, targetUser.role, targetUser.id)) {
      return NextResponse.json(
        { error: "年级负责人不可删除管理员、其他年级负责人或自身" },
        { status: 403 }
      );
    }

    await prisma.user.delete({ where: { id } });

    logDataChange("DELETE", session.user as Parameters<typeof logDataChange>[1], "User", { id, name: targetUser.name, username: targetUser.username }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("删除用户", session.user as Parameters<typeof logError>[1], error, ip);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
