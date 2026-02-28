/**
 * 校历数据模块
 * 存放当前学期的校历结构化数据，换学期时只需更新 CURRENT_CALENDAR
 */

export interface SchoolWeek {
  week: number;           // 校历周次 1~19
  label: string;          // "第1周"
  startDate: string;      // "2026-03-02"
  endDate: string;        // "2026-03-06"
  schoolDays: string[];   // 实际上课日列表
  note?: string;          // 备注（如"清明节短周"）
}

export interface SchoolCalendar {
  semester: string;       // "2025-2026-2"
  semesterName: string;   // "2025-2026学年第二学期"
  startDate: string;      // "2026-03-02"
  endDate: string;        // "2026-07-10"
  weeks: SchoolWeek[];
  holidays: { name: string; dates: string[] }[];
}

// 当前学期校历数据 —— 2025-2026 第二学期
export const CURRENT_CALENDAR: SchoolCalendar = {
  semester: "2025-2026-2",
  semesterName: "2025-2026学年第二学期",
  startDate: "2026-03-02",
  endDate: "2026-07-10",
  weeks: [
    {
      week: 1, label: "第1周",
      startDate: "2026-03-02", endDate: "2026-03-06",
      schoolDays: ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"],
    },
    {
      week: 2, label: "第2周",
      startDate: "2026-03-09", endDate: "2026-03-13",
      schoolDays: ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"],
    },
    {
      week: 3, label: "第3周",
      startDate: "2026-03-16", endDate: "2026-03-20",
      schoolDays: ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"],
    },
    {
      week: 4, label: "第4周",
      startDate: "2026-03-23", endDate: "2026-03-27",
      schoolDays: ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27"],
    },
    {
      week: 5, label: "第5周",
      startDate: "2026-03-30", endDate: "2026-04-03",
      schoolDays: ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03"],
    },
    {
      week: 6, label: "第6周",
      startDate: "2026-04-07", endDate: "2026-04-10",
      schoolDays: ["2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10"],
      note: "清明节短周",
    },
    {
      week: 7, label: "第7周",
      startDate: "2026-04-13", endDate: "2026-04-17",
      schoolDays: ["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"],
    },
    {
      week: 8, label: "第8周",
      startDate: "2026-04-20", endDate: "2026-04-24",
      schoolDays: ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"],
    },
    {
      week: 9, label: "第9周",
      startDate: "2026-04-27", endDate: "2026-04-30",
      schoolDays: ["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"],
      note: "劳动节短周",
    },
    {
      week: 10, label: "第10周",
      startDate: "2026-05-06", endDate: "2026-05-09",
      schoolDays: ["2026-05-06", "2026-05-07", "2026-05-08", "2026-05-09"],
      note: "含周六补班",
    },
    {
      week: 11, label: "第11周",
      startDate: "2026-05-11", endDate: "2026-05-15",
      schoolDays: ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15"],
    },
    {
      week: 12, label: "第12周",
      startDate: "2026-05-18", endDate: "2026-05-22",
      schoolDays: ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21", "2026-05-22"],
    },
    {
      week: 13, label: "第13周",
      startDate: "2026-05-25", endDate: "2026-05-29",
      schoolDays: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"],
    },
    {
      week: 14, label: "第14周",
      startDate: "2026-06-01", endDate: "2026-06-05",
      schoolDays: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
    },
    {
      week: 15, label: "第15周",
      startDate: "2026-06-08", endDate: "2026-06-12",
      schoolDays: ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"],
    },
    {
      week: 16, label: "第16周",
      startDate: "2026-06-15", endDate: "2026-06-18",
      schoolDays: ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"],
      note: "端午节短周",
    },
    {
      week: 17, label: "第17周",
      startDate: "2026-06-22", endDate: "2026-06-26",
      schoolDays: ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"],
    },
    {
      week: 18, label: "第18周",
      startDate: "2026-06-29", endDate: "2026-07-03",
      schoolDays: ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"],
    },
    {
      week: 19, label: "第19周",
      startDate: "2026-07-06", endDate: "2026-07-10",
      schoolDays: ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"],
    },
  ],
  holidays: [
    { name: "清明节", dates: ["2026-04-04", "2026-04-05", "2026-04-06"] },
    { name: "劳动节", dates: ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"] },
    { name: "端午节", dates: ["2026-06-19", "2026-06-20", "2026-06-21"] },
  ],
};

// ========== 工具函数 ==========

/** 根据日期查找对应的校历周 */
export function getWeekByDate(date: string): SchoolWeek | undefined {
  return CURRENT_CALENDAR.weeks.find(
    (w) => date >= w.startDate && date <= w.endDate
  );
}

/** 获取校历周范围内的所有上课日 */
export function getSchoolDays(fromWeek: number, toWeek: number): string[] {
  return CURRENT_CALENDAR.weeks
    .filter((w) => w.week >= fromWeek && w.week <= toWeek)
    .flatMap((w) => w.schoolDays);
}

/** 获取当前校历周（基于今天的日期，使用中国时区） */
export function getCurrentWeek(): SchoolWeek | undefined {
  // 使用中国时区确保日期正确
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  // 先精确匹配
  const exact = getWeekByDate(today);
  if (exact) return exact;

  // 如果在周末/假期中间，查找最近的过去周
  const sorted = CURRENT_CALENDAR.weeks.filter((w) => w.endDate <= today);
  return sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
}

/** 判断日期是否为学期内的上课日 */
export function isSchoolDay(date: string): boolean {
  return CURRENT_CALENDAR.weeks.some((w) => w.schoolDays.includes(date));
}

/** 获取某个校历周对应的假期名称（如有） */
export function getHolidayNote(week: SchoolWeek): string | undefined {
  return week.note;
}
