// 评分页面类型定义

export interface CheckItemRecord {
  passed: boolean;
  severity: string | null;
  comment: string | null;
  // 审计字段
  scoredByRole: string | null;
  scoredByName: string | null;
  reviewAction: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  originalScoredByName: string | null;
  originalScoredByRole: string | null;
  originalPassed: boolean | null;
}

export interface ClassItem {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  record: CheckItemRecord | null;
  hasBeenScored: boolean;
}

export interface ClassData {
  id: string;
  name: string;
  grade: number;
  section: number;
  items: ClassItem[];
  scoredItemIds: string[];
  recentFailedItemIds: string[];
}

export interface InspectorProfile {
  personalPassRate: number;
  schoolAvgPassRate: number;
  deviation: number;
  severityDist: { minor: number; moderate: number; serious: number };
  schoolSeverityDist: { minor: number; moderate: number; serious: number };
  commentRate: number;
  totalScoredDays: number;
  avgDailyClasses: number;
  guidanceLevel: string;
  personalTotal: number;
  schoolFailTotal: number;
  teacherFailTotal: number;
}

export interface ScoringData {
  date: string;
  classes: ClassData[];
  checkItems: Array<{ id: string; code: string | null; title: string; description: string | null }>;
  hasPlan: boolean;
  planSource: "manual" | "auto" | "fallback" | "none";
  inspectorProfile: InspectorProfile | null;
}
