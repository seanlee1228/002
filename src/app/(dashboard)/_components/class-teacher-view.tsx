"use client";

// 班主任仪表盘视图

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Chip,
  Button as HButton,
} from "@heroui/react";
import {
  Target,
  TrendingUp,
  Trophy,
  CheckCircle2,
  XCircle,
  Circle,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useChartTheme } from "@/lib/echarts-theme";
import type { DashboardViewProps } from "../_lib/types";
import { StatCard, StatCardSkeleton, CardSkeleton, ChartSkeleton, getItemTitle } from "./dashboard-shared";
import type { AbsenceDetailResult, ReviewSummaryResult } from "@/lib/fetch-attendance";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function ClassTeacherView({ data, loading }: DashboardViewProps) {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const ct = useChartTheme();
  const itemTitle = (item: { code?: string | null; title: string }) => getItemTitle(item, ti);
  const [attendanceRange, setAttendanceRange] = useState<"day" | "week" | "month">("day");
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<{
    period?: { startDate: string; endDate: string };
    totalCourses: number;
    completedCourses: number;
    absentCount: number;
    completionRate: number;
    absentList?: Array<{ date: string; studentName: string; subject: string; periodNo: number }>;
    pendingSlots?: Array<{ date: string; subject: string; periodLabel: string }>;
    absenceDetail?: AbsenceDetailResult | null;
    reviewSummary?: ReviewSummaryResult | null;
  } | null>(null);
  const [progressExpanded, setProgressExpanded] = useState(false);

  const loadAttendance = useCallback(async (range: "day" | "week" | "month") => {
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const res = await fetch(`/api/attendance/class-summary?range=${range}`);
      if (!res.ok) throw new Error("fetch_failed");
      const json = await res.json();
      setAttendanceData({
        period: json.period,
        totalCourses: json.totalCourses ?? 0,
        completedCourses: json.completedCourses ?? 0,
        absentCount: json.absentCount ?? 0,
        completionRate: json.completionRate ?? 0,
        absentList: json.absentList ?? [],
        pendingSlots: json.pendingSlots ?? [],
        absenceDetail: json.absenceDetail ?? null,
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

  return (
    <>
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <StatCard
              label={t("todayPassRate")}
              value={`${data?.classPassRateToday ?? 0}%`}
              icon={Target}
              accent="blue"
            />
            <StatCard
              label={t("weekPassRateLabel")}
              value={`${data?.classPassRateWeek ?? 0}%`}
              icon={TrendingUp}
              accent="emerald"
            />
            <StatCard
              label={t("weekGradeLabel")}
              value={data?.classWeekGrade ?? t("unrated")}
              icon={Trophy}
              accent={
                data?.classWeekGrade === "A" ? "emerald"
                  : data?.classWeekGrade === "B" ? "blue"
                    : data?.classWeekGrade === "C" ? "amber"
                      : "violet"
              }
            />
          </>
        )}
      </div>

      {/* 室外课出勤 */}
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
              {/* 展开：未完成课次 */}
              {progressExpanded && (
                <div>
                  <p className="text-sm font-medium text-v-text2 mb-2">未完成课次</p>
                  {attendanceData.pendingSlots?.length ? (
                    <div className="space-y-1.5">
                      {attendanceData.pendingSlots.slice(0, 10).map((s, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm flex items-center justify-between">
                          <span className="text-v-text2">{s.date} · {s.subject}</span>
                          <span className="text-amber-400 text-xs">{s.periodLabel}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-400">所有课次考勤已完成 ✓</div>
                  )}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-v-text2 mb-2">{t("attendanceAbsentList")}</p>
                {attendanceData.absentList?.length ? (
                  <div className="space-y-2">
                    {attendanceData.absentList.slice(0, 6).map((item, idx) => (
                      <div key={`${item.date}-${item.studentName}-${idx}`} className="p-3 rounded-xl border border-v-border bg-v-thead text-sm text-v-text2">
                        {item.date} · {item.studentName} · {item.subject} P{item.periodNo}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-v-text4">{t("attendanceNoAbsentData")}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-v-text4">{t("attendanceNoData")}</div>
          )}
        </HCardBody>
      </HCard>

      {/* 学期缺勤预警 */}
      {!attendanceLoading && attendanceData?.absenceDetail && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1">学期缺勤预警</h3>
            <p className="text-xs text-v-text4 mt-1">
              {attendanceData.absenceDetail.startDate} ~ {attendanceData.absenceDetail.endDate}
            </p>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            {(() => {
              const visibleStudents = attendanceData.absenceDetail!.students.filter((s) => s.total > 0);
              if (!visibleStudents.length) {
                return <div className="text-sm text-v-text4">本学期暂无缺勤记录</div>;
              }
              return (
                <div className="space-y-2">
                  {visibleStudents.map((s) => (
                    <div
                      key={s.studentId}
                      className="flex items-center justify-between p-3 rounded-xl border border-v-border bg-v-thead text-sm"
                    >
                      <span className="font-medium text-v-text1">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-v-text3 text-xs">
                          缺席 {s.absentCount}
                          {s.lateCount > 0 ? ` · 迟到 ${s.lateCount}` : ""}
                        </span>
                        <Chip
                          variant="flat"
                          size="sm"
                          classNames={{
                            base:
                              s.warningLevel === "red"
                                ? "bg-red-500/20"
                                : s.warningLevel === "yellow"
                                  ? "bg-amber-500/20"
                                  : "bg-v-input",
                            content:
                              s.warningLevel === "red"
                                ? "text-red-400 text-xs"
                                : s.warningLevel === "yellow"
                                  ? "text-amber-400 text-xs"
                                  : "text-v-text4 text-xs",
                          }}
                        >
                          {s.total} 次
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </HCardBody>
        </HCard>
      )}

      {/* 课堂评价摘要 */}
      {!attendanceLoading && attendanceData?.reviewSummary && attendanceData.reviewSummary.totalReviews > 0 && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-semibold text-v-text1">课堂评价摘要</h3>
              <div className="flex items-center gap-2">
                <Chip
                  variant="flat"
                  size="sm"
                  classNames={{ base: "bg-blue-500/15", content: "text-blue-400 text-xs" }}
                >
                  纪律均分 {attendanceData.reviewSummary.disciplineAvg}
                </Chip>
                <Chip
                  variant="flat"
                  size="sm"
                  classNames={{ base: "bg-violet-500/15", content: "text-violet-400 text-xs" }}
                >
                  综合均分 {attendanceData.reviewSummary.overallAvg}
                </Chip>
              </div>
            </div>
          </HCardHeader>
          <HCardBody className="px-6 pb-5">
            <div className="space-y-4">
              {attendanceData.reviewSummary.trendByWeek.length > 1 && (
                <div>
                  <p className="text-sm font-medium text-v-text2 mb-2">按周趋势</p>
                  <div className="h-48">
                    <ReactECharts
                      option={{
                        ...ct,
                        tooltip: { trigger: "axis" },
                        legend: { data: ["纪律", "综合"], bottom: 0, textStyle: { fontSize: 11 } },
                        grid: { top: 10, bottom: 30, left: 30, right: 10, containLabel: true },
                        xAxis: {
                          type: "category",
                          data: attendanceData.reviewSummary.trendByWeek.map((w) => w.weekLabel),
                          axisLabel: { fontSize: 11 },
                        },
                        yAxis: { type: "value", min: 1, max: 5, interval: 1 },
                        series: [
                          {
                            name: "纪律",
                            type: "line",
                            smooth: true,
                            data: attendanceData.reviewSummary.trendByWeek.map((w) => w.disciplineAvg),
                          },
                          {
                            name: "综合",
                            type: "line",
                            smooth: true,
                            data: attendanceData.reviewSummary.trendByWeek.map((w) => w.overallAvg),
                          },
                        ],
                      }}
                      style={{ height: "100%", width: "100%" }}
                      theme="dark"
                      opts={{ renderer: "svg" }}
                    />
                  </div>
                </div>
              )}
              {attendanceData.reviewSummary.lowScoreAlerts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-v-text2 mb-2">低分预警</p>
                  <div className="space-y-2">
                    {attendanceData.reviewSummary.lowScoreAlerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-v-text2">
                            {alert.date} · {alert.subject} {alert.periodLabel}
                          </span>
                          <div className="flex gap-2 text-xs">
                            <span className="text-amber-400">纪律 {alert.discipline}</span>
                            <span className="text-red-400">综合 {alert.overall}</span>
                          </div>
                        </div>
                        {alert.improvements && (
                          <p className="text-xs text-v-text3 mt-1.5">{alert.improvements}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </HCardBody>
        </HCard>
      )}

      {/* 今日检查记录 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-v-text1">
            {t("todayRecords")}
          </h3>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? (
            <CardSkeleton />
          ) : data?.classRecords?.length ? (
            <div className="space-y-3">
              {data.classRecords.map((record, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 rounded-xl border border-v-border bg-v-thead hover:bg-v-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {record.passed === true ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    ) : record.passed === false ? (
                      <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-v-text4 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-v-text1">
                        {itemTitle(record.checkItem)}
                      </p>
                      {record.checkItem.code && (
                        <p className="text-sm text-v-text3">
                          {record.checkItem.code}
                        </p>
                      )}
                    </div>
                  </div>
                  <Chip
                    variant="flat"
                    size="sm"
                    classNames={{
                      base:
                        record.passed === true
                          ? "bg-emerald-500/20"
                          : record.passed === false
                            ? "bg-red-500/20"
                            : "bg-v-input",
                      content:
                        record.passed === true
                          ? "text-emerald-400"
                          : record.passed === false
                            ? "text-red-400"
                            : "text-v-text4",
                    }}
                  >
                    {record.passed === true
                      ? t("pass")
                      : record.passed === false
                        ? t("fail")
                        : t("unrated")}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-v-text4">
              {t("noRecordsToday")}
            </div>
          )}
        </HCardBody>
      </HCard>

      {/* AI 班级分析 */}
      <HCard className="overflow-hidden bg-v-card border border-v-border">
        <HCardHeader className="px-6 py-4 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b border-v-border">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-violet-400" />
            <h3 className="text-base font-semibold text-v-text1">{t("classSummaryTitle")}</h3>
            <Chip
              variant="flat"
              size="sm"
              classNames={{
                base: data?.aiAnalysis?.source === "llm" ? "bg-violet-500/15" : "bg-blue-500/15",
                content: data?.aiAnalysis?.source === "llm" ? "text-violet-300 text-xs" : "text-blue-300 text-xs",
              }}
            >
              {data?.aiAnalysis?.source === "llm" ? t("deepseekAi") : t("fixedRule")}
            </Chip>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 py-5">
          {loading ? (
            <CardSkeleton />
          ) : data?.aiAnalysis?.source === "llm" ? (
            <div className="space-y-5">
              {/* 班级总结 */}
              {data.aiAnalysis.classSummary && (
                <div className="p-4 rounded-xl border border-violet-500/15 bg-violet-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-violet-400" />
                    <h4 className="text-sm font-semibold text-v-text2">{t("classSummaryLabel")}</h4>
                  </div>
                  <p className="text-sm text-v-text1 leading-relaxed">{data.aiAnalysis.classSummary}</p>
                </div>
              )}

              {/* 改进建议 */}
              {data.aiAnalysis.classAdvice?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <Lightbulb className="h-4 w-4 text-blue-400" />
                    {t("improvementAdvice")}
                  </h4>
                  <div className="space-y-2">
                    {data.aiAnalysis.classAdvice.map((advice, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <span className="text-blue-400 font-medium mt-0.5">{i + 1}.</span>
                        <span className="text-sm text-v-text1">{advice}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 年级薄弱项参考 */}
              {data.aiAnalysis.weakAreas?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    {t("gradeWeakAreas")}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {data.aiAnalysis.weakAreas.map((area, i) => (
                      <Chip key={i} variant="bordered" size="sm" classNames={{
                        base: "border-amber-500/30",
                        content: "text-amber-400 text-xs",
                      }}>
                        {itemTitle({ code: (area as { code?: string | null; title: string }).code, title: area.title })} ({area.failRate}%)
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : data?.aiAnalysis ? (
            /* 固定规则模式：班级小结 */
            <div className="space-y-5">
              {data.aiAnalysis.classSummary && (
                <div className="p-4 rounded-xl border border-blue-500/15 bg-blue-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-v-text2">{t("classSummaryLabel")}</h4>
                  </div>
                  <p className="text-sm text-v-text1 leading-relaxed">{data.aiAnalysis.classSummary}</p>
                </div>
              )}
              {data.aiAnalysis.classAdvice?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <Lightbulb className="h-4 w-4 text-blue-400" />
                    {t("improvementAdvice")}
                  </h4>
                  <div className="space-y-2">
                    {data.aiAnalysis.classAdvice.map((advice, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <span className="text-blue-400 font-medium mt-0.5">{i + 1}.</span>
                        <span className="text-sm text-v-text1">{advice}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-center py-6 text-v-text4">{t("noAnalysis")}</p>
          )}
        </HCardBody>
      </HCard>
    </>
  );
}
