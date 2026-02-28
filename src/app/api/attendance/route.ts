import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getBejingDayOfWeek,
  getBeijingTimeString,
  getBeijingDateString,
  getCourseStatus,
  getCurrentWeekRange,
} from "@/lib/attendance/time-matcher";
import { getCurrentWeek } from "@/lib/school-calendar";

/**
 * GET /api/attendance?date=YYYY-MM-DD
 * 获取当前教师今日的室外课列表（含考勤状态）
 * ADMIN / GRADE_LEADER 可附加 ?teacherId=xxx 查看其他教师
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { role } = session.user;
  const dateParam = req.nextUrl.searchParams.get("date");
  const teacherIdParam = req.nextUrl.searchParams.get("teacherId");

  const today = dateParam || getBeijingDateString();
  const dayOfWeek = dateParam
    ? new Date(dateParam + "T00:00:00+08:00").getDay() || 7
    : getBejingDayOfWeek();

  // 确定要查询的教师 ID
  let targetTeacherId = session.user.id;
  if (
    teacherIdParam &&
    (role === "ADMIN" || role === "GRADE_LEADER")
  ) {
    targetTeacherId = teacherIdParam;
  }

  // 1. 查询该教师的固定室外课（当天星期几）
  const mySlots = await prisma.courseSlot.findMany({
    where: {
      teacherId: targetTeacherId,
      dayOfWeek,
      isOutdoor: true,
      isActive: true,
    },
    include: {
      class: { select: { id: true, name: true, grade: true } },
      period: true,
    },
    orderBy: { period: { periodNo: "asc" } },
  });

  // 2. 查询当天的调课记录（排除已取消或已安排代课的）
  const slotIds = mySlots.map((s) => s.id);
  const swaps = await prisma.courseSwap.findMany({
    where: {
      date: today,
      courseSlotId: { in: slotIds },
    },
  });
  const cancelledOrSubstituted = new Set(
    swaps.map((s) => s.courseSlotId)
  );

  // 3. 查询指派给我的代课
  const mySubstitutions = await prisma.courseSwap.findMany({
    where: {
      date: today,
      substituteId: targetTeacherId,
      type: "substitute",
    },
    include: {
      courseSlot: {
        include: {
          class: { select: { id: true, name: true, grade: true } },
          period: true,
        },
      },
    },
  });

  // 4. 合并课程列表
  const activeMyCourses = mySlots.filter(
    (s) => !cancelledOrSubstituted.has(s.id)
  );
  const substituteCourses = mySubstitutions.map((sw) => ({
    ...sw.courseSlot,
    isSubstitute: true,
  }));

  const allCourses = [
    ...activeMyCourses.map((s) => ({ ...s, isSubstitute: false })),
    ...substituteCourses,
  ].sort((a, b) => a.period.periodNo - b.period.periodNo);

  // 5. 查询已有的考勤记录数
  const courseSlotIds = allCourses.map((c) => c.id);
  const attendanceCounts = await prisma.attendanceRecord.groupBy({
    by: ["courseSlotId"],
    where: {
      date: today,
      courseSlotId: { in: courseSlotIds },
    },
    _count: true,
  });
  const attendanceMap = new Map(
    attendanceCounts.map((a) => [a.courseSlotId, a._count])
  );

  // 6. 本周 W-1 缺勤汇总（按班级）—— 学期内使用校历周
  const sw = getCurrentWeek();
  const weekRange = sw
    ? { monday: sw.startDate, friday: sw.endDate }
    : getCurrentWeekRange();
  const classIds = [
    ...new Set(allCourses.map((c) => c.class.id)),
  ];
  const weeklyAbsences = await prisma.attendanceRecord.groupBy({
    by: ["classId"],
    where: {
      date: { gte: weekRange.monday, lte: weekRange.friday },
      status: "absent",
      courseSlot: { isOutdoor: true },
      classId: { in: classIds },
    },
    _count: true,
  });
  const absenceMap = new Map(
    weeklyAbsences.map((a) => [a.classId, a._count])
  );

  // 7. 获取已取消的课程信息
  const cancelledSlots = mySlots.filter((s) =>
    cancelledOrSubstituted.has(s.id)
  );
  const cancelledSwapDetails = swaps.filter(
    (s) => s.type === "cancel"
  );

  const currentTime = getBeijingTimeString();

  const courses = allCourses.map((c) => {
    const hasAttendance = (attendanceMap.get(c.id) || 0) > 0;
    const status = getCourseStatus(
      currentTime,
      c.period.startTime,
      c.period.endTime,
      hasAttendance
    );

    return {
      slotId: c.id,
      classId: c.class.id,
      className: c.class.name,
      classGrade: c.class.grade,
      subject: c.subject,
      periodNo: c.period.periodNo,
      periodLabel: c.period.label,
      startTime: c.period.startTime,
      endTime: c.period.endTime,
      isSubstitute: c.isSubstitute,
      status,
      attendanceCount: attendanceMap.get(c.id) || 0,
      weeklyAbsences: absenceMap.get(c.class.id) || 0,
    };
  });

  // 取消的课程也返回（灰色显示）
  const cancelled = cancelledSlots.map((c) => {
    const swap = cancelledSwapDetails.find(
      (s) => s.courseSlotId === c.id
    );
    return {
      slotId: c.id,
      classId: c.class.id,
      className: c.class.name,
      subject: c.subject,
      periodNo: c.period.periodNo,
      startTime: c.period.startTime,
      endTime: c.period.endTime,
      status: "cancelled" as const,
      reason: swap?.reason,
    };
  });

  return NextResponse.json({
    date: today,
    dayOfWeek,
    currentTime,
    courses,
    cancelled,
  });
}

/**
 * POST /api/attendance
 * 提交考勤记录
 * Body: {
 *   courseSlotId: string,
 *   date: string,
 *   records: Array<{ studentId: string, status: "present"|"absent"|"excused"|"late", comment?: string }>
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { role } = session.user;
  if (
    !["ADMIN", "GRADE_LEADER", "SUBJECT_TEACHER"].includes(role)
  ) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { courseSlotId, date, records } = body as {
      courseSlotId: string;
      date: string;
      records: Array<{
        studentId: string;
        status: string;
        comment?: string;
      }>;
    };

    if (!courseSlotId || !date || !records?.length) {
      return NextResponse.json(
        { error: "参数不完整" },
        { status: 400 }
      );
    }

    // 验证课程存在
    const slot = await prisma.courseSlot.findUnique({
      where: { id: courseSlotId },
      include: { class: true },
    });
    if (!slot) {
      return NextResponse.json(
        { error: "课程不存在" },
        { status: 404 }
      );
    }

    // SUBJECT_TEACHER 只能操作自己的课（含代课）
    if (role === "SUBJECT_TEACHER") {
      const isMySlot = slot.teacherId === session.user.id;
      const isMySubstitution = await prisma.courseSwap.findFirst({
        where: {
          courseSlotId,
          date,
          substituteId: session.user.id,
          type: "substitute",
        },
      });
      if (!isMySlot && !isMySubstitution) {
        return NextResponse.json(
          { error: "无权操作此课程" },
          { status: 403 }
        );
      }
    }

    // 批量 upsert 考勤记录
    await prisma.$transaction(
      records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: {
            studentId_courseSlotId_date: {
              studentId: r.studentId,
              courseSlotId,
              date,
            },
          },
          create: {
            studentId: r.studentId,
            courseSlotId,
            classId: slot.classId,
            date,
            status: r.status,
            comment: r.comment ?? null,
            recordedById: session.user!.id,
          },
          update: {
            status: r.status,
            comment: r.comment ?? null,
            recordedById: session.user!.id,
          },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[attendance] POST Error:", error);
    return NextResponse.json(
      { error: "保存失败" },
      { status: 500 }
    );
  }
}
