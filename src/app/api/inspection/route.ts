import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagerRole } from "@/lib/permissions";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";

// GET: 获取检查项列表（固定项 + 动态项）
export async function GET(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const moduleFilter = searchParams.get("module"); // "DAILY" | "WEEKLY" | null

    const isGradeLeader = session.user.role === "GRADE_LEADER";
    const managedGrade = session.user.managedGrade;

    // 固定检查项
    const fixedWhere: Record<string, unknown> = { isDynamic: false };
    if (moduleFilter) fixedWhere.module = moduleFilter;

    const fixedItems = await prisma.checkItem.findMany({
      where: fixedWhere,
      orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
      include: { _count: { select: { records: true } } },
    });

    // 动态检查项
    const dynamicWhere: Record<string, unknown> = { isDynamic: true };
    if (date) dynamicWhere.date = date;
    if (moduleFilter) dynamicWhere.module = moduleFilter;
    if (isGradeLeader && managedGrade != null) {
      dynamicWhere.OR = [{ targetGrade: null }, { targetGrade: managedGrade }];
    }

    const dynamicItems = await prisma.checkItem.findMany({
      where: dynamicWhere,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { records: true } },
        creator: { select: { name: true, username: true } },
      },
    });

    return NextResponse.json({ fixedItems, dynamicItems });
  } catch (error) {
    console.error("CheckItem list error:", error);
    return NextResponse.json({ error: t("inspectionLoadFailed") }, { status: 500 });
  }
}

// POST: 创建动态临增项（D-9 类）
export async function POST(request: Request) {
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
    const body = await request.json();
    const { title, description, date } = body;

    if (!title || !date) {
      return NextResponse.json({ error: t("titleAndDateRequired") }, { status: 400 });
    }

    // 仅 ADMIN 可创建，targetGrade 始终为 null（全校范围）
    const targetGrade = null;

    const item = await prisma.checkItem.create({
      data: {
        module: "DAILY",
        title,
        description: description ?? null,
        sortOrder: 9,
        isDynamic: true,
        date,
        targetGrade,
        createdBy: session.user.id,
      },
    });

    // 自动追加到当日计划（如果有的话）
    const existingPlan = await prisma.dailyPlan.findFirst({
      where: { date },
      include: { items: true },
    });
    if (existingPlan) {
      await prisma.dailyPlanItem.create({
        data: {
          planId: existingPlan.id,
          checkItemId: item.id,
          sortOrder: existingPlan.items.length + 1,
        },
      });
    }

    logDataChange("CREATE", session.user, "CheckItem(Dynamic)", {
      id: item.id,
      title,
      date,
      targetGrade,
    }, ip);

    return NextResponse.json(item);
  } catch (error) {
    logError("创建动态检查项", session.user, error, ip);
    return NextResponse.json({ error: t("inspectionCreateFailed") }, { status: 500 });
  }
}
