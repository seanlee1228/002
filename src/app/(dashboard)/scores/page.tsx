"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Button as HButton,
  Chip,
  Tabs as HTabs,
  Tab as HTab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Select as HSelect,
  SelectItem as HSelectItem,
} from "@heroui/react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Trophy,
  ChevronRight,
  Flag,
  AlertTriangle,
  ArrowUp,
} from "lucide-react";
import type { Period, Scope, ClassSummary, SummaryData, DetailData, ClassItem } from "./_lib/types";
import { DetailView } from "./_components/detail-view";
import { WeeklySummary } from "./_components/weekly-summary";
import { TablePageSkeleton } from "@/components/skeletons";

export default function ScoresPage() {
  const t = useTranslations("scores");
  const tc = useTranslations("common");
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<Period>("week");
  const [scope, setScope] = useState<Scope>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("1");
  const [classId, setClassId] = useState<string>("");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PERIOD_LABELS: Record<Period, string> = useMemo(
    () => ({
      week: t("periodWeek"),
      month: t("periodMonth"),
      year: t("periodYear"),
    }),
    [t]
  );

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";
  const isDutyTeacher = session?.user?.role === "DUTY_TEACHER";
  const isClassTeacher = session?.user?.role === "CLASS_TEACHER";

  useEffect(() => {
    if (status !== "authenticated") return;
    if (isAdmin || isGradeLeader || isDutyTeacher) {
      fetch("/api/classes")
        .then((res) => res.json())
        .then((data) => {
          const list = data?.classes ? data.classes : Array.isArray(data) ? data : [];
          setClasses(list);
          if (list.length > 0 && !classId) setClassId(list[0].id);
        })
        .catch(() => setClasses([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin, isGradeLeader, isDutyTeacher, tc]);

  const fetchData = useCallback(async () => {
    if (status !== "authenticated") return;

    if (isClassTeacher && session?.user?.classId) {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ classId: session.user.classId, period });
        const res = await fetch(`/api/scores/detail?${params}`);
        if (!res.ok) throw new Error(tc("loadFailed"));
        const json = await res.json();
        setDetailData(json);
        setSummaryData(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("loadFailed"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (scope === "class" && classId) {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ classId, period });
        const res = await fetch(`/api/scores/detail?${params}`);
        if (!res.ok) throw new Error(tc("loadFailed"));
        const json = await res.json();
        setDetailData(json);
        setSummaryData(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("loadFailed"));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope, period });
      if (scope === "grade") params.set("grade", gradeFilter);
      const res = await fetch(`/api/scores?${params}`);
      if (!res.ok) throw new Error(tc("loadFailed"));
      const json = await res.json();
      setSummaryData(json);
      setDetailData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, period, scope, gradeFilter, classId, isClassTeacher, session?.user?.classId, tc]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDrillDown = async (targetClassId: string) => {
    setDetailLoading(true);
    setDialogOpen(true);
    setDetailData(null);
    try {
      const params = new URLSearchParams({ classId: targetClassId, period });
      const res = await fetch(`/api/scores/detail?${params}`);
      if (!res.ok) throw new Error(tc("loadFailed"));
      const json = await res.json();
      setDetailData(json);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // 按等级分组 (must be before early return to obey Rules of Hooks)
  const gradeGroups = useMemo(() => {
    if (!summaryData?.classSummaries) return {};
    const groups: Record<string, ClassSummary[]> = { A: [], B: [], C: [], unrated: [] };
    for (const cls of summaryData.classSummaries) {
      const key = cls.latestGrade ?? "unrated";
      if (!groups[key]) groups[key] = [];
      groups[key].push(cls);
    }
    return groups;
  }, [summaryData?.classSummaries]);

  if (status === "loading" || status === "unauthenticated") {
    return <TablePageSkeleton />;
  }

  const excellentClasses = summaryData?.classSummaries?.filter((c) => c.isExcellent) ?? [];
  const warningClasses = summaryData?.classSummaries?.filter((c) => c.consecutiveWarnings) ?? [];
  const improvingClasses = summaryData?.classSummaries?.filter((c) => c.trend === "improving") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
        {isClassTeacher && session?.user?.className && (
          <p className="text-v-text3 mt-1">{session.user.className}</p>
        )}
      </div>

      {/* Controls */}
      {!isClassTeacher && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-v-text3 whitespace-nowrap">{t("scopeLabel")}</span>
              <HSelect
                aria-label={t("scopeSelect")}
                selectedKeys={[scope]}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as Scope;
                  if (val) setScope(val);
                }}
                variant="bordered"
                size="sm"
                className="w-[120px]"
                classNames={{
                  trigger: "border-v-border-input bg-v-input pe-8",
                  value: "text-v-text2 truncate",
                  selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                  popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                  listbox: "text-v-text1",
                }}
              >
                <HSelectItem key="all">{t("scopeAll")}</HSelectItem>
                <HSelectItem key="grade">{t("scopeGrade")}</HSelectItem>
                <HSelectItem key="class">{t("scopeClass")}</HSelectItem>
              </HSelect>
            </div>

            {scope === "grade" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-v-text3 whitespace-nowrap">{t("gradeLabel")}</span>
                <HSelect
                  aria-label={t("gradeSelect")}
                  selectedKeys={[gradeFilter]}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as string;
                    if (val) setGradeFilter(val);
                  }}
                  variant="bordered"
                  size="sm"
                  className="w-[120px]"
                  classNames={{
                    trigger: "border-v-border-input bg-v-input pe-8",
                    value: "text-v-text2 truncate",
                    selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                    popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                    listbox: "text-v-text1",
                  }}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <HSelectItem key={String(n)}>{tc(`gradeNames.${n}`)}</HSelectItem>
                  ))}
                </HSelect>
              </div>
            )}

            {scope === "class" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-v-text3 whitespace-nowrap">{t("classLabel")}</span>
                <HSelect
                  aria-label={t("classSelect")}
                  selectedKeys={classId ? [classId] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as string;
                    if (val) setClassId(val);
                  }}
                  variant="bordered"
                  size="sm"
                  className="w-[160px]"
                  classNames={{
                    trigger: "border-v-border-input bg-v-input pe-8",
                    value: "text-v-text2 truncate",
                    selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                    popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                    listbox: "text-v-text1",
                  }}
                >
                  {classes.map((c) => (
                    <HSelectItem key={c.id}>{c.name}</HSelectItem>
                  ))}
                </HSelect>
              </div>
            )}
          </div>

          <HTabs
            selectedKey={period}
            onSelectionChange={(key) => setPeriod(key as Period)}
            variant="bordered"
            size="sm"
            classNames={{
              tabList: "bg-v-input border-v-border",
              cursor: "bg-blue-500",
              tab: "text-v-text3",
              tabContent: "group-data-[selected=true]:text-white",
            }}
          >
            <HTab key="week" title={<span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />{t("periodWeek")}</span>} />
            <HTab key="month" title={<span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />{t("periodMonth")}</span>} />
            <HTab key="year" title={<span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />{t("periodYear")}</span>} />
          </HTabs>
        </div>
      )}

      {isClassTeacher && (
        <HTabs
          selectedKey={period}
          onSelectionChange={(key) => setPeriod(key as Period)}
          variant="bordered"
          size="sm"
          className="max-w-md"
          classNames={{
            tabList: "bg-v-input border-v-border w-full",
            cursor: "bg-blue-500",
            tab: "text-v-text3",
            tabContent: "group-data-[selected=true]:text-white",
          }}
        >
          <HTab key="week" title={t("periodWeek")} />
          <HTab key="month" title={t("periodMonth")} />
          <HTab key="year" title={t("periodYear")} />
        </HTabs>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-red-400">{error}</p>
          <HButton variant="bordered" size="sm" className="border-v-border-input text-v-text3" onPress={() => fetchData()}>
            {tc("retry")}
          </HButton>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-v-text4" />
        </div>
      ) : (
        <>
          {/* Summary view */}
          {summaryData && !isClassTeacher && scope !== "class" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <HCard className="bg-v-card border border-v-border">
                  <HCardBody className="p-4">
                    <p className="text-sm text-v-text3">{t("overallPassRate")}</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">{summaryData.overallPassRate}%</p>
                    <p className="text-xs text-v-text4 mt-0.5">{t("passedCount", { passed: summaryData.overallPassed, total: summaryData.overallTotal })}</p>
                  </HCardBody>
                </HCard>
                {excellentClasses.length > 0 && (
                  <HCard className="bg-v-card border border-v-border">
                    <HCardBody className="p-4">
                      <p className="text-sm text-v-text3 flex items-center gap-1"><Flag className="h-3.5 w-3.5 text-emerald-400" />{t("redFlag")}</p>
                      <p className="text-lg font-bold text-emerald-400 mt-1">{t("classCount", { count: excellentClasses.length })}</p>
                      <p className="text-xs text-v-text4 mt-0.5 truncate">{t("consecutiveA", { names: excellentClasses.map((c) => c.className).join("、") })}</p>
                    </HCardBody>
                  </HCard>
                )}
                {improvingClasses.length > 0 && (
                  <HCard className="bg-v-card border border-v-border">
                    <HCardBody className="p-4">
                      <p className="text-sm text-v-text3 flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5 text-blue-400" />{t("improving")}</p>
                      <p className="text-lg font-bold text-blue-400 mt-1">{t("classCount", { count: improvingClasses.length })}</p>
                      <p className="text-xs text-v-text4 mt-0.5 truncate">{improvingClasses.map((c) => c.className).join("、")}</p>
                    </HCardBody>
                  </HCard>
                )}
                {warningClasses.length > 0 && (
                  <HCard className="bg-v-card border border-v-border">
                    <HCardBody className="p-4">
                      <p className="text-sm text-v-text3 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" />{t("consecutiveWarning")}</p>
                      <p className="text-lg font-bold text-amber-400 mt-1">{t("classCount", { count: warningClasses.length })}</p>
                      <p className="text-xs text-v-text4 mt-0.5 truncate">{warningClasses.map((c) => c.className).join("、")}</p>
                    </HCardBody>
                  </HCard>
                )}
              </div>

              {/* Grade-grouped class table */}
              <HCard className="bg-v-card border border-v-border">
                <HCardHeader className="px-6 pt-5 pb-3">
                  <h3 className="text-base font-semibold text-v-text1 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-400" />
                    {t("classOverview", { period: PERIOD_LABELS[period] })}
                    {scope === "grade" && ` ${t("gradeFilter", { grade: gradeFilter })}`}
                  </h3>
                </HCardHeader>
                <HCardBody className="px-6 pb-5">
                  {summaryData.classSummaries.length === 0 ? (
                    <p className="text-center py-12 text-v-text4">{tc("noData")}</p>
                  ) : (
                    <>
                    {/* Mobile card list */}
                    <div className="md:hidden space-y-3">
                      {(["A", "B", "C", "unrated"] as const).map((gradeKey) => {
                        const groupClasses = gradeGroups[gradeKey] ?? [];
                        if (groupClasses.length === 0) return null;
                        const gradeLabel = gradeKey === "A" ? t("gradeExcellent") : gradeKey === "B" ? t("gradeGood") : gradeKey === "C" ? t("gradeWarning") : t("unrated");
                        const gradeStyle = gradeKey === "A"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : gradeKey === "B"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : gradeKey === "C"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-v-input text-v-text4 border-v-border";
                        return (
                          <div key={gradeKey}>
                            {/* Group header */}
                            <div className={`px-3 py-2 rounded-lg border ${gradeStyle} mb-2`}>
                              <span className="font-semibold text-sm">
                                {gradeLabel}
                              </span>
                              <span className="ml-2 text-xs opacity-75">{t("classCountInGroup", { count: groupClasses.length })}</span>
                            </div>
                            {/* Class cards */}
                            <div className="space-y-2">
                              {groupClasses.map((cls) => (
                                <div
                                  key={cls.classId}
                                  className="px-3 py-2.5 rounded-lg border border-v-border bg-v-card cursor-pointer active:bg-v-hover transition-colors"
                                  onClick={() => handleDrillDown(cls.classId)}
                                >
                                  {/* Row 1: class name + grade chip + trend + status + arrow */}
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <span className="font-medium text-sm text-v-text1 truncate">{cls.className}</span>
                                    {cls.latestGrade ? (
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        classNames={{
                                          base: `min-w-0 h-5 px-1.5 ${cls.latestGrade === "A" ? "bg-emerald-500/20" : cls.latestGrade === "B" ? "bg-blue-500/20" : "bg-amber-500/20"}`,
                                          content: `text-xs px-0 ${cls.latestGrade === "A" ? "text-emerald-400" : cls.latestGrade === "B" ? "text-blue-400" : "text-amber-400"}`,
                                        }}
                                      >
                                        {cls.latestGrade}
                                      </Chip>
                                    ) : null}
                                    {cls.trend === "improving" ? (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400 shrink-0">
                                        <TrendingUp className="h-3 w-3" /> {t("trendUp")}
                                      </span>
                                    ) : cls.trend === "declining" ? (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-red-400 shrink-0">
                                        <TrendingDown className="h-3 w-3" /> {t("trendDown")}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-v-text4 shrink-0">
                                        <Minus className="h-3 w-3" /> {t("trendStable")}
                                      </span>
                                    )}
                                    {cls.isExcellent && (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400 shrink-0">
                                        <Flag className="h-3 w-3" /> {t("flagLabel")}
                                      </span>
                                    )}
                                    {cls.consecutiveWarnings && (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-400 shrink-0">
                                        <AlertTriangle className="h-3 w-3" /> {t("warningLabel")}
                                      </span>
                                    )}
                                    <ChevronRight className="h-4 w-4 text-v-text4 ml-auto shrink-0" />
                                  </div>
                                  {/* Row 2: progress bar + percentage + count */}
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 rounded-full bg-v-input overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${cls.dailyPassRate}%`,
                                          backgroundColor: cls.dailyPassRate >= 90 ? "#10b981" : cls.dailyPassRate >= 75 ? "#3b82f6" : "#f59e0b",
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs font-mono text-v-text2 whitespace-nowrap">{cls.dailyPassRate}%</span>
                                    <span className="text-xs font-mono text-v-text4 whitespace-nowrap">{cls.dailyPassed}/{cls.dailyTotal}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-v-border bg-v-thead">
                            <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colClassName")}</th>
                            <th className="px-4 py-3 text-left text-v-text3 font-medium min-w-[100px]">{t("colPassRate")}</th>
                            <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colWeekGrade")}</th>
                            <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colTrend")}</th>
                            <th className="px-4 py-3 text-right text-v-text3 font-medium">{t("colPassedTotal")}</th>
                            <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colStatus")}</th>
                            <th className="px-4 py-3 w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["A", "B", "C", "unrated"] as const).map((gradeKey) => {
                            const groupClasses = gradeGroups[gradeKey] ?? [];
                            if (groupClasses.length === 0) return null;
                            const gradeLabel = gradeKey === "A" ? t("gradeExcellent") : gradeKey === "B" ? t("gradeGood") : gradeKey === "C" ? t("gradeWarning") : t("unrated");
                            const gradeStyle = gradeKey === "A"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : gradeKey === "B"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : gradeKey === "C"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-v-input text-v-text4 border-v-border";
                            return (
                              <React.Fragment key={gradeKey}>
                                {/* Group header */}
                                <tr>
                                  <td colSpan={7} className={`px-4 py-2 border-b border-t ${gradeStyle}`}>
                                    <span className="font-semibold text-sm">
                                      {gradeLabel}
                                    </span>
                                    <span className="ml-2 text-xs opacity-75">{t("classCountInGroup", { count: groupClasses.length })}</span>
                                  </td>
                                </tr>
                                {groupClasses.map((cls) => (
                                  <tr
                                    key={cls.classId}
                                    className="cursor-pointer hover:bg-v-hover transition-colors border-b border-v-border"
                                    onClick={() => handleDrillDown(cls.classId)}
                                  >
                                    <td className="px-4 py-3 font-medium text-v-text1">{cls.className}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2 min-w-[100px]">
                                        <div className="flex-1 h-2 rounded-full bg-v-input overflow-hidden">
                                          <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                              width: `${cls.dailyPassRate}%`,
                                              backgroundColor: cls.dailyPassRate >= 90 ? "#10b981" : cls.dailyPassRate >= 75 ? "#3b82f6" : "#f59e0b",
                                            }}
                                          />
                                        </div>
                                        <span className="text-v-text2 text-xs font-mono whitespace-nowrap w-10">{cls.dailyPassRate}%</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      {cls.latestGrade ? (
                                        <Chip
                                          size="sm"
                                          variant="flat"
                                          classNames={{
                                            base: cls.latestGrade === "A" ? "bg-emerald-500/20" : cls.latestGrade === "B" ? "bg-blue-500/20" : "bg-amber-500/20",
                                            content: cls.latestGrade === "A" ? "text-emerald-400" : cls.latestGrade === "B" ? "text-blue-400" : "text-amber-400",
                                          }}
                                        >
                                          {cls.latestGrade}
                                        </Chip>
                                      ) : (
                                        <span className="text-v-text4">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      {cls.trend === "improving" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                          <TrendingUp className="h-3.5 w-3.5" /> {t("trendUp")}
                                        </span>
                                      ) : cls.trend === "declining" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-red-400">
                                          <TrendingDown className="h-3.5 w-3.5" /> {t("trendDown")}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-v-text4">
                                          <Minus className="h-3.5 w-3.5" /> {t("trendStable")}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-v-text2">{cls.dailyPassed}/{cls.dailyTotal}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {cls.isExcellent && (
                                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400" title={t("redFlagTitle")}>
                                            <Flag className="h-3.5 w-3.5" /> {t("flagLabel")}
                                          </span>
                                        )}
                                        {cls.consecutiveWarnings && (
                                          <span className="inline-flex items-center gap-1 text-xs text-amber-400" title={t("warningTitle")}>
                                            <AlertTriangle className="h-3.5 w-3.5" /> {t("warningLabel")}
                                          </span>
                                        )}
                                        {!cls.isExcellent && !cls.consecutiveWarnings && (
                                          <span className="text-v-text4">—</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <ChevronRight className="h-4 w-4 text-v-text4" />
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </HCardBody>
              </HCard>
            </div>
          )}

          {/* Detail view */}
          {((scope === "class" && !isClassTeacher) || isClassTeacher) && detailData && (
            <DetailView data={detailData} period={period} />
          )}
        </>
      )}

      {/* 周汇总检查报告（ADMIN / GRADE_LEADER） */}
      {(isAdmin || isGradeLeader) && (
        <WeeklySummary />
      )}

      {/* Drill-down modal */}
      <Modal
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-v-card border border-v-border my-2 sm:my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh]",
          header: "border-b border-v-border shrink-0",
          body: "overflow-y-auto",
          wrapper: "items-center sm:items-center overflow-hidden",
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="text-v-text1">
                {detailData
                  ? t("detailTitle", { className: detailData.className, period: PERIOD_LABELS[period] })
                  : tc("loading")}
              </ModalHeader>
              <ModalBody className="pb-6">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-v-text4" />
                  </div>
                ) : detailData ? (
                  <DetailView data={detailData} period={period} compact />
                ) : (
                  <p className="text-center py-8 text-v-text4">{tc("loadFailed")}</p>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
