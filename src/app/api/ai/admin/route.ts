import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subDays, format } from "date-fns";
import { getLocale, createTranslator } from "@/lib/server-i18n";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "status";
  const dateParam = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");

  try {
    // ===== 模式: status — 今日概览 + 配置信息 =====
    if (mode === "status") {
      const todayAnalyses = await prisma.aiAnalysis.findMany({
        where: { date: dateParam },
        select: { id: true, scope: true, tokens: true, model: true, createdAt: true },
        orderBy: { scope: "asc" },
      });

      // 累计统计
      const allTimeStats = await prisma.aiAnalysis.aggregate({
        _sum: { tokens: true },
        _count: true,
      });

      const todayTokens = todayAnalyses.reduce((s, a) => s + a.tokens, 0);

      return NextResponse.json({
        date: dateParam,
        configured: !!process.env.DEEPSEEK_API_KEY,
        model: "deepseek-chat",
        analyses: todayAnalyses,
        todayTokens,
        allTimeTotalTokens: allTimeStats._sum.tokens ?? 0,
        allTimeTotalRecords: allTimeStats._count,
      });
    }

    // ===== 模式: history — 最近 30 天日期列表 + 每日汇总 =====
    if (mode === "history") {
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const records = await prisma.aiAnalysis.findMany({
        where: { date: { gte: since } },
        select: { date: true, scope: true, tokens: true, createdAt: true },
        orderBy: [{ date: "desc" }, { scope: "asc" }],
      });

      // 按日期分组
      const grouped: Record<string, { date: string; scopes: string[]; totalTokens: number; recordCount: number; latestAt: string }> = {};
      for (const r of records) {
        if (!grouped[r.date]) {
          grouped[r.date] = { date: r.date, scopes: [], totalTokens: 0, recordCount: 0, latestAt: "" };
        }
        grouped[r.date].scopes.push(r.scope);
        grouped[r.date].totalTokens += r.tokens;
        grouped[r.date].recordCount++;
        const ts = r.createdAt.toISOString();
        if (ts > grouped[r.date].latestAt) grouped[r.date].latestAt = ts;
      }

      return NextResponse.json({
        days: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)),
      });
    }

    // ===== 模式: detail — 指定日期所有 scope 的完整记录 =====
    if (mode === "detail") {
      const records = await prisma.aiAnalysis.findMany({
        where: { date: dateParam },
        orderBy: { scope: "asc" },
      });

      const parsed = records.map((r) => {
        let content: unknown = r.content;
        try { content = JSON.parse(r.content); } catch { /* keep string */ }
        return {
          id: r.id,
          date: r.date,
          scope: r.scope,
          content,
          model: r.model,
          tokens: r.tokens,
          createdAt: r.createdAt,
        };
      });

      return NextResponse.json({ date: dateParam, records: parsed });
    }

    // ===== 模式: cost — 最近 30 天按日汇总 token（趋势图用） =====
    if (mode === "cost") {
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const records = await prisma.aiAnalysis.findMany({
        where: { date: { gte: since } },
        select: { date: true, scope: true, tokens: true },
        orderBy: { date: "asc" },
      });

      // 按日期 + scope 分组
      const dailyMap: Record<string, Record<string, number>> = {};
      const scopeSet = new Set<string>();
      for (const r of records) {
        if (!dailyMap[r.date]) dailyMap[r.date] = {};
        dailyMap[r.date][r.scope] = (dailyMap[r.date][r.scope] || 0) + r.tokens;
        scopeSet.add(r.scope);
      }

      const days = Object.entries(dailyMap)
        .map(([date, scopes]) => ({
          date,
          total: Object.values(scopes).reduce((s, v) => s + v, 0),
          ...scopes,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        days,
        scopes: [...scopeSet].sort(),
      });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (error) {
    console.error("AI admin error:", error);
    return NextResponse.json(
      { error: t("aiAdminLoadFailed"), detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
