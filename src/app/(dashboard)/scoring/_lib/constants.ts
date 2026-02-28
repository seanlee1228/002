// 评分页面常量和辅助函数

// 年级配色方案
export const GRADE_COLORS: Record<number, {
  bg: string; border: string; ring: string;
  headerBg: string; accent: string;
  gradientFrom: string; gradientTo: string;
}> = {
  1: { bg: "bg-blue-500/10", border: "border-blue-500/30", ring: "ring-blue-500", headerBg: "bg-blue-600", accent: "text-blue-400", gradientFrom: "from-blue-500", gradientTo: "to-blue-600" },
  2: { bg: "bg-violet-500/10", border: "border-violet-500/30", ring: "ring-violet-500", headerBg: "bg-violet-600", accent: "text-violet-400", gradientFrom: "from-violet-500", gradientTo: "to-violet-600" },
  3: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "ring-emerald-500", headerBg: "bg-emerald-600", accent: "text-emerald-400", gradientFrom: "from-emerald-500", gradientTo: "to-emerald-600" },
  4: { bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500", headerBg: "bg-amber-600", accent: "text-amber-400", gradientFrom: "from-amber-500", gradientTo: "to-amber-600" },
};

export function getGradeColor(grade: number) {
  return GRADE_COLORS[grade] ?? GRADE_COLORS[1];
}

// 日期格式化
export function formatDisplayDate(dateStr: string, locale: string = "zh") {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

// 翻译用检查项代码
export const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

// ---- 本地草稿缓存 ----

const DRAFT_KEY_PREFIX = "scoring_draft_";
export const PROFILE_COLLAPSED_KEY = "scoring_profile_collapsed";
export const ITEMS_COLLAPSED_KEY = "scoring_items_collapsed";

export function saveDraft(classId: string, date: string, records: Record<string, { passed: boolean; severity: string; comment: string }>) {
  try {
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${classId}_${date}`, JSON.stringify(records));
  } catch { /* ignore */ }
}

export function loadDraft(classId: string, date: string): Record<string, { passed: boolean; severity: string; comment: string }> | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${classId}_${date}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearDraft(classId: string, date: string) {
  try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}${classId}_${date}`); } catch { /* ignore */ }
}
