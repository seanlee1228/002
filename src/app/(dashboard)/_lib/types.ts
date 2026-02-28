// 仪表盘数据类型定义

export interface DashboardData {
  stats: {
    todayPlanItems: number;
    scoredClasses: number;
    totalClasses: number;
    weekPassRate: number;
    weekTotal: number;
    weekPassed: number;
  };
  gradeDistribution: { A: number; B: number; C: number; unrated: number };
  gradeDistributionClasses?: Record<string, string[]>;
  excellentClasses: Array<{ id: string; name: string; grade: number; weeks?: number }>;
  warningClasses: Array<{
    classId: string; className: string; grade: number; weeks?: number;
    failedItems?: Array<{ code: string | null; title: string }>;
  }>;
  improvedClasses?: Array<{ classId: string; className: string; grade: number; from: string; to: string }>;
  weeklyTrend: Array<{
    date: string;
    grade1Rate?: number;
    grade2Rate?: number;
    grade3Rate?: number;
    overallRate?: number;
  }>;
  todayCheckItems: Array<{ id: string; code: string | null; title: string }>;
  todayPlannedItems?: Array<{ id: string; code: string | null; title: string }>;
  unscoredClasses: Array<{ id: string; name: string; grade: number }>;
  aiAnalysis: {
    source: "llm" | "fallback" | "rule";
    trendData?: {
      weekRate: number;
      prevWeekRate: number;
      fourWeeksAgoRate: number;
      weekDiff: number;
      monthDiff: number;
      summary: string;
    };
    riskAlerts?: Array<{ title: string; detail: string; level: "high" | "medium"; suggestion?: string }>;
    gradeComparisonData?: {
      period: string;
      average: number;
      grades: Array<{ grade: number; rate: number }>;
    };
    focusClasses?: Array<{
      name: string;
      rate: number;
      failedItems: Array<{ title: string; failRate: number }>;
    }>;
    classRanking?: Array<{
      name: string; rate: number;
      prevRate?: number | null; trend?: "up" | "down" | "stable";
      recentGrades?: string[]; isExcellent?: boolean; isWarning?: boolean;
      failedItems?: Array<{ code: string | null; title: string }>;
    }>;
    weakAreas?: Array<{ title: string; failRate: number; suggestion?: string }>;
    focusPoints?: Array<{ title: string; reason: string }>;
    tips?: string[];
    recentIssues?: string[];
    classSummary?: string;
    classAdvice?: string[];
    riskAreas?: Array<{ title: string; failRate: number; total: number; failed: number }>;
    recommendations?: Array<{ title: string; reason: string; priority: "high" | "medium" }>;
  };
  managedGrade?: number;
  // 校历周智能切换
  weekMode?: "school" | "natural";
  schoolWeekNumber?: number | null;
  // ADMIN 扩展
  overallGauge?: { weekRate: number; monthRate: number; semesterRate: number };
  gradeProgress?: Array<{ grade: number; totalClasses: number; scoredClasses: number; percentage: number }>;
  dutyTeacherStatus?: {
    totalDutyTeachers: number;
    activeTodayCount: number;
    schoolAvg14d?: number;
    teachers: Array<{
      id: string; name: string; managedGrade: number | null;
      scoredCount: number; lastActiveAt: string | null;
      weekTotal?: number; passRate14d?: number | null; deviation?: number | null;
    }>;
  };
  checkItemFailRates?: Array<{ code: string | null; title: string; failRate: number; total: number; failed: number }>;
  weeklyReviewStatus?: {
    grades: Array<{ grade: number; totalClasses: number; reviewedClasses: number; isComplete: boolean }>;
  };
  balancedTeachers?: {
    teachers: Array<{
      id: string; name: string; grade: number | null;
      passRate: number | null; schoolAvg: number; deviation: number | null;
      recordCount: number;
    }>;
  };
  scoringTimeDistribution?: Array<{ hour: number; count: number }>;
  // GRADE_LEADER 扩展
  gradeComparison?: {
    myGrade: number;
    myRate: number;
    schoolAvg: number;
    grades: Array<{ grade: number; rate: number }>;
  };
  schoolItemFailRates?: Array<{ code: string | null; title: string; failRate: number }>;
  // 年级 AI 日报
  allClassesScored?: boolean;
  gradeAiReport?: string;
  recentRevisions?: Array<{
    id: string;
    date: string;
    className: string;
    checkItemCode: string | null;
    checkItemTitle: string;
    passed: boolean | null;
    originalPassed: boolean | null;
    scoredByName: string | null;
    reviewedByName: string | null;
    reviewAction: string | null;
    reviewedAt: string | null;
  }>;
  // DUTY_TEACHER
  dutyTeacherMetrics?: {
    totalScoredDays: number;
    totalRecordCount: number;
    distinctClasses: number;
    personalPassRate: number;
  };
  // CLASS_TEACHER
  classRecords?: Array<{
    passed: boolean | null;
    checkItem: { code: string; title: string };
  }>;
  classPassRateToday?: number;
  classPassRateWeek?: number;
  classWeekGrade?: "A" | "B" | "C" | null;
}

// 仪表盘视图组件通用 Props
export interface DashboardViewProps {
  data: DashboardData | null;
  loading: boolean;
  onDataUpdate: (data: DashboardData) => void;
}

// 检查项 code 列表（用于国际化翻译）
export const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

// 图表年级颜色映射
export const GRADE_COLORS: Record<string, string> = {
  grade1Rate: "#60a5fa",
  grade2Rate: "#34d399",
  grade3Rate: "#fbbf24",
  grade4Rate: "#f87171",
  grade5Rate: "#fb923c",
  grade6Rate: "#e879f9",
  overallRate: "#a78bfa",
};
