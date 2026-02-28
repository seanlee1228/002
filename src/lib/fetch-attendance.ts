export interface AbsenceStudentEntry {
  studentId: string;
  name: string;
  absentCount: number;
  lateCount: number;
  total: number;
  warningLevel: "red" | "yellow" | "none";
}

export interface AbsenceDetailResult {
  classId: string;
  startDate: string;
  endDate: string;
  students: AbsenceStudentEntry[];
}

export interface ReviewTrendEntry {
  weekLabel: string;
  disciplineAvg: number;
  overallAvg: number;
}

export interface ReviewLowScoreAlert {
  date: string;
  subject: string;
  periodLabel: string;
  discipline: number;
  overall: number;
  improvements: string | null;
}

export interface ReviewSummaryResult {
  classId: string | null;
  grade: number | null;
  totalReviews: number;
  disciplineAvg: number;
  overallAvg: number;
  trendByWeek: ReviewTrendEntry[];
  lowScoreAlerts: ReviewLowScoreAlert[];
}

export interface W1Result {
  classId: string;
  weekMonday: string;
  weekFriday: string;
  weekLabel?: string;
  weekNumber?: number;
  absentCount: number;
  totalRecords: number;
  optionValue: "0" | "1" | "gte2";
  hasData: boolean;
}

const FALLBACK: W1Result = {
  classId: "",
  weekMonday: "",
  weekFriday: "",
  absentCount: 0,
  totalRecords: 0,
  optionValue: "0",
  hasData: false,
};

export async function fetchAttendanceW1(
  classId: string,
  monday: string,
  friday: string,
): Promise<W1Result> {
  const baseUrl = process.env.ATTENDANCE_SYNC_URL;
  const apiKey = process.env.ATTENDANCE_API_KEY;

  if (!baseUrl || !apiKey) {
    console.warn("[fetch-attendance] ATTENDANCE_SYNC_URL or ATTENDANCE_API_KEY not configured");
    return { ...FALLBACK, classId };
  }

  const url = `${baseUrl}/api/external/weekly-summary?classId=${encodeURIComponent(classId)}&monday=${monday}&friday=${friday}`;

  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[fetch-attendance] HTTP ${res.status} from attendance system`);
      return { ...FALLBACK, classId };
    }

    const data = await res.json();
    return { ...FALLBACK, ...data, classId };
  } catch (err) {
    console.warn("[fetch-attendance] Failed to reach attendance system:", err);
    return { ...FALLBACK, classId };
  }
}

export async function fetchClassAbsenceDetail(
  classId: string,
  startDate: string,
  endDate: string,
): Promise<AbsenceDetailResult | null> {
  const baseUrl = process.env.ATTENDANCE_SYNC_URL;
  const apiKey = process.env.ATTENDANCE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const url = `${baseUrl}/api/external/class-absence-detail?classId=${encodeURIComponent(classId)}&startDate=${startDate}&endDate=${endDate}`;
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as AbsenceDetailResult) : null;
  } catch {
    return null;
  }
}

export async function fetchClassReviewSummary(
  params: { classId: string } | { grade: number } | Record<string, never>,
  startDate: string,
  endDate: string,
): Promise<ReviewSummaryResult | null> {
  const baseUrl = process.env.ATTENDANCE_SYNC_URL;
  const apiKey = process.env.ATTENDANCE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const filter =
    "classId" in params && params.classId
      ? `classId=${encodeURIComponent(params.classId)}`
      : "grade" in params && params.grade
        ? `grade=${params.grade}`
        : "";
  const url = `${baseUrl}/api/external/class-review-summary?${filter ? filter + "&" : ""}startDate=${startDate}&endDate=${endDate}`;
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as ReviewSummaryResult) : null;
  } catch {
    return null;
  }
}
