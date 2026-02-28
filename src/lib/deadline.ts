/**
 * 检查数据录入时效性控制 + 中国时区日期工具
 *
 * 重要：本系统为中国学校使用，所有日期必须基于 Asia/Shanghai（UTC+8）
 * 不可使用 new Date().toISOString().split("T")[0]，该方法返回 UTC 日期，
 * 在北京时间 0:00-8:00 之间会比中国日期早一天。
 *
 * 规则：
 * - 日评：当天 00:00 ~ 23:59（北京时间）可录入/修改，次日起锁定
 * - 周评（本周）：本周一 ~ 下周一 12:00 可提交/修改
 * - 周评（上周补录）：本周一 ~ 本周一 12:00 可补录
 * - 管理员：任意时间可操作，但标记 isOverride
 */

const CHINA_TZ = "Asia/Shanghai";

// ─── 时区工具 ─────────────────────────────────────────

/**
 * 获取中国标准时间（UTC+8）的日期字符串
 * @param date 可选，默认为当前时间
 * @returns "YYYY-MM-DD" 格式的中国日期
 */
export function getChinaToday(date?: Date): string {
  const d = date ?? new Date();
  // en-CA locale 输出格式恰好是 YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: CHINA_TZ });
}

/**
 * 获取中国标准时间的当前 Date 对象（用于时间比较）
 * 注意：返回的 Date 内部仍是 UTC，但通过偏移模拟了中国时间
 */
export function getChinaNow(): Date {
  // 用 Intl 获取精确的中国时间各部分
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

/**
 * 将 Date 对象转为中国时区的 YYYY-MM-DD 字符串
 * 用于替代 date.toISOString().split("T")[0]
 */
export function toChinaDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: CHINA_TZ });
}

// ─── 时效判断 ─────────────────────────────────────────

/**
 * 日评截止判断：recordDate 与当天（北京时间）是否为同一天
 */
export function isDailyScoringOpen(recordDate: string): boolean {
  const today = getChinaToday();
  return recordDate === today;
}

/**
 * 周评截止判断：weekEndDate（周五）+ 3 天（下周一）12:00（北京时间）前可提交
 * @param weekFriday 该周的周五日期，格式 "YYYY-MM-DD"
 * @returns { open, deadline } deadline 为截止时间的 Date 对象
 */
export function isWeeklyReviewOpen(weekFriday: string): { open: boolean; deadline: Date } {
  // 使用明确的 UTC+8 时区解析，避免服务器时区不同导致日期偏移
  const friday = new Date(weekFriday + "T00:00:00+08:00");
  // 下周一 = 周五 + 3 天
  const nextMondayMs = friday.getTime() + 3 * 24 * 60 * 60 * 1000;
  // 截止时间：下周一 12:00 北京时间 = 04:00 UTC
  const nextMondayDateStr = toChinaDateString(new Date(nextMondayMs));
  const deadlineUTC = new Date(`${nextMondayDateStr}T04:00:00Z`);

  const now = new Date();
  return { open: now < deadlineUTC, deadline: deadlineUTC };
}

/**
 * 格式化截止时间为可读字符串（基于中国时区）
 */
export function formatDeadline(deadline: Date, locale: "zh" | "en" = "zh"): string {
  // 使用中国时区获取正确的日期部分
  const chinaDate = new Date(deadline.toLocaleString("en-US", { timeZone: CHINA_TZ }));
  const month = chinaDate.getMonth() + 1;
  const day = chinaDate.getDate();
  const weekDayNames = locale === "zh"
    ? ["日", "一", "二", "三", "四", "五", "六"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDay = weekDayNames[chinaDate.getDay()];

  if (locale === "zh") {
    return `${month}月${day}日 周${weekDay} 12:00`;
  }
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[chinaDate.getMonth()]} ${day} (${weekDay}) 12:00`;
}

export interface DeadlineResult {
  allowed: boolean;
  isOverride: boolean;
  message?: string;
  deadline?: Date;
  deadlineFormatted?: string;
}

/**
 * 统一截止时间检查入口
 * @param type "daily" | "weekly"
 * @param date 日评为当天日期，周评为该周周五日期
 * @param role 用户角色
 * @param locale 语言
 */
export function checkDeadline(
  type: "daily" | "weekly",
  date: string,
  role: string,
  locale: "zh" | "en" = "zh"
): DeadlineResult {
  if (type === "daily") {
    const open = isDailyScoringOpen(date);
    if (open) {
      return { allowed: true, isOverride: false };
    }
    // 已过截止时间
    if (role === "ADMIN") {
      return {
        allowed: true,
        isOverride: true,
        message: locale === "zh"
          ? "日评录入已超过截止时间，管理员超期修改"
          : "Daily scoring deadline has passed, admin override",
      };
    }
    return {
      allowed: false,
      isOverride: false,
      message: locale === "zh"
        ? "日评录入已截止，仅可录入当天数据"
        : "Daily scoring deadline has passed, only today's data can be entered",
    };
  }

  // weekly
  const { open, deadline } = isWeeklyReviewOpen(date);
  const deadlineFormatted = formatDeadline(deadline, locale);

  if (open) {
    return { allowed: true, isOverride: false, deadline, deadlineFormatted };
  }
  // 已过截止时间
  if (role === "ADMIN") {
    return {
      allowed: true,
      isOverride: true,
      deadline,
      deadlineFormatted,
      message: locale === "zh"
        ? `周评录入已超过截止时间（${deadlineFormatted}），管理员超期修改`
        : `Weekly review deadline has passed (${deadlineFormatted}), admin override`,
    };
  }
  return {
    allowed: false,
    isOverride: false,
    deadline,
    deadlineFormatted,
    message: locale === "zh"
      ? `周评录入已截止（截止时间：${deadlineFormatted}）`
      : `Weekly review deadline has passed (deadline: ${deadlineFormatted})`,
  };
}
