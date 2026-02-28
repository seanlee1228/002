import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeJSON } from "@/lib/ai-client";
import { startOfWeek, endOfWeek, format, subWeeks } from "date-fns";
import { getLocale, createTranslator } from "@/lib/server-i18n";

/**
 * [LLM 文字建议] 周评 W-5 评定说明 AI 建议
 *
 * 规则版本: v1.0
 * 最后更新: 2026-02-14
 *
 * 输入: 班级本周的日评记录 + W-1~W-4 周评数据 + 等级建议
 * 输出: W-5 评定说明的文字建议（AI 生成）
 *
 * 使用场景: 用户在周评页面选择 W-5 等级后，点击"AI 生成评定说明"按钮
 * AI 根据数据生成一段简洁的评定说明文字，用户可采纳或修改
 *
 * 注意: 此接口使用 AI/LLM 生成文字建议
 */

function getSuggestSystemPrompt(locale: string): string {
  if (locale === "en") {
    return `You are a primary school routine management assistant. Write a concise grade assessment note based on the provided class weekly review data.
Requirements:
1. Must return strict JSON format
2. All text must be in English
3. Assessment note must be objective and data-based
4. Keep within 80 words
5. Professional yet friendly tone`;
  }
  return `你是一个小学常规管理助手。请根据提供的班级周评数据，撰写简洁的等级评定说明。
要求：
1. 必须返回严格的 JSON 格式
2. 所有文字使用中文
3. 评定说明要客观、基于数据
4. 控制在80字以内
5. 语气专业但友善`;
}

function getWeekRange(offset: number = 0) {
  const base = offset === 0 ? new Date() : subWeeks(new Date(), Math.abs(offset));
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
  return {
    startDate: format(weekStart, "yyyy-MM-dd"),
    endDate: format(weekEnd, "yyyy-MM-dd"),
    friday: format(new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
  };
}

export async function GET(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "GRADE_LEADER") {
    return NextResponse.json({ error: t("insufficientPermission") }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const weekParam = searchParams.get("week") ?? "current";
    const selectedGrade = searchParams.get("grade"); // A/B/C

    if (!classId) {
      return NextResponse.json({ error: t("missingClassId") }, { status: 400 });
    }

    // 检查 API Key
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: t("aiServiceNotConfigured") }, { status: 500 });
    }

    const weekOffset = weekParam === "previous" ? 1 : 0;
    const week = getWeekRange(weekOffset);

    // 获取班级信息
    const classObj = await prisma.class.findUnique({ where: { id: classId } });
    if (!classObj) {
      return NextResponse.json({ error: t("classNotFound") }, { status: 404 });
    }

    // 本周日评记录
    const dailyRecords = await prisma.checkRecord.findMany({
      where: {
        classId,
        date: { gte: week.startDate, lte: week.endDate },
        checkItem: { module: "DAILY" },
      },
      include: { checkItem: true },
    });

    const total = dailyRecords.length;
    const passed = dailyRecords.filter((r) => r.passed === true).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // 不达标项目
    const isEn = locale === "en";
    const failedItems = dailyRecords
      .filter((r) => r.passed === false)
      .map((r) => `${r.checkItem.code ?? ""} ${r.checkItem.title} (${r.severity === "serious" ? (isEn ? "Serious" : "严重") : (isEn ? "Moderate" : "一般")})`);

    // W-1~W-4 周评数据
    const weeklyRecords = await prisma.checkRecord.findMany({
      where: {
        classId,
        date: week.friday,
        checkItem: { module: "WEEKLY", code: { not: "W-5" } },
      },
      include: { checkItem: true },
    });

    const w1w4Summary = weeklyRecords.map((r) => {
      const label = r.optionValue === "0"
        ? (isEn ? "0 incidents" : "0起")
        : r.optionValue === "1"
          ? (isEn ? "1 incident" : "1起")
          : (isEn ? "≥2 incidents" : "≥2起");
      return `${r.checkItem.title}: ${label}${r.comment ? ` (${r.comment})` : ""}`;
    });

    // 构建 Prompt
    const userPrompt = isEn
      ? `## Task
Write a W-5 grade assessment note for "${classObj.name}".

## Selected Grade
${selectedGrade || "Not selected"}

## This Week's Daily Review Data
- Total checks: ${total}
- Passed: ${passed}
- Pass rate: ${passRate}%
${failedItems.length > 0 ? `\n## Non-compliant Items\n${failedItems.join("\n")}` : "\n## Non-compliant Items\nNone"}

## W-1~W-4 Weekly Review
${w1w4Summary.length > 0 ? w1w4Summary.join("\n") : "No weekly review data yet"}

## Output JSON format
{
  "comment": "Assessment note (within 80 words, summarizing this week's performance and assessment basis)"
}

Note: The assessment note should combine daily and weekly review data to provide an objective basis.`
      : `## 任务
为"${classObj.name}"撰写 W-5 等级评定说明。

## 选定等级
${selectedGrade || "未选"}

## 本周日评数据
- 检查总次数: ${total}
- 达标次数: ${passed}
- 达标率: ${passRate}%
${failedItems.length > 0 ? `\n## 不达标项目\n${failedItems.join("\n")}` : "\n## 不达标项目\n无"}

## W-1~W-4 周评情况
${w1w4Summary.length > 0 ? w1w4Summary.join("\n") : "暂无周评数据"}

## 输出 JSON 格式
{
  "comment": "评定说明（80字内，概括本周表现和评定依据）"
}

注意：评定说明要结合日评数据和周评数据，给出客观的依据。`;

    // 尝试从模块配置获取自定义 prompt
    const moduleConfig = await prisma.aiModuleConfig.findFirst({
      where: { scope: "weekly-suggest" },
    });

    const { result } = await analyzeJSON<{ comment: string }>(
      moduleConfig?.systemPrompt || getSuggestSystemPrompt(locale),
      userPrompt,
      {
        temperature: moduleConfig?.temperature ?? 0.3,
        maxTokens: moduleConfig?.maxTokens ?? 500,
        model: moduleConfig?.model ?? undefined,
      },
    );

    return NextResponse.json({
      comment: result.comment || t("noSuggestion"),
      className: classObj.name,
      grade: selectedGrade,
      source: "llm",
    });
  } catch (error) {
    console.error("Weekly review suggest error:", error);
    return NextResponse.json({ error: t("aiGenerateFailed") }, { status: 500 });
  }
}
