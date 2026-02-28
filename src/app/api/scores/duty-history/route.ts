import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale, createTranslator } from "@/lib/server-i18n";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "DUTY_TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");

  const teacherId = session.user.id;
  const url = new URL(request.url);

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")));

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 90);
  const fromStr = url.searchParams.get("from") || defaultFrom.toISOString().slice(0, 10);
  const toStr = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const classId = url.searchParams.get("classId") || undefined;
  const passedParam = url.searchParams.get("passed"); // "true" | "false" | null

  try {
    const where: Record<string, unknown> = {
      scoredById: teacherId,
      date: { gte: fromStr, lte: toStr },
      checkItem: { module: "DAILY" },
    };

    if (classId) where.classId = classId;
    if (passedParam === "true") where.passed = true;
    else if (passedParam === "false") where.passed = false;

    const totalCount = await prisma.checkRecord.count({ where });

    const records = await prisma.checkRecord.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, grade: true, section: true } },
        checkItem: { select: { id: true, code: true, title: true, description: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 概要统计
    const allRecords = await prisma.checkRecord.findMany({
      where: { scoredById: teacherId, checkItem: { module: "DAILY" } },
    });

    const scoredDatesSet = new Set(allRecords.map((r) => r.date));
    const distinctClassIds = new Set(allRecords.map((r) => r.classId));
    const totalPassed = allRecords.filter((r) => r.passed === true).length;
    const totalFailed = allRecords.filter((r) => r.passed === false).length;
    const recordsWithComment = allRecords.filter((r) => r.comment && r.comment.trim().length > 0);
    const totalWithComment = recordsWithComment.length;
    const totalCommentWords = recordsWithComment.reduce((sum, r) => sum + (r.comment?.trim().length ?? 0), 0);

    // 日均检查班级数
    const avgClassesPerDay = scoredDatesSet.size > 0
      ? Math.round((allRecords.length / scoredDatesSet.size) * 10) / 10
      : 0;

    // 连续检查天数（streak）
    const sortedDates = Array.from(scoredDatesSet).sort().reverse();
    let streak = 0;
    if (sortedDates.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      // 允许今天或昨天为起点
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const startIdx = sortedDates[0] === today ? 0 : sortedDates[0] === yesterday ? 0 : -1;
      if (startIdx >= 0) {
        streak = 1;
        for (let i = startIdx; i < sortedDates.length - 1; i++) {
          const curr = new Date(sortedDates[i] + "T00:00:00");
          const prev = new Date(sortedDates[i + 1] + "T00:00:00");
          const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
          // 跳过周末：如果差2天且跨周末也算连续
          if (diffDays === 1 || (diffDays <= 3 && curr.getDay() === 1)) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    // 不达标严重程度分布
    const failRecords = allRecords.filter((r) => r.passed === false);
    const severityDist = { minor: 0, moderate: 0, serious: 0 };
    for (const r of failRecords) {
      if (r.severity === "minor") severityDist.minor++;
      else if (r.severity === "moderate") severityDist.moderate++;
      else if (r.severity === "serious") severityDist.serious++;
    }

    // 改善案例：该教师检查扣分后，同一班级同一检查项后来达标了
    // 1. 找出该教师所有不达标记录
    const failedByTeacher = allRecords.filter((r) => r.passed === false);

    // 2. 按 classId+checkItemId 分组，找到最近一次不达标日期
    const failMap = new Map<string, { classId: string; checkItemId: string; failDate: string; severity: string | null }>();
    for (const r of failedByTeacher) {
      const key = `${r.classId}|${r.checkItemId}`;
      const existing = failMap.get(key);
      if (!existing || r.date > existing.failDate) {
        failMap.set(key, { classId: r.classId, checkItemId: r.checkItemId, failDate: r.date, severity: r.severity });
      }
    }

    // 3. 查询这些 class+item 组合在扣分之后是否有达标记录（不限于该教师打的分）
    const improvementCandidates = Array.from(failMap.values());
    const improvements: Array<{
      className: string;
      checkItemCode: string | null;
      checkItemTitle: string;
      failDate: string;
      passDate: string;
      severity: string | null;
    }> = [];

    if (improvementCandidates.length > 0) {
      // 批量查询：对每个 candidate 查找后续达标记录
      const laterPassRecords = await prisma.checkRecord.findMany({
        where: {
          checkItem: { module: "DAILY" },
          passed: true,
          OR: improvementCandidates.map((c) => ({
            classId: c.classId,
            checkItemId: c.checkItemId,
            date: { gt: c.failDate },
          })),
        },
        include: {
          class: { select: { name: true } },
          checkItem: { select: { code: true, title: true } },
        },
        orderBy: { date: "asc" },
      });

      // 按 classId+checkItemId 取最早达标记录
      const passMap = new Map<string, typeof laterPassRecords[0]>();
      for (const r of laterPassRecords) {
        const key = `${r.classId}|${r.checkItemId}`;
        if (!passMap.has(key)) {
          passMap.set(key, r);
        }
      }

      // 组装改善案例
      for (const candidate of improvementCandidates) {
        const key = `${candidate.classId}|${candidate.checkItemId}`;
        const passRecord = passMap.get(key);
        if (passRecord) {
          improvements.push({
            className: passRecord.class.name,
            checkItemCode: passRecord.checkItem.code,
            checkItemTitle: passRecord.checkItem.title,
            failDate: candidate.failDate,
            passDate: passRecord.date,
            severity: candidate.severity,
          });
        }
      }

      // 按改善日期倒序，取最近 5 条
      improvements.sort((a, b) => b.passDate.localeCompare(a.passDate));
      improvements.splice(5);
    }

    // 全校同期均值（用于对比）
    const schoolRecords14 = await prisma.checkRecord.findMany({
      where: {
        checkItem: { module: "DAILY" },
        date: { gte: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10) },
      },
      select: { passed: true },
    });
    const schoolPassRate14 = schoolRecords14.length > 0
      ? Math.round((schoolRecords14.filter((r) => r.passed === true).length / schoolRecords14.length) * 100)
      : 0;

    const summary = {
      totalScoredDays: scoredDatesSet.size,
      totalRecordCount: allRecords.length,
      distinctClasses: distinctClassIds.size,
      overallPassRate: allRecords.length > 0 ? Math.round((totalPassed / allRecords.length) * 100) : 0,
      avgClassesPerDay,
      streak,
      totalFailed,
      commentCount: totalWithComment,
      commentWords: totalCommentWords,
      commentRate: allRecords.length > 0 ? Math.round((totalWithComment / allRecords.length) * 100) : 0,
      severityDist,
      improvements,
      schoolPassRate14,
    };

    // 该教师检查过的班级（过滤下拉用）
    const classesScored = await prisma.class.findMany({
      where: { id: { in: Array.from(distinctClassIds) } },
      select: { id: true, name: true, grade: true, section: true },
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });

    // 每日汇总
    const dailyMap: Record<string, { count: number; passed: number }> = {};
    for (const r of allRecords) {
      if (!dailyMap[r.date]) dailyMap[r.date] = { count: 0, passed: 0 };
      dailyMap[r.date].count++;
      if (r.passed === true) dailyMap[r.date].passed++;
    }

    const dailySummary = Object.entries(dailyMap)
      .map(([date, d]) => ({
        date,
        count: d.count,
        passed: d.passed,
        passRate: d.count > 0 ? Math.round((d.passed / d.count) * 100) : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 90);

    return NextResponse.json({
      records: records.map((r) => ({
        id: r.id,
        date: r.date,
        passed: r.passed,
        comment: r.comment,
        class: r.class,
        checkItem: r.checkItem,
        createdAt: r.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary,
      classesScored,
      dailySummary,
    });
  } catch (error) {
    console.error("Duty history error:", error);
    return NextResponse.json({ error: t("dutyHistoryLoadFailed") }, { status: 500 });
  }
}
