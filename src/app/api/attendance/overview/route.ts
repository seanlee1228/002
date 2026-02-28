import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getBejingDayOfWeek,
} from "@/lib/attendance/time-matcher";
import { CURRENT_CALENDAR } from "@/lib/school-calendar";
import { fetchClassReviewSummary } from "@/lib/fetch-attendance";

type AttendanceRange = "day" | "week" | "month";

function parseRange(range: string | null): AttendanceRange {
  if (range === "week" || range === "month") return range;
  return "day";
}

function formatDateInBeijing(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getBeijingDateRange(range: AttendanceRange): {
  today: string;
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );
  const today = formatDateInBeijing(beijing);

  if (range === "day") {
    return { today, startDate: today, endDate: today };
  }

  if (range === "week") {
    const day = beijing.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    const monday = new Date(beijing);
    monday.setDate(beijing.getDate() + mondayDiff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      today,
      startDate: formatDateInBeijing(monday),
      endDate: formatDateInBeijing(sunday),
    };
  }

  const firstDay = new Date(beijing.getFullYear(), beijing.getMonth(), 1);
  const lastDay = new Date(beijing.getFullYear(), beijing.getMonth() + 1, 0);
  return {
    today,
    startDate: formatDateInBeijing(firstDay),
    endDate: formatDateInBeijing(lastDay),
  };
}

function enumerateDateStrings(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    dates.push(formatDateInBeijing(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getDayOfWeekFromDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/**
 * GET /api/attendance/overview
 * 主管考勤面板数据（当日全景）
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { role, managedGrade } = session.user;
  if (!["ADMIN", "GRADE_LEADER"].includes(role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const range = parseRange(new URL(req.url).searchParams.get("range"));
  const { today, startDate, endDate } = getBeijingDateRange(range);
  const dateList = enumerateDateStrings(startDate, endDate);
  const todayDayOfWeek = getBejingDayOfWeek();
  const dayOfWeekFilter = range === "day" ? todayDayOfWeek : undefined;

  // 年级过滤
  const gradeFilter =
    role === "GRADE_LEADER" && managedGrade
      ? { class: { grade: managedGrade } }
      : {};

  // 1) 班级列表
  const classes = await prisma.class.findMany({
    where:
      role === "GRADE_LEADER" && managedGrade ? { grade: managedGrade } : {},
    select: { id: true, grade: true, name: true },
    orderBy: [{ grade: "asc" }, { section: "asc" }],
  });
  const classIdToGrade = new Map(classes.map((c) => [c.id, c.grade]));
  const classIdToName = new Map(classes.map((c) => [c.id, c.name]));

  // 2) 各班各星期的室外课基数
  const slotCountByClassAndWeekday = await prisma.courseSlot.groupBy({
    by: ["classId", "dayOfWeek"],
    where: {
      isOutdoor: true,
      isActive: true,
      ...gradeFilter,
    },
    _count: true,
  });

  // 3) 时间区间内应考勤课程总数（按日期展开）
  let totalOutdoorSlots = 0;
  const classTotalMap = new Map<string, number>();
  const weekdayCountMap = new Map<number, number>();
  for (const date of dateList) {
    const dayOfWeek = getDayOfWeekFromDate(date);
    weekdayCountMap.set(dayOfWeek, (weekdayCountMap.get(dayOfWeek) ?? 0) + 1);
  }
  for (const row of slotCountByClassAndWeekday) {
    const dayCount = weekdayCountMap.get(row.dayOfWeek) ?? 0;
    const add = row._count * dayCount;
    totalOutdoorSlots += add;
    classTotalMap.set(row.classId, (classTotalMap.get(row.classId) ?? 0) + add);
  }

  // 4) 已取消课程总数
  const cancelledCount = await prisma.courseSwap.count({
    where: {
      date: { gte: startDate, lte: endDate },
      type: "cancel",
      courseSlot: { isOutdoor: true, ...gradeFilter },
    },
  });

  // 5) 已完成课程（按 日期+courseSlot 去重）
  const completedSlotGroups = await prisma.attendanceRecord.groupBy({
    by: ["date", "courseSlotId", "classId"],
    where: {
      date: { gte: startDate, lte: endDate },
      courseSlot: { isOutdoor: true, ...gradeFilter },
    },
    _count: true,
  });
  const completedCount = completedSlotGroups.length;
  const classCompletedMap = new Map<string, number>();
  for (const row of completedSlotGroups) {
    classCompletedMap.set(
      row.classId,
      (classCompletedMap.get(row.classId) ?? 0) + 1
    );
  }

  // 6) 缺勤人次
  const absentCount = await prisma.attendanceRecord.count({
    where: {
      date: { gte: startDate, lte: endDate },
      status: "absent",
      courseSlot: { isOutdoor: true, ...gradeFilter },
    },
  });

  // 7) 按年级统计
  const gradeMap = new Map<
    number,
    { totalSlots: number; completed: number; absent: number }
  >();
  for (const cls of classes) {
    if (!gradeMap.has(cls.grade)) {
      gradeMap.set(cls.grade, { totalSlots: 0, completed: 0, absent: 0 });
    }
  }

  for (const [classId, totalSlots] of classTotalMap.entries()) {
    const grade = classIdToGrade.get(classId);
    if (!grade) continue;
    const row = gradeMap.get(grade);
    if (row) row.totalSlots += totalSlots;
  }
  for (const [classId, completed] of classCompletedMap.entries()) {
    const grade = classIdToGrade.get(classId);
    if (!grade) continue;
    const row = gradeMap.get(grade);
    if (row) row.completed += completed;
  }
  const absentByClass = await prisma.attendanceRecord.groupBy({
    by: ["classId"],
    where: {
      date: { gte: startDate, lte: endDate },
      status: "absent",
      courseSlot: { isOutdoor: true, ...gradeFilter },
    },
    _count: true,
  });
  for (const ab of absentByClass) {
    const grade = classIdToGrade.get(ab.classId);
    if (!grade) continue;
    const row = gradeMap.get(grade);
    if (row) row.absent += ab._count;
  }

  const effectiveTotal = totalOutdoorSlots - cancelledCount;
  const completionRate =
    effectiveTotal > 0
      ? Math.round((completedCount / effectiveTotal) * 100)
      : 0;

  // pendingClasses: 有未完成考勤课次的班级列表
  const pendingClasses = classes
    .map((cls) => {
      const total = classTotalMap.get(cls.id) ?? 0;
      const completed = classCompletedMap.get(cls.id) ?? 0;
      const pending = Math.max(0, total - completed);
      return { classId: cls.id, name: cls.name, grade: cls.grade, total, completed, pending };
    })
    .filter((c) => c.total > 0 && c.pending > 0)
    .sort((a, b) => a.grade - b.grade);

  const reviewSummaryParams =
    role === "GRADE_LEADER" && managedGrade
      ? { grade: managedGrade }
      : ({} as Record<string, never>);
  const reviewSummary = await fetchClassReviewSummary(
    reviewSummaryParams,
    CURRENT_CALENDAR.startDate,
    CURRENT_CALENDAR.endDate
  ).catch(() => null);

  return NextResponse.json({
    range,
    period: { startDate, endDate },
    date: today,
    dayOfWeek: todayDayOfWeek,
    totalCourses: effectiveTotal,
    completedCourses: completedCount,
    pendingCourses: Math.max(0, effectiveTotal - completedCount),
    cancelledCourses: cancelledCount,
    absentCount,
    completionRate,
    byGrade: Array.from(gradeMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([grade, data]) => ({
        grade,
        ...data,
      })),
    reviewSummary,
    pendingClasses,
  });
}
