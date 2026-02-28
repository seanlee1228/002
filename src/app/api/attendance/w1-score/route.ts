import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentWeek, getWeekByDate, CURRENT_CALENDAR } from "@/lib/school-calendar";
import { getCurrentWeekRange } from "@/lib/attendance/time-matcher";
import { fetchAttendanceW1 } from "@/lib/fetch-attendance";

/**
 * GET /api/attendance/w1-score?classId=xxx&week=YYYY-MM-DD
 * 通过 attendance-system 外部 API 获取 W-1 自动计算值
 * week 参数为该周内任意日期（优先匹配校历周）
 * 不传 week 则使用当前校历周（学期内）或自然周
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "缺少 classId" }, { status: 400 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");

  let monday: string;
  let friday: string;
  let weekLabel: string | undefined;
  let weekNumber: number | undefined;

  if (weekParam) {
    const today = weekParam;
    const inSemester = today >= CURRENT_CALENDAR.startDate && today <= CURRENT_CALENDAR.endDate;
    if (inSemester) {
      const sw = getWeekByDate(today);
      if (sw) {
        monday = sw.startDate;
        friday = sw.endDate;
        weekLabel = sw.label;
        weekNumber = sw.week;
      } else {
        const fri = new Date(weekParam + "T00:00:00+08:00");
        const mon = new Date(fri);
        mon.setDate(fri.getDate() - 4);
        const fmt = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${dd}`;
        };
        monday = fmt(mon);
        friday = weekParam;
      }
    } else {
      const fri = new Date(weekParam + "T00:00:00+08:00");
      const mon = new Date(fri);
      mon.setDate(fri.getDate() - 4);
      const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      };
      monday = fmt(mon);
      friday = weekParam;
    }
  } else {
    const sw = getCurrentWeek();
    if (sw) {
      monday = sw.startDate;
      friday = sw.endDate;
      weekLabel = sw.label;
      weekNumber = sw.week;
    } else {
      const range = getCurrentWeekRange();
      monday = range.monday;
      friday = range.friday;
    }
  }

  const result = await fetchAttendanceW1(classId, monday, friday);

  return NextResponse.json({
    classId,
    weekMonday: monday,
    weekFriday: friday,
    weekLabel: result.weekLabel ?? weekLabel,
    weekNumber: result.weekNumber ?? weekNumber,
    hasData: result.hasData,
    absentCount: result.absentCount,
    totalRecords: result.totalRecords,
    optionValue: result.optionValue,
  });
}
