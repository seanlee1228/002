// 成绩页面相关类型定义

export type Period = "week" | "month" | "year";
export type Scope = "all" | "grade" | "class";

export interface ClassSummary {
  classId: string;
  className: string;
  grade: number;
  section: number;
  dailyPassRate: number;
  dailyTotal: number;
  dailyPassed: number;
  latestGrade: "A" | "B" | "C" | null;
  weekGrades: string[];
  recentGrades: string[];
  consecutiveWarnings: boolean;
  isExcellent: boolean;
  trend: "improving" | "declining" | "stable";
}

export interface SummaryData {
  period: string;
  scope: string;
  grade?: number;
  classSummaries: ClassSummary[];
  overallPassRate: number;
  overallTotal: number;
  overallPassed: number;
}

export interface ItemSummary {
  title: string;
  code: string | null;
  total: number;
  passed: number;
  passRate: number;
  schoolPassRate?: number;
  gradePassRate?: number;
}

export interface DailyRecord {
  date: string;
  passed: boolean | null;
  checkItem: { code: string; title: string };
  comment: string | null;
  // 审计字段
  scoredByName: string | null;
  scoredByRole: string | null;
  reviewAction: string | null;
  reviewedByName: string | null;
}

export interface WeeklyRecord {
  date: string;
  optionValue: string | null;
  checkItem: { code: string; title: string };
  comment: string | null;
  // 审计字段
  scoredByName: string | null;
  scoredByRole: string | null;
  reviewAction: string | null;
  reviewedByName: string | null;
}

export interface DetailData {
  className: string;
  classId: string;
  grade: number;
  section: number;
  period: string;
  passRate: number;
  total: number;
  passed: number;
  itemSummaries: ItemSummary[];
  dailyRecords: DailyRecord[];
  weeklyRecords: WeeklyRecord[];
  schoolPassRate: number;
  gradePassRate: number;
}

export interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
}

// ===== 周汇总相关类型 =====

// 周次选项
export interface WeekOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  note?: string | null;
}

// 第一层：周概览中的单班摘要
export interface WeeklyClassSummary {
  classId: string;
  className: string;
  grade: number;
  passRate: number;
  totalItems: number;
  passedItems: number;
  latestGrade: string | null;
}

// 第二层+第三层：单条检查记录（日x项矩阵的单元格）
export interface DayItemRecord {
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
}

// 第二层：班级日x项矩阵
export interface WeeklyClassDetail {
  weekKey: string;
  weekLabel: string;
  classId: string;
  className: string;
  grade: number;
  passRate: number;
  latestGrade: string | null;
  days: Array<{
    date: string;
    dayLabel: string;
    items: DayItemRecord[];
  }>;
}
