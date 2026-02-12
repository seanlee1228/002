import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
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

    // GRADE_LEADER: 只能编辑自己年级的专属检查项
    if (session.user.role === "GRADE_LEADER") {
      const item = await prisma.inspectionItem.findUnique({ where: { id } });
      if (!item || item.targetGrade == null || item.targetGrade !== session.user.managedGrade) {
        return NextResponse.json(
          { error: "年级负责人只能编辑本年级专属检查项" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { title, description, maxScore } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (maxScore !== undefined) updateData.maxScore = maxScore;

    const item = await prisma.inspectionItem.update({
      where: { id },
      data: updateData,
    });

    logDataChange("UPDATE", session.user, "InspectionItem", { id, ...updateData }, ip);

    return NextResponse.json(item);
  } catch (error) {
    logError("更新检查项", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to update inspection item" },
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

    // GRADE_LEADER: 只能删除自己年级的专属检查项
    if (session.user.role === "GRADE_LEADER") {
      const item = await prisma.inspectionItem.findUnique({ where: { id } });
      if (!item || item.targetGrade == null || item.targetGrade !== session.user.managedGrade) {
        return NextResponse.json(
          { error: "年级负责人只能删除本年级专属检查项" },
          { status: 403 }
        );
      }
    }

    await prisma.$transaction([
      prisma.score.deleteMany({ where: { inspectionItemId: id } }),
      prisma.inspectionItem.delete({ where: { id } }),
    ]);

    logDataChange("DELETE", session.user, "InspectionItem", { id }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("删除检查项", session.user, error, ip);
    return NextResponse.json(
      { error: "Failed to delete inspection item" },
      { status: 500 }
    );
  }
}
