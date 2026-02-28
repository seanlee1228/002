/**
 * 根据当前时间匹配节次和课程
 */

/** 获取北京时间的星期几（1=周一 ... 7=周日） */
export function getBejingDayOfWeek(): number {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );
  const day = beijing.getDay();
  return day === 0 ? 7 : day;
}

/** 获取北京时间的当前时间字符串 "HH:MM" */
export function getBeijingTimeString(): string {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );
  const hours = String(beijing.getHours()).padStart(2, "0");
  const minutes = String(beijing.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** 获取北京时间的日期字符串 "YYYY-MM-DD" */
export function getBeijingDateString(): string {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );
  const y = beijing.getFullYear();
  const m = String(beijing.getMonth() + 1).padStart(2, "0");
  const d = String(beijing.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 比较两个时间字符串（"HH:MM"），返回 -1, 0, 1 */
export function compareTime(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const aMin = ah * 60 + am;
  const bMin = bh * 60 + bm;
  if (aMin < bMin) return -1;
  if (aMin > bMin) return 1;
  return 0;
}

/** 判断当前时间是否在某节课的时间范围内（含前后 5 分钟缓冲） */
export function isInPeriod(
  currentTime: string,
  startTime: string,
  endTime: string,
  bufferMinutes: number = 5
): boolean {
  const [ch, cm] = currentTime.split(":").map(Number);
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const cur = ch * 60 + cm;
  const start = sh * 60 + sm - bufferMinutes;
  const end = eh * 60 + em + bufferMinutes;

  return cur >= start && cur <= end;
}

/**
 * 判断课程状态：
 * - "in_progress": 当前正在进行
 * - "upcoming": 今天还没开始
 * - "completed": 已过去（或已录入考勤）
 */
export function getCourseStatus(
  currentTime: string,
  startTime: string,
  endTime: string,
  hasAttendance: boolean
): "in_progress" | "upcoming" | "completed" {
  if (hasAttendance) return "completed";
  if (isInPeriod(currentTime, startTime, endTime)) return "in_progress";
  if (compareTime(currentTime, startTime) < 0) return "upcoming";
  return "completed";
}

/**
 * 获取本周的日期范围 [周一, 周五]
 * 返回 { monday: "YYYY-MM-DD", friday: "YYYY-MM-DD" }
 */
export function getCurrentWeekRange(): {
  monday: string;
  friday: string;
} {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );
  const day = beijing.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 周日时回退6天到周一

  const monday = new Date(beijing);
  monday.setDate(beijing.getDate() + diff);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  return { monday: fmt(monday), friday: fmt(friday) };
}
