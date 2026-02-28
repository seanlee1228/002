import * as XLSX from "xlsx";

// ========== 类型定义 ==========

export interface ParsedPeriod {
  periodNo: number;
  startTime: string;
  endTime: string;
  label?: string;
}

export interface ParsedCourseSlot {
  className: string; // "一(1)班" 等
  dayOfWeek: number; // 1-5
  periodNo: number;
  subject: string;
}

export interface ParsedTeacherAssignment {
  className: string;
  subject: string;
  teacherName: string;
}

export interface ParseError {
  row?: number;
  sheet?: string;
  message: string;
}

export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
}

// ========== 作息时间表解析 ==========

export function parsePeriodSchedule(
  buffer: ArrayBuffer
): ParseResult<ParsedPeriod> {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const data: ParsedPeriod[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel 行号（跳过表头）

    // 尝试多种可能的列名
    const periodRaw =
      row["节次"] ?? row["课节"] ?? row["Period"] ?? row["period"];
    const startRaw =
      row["开始时间"] ??
      row["上课时间"] ??
      row["Start"] ??
      row["start"] ??
      row["startTime"];
    const endRaw =
      row["结束时间"] ??
      row["下课时间"] ??
      row["End"] ??
      row["end"] ??
      row["endTime"];

    if (!periodRaw && !startRaw && !endRaw) continue; // 跳过空行

    const periodNo = extractPeriodNo(String(periodRaw));
    const startTime = normalizeTime(String(startRaw));
    const endTime = normalizeTime(String(endRaw));

    if (!periodNo) {
      errors.push({ row: rowNum, message: `无法识别节次: "${periodRaw}"` });
      continue;
    }
    if (!startTime) {
      errors.push({
        row: rowNum,
        message: `无法识别开始时间: "${startRaw}"`,
      });
      continue;
    }
    if (!endTime) {
      errors.push({
        row: rowNum,
        message: `无法识别结束时间: "${endRaw}"`,
      });
      continue;
    }

    data.push({
      periodNo,
      startTime,
      endTime,
      label: String(periodRaw).trim(),
    });
  }

  return { data, errors };
}

// ========== 课程表解析 ==========

const DAY_MAP: Record<string, number> = {
  周一: 1,
  星期一: 1,
  Monday: 1,
  Mon: 1,
  一: 1,
  周二: 2,
  星期二: 2,
  Tuesday: 2,
  Tue: 2,
  二: 2,
  周三: 3,
  星期三: 3,
  Wednesday: 3,
  Wed: 3,
  三: 3,
  周四: 4,
  星期四: 4,
  Thursday: 4,
  Thu: 4,
  四: 4,
  周五: 5,
  星期五: 5,
  Friday: 5,
  Fri: 5,
  五: 5,
};

export function parseTimetable(
  buffer: ArrayBuffer
): ParseResult<ParsedCourseSlot> {
  const wb = XLSX.read(buffer, { type: "array" });
  const data: ParsedCourseSlot[] = [];
  const errors: ParseError[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
    });

    if (rows.length === 0) continue;

    // 检测格式：列名中是否包含星期
    const headers = Object.keys(rows[0]);
    const dayColumns: { header: string; dayOfWeek: number }[] = [];

    for (const h of headers) {
      const trimmed = h.trim();
      if (DAY_MAP[trimmed]) {
        dayColumns.push({ header: h, dayOfWeek: DAY_MAP[trimmed] });
      }
    }

    if (dayColumns.length > 0) {
      // 格式A：横向课程表（节次为行，星期为列）
      // 每个 sheet 对应一个班级
      const className = sheetName.trim();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const periodRaw =
          row["节次"] ?? row["课节"] ?? row["Period"] ?? row[""];
        const periodNo = extractPeriodNo(String(periodRaw));

        if (!periodNo) {
          if (String(periodRaw).trim()) {
            errors.push({
              row: rowNum,
              sheet: sheetName,
              message: `无法识别节次: "${periodRaw}"`,
            });
          }
          continue;
        }

        for (const dc of dayColumns) {
          const subject = String(row[dc.header]).trim();
          if (!subject) continue;

          data.push({
            className,
            dayOfWeek: dc.dayOfWeek,
            periodNo,
            subject,
          });
        }
      }
    } else {
      // 格式B：纵向列表（班级, 星期, 节次, 科目）
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const classRaw = row["班级"] ?? row["Class"] ?? row["class"];
        const dayRaw = row["星期"] ?? row["Day"] ?? row["day"];
        const periodRaw = row["节次"] ?? row["课节"] ?? row["Period"];
        const subjectRaw = row["科目"] ?? row["Subject"] ?? row["subject"];

        if (!classRaw && !dayRaw && !periodRaw && !subjectRaw) continue;

        const cn = String(classRaw).trim();
        const dayOfWeek = DAY_MAP[String(dayRaw).trim()];
        const periodNo = extractPeriodNo(String(periodRaw));
        const subject = String(subjectRaw).trim();

        if (!cn || !dayOfWeek || !periodNo || !subject) {
          errors.push({
            row: rowNum,
            sheet: sheetName,
            message: `数据不完整: 班级="${cn}", 星期="${dayRaw}", 节次="${periodRaw}", 科目="${subject}"`,
          });
          continue;
        }

        data.push({ className: cn, dayOfWeek, periodNo, subject });
      }
    }
  }

  return { data, errors };
}

// ========== 任课表解析 ==========

export function parseTeacherAssignment(
  buffer: ArrayBuffer
): ParseResult<ParsedTeacherAssignment> {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const data: ParsedTeacherAssignment[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const classRaw = row["班级"] ?? row["Class"] ?? row["class"];
    const subjectRaw =
      row["科目"] ?? row["学科"] ?? row["Subject"] ?? row["subject"];
    const teacherRaw =
      row["任课教师"] ??
      row["教师"] ??
      row["老师"] ??
      row["Teacher"] ??
      row["teacher"];

    if (!classRaw && !subjectRaw && !teacherRaw) continue;

    const cn = String(classRaw).trim();
    const subject = String(subjectRaw).trim();
    const teacherName = String(teacherRaw).trim();

    if (!cn || !subject || !teacherName) {
      errors.push({
        row: rowNum,
        message: `数据不完整: 班级="${cn}", 科目="${subject}", 教师="${teacherName}"`,
      });
      continue;
    }

    data.push({ className: cn, subject, teacherName });
  }

  return { data, errors };
}

// ========== 工具函数 ==========

/** 从 "第1节"、"1"、"第一节" 等提取节次数字 */
function extractPeriodNo(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 纯数字
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) return num;

  // "第X节" 格式
  const match = trimmed.match(/第?(\d+)节?/);
  if (match) return parseInt(match[1], 10);

  // 中文数字
  const cnNums: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const cnMatch = trimmed.match(/第?([一二三四五六七八九十])节?/);
  if (cnMatch && cnNums[cnMatch[1]]) return cnNums[cnMatch[1]];

  return null;
}

/** 将各种时间格式统一为 "HH:MM" */
function normalizeTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "8:00" / "08:00" / "8:00:00"
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, "0")}:${colonMatch[2]}`;
  }

  // "0800" / "800"
  const numMatch = trimmed.match(/^(\d{1,2})(\d{2})$/);
  if (numMatch) {
    return `${numMatch[1].padStart(2, "0")}:${numMatch[2]}`;
  }

  // Excel 序列号（0-1 代表一天中的时间比例）
  const numVal = parseFloat(trimmed);
  if (!isNaN(numVal) && numVal >= 0 && numVal < 1) {
    const totalMinutes = Math.round(numVal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return null;
}

/** 获取文件中所有唯一的科目名称（用于标记室外课） */
export function extractUniqueSubjects(slots: ParsedCourseSlot[]): string[] {
  const subjects = new Set<string>();
  for (const s of slots) {
    if (s.subject) subjects.add(s.subject);
  }
  return Array.from(subjects).sort();
}

/** 获取文件中所有唯一的班级名称 */
export function extractUniqueClasses(
  slots: ParsedCourseSlot[],
  assignments: ParsedTeacherAssignment[]
): string[] {
  const classes = new Set<string>();
  for (const s of slots) classes.add(s.className);
  for (const a of assignments) classes.add(a.className);
  return Array.from(classes).sort();
}

/** 获取文件中所有唯一的教师名称 */
export function extractUniqueTeachers(
  assignments: ParsedTeacherAssignment[]
): string[] {
  const teachers = new Set<string>();
  for (const a of assignments) teachers.add(a.teacherName);
  return Array.from(teachers).sort();
}
