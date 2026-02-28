import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getBejingDayOfWeek,
} from "@/lib/attendance/time-matcher";
import { getCurrentWeek, CURRENT_CALENDAR } from "@/lib/school-calendar";
import {
  fetchAttendanceW1,
  fetchClassAbsenceDetail,
  fetchClassReviewSummary,
} from "@/lib/fetch-attendance";

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
 * GET /api/attendance/class-summary?classId=xxx
 * 班主任视图：本班当日考勤汇总
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const classId =
    req.nextUrl.searchParams.get("classId") || session.user.classId;
  if (!classId) {
    return NextResponse.json({ error: "缺少班级信息" }, { status: 400 });
  }

  const range = parseRange(req.nextUrl.searchParams.get("range"));
  const { today, startDate, endDate } = getBeijingDateRange(range);
  const dateList = enumerateDateStrings(startDate, endDate);
  const dayOfWeek = getBejingDayOfWeek();
  const sw = getCurrentWeek();
  const weekRange = sw
    ? { monday: sw.startDate, friday: sw.endDate }
    : { monday: startDate, friday: endDate };

  // 1) 今日室外课（保持兼容：旧页面可能仍用到）
  const todaySlots = await prisma.courseSlot.findMany({
    where: {
      classId,
      dayOfWeek,
      isOutdoor: true,
      isActive: true,
    },
    include: {
      period: true,
      teacher: { select: { name: true } },
    },
    orderBy: { period: { periodNo: "asc" } },
  });

  // 2) 今日已完成考勤的课程（保持兼容）
  const todayRecords = await prisma.attendanceRecord.findMany({
    where: { classId, date: today, courseSlot: { isOutdoor: true } },
    include: {
      student: { select: { name: true } },
      courseSlot: { include: { period: true } },
    },
  });

  // 按课程分组
  const recordsBySlot = new Map<
    string,
    typeof todayRecords
  >();
  for (const r of todayRecords) {
    const list = recordsBySlot.get(r.courseSlotId) || [];
    list.push(r);
    recordsBySlot.set(r.courseSlotId, list);
  }

  // 3) 缺勤记录（按范围）
  const absentRecords = await prisma.attendanceRecord.findMany({
    where: {
      classId,
      date: { gte: startDate, lte: endDate },
      status: "absent",
      courseSlot: { isOutdoor: true },
    },
    include: {
      student: { select: { name: true } },
      courseSlot: { include: { period: true } },
    },
    orderBy: [{ date: "desc" }, { courseSlot: { period: { periodNo: "asc" } } }],
  });

  // 4) 兼容字段：今日缺勤学生（旧命名）
  const absentToday = todayRecords
    .filter((r) => r.status === "absent")
    .map((r) => ({
      studentName: r.student.name,
      subject: r.courseSlot.subject,
      periodNo: r.courseSlot.period.periodNo,
    }));

  const absentList = absentRecords.map((r) => ({
    date: r.date,
    studentName: r.student.name,
    subject: r.courseSlot.subject,
    periodNo: r.courseSlot.period.periodNo,
  }));

  // 5) 从 attendance-system 获取本周 W-1 数据 + 学期缺勤明细 + 课堂评价摘要
  const [w1Result, absenceDetail, reviewSummary] = await Promise.all([
    fetchAttendanceW1(classId, weekRange.monday, weekRange.friday),
    fetchClassAbsenceDetail(
      classId,
      CURRENT_CALENDAR.startDate,
      CURRENT_CALENDAR.endDate
    ),
    fetchClassReviewSummary(
      { classId },
      CURRENT_CALENDAR.startDate,
      CURRENT_CALENDAR.endDate
    ),
  ]);
  const weeklyAbsent = w1Result.absentCount;
  const w1Value = w1Result.optionValue;

  // 6) 范围统计
  const slotByWeekday = await prisma.courseSlot.groupBy({
    by: ["dayOfWeek"],
    where: { classId, isOutdoor: true, isActive: true },
    _count: true,
  });
  const weekdayCountMap = new Map<number, number>();
  for (const date of dateList) {
    const dateDayOfWeek = getDayOfWeekFromDate(date);
    weekdayCountMap.set(
      dateDayOfWeek,
      (weekdayCountMap.get(dateDayOfWeek) ?? 0) + 1
    );
  }
  let totalOutdoorSlots = 0;
  for (const row of slotByWeekday) {
    totalOutdoorSlots += row._count * (weekdayCountMap.get(row.dayOfWeek) ?? 0);
  }
  const cancelledCount = await prisma.courseSwap.count({
    where: {
      date: { gte: startDate, lte: endDate },
      type: "cancel",
      courseSlot: { classId, isOutdoor: true },
    },
  });
  const completedSlotGroups = await prisma.attendanceRecord.groupBy({
    by: ["date", "courseSlotId"],
    where: {
      classId,
      date: { gte: startDate, lte: endDate },
      courseSlot: { isOutdoor: true },
    },
    _count: true,
  });
  const completedCourses = completedSlotGroups.length;
  const absentCount = await prisma.attendanceRecord.count({
    where: {
      classId,
      date: { gte: startDate, lte: endDate },
      status: "absent",
      courseSlot: { isOutdoor: true },
    },
  });
  const totalCourses = Math.max(0, totalOutdoorSlots - cancelledCount);
  const pendingCourses = Math.max(0, totalCourses - completedCourses);
  const completionRate =
    totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

  // 未完成课次明细（最多返回 20 条，按日期倒序）
  const allSlots = await prisma.courseSlot.findMany({
    where: { classId, isOutdoor: true, isActive: true },
    include: { period: true },
  });
  const completedKeys = new Set(
    completedSlotGroups.map((g) => `${g.date}||${g.courseSlotId}`)
  );
  const cancelledKeys = new Set<string>();
  const cancelledSlots = await prisma.courseSwap.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      type: "cancel",
      courseSlot: { classId, isOutdoor: true },
    },
    select: { date: true, courseSlotId: true },
  });
  for (const c of cancelledSlots) cancelledKeys.add(`${c.date}||${c.courseSlotId}`);

  const pendingSlots: Array<{ date: string; subject: string; periodLabel: string }> = [];
  for (const date of dateList) {
    const dow = getDayOfWeekFromDate(date);
    for (const slot of allSlots) {
      if (slot.dayOfWeek !== dow) continue;
      const key = `${date}||${slot.id}`;
      if (completedKeys.has(key) || cancelledKeys.has(key)) continue;
      pendingSlots.push({
        date,
        subject: slot.subject,
        periodLabel: slot.period.label ?? `P${slot.period.periodNo}`,
      });
    }
  }
  pendingSlots.sort((a, b) => b.date.localeCompare(a.date));

  const courses = todaySlots.map((slot) => {
    const records = recordsBySlot.get(slot.id);
    return {
      subject: slot.subject,
      periodNo: slot.period.periodNo,
      startTime: slot.period.startTime,
      endTime: slot.period.endTime,
      teacherName: slot.teacher?.name,
      isCompleted: !!records && records.length > 0,
      totalStudents: records?.length || 0,
      absentCount: records?.filter((r) => r.status === "absent").length || 0,
    };
  });

  return NextResponse.json({
    range,
    period: { startDate, endDate },
    date: today,
    totalCourses,
    completedCourses,
    pendingCourses,
    cancelledCourses: cancelledCount,
    absentCount,
    completionRate,
    courses,
    absentToday,
    absentList,
    weeklyAbsent,
    w1Value,
    pendingSlots: pendingSlots.slice(0, 20),
    absenceDetail,
    reviewSummary,
  });
}
