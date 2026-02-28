"use client";

// 管理员仪表盘视图 — 最全面的数据面板

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useChartTheme } from "@/lib/echarts-theme";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Chip,
  Button as HButton,
} from "@heroui/react";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Trophy,
  Target,
  Lightbulb,
  Circle,
  XCircle,
  ShieldAlert,
  Users,
  Eye,
  BarChart3,
  Scale,
  Medal,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import type { DashboardViewProps } from "../_lib/types";
import type { ReviewSummaryResult } from "@/lib/fetch-attendance";
import {
  buildWeeklyTrendOption,
  buildTrendComparisonOption,
  buildGradeComparisonOption,
  buildFailRateBarOption,
  buildScoringTimeOption,
} from "../_lib/chart-options";
import { StatCard, StatCardSkeleton, CardSkeleton, ChartSkeleton, getItemTitle } from "./dashboard-shared";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function AdminView({ data, loading, onDataUpdate }: DashboardViewProps) {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const ct = useChartTheme();
  const itemTitle = (item: { code?: string | null; title: string }) => getItemTitle(item, ti);

  // 局部状态
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [gradeDistExpanded, setGradeDistExpanded] = useState(false);
  const [attendanceRange, setAttendanceRange] = useState<"day" | "week" | "month">("day");
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<{
    period?: { startDate: string; endDate: string };
    totalCourses: number;
    completedCourses: number;
    absentCount: number;
    completionRate: number;
    byGrade: Array<{ grade: number; totalSlots: number; completed: number; absent: number }>;
    pendingClasses?: Array<{ classId: string; name: string; grade: number; total: number; completed: number; pending: number }>;
    reviewSummary?: ReviewSummaryResult | null;
  } | null>(null);
  const [attendanceProgressExpanded, setAttendanceProgressExpanded] = useState(false);

  const loadAttendance = useCallback(async (range: "day" | "week" | "month") => {
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const res = await fetch(`/api/attendance/overview?range=${range}`);
      if (!res.ok) throw new Error("fetch_failed");
      const json = await res.json();
      setAttendanceData({
        period: json.period,
        totalCourses: json.totalCourses ?? 0,
        completedCourses: json.completedCourses ?? 0,
        absentCount: json.absentCount ?? 0,
        completionRate: json.completionRate ?? 0,
        byGrade: json.byGrade ?? [],
        pendingClasses: json.pendingClasses ?? [],
        reviewSummary: json.reviewSummary ?? null,
      });
    } catch {
      setAttendanceError(t("attendanceLoadFailed"));
      setAttendanceData(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAttendance(attendanceRange);
  }, [attendanceRange, loadAttendance]);

  // ---- 图表配置 ----
  const gradeLabels = useMemo<Record<string, string>>(() => ({
    grade1Rate: t("gradeLabels.grade1Rate"),
    grade2Rate: t("gradeLabels.grade2Rate"),
    grade3Rate: t("gradeLabels.grade3Rate"),
    grade4Rate: t("gradeLabels.grade4Rate"),
    grade5Rate: t("gradeLabels.grade5Rate"),
    grade6Rate: t("gradeLabels.grade6Rate"),
    overallRate: t("gradeLabels.overallRate"),
  }), [t]);

  const allGradeKeys = useMemo(() => {
    const keys = Object.keys(gradeLabels).filter(k => k !== "overallRate");
    keys.push("overallRate");
    return keys;
  }, [gradeLabels]);

  const weeklyTrendOption = useMemo(
    () => data?.weeklyTrend ? buildWeeklyTrendOption(data.weeklyTrend, ct, gradeLabels, allGradeKeys) : null,
    [data?.weeklyTrend, ct, gradeLabels, allGradeKeys]
  );

  const trendComparisonOption = useMemo(
    () => data?.aiAnalysis?.trendData ? buildTrendComparisonOption(data.aiAnalysis.trendData, ct, {
      compare: t("chartCompare"), thisWeek: t("chartThisWeek"),
      weekComparison: t("chartWeekComparison"), monthComparison: t("chartMonthComparison"),
    }) : null,
    [data?.aiAnalysis?.trendData, ct, t]
  );

  const gradeComparisonOption = useMemo(
    () => data?.aiAnalysis?.gradeComparisonData ? buildGradeComparisonOption(data.aiAnalysis.gradeComparisonData, ct, t, (g) => tc(`gradeNames.${g}`)) : null,
    [data?.aiAnalysis?.gradeComparisonData, ct, t, tc]
  );

  const failRateBarOption = useMemo(
    () => data?.checkItemFailRates ? buildFailRateBarOption(data.checkItemFailRates, ct, t, ti) : null,
    [data?.checkItemFailRates, ct, t, ti]
  );

  const scoringTimeOption = useMemo(
    () => data?.scoringTimeDistribution ? buildScoringTimeOption(data.scoringTimeDistribution, ct, t) : null,
    [data?.scoringTimeDistribution, ct, t]
  );

  return (
    <>
      {/* ====== 第一区：全局概览 ====== */}

      {/* 达标总览 Bar */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-2">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            {t("gaugeTitle")}
          </h3>
        </HCardHeader>
        <HCardBody className="px-6 pb-4 pt-0">
          {loading ? (
            <div className="h-16 rounded-xl bg-v-input animate-pulse" />
          ) : data?.overallGauge ? (() => {
            const g = data.overallGauge;
            const isSemester = (label: string) => label === t("gaugeSemester");
            const allMarkers = [
              { label: t("gaugeWeek"), value: g.weekRate, color: "#60a5fa" },
              { label: t("gaugeMonth"), value: g.monthRate, color: "#a78bfa" },
              { label: t("gaugeSemester"), value: g.semesterRate, color: "#fbbf24" },
            ];
            const MIN_GAP = 10;
            const sorted = [...allMarkers].sort((a, b) => a.value - b.value);
            const placement = new Map<string, "above" | "below">();
            let lastAbove = -Infinity;
            let lastBelow = -Infinity;
            for (const m of sorted) {
              const canAbove = m.value - lastAbove >= MIN_GAP;
              const canBelow = m.value - lastBelow >= MIN_GAP;
              if (canAbove && canBelow) { placement.set(m.label, "above"); lastAbove = m.value; }
              else if (canAbove) { placement.set(m.label, "above"); lastAbove = m.value; }
              else if (canBelow) { placement.set(m.label, "below"); lastBelow = m.value; }
              else {
                if (m.value - lastAbove >= m.value - lastBelow) { placement.set(m.label, "above"); lastAbove = m.value; }
                else { placement.set(m.label, "below"); lastBelow = m.value; }
              }
            }
            const aboveMarkers = allMarkers.filter(m => placement.get(m.label) === "above");
            const belowMarkers = allMarkers.filter(m => placement.get(m.label) === "below");
            const hasBelow = belowMarkers.length > 0;
            const renderMarker = (m: typeof allMarkers[number], side: "above" | "below") => {
              if (side === "above") {
                return (
                  <div key={m.label} className="absolute flex flex-col items-center pointer-events-none" style={{ left: `${m.value}%`, bottom: 0, transform: "translateX(-50%)" }}>
                    <span className="text-xs font-bold whitespace-nowrap" style={{ color: m.color }}>{m.value}%</span>
                    <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent" style={{ borderTopColor: m.color }} />
                  </div>
                );
              }
              return (
                <div key={m.label} className="absolute flex flex-col items-center pointer-events-none" style={{ left: `${m.value}%`, top: 0, transform: "translateX(-50%)" }}>
                  <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent" style={{ borderBottomColor: m.color }} />
                  <span className="text-xs font-bold whitespace-nowrap" style={{ color: m.color }}>{m.value}%</span>
                </div>
              );
            };
            return (
              <div className="pb-1 px-1">
                <div className="relative">
                  <div className="relative" style={{ height: 22 }}>{aboveMarkers.map(m => renderMarker(m, "above"))}</div>
                  <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ background: "linear-gradient(to right, #ef4444 0%, #ef4444 60%, #f59e0b 60%, #f59e0b 80%, #10b981 80%, #10b981 100%)" }} />
                  {hasBelow && <div className="relative" style={{ height: 22 }}>{belowMarkers.map(m => renderMarker(m, "below"))}</div>}
                </div>
                <div className={`relative flex justify-between text-xs text-v-text4 ${hasBelow ? "mt-0.5" : "mt-1.5"}`}>
                  <span>0%</span>
                  <span className="absolute" style={{ left: "60%", transform: "translateX(-50%)" }}>60%</span>
                  <span className="absolute" style={{ left: "80%", transform: "translateX(-50%)" }}>80%</span>
                  <span>100%</span>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                  {allMarkers.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-sm ${isSemester(m.label) ? "border border-dashed" : ""}`} style={{ backgroundColor: isSemester(m.label) ? "transparent" : m.color, borderColor: m.color }} />
                      <span className="text-xs text-v-text3">{m.label} {m.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : (
            <div className="h-16 flex items-center justify-center text-v-text4">{tc("noData")}</div>
          )}
        </HCardBody>
      </HCard>

      {/* 今日检查项横幅 */}
      {loading ? (
        <div className="h-24 rounded-2xl bg-v-input border border-v-border animate-pulse" />
      ) : (
        <HCard className="bg-v-card border border-v-border border-l-3 border-l-blue-500 overflow-hidden">
          <HCardBody className="px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-blue-500/15 p-3 shrink-0">
                <ClipboardCheck className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-sm font-medium text-v-text2">{t("todayCheckItems")}</p>
                  <span className="text-xl font-bold text-blue-400">{data?.todayPlannedItems?.length ?? data?.stats?.todayPlanItems ?? 0}</span>
                </div>
                {(data?.todayPlannedItems ?? data?.todayCheckItems)?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {(data?.todayPlannedItems ?? data?.todayCheckItems ?? []).map((item) => (
                      <Chip key={item.id} size="md" classNames={{ base: "bg-blue-500/10 border border-blue-500/20", content: "text-v-text1 text-sm font-medium" }}>
                        <span className="font-mono mr-1 text-v-text3">{item.code ?? ti("dynamic")}</span>
                        {itemTitle(item)}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-v-text4 text-sm">{t("noPlannedItems")}</p>
                )}
              </div>
            </div>
          </HCardBody>
        </HCard>
      )}

      {/* 各年级今日检查完成度 */}
      <HCard className="bg-v-card border border-v-border border-l-3 border-l-cyan-500 overflow-hidden">
        <HCardHeader className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
            {t("gradeProgressTitle")}
          </h3>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? <CardSkeleton /> : data?.gradeProgress?.length ? (
            <div className="space-y-4">
              {data.gradeProgress.map(gp => (
                <div key={gp.grade}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-v-text1">{tc(`gradeNames.${gp.grade}`)}</span>
                    <span className="text-sm text-v-text3">{gp.scoredClasses}/{gp.totalClasses} {t("classUnit")} · {gp.percentage}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-v-input overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${gp.percentage >= 100 ? "bg-emerald-500" : gp.percentage >= 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${gp.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-center py-6 text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 室外课出勤总览 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <div className="flex items-center justify-between w-full gap-3">
            <div>
              <h3 className="text-base font-semibold text-v-text1">{t("attendanceCardTitle")}</h3>
              {attendanceData?.period && (
                <p className="text-xs text-v-text4 mt-1">
                  {attendanceData.period.startDate} ~ {attendanceData.period.endDate}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(["day", "week", "month"] as const).map((range) => (
                <HButton
                  key={range}
                  size="sm"
                  variant={attendanceRange === range ? "solid" : "flat"}
                  className={attendanceRange === range ? "bg-blue-500 text-white" : "text-v-text2"}
                  onPress={() => setAttendanceRange(range)}
                >
                  {t(`attendanceRange.${range}`)}
                </HButton>
              ))}
            </div>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {attendanceLoading ? (
            <CardSkeleton />
          ) : attendanceError ? (
            <div className="text-center py-6 text-v-text4">{attendanceError}</div>
          ) : attendanceData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {/* 考勤进度（可展开） */}
                <div
                  className="col-span-1 p-3 rounded-xl border border-v-border bg-v-thead cursor-pointer hover:bg-v-hover transition-colors select-none"
                  onClick={() => setAttendanceProgressExpanded((v) => !v)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-v-text3">考勤进度</p>
                    <ChevronDown className={`h-3.5 w-3.5 text-v-text4 transition-transform ${attendanceProgressExpanded ? "rotate-180" : ""}`} />
                  </div>
                  <p className="text-lg font-semibold text-v-text1 mt-1">
                    <span className="text-emerald-400">{attendanceData.completedCourses}</span>
                    <span className="text-v-text4 text-sm font-normal mx-1">/</span>
                    {attendanceData.totalCourses}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-v-border bg-v-thead">
                  <p className="text-xs text-v-text3">{t("attendanceAbsentCount")}</p>
                  <p className="text-lg font-semibold text-red-400 mt-1">{attendanceData.absentCount}</p>
                </div>
                <div className="p-3 rounded-xl border border-v-border bg-v-thead">
                  <p className="text-xs text-v-text3">{t("attendanceCompletionRate")}</p>
                  <p className="text-lg font-semibold text-blue-400 mt-1">{attendanceData.completionRate}%</p>
                </div>
              </div>
              {/* 展开：未考勤班级 */}
              {attendanceProgressExpanded && (
                <div>
                  <p className="text-sm font-medium text-v-text2 mb-2">未完成考勤班级</p>
                  {attendanceData.pendingClasses?.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {attendanceData.pendingClasses.map((cls) => (
                        <div key={cls.classId} className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between text-sm">
                          <span className="font-medium text-v-text1">{cls.name}</span>
                          <span className="text-amber-400 text-xs">待完成 {cls.pending} 课次</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-400">所有班级考勤已完成 ✓</div>
                  )}
                </div>
              )}

              {/* 室外课评价洞察 */}
              <div className="border-t border-v-border/50 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-v-text2">室外课评价洞察</p>
                  {attendanceData.reviewSummary && attendanceData.reviewSummary.totalReviews > 0 && (
                    <span className="text-xs text-v-text4">共 {attendanceData.reviewSummary.totalReviews} 条评价</span>
                  )}
                </div>
                {attendanceData.reviewSummary && attendanceData.reviewSummary.totalReviews > 0 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-center">
                        <p className="text-xs text-v-text3 mb-1">纪律均分</p>
                        <p className="text-xl font-bold text-blue-400">{attendanceData.reviewSummary.disciplineAvg}</p>
                        <p className="text-[10px] text-v-text4 mt-0.5">满分 5</p>
                      </div>
                      <div className="p-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 text-center">
                        <p className="text-xs text-v-text3 mb-1">综合均分</p>
                        <p className="text-xl font-bold text-violet-400">{attendanceData.reviewSummary.overallAvg}</p>
                        <p className="text-[10px] text-v-text4 mt-0.5">满分 5</p>
                      </div>
                    </div>
                    {attendanceData.reviewSummary.trendByWeek.length > 1 && (
                      <div className="h-40">
                        <ReactECharts
                          option={{
                            ...ct,
                            tooltip: { trigger: "axis" },
                            legend: { data: ["纪律", "综合"], bottom: 0, textStyle: { fontSize: 10 } },
                            grid: { top: 8, bottom: 28, left: 28, right: 8, containLabel: true },
                            xAxis: {
                              type: "category",
                              data: attendanceData.reviewSummary.trendByWeek.map((w) => w.weekLabel),
                              axisLabel: { fontSize: 10 },
                            },
                            yAxis: { type: "value", min: 1, max: 5, interval: 1, axisLabel: { fontSize: 10 } },
                            series: [
                              { name: "纪律", type: "line", smooth: true, data: attendanceData.reviewSummary.trendByWeek.map((w) => w.disciplineAvg) },
                              { name: "综合", type: "line", smooth: true, data: attendanceData.reviewSummary.trendByWeek.map((w) => w.overallAvg) },
                            ],
                          }}
                          style={{ height: "100%", width: "100%" }}
                          theme="dark"
                          opts={{ renderer: "svg" }}
                        />
                      </div>
                    )}
                    {attendanceData.reviewSummary.lowScoreAlerts.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-red-400 mb-1.5">低分预警（纪律或综合 ≤2）</p>
                        <div className="space-y-1.5">
                          {attendanceData.reviewSummary.lowScoreAlerts.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-sm flex items-center justify-between">
                              <span className="text-v-text2 text-xs">{alert.date} · {alert.subject} {alert.periodLabel}</span>
                              <div className="flex gap-2 text-xs shrink-0">
                                <span className="text-amber-400">纪律 {alert.discipline}</span>
                                <span className="text-red-400">综合 {alert.overall}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-v-text4">暂无室外课评价数据</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-v-text4">{t("attendanceNoData")}</div>
          )}
        </HCardBody>
      </HCard>

      {/* 检查进度 + 等级分布 + 本周达标率 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            {/* 检查进度卡片（可展开） */}
            <HCard
              className={`bg-v-card border border-v-border border-l-3 border-l-emerald-500 overflow-hidden ${(data?.unscoredClasses?.length ?? 0) > 0 ? "cursor-pointer" : ""} transition-all duration-300`}
              isPressable={(data?.unscoredClasses?.length ?? 0) > 0}
              onPress={() => (data?.unscoredClasses?.length ?? 0) > 0 && setProgressExpanded(prev => !prev)}
            >
              <HCardBody className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-v-text2">{t("inspectionProgress")}</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">
                      {data?.stats?.scoredClasses ?? 0}
                      <span className="text-base font-normal text-v-text3"> / {data?.stats?.totalClasses ?? 0}</span>
                    </p>
                    <div className="w-full h-2 rounded-full bg-v-input mt-3 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(data?.stats?.totalClasses ?? 0) > 0 ? Math.round(((data?.stats?.scoredClasses ?? 0) / (data?.stats?.totalClasses ?? 1)) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/15 p-2.5 ml-4">
                    {(data?.unscoredClasses?.length ?? 0) > 0 ? (
                      <ChevronRight className={`h-5 w-5 text-emerald-400 transition-transform duration-300 ${progressExpanded ? "rotate-90" : ""}`} />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    )}
                  </div>
                </div>
                {progressExpanded && (data?.unscoredClasses?.length ?? 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-v-border animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-v-text3 mb-1.5">{t("unscoredClasses", { count: data?.unscoredClasses?.length ?? 0 })}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data?.unscoredClasses?.map(cls => (
                        <Chip key={cls.id} size="sm" classNames={{ base: "bg-emerald-500/10 border border-emerald-500/20", content: "text-v-text1 text-xs" }}>{cls.name}</Chip>
                      ))}
                    </div>
                  </div>
                )}
              </HCardBody>
            </HCard>

            {/* 等级分布卡片（可展开） */}
            <HCard
              className="bg-v-card border border-v-border border-l-3 border-l-amber-500 overflow-hidden cursor-pointer transition-all duration-300"
              isPressable
              onPress={() => setGradeDistExpanded(prev => !prev)}
            >
              <HCardBody className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-v-text2">{t("gradeDistribution")}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25">
                        <span className="text-emerald-400 text-sm font-bold">A</span>
                        <span className="text-emerald-400 text-lg font-bold">{data?.gradeDistribution?.A ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25">
                        <span className="text-blue-400 text-sm font-bold">B</span>
                        <span className="text-blue-400 text-lg font-bold">{data?.gradeDistribution?.B ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25">
                        <span className="text-red-400 text-sm font-bold">C</span>
                        <span className="text-red-400 text-lg font-bold">{data?.gradeDistribution?.C ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-500/15 p-2.5">
                    <ChevronRight className={`h-5 w-5 text-amber-400 transition-transform duration-300 ${gradeDistExpanded ? "rotate-90" : ""}`} />
                  </div>
                </div>
                {gradeDistExpanded && data?.gradeDistributionClasses && (
                  <div className="mt-3 pt-3 border-t border-v-border space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {(["A", "B", "C", "unrated"] as const).map(g => {
                      const names = data.gradeDistributionClasses?.[g];
                      if (!names?.length) return null;
                      const colorMap: Record<string, string> = { A: "bg-emerald-500/10 border-emerald-500/20", B: "bg-blue-500/10 border-blue-500/20", C: "bg-red-500/10 border-red-500/20", unrated: "bg-v-input border-v-border" };
                      return (
                        <div key={g}>
                          <p className="text-xs text-v-text3 mb-1">{g === "unrated" ? t("unrated") : g}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {names.map(name => (
                              <Chip key={name} size="sm" classNames={{ base: `${colorMap[g] ?? "bg-v-input border-v-border"} border`, content: "text-v-text1 text-xs" }}>{name}</Chip>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </HCardBody>
            </HCard>

            {/* 本周达标率 */}
            <StatCard label={t("weekPassRate")} value={`${data?.stats?.weekPassRate ?? 0}%`} icon={Target} accent="violet" tooltip={
              <div>
                <p className="font-medium text-v-text1 mb-1">{t("weekDailyDetail")}</p>
                <p>{t("weekDailyStats", { passed: data?.stats?.weekPassed ?? 0, total: data?.stats?.weekTotal ?? 0 })}</p>
              </div>
            } />
          </>
        )}
      </div>

      {/* ====== 第三区：班级表现 ====== */}

      {/* 流动红旗 + 显著进步 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 流动红旗 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><Medal className="h-5 w-5 text-emerald-400" />{t("redFlagTitle")}</h3>
            <p className="text-xs text-v-text4 mt-0.5">{t("redFlagSubtitle")}</p>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : (() => {
              const sorted = [...(data?.excellentClasses ?? [])].sort((a, b) => (b.weeks ?? 2) - (a.weeks ?? 2));
              const maxW = sorted[0]?.weeks ?? 2;
              return sorted.length ? (
                <div className="space-y-2">
                  {sorted.map((cls, idx) => (
                    <div key={cls.id} className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                      <span className="text-lg w-7 text-center shrink-0">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span>
                      <span className="font-medium text-emerald-300 text-sm truncate min-w-0">{cls.name}</span>
                      <span className="text-xs text-emerald-400/70 shrink-0 whitespace-nowrap ml-auto">{t("consecutiveAWeeks", { weeks: cls.weeks ?? 2 })}</span>
                      <div className="w-10 h-1.5 rounded-full bg-emerald-900/30 overflow-hidden shrink-0 hidden sm:block">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, ((cls.weeks ?? 2) / maxW) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-center py-6 text-v-text4">{t("noConsecutiveA")}</div>;
            })()}
          </HCardBody>
        </HCard>

        {/* 显著进步 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-400" />{t("improvingTitle")}</h3>
            <p className="text-xs text-v-text4 mt-0.5">{t("improvingSubtitle")}</p>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : (() => {
              const gradeVal: Record<string, number> = { C: 1, B: 2, A: 3 };
              const gradeColor: Record<string, string> = {
                A: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
                B: "text-blue-400 bg-blue-500/20 border-blue-500/30",
                C: "text-red-400 bg-red-500/20 border-red-500/30",
              };
              const sorted = [...(data?.improvedClasses ?? [])].sort((a, b) =>
                ((gradeVal[b.to] ?? 0) - (gradeVal[b.from] ?? 0)) - ((gradeVal[a.to] ?? 0) - (gradeVal[a.from] ?? 0))
              );
              return sorted.length ? (
                <div className="space-y-2">
                  {sorted.map(cls => {
                    const jump = (gradeVal[cls.to] ?? 0) - (gradeVal[cls.from] ?? 0);
                    return (
                      <div key={cls.classId} className="flex items-center gap-3 p-3 rounded-xl border border-blue-500/15 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                        <span className="font-medium text-blue-300 text-sm flex-1">{cls.className}</span>
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border ${gradeColor[cls.from] ?? ""}`}>{cls.from}</span>
                        <ArrowRight className="h-4 w-4 text-blue-400/60 shrink-0" />
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border ${gradeColor[cls.to] ?? ""}`}>{cls.to}</span>
                        {jump >= 2 && <Sparkles className="h-4 w-4 text-yellow-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="text-center py-6 text-v-text4">{t("noImprovement")}</div>;
            })()}
          </HCardBody>
        </HCard>
      </div>

      {/* 连续预警班级 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-400" />{t("warningTitle")}</h3>
          <p className="text-xs text-v-text4 mt-0.5">{t("warningSubtitle")}</p>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? <CardSkeleton /> : (() => {
            const sorted = [...(data?.warningClasses ?? [])].sort((a, b) => (b.weeks ?? 2) - (a.weeks ?? 2));
            return sorted.length ? (
              <div className="space-y-3">
                {sorted.map(cls => {
                  const isSevere = (cls.weeks ?? 2) >= 3;
                  return (
                    <div key={cls.classId} className={`p-4 rounded-xl border ${isSevere ? "border-red-500/30 bg-red-500/10" : "border-amber-500/20 bg-amber-500/5"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isSevere ? <XCircle className="h-4 w-4 text-red-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                          <span className="font-medium text-v-text1">{cls.className}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-v-text3">{t("consecutiveCWeeks", { weeks: cls.weeks ?? 2 })}</span>
                          <Chip size="sm" variant="flat" classNames={{
                            base: isSevere ? "bg-red-500/20" : "bg-amber-500/20",
                            content: isSevere ? "text-red-400 text-xs" : "text-amber-400 text-xs",
                          }}>
                            {isSevere ? t("severitySerious") : t("severityWatch")}
                          </Chip>
                        </div>
                      </div>
                      {cls.failedItems?.length ? (
                        <div className="ml-6 space-y-1 border-l-2 border-red-500/20 pl-3">
                          {cls.failedItems.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-v-text3">{item.code ? `${item.code} ` : ""}{itemTitle(item)}</span>
                              <span className="text-red-400/80">{t("fail")}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-center py-6 text-v-text4">{t("noConsecutiveC")}</div>;
          })()}
        </HCardBody>
      </HCard>

      {/* ====== 第四区：深度洞察 ====== */}

      {/* 检查项薄弱度 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-4 pt-4 pb-2 md:px-6 md:pt-5 md:pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-400" />{t("checkItemWeakness")}</h3>
          <p className="text-xs text-v-text4 mt-0.5">{t("checkItemWeaknessDesc")}</p>
        </HCardHeader>
        <HCardBody className="px-4 pb-4 md:px-6 md:pb-5">
          {loading ? <ChartSkeleton /> : failRateBarOption ? (
            <div className="h-56 md:h-72"><ReactECharts option={failRateBarOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
          ) : <div className="h-64 flex items-center justify-center text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 最佳检查尺度教师 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-2">
          <div>
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><Scale className="h-5 w-5 text-cyan-400" />{t("balancedTeachersTitle")}</h3>
            <p className="text-xs text-v-text4 mt-1">{t("balancedTeachersDesc")}</p>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? <CardSkeleton /> : data?.balancedTeachers?.teachers?.length ? (
            <div className="space-y-2">
              {data.balancedTeachers.teachers.map((teacher, idx) => (
                <div key={teacher.id} className="p-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm shrink-0">{idx + 1}</div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sm text-v-text1">{teacher.name}</span>
                      {teacher.grade && <span className="text-xs text-v-text3 ml-1.5">{tc(`gradeNames.${teacher.grade}`)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 pl-11 text-xs">
                    <div>
                      <span className="text-v-text4">{t("personalPassRate")} </span>
                      <span className="font-medium text-v-text1">{teacher.passRate ?? 0}%</span>
                    </div>
                    <div>
                      <span className="text-v-text4">{t("deviation")} </span>
                      <span className={`font-medium ${Math.abs(teacher.deviation ?? 0) <= 3 ? "text-emerald-400" : Math.abs(teacher.deviation ?? 0) <= 6 ? "text-amber-400" : "text-red-400"}`}>
                        {(teacher.deviation ?? 0) > 0 ? "+" : ""}{teacher.deviation ?? 0}pp
                      </span>
                    </div>
                    <div>
                      <span className="text-v-text4">{t("recordCount")} </span>
                      <span className="font-medium text-v-text2">{teacher.recordCount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-center py-6 text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 评价时间分布 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-4 pt-4 pb-2 md:px-6 md:pt-5 md:pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-sky-400" />{t("scoringTimeTitle")}</h3>
          <p className="text-xs text-v-text4 mt-0.5">{t("scoringTimeDesc")}</p>
        </HCardHeader>
        <HCardBody className="px-4 pb-4 md:px-6 md:pb-5">
          {loading ? <ChartSkeleton /> : scoringTimeOption ? (
            <div className="h-48 md:h-60"><ReactECharts option={scoringTimeOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
          ) : <div className="h-48 flex items-center justify-center text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 智能分析 */}
      <HCard className="overflow-hidden bg-v-card border border-v-border">
        <HCardHeader className="px-4 py-3 md:px-6 md:py-4 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b border-v-border">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h3 className="text-base font-semibold text-v-text1">{t("smartAnalysis")}</h3>
            <Chip variant="flat" size="sm" classNames={{ base: "bg-blue-500/15", content: "text-blue-300 text-xs" }}>{t("fixedRule")}</Chip>
          </div>
        </HCardHeader>
        <HCardBody className="px-4 py-4 md:px-6 md:py-5">
          {loading ? <CardSkeleton /> : (data?.aiAnalysis?.source === "rule" || data?.aiAnalysis?.source === "llm") ? (
            <div className="space-y-6">
              {data.aiAnalysis.trendData && (
                <div className="p-4 rounded-xl border border-violet-500/15 bg-violet-500/5">
                  <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-violet-400" /><h4 className="text-sm font-semibold text-v-text2">{t("trendSummary")}</h4></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                      <p className="text-xs text-v-text3 mb-1">{t("weekComparison")}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-v-text1">{data.aiAnalysis.trendData.weekRate}%</span>
                        <span className={`text-sm font-medium ${data.aiAnalysis.trendData.weekDiff > 0 ? "text-emerald-400" : data.aiAnalysis.trendData.weekDiff < 0 ? "text-red-400" : "text-v-text3"}`}>
                          {data.aiAnalysis.trendData.weekDiff > 0 ? "+" : ""}{data.aiAnalysis.trendData.weekDiff}pp
                        </span>
                      </div>
                      <p className="text-xs text-v-text4 mt-0.5">{t("lastWeekRate", { rate: data.aiAnalysis.trendData.prevWeekRate })}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                      <p className="text-xs text-v-text3 mb-1">{t("monthComparison")}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-v-text1">{data.aiAnalysis.trendData.weekRate}%</span>
                        <span className={`text-sm font-medium ${data.aiAnalysis.trendData.monthDiff > 0 ? "text-emerald-400" : data.aiAnalysis.trendData.monthDiff < 0 ? "text-red-400" : "text-v-text3"}`}>
                          {data.aiAnalysis.trendData.monthDiff > 0 ? "+" : ""}{data.aiAnalysis.trendData.monthDiff}pp
                        </span>
                      </div>
                      <p className="text-xs text-v-text4 mt-0.5">{t("fourWeeksAgoRate", { rate: data.aiAnalysis.trendData.fourWeeksAgoRate })}</p>
                    </div>
                  </div>
                  {trendComparisonOption && (
                    <div className="h-40 md:h-48"><ReactECharts option={trendComparisonOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
                  )}
                  <p className="text-xs text-v-text3 mt-2 leading-relaxed">{data.aiAnalysis.trendData.summary}</p>
                </div>
              )}
              {/* 风险预警 */}
              <div>
                <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3"><ShieldAlert className="h-4 w-4 text-amber-400" />{t("riskAlerts")}</h4>
                {data.aiAnalysis.riskAlerts?.length ? (
                  <div className="space-y-2">
                    {data.aiAnalysis.riskAlerts.map((alert, i) => (
                      <div key={i} className={`p-3 rounded-xl border ${alert.level === "high" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/15 bg-amber-500/5"}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm text-v-text1">{alert.title}</span>
                          <Chip variant="bordered" size="sm" classNames={{
                            base: alert.level === "high" ? "border-red-500/30" : "border-amber-500/30",
                            content: alert.level === "high" ? "text-red-400 text-xs" : "text-amber-400 text-xs",
                          }}>{alert.level === "high" ? t("highRisk") : t("mediumRisk")}</Chip>
                        </div>
                        <p className="text-xs text-v-text3">{alert.detail}</p>
                        {alert.suggestion && (
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-v-border/50">
                            <Lightbulb className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-blue-300">{alert.suggestion}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 text-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                    <p className="text-sm text-emerald-400">{t("noRiskAlerts")}</p>
                  </div>
                )}
              </div>
              {/* 重点班级 */}
              {data.aiAnalysis.focusClasses?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3"><Eye className="h-4 w-4 text-orange-400" />{t("focusClasses")}</h4>
                  <div className="space-y-2">
                    {data.aiAnalysis.focusClasses.map((cls, i) => (
                      <div key={i} className="p-3 rounded-xl border border-orange-500/15 bg-orange-500/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-v-text1">{cls.name}</span>
                          <Chip variant="bordered" size="sm" classNames={{ base: cls.rate < 70 ? "border-red-500/30" : "border-orange-500/30", content: cls.rate < 70 ? "text-red-400 text-xs" : "text-orange-400 text-xs" }}>{t("passRateLabel", { rate: cls.rate })}</Chip>
                        </div>
                        {cls.failedItems?.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {cls.failedItems.map((item, j) => (
                              <div key={j} className="flex items-center justify-between text-xs">
                                <span className="text-v-text3">· {itemTitle({ code: (item as { code?: string | null; title: string }).code, title: item.title })}</span>
                                <span className="text-red-400/80">{t("failRateLabel", { rate: item.failRate })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : data?.aiAnalysis ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3"><AlertTriangle className="h-4 w-4 text-amber-400" />{t("riskAreas")}</h4>
                {data.aiAnalysis.riskAreas?.length ? (
                  <div className="space-y-2">{data.aiAnalysis.riskAreas.map(area => (
                    <div key={area.title} className="p-3 rounded-xl border border-amber-500/15 bg-amber-500/5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-v-text1">{itemTitle({ code: (area as { code?: string | null; title: string }).code, title: area.title })}</span>
                        <Chip variant="bordered" size="sm" classNames={{ base: "border-amber-500/30", content: "text-amber-400 text-xs" }}>{t("failRateAreaLabel", { rate: area.failRate })}</Chip>
                      </div>
                      <p className="text-xs text-v-text3 mt-1">{t("failCountLabel", { failed: area.failed, total: area.total })}</p>
                    </div>
                  ))}</div>
                ) : <div className="p-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 text-center"><CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" /><p className="text-sm text-emerald-400">{t("noRiskAreas")}</p></div>}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3"><Lightbulb className="h-4 w-4 text-blue-400" />{t("recommendations")}</h4>
                <div className="space-y-2">{data.aiAnalysis.recommendations?.map(rec => (
                  <div key={rec.title} className="p-3 rounded-xl border border-blue-500/15 bg-blue-500/5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm text-v-text1">{itemTitle({ code: (rec as { code?: string | null; title: string }).code, title: rec.title })}</span>
                      <Chip variant="bordered" size="sm" classNames={{ base: rec.priority === "high" ? "border-red-500/30" : "border-blue-500/30", content: rec.priority === "high" ? "text-red-400 text-xs" : "text-blue-400 text-xs" }}>{rec.priority === "high" ? t("highPriority") : t("suggestionLabel")}</Chip>
                    </div>
                    <p className="text-xs text-v-text3">{rec.reason}</p>
                  </div>
                )) ?? null}</div>
              </div>
            </div>
          ) : <p className="text-center py-6 text-v-text4">{t("noAnalysis")}</p>}
        </HCardBody>
      </HCard>

      {/* 周评完成状态 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-violet-400" />{t("weeklyReviewProgress")}</h3>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? <CardSkeleton /> : data?.weeklyReviewStatus?.grades?.length ? (
            <div className="space-y-3">
              {data.weeklyReviewStatus.grades.map(g => (
                <div key={g.grade} className={`flex items-center justify-between p-3 rounded-xl border ${g.isComplete ? "border-emerald-500/15 bg-emerald-500/5" : "border-amber-500/15 bg-amber-500/5"}`}>
                  <div className="flex items-center gap-2">
                    {g.isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-amber-400" />}
                    <span className="font-medium text-sm text-v-text1">{tc(`gradeNames.${g.grade}`)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-v-text3">{g.reviewedClasses}/{g.totalClasses}</span>
                    <Chip size="sm" variant="flat" classNames={{
                      base: g.isComplete ? "bg-emerald-500/20" : g.reviewedClasses > 0 ? "bg-amber-500/20" : "bg-v-input",
                      content: g.isComplete ? "text-emerald-400 text-xs" : g.reviewedClasses > 0 ? "text-amber-400 text-xs" : "text-v-text4 text-xs",
                    }}>
                      {g.isComplete ? t("statusComplete") : g.reviewedClasses > 0 ? t("statusPartial") : t("statusNotStarted")}
                    </Chip>
                  </div>
                </div>
              ))}
              <HButton as={Link} href="/weekly-review" size="sm" className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white" endContent={<ChevronRight className="h-4 w-4" />}>{t("quickWeeklyReview")}</HButton>
            </div>
          ) : <div className="text-center py-6 text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 近7日达标率趋势 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-4 pt-4 pb-2 md:px-6 md:pt-5 md:pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-400" />{t("trendTitleAll")}</h3>
        </HCardHeader>
        <HCardBody className="px-4 pb-4 md:px-6 md:pb-5">
          {loading ? <ChartSkeleton /> : weeklyTrendOption ? (
            <div className="h-56 md:h-72"><ReactECharts option={weeklyTrendOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
          ) : <div className="h-64 flex items-center justify-center text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 年级对比 */}
      {!loading && gradeComparisonOption && data?.aiAnalysis?.gradeComparisonData && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><Users className="h-5 w-5 text-cyan-400" />{t("gradeComparison")}</h3>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            <div className="h-48 md:h-64"><ReactECharts option={gradeComparisonOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
            <p className="text-xs text-v-text4 text-center mt-1">{t("dataPeriod", { period: data.aiAnalysis.gradeComparisonData.period, average: data.aiAnalysis.gradeComparisonData.average })}</p>
          </HCardBody>
        </HCard>
      )}
    </>
  );
}
