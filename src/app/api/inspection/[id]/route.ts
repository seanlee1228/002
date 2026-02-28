import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";

type RouteContext = { params: Promise<{ id: string }> };

// PUT: 更新检查项（固定项可改描述和启用/停用，动态项可改标题和描述）
export async function PUT(request: Request, context: RouteContext) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const { id } = await context.params;

    const existing = await prisma.checkItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("itemNotFound") }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.planCategory !== undefined) {
      // 仅允许 "resident" | "rotating" | null
      const validCategories = ["resident", "rotating", null];
      if (!validCategories.includes(body.planCategory)) {
        return NextResponse.json({ error: t("invalidPlanCategory") }, { status: 400 });
      }
      updateData.planCategory = body.planCategory;
    }

    const item = await prisma.checkItem.update({
      where: { id },
      data: updateData,
    });

    logDataChange("UPDATE", session.user, "CheckItem", { id, ...updateData }, ip);

    return NextResponse.json(item);
  } catch (error) {
    logError("更新检查项", session.user, error, ip);
    return NextResponse.json({ error: t("inspectionUpdateFailed") }, { status: 500 });
  }
}

// DELETE: 删除动态检查项
export async function DELETE(request: Request, context: RouteContext) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const { id } = await context.params;

    const existing = await prisma.checkItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("itemNotFound") }, { status: 404 });
    }

    // 不允许删除固定检查项
    if (!existing.isDynamic) {
      return NextResponse.json({ error: t("cannotDeleteFixedItem") }, { status: 400 });
    }

    // 检查是否已有关联的检查记录
    const recordCount = await prisma.checkRecord.count({ where: { checkItemId: id } });

    if (recordCount > 0) {
      // 有历史记录：软删除 — 保留 CheckItem 和 CheckRecord，仅标记不活跃并移除计划关联
      await prisma.$transaction([
        prisma.dailyPlanItem.deleteMany({ where: { checkItemId: id } }),
        prisma.checkItem.update({ where: { id }, data: { isActive: false } }),
      ]);

      logDataChange("SOFT_DELETE", session.user, "CheckItem(Dynamic)", { id, recordCount }, ip);

      return NextResponse.json({ success: true, softDeleted: true });
    } else {
      // 无历史记录：安全物理删除
      await prisma.$transaction([
        prisma.dailyPlanItem.deleteMany({ where: { checkItemId: id } }),
        prisma.checkItem.delete({ where: { id } }),
      ]);

      logDataChange("DELETE", session.user, "CheckItem(Dynamic)", { id }, ip);

      return NextResponse.json({ success: true, softDeleted: false });
    }
  } catch (error) {
    logError("删除检查项", session.user, error, ip);
    return NextResponse.json({ error: t("inspectionDeleteFailed") }, { status: 500 });
  }
}
