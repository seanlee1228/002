import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { startOfWeek, endOfWeek, format, subWeeks } from "date-fns";
import { checkDeadline, getChinaToday } from "@/lib/deadline";

function getWeekRange(offset: number = 0) {
  // 使用中国时区的"今天"来确定周边界，避免 UTC 时区导致跨天偏差
  const chinaToday = new Date(getChinaToday() + "T12:00:00+08:00");
  const base = offset === 0 ? chinaToday : subWeeks(chinaToday, Math.abs(offset));
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
  return {
    startDate: format(weekStart, "yyyy-MM-dd"),
    endDate: format(weekEnd, "yyyy-MM-dd"),
    friday: format(new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
  };
}

/**
 * [固定规则] W-5 自动等级建议算法
 *
 * 规则版本: v3.0（与制度量化标准对齐）
 * 最后更新: 2026-02-15
 *
 * 输入: 本周日评记录（passed, severity）+ W-1~W-4 周评记录（optionValue）
 * 输出: { grade: A|B|C, reason: string, confidence: high|medium|low }
 *
 * 等级判定规则（与制度 W-5 量化标准一致）:
 * - C (预警): 达标率<70% OR 有严重不达标 OR W-2~W-4 任一≥2起 OR W-1≥2人次缺勤
 * - A (卓越): 达标率≥90% AND 无严重/一般不达标 AND W-1~W-4 均为0
 * - B (良好): 达标率70%~89%，或有个别轻微不达标，W-1~W-4单项≤1起
 *
 * 数据充分性判断:
 * - 日评记录 < 5 条 → confidence: low
 * - 日评记录 < 10 条 → confidence: medium
 * - 周评未填满 4 项 → confidence 降一级
 *
 * 注意: 此规则不使用 AI/LLM，完全基于数据计算
 */
function suggestWeeklyGrade(
  dailyRecords: Array<{ passed: boolean | null; severity: string | null }>,
  weeklyRecords: Array<{ checkItem: { code: string | null }; optionValue: string | null }>,
  ts: (key: string, params?: Record<string, string | number>) => string,
  locale: "zh" | "en"
): { grade: "A" | "B" | "C"; reason: string; confidence: "high" | "medium" | "low" } {
  const total = dailyRecords.length;
  const passed = dailyRecords.filter((r) => r.passed === true).length;
  const passRate = total > 0 ? passed / total : 0;

  // 统计严重程度
  const failRecords = dailyRecords.filter((r) => r.passed === false);
  const seriousCount = failRecords.filter((r) => r.severity === "serious").length;
  const moderateCount = failRecords.filter((r) => r.severity === "moderate").length;

  // 周评项统计 — W-1~W-4 使用统一的 "0"/"1"/"gte2" 选项
  const w1 = weeklyRecords.find((r) => r.checkItem.code === "W-1");
  const w1HasIssue = w1?.optionValue === "1" || w1?.optionValue === "gte2";
  const w1Severe = w1?.optionValue === "gte2";

  const w2w4Records = weeklyRecords.filter(
    (r) => ["W-2", "W-3", "W-4"].includes(r.checkItem.code || "")
  );
  const w2w4HasSevere = w2w4Records.some((r) => r.optionValue === "gte2");
  const w2w4HasMinor = w2w4Records.some((r) => r.optionValue === "1");

  // 数据充分性判断
  let confidence: "high" | "medium" | "low" = "high";
  if (total < 5) confidence = "low";
  else if (total < 10) confidence = "medium";
  // 如果周评数据不全也降低 confidence
  const weeklyFilled = weeklyRecords.filter((r) => r.optionValue != null).length;
  if (weeklyFilled < 4) {
    confidence = confidence === "high" ? "medium" : "low";
  }

  // === C (预警)：出现严重问题 ===
  // 条件：日评有严重不达标 or W-2~W-4 有 ≥2起 or 日评达标率<70% or 出勤问题严重
  if (seriousCount >= 1 || w2w4HasSevere || passRate < 0.7 || w1Severe) {
    const reasons = [];
    if (seriousCount >= 1) reasons.push(ts("seriousFailReason", { count: seriousCount }));
    if (w2w4HasSevere) reasons.push(ts("weeklyGte2Reason"));
    if (w1Severe) reasons.push(ts("outdoorAbsenceReason"));
    if (passRate < 0.7) reasons.push(ts("lowPassRateReason", { rate: Math.round(passRate * 100) }));
    const sep = locale === "zh" ? "；" : "; ";
    return { grade: "C", reason: reasons.join(sep), confidence };
  }

  // === A (卓越)：整体表现优秀（放宽到≥90%且无严重/一般问题）===
  // 不再要求 100% 达标率，体现"主动超越"而非"不出错"
  const hasNoSignificantIssues = !w2w4HasSevere && !w2w4HasMinor && !w1HasIssue;
  const hasNoModerateFail = moderateCount === 0 && seriousCount === 0;

  if (passRate >= 0.9 && hasNoSignificantIssues && hasNoModerateFail) {
    return {
      grade: "A",
      reason: ts("gradeAReason", { rate: Math.round(passRate * 100) }),
      confidence,
    };
  }

  // === B (良好)：其余情况 ===
  const reasons = [];
  if (passRate < 0.9) reasons.push(ts("gradeBPassRate", { rate: Math.round(passRate * 100) }));
  if (w2w4HasMinor || w1HasIssue) reasons.push(ts("gradeBWeeklyIssue"));
  if (moderateCount > 0) reasons.push(ts("gradeBModerateIssue", { count: moderateCount }));

  const sep = locale === "zh" ? "，" : ", ";
  return {
    grade: "B",
    reason: reasons.length > 0
      ? ts("stableRunning", { details: reasons.join(sep) })
      : ts("stableRunningDefault"),
    confidence,
  };
}

// GET: 获取周评数据（支持 week=current|previous）
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const ts = createTranslator(locale, "api.suggestions");

  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const weekParam = searchParams.get("week") ?? "current"; // "current" | "previous"
    const weekOffset = weekParam === "previous" ? 1 : 0;

    const week = getWeekRange(weekOffset);
    const managedGrade = session.user.managedGrade;
    const hasGradeFilter =
      (session.user.role === "GRADE_LEADER" || session.user.role === "DUTY_TEACHER") &&
      managedGrade != null;
    const classWhere = hasGradeFilter ? { grade: managedGrade } : {};

    // 周评检查项
    const weeklyItems = await prisma.checkItem.findMany({
      where: { module: "WEEKLY", isActive: true, isDynamic: false },
      orderBy: { sortOrder: "asc" },
    });

    // 班级列表
    const classes = await prisma.class.findMany({
      where: classWhere,
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });

    // 已有的周评记录
    const existingRecords = await prisma.checkRecord.findMany({
      where: {
        date: week.friday,
        checkItem: { module: "WEEKLY" },
        ...(classId ? { classId } : {}),
      },
      include: { checkItem: true },
    });

    // 本周日评统计（用于 W-5 建议）
    const dailyRecords = await prisma.checkRecord.findMany({
      where: {
        date: { gte: week.startDate, lte: week.endDate },
        checkItem: { module: "DAILY" },
        ...(classId ? { classId } : {}),
      },
      include: { checkItem: true },
    });

    // 如果指定了 classId，计算 W-5 建议
    let gradeSuggestion = null;
    if (classId) {
      const classDaily = dailyRecords.filter((r) => r.classId === classId);
      const classWeekly = existingRecords.filter(
        (r) => r.classId === classId && r.checkItem.code !== "W-5"
      );
      const suggestion = suggestWeeklyGrade(classDaily, classWeekly, ts, locale);

      const total = classDaily.length;
      const passed = classDaily.filter((r) => r.passed === true).length;
      gradeSuggestion = {
        ...suggestion,
        dailyTotal: total,
        dailyPassed: passed,
        dailyPassRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      };
    }

    // 各班周评完成状态
    const recordsByClass = existingRecords.reduce(
      (acc, r) => {
        if (!acc[r.classId]) acc[r.classId] = [];
        acc[r.classId].push(r);
        return acc;
      },
      {} as Record<string, typeof existingRecords>
    );

    // 各班日评统计
    const dailyStatsByClass = dailyRecords.reduce(
      (acc, r) => {
        if (!acc[r.classId]) acc[r.classId] = { total: 0, passed: 0 };
        acc[r.classId].total++;
        if (r.passed === true) acc[r.classId].passed++;
        return acc;
      },
      {} as Record<string, { total: number; passed: number }>
    );

    const classData = classes.map((cls) => {
      const records = recordsByClass[cls.id] ?? [];
      const dailyStats = dailyStatsByClass[cls.id] ?? { total: 0, passed: 0 };
      const w5Record = records.find((r) => r.checkItem.code === "W-5");
      return {
        ...cls,
        weeklyRecords: records,
        completedItems: records.length,
        totalItems: weeklyItems.length,
        currentGrade: w5Record?.optionValue ?? null,
        dailyPassRate:
          dailyStats.total > 0
            ? Math.round((dailyStats.passed / dailyStats.total) * 100)
            : null,
        dailyTotal: dailyStats.total,
        dailyPassed: dailyStats.passed,
      };
    });

    // 时效性信息：供前端展示截止时间和是否可提交
    const deadlineResult = checkDeadline("weekly", week.friday, session.user.role, locale);
    const deadlineInfo = {
      open: deadlineResult.allowed && !deadlineResult.isOverride,
      allowed: deadlineResult.allowed,
      isOverride: deadlineResult.isOverride,
      deadline: deadlineResult.deadlineFormatted ?? null,
    };

    return NextResponse.json({
      week,
      weekParam,
      weeklyItems,
      classes: classData,
      gradeSuggestion,
      deadlineInfo,
    });
  } catch (error) {
    console.error("WeeklyReview GET error:", error);
    return NextResponse.json({ error: t("weeklyReviewLoadFailed") }, { status: 500 });
  }
}

// POST: 提交周评记录（支持 week 参数回溯上周）
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "GRADE_LEADER") {
    const locale = await getLocale();
    const t = createTranslator(locale, "api.errors");
    return NextResponse.json({ error: t("onlyAdminAndLeaderSubmitWeekly") }, { status: 403 });
  }

  const ip = getClientIP(request);
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  try {
    const body = await request.json();
    const { classId, records: recordInputs, week: weekParam } = body as {
      classId: string;
      records: Array<{
        checkItemId: string;
        optionValue: string;
        comment?: string;
      }>;
      week?: string; // "current" | "previous"
    };

    if (!classId || !Array.isArray(recordInputs)) {
      return NextResponse.json({ error: t("classIdAndRecordsRequired") }, { status: 400 });
    }

    // 验证 session 用户仍存在于数据库（防止数据库重置后 JWT 过期）
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!dbUser) {
      return NextResponse.json({ error: t("sessionExpired") }, { status: 401 });
    }

    // 年级权限检查
    if (session.user.role === "GRADE_LEADER" && session.user.managedGrade != null) {
      const targetClass = await prisma.class.findUnique({ where: { id: classId } });
      if (!targetClass || targetClass.grade !== session.user.managedGrade) {
        return NextResponse.json({ error: t("onlyOwnGradeWeekly") }, { status: 403 });
      }
    }

    const weekOffset = weekParam === "previous" ? 1 : 0;
    const week = getWeekRange(weekOffset);

    // 时效性校验：周评截止时间为下周一 12:00
    const deadline = checkDeadline("weekly", week.friday, session.user.role, locale);
    if (!deadline.allowed) {
      return NextResponse.json({ error: t("weeklyReviewExpired", { deadline: deadline.deadlineFormatted ?? "" }) }, { status: 403 });
    }
    // 管理员超期操作记录日志
    if (deadline.isOverride) {
      logDataChange("UPDATE", session.user, "WeeklyReview", {
        overrideType: "admin_override_weekly",
        weekFriday: week.friday,
        deadlineFormatted: deadline.deadlineFormatted,
        note: "管理员在截止时间后超期修改周评数据",
      }, ip);
    }

    await prisma.$transaction(
      recordInputs.map((r) =>
        prisma.checkRecord.upsert({
          where: {
            classId_checkItemId_date: {
              classId,
              checkItemId: r.checkItemId,
              date: week.friday,
            },
          },
          create: {
            classId,
            checkItemId: r.checkItemId,
            date: week.friday,
            optionValue: r.optionValue,
            comment: r.comment ?? null,
            scoredById: session.user!.id,
          },
          update: {
            optionValue: r.optionValue,
            comment: r.comment ?? null,
          },
        })
      )
    );

    logDataChange("UPSERT", session.user, "WeeklyReview", {
      classId,
      weekFriday: week.friday,
      weekParam: weekParam ?? "current",
      itemCount: recordInputs.length,
      records: recordInputs,
    }, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("提交周评记录", session.user, error, ip);
    return NextResponse.json({ error: t("weeklySubmitFailed") }, { status: 500 });
  }
}
