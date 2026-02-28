/**
 * 排期生成算法（v3 — 简化与加固）
 *
 * 学期层: 均衡覆盖底盘 — 保证 D-1~D-9 各项在学期内被均衡检查到
 * 周  层: 简单规则推荐 — 距上次检查最久优先 + 不达标率高优先
 * 兜  底: ensureWeekPlan — 评分页无计划时自动用学期基线生成
 */

import { prisma } from "@/lib/prisma";
import { CURRENT_CALENDAR, getWeekByDate } from "@/lib/school-calendar";
import { getChinaToday, toChinaDateString } from "@/lib/deadline";

// ========== 通用类型 ==========

export interface ClassifiedItem {
  id: string;
  code: string | null;
  title: string;
  sortOrder: number;
  planCategory: string | null;
}

export interface ClassifiedResult {
  resident: ClassifiedItem[];
  rotating: ClassifiedItem[];
}

export interface RotationGroup {
  group: string;
  items: ClassifiedItem[];
  weeks: number[];
}

// ========== 1. 分类算法（纯读取，不再自动判定） ==========

/**
 * 对 D-1~D-9 检查项进行分类：常驻 / 轮转
 * 规则:
 * - planCategory="resident" → 常驻
 * - 其余（"rotating" 或 null）→ 轮转
 * - 常驻上限 3 个（超出按 sortOrder 移入轮转）
 * - 保底: resident >= 2, rotating >= 3
 */
export async function classifyCheckItems(): Promise<ClassifiedResult> {
  const items = await prisma.checkItem.findMany({
    where: { isDynamic: false, module: "DAILY", isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const resident: ClassifiedItem[] = [];
  const rotating: ClassifiedItem[] = [];

  for (const item of items) {
    const ci: ClassifiedItem = {
      id: item.id,
      code: item.code,
      title: item.title,
      sortOrder: item.sortOrder,
      planCategory: item.planCategory,
    };

    if (item.planCategory === "resident") {
      resident.push(ci);
    } else {
      // "rotating" 或 null（兼容未初始化的旧数据）→ 轮转
      rotating.push(ci);
    }
  }

  // 常驻上限 3 个: 超出的按 sortOrder 后→前移入轮转
  while (resident.length > 3) {
    const toMove = resident.pop()!;
    rotating.unshift(toMove);
  }

  // 保底
  while (resident.length < 2 && rotating.length > 0) {
    resident.push(rotating.shift()!);
  }
  while (rotating.length < 3 && resident.length > 3) {
    rotating.push(resident.pop()!);
  }

  return { resident, rotating };
}

// ========== 2. 学期排期（均衡覆盖底盘） ==========

/**
 * 将轮转项分组，每组最多 slotsPerWeek 个
 * slotsPerWeek = 5 - 常驻项数量，确保每周总数 <= 5
 */
function buildRotationGroups(rotating: ClassifiedItem[], slotsPerWeek: number): RotationGroup[] {
  const perGroup = Math.max(1, Math.min(slotsPerWeek, 2)); // 每组 1~2 项
  const groups: RotationGroup[] = [];
  const names = "ABCDEFGHIJ".split("");
  for (let i = 0, idx = 0; i < rotating.length; i += perGroup, idx++) {
    groups.push({
      group: names[idx] || `G${idx + 1}`,
      items: rotating.slice(i, Math.min(i + perGroup, rotating.length)),
      weeks: [],
    });
  }
  return groups;
}

function assignWeeksToGroups(groups: RotationGroup[], from: number, to: number) {
  if (groups.length === 0) return groups;
  let gi = 0;
  for (let w = from; w <= to; w += 2) {
    const g = groups[gi % groups.length];
    g.weeks.push(w);
    if (w + 1 <= to) g.weeks.push(w + 1);
    gi++;
  }
  return groups;
}

/**
 * 获取学期基线: weekNumber → 该周应检查的 item IDs
 */
export async function getSemesterBaseline(): Promise<{
  resident: ClassifiedItem[];
  rotating: ClassifiedItem[];
  groups: RotationGroup[];
  weekItemMap: Map<number, string[]>;
  weekCodeMap: Map<number, string[]>;
}> {
  const { resident, rotating } = await classifyCheckItems();
  const slotsPerWeek = Math.max(1, 5 - resident.length);
  const groups = buildRotationGroups(rotating, slotsPerWeek);
  assignWeeksToGroups(groups, 1, CURRENT_CALENDAR.weeks.length);

  const weekGroupMap = new Map<number, RotationGroup>();
  for (const g of groups) {
    for (const w of g.weeks) weekGroupMap.set(w, g);
  }

  const weekItemMap = new Map<number, string[]>();
  const weekCodeMap = new Map<number, string[]>();
  for (const w of CURRENT_CALENDAR.weeks) {
    const rg = weekGroupMap.get(w.week);
    const residentIds = resident.map((r) => r.id);
    const rotatingIds = rg ? rg.items.map((r) => r.id) : [];
    // 硬性上限 5 项: 常驻优先，轮转填充剩余
    const maxRotating = Math.max(0, 5 - residentIds.length);
    const items = [...residentIds, ...rotatingIds.slice(0, maxRotating)];
    weekItemMap.set(w.week, items);

    const residentCodes = resident.map((r) => r.code || "?");
    const rotatingCodes = rg ? rg.items.map((r) => r.code || "?") : [];
    weekCodeMap.set(w.week, [...residentCodes, ...rotatingCodes.slice(0, maxRotating)]);
  }

  return { resident, rotating, groups, weekItemMap, weekCodeMap };
}

// 生成学期排期 DailyPlan
export interface GenerateScheduleResult {
  generated: number;
  skipped: number;
  resident: { code: string | null; title: string }[];
  rotationGroups: { group: string; items: string[]; weeks: number[] }[];
}

export async function generateSchedule(
  fromWeek: number, toWeek: number, userId: string
): Promise<GenerateScheduleResult> {
  const { resident, groups, weekItemMap } = await getSemesterBaseline();

  let generated = 0, skipped = 0;
  const relevantWeeks = CURRENT_CALENDAR.weeks.filter(
    (w) => w.week >= fromWeek && w.week <= toWeek
  );

  for (const week of relevantWeeks) {
    const dailyItems = (weekItemMap.get(week.week) || []).slice(0, 5);
    for (const day of week.schoolDays) {
      const existing = await prisma.dailyPlan.findFirst({
        where: { date: day, targetGrade: null },
      });
      if (existing) { skipped++; continue; }

      await prisma.dailyPlan.create({
        data: {
          date: day,
          targetGrade: null,
          createdById: userId,
          items: {
            create: dailyItems.map((itemId, idx) => ({
              checkItemId: itemId, sortOrder: idx + 1,
            })),
          },
        },
      });
      generated++;
    }
  }

  return {
    generated, skipped,
    resident: resident.map((r) => ({ code: r.code, title: r.title })),
    rotationGroups: groups.map((g) => ({
      group: g.group,
      items: g.items.map((i) => `${i.code || "?"} ${i.title}`),
      weeks: g.weeks,
    })),
  };
}

// ========== 3. 周推荐算法（简单规则） ==========

export interface RecommendedItem {
  id: string;
  code: string | null;
  title: string;
  isResident: boolean;
  score: number;
  reasons: string[];
}

export interface Deviation {
  code: string;
  type: "added" | "removed";
  reason: string;
}

export interface WeekRecommendation {
  weekNumber: number;
  recommended: RecommendedItem[];
  semesterBaseline: string[];
  deviations: Deviation[];
  dataConfidence: "high" | "medium" | "low";
}

export async function getWeekRecommendation(weekNumber: number): Promise<WeekRecommendation> {
  const baseline = await getSemesterBaseline();
  const { resident, rotating } = baseline;
  const baselineCodes = baseline.weekCodeMap.get(weekNumber) || [];
  const allItems = [...resident, ...rotating];

  // 近 14 天不达标率
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff14 = toChinaDateString(fourteenDaysAgo);

  const recentRecords = await prisma.checkRecord.findMany({
    where: { date: { gte: cutoff14 }, passed: { not: null } },
    select: { checkItemId: true, passed: true },
  });

  const failRateMap = new Map<string, { total: number; failed: number }>();
  for (const r of recentRecords) {
    const s = failRateMap.get(r.checkItemId) || { total: 0, failed: 0 };
    s.total++;
    if (!r.passed) s.failed++;
    failRateMap.set(r.checkItemId, s);
  }

  const getFailRate = (id: string) => {
    const s = failRateMap.get(id);
    return s && s.total > 0 ? s.failed / s.total : 0;
  };

  // 各项最后被纳入计划的日期 → 距今周数
  const today = getChinaToday();
  const allItemIds = allItems.map((i) => i.id);
  const recentPlanItems = await prisma.dailyPlanItem.findMany({
    where: { checkItemId: { in: allItemIds } },
    include: { plan: { select: { date: true } } },
    orderBy: { plan: { date: "desc" } },
  });
  const lastPlanDate = new Map<string, string>();
  for (const pi of recentPlanItems) {
    if (!lastPlanDate.has(pi.checkItemId)) {
      lastPlanDate.set(pi.checkItemId, pi.plan.date);
    }
  }

  const getWeeksSinceLast = (id: string) => {
    const lastDate = lastPlanDate.get(id);
    if (!lastDate) return rotating.length + 1; // 从未排入 → 最高优先
    const daysDiff = Math.floor(
      (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000
    );
    return Math.max(0, Math.floor(daysDiff / 7));
  };

  // 轮转项排序（两条简单规则）
  const slotsForRotating = Math.max(1, 5 - resident.length);
  const maxGap = Math.max(4, Math.ceil(rotating.length / slotsForRotating) * 2);

  const scored = rotating.map((item) => {
    const failRate = getFailRate(item.id);
    const weeksSinceLast = getWeeksSinceLast(item.id);
    const forced = weeksSinceLast >= maxGap;

    // 生成理由
    const reasons: string[] = [];
    if (forced) reasons.push(`已 ${weeksSinceLast} 周未检查，需确保覆盖`);
    else if (weeksSinceLast >= 3) reasons.push(`已 ${weeksSinceLast} 周未检查`);
    if (failRate > 0.15) reasons.push(`近两周不达标率 ${Math.round(failRate * 100)}%`);
    if (reasons.length === 0) reasons.push("均衡轮转");

    return { item, failRate, weeksSinceLast, forced, reasons };
  });

  // 排序: 强制优先 → 不达标率高优先 → 距上次检查久优先
  scored.sort((a, b) => {
    if (a.forced !== b.forced) return a.forced ? -1 : 1;
    if (Math.abs(a.failRate - b.failRate) > 0.01) return b.failRate - a.failRate;
    return b.weeksSinceLast - a.weeksSinceLast;
  });

  const selected = scored.slice(0, slotsForRotating);

  const recommended: RecommendedItem[] = [
    ...resident.map((r) => ({
      id: r.id, code: r.code, title: r.title, isResident: true,
      score: 1, reasons: ["常驻项"],
    })),
    ...selected.map((s, idx) => ({
      id: s.item.id, code: s.item.code, title: s.item.title, isResident: false,
      score: Math.round((1 - idx * 0.1) * 100) / 100, reasons: s.reasons,
    })),
  ];

  // 与学期基线对比
  const recommendedCodes = new Set(recommended.map((r) => r.code));
  const baselineCodesSet = new Set(baselineCodes);
  const deviations: Deviation[] = [];

  for (const r of recommended) {
    if (r.code && !baselineCodesSet.has(r.code) && !r.isResident) {
      deviations.push({
        code: r.code,
        type: "added",
        reason: r.reasons[0] || "推荐纳入",
      });
    }
  }
  for (const bc of baselineCodes) {
    if (!recommendedCodes.has(bc)) {
      const item = allItems.find((i) => i.code === bc);
      if (item && !resident.find((r) => r.id === item.id)) {
        deviations.push({
          code: bc,
          type: "removed",
          reason: "近期表现稳定，让位给更需关注的项目",
        });
      }
    }
  }

  // 数据充分度: 有近期记录 → high，否则 → low
  const totalRecords = recentRecords.length;
  const dataConfidence: "high" | "medium" | "low" =
    totalRecords >= 30 ? "high" : totalRecords >= 10 ? "medium" : "low";

  return {
    weekNumber,
    recommended,
    semesterBaseline: baselineCodes,
    deviations,
    dataConfidence,
  };
}

// ========== 4. 调整建议（仅 failRate 两条规则） ==========

export interface AdjustSuggestion {
  type: "promote" | "demote";
  itemId: string;
  code: string;
  title: string;
  reason: string;
  data: { failRate: number };
}

export async function getAdjustSuggestions(): Promise<AdjustSuggestion[]> {
  const { resident, rotating } = await classifyCheckItems();
  const suggestions: AdjustSuggestion[] = [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = toChinaDateString(thirtyDaysAgo);

  const records = await prisma.checkRecord.findMany({
    where: { date: { gte: cutoff }, passed: { not: null } },
    select: { checkItemId: true, passed: true },
  });

  const statsMap = new Map<string, { total: number; failed: number }>();
  for (const r of records) {
    const s = statsMap.get(r.checkItemId) || { total: 0, failed: 0 };
    s.total++;
    if (!r.passed) s.failed++;
    statsMap.set(r.checkItemId, s);
  }

  const seen = new Set<string>();

  // 规则 1: 轮转项不达标率 > 25% → 建议升为常驻
  if (resident.length < 3) {
    for (const item of rotating) {
      if (seen.has(item.id)) continue;
      const stats = statsMap.get(item.id);
      if (!stats || stats.total < 10) continue;
      const failRate = stats.failed / stats.total;
      if (failRate > 0.25) {
        seen.add(item.id);
        suggestions.push({
          type: "promote",
          itemId: item.id,
          code: item.code || "?",
          title: item.title,
          reason: `近30天不达标率 ${Math.round(failRate * 100)}%，建议提升为常驻`,
          data: { failRate: Math.round(failRate * 100) },
        });
      }
    }
  }

  // 规则 2: 常驻项不达标率 < 5% → 建议降为轮转
  for (const item of resident) {
    if (seen.has(item.id)) continue;
    const stats = statsMap.get(item.id);
    if (!stats || stats.total < 10) continue;
    const failRate = stats.failed / stats.total;
    if (failRate < 0.05) {
      seen.add(item.id);
      suggestions.push({
        type: "demote",
        itemId: item.id,
        code: item.code || "?",
        title: item.title,
        reason: `近30天不达标率仅 ${Math.round(failRate * 100)}%，可降为轮转`,
        data: { failRate: Math.round(failRate * 100) },
      });
    }
  }

  return suggestions;
}

// ========== 5. 排期总览 ==========

export interface WeekScheduleOverview {
  week: number;
  label: string;
  dateRange: string;
  days: number;
  items: string[];
  residentCodes: string[];
  generated: boolean;
  note?: string;
}

export interface ScheduleOverviewResult {
  calendar: { semester: string; semesterName: string; startDate: string; endDate: string };
  resident: { code: string | null; title: string }[];
  weekSchedules: WeekScheduleOverview[];
  stats: { totalDays: number; generatedDays: number };
}

export async function getScheduleOverview(): Promise<ScheduleOverviewResult> {
  const { resident, weekCodeMap } = await getSemesterBaseline();
  const residentCodes = resident.map((r) => r.code || "?");

  const allDays = CURRENT_CALENDAR.weeks.flatMap((w) => w.schoolDays);
  const existingPlans = await prisma.dailyPlan.findMany({
    where: { date: { in: allDays }, targetGrade: null },
    include: { items: { include: { checkItem: { select: { code: true } } } } },
  });
  const planByDate = new Map(existingPlans.map((p) => [p.date, p]));

  let totalDays = 0, generatedDays = 0;

  const weekSchedules: WeekScheduleOverview[] = CURRENT_CALENDAR.weeks.map((w) => {
    totalDays += w.schoolDays.length;
    const daysWithPlan = w.schoolDays.filter((d) => planByDate.has(d));
    generatedDays += daysWithPlan.length;

    // 使用实际计划或学期基线（硬性上限 5 项）
    let itemCodes = (weekCodeMap.get(w.week) || []).slice(0, 5);
    if (daysWithPlan.length > 0) {
      const firstPlan = planByDate.get(daysWithPlan[0]);
      if (firstPlan) {
        const actual = firstPlan.items.map((i) => i.checkItem.code || "?").filter((c) => c !== "?");
        if (actual.length > 0) itemCodes = actual.slice(0, 5);
      }
    }

    const startM = w.startDate.slice(5).replace(/^0/, "").replace(/-0?/, "/");
    const endM = w.endDate.slice(5).replace(/^0/, "").replace(/-0?/, "/");

    return {
      week: w.week,
      label: w.label,
      dateRange: `${startM}~${endM}`,
      days: w.schoolDays.length,
      items: itemCodes,
      residentCodes,
      generated: daysWithPlan.length === w.schoolDays.length,
      note: w.note,
    };
  });

  return {
    calendar: {
      semester: CURRENT_CALENDAR.semester,
      semesterName: CURRENT_CALENDAR.semesterName,
      startDate: CURRENT_CALENDAR.startDate,
      endDate: CURRENT_CALENDAR.endDate,
    },
    resident: resident.map((r) => ({ code: r.code, title: r.title })),
    weekSchedules,
    stats: { totalDays, generatedDays },
  };
}

// ========== 6. 按周查询每日计划 ==========

export interface WeekDayPlan {
  date: string;
  weekday: string;
  week: number;
  plan: { id: string; items: { code: string | null; title: string; isResident: boolean }[] } | null;
  source: "generated" | "manual" | "none";
}

export async function getWeekPlans(weekNumbers: number[]): Promise<WeekDayPlan[]> {
  const { resident } = await classifyCheckItems();
  const residentIds = new Set(resident.map((r) => r.id));

  const weeks = CURRENT_CALENDAR.weeks.filter((w) => weekNumbers.includes(w.week));
  const allDays = weeks.flatMap((w) => w.schoolDays);

  const plans = await prisma.dailyPlan.findMany({
    where: { date: { in: allDays }, targetGrade: null },
    include: {
      items: {
        include: { checkItem: { select: { id: true, code: true, title: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const planByDate = new Map(plans.map((p) => [p.date, p]));

  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  const result: WeekDayPlan[] = [];
  for (const w of weeks) {
    for (const day of w.schoolDays) {
      const p = planByDate.get(day);
      const dayOfWeek = new Date(day).getDay();
      result.push({
        date: day,
        weekday: weekdayNames[dayOfWeek],
        week: w.week,
        plan: p ? {
          id: p.id,
          items: p.items.map((i) => ({
            code: i.checkItem.code,
            title: i.checkItem.title,
            isResident: residentIds.has(i.checkItem.id),
          })),
        } : null,
        source: p ? "generated" : "none",
      });
    }
  }

  return result;
}

// ========== 7. 确认周计划 ==========

export async function confirmWeekPlan(
  weekNumber: number, checkItemIds: string[], userId: string
): Promise<{ generated: number; skipped: number }> {
  const week = CURRENT_CALENDAR.weeks.find((w) => w.week === weekNumber);
  if (!week) return { generated: 0, skipped: 0 };

  // 硬性上限 5 项
  const limitedIds = checkItemIds.slice(0, 5);

  let generated = 0;
  const skipped = 0;

  for (const day of week.schoolDays) {
    // 删除已有计划
    const existing = await prisma.dailyPlan.findFirst({
      where: { date: day, targetGrade: null },
    });
    if (existing) {
      await prisma.dailyPlanItem.deleteMany({ where: { planId: existing.id } });
      await prisma.dailyPlan.delete({ where: { id: existing.id } });
    }

    await prisma.dailyPlan.create({
      data: {
        date: day,
        targetGrade: null,
        createdById: userId,
        items: {
          create: limitedIds.map((itemId, idx) => ({
            checkItemId: itemId, sortOrder: idx + 1,
          })),
        },
      },
    });
    generated++;
  }

  return { generated, skipped };
}

// ========== 8. 自动兜底：确保当周有计划 ==========

/**
 * 当 scoring 页面发现今天没有 DailyPlan 时调用
 * 用学期基线自动生成当周所有教学日的计划
 * 仅在该周完全没有任何 DailyPlan 时才触发
 */
export async function ensureWeekPlan(date: string): Promise<boolean> {
  const week = getWeekByDate(date);
  if (!week) return false;

  // 该周是否已有任何 DailyPlan？
  const existingCount = await prisma.dailyPlan.count({
    where: { date: { in: week.schoolDays }, targetGrade: null },
  });
  if (existingCount > 0) return false; // 有计划就不自动生成

  // 用学期基线生成（硬性上限 5 项）
  const { weekItemMap } = await getSemesterBaseline();
  const itemIds = (weekItemMap.get(week.week) || []).slice(0, 5);
  if (itemIds.length === 0) return false;

  // 需要一个 system userId，查找 ADMIN 用户
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!adminUser) return false;

  for (const day of week.schoolDays) {
    await prisma.dailyPlan.create({
      data: {
        date: day,
        targetGrade: null,
        createdById: adminUser.id,
        items: {
          create: itemIds.map((itemId, idx) => ({
            checkItemId: itemId, sortOrder: idx + 1,
          })),
        },
      },
    });
  }

  return true;
}
