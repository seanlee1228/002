"use client";

// 年级组长仪表盘视图 — 四维监管重构版
// 维度1：年级检查工作概况  维度2：班级穿透  维度3：教师评估  维度4：年级定位

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useLocale } from "@/components/locale-provider";
import { useChartTheme } from "@/lib/echarts-theme";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Chip,
  Button as HButton,
  Progress,
  Tooltip,
} from "@heroui/react";
import {
  ClipboardCheck,
  CheckCircle2,
  Target,
  TrendingUp,
  Sparkles,
  Flag,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trophy,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  Users,
  BarChart3,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  FileText,
  Copy,
  Check,
  Clock,
  Bot,
} from "lucide-react";
import type { DashboardViewProps } from "../_lib/types";
import type { ReviewSummaryResult } from "@/lib/fetch-attendance";
import { buildWeeklyTrendOption, buildTrendComparisonOption } from "../_lib/chart-options";
import { StatCard, StatCardSkeleton, CardSkeleton, ChartSkeleton, tipClass, getItemTitle } from "./dashboard-shared";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function GradeLeaderView({ data, loading }: DashboardViewProps) {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const ct = useChartTheme();
  const { locale } = useLocale();
  const itemTitle = (item: { code?: string | null; title: string }) => getItemTitle(item, ti);

  const managedGrade = session?.user?.managedGrade;
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
  const [progressExpanded, setProgressExpanded] = useState(false);

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

  // 图表配置 — 趋势图包含全校均线
  const gradeLabels = useMemo<Record<string, string>>(() => ({
    grade1Rate: t("gradeLabels.grade1Rate"),
    grade2Rate: t("gradeLabels.grade2Rate"),
    grade3Rate: t("gradeLabels.grade3Rate"),
    overallRate: t("gradeLabels.overallRate"),
  }), [t]);

  const gradeKeys = useMemo(() => {
    const keys = managedGrade != null ? [`grade${managedGrade}Rate`] : ["grade1Rate", "grade2Rate", "grade3Rate", "grade4Rate", "grade5Rate", "grade6Rate"];
    keys.push("overallRate");
    return keys;
  }, [managedGrade]);

  const weeklyTrendOption = useMemo(
    () => data?.weeklyTrend ? buildWeeklyTrendOption(data.weeklyTrend, ct, gradeLabels, gradeKeys) : null,
    [data?.weeklyTrend, ct, gradeLabels, gradeKeys]
  );

  const trendComparisonOption = useMemo(
    () => data?.aiAnalysis?.trendData ? buildTrendComparisonOption(data.aiAnalysis.trendData, ct, {
      compare: t("chartCompare"),
      thisWeek: t("chartThisWeek"),
      weekComparison: t("chartWeekComparison"),
      monthComparison: t("chartMonthComparison"),
    }) : null,
    [data?.aiAnalysis?.trendData, ct, t]
  );

  // 年级定位数据
  const gc = data?.gradeComparison;
  const positionLabel = gc
    ? gc.myRate > gc.schoolAvg ? t("gradePositionAbove")
      : gc.myRate < gc.schoolAvg ? t("gradePositionBelow")
        : t("gradePositionEqual")
    : "";

  // 检查项薄弱度对比（年级 vs 全校）
  const itemComparison = useMemo(() => {
    if (!data?.aiAnalysis?.weakAreas || !data?.schoolItemFailRates) return [];
    const schoolMap = new Map(data.schoolItemFailRates.map((i) => [i.title, i.failRate]));
    return data.aiAnalysis.weakAreas.map((area) => ({
      title: area.title,
      gradeRate: area.failRate,
      schoolRate: schoolMap.get(area.title) ?? 0,
      aboveSchool: area.failRate > (schoolMap.get(area.title) ?? 0),
    }));
  }, [data?.aiAnalysis?.weakAreas, data?.schoolItemFailRates]);

  return (
    <>
      {/* ===== A. 年级总览横幅 ===== */}
      {loading ? <div className="h-28 rounded-2xl bg-v-input border border-v-border animate-pulse" /> : (
        <HCard className="bg-v-card border border-v-border border-l-3 border-l-blue-500 overflow-hidden">
          <HCardBody className="px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-blue-500/15 p-3 shrink-0"><ClipboardCheck className="h-6 w-6 text-blue-400" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-sm font-medium text-v-text2">{t("todayCheckItems")}</p>
                  <span className="text-xl font-bold text-blue-400">{data?.todayPlannedItems?.length ?? data?.stats?.todayPlanItems ?? 0}</span>
                </div>
                {(data?.todayPlannedItems ?? data?.todayCheckItems)?.length ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(data?.todayPlannedItems ?? data?.todayCheckItems ?? []).map(item => (
                      <Chip key={item.id} size="md" classNames={{ base: "bg-blue-500/10 border border-blue-500/20", content: "text-v-text1 text-sm font-medium" }}>
                        <span className="font-mono mr-1 text-v-text3">{item.code ?? ti("dynamic")}</span>{itemTitle(item)}
                      </Chip>
                    ))}
                  </div>
                ) : <p className="text-v-text4 text-sm mb-3">{t("noPlannedItems")}</p>}
                {/* 内嵌核心指标摘要：已检班级 + 今日达标率(较昨日pp) */}
                {(() => {
                  const gk = managedGrade != null ? `grade${managedGrade}Rate` : "overallRate";
                  const trend = data?.weeklyTrend;
                  const todayRate = trend?.length ? ((trend[trend.length - 1] as Record<string, unknown>)[gk] as number ?? 0) : 0;
                  const yesterdayRate = trend && trend.length >= 2 ? ((trend[trend.length - 2] as Record<string, unknown>)[gk] as number ?? 0) : 0;
                  const dayDiff = todayRate - yesterdayRate;
                  return (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-v-text2">
                      <span>{t("checkedClasses")} <strong className="text-v-text1">{data?.stats?.scoredClasses ?? 0}/{data?.stats?.totalClasses ?? 0}</strong></span>
                      <span className="text-v-text4">·</span>
                      <span>{t("todayPassRate")} <strong className="text-v-text1">{todayRate}%</strong>
                        {trend && trend.length >= 2 && (
                          <span className={`ml-1 text-xs ${dayDiff > 0 ? "text-emerald-400" : dayDiff < 0 ? "text-red-400" : "text-v-text4"}`}>
                            {dayDiff > 0 ? "+" : ""}{dayDiff}pp
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </HCardBody>
        </HCard>
      )}

      {/* ===== B. 维度1：年级检查工作概况 ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></> : (
          <>
            {/* 已检查班级（可展开） */}
            <HCard className="bg-v-card border border-v-border border-l-3 border-l-emerald-500 overflow-hidden cursor-pointer select-none" isPressable onPress={() => setCheckedExpanded(!checkedExpanded)}>
              <HCardBody className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-v-text2">{t("checkedClasses")}</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{data?.stats?.scoredClasses ?? 0} <span className="text-base font-normal text-v-text3">/ {data?.stats?.totalClasses ?? 0}</span></p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/15 p-2.5">
                    {checkedExpanded ? <ChevronUp className="h-5 w-5 text-emerald-400" /> : <ChevronDown className="h-5 w-5 text-emerald-400" />}
                  </div>
                </div>
                {checkedExpanded && (
                  <div className="mt-3 pt-3 border-t border-v-border">
                    {data?.unscoredClasses?.length ? (
                      <div>
                        <p className="text-xs font-medium text-v-text3 mb-2">{t("unscoredClasses", { count: data.unscoredClasses.length })}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {data.unscoredClasses.map(cls => (
                            <Link key={cls.id} href="/scoring">
                              <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer", content: "text-v-text1 text-xs" }}>
                                {cls.name}
                              </Chip>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-400">{t("allClassesChecked")}</p>
                    )}
                  </div>
                )}
              </HCardBody>
            </HCard>
            {/* 本周达标率 */}
            <StatCard
              label={t("weekPassRate")}
              value={`${data?.stats?.weekPassRate ?? 0}%`}
              icon={Target}
              accent="violet"
              tooltip={
                <div>
                  <p className="font-medium text-v-text1 mb-1">{t("weekDailyDetail")}</p>
                  <p>{t("weekDailyStats", { passed: data?.stats?.weekPassed ?? 0, total: data?.stats?.weekTotal ?? 0 })}</p>
                  {data?.aiAnalysis?.trendData && (
                    <p className="mt-1 text-v-text3">{t("lastWeekRate", { rate: data.aiAnalysis.trendData.prevWeekRate })}</p>
                  )}
                </div>
              }
            />
            {/* AI 年级日报（三态，嵌入网格，高度自适应内容） */}
            <HCard className="bg-v-card border border-v-border border-l-3 border-l-indigo-500 overflow-hidden h-fit">
              <HCardBody className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-v-text2 flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-indigo-400" />{t("gradeAiReportTitle")}
                  </p>
                  {data?.gradeAiReport && (
                    <Chip size="sm" variant="flat" classNames={{ base: "bg-indigo-500/15 h-5", content: "text-indigo-400 text-[10px] px-1" }}>
                      {t("gradeAiReportAutoGen")}
                    </Chip>
                  )}
                </div>
                {(() => {
                  if (!data?.allClassesScored) {
                    return (
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-v-text1">{t("gradeAiReportPending")}</p>
                          <p className="text-[11px] text-v-text3 mt-0.5">{t("gradeAiReportPendingDesc")}</p>
                        </div>
                      </div>
                    );
                  }
                  if (!data?.gradeAiReport) {
                    return (
                      <div className="flex items-center gap-2 mt-1">
                        <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse shrink-0" />
                        <p className="text-sm text-v-text2">{t("gradeAiReportGenerating")}</p>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <p className="text-sm text-v-text1 leading-relaxed">{data.gradeAiReport}</p>
                      <div className="flex justify-end mt-2">
                        <button
                          className="flex items-center gap-1 text-[11px] text-v-text3 hover:text-v-text1 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(data.gradeAiReport!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copied ? t("gradeAiReportCopied") : t("gradeAiReportCopyBtn")}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </HCardBody>
            </HCard>
          </>
        )}
      </div>

      {/* 室外课出勤汇总 */}
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
                  onClick={() => setProgressExpanded((v) => !v)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-v-text3">考勤进度</p>
                    <ChevronDown className={`h-3.5 w-3.5 text-v-text4 transition-transform ${progressExpanded ? "rotate-180" : ""}`} />
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
              {progressExpanded && (
                <div>
                  <p className="text-sm font-medium text-v-text2 mb-2">未完成考勤班级</p>
                  {attendanceData.pendingClasses?.length ? (
                    <div className="space-y-1.5">
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

      {/* ===== 等级分布（独立卡片） ===== */}
      {!loading && (
        <Tooltip
          content={
            <div className={tipClass}>
              {data?.gradeDistributionClasses ? (<div className="space-y-1.5"><p className="font-medium text-v-text1 mb-1">{t("gradeDetailTitle")}</p>{(["A","B","C","unrated"] as const).map(g => { const names = data.gradeDistributionClasses?.[g]; if (!names?.length) return null; return <p key={g}><span className="font-medium text-v-text1 mr-1">{g === "unrated" ? t("unrated") : g}:</span>{names.join(locale === "zh" ? "、" : ", ")}</p>; })}</div>) : <p>{t("noGradeData")}</p>}
            </div>
          }
          placement="bottom"
          offset={6}
          classNames={{ content: "p-0 bg-transparent border-0 shadow-none" }}
        >
            <HCard className="bg-v-card border border-v-border cursor-pointer">
              <HCardBody className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-500/15 p-2.5"><Trophy className="h-5 w-5 text-amber-400" /></div>
                    <p className="text-sm font-semibold text-v-text1">{t("gradeDistribution")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" classNames={{ base: "bg-emerald-500/15 border-emerald-400/30", content: "text-emerald-400 text-xs font-medium" }}>A {data?.gradeDistribution?.A ?? 0}</Chip>
                    <Chip size="sm" classNames={{ base: "bg-blue-500/15 border-blue-400/30", content: "text-blue-400 text-xs font-medium" }}>B {data?.gradeDistribution?.B ?? 0}</Chip>
                    <Chip size="sm" classNames={{ base: "bg-amber-500/15 border-amber-400/30", content: "text-amber-400 text-xs font-medium" }}>C {data?.gradeDistribution?.C ?? 0}</Chip>
                    {(data?.gradeDistribution?.unrated ?? 0) > 0 && <Chip size="sm" classNames={{ base: "bg-v-hover border-v-border", content: "text-v-text3 text-xs font-medium" }}>{t("unrated")} {data?.gradeDistribution?.unrated}</Chip>}
                  </div>
                </div>
              </HCardBody>
            </HCard>
        </Tooltip>
      )}

      {/* 近7日达标率趋势（含全校均线） */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-4 pt-4 pb-2 md:px-6 md:pt-5 md:pb-3">
          <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />{t("trendTitleGrade", { grade: managedGrade ?? "" })}
          </h3>
        </HCardHeader>
        <HCardBody className="px-4 pb-4 md:px-6 md:pb-5">
          {loading ? <ChartSkeleton /> : weeklyTrendOption ? (
            <div className="h-48 md:h-72"><ReactECharts option={weeklyTrendOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>
          ) : <div className="h-64 flex items-center justify-center text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* ===== C. 维度2：班级穿透看板 ===== */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              {data?.weekMode === "school" && data?.schoolWeekNumber
                ? t("classRankingSchool", { week: data.schoolWeekNumber })
                : t("classRanking")}
            </h3>
            <p className="text-xs text-v-text4 mt-1">
              {data?.weekMode === "school" && data?.schoolWeekNumber
                ? t("classRankingRuleSchool", { week: data.schoolWeekNumber })
                : t("classRankingRule")}
            </p>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? <CardSkeleton /> : data?.aiAnalysis?.classRanking?.length ? (
            <div className="space-y-2">
              {data.aiAnalysis.classRanking.map((cls, i) => {
                const isExpanded = expandedClass === cls.name;
                const TrendIcon = cls.trend === "up" ? ArrowUpRight : cls.trend === "down" ? ArrowDownRight : Minus;
                const trendColor = cls.trend === "up" ? "text-emerald-400" : cls.trend === "down" ? "text-red-400" : "text-v-text4";
                return (
                  <div key={i} className="rounded-xl border border-v-border bg-v-thead overflow-hidden">
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-v-hover/50 transition-colors"
                      onClick={() => setExpandedClass(isExpanded ? null : cls.name)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-v-text4 w-5 text-right shrink-0">{i + 1}</span>
                        <span className="font-medium text-sm text-v-text1 truncate">{cls.name}</span>
                        {/* 标签 */}
                        {cls.isExcellent && (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/15 h-5", content: "text-emerald-400 text-[10px] px-1" }}>
                            {t("benchmarkLabel")}
                          </Chip>
                        )}
                        {cls.isWarning && (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-red-500/15 h-5", content: "text-red-400 text-[10px] px-1" }}>
                            {t("warningLabel")}
                          </Chip>
                        )}
                        {!cls.isExcellent && !cls.isWarning && cls.trend === "up" && (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-blue-500/15 h-5", content: "text-blue-400 text-[10px] px-1" }}>
                            {t("improvingLabel")}
                          </Chip>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* 趋势箭头 */}
                        <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
                        {/* 近4周等级序列 */}
                        {cls.recentGrades && cls.recentGrades.length > 0 && (
                          <div className="flex gap-0.5">
                            {cls.recentGrades.map((g, gi) => (
                              <span key={gi} className={`text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded ${
                                g === "A" ? "bg-emerald-500/20 text-emerald-400"
                                  : g === "C" ? "bg-red-500/20 text-red-400"
                                    : "bg-blue-500/20 text-blue-400"
                              }`}>{g}</span>
                            ))}
                          </div>
                        )}
                        {/* 达标率 */}
                        <Chip variant="flat" size="sm" classNames={{
                          base: cls.rate >= 85 ? "bg-emerald-500/20" : cls.rate >= 70 ? "bg-amber-500/20" : "bg-red-500/20",
                          content: cls.rate >= 85 ? "text-emerald-400 text-xs" : cls.rate >= 70 ? "text-amber-400 text-xs" : "text-red-400 text-xs",
                        }}>{cls.rate}%</Chip>
                        <ChevronDown className={`h-3.5 w-3.5 text-v-text4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    {/* 展开详情 */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-v-border/50">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-v-text3 mt-2">
                          {cls.prevRate != null && <span>{t("prevRate", { rate: cls.prevRate })}</span>}
                          {cls.trend && <span className={trendColor}>{cls.trend === "up" ? t("trendUp") : cls.trend === "down" ? t("trendDown") : t("trendStable")}</span>}
                          {cls.isExcellent && cls.recentGrades && (
                            <span className="text-emerald-400">{t("consecutiveA", { weeks: cls.recentGrades.filter(g => g === "A").length })}</span>
                          )}
                        </div>
                        {cls.failedItems && cls.failedItems.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-v-text4 mb-1">{t("failedItemsLabel")}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {cls.failedItems.map((fi, fii) => (
                                <Chip key={fii} size="sm" variant="flat" classNames={{ base: "bg-red-500/10", content: "text-red-400 text-[10px]" }}>
                                  {fi.code ?? "—"} {itemTitle(fi)}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <div className="text-center py-6 text-v-text4">{tc("noData")}</div>}
        </HCardBody>
      </HCard>

      {/* 流动红旗 + 显著进步 + 连续预警（精简标签行） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3"><h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><Flag className="h-5 w-5 text-emerald-400" />{t("redFlagTitle")}</h3><p className="text-xs text-v-text4 mt-0.5">{t("redFlagSubtitle")}</p></HCardHeader>
          <HCardBody className="px-6 pb-5">{loading ? <CardSkeleton /> : data?.excellentClasses?.length ? (<div className="flex flex-wrap gap-2">{data.excellentClasses.map(cls => (<Tooltip key={cls.id} content={<div className={tipClass}><p>{t("consecutiveAWeeks", { weeks: cls.weeks ?? 2 })}</p></div>} placement="bottom" offset={6} classNames={{ content: "p-0 bg-transparent border-0 shadow-none" }}><Chip variant="flat" size="md" classNames={{ base: "bg-emerald-500/20 border border-emerald-400/40 cursor-default", content: "text-emerald-300 font-medium" }} startContent={<CheckCircle2 className="h-4 w-4" />}>{cls.name}{cls.weeks && cls.weeks > 2 ? ` (${cls.weeks})` : ""}</Chip></Tooltip>))}</div>) : <div className="text-center py-6 text-v-text4">{t("noConsecutiveA")}</div>}</HCardBody>
        </HCard>
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3"><h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-400" />{t("improvingTitle")}</h3><p className="text-xs text-v-text4 mt-0.5">{t("improvingSubtitle")}</p></HCardHeader>
          <HCardBody className="px-6 pb-5">{loading ? <CardSkeleton /> : data?.improvedClasses?.length ? (<div className="flex flex-wrap gap-2">{data.improvedClasses.map(cls => (<Tooltip key={cls.classId} content={<div className={tipClass}><p>{t("gradeChange", { from: cls.from, to: cls.to })}</p></div>} placement="bottom" offset={6} classNames={{ content: "p-0 bg-transparent border-0 shadow-none" }}><Chip variant="flat" size="md" classNames={{ base: "bg-blue-500/20 border border-blue-400/40 cursor-default", content: "text-blue-300 font-medium" }} startContent={<TrendingUp className="h-4 w-4" />}>{cls.className} ({cls.from}→{cls.to})</Chip></Tooltip>))}</div>) : <div className="text-center py-6 text-v-text4">{t("noImprovement")}</div>}</HCardBody>
        </HCard>
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3"><h3 className="text-base font-semibold text-v-text1 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-400" />{t("warningTitle")}</h3><p className="text-xs text-v-text4 mt-0.5">{t("warningSubtitle")}</p></HCardHeader>
          <HCardBody className="px-6 pb-5">{loading ? <CardSkeleton /> : data?.warningClasses?.length ? (<div className="flex flex-wrap gap-2">{data.warningClasses.map(cls => (<Tooltip key={cls.classId} content={<div className={tipClass}><div className="space-y-1"><p className="font-medium text-v-text1">{t("consecutiveCWeeks", { weeks: cls.weeks ?? 2 })}</p>{cls.failedItems?.length ? (<><p className="text-v-text3">{t("failedItemsLabel")}</p>{cls.failedItems.map((item, idx) => <p key={idx} className="text-red-400"><span className="font-mono mr-1 text-v-text3">{item.code ?? ti("dynamic")}</span>{itemTitle(item)}</p>)}</>) : <p className="text-v-text3">{t("noFailedItems")}</p>}</div></div>} placement="bottom" offset={6} classNames={{ content: "p-0 bg-transparent border-0 shadow-none" }}><Chip variant="flat" size="md" classNames={{ base: "bg-red-500/20 border border-red-400/40 cursor-default", content: "text-red-300 font-medium" }} startContent={<AlertTriangle className="h-4 w-4" />}>{cls.className}{cls.weeks && cls.weeks > 2 ? ` (${cls.weeks})` : ""}</Chip></Tooltip>))}</div>) : <div className="text-center py-6 text-v-text4">{t("noConsecutiveC")}</div>}</HCardBody>
        </HCard>
      </div>

      {/* ===== D. 维度3：值日教师工作评估 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* D1: 教师活跃度 + 工作量 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />{t("dutyTeacherActivity")}
            </h3>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : data?.dutyTeacherStatus?.teachers?.length ? (
              <div className="space-y-2">
                {[...data.dutyTeacherStatus.teachers]
                  .sort((a, b) => b.scoredCount - a.scoredCount)
                  .slice(0, 3)
                  .map((dt) => (
                  <div key={dt.id} className="flex items-center justify-between p-3 rounded-xl border border-v-border bg-v-thead">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-v-text1 truncate">{dt.name}</span>
                      {dt.scoredCount > 0 ? (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/15", content: "text-emerald-400 text-xs" }}>
                          {t("dtScoredCount", { count: dt.scoredCount })}
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-v-hover", content: "text-v-text4 text-xs" }}>
                          {t("dtNotActive")}
                        </Chip>
                      )}
                      {dt.weekTotal != null && dt.weekTotal > 0 && (
                        <span className="text-[10px] text-v-text4">{t("dtWeekTotal", { count: dt.weekTotal })}</span>
                      )}
                    </div>
                    {dt.lastActiveAt && (
                      <span className="text-xs text-v-text4 shrink-0">
                        {new Date(dt.lastActiveAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : <div className="text-center py-6 text-v-text4">{t("noDutyTeachers")}</div>}
          </HCardBody>
        </HCard>

        {/* D2: 评分宽严度分析 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <Scale className="h-5 w-5 text-violet-400" />{t("teacherEvalTitle")}
            </h3>
            <p className="text-xs text-v-text4 mt-0.5">{t("teacherEvalDesc")}</p>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : data?.dutyTeacherStatus?.teachers?.length ? (
              <div className="space-y-3">
                {data.dutyTeacherStatus.schoolAvg14d != null && (
                  <p className="text-xs text-v-text3">{t("schoolAvgLabel", { rate: data.dutyTeacherStatus.schoolAvg14d })}</p>
                )}
                {[...data.dutyTeacherStatus.teachers]
                  .filter((dt) => dt.passRate14d != null)
                  .sort((a, b) => Math.abs(a.deviation ?? 999) - Math.abs(b.deviation ?? 999))
                  .slice(0, 3)
                  .map((dt) => {
                  const dev = dt.deviation ?? 0;
                  const devLabel = dev > 2 ? t("dtDeviationLenient") : dev < -2 ? t("dtDeviationStrict") : t("dtDeviationBalanced");
                  const devColor = dev > 2 ? "text-amber-400" : dev < -2 ? "text-blue-400" : "text-emerald-400";
                  const barValue = Math.min(Math.max(50 + dev * 2, 5), 95);
                  const barColor = dev > 2 ? "warning" : dev < -2 ? "primary" : "success";
                  return (
                    <div key={dt.id} className="p-3 rounded-xl border border-v-border bg-v-thead">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-v-text1">{dt.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-v-text2">{dt.passRate14d}%</span>
                          <span className={`text-[10px] font-medium ${devColor}`}>{dev > 0 ? "+" : ""}{dev}pp {devLabel}</span>
                        </div>
                      </div>
                      <Progress
                        size="sm"
                        value={barValue}
                        color={barColor as "warning" | "primary" | "success"}
                        className="h-1.5"
                        aria-label={`${dt.name} ${t("dtDeviationLabel")}`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-center py-6 text-v-text4">{t("noDutyTeachers")}</div>}
          </HCardBody>
        </HCard>
      </div>

      {/* 最近审核修正 */}
      {(data?.recentRevisions?.length ?? 0) > 0 && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />{t("recentRevisions")}
            </h3>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            <div className="space-y-2">
              {data!.recentRevisions!.map((rev) => (
                <div key={rev.id} className="p-3 rounded-xl border border-v-border bg-v-thead text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-v-text1">{rev.className}</span>
                    <span className="text-xs text-v-text4 font-mono">{rev.date}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-v-text3">
                    <span>{rev.checkItemCode ?? "—"} {rev.checkItemTitle}</span>
                    <span className="text-v-text4">|</span>
                    <span>{rev.originalPassed ? "✓" : "✗"} → {rev.passed ? "✓" : "✗"}</span>
                  </div>
                  <p className="text-xs text-v-text4 mt-1">
                    {t("revisedByAt", { name: rev.reviewedByName ?? "—", time: rev.reviewedAt ? new Date(rev.reviewedAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—" })}
                  </p>
                </div>
              ))}
            </div>
          </HCardBody>
        </HCard>
      )}

      {/* ===== E. 维度4：年级定位与对标 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* E1: 跨年级对比 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />{t("gradePositionTitle")}
            </h3>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : gc ? (
              <div className="space-y-4">
                {/* 核心指标 */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                  <div>
                    <p className="text-xs text-v-text3 mb-1">{t("myGradeRate", { rate: gc.myRate })}</p>
                    <p className="text-2xl font-bold text-v-text1">{gc.myRate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-v-text3 mb-1">{t("schoolAvgRate", { rate: gc.schoolAvg })}</p>
                    <Chip variant="flat" size="sm" classNames={{
                      base: gc.myRate > gc.schoolAvg ? "bg-emerald-500/15" : gc.myRate < gc.schoolAvg ? "bg-red-500/15" : "bg-v-hover",
                      content: gc.myRate > gc.schoolAvg ? "text-emerald-400 text-xs" : gc.myRate < gc.schoolAvg ? "text-red-400 text-xs" : "text-v-text3 text-xs",
                    }}>
                      {gc.myRate > gc.schoolAvg ? "+" : ""}{gc.myRate - gc.schoolAvg}pp {positionLabel}
                    </Chip>
                  </div>
                </div>
                {/* 各年级柱状展示 */}
                <div className="space-y-2">
                  {gc.grades.map((g) => {
                    const isMyGrade = g.grade === gc.myGrade;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-xs w-14 shrink-0 ${isMyGrade ? "font-bold text-cyan-400" : "text-v-text3"}`}>
                          {tc(`gradeNames.${g.grade}`)}
                        </span>
                        <div className="flex-1 h-5 bg-v-input rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isMyGrade ? "bg-cyan-500" : "bg-v-text4/30"}`}
                            style={{ width: `${Math.max(g.rate, 2)}%` }}
                          />
                        </div>
                        <span className={`text-xs w-10 text-right ${isMyGrade ? "font-bold text-cyan-400" : "text-v-text3"}`}>
                          {g.rate}%
                        </span>
                      </div>
                    );
                  })}
                  {/* 全校均值线 */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-14 shrink-0 text-v-text4">{t("gradeLabels.overallRate")}</span>
                    <div className="flex-1 h-5 bg-v-input rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500/40" style={{ width: `${Math.max(gc.schoolAvg, 2)}%` }} />
                    </div>
                    <span className="text-xs w-10 text-right text-v-text4">{gc.schoolAvg}%</span>
                  </div>
                </div>
              </div>
            ) : <div className="text-center py-6 text-v-text4">{tc("noData")}</div>}
          </HCardBody>
        </HCard>

        {/* E2: 检查项薄弱度对比 */}
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />{t("itemCompareTitle")}
            </h3>
            <p className="text-xs text-v-text4 mt-0.5">{t("itemCompareDesc")}</p>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {loading ? <CardSkeleton /> : itemComparison.length > 0 ? (
              <div className="space-y-2">
                {itemComparison.map((item, i) => (
                  <div key={i} className="p-3 rounded-xl border border-v-border bg-v-thead">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-v-text1">{item.title}</span>
                      {item.aboveSchool && (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-red-500/10 h-5", content: "text-red-400 text-[10px] px-1" }}>
                          {t("itemAboveSchool")}
                        </Chip>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-v-text4">{t("gradeRate", { rate: item.gradeRate })}</span>
                        </div>
                        <div className="h-1.5 bg-v-input rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.aboveSchool ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(item.gradeRate, 2)}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-v-text4">{t("schoolRate", { rate: item.schoolRate })}</span>
                        </div>
                        <div className="h-1.5 bg-v-input rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-v-text4/40" style={{ width: `${Math.max(item.schoolRate, 2)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-center py-6 text-v-text4">{t("noItemData")}</div>}
          </HCardBody>
        </HCard>
      </div>

      {/* ===== F. AI 智能分析（精简：趋势摘要 + 建议） ===== */}
      {data?.aiAnalysis?.trendData && (
        <HCard className="overflow-hidden bg-v-card border border-v-border">
          <HCardHeader className="px-4 py-3 md:px-6 md:py-4 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b border-v-border">
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-violet-400" /><h3 className="text-base font-semibold text-v-text1">{t("smartAnalysis")}</h3><Chip variant="flat" size="sm" classNames={{ base: "bg-blue-500/15", content: "text-blue-300 text-xs" }}>{t("fixedRule")}</Chip></div>
          </HCardHeader>
          <HCardBody className="px-4 py-4 md:px-6 md:py-5">
            <div className="space-y-4">
              {/* 趋势摘要 */}
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
                {trendComparisonOption && <div className="h-52 md:h-48 mt-4"><ReactECharts option={trendComparisonOption} style={{ height: "100%", width: "100%" }} theme="dark" opts={{ renderer: "svg" }} /></div>}
                <p className="text-xs text-v-text3 mt-2 leading-relaxed">{data.aiAnalysis.trendData.summary}</p>
              </div>

              {/* 建议 */}
              {data.aiAnalysis.recommendations?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <Lightbulb className="h-4 w-4 text-amber-400" />{t("recommendations")}
                  </h4>
                  <div className="space-y-2">
                    {data.aiAnalysis.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-xl border border-v-border bg-v-thead">
                        <Chip size="sm" variant="flat" classNames={{
                          base: rec.priority === "high" ? "bg-red-500/15 shrink-0" : "bg-amber-500/15 shrink-0",
                          content: rec.priority === "high" ? "text-red-400 text-[10px]" : "text-amber-400 text-[10px]",
                        }}>{rec.priority === "high" ? t("highPriority") : t("suggestionLabel")}</Chip>
                        <div>
                          <p className="text-sm font-medium text-v-text1">{rec.title}</p>
                          <p className="text-xs text-v-text3 mt-0.5">{rec.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </HCardBody>
        </HCard>
      )}

      {/* ===== G. 快捷操作栏 ===== */}
      <div className="flex justify-end gap-3">
        <HButton as={Link} href="/daily-plan" size="sm" variant="bordered" className="border-v-border text-v-text2" startContent={<Calendar className="h-4 w-4" />}>{t("quickPlan")}</HButton>
        <HButton as={Link} href="/weekly-review" size="sm" variant="bordered" className="border-v-border text-v-text2" startContent={<FileText className="h-4 w-4" />}>{t("quickWeeklyReview")}</HButton>
        <HButton as={Link} href="/scoring" size="sm" radius="full" className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white" endContent={<ChevronRight className="h-4 w-4" />}>{t("goToScoring")}</HButton>
      </div>
    </>
  );
}
