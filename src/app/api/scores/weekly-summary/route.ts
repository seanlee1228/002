import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getChinaToday } from "@/lib/deadline";
import { CURRENT_CALENDAR, getCurrentWeek } from "@/lib/school-calendar";
import { format, startOfWeek, subWeeks } from "date-fns";

// 星期标签
const DAY_LABELS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayLabel(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T12:00:00+08:00");
  const dayIdx = d.getDay();
  return locale === "zh" ? DAY_LABELS_ZH[dayIdx] : DAY_LABELS_EN[dayIdx];
}

/**
 * 周汇总 API — 三种模式
 *
 * 模式 A: GET /api/scores/weekly-summary          → 周次列表
 * 模式 B: GET /api/scores/weekly-summary?week=s3   → 第3校历周所有班级概览
 * 模式 C: GET /api/scores/weekly-summary?week=s3&classId=xxx → 该班日x项矩阵
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "GRADE_LEADER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  const classIdParam = searchParams.get("classId");

  const today = getChinaToday();
  const inSchoolSemester = today >= CURRENT_CALENDAR.startDate && today <= CURRENT_CALENDAR.endDate;

  // 权限范围：GRADE_LEADER 限定到所管理的年级
  const managedGrade = session.user.managedGrade;
  const gradeFilter = role === "GRADE_LEADER" && managedGrade != null ? { grade: managedGrade } : {};

  try {
    // ===== 模式 A: 周次列表 =====
    if (!weekParam) {
      const currentSchoolWeek = inSchoolSemester ? getCurrentWeek() : undefined;

      if (inSchoolSemester) {
        // 校历周模式
        const weeks = CURRENT_CALENDAR.weeks
          .filter((w) => w.startDate <= today) // 只显示已到达的周
          .map((w) => ({
            key: `s${w.week}`,
            label: w.label,
            startDate: w.startDate,
            endDate: w.endDate,
            isCurrent: currentSchoolWeek?.week === w.week,
            note: w.note ?? null,
          }));
        return NextResponse.json({ weeks, weekMode: "school" });
      } else {
        // 自然周模式：生成最近 8 周
        const weeks = [];
        for (let i = 0; i < 8; i++) {
          const refDate = subWeeks(new Date(today + "T12:00:00+08:00"), i);
          const weekStart = format(startOfWeek(refDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
          const weekEnd = format(new Date(new Date(weekStart + "T12:00:00+08:00").getTime() + 4 * 86400000), "yyyy-MM-dd");
          const monthNum = parseInt(weekStart.slice(5, 7));
          const weekOfMonth = Math.ceil(parseInt(weekStart.slice(8, 10)) / 7);
          weeks.unshift({
            key: `n${weekStart}`,
            label: `${monthNum}月第${weekOfMonth}周`,
            startDate: weekStart,
            endDate: weekEnd,
            isCurrent: i === 0,
            note: null,
          });
        }
        return NextResponse.json({ weeks, weekMode: "natural" });
      }
    }

    // ===== 解析周参数 → startDate / endDate =====
    let startDate: string;
    let endDate: string;
    let weekLabel: string;
    let schoolDays: string[] | null = null;

    if (weekParam.startsWith("s")) {
      // 校历周
      const weekNum = parseInt(weekParam.slice(1));
      const sw = CURRENT_CALENDAR.weeks.find((w) => w.week === weekNum);
      if (!sw) return NextResponse.json({ error: "Invalid week" }, { status: 400 });
      startDate = sw.startDate;
      endDate = sw.endDate;
      weekLabel = sw.label;
      schoolDays = sw.schoolDays;
    } else if (weekParam.startsWith("n")) {
      // 自然周
      startDate = weekParam.slice(1);
      endDate = format(new Date(new Date(startDate + "T12:00:00+08:00").getTime() + 4 * 86400000), "yyyy-MM-dd");
      const monthNum = parseInt(startDate.slice(5, 7));
      const weekOfMonth = Math.ceil(parseInt(startDate.slice(8, 10)) / 7);
      weekLabel = `${monthNum}月第${weekOfMonth}周`;
    } else {
      return NextResponse.json({ error: "Invalid week format" }, { status: 400 });
    }

    // 查询范围内的班级
    const scopedClasses = await prisma.class.findMany({
      where: gradeFilter,
      select: { id: true, name: true, grade: true, section: true },
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    });
    const scopedClassIds = scopedClasses.map((c) => c.id);

    // ===== 模式 C: 班级日x项矩阵 =====
    if (classIdParam) {
      const cls = scopedClasses.find((c) => c.id === classIdParam);
      if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

      // 查询该班该周的所有日评记录
      const records = await prisma.checkRecord.findMany({
        where: {
          classId: classIdParam,
          date: { gte: startDate, lte: endDate },
          checkItem: { module: "DAILY" },
        },
        include: {
          checkItem: { select: { id: true, code: true, title: true } },
        },
        orderBy: [{ date: "asc" }, { checkItem: { sortOrder: "asc" } }],
      });

      // W-5 周等级
      const w5 = await prisma.checkRecord.findFirst({
        where: {
          classId: classIdParam,
          date: { gte: startDate, lte: endDate },
          checkItem: { code: "W-5" },
        },
      });

      // 按日期分组
      const dayMap = new Map<string, Array<{
        checkItemId: string;
        code: string | null;
        title: string;
        passed: boolean | null;
        severity: string | null;
        comment: string | null;
        scoredByName: string | null;
        scoredByRole: string | null;
        scoredAt: string | null;
        reviewAction: string | null;
        reviewedByName: string | null;
        reviewedByRole: string | null;
        reviewedAt: string | null;
        originalPassed: boolean | null;
      }>>();

      // 初始化日期列表
      const dates = schoolDays ?? [];
      if (dates.length === 0) {
        // 自然周：取周一~周五
        for (let i = 0; i < 5; i++) {
          const d = format(new Date(new Date(startDate + "T12:00:00+08:00").getTime() + i * 86400000), "yyyy-MM-dd");
          dates.push(d);
        }
      }
      for (const d of dates) {
        dayMap.set(d, []);
      }

      for (const r of records) {
        const list = dayMap.get(r.date);
        if (list) {
          list.push({
            checkItemId: r.checkItem.id,
            code: r.checkItem.code,
            title: r.checkItem.title,
            passed: r.passed,
            severity: r.severity,
            comment: r.comment,
            scoredByName: r.scoredByName,
            scoredByRole: r.scoredByRole,
            scoredAt: r.createdAt?.toISOString() ?? null,
            reviewAction: r.reviewAction,
            reviewedByName: r.reviewedByName,
            reviewedByRole: r.reviewedByRole,
            reviewedAt: r.reviewedAt?.toISOString() ?? null,
            originalPassed: r.originalPassed,
          });
        }
      }

      const totalItems = records.length;
      const passedItems = records.filter((r) => r.passed === true).length;
      const passRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

      const days = dates.map((date) => ({
        date,
        dayLabel: getDayLabel(date, "zh"),
        items: dayMap.get(date) ?? [],
      }));

      return NextResponse.json({
        weekKey: weekParam,
        weekLabel,
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        passRate,
        latestGrade: w5?.optionValue ?? null,
        days,
      });
    }

    // ===== 模式 B: 周概览（所有班级） =====
    const allRecords = await prisma.checkRecord.findMany({
      where: {
        classId: { in: scopedClassIds },
        date: { gte: startDate, lte: endDate },
        checkItem: { module: "DAILY" },
      },
      select: { classId: true, passed: true },
    });

    // W-5 等级
    const w5Records = await prisma.checkRecord.findMany({
      where: {
        classId: { in: scopedClassIds },
        date: { gte: startDate, lte: endDate },
        checkItem: { code: "W-5" },
      },
      select: { classId: true, optionValue: true },
    });
    const w5Map = new Map(w5Records.map((r) => [r.classId, r.optionValue]));

    // 按班级聚合
    const classStats = new Map<string, { total: number; passed: number }>();
    for (const r of allRecords) {
      if (!classStats.has(r.classId)) classStats.set(r.classId, { total: 0, passed: 0 });
      const s = classStats.get(r.classId)!;
      s.total++;
      if (r.passed === true) s.passed++;
    }

    const classes = scopedClasses.map((cls) => {
      const s = classStats.get(cls.id);
      const total = s?.total ?? 0;
      const passed = s?.passed ?? 0;
      return {
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
        totalItems: total,
        passedItems: passed,
        latestGrade: w5Map.get(cls.id) ?? null,
      };
    });

    return NextResponse.json({
      weekKey: weekParam,
      weekLabel,
      startDate,
      endDate,
      classes,
    });
  } catch (error) {
    console.error("Weekly summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
