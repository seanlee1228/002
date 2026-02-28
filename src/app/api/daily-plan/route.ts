import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { getChinaToday } from "@/lib/deadline";

// GET: 获取指定日期的每日检查计划
export async function GET(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || getChinaToday();

    const plans = await prisma.dailyPlan.findMany({
      where: { date },
      include: {
        items: {
          include: { checkItem: true },
          orderBy: { sortOrder: "asc" },
        },
        createdBy: { select: { name: true, username: true } },
      },
    });

    // 同时返回当天的动态临增项（未纳入计划的也展示出来）
    const dynamicItems = await prisma.checkItem.findMany({
      where: {
        isDynamic: true,
        date,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 返回所有固定检查项（供管理员选择）
    const fixedItems = await prisma.checkItem.findMany({
      where: {
        isDynamic: false,
        module: "DAILY",
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({
      date,
      plans,
      dynamicItems,
      fixedItems,
    });
  } catch (error) {
    console.error("DailyPlan GET error:", error);
    return NextResponse.json({ error: t("dailyPlanLoadFailed") }, { status: 500 });
  }
}

// POST: 创建/更新每日检查计划
export async function POST(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: t("onlyAdminCreatePlan") }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { date, checkItemIds, targetGrade } = body as {
      date: string;
      checkItemIds: string[];
      targetGrade?: number | null;
    };

    if (!date || !Array.isArray(checkItemIds) || checkItemIds.length === 0) {
      return NextResponse.json({ error: t("dateAndItemsRequired") }, { status: 400 });
    }

    // 删除旧计划（同日期+同年级scope）
    const existingPlan = await prisma.dailyPlan.findFirst({
      where: {
        date,
        targetGrade: targetGrade ?? null,
      },
    });

    if (existingPlan) {
      await prisma.dailyPlanItem.deleteMany({ where: { planId: existingPlan.id } });
      await prisma.dailyPlan.delete({ where: { id: existingPlan.id } });
    }

    // 创建新计划
    const plan = await prisma.dailyPlan.create({
      data: {
        date,
        targetGrade: targetGrade ?? null,
        createdById: session.user.id,
        items: {
          create: checkItemIds.map((itemId, idx) => ({
            checkItemId: itemId,
            sortOrder: idx + 1,
          })),
        },
      },
      include: {
        items: {
          include: { checkItem: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    logDataChange("CREATE", session.user, "DailyPlan", {
      id: plan.id,
      date,
      itemCount: checkItemIds.length,
      targetGrade,
    }, ip);

    return NextResponse.json(plan);
  } catch (error) {
    logError("创建每日计划", session.user, error, ip);
    return NextResponse.json({ error: t("dailyPlanCreateFailed") }, { status: 500 });
  }
}

// DELETE: 删除每日计划
export async function DELETE(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: t("onlyAdminDeletePlan") }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("id");

    if (!planId) {
      return NextResponse.json({ error: t("missingPlanId") }, { status: 400 });
    }

    await prisma.dailyPlanItem.deleteMany({ where: { planId } });
    await prisma.dailyPlan.delete({ where: { id: planId } });

    logDataChange("DELETE", session.user, "DailyPlan", { id: planId }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("删除每日计划", session.user, error, ip);
    return NextResponse.json({ error: t("dailyPlanDeleteFailed") }, { status: 500 });
  }
}
