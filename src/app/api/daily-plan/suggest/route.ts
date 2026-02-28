import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { subDays, format, isWeekend } from "date-fns";
import { getChinaToday } from "@/lib/deadline";

/**
 * 基于字符串种子生成 0~1 的确定性伪随机数
 * 使用简单的 DJB2 哈希算法，同一种子永远返回相同值
 */
function deterministicRandom(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0) / 0xffffffff;
}

/**
 * [固定规则] 每日检查项推荐算法
 *
 * 规则版本: v1.0
 * 最后更新: 2026-02-14
 *
 * 输入: 近30个工作日的检查记录 + 各检查项最近纳入计划的日期
 * 输出: TOP 3 推荐检查项
 *
 * 评分公式: score = failRate * 0.35 + normalizedDays * 0.40 + random * 0.25
 * - failRate: 不达标率 (0~1)，近30个工作日内不达标次数/总检查次数
 * - normalizedDays: 未检查天数/14，封顶为1（鼓励轮转）
 * - rotation: 基于日期+检查项编码的确定性伪随机 (0~0.25)，同日稳定，跨日变化
 *
 * 推荐阈值: score > 0.3 标记为推荐
 *
 * 推荐理由生成规则:
 * - 不达标率 > 30% → "需重点关注"
 * - 不达标率 > 15% → "建议关注"
 * - 未检查天数 >= 5 → "已连续 N 天未检查"
 * - 其他 → 显示达标率或提示纳入轮转
 *
 * 注意: 此规则不使用 AI/LLM，完全基于数据计算
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json({ error: t("onlyAdminGetSuggestion") }, { status: 403 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const ts = createTranslator(locale, "api.suggestions");

  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get("date") || getChinaToday();

    // 获取所有活跃的固定日评项
    const dailyItems = await prisma.checkItem.findMany({
      where: { module: "DAILY", isDynamic: false, isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    if (dailyItems.length === 0) {
      return NextResponse.json({ suggestions: [], message: t("noAvailableItems"), source: "rule" });
    }

    // ===== 固定规则：公式算法推荐 =====
    const dates: string[] = [];
    let day = new Date(targetDate);
    while (dates.length < 30) {
      day = subDays(day, 1);
      if (!isWeekend(day)) {
        dates.push(format(day, "yyyy-MM-dd"));
      }
    }
    const startDate = dates[dates.length - 1];

    const records = await prisma.checkRecord.findMany({
      where: {
        date: { gte: startDate },
        checkItem: { module: "DAILY" },
      },
      include: { checkItem: true },
    });

    const planItems = await prisma.dailyPlanItem.findMany({
      where: {
        plan: { date: { gte: startDate } },
      },
      include: { plan: true },
    });

    // 统计各检查项不达标率
    const failRateMap: Record<string, { total: number; failed: number }> = {};
    for (const r of records) {
      const code = r.checkItem.code || r.checkItemId;
      if (!failRateMap[code]) failRateMap[code] = { total: 0, failed: 0 };
      failRateMap[code].total++;
      if (r.passed === false) failRateMap[code].failed++;
    }

    // 统计各检查项最近纳入计划的日期
    const lastPlanDateMap: Record<string, string> = {};
    for (const pi of planItems) {
      const itemId = pi.checkItemId;
      const pdate = pi.plan.date;
      if (!lastPlanDateMap[itemId] || pdate > lastPlanDateMap[itemId]) {
        lastPlanDateMap[itemId] = pdate;
      }
    }

    // 对每个检查项计算综合评分
    const suggestions = dailyItems.map((item) => {
      const code = item.code || item.id;
      const stats = failRateMap[code];
      const failRate = stats && stats.total > 0 ? stats.failed / stats.total : 0;

      const lastDate = lastPlanDateMap[item.id];
      let daysSinceLastCheck = 30;
      if (lastDate) {
        const diff = Math.floor(
          (new Date(targetDate).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        daysSinceLastCheck = Math.max(0, diff);
      }
      const normalizedDays = Math.min(daysSinceLastCheck / 14, 1);

      // 综合评分 = 不达标率权重(35%) + 未检查天数权重(40%) + 确定性轮转(25%)
      const rotation = deterministicRandom(`${targetDate}-${code}`) * 0.25;
      const score = failRate * 0.35 + normalizedDays * 0.40 + rotation;

      // 生成推荐理由
      const reasons: string[] = [];
      if (failRate > 0.3) {
        reasons.push(ts("highFailRateReason", { rate: Math.round(failRate * 100) }));
      } else if (failRate > 0.15) {
        reasons.push(ts("mediumFailRateReason", { rate: Math.round(failRate * 100) }));
      }
      if (daysSinceLastCheck >= 5) {
        reasons.push(ts("notCheckedDays", { days: daysSinceLastCheck }));
      }
      if (reasons.length === 0) {
        if (stats && stats.total > 0) {
          reasons.push(ts("stablePerformance", { rate: Math.round((1 - failRate) * 100) }));
        } else {
          reasons.push(ts("noRecordSuggest"));
        }
      }

      return {
        checkItemId: item.id,
        code: item.code,
        title: item.title,
        description: item.description,
        score: Math.round(score * 1000) / 1000,
        failRate: Math.round(failRate * 100),
        daysSinceLastCheck,
        reasons,
        recommended: score > 0.3,
      };
    });

    suggestions.sort((a, b) => b.score - a.score);
    const topN = Math.min(3, suggestions.length);

    return NextResponse.json({
      date: targetDate,
      suggestions,
      recommended: suggestions.slice(0, topN),
      dataPoints: records.length,
      message: records.length < 20
        ? ts("lowDataHint")
        : ts("suggestNote", { count: records.length }),
      source: "rule",
    });
  } catch (error) {
    console.error("Suggest error:", error);
    return NextResponse.json({ error: t("suggestLoadFailed") }, { status: 500 });
  }
}
