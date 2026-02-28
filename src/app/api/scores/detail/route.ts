import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";

function getDateRange(period: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  if (period === "today") return { startDate: today, endDate: today };
  if (period === "week") {
    return {
      startDate: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      endDate: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }
  if (period === "month") {
    return {
      startDate: format(startOfMonth(now), "yyyy-MM-dd"),
      endDate: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }
  if (period === "year") {
    return {
      startDate: format(startOfYear(now), "yyyy-MM-dd"),
      endDate: format(endOfYear(now), "yyyy-MM-dd"),
    };
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const tl = createTranslator(locale, "api.labels");

  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const period = searchParams.get("period") ?? "week";

    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const dateRange = getDateRange(period);
    if (!dateRange) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const dateWhere =
      period === "today"
        ? { date: dateRange.startDate }
        : { date: { gte: dateRange.startDate, lte: dateRange.endDate } };

    // 日评记录
    const dailyRecords = await prisma.checkRecord.findMany({
      where: { classId, ...dateWhere, checkItem: { module: "DAILY" } },
      include: { checkItem: true },
      orderBy: { date: "desc" },
    });

    // 周评记录
    const weeklyRecords = await prisma.checkRecord.findMany({
      where: { classId, ...dateWhere, checkItem: { module: "WEEKLY" } },
      include: { checkItem: true },
      orderBy: { date: "desc" },
    });

    // 按检查项统计（动态项合并为"临增项"）
    const TEMP_KEY = "D-TEMP";
    const byItem: Record<string, { title: string; code: string | null; total: number; passed: number }> = {};
    for (const r of dailyRecords) {
      const isDynamic = r.checkItem.isDynamic || !r.checkItem.code;
      const key = isDynamic ? TEMP_KEY : r.checkItem.code!;
      if (!byItem[key]) {
        byItem[key] = {
          title: isDynamic ? tl("dynamicItem") : r.checkItem.title,
          code: isDynamic ? TEMP_KEY : r.checkItem.code,
          total: 0,
          passed: 0,
        };
      }
      byItem[key].total++;
      if (r.passed === true) byItem[key].passed++;
    }

    const itemSummaries = Object.values(byItem).map((d) => ({
      title: d.title,
      code: d.code,
      total: d.total,
      passed: d.passed,
      passRate: d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0,
    }));

    const total = dailyRecords.length;
    const passed = dailyRecords.filter((r) => r.passed === true).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // 全校和年级平均达标率
    const [schoolRecords, gradeRecords] = await Promise.all([
      prisma.checkRecord.findMany({
        where: { ...dateWhere, checkItem: { module: "DAILY" } },
        include: { checkItem: true },
      }),
      prisma.checkRecord.findMany({
        where: {
          class: { grade: cls.grade },
          ...dateWhere,
          checkItem: { module: "DAILY" },
        },
        include: { checkItem: true },
      }),
    ]);

    const calcPassRate = (records: Array<{ passed: boolean | null }>) => {
      if (records.length === 0) return 0;
      const p = records.filter((r) => r.passed === true).length;
      return Math.round((p / records.length) * 100);
    };

    // 按检查项分组计算全校/年级平均达标率（动态项合并为"临增项"）
    const calcPerItemPassRate = (records: Array<{ passed: boolean | null; checkItem: { code: string | null; isDynamic: boolean }; checkItemId: string }>) => {
      const grouped: Record<string, { total: number; passed: number }> = {};
      for (const r of records) {
        const isDynamic = r.checkItem.isDynamic || !r.checkItem.code;
        const key = isDynamic ? TEMP_KEY : r.checkItem.code!;
        if (!grouped[key]) grouped[key] = { total: 0, passed: 0 };
        grouped[key].total++;
        if (r.passed === true) grouped[key].passed++;
      }
      const result: Record<string, number> = {};
      for (const [key, val] of Object.entries(grouped)) {
        result[key] = val.total > 0 ? Math.round((val.passed / val.total) * 100) : 0;
      }
      return result;
    };

    const schoolPerItem = calcPerItemPassRate(schoolRecords);
    const gradePerItem = calcPerItemPassRate(gradeRecords);

    // 将分项平均合并到 itemSummaries
    const enrichedItemSummaries = itemSummaries.map((item) => {
      const key = item.code || item.title;
      return {
        ...item,
        schoolPassRate: schoolPerItem[key] ?? 0,
        gradePassRate: gradePerItem[key] ?? 0,
      };
    });

    return NextResponse.json({
      className: cls.name,
      classId: cls.id,
      grade: cls.grade,
      section: cls.section,
      period,
      passRate,
      total,
      passed,
      itemSummaries: enrichedItemSummaries,
      dailyRecords,
      weeklyRecords,
      schoolPassRate: calcPassRate(schoolRecords),
      gradePassRate: calcPassRate(gradeRecords),
    });
  } catch (error) {
    console.error("Score detail error:", error);
    return NextResponse.json({ error: t("detailLoadFailed") }, { status: 500 });
  }
}
