"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Chip,
  Button as HButton,
  Input as HInput,
  Select as HSelect,
  SelectItem as HSelectItem,
} from "@heroui/react";
import {
  CalendarDays,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
  Check,
  X,
  Flame,
  TrendingUp,
  Award,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Clock,
} from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons";

interface CheckRecord {
  id: string;
  date: string;
  passed: boolean | null;
  comment: string | null;
  class: { id: string; name: string; grade: number; section: number };
  checkItem: { id: string; code: string | null; title: string; description: string | null };
  createdAt: string;
}

interface ClassOption {
  id: string;
  name: string;
  grade: number;
  section: number;
}

interface DailySummary {
  date: string;
  count: number;
  passed: number;
  passRate: number;
}

interface HistoryData {
  records: CheckRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    totalScoredDays: number;
    totalRecordCount: number;
    distinctClasses: number;
    overallPassRate: number;
    avgClassesPerDay: number;
    streak: number;
    totalFailed: number;
    commentCount: number;
    commentWords: number;
    commentRate: number;
    severityDist: { minor: number; moderate: number; serious: number };
    improvements: Array<{
      className: string;
      checkItemCode: string | null;
      checkItemTitle: string;
      failDate: string;
      passDate: string;
      severity: string | null;
    }>;
    schoolPassRate14: number;
  };
  classesScored: ClassOption[];
  dailySummary: DailySummary[];
}

const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

// ==================== Encouragement message ====================
function getEncouragement(
  t: (key: string, params?: Record<string, unknown>) => string,
  summary: HistoryData["summary"]
): { text: string; color: string } {
  const { overallPassRate, streak, schoolPassRate14, avgClassesPerDay } = summary;
  const diff = overallPassRate - schoolPassRate14;

  if (streak >= 5) return { text: t("encourageStreak", { days: streak }), color: "text-amber-400" };
  if (diff >= 5 && overallPassRate >= 85) return { text: t("encourageAboveAvg"), color: "text-emerald-400" };
  if (avgClassesPerDay >= 8) return { text: t("encourageHardWorker"), color: "text-blue-400" };
  if (overallPassRate >= 90) return { text: t("encourageHighPass"), color: "text-emerald-400" };
  if (overallPassRate >= 75) return { text: t("encourageGoodJob"), color: "text-violet-400" };
  return { text: t("encourageKeepGoing"), color: "text-blue-400" };
}

export default function DutyHistoryPage() {
  const t = useTranslations("dutyHistory");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
  const { data: session, status } = useSession();
  const router = useRouter();

  const formatDateTime = useCallback(
    (isoStr: string) => {
      const d = new Date(isoStr);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return t("timeFormat", { month, day, hours, minutes });
    },
    [t]
  );

  const formatDate = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const weekday = t(`weekNames.${d.getDay()}`);
      return t("dateFormat", { month, day, weekday });
    },
    [t]
  );

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [passedFilter, setPassedFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"records" | "daily">("records");

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "DUTY_TEACHER") {
      router.push("/");
    }
  }, [status, session, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (classFilter && classFilter !== "all") params.set("classId", classFilter);
      if (passedFilter && passedFilter !== "all") params.set("passed", passedFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/scores/duty-history?${params.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      console.error("Failed to fetch duty history");
    } finally {
      setLoading(false);
    }
  }, [page, classFilter, passedFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "DUTY_TEACHER") {
      fetchData();
    }
  }, [status, session, fetchData]);

  if (status === "loading") {
    return <TablePageSkeleton />;
  }

  if (session?.user?.role !== "DUTY_TEACHER") return null;

  const managedGrade = session?.user?.managedGrade;
  const summary = data?.summary;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encouragement = summary ? getEncouragement(t as any, summary) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-v-text1 flex items-center gap-2">
          <History className="h-6 w-6 sm:h-7 sm:w-7 text-violet-400" />
          {managedGrade ? t("titleWithGrade", { grade: managedGrade }) : t("title")}
        </h1>
        <Chip variant="bordered" size="sm" classNames={{ base: "border-violet-500/30", content: "text-violet-400 text-xs" }}>
          {t("readOnly")}
        </Chip>
      </div>

      {/* Encouragement banner */}
      {encouragement && summary && summary.totalRecordCount > 0 && (
        <div className="bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-emerald-500/10 border border-violet-500/15 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Award className="h-5 w-5 text-amber-400 shrink-0" />
          <p className={`text-sm font-medium ${encouragement.color}`}>{encouragement.text}</p>
        </div>
      )}

      {/* Summary cards — Row 1: Core metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardBody className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-violet-400" />
              </div>
              <p className="text-xs text-v-text3">{t("totalDays")}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-v-text1">{summary?.totalScoredDays ?? 0}</p>
              <p className="text-xs text-v-text4">{t("dayUnit")}</p>
            </div>
            {summary && summary.streak > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <Flame className="h-3 w-3 text-amber-400" />
                <p className="text-xs text-amber-400">{t("streakDays", { days: summary.streak })}</p>
              </div>
            )}
          </HCardBody>
        </HCard>

        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardBody className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-xs text-v-text3">{t("totalRecords")}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-v-text1">{summary?.totalRecordCount ?? 0}</p>
              <p className="text-xs text-v-text4">{t("recordUnit")}</p>
            </div>
            {summary && summary.avgClassesPerDay > 0 && (
              <p className="text-xs text-v-text3 mt-1.5">{t("avgPerDay", { count: summary.avgClassesPerDay })}</p>
            )}
          </HCardBody>
        </HCard>

        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardBody className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-v-text3">{t("overallPassRate")}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-v-text1">{summary?.overallPassRate ?? 0}%</p>
            </div>
            {summary && (
              <div className="flex items-center gap-1 mt-1.5">
                <TrendingUp className="h-3 w-3 text-v-text4" />
                <p className="text-xs text-v-text3">{t("schoolAvg", { rate: summary.schoolPassRate14 })}</p>
              </div>
            )}
          </HCardBody>
        </HCard>

        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardBody className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-xs text-v-text3">{t("commentStats")}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-v-text1">{summary?.commentCount ?? 0}</p>
              <p className="text-xs text-v-text4">{t("commentCountUnit")}</p>
              <p className="text-xs text-v-text3 ml-1">({summary?.commentRate ?? 0}%)</p>
            </div>
            {summary && summary.commentWords > 0 && (
              <p className="text-xs text-v-text3 mt-1.5">{t("commentWordsTotal", { count: summary.commentWords })}</p>
            )}
          </HCardBody>
        </HCard>
      </div>

      {/* Summary Row 2: Improvements + Severity */}
      {summary && summary.totalRecordCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Improvement stories — classes that improved after being flagged */}
          <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
            <HCardBody className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-medium text-v-text1">{t("improvementTitle")}</p>
              </div>
              {summary.improvements.length > 0 ? (
                <div className="space-y-2.5">
                  {summary.improvements.map((item, idx) => {
                    const failMonth = new Date(item.failDate + "T00:00:00").getMonth() + 1;
                    const failDay = new Date(item.failDate + "T00:00:00").getDate();
                    const passMonth = new Date(item.passDate + "T00:00:00").getMonth() + 1;
                    const passDay = new Date(item.passDate + "T00:00:00").getDate();
                    return (
                      <div key={idx} className="bg-v-hover/40 rounded-xl px-3 py-2.5 border border-v-border">
                        <div className="flex items-center gap-2 mb-1">
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-blue-500/10", content: "text-blue-400 text-xs" }}>
                            {item.className}
                          </Chip>
                          {item.checkItemCode && (
                            <Chip size="sm" variant="flat" classNames={{ base: "bg-violet-500/10", content: "text-violet-400 text-xs font-mono" }}>
                              {item.checkItemCode}
                            </Chip>
                          )}
                        </div>
                        <p className="text-xs text-v-text2 mb-1.5 truncate">{itemTitle({ code: item.checkItemCode, title: item.checkItemTitle })}</p>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-red-400">{t("improveFail", { month: failMonth, day: failDay })}</span>
                          <ArrowRight className="h-3 w-3 text-v-text4" />
                          <span className="text-emerald-400">{t("improvePass", { month: passMonth, day: passDay })}</span>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-v-text3 text-center mt-1">{t("improvementSummary", { count: summary.improvements.length })}</p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-xs text-v-text4">{t("noImprovements")}</p>
                </div>
              )}
            </HCardBody>
          </HCard>

          {/* Severity distribution */}
          <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
            <HCardBody className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <X className="h-4 w-4 text-red-400" />
                <p className="text-sm font-medium text-v-text1">{t("failAnalysis")}</p>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <p className="text-2xl font-bold text-v-text1">{summary.totalFailed}</p>
                <p className="text-xs text-v-text4">{t("failItems")}</p>
                {summary.totalRecordCount > 0 && (
                  <p className="text-xs text-v-text3 ml-1">
                    ({Math.round((summary.totalFailed / summary.totalRecordCount) * 100)}%)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {(["minor", "moderate", "serious"] as const).map((level) => {
                  const count = summary.severityDist[level];
                  const total = summary.totalFailed || 1;
                  const pct = Math.round((count / total) * 100);
                  const colors = {
                    minor: { bar: "bg-amber-400", text: "text-amber-400" },
                    moderate: { bar: "bg-orange-400", text: "text-orange-400" },
                    serious: { bar: "bg-red-400", text: "text-red-400" },
                  };
                  return (
                    <div key={level} className="flex items-center gap-2">
                      <span className={`text-xs w-8 ${colors[level].text} font-medium`}>{t(`severity_${level}`)}</span>
                      <div className="flex-1 h-2 bg-v-hover rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors[level].bar} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-v-text3 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </HCardBody>
          </HCard>
        </div>
      )}

      {/* Filters */}
      <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
        <HCardBody className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <HSelect
              aria-label={t("classFilter")}
              placeholder={t("classFilter")}
              selectedKeys={[classFilter]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                if (val) { setClassFilter(val); setPage(1); }
              }}
              variant="bordered"
              size="sm"
              className="w-full sm:w-[160px]"
              classNames={{
                trigger: "border-v-border-input bg-v-input pe-8 rounded-xl",
                value: "text-v-text2 truncate",
                selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                listbox: "text-v-text1",
              }}
              items={[{ id: "all", name: t("allClasses") }, ...(data?.classesScored ?? []).map((c) => ({ id: c.id, name: c.name }))]}
            >
              {(item) => <HSelectItem key={item.id}>{item.name}</HSelectItem>}
            </HSelect>
            <HSelect
              aria-label={t("resultFilter")}
              placeholder={t("resultFilter")}
              selectedKeys={[passedFilter]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                if (val) { setPassedFilter(val); setPage(1); }
              }}
              variant="bordered"
              size="sm"
              className="w-full sm:w-[130px]"
              classNames={{
                trigger: "border-v-border-input bg-v-input pe-8 rounded-xl",
                value: "text-v-text2 truncate",
                selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                listbox: "text-v-text1",
              }}
              items={[
                { id: "all", name: t("allResults") },
                { id: "true", name: t("pass") },
                { id: "false", name: t("fail") },
              ]}
            >
              {(item) => <HSelectItem key={item.id}>{item.name}</HSelectItem>}
            </HSelect>
            <HInput
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              variant="bordered"
              size="sm"
              className="w-full sm:w-[150px]"
              classNames={{ inputWrapper: "border-v-border-input bg-v-input rounded-xl", input: "text-v-text2 placeholder:text-v-text4" }}
            />
            <HInput
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              variant="bordered"
              size="sm"
              className="w-full sm:w-[150px]"
              classNames={{ inputWrapper: "border-v-border-input bg-v-input rounded-xl", input: "text-v-text2 placeholder:text-v-text4" }}
            />
            <HButton
              variant="flat"
              size="sm"
              className="rounded-xl bg-v-hover text-v-text2 font-medium min-h-[36px]"
              startContent={<Search className="h-4 w-4" />}
              onPress={() => { setDateFrom(""); setDateTo(""); setClassFilter("all"); setPassedFilter("all"); setPage(1); }}
            >
              {t("reset")}
            </HButton>
            <div className="ml-auto flex gap-1.5">
              <HButton
                variant={viewMode === "records" ? "solid" : "flat"}
                size="sm"
                className={`rounded-xl font-medium min-h-[36px] ${viewMode === "records" ? "bg-blue-500 text-white" : "bg-v-hover text-v-text3"}`}
                onPress={() => setViewMode("records")}
              >
                {t("detailView")}
              </HButton>
              <HButton
                variant={viewMode === "daily" ? "solid" : "flat"}
                size="sm"
                className={`rounded-xl font-medium min-h-[36px] ${viewMode === "daily" ? "bg-blue-500 text-white" : "bg-v-hover text-v-text3"}`}
                onPress={() => setViewMode("daily")}
              >
                {t("dailySummaryView")}
              </HButton>
            </div>
          </div>
        </HCardBody>
      </HCard>

      {/* Records view — Card-based list for mobile, table for desktop */}
      {viewMode === "records" && (
        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardHeader className="px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1">{t("detailView")}</h3>
          </HCardHeader>
          <HCardBody className="px-5 pb-5">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
              </div>
            ) : data?.records.length ? (
              <>
                {/* Mobile: Card-based list */}
                <div className="space-y-3 sm:hidden">
                  {data.records.map((r) => (
                    <div key={r.id} className="bg-v-hover/40 rounded-xl p-3.5 border border-v-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-v-text4" />
                          <span className="text-xs text-v-text3">{formatDateTime(r.createdAt)}</span>
                        </div>
                        {r.passed === true ? (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/15", content: "text-emerald-400 text-xs" }}>
                            <Check className="h-3 w-3 inline mr-0.5" />{t("pass")}
                          </Chip>
                        ) : r.passed === false ? (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-red-500/15", content: "text-red-400 text-xs" }}>
                            <X className="h-3 w-3 inline mr-0.5" />{t("fail")}
                          </Chip>
                        ) : (
                          <span className="text-v-text4 text-xs">-</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-blue-500/10", content: "text-blue-400 text-xs" }}>
                          {r.class.name}
                        </Chip>
                        {r.checkItem.code && (
                          <Chip size="sm" variant="flat" classNames={{ base: "bg-violet-500/10", content: "text-violet-400 text-xs font-mono" }}>
                            {r.checkItem.code}
                          </Chip>
                        )}
                      </div>
                      <p className="text-sm text-v-text1 font-medium">{itemTitle(r.checkItem)}</p>
                      {r.comment && (
                        <p className="text-xs text-v-text3 mt-1.5 bg-v-hover/60 rounded-lg px-2.5 py-1.5">{r.comment}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop: Table */}
                <div className="hidden sm:block rounded-xl border border-v-border overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-v-border bg-v-thead">
                        <th className="px-4 py-3 text-left text-v-text3 font-medium w-[140px]">{t("colTime")}</th>
                        <th className="px-4 py-3 text-left text-v-text3 font-medium w-[100px]">{t("colClass")}</th>
                        <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colCheckItem")}</th>
                        <th className="px-4 py-3 text-center text-v-text3 font-medium w-[80px]">{t("colResult")}</th>
                        <th className="px-4 py-3 text-left text-v-text3 font-medium w-[200px]">{t("colComment")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-v-border">
                      {data.records.map((r) => (
                        <tr key={r.id} className="hover:bg-v-hover/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-v-text2 text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Chip variant="flat" size="sm" classNames={{ base: "bg-blue-500/10", content: "text-blue-400 text-xs whitespace-nowrap" }}>
                              {r.class.name}
                            </Chip>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {r.checkItem.code && (
                                <Chip size="sm" variant="flat" classNames={{ base: "bg-violet-500/10 shrink-0", content: "text-violet-400 text-xs font-mono" }}>
                                  {r.checkItem.code}
                                </Chip>
                              )}
                              <span className="text-v-text2 truncate">{itemTitle(r.checkItem)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.passed === true ? (
                              <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/15", content: "text-emerald-400 text-xs whitespace-nowrap" }}>
                                <Check className="h-3 w-3 inline mr-0.5" />{t("pass")}
                              </Chip>
                            ) : r.passed === false ? (
                              <Chip size="sm" variant="flat" classNames={{ base: "bg-red-500/15", content: "text-red-400 text-xs whitespace-nowrap" }}>
                                <X className="h-3 w-3 inline mr-0.5" />{t("fail")}
                              </Chip>
                            ) : (
                              <span className="text-v-text4">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-v-text3 text-xs block truncate">{r.comment || "-"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-v-text3">
                      {t("pagination", { total: data.pagination.totalCount, page: data.pagination.page, pages: data.pagination.totalPages })}
                    </p>
                    <div className="flex gap-2">
                      <HButton
                        variant="flat"
                        size="sm"
                        className="rounded-xl bg-v-hover text-v-text2 font-medium min-h-[36px]"
                        isDisabled={page <= 1}
                        startContent={<ChevronLeft className="h-4 w-4" />}
                        onPress={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        {t("prevPage")}
                      </HButton>
                      <HButton
                        variant="flat"
                        size="sm"
                        className="rounded-xl bg-v-hover text-v-text2 font-medium min-h-[36px]"
                        isDisabled={page >= data.pagination.totalPages}
                        endContent={<ChevronRight className="h-4 w-4" />}
                        onPress={() => setPage((p) => p + 1)}
                      >
                        {t("nextPage")}
                      </HButton>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-v-text4">{t("noRecords")}</div>
            )}
          </HCardBody>
        </HCard>
      )}

      {/* Daily summary view */}
      {viewMode === "daily" && (
        <HCard className="bg-v-card border border-v-border rounded-2xl shadow-sm">
          <HCardHeader className="px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-v-text1">{t("dailySummaryTitle")}</h3>
          </HCardHeader>
          <HCardBody className="px-5 pb-5">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
              </div>
            ) : data?.dailySummary.length ? (
              <>
                {/* Mobile: Card-based */}
                <div className="space-y-2.5 sm:hidden">
                  {data.dailySummary.map((d) => (
                    <div key={d.date} className="bg-v-hover/40 rounded-xl p-3.5 border border-v-border flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-v-text1">{formatDate(d.date)}</p>
                        <p className="text-xs text-v-text3 mt-0.5">{t("dailyRecordCount", { count: d.count, passed: d.passed })}</p>
                      </div>
                      <Chip
                        variant="flat"
                        size="sm"
                        classNames={{
                          base: d.passRate >= 80 ? "bg-emerald-500/15" : d.passRate >= 60 ? "bg-amber-500/15" : "bg-red-500/15",
                          content: d.passRate >= 80 ? "text-emerald-400 text-xs font-semibold" : d.passRate >= 60 ? "text-amber-400 text-xs font-semibold" : "text-red-400 text-xs font-semibold",
                        }}
                      >
                        {d.passRate}%
                      </Chip>
                    </div>
                  ))}
                </div>

                {/* Desktop: Table */}
                <div className="hidden sm:block rounded-xl border border-v-border overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-v-border bg-v-thead">
                        <th className="px-4 py-3 text-left text-v-text3 font-medium w-[160px]">{t("colDate")}</th>
                        <th className="px-4 py-3 text-center text-v-text3 font-medium w-[100px]">{t("colCount")}</th>
                        <th className="px-4 py-3 text-center text-v-text3 font-medium w-[100px]">{t("colPassed")}</th>
                        <th className="px-4 py-3 text-center text-v-text3 font-medium w-[120px]">{t("colPassRate")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-v-border">
                      {data.dailySummary.map((d) => (
                        <tr key={d.date} className="hover:bg-v-hover/50 transition-colors">
                          <td className="px-4 py-3 text-v-text2 whitespace-nowrap">{formatDate(d.date)}</td>
                          <td className="px-4 py-3 text-center text-v-text2">{d.count}</td>
                          <td className="px-4 py-3 text-center text-v-text1 font-semibold">{d.passed}</td>
                          <td className="px-4 py-3 text-center">
                            <Chip
                              variant="flat"
                              size="sm"
                              classNames={{
                                base: d.passRate >= 80 ? "bg-emerald-500/15" : d.passRate >= 60 ? "bg-amber-500/15" : "bg-red-500/15",
                                content: d.passRate >= 80 ? "text-emerald-400 text-xs font-semibold" : d.passRate >= 60 ? "text-amber-400 text-xs font-semibold" : "text-red-400 text-xs font-semibold",
                              }}
                            >
                              {d.passRate}%
                            </Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-v-text4">{t("noSummary")}</div>
            )}
          </HCardBody>
        </HCard>
      )}
    </div>
  );
}
