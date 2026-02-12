import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subDays, isWeekend, format } from "date-fns";

function getLast7WorkingDays(): string[] {
  const dates: string[] = [];
  let day = new Date();
  while (dates.length < 7) {
    if (!isWeekend(day)) {
      dates.push(format(day, "yyyy-MM-dd"));
    }
    day = subDays(day, 1);
  }
  return dates.reverse();
}

function getLast30WorkingDays(): string {
  let day = new Date();
  let count = 0;
  while (count < 30) {
    if (!isWeekend(day)) {
      count++;
    }
    if (count < 30) day = subDays(day, 1);
  }
  return format(day, "yyyy-MM-dd");
}

// Simple linear regression: returns slope
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  // GRADE_LEADER / DUTY_TEACHER: 按年级过滤
  const isGradeLeader = session.user.role === "GRADE_LEADER";
  const isDutyTeacher = session.user.role === "DUTY_TEACHER";
  const managedGrade = session.user.managedGrade;
  const hasGradeScope = (isGradeLeader || isDutyTeacher) && managedGrade != null;
  const gradeClassFilter = hasGradeScope ? { grade: managedGrade } : {};

  try {
    // 获取范围内的班级 ID
    const scopedClasses = await prisma.class.findMany({
      where: gradeClassFilter,
      select: { id: true },
    });
    const scopedClassIds = scopedClasses.map((c) => c.id);

    // 检查项包括全校 + 年级专属
    const inspectionFilter = hasGradeScope
      ? { date: today, OR: [{ targetGrade: null }, { targetGrade: managedGrade }] }
      : { date: today };

    // Stats
    const [inspectionCount, scoredClassesResult, totalClasses, teacherCount] =
      await Promise.all([
        prisma.inspectionItem.count({ where: inspectionFilter }),
        prisma.score.findMany({
          where: {
            inspectionItem: { date: today },
            ...(scopedClassIds.length > 0 ? { classId: { in: scopedClassIds } } : {}),
          },
          select: { classId: true },
          distinct: ["classId"],
        }),
        prisma.class.count({ where: gradeClassFilter }),
        prisma.user.count(),
      ]);

    // --- Change 2: Unscored classes ---
    const scoredClassIds = scoredClassesResult.map((s) => s.classId);
    const unscoredWhere: Record<string, unknown> = { ...gradeClassFilter };
    if (scoredClassIds.length > 0) {
      unscoredWhere.id = { notIn: scoredClassIds };
    }
    const unscoredClasses = await prisma.class.findMany({
      where: unscoredWhere,
      orderBy: [{ grade: "asc" }, { section: "asc" }],
      select: { id: true, name: true, grade: true },
    });

    const stats = {
      inspectionCount,
      scoredClasses: scoredClassesResult.length,
      totalClasses,
      teacherCount,
    };

    // --- Change 4: Weekly trend by grade ---
    const workingDays = getLast7WorkingDays();
    const grades = hasGradeScope ? [managedGrade!] : [1, 2, 3];
    const weeklyTrend = await Promise.all(
      workingDays.map(async (date) => {
        const scoreFilter: Record<string, unknown> = { inspectionItem: { date } };
        if (scopedClassIds.length > 0 && hasGradeScope) {
          scoreFilter.classId = { in: scopedClassIds };
        }
        const allScores = await prisma.score.findMany({
          where: scoreFilter,
          include: { class: true },
        });
        const result: Record<string, number | string> = { date };
        for (const grade of grades) {
          const gradeScores = allScores.filter((s) => s.class.grade === grade);
          const avg =
            gradeScores.length > 0
              ? gradeScores.reduce((sum, s) => sum + s.score, 0) / gradeScores.length
              : 0;
          result[`grade${grade}Avg`] = Math.round(avg * 100) / 100;
        }
        // Also keep overall average for reference
        const overallAvg =
          allScores.length > 0
            ? allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length
            : 0;
        result.avgScore = Math.round(overallAvg * 100) / 100;
        return result;
      })
    );

    // Today's inspection items
    const todayItems = await prisma.inspectionItem.findMany({
      where: inspectionFilter,
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { scores: true } },
      },
    });

    // --- Change 5: Scoring ranking (last 30 days) ---
    const thirtyDaysAgo = getLast30WorkingDays();
    const recentScoreFilter: Record<string, unknown> = {
      inspectionItem: { date: { gte: thirtyDaysAgo } },
    };
    if (hasGradeScope && scopedClassIds.length > 0) {
      recentScoreFilter.classId = { in: scopedClassIds };
    }
    const recentScores = await prisma.score.findMany({
      where: recentScoreFilter,
      include: { inspectionItem: true },
    });

    // Group by title
    const byTitle: Record<string, { scores: number[]; maxScore: number }> = {};
    for (const s of recentScores) {
      const title = s.inspectionItem.title;
      if (!byTitle[title]) {
        byTitle[title] = { scores: [], maxScore: s.inspectionItem.maxScore };
      }
      byTitle[title].scores.push(s.score);
    }

    const titleStats = Object.entries(byTitle).map(([title, data]) => {
      const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const avgDeduction = data.maxScore - avg;
      const scoreRate = avg / data.maxScore;
      return { title, avg, avgDeduction, scoreRate, maxScore: data.maxScore, count: data.scores.length };
    });

    // Worst: highest average deduction
    const worstItems = [...titleStats]
      .sort((a, b) => b.avgDeduction - a.avgDeduction)
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        avgScore: Math.round(item.avg * 100) / 100,
        avgDeduction: Math.round(item.avgDeduction * 100) / 100,
        maxScore: item.maxScore,
        scoreRate: Math.round(item.scoreRate * 1000) / 10,
        count: item.count,
      }));

    // Best: highest score rate
    const bestItems = [...titleStats]
      .sort((a, b) => b.scoreRate - a.scoreRate)
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        avgScore: Math.round(item.avg * 100) / 100,
        avgDeduction: Math.round(item.avgDeduction * 100) / 100,
        maxScore: item.maxScore,
        scoreRate: Math.round(item.scoreRate * 1000) / 10,
        count: item.count,
      }));

    const scoringRanking = { worstItems, bestItems };

    // --- Change 6: AI Analysis ---
    // Group scores by title and date for trend analysis
    const byTitleDate: Record<string, Record<string, number[]>> = {};
    for (const s of recentScores) {
      const title = s.inspectionItem.title;
      const date = s.inspectionItem.date;
      if (!byTitleDate[title]) byTitleDate[title] = {};
      if (!byTitleDate[title][date]) byTitleDate[title][date] = [];
      byTitleDate[title][date].push(s.score / s.inspectionItem.maxScore);
    }

    // Calculate trend for each title (daily average score rates over time)
    const riskAreas: Array<{
      title: string;
      trend: "declining" | "volatile";
      avgScore: number;
      suggestion: string;
    }> = [];

    const recommendations: Array<{
      title: string;
      reason: string;
      priority: "high" | "medium";
    }> = [];

    for (const [title, dateMap] of Object.entries(byTitleDate)) {
      const sortedDates = Object.keys(dateMap).sort();
      const dailyRates = sortedDates.map((d) => {
        const rates = dateMap[d];
        return rates.reduce((a, b) => a + b, 0) / rates.length;
      });

      const slope = linearSlope(dailyRates);
      const sd = stdDev(dailyRates);
      const overallAvg = dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;
      const titleInfo = byTitle[title];

      // Declining: negative slope and avg below 85%
      if (slope < -0.005 && overallAvg < 0.85) {
        riskAreas.push({
          title,
          trend: "declining",
          avgScore: Math.round(overallAvg * titleInfo.maxScore * 100) / 100,
          suggestion: `得分率持续下降（斜率${(slope * 100).toFixed(1)}%/天），建议加强关注`,
        });
        recommendations.push({
          title,
          reason: `近30天得分趋势下降，当前平均得分率${Math.round(overallAvg * 100)}%`,
          priority: "high",
        });
      }
      // Volatile: high standard deviation
      else if (sd > 0.08) {
        riskAreas.push({
          title,
          trend: "volatile",
          avgScore: Math.round(overallAvg * titleInfo.maxScore * 100) / 100,
          suggestion: `得分波动较大（标准差${(sd * 100).toFixed(1)}%），表现不稳定`,
        });
        recommendations.push({
          title,
          reason: `得分波动大，标准差${(sd * 100).toFixed(1)}%，需要稳定性改进`,
          priority: "medium",
        });
      }
      // Low average even if stable
      else if (overallAvg < 0.78) {
        recommendations.push({
          title,
          reason: `平均得分率仅${Math.round(overallAvg * 100)}%，低于合格线`,
          priority: "high",
        });
      }
    }

    // Grade-level alerts
    const byGradeTitle: Record<string, Record<string, number[]>> = {};
    for (const s of recentScores) {
      const grade = (s as any).class?.grade;
      if (!grade) {
        // Need to look up class
        continue;
      }
      const key = `${grade}`;
      const title = s.inspectionItem.title;
      if (!byGradeTitle[key]) byGradeTitle[key] = {};
      if (!byGradeTitle[key][title]) byGradeTitle[key][title] = [];
      byGradeTitle[key][title].push(s.score / s.inspectionItem.maxScore);
    }

    // Re-fetch with class included for grade analysis
    const recentScoresWithClass = await prisma.score.findMany({
      where: recentScoreFilter,
      include: { inspectionItem: true, class: true },
    });

    const gradeAlertMap: Record<string, Record<string, number[]>> = {};
    for (const s of recentScoresWithClass) {
      const grade = s.class.grade;
      const title = s.inspectionItem.title;
      const key = `${grade}`;
      if (!gradeAlertMap[key]) gradeAlertMap[key] = {};
      if (!gradeAlertMap[key][title]) gradeAlertMap[key][title] = [];
      gradeAlertMap[key][title].push(s.score / s.inspectionItem.maxScore);
    }

    const gradeAlerts: Array<{ grade: number; weakArea: string; avgScore: number }> = [];
    // For each grade, find the weakest area
    for (const [gradeStr, titleMap] of Object.entries(gradeAlertMap)) {
      let weakestTitle = "";
      let weakestRate = 1;
      for (const [title, rates] of Object.entries(titleMap)) {
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        if (avg < weakestRate) {
          weakestRate = avg;
          weakestTitle = title;
        }
      }
      if (weakestTitle && weakestRate < 0.85) {
        const titleInfo = byTitle[weakestTitle];
        gradeAlerts.push({
          grade: parseInt(gradeStr),
          weakArea: weakestTitle,
          avgScore: Math.round(weakestRate * (titleInfo?.maxScore ?? 10) * 100) / 100,
        });
      }
    }

    // If no risk areas found, add a positive message
    if (riskAreas.length === 0 && recommendations.length === 0) {
      recommendations.push({
        title: "保持当前节奏",
        reason: "近30天各项评分趋势稳定，建议继续保持",
        priority: "medium",
      });
    }

    const aiAnalysis = {
      riskAreas: riskAreas.sort((a, b) => (a.trend === "declining" ? -1 : 1)),
      recommendations: recommendations.sort((a, b) => (a.priority === "high" ? -1 : 1)),
      gradeAlerts: gradeAlerts.sort((a, b) => a.grade - b.grade),
    };

    const response: Record<string, unknown> = {
      stats,
      weeklyTrend,
      todayItems,
      unscoredClasses,
      scoringRanking,
      aiAnalysis,
    };

    // For GRADE_LEADER / DUTY_TEACHER: add managedGrade to response
    if (hasGradeScope) {
      response.managedGrade = managedGrade;
    }

    // For DUTY_TEACHER: add teacher-specific metrics & AI insights
    if (isDutyTeacher) {
      const teacherId = session.user.id;

      // 1. Total scored days (distinct dates this teacher has scored)
      const teacherScores = await prisma.score.findMany({
        where: { scoredById: teacherId },
        include: { inspectionItem: true, class: true },
      });

      const scoredDatesSet = new Set(teacherScores.map((s) => s.inspectionItem.date));
      const dutyTotalScoredDays = scoredDatesSet.size;

      // 2. Total scored count & distinct classes
      const dutyTotalScoreCount = teacherScores.length;
      const dutyDistinctClasses = new Set(teacherScores.map((s) => s.classId)).size;

      // 3. AI Insights based on teacher's scoring habits
      // -- 3a. Personal avg score rate
      let personalAvgRate = 0;
      if (teacherScores.length > 0) {
        const rateSum = teacherScores.reduce(
          (sum, s) => sum + s.score / s.inspectionItem.maxScore,
          0
        );
        personalAvgRate = rateSum / teacherScores.length;
      }

      // -- 3b. Grade-wide avg score rate (all scorers, same grade classes)
      let gradeAvgRate = 0;
      if (hasGradeScope && scopedClassIds.length > 0) {
        const gradeScores = await prisma.score.findMany({
          where: { classId: { in: scopedClassIds } },
          include: { inspectionItem: true },
        });
        if (gradeScores.length > 0) {
          const gradeRateSum = gradeScores.reduce(
            (sum, s) => sum + s.score / s.inspectionItem.maxScore,
            0
          );
          gradeAvgRate = gradeRateSum / gradeScores.length;
        }
      }

      // -- 3c. Tendency: lenient or strict
      const rateDiff = personalAvgRate - gradeAvgRate;
      let tendency: "strict" | "lenient" | "balanced" = "balanced";
      let tendencyDesc = "评分与年级整体水平基本一致";
      if (rateDiff < -0.03) {
        tendency = "strict";
        tendencyDesc = `评分偏严格，个人平均得分率 ${Math.round(personalAvgRate * 100)}% 低于年级平均 ${Math.round(gradeAvgRate * 100)}%`;
      } else if (rateDiff > 0.03) {
        tendency = "lenient";
        tendencyDesc = `评分偏宽松，个人平均得分率 ${Math.round(personalAvgRate * 100)}% 高于年级平均 ${Math.round(gradeAvgRate * 100)}%`;
      }

      // -- 3d. Stability: std dev of daily average score rates
      const dailyRateMap: Record<string, number[]> = {};
      for (const s of teacherScores) {
        const date = s.inspectionItem.date;
        if (!dailyRateMap[date]) dailyRateMap[date] = [];
        dailyRateMap[date].push(s.score / s.inspectionItem.maxScore);
      }
      const dailyAvgs = Object.values(dailyRateMap).map(
        (rates) => rates.reduce((a, b) => a + b, 0) / rates.length
      );
      const stabilityStdDev = stdDev(dailyAvgs);
      let stabilityLevel: "stable" | "moderate" | "volatile" = "stable";
      let stabilityDesc = "评分非常稳定，每日得分率波动很小";
      if (stabilityStdDev > 0.1) {
        stabilityLevel = "volatile";
        stabilityDesc = `评分波动较大（标准差 ${(stabilityStdDev * 100).toFixed(1)}%），建议保持更一致的评分标准`;
      } else if (stabilityStdDev > 0.05) {
        stabilityLevel = "moderate";
        stabilityDesc = `评分稳定性一般（标准差 ${(stabilityStdDev * 100).toFixed(1)}%），整体尚可`;
      }

      // -- 3e. Frequent low-score items
      const itemDeductionMap: Record<string, { total: number; count: number; maxScore: number }> = {};
      for (const s of teacherScores) {
        const title = s.inspectionItem.title;
        if (!itemDeductionMap[title]) {
          itemDeductionMap[title] = { total: 0, count: 0, maxScore: s.inspectionItem.maxScore };
        }
        itemDeductionMap[title].total += s.inspectionItem.maxScore - s.score;
        itemDeductionMap[title].count++;
      }
      const frequentDeductions = Object.entries(itemDeductionMap)
        .map(([title, d]) => ({
          title,
          avgDeduction: d.count > 0 ? d.total / d.count : 0,
          maxScore: d.maxScore,
          count: d.count,
        }))
        .sort((a, b) => b.avgDeduction - a.avgDeduction)
        .slice(0, 3);

      // -- 3f. Suggestions
      const suggestions: string[] = [];
      if (dutyTotalScoredDays < 5) {
        suggestions.push("评分天数较少，AI 分析样本不足，建议积累更多评分数据后再参考。");
      } else {
        if (tendency === "strict") {
          suggestions.push("您的评分整体偏严格，可以与同年级其他老师交流评分标准，保持公平性。");
        } else if (tendency === "lenient") {
          suggestions.push("您的评分整体偏宽松，建议适当提高评分标准，促进班级常规改进。");
        }
        if (stabilityLevel === "volatile") {
          suggestions.push("您的评分波动较大，建议建立更固定的评分参照标准，减少主观偏差。");
        }
        if (frequentDeductions.length > 0 && frequentDeductions[0].avgDeduction > 1) {
          suggestions.push(
            `「${frequentDeductions[0].title}」是您评分中扣分最多的项目（平均扣 ${frequentDeductions[0].avgDeduction.toFixed(1)} 分），可重点关注该领域改善情况。`
          );
        }
        if (suggestions.length === 0) {
          suggestions.push("您的评分习惯整体均衡稳定，请继续保持！");
        }
      }

      response.dutyTeacherMetrics = {
        totalScoredDays: dutyTotalScoredDays,
        totalScoreCount: dutyTotalScoreCount,
        distinctClasses: dutyDistinctClasses,
        personalAvgRate: Math.round(personalAvgRate * 1000) / 10,
        gradeAvgRate: Math.round(gradeAvgRate * 1000) / 10,
      };

      response.dutyTeacherAiInsights = {
        tendency,
        tendencyDesc,
        stabilityLevel,
        stabilityDesc,
        frequentDeductions: frequentDeductions.map((d) => ({
          title: d.title,
          avgDeduction: Math.round(d.avgDeduction * 100) / 100,
          maxScore: d.maxScore,
          count: d.count,
        })),
        suggestions,
        sampleSufficient: dutyTotalScoredDays >= 5,
      };
    }

    // For CLASS_TEACHER: add class-specific data
    if (session.user.role === "CLASS_TEACHER" && session.user.classId) {
      const classId = session.user.classId;

      // --- Today's scores ---
      const classScores = await prisma.score.findMany({
        where: {
          classId,
          inspectionItem: { date: today },
        },
        include: { inspectionItem: true },
      });

      const classTotalToday = classScores.reduce((sum, s) => sum + s.score, 0);
      response.classScores = classScores;
      response.classTotalToday = Math.round(classTotalToday * 100) / 100;

      // --- Weekly grade ranking ---
      const myClass = await prisma.class.findUnique({ where: { id: classId } });
      if (myClass) {
        const sameGradeClasses = await prisma.class.findMany({
          where: { grade: myClass.grade },
          select: { id: true },
        });

        // Sum scores for each class over workingDays
        const classWeekTotals: { classId: string; total: number }[] = [];
        for (const gc of sameGradeClasses) {
          const scores = await prisma.score.findMany({
            where: {
              classId: gc.id,
              inspectionItem: { date: { in: workingDays } },
            },
            select: { score: true },
          });
          classWeekTotals.push({
            classId: gc.id,
            total: scores.reduce((s, r) => s + r.score, 0),
          });
        }
        classWeekTotals.sort((a, b) => b.total - a.total);
        const rank = classWeekTotals.findIndex((c) => c.classId === classId) + 1;
        response.classWeekRank = rank;
        response.classWeekGradeTotal = sameGradeClasses.length;
      }

      // --- Item analysis (deductions / top scores + AI Tips) ---
      const url = new URL(request.url);
      const analysisRange = url.searchParams.get("classAnalysisRange") || "month";

      let analysisDateFilter: Record<string, unknown>;
      if (analysisRange === "week") {
        analysisDateFilter = { in: workingDays };
      } else if (analysisRange === "year") {
        // Academic year: Sep 1 of current or previous year
        const now = new Date();
        const yearStart = now.getMonth() >= 8
          ? `${now.getFullYear()}-09-01`
          : `${now.getFullYear() - 1}-09-01`;
        analysisDateFilter = { gte: yearStart, lte: today };
      } else {
        // Default: month
        const monthStart = today.slice(0, 8) + "01";
        analysisDateFilter = { gte: monthStart, lte: today };
      }

      const analysisScores = await prisma.score.findMany({
        where: {
          classId,
          inspectionItem: { date: analysisDateFilter },
        },
        include: { inspectionItem: true },
      });

      // Group by inspection item title
      const itemMap: Record<string, {
        totalDeduction: number;
        totalScore: number;
        totalMaxScore: number;
        count: number;
        maxScore: number;
      }> = {};

      for (const s of analysisScores) {
        const title = s.inspectionItem.title;
        if (!itemMap[title]) {
          itemMap[title] = { totalDeduction: 0, totalScore: 0, totalMaxScore: 0, count: 0, maxScore: s.inspectionItem.maxScore };
        }
        itemMap[title].totalDeduction += s.inspectionItem.maxScore - s.score;
        itemMap[title].totalScore += s.score;
        itemMap[title].totalMaxScore += s.inspectionItem.maxScore;
        itemMap[title].count++;
      }

      const itemEntries = Object.entries(itemMap);

      // Top deductions (highest avg deduction)
      const topDeductions = itemEntries
        .map(([title, d]) => ({
          title,
          avgDeduction: d.count > 0 ? Math.round((d.totalDeduction / d.count) * 100) / 100 : 0,
          maxScore: d.maxScore,
          count: d.count,
        }))
        .sort((a, b) => b.avgDeduction - a.avgDeduction)
        .slice(0, 3);

      // Top scores (highest score rate)
      const topScores = itemEntries
        .map(([title, d]) => ({
          title,
          avgScoreRate: d.totalMaxScore > 0 ? Math.round((d.totalScore / d.totalMaxScore) * 1000) / 10 : 0,
          maxScore: d.maxScore,
          count: d.count,
        }))
        .sort((a, b) => b.avgScoreRate - a.avgScoreRate)
        .slice(0, 3);

      // AI Tips based on analysis
      const aiTips: string[] = [];
      const rangeLabel = analysisRange === "week" ? "本周" : analysisRange === "year" ? "本学年" : "本月";

      if (analysisScores.length === 0) {
        aiTips.push(`${rangeLabel}暂无评分数据，无法生成分析建议。`);
      } else {
        // Tip based on top deduction
        if (topDeductions.length > 0 && topDeductions[0].avgDeduction > 0.5) {
          const d = topDeductions[0];
          aiTips.push(
            `「${d.title}」是${rangeLabel}扣分最多的项目（平均扣 ${d.avgDeduction} 分），建议重点关注此领域，制定针对性改进措施。`
          );
        }
        // Tip for second deduction if significant
        if (topDeductions.length > 1 && topDeductions[1].avgDeduction > 0.3) {
          aiTips.push(
            `「${topDeductions[1].title}」也需要注意，平均扣分 ${topDeductions[1].avgDeduction} 分，可安排学生互查互助。`
          );
        }
        // Positive encouragement
        if (topScores.length > 0 && topScores[0].avgScoreRate >= 90) {
          aiTips.push(
            `「${topScores[0].title}」表现优秀（得分率 ${topScores[0].avgScoreRate}%），可作为班级亮点进行表扬，激励其他方面同步提升。`
          );
        }
        // General suggestion
        if (topDeductions.length > 0 && topScores.length > 0) {
          aiTips.push(
            `建议将「${topScores[0].title}」的优秀经验迁移至「${topDeductions[0].title}」的管理中，形成良性带动效应。`
          );
        }
        if (aiTips.length === 0) {
          aiTips.push(`${rangeLabel}班级各项评分均衡稳定，继续保持！`);
        }
      }

      response.classItemAnalysis = {
        range: analysisRange,
        topDeductions,
        topScores,
        aiTips,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
