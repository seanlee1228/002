"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TabPageSkeleton, ContentSkeleton } from "@/components/skeletons";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Input,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tabs,
  Tab,
} from "@heroui/react";
import {
  CalendarCheck,
  Sparkles,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Calendar,

  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  ListChecks,
} from "lucide-react";

// ========== Types ==========

interface CheckItem {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  isDynamic: boolean;
}

interface DailyPlanItem {
  id: string;
  sortOrder: number;
  checkItem: CheckItem;
}

interface DailyPlan {
  id: string;
  date: string;
  targetGrade: number | null;
  items: DailyPlanItem[];
  createdBy?: { name: string; username: string };
}

interface SuggestionItem {
  checkItemId: string;
  code: string | null;
  title: string;
  description: string | null;
  score: number;
  failRate: number;
  daysSinceLastCheck: number;
  reasons: string[];
  recommended: boolean;
}

interface DailyPlanResponse {
  date: string;
  plans: DailyPlan[];
  dynamicItems: CheckItem[];
  fixedItems: CheckItem[];
}

interface SuggestResponse {
  date: string;
  suggestions: SuggestionItem[];
  recommended: SuggestionItem[];
  dataPoints: number;
  message: string;
  source?: "llm" | "fallback";
}

interface WeekSchedule {
  week: number;
  label: string;
  dateRange: string;
  days: number;
  items: string[];
  residentCodes: string[];
  generated: boolean;
  note?: string;
}

interface ScheduleOverviewResponse {
  calendar: {
    semester: string;
    semesterName: string;
    startDate: string;
    endDate: string;
  };
  resident: { code: string | null; title: string }[];
  weekSchedules: WeekSchedule[];
  stats: { totalDays: number; generatedDays: number };
  currentWeek: number | null;
}

interface AdjustSuggestion {
  type: "promote" | "demote";
  itemId: string;
  code: string;
  title: string;
  reason: string;
  data: { failRate: number };
}

interface RecommendedItem {
  id: string;
  code: string | null;
  title: string;
  isResident: boolean;
  score: number;
  reasons: string[];
}

interface Deviation {
  code: string;
  type: "added" | "removed";
  reason: string;
}

interface WeekRecommendation {
  weekNumber: number;
  recommended: RecommendedItem[];
  semesterBaseline: string[];
  deviations: Deviation[];
  dataConfidence: "high" | "medium" | "low";
}

interface WeekDayPlan {
  date: string;
  weekday: string;
  week: number;
  plan: { id: string; items: { code: string | null; title: string; isResident: boolean }[] } | null;
  source: "generated" | "manual" | "none";
}

function formatDateStr(date: Date) {
  return date.toLocaleDateString("en-CA");
}

const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

// ========== 学期排期 Tab ==========

function SemesterScheduleTab({ readonly = false }: { readonly?: boolean }) {
  const t = useTranslations("dailyPlan");
  const ti = useTranslations("checkItems");
  const tc = useTranslations("common");

  const [overview, setOverview] = useState<ScheduleOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [adjustSuggestions, setAdjustSuggestions] = useState<AdjustSuggestion[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [expandedDays, setExpandedDays] = useState<WeekDayPlan[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);

  // 常驻项维护
  const [residentModalOpen, setResidentModalOpen] = useState(false);
  const [allFixedItems, setAllFixedItems] = useState<{ id: string; code: string | null; title: string; planCategory: string | null }[]>([]);
  const [selectedResidentIds, setSelectedResidentIds] = useState<Set<string>>(new Set());
  const [residentSaving, setResidentSaving] = useState(false);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/daily-plan/schedule-overview", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(tc("loadFailed"));
      const data: ScheduleOverviewResponse = await res.json();
      setOverview(data);
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("loadFailed"));
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAdjustSuggestions = useCallback(async () => {
    try {
      const currentWeekNum = overview?.currentWeek || 1;
      const res = await fetch(`/api/daily-plan/week-recommend?week=${currentWeekNum}`);
      if (res.ok) {
        const data = await res.json();
        setAdjustSuggestions(data.adjustSuggestions || []);
      }
    } catch {
      // silent
    }
  }, [overview?.currentWeek]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => { if (overview) fetchAdjustSuggestions(); }, [overview, fetchAdjustSuggestions]);

  const handleAdoptSuggestion = async (suggestion: AdjustSuggestion) => {
    try {
      const newCategory = suggestion.type === "promote" ? "resident" : "rotating";
      const res = await fetch(`/api/inspection/${suggestion.itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCategory: newCategory }),
      });
      if (!res.ok) throw new Error(tc("updateFailed"));
      setAdjustSuggestions((prev) => prev.filter((s) => s.itemId !== suggestion.itemId));
      await fetchOverview(true);
      showAlert("success", tc("updateSuccess"));
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("operationFailed"));
    }
  };

  // 打开常驻项维护弹窗
  const openResidentModal = async () => {
    try {
      const res = await fetch("/api/inspection", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items = (data.fixedItems || [])
          .filter((i: { isActive: boolean; module: string }) => i.isActive && i.module === "DAILY")
          .map((i: { id: string; code: string | null; title: string; planCategory: string | null }) => ({
            id: i.id, code: i.code, title: i.title, planCategory: i.planCategory,
          }));
        setAllFixedItems(items);
        // 按 overview 中的常驻项列表预选（而非仅靠 planCategory 字段）
        const residentCodes = new Set(overview?.resident.map((r) => r.code) ?? []);
        const preSelected = items.filter((i: { code: string | null }) => i.code && residentCodes.has(i.code)).map((i: { id: string }) => i.id);
        setSelectedResidentIds(new Set(preSelected));
      }
    } catch {
      // silent
    }
    setResidentModalOpen(true);
  };

  const toggleResidentItem = (id: string) => {
    setSelectedResidentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) {
          showAlert("error", t("residentMax"));
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const saveResidentItems = async () => {
    setResidentSaving(true);
    try {
      // 简单明确的策略：
      // 1. 选中的 → planCategory: "resident"
      // 2. 未选中的 → planCategory: "rotating"（强制覆盖自动分类）
      // 每个 item 都发一次 PUT，确保数据库状态与用户选择完全一致
      const updates: Promise<Response>[] = [];
      for (const item of allFixedItems) {
        const shouldBeResident = selectedResidentIds.has(item.id);
        const targetCategory = shouldBeResident ? "resident" : "rotating";
        // 跳过已经和目标一致的项
        if (item.planCategory === targetCategory) continue;
        updates.push(
          fetch(`/api/inspection/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planCategory: targetCategory }),
          })
        );
      }
      // 并行发送，全部等待
      const results = await Promise.all(updates);
      // 检查是否有失败
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        console.error("saveResidentItems: failed PUTs", failed.length);
        throw new Error(t("residentSaveFailed"));
      }
      setResidentModalOpen(false);
      await fetchOverview(true); // 静默刷新，不闪加载状态
      showAlert("success", t("residentSaved"));
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("residentSaveFailed"));
    } finally {
      setResidentSaving(false);
    }
  };

  const toggleExpand = async (weekNum: number) => {
    if (expandedWeek === weekNum) {
      setExpandedWeek(null);
      setExpandedDays([]);
      return;
    }
    setExpandedWeek(weekNum);
    setExpandLoading(true);
    try {
      // 展开双周
      const weeks = [weekNum];
      if (weekNum % 2 === 1 && overview?.weekSchedules.find((w) => w.week === weekNum + 1)) {
        weeks.push(weekNum + 1);
      } else if (weekNum % 2 === 0 && overview?.weekSchedules.find((w) => w.week === weekNum - 1)) {
        weeks.unshift(weekNum - 1);
      }
      const res = await fetch(`/api/daily-plan/week?week=${weeks.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedDays(data.days || []);
      }
    } catch {
      // silent
    } finally {
      setExpandLoading(false);
    }
  };

  const itemLabel = (code: string) => {
    if (CHECK_CODES.includes(code)) return `${code} ${ti(code)}`;
    return code;
  };

  if (loading) {
    return <ContentSkeleton rows={4} />;
  }

  if (!overview) {
    return (
      <div className="text-center text-v-text3 py-12">{tc("loadFailed")}</div>
    );
  }

  // 将周次两两配对
  const pairedWeeks: WeekSchedule[][] = [];
  const ws = overview.weekSchedules;
  for (let i = 0; i < ws.length; i += 2) {
    pairedWeeks.push(ws.slice(i, Math.min(i + 2, ws.length)));
  }

  const suggestItemIds = new Set(adjustSuggestions.map((s) => s.code));

  return (
    <div className="space-y-6">
      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto flex items-center gap-2 ${
              alert.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
                : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
            }`}
          >
            {alert.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {alert.message}
          </div>
        </div>
      )}

      {/* 智能调整建议卡片（只读模式隐藏） */}
      {!readonly && adjustSuggestions.length > 0 && (
        <Card className="bg-v-card border border-amber-500/30">
          <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-semibold text-v-text1 truncate">{t("adjustSuggestTitle")}</h2>
            </div>
            <Chip variant="flat" size="sm" classNames={{ base: "bg-amber-500/15", content: "text-amber-400 text-xs" }}>
              {t("adjustSuggestHint")}
            </Chip>
          </CardHeader>
          <CardBody className="pt-0 space-y-2">
            {adjustSuggestions.map((s) => (
              <div key={s.itemId} className="p-3 rounded-lg bg-v-hover/50 border border-v-border/50 space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  {s.type === "promote" ? (
                    <ArrowUpCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span className="font-medium text-v-text1 break-words min-w-0">{itemLabel(s.code)}</span>
                </div>
                <p className="text-sm text-v-text3">{s.reason}</p>
                <button
                  className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    s.type === "promote"
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-amber-500 hover:bg-amber-600 text-white"
                  }`}
                  onClick={() => handleAdoptSuggestion(s)}
                >
                  {t("adjustAdopt")}
                </button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Semester info + resident items */}
      <Card className="bg-v-card border border-v-border overflow-hidden">
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-v-text1 truncate">{overview.calendar.semesterName}</h2>
              <p className="text-sm text-v-text3 mt-0.5">
                {overview.calendar.startDate} ~ {overview.calendar.endDate}
              </p>
            </div>
            {overview.currentWeek && (
              <Chip
                variant="flat" size="md"
                classNames={{ base: "bg-blue-500/15", content: "text-blue-400 font-medium" }}
              >
                {t("currentWeekLabel", { week: overview.currentWeek })}
              </Chip>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-v-text2">{t("residentItems")}</p>
              {!readonly && (
                <Button size="sm" variant="flat" radius="full" onPress={openResidentModal}
                  startContent={<Pencil className="h-3 w-3" />}
                  className="text-v-text3 hover:text-v-text1"
                >
                  {t("manageResident")}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {overview.resident.map((r) => (
                <Chip key={r.code} variant="flat" size="sm"
                  classNames={{ base: "bg-emerald-500/15 max-w-full", content: "text-emerald-400 text-xs truncate" }}
                >
                  {r.code} {r.code && CHECK_CODES.includes(r.code) ? ti(r.code) : r.title}
                </Chip>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Schedule — mobile card list */}
      <Card className="bg-v-card border border-v-border md:hidden overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <h2 className="text-base sm:text-lg font-semibold text-v-text1">{t("scheduleTable")}</h2>
        </CardHeader>
        <CardBody className="pt-0 space-y-2">
          {pairedWeeks.map((pair) => {
            const firstWeek = pair[0];
            const lastWeek = pair[pair.length - 1];
            const totalDays = pair.reduce((s, w) => s + w.days, 0);
            const allGenerated = pair.every((w) => w.generated);
            const notes = pair.map((w) => w.note).filter(Boolean);
            const isCurrentPair = pair.some(
              (w) => overview.currentWeek !== null && w.week === overview.currentWeek
            );
            const isExpanded = pair.some((w) => w.week === expandedWeek);
            const residentCodesSet = new Set(firstWeek.residentCodes || overview.resident.map((r) => r.code));
            const weekLabel = pair.length > 1
              ? `Wk ${firstWeek.week}-${lastWeek.week}`
              : `Wk ${firstWeek.week}`;
            const dateRange = pair.length > 1
              ? `${firstWeek.dateRange.split("~")[0]}~${lastWeek.dateRange.split("~")[1]}`
              : firstWeek.dateRange;

            return (
              <Fragment key={firstWeek.week}>
                <div
                  onClick={() => toggleExpand(firstWeek.week)}
                  className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                    isCurrentPair ? "border-blue-500/40 bg-blue-500/5" : "border-v-border/50 hover:bg-v-hover/50"
                  } ${isExpanded ? "bg-v-hover/30" : ""}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 shrink">
                      <span className="font-medium text-sm text-v-text1 shrink-0">{weekLabel}</span>
                      {isCurrentPair && <span className="text-blue-400 text-xs shrink-0">●</span>}
                      <span className="text-xs text-v-text3 shrink-0">{totalDays}{t("dayUnit")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {notes.length > 0 ? (
                        <Chip variant="flat" size="sm" classNames={{ base: "bg-amber-500/15 max-w-[120px]", content: "text-amber-400 text-xs truncate" }}>
                          {notes.join(", ")}
                        </Chip>
                      ) : allGenerated ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-v-text3" /> : <ChevronDown className="h-4 w-4 text-v-text3" />}
                    </div>
                  </div>
                  <p className="text-xs text-v-text3 mb-2">{dateRange}</p>
                  <div className="flex flex-wrap gap-1">
                    {firstWeek.items.map((code) => {
                      const isResident = residentCodesSet.has(code);
                      const hasSuggestion = suggestItemIds.has(code);
                      return (
                        <Chip key={code} variant="flat" size="sm"
                          classNames={{
                            base: `${isResident ? "bg-emerald-500/15" : "bg-default-100"} ${hasSuggestion ? "ring-1 ring-amber-500/50" : ""} max-w-full`,
                            content: `${isResident ? "text-emerald-400" : "text-v-text2"} text-xs truncate`,
                          }}
                        >
                          {itemLabel(code)}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
                {/* Inline expansion */}
                {isExpanded && (
                  <div className="bg-v-hover/20 border border-v-border/30 rounded-lg px-3 py-3">
                    {expandLoading ? (
                      <div className="flex items-center justify-center py-6"><Spinner size="sm" color="primary" /></div>
                    ) : expandedDays.length === 0 ? (
                      <p className="text-v-text3 text-sm py-4 text-center">{t("dayPlanNone")}</p>
                    ) : (
                      <div className="space-y-2">
                        {expandedDays.map((day) => (
                          <div key={day.date} className="bg-v-card border border-v-border/50 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-v-text1">{day.weekday} {day.date.slice(5)}</span>
                              {day.plan ? (
                                <Chip variant="flat" size="sm" classNames={{ base: "bg-emerald-500/10", content: "text-emerald-400 text-xs" }}>{t("dayPlanStatus")}</Chip>
                              ) : (
                                <Chip variant="flat" size="sm" classNames={{ base: "bg-default-100", content: "text-v-text4 text-xs" }}>{t("dayPlanNone")}</Chip>
                              )}
                            </div>
                            {day.plan && (
                              <div className="flex flex-wrap gap-1">
                                {day.plan.items.map((item) => (
                                  <Chip key={item.code} variant="flat" size="sm"
                                    classNames={{
                                      base: item.isResident ? "bg-emerald-500/15" : "bg-default-100",
                                      content: `${item.isResident ? "text-emerald-400" : "text-v-text2"} text-xs`,
                                    }}
                                  >{item.code || "?"}</Chip>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}
        </CardBody>
      </Card>

      {/* Schedule — desktop table */}
      <Card className="bg-v-card border border-v-border hidden md:block">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <h2 className="text-lg font-semibold text-v-text1">{t("scheduleTable")}</h2>
        </CardHeader>
        <CardBody className="pt-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-v-border text-v-text3">
                <th className="text-left py-3 px-3 font-medium">{t("colWeeks")}</th>
                <th className="text-left py-3 px-3 font-medium">{t("colDateRange")}</th>
                <th className="text-left py-3 px-3 font-medium">{t("colCheckItems")}</th>
                <th className="text-center py-3 px-3 font-medium">{t("colDays")}</th>
                <th className="text-center py-3 px-3 font-medium">{t("colStatus")}</th>
                <th className="text-center py-3 px-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {pairedWeeks.map((pair) => {
                const firstWeek = pair[0];
                const lastWeek = pair[pair.length - 1];
                const totalDays = pair.reduce((s, w) => s + w.days, 0);
                const allGenerated = pair.every((w) => w.generated);
                const notes = pair.map((w) => w.note).filter(Boolean);
                const isCurrentPair = pair.some(
                  (w) => overview.currentWeek !== null && w.week === overview.currentWeek
                );
                const isExpanded = pair.some((w) => w.week === expandedWeek);

                const residentCodesSet = new Set(firstWeek.residentCodes || overview.resident.map((r) => r.code));

                return (
                  <Fragment key={firstWeek.week}>
                    <tr
                      onClick={() => toggleExpand(firstWeek.week)}
                      className={`border-b border-v-border/50 hover:bg-v-hover/50 transition-colors cursor-pointer ${
                        isCurrentPair ? "bg-blue-500/5 border-l-2 border-l-blue-500" : ""
                      } ${isExpanded ? "bg-v-hover/30" : ""}`}
                    >
                      <td className="py-3 px-3 font-medium text-v-text1 whitespace-nowrap">
                        {pair.length > 1
                          ? `Wk ${firstWeek.week}-${lastWeek.week}`
                          : `Wk ${firstWeek.week}`}
                        {isCurrentPair && <span className="ml-1.5 text-blue-400 text-xs">●</span>}
                      </td>
                      <td className="py-3 px-3 text-v-text2 whitespace-nowrap">
                        {pair.length > 1
                          ? `${firstWeek.dateRange.split("~")[0]}~${lastWeek.dateRange.split("~")[1]}`
                          : firstWeek.dateRange}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {firstWeek.items.map((code) => {
                            const isResident = residentCodesSet.has(code);
                            const hasSuggestion = suggestItemIds.has(code);
                            return (
                              <Chip
                                key={code}
                                variant="flat"
                                size="sm"
                                classNames={{
                                  base: `${isResident ? "bg-emerald-500/15" : "bg-default-100"} ${hasSuggestion ? "ring-1 ring-amber-500/50" : ""}`,
                                  content: `${isResident ? "text-emerald-400" : "text-v-text2"} text-xs`,
                                }}
                              >
                                {itemLabel(code)}
                              </Chip>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-v-text2">
                        {totalDays}{t("dayUnit")}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {notes.length > 0 ? (
                          <Chip variant="flat" size="sm"
                            classNames={{ base: "bg-amber-500/15", content: "text-amber-400 text-xs" }}
                          >
                            {notes.join(", ")}
                          </Chip>
                        ) : allGenerated ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-v-text4 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-v-text3 mx-auto" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-v-text3 mx-auto" />
                        )}
                      </td>
                    </tr>
                    {/* Inline expansion */}
                    {isExpanded && (
                      <tr key={`expand-${firstWeek.week}`}>
                        <td colSpan={6} className="p-0">
                          <div className="bg-v-hover/20 border-t border-v-border/30 px-4 py-3">
                            {expandLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <Spinner size="sm" color="primary" />
                              </div>
                            ) : expandedDays.length === 0 ? (
                              <p className="text-v-text3 text-sm py-4 text-center">{t("dayPlanNone")}</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {expandedDays.map((day) => (
                                  <div key={day.date} className="bg-v-card border border-v-border/50 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-v-text1">
                                        {day.weekday} {day.date.slice(5)}
                                      </span>
                                      {day.plan ? (
                                        <Chip variant="flat" size="sm"
                                          classNames={{ base: "bg-emerald-500/10", content: "text-emerald-400 text-xs" }}
                                        >
                                          {t("dayPlanStatus")}
                                        </Chip>
                                      ) : (
                                        <Chip variant="flat" size="sm"
                                          classNames={{ base: "bg-default-100", content: "text-v-text4 text-xs" }}
                                        >
                                          {t("dayPlanNone")}
                                        </Chip>
                                      )}
                                    </div>
                                    {day.plan && (
                                      <div className="flex flex-wrap gap-1">
                                        {day.plan.items.map((item) => (
                                          <Chip
                                            key={item.code}
                                            variant="flat" size="sm"
                                            classNames={{
                                              base: item.isResident ? "bg-emerald-500/15" : "bg-default-100",
                                              content: `${item.isResident ? "text-emerald-400" : "text-v-text2"} text-xs`,
                                            }}
                                          >
                                            {item.code || "?"}
                                          </Chip>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 常驻项维护 Modal */}
      <Modal isOpen={residentModalOpen} onOpenChange={setResidentModalOpen} placement="center"
        classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-v-text1">{t("manageResidentTitle")}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-v-text3 mb-3">{t("manageResidentHint")}</p>
                <div className="space-y-2">
                  {allFixedItems.map((item) => {
                    const isSelected = selectedResidentIds.has(item.id);
                    return (
                      <div key={item.id}
                        onClick={() => toggleResidentItem(item.id)}
                        className={`flex items-center gap-3 rounded-lg p-3 border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30"
                            : "border-v-border hover:bg-v-hover"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "border-emerald-500 bg-emerald-500" : "border-v-text4"
                        }`}>
                          {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <span className="font-medium text-v-text1">
                          {item.code} {item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-v-text4 mt-2">
                  {t("selectedCount", { count: selectedResidentIds.size }).replace("5", "3")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="bordered" radius="full" className="border-v-border-input text-v-text3" onPress={onClose}>{tc("cancel")}</Button>
                <Button color="primary" radius="full" isLoading={residentSaving}
                  spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  onPress={saveResidentItems}
                >{tc("save")}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

// ========== 周检查计划 Tab ==========

function WeeklyPlanTab({ readonly = false }: { readonly?: boolean }) {
  const t = useTranslations("dailyPlan");
  const ti = useTranslations("checkItems");
  const tc = useTranslations("common");

  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [recommendation, setRecommendation] = useState<WeekRecommendation | null>(null);
  const [weekDays, setWeekDays] = useState<WeekDayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"recommend" | "baseline" | "custom">("recommend");
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [allFixedItems, setAllFixedItems] = useState<{ id: string; code: string | null; title: string }[]>([]);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  // 获取当前周
  useEffect(() => {
    fetch("/api/daily-plan/schedule-overview")
      .then((r) => r.json())
      .then((data) => {
        if (data.currentWeek) setCurrentWeek(data.currentWeek);
      })
      .catch(() => {});
  }, []);

  // 获取所有固定检查项（用于自定义选择）
  useEffect(() => {
    fetch("/api/inspection")
      .then((r) => r.json())
      .then((data) => {
        if (data.fixedItems) {
          setAllFixedItems(data.fixedItems.filter((i: { isActive: boolean }) => i.isActive).map((i: { id: string; code: string | null; title: string }) => ({
            id: i.id, code: i.code, title: i.title,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const fetchWeekData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, planRes] = await Promise.all([
        fetch(`/api/daily-plan/week-recommend?week=${currentWeek}`),
        fetch(`/api/daily-plan/week?week=${currentWeek}`),
      ]);

      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendation(recData.recommendation);
        // 默认选中推荐的项目
        setSelectedItemIds(new Set(recData.recommendation.recommended.map((r: RecommendedItem) => r.id)));
        setMode("recommend");
      }
      if (planRes.ok) {
        const planData = await planRes.json();
        setWeekDays(planData.days || []);
      }
    } catch {
      showAlert("error", tc("loadFailed"));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek]);

  useEffect(() => { fetchWeekData(); }, [fetchWeekData]);

  const handleAdoptRecommend = () => {
    if (!recommendation) return;
    setSelectedItemIds(new Set(recommendation.recommended.map((r) => r.id)));
    setMode("recommend");
  };

  const handleUseBaseline = () => {
    if (!recommendation) return;
    // 从 allFixedItems 中找出基线 codes 对应的 IDs
    const baselineCodes = new Set(recommendation.semesterBaseline);
    const ids = allFixedItems.filter((i) => i.code && baselineCodes.has(i.code)).map((i) => i.id);
    setSelectedItemIds(new Set(ids));
    setMode("baseline");
  };

  const handleCustom = () => {
    setMode("custom");
  };

  const toggleCustomItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 5) return prev; // 硬性上限 5 项
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirmWeek = async () => {
    if (selectedItemIds.size === 0) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/daily-plan/confirm-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: currentWeek, checkItemIds: Array.from(selectedItemIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("weekConfirmFailed"));
      }
      const result = await res.json();
      showAlert("success", t("weekConfirmed", { week: currentWeek, count: result.generated }));
      fetchWeekData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("weekConfirmFailed"));
    } finally {
      setConfirming(false);
    }
  };

  const itemLabel = (code: string | null) => {
    if (code && CHECK_CODES.includes(code)) return `${code} ${ti(code)}`;
    return code || "?";
  };

  const confidenceColor = recommendation?.dataConfidence === "high"
    ? "text-emerald-400" : recommendation?.dataConfidence === "medium"
    ? "text-amber-400" : "text-red-400";
  const confidenceLabel = recommendation?.dataConfidence === "high"
    ? t("confidenceHigh") : recommendation?.dataConfidence === "medium"
    ? t("confidenceMedium") : t("confidenceLow");

  return (
    <div className="space-y-6">
      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto flex items-center gap-2 ${
            alert.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
              : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
          }`}>
            {alert.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {alert.message}
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          isIconOnly variant="light" size="sm" radius="full"
          isDisabled={currentWeek <= 1}
          onPress={() => setCurrentWeek((w) => Math.max(1, w - 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold text-v-text1">
          {t("weekLabel", { week: currentWeek })}
        </h2>
        <Button
          isIconOnly variant="light" size="sm" radius="full"
          isDisabled={currentWeek >= 19}
          onPress={() => setCurrentWeek((w) => Math.min(19, w + 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {loading ? (
        <ContentSkeleton rows={5} />
      ) : (
        <>
          {/* Recommendation card */}
          {recommendation && (
            <Card className="bg-v-card border border-v-border overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
                  <h3 className="text-base sm:text-lg font-semibold text-v-text1">{t("weekRecommendTitle")}</h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-v-text3 hidden sm:inline">{t("dataConfidence")}</span>
                  <Chip variant="flat" size="sm" classNames={{ content: `${confidenceColor} text-xs` }}>
                    {confidenceLabel}
                  </Chip>
                </div>
              </CardHeader>
              <CardBody className="pt-0 space-y-4">
                <p className="text-sm text-v-text3">{t("weekRecommendHint")}</p>

                {/* Recommended items */}
                <div className="space-y-2">
                  {/* Resident items */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-medium text-v-text3 shrink-0">{t("residentLabel")}:</span>
                    {recommendation.recommended.filter((r) => r.isResident).map((r) => (
                      <Chip key={r.id} variant="flat" size="sm"
                        classNames={{ base: "bg-emerald-500/15 max-w-full", content: "text-emerald-400 text-xs truncate" }}
                      >
                        {itemLabel(r.code)}
                      </Chip>
                    ))}
                  </div>
                  {/* Non-resident recommended */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-medium text-v-text3 shrink-0">{t("recommendedLabel")}:</span>
                    {recommendation.recommended.filter((r) => !r.isResident).map((r) => (
                      <Chip key={r.id} variant="flat" size="sm"
                        classNames={{ base: "bg-amber-500/15 max-w-full", content: "text-amber-400 text-xs truncate" }}
                      >
                        {itemLabel(r.code)}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Reasons */}
                {recommendation.recommended.filter((r) => !r.isResident && r.reasons.length > 0).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-v-text3">{t("recommendReasons")}:</p>
                    {recommendation.recommended.filter((r) => !r.isResident).map((r) => (
                      <p key={r.id} className="text-xs text-v-text3 pl-2">
                        · {r.code}: {r.reasons.join("；")}
                      </p>
                    ))}
                  </div>
                )}

                {/* Deviations */}
                {recommendation.deviations.length > 0 && (
                  <div className="space-y-1 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 overflow-hidden">
                    <p className="text-xs font-medium text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="break-words">{t("baselineDeviation")}</span>
                    </p>
                    {recommendation.deviations.map((d, i) => (
                      <p key={i} className="text-xs text-v-text3 pl-2 break-words">
                        · {d.type === "added" ? `+${d.code}` : `-${d.code}`}: {d.reason}
                      </p>
                    ))}
                  </div>
                )}

                {/* Action buttons（只读模式隐藏） */}
                {!readonly && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      color={mode === "recommend" ? "primary" : "default"}
                      variant={mode === "recommend" ? "solid" : "bordered"}
                      size="sm" radius="full"
                      onPress={handleAdoptRecommend}
                    >
                      {t("adoptRecommend")}
                    </Button>
                    <Button
                      color={mode === "baseline" ? "primary" : "default"}
                      variant={mode === "baseline" ? "solid" : "bordered"}
                      size="sm" radius="full"
                      onPress={handleUseBaseline}
                    >
                      {t("useBaseline")}
                    </Button>
                    <Button
                      color={mode === "custom" ? "primary" : "default"}
                      variant={mode === "custom" ? "solid" : "bordered"}
                      size="sm" radius="full"
                      onPress={handleCustom}
                    >
                      {t("customSelect")}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Custom selection（只读模式隐藏） */}
          {!readonly && mode === "custom" && (
            <Card className="bg-v-card border border-v-border overflow-hidden">
              <CardHeader>
                <h3 className="text-base sm:text-lg font-semibold text-v-text1">{t("customSelect")}</h3>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {allFixedItems.map((item) => {
                    const isSelected = selectedItemIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleCustomItem(item.id)}
                        className={`flex items-center gap-2 rounded-lg p-2.5 border cursor-pointer transition-all min-w-0 ${
                          isSelected
                            ? "bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30"
                            : "border-v-border hover:bg-v-hover"
                        }`}
                      >
                        <span className="text-sm text-v-text1 truncate">{itemLabel(item.code)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Weekly grid */}
          <Card className="bg-v-card border border-v-border overflow-hidden">
            <CardHeader>
              <h3 className="text-base sm:text-lg font-semibold text-v-text1">{t("weekGrid")}</h3>
            </CardHeader>
            <CardBody className="pt-0">
              {weekDays.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {weekDays.map((day) => (
                    <div key={day.date} className="bg-v-hover/30 border border-v-border/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-v-text1">
                          {day.weekday} {day.date.slice(5)}
                        </span>
                        {day.plan ? (
                          <Chip variant="flat" size="sm"
                            classNames={{ base: "bg-emerald-500/10", content: "text-emerald-400 text-xs" }}
                          >
                            {t("dayPlanStatus")}
                          </Chip>
                        ) : (
                          <Chip variant="flat" size="sm"
                            classNames={{ base: "bg-default-100", content: "text-v-text4 text-xs" }}
                          >
                            {t("dayPlanNone")}
                          </Chip>
                        )}
                      </div>
                      {day.plan ? (
                        <div className="flex flex-wrap gap-1">
                          {day.plan.items.map((item) => (
                            <Chip key={item.code} variant="flat" size="sm"
                              classNames={{
                                base: item.isResident ? "bg-emerald-500/15" : "bg-default-100",
                                content: `${item.isResident ? "text-emerald-400" : "text-v-text2"} text-xs`,
                              }}
                            >
                              {item.code || "?"}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-v-text4">{t("dayPlanNone")}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-v-text3 text-sm py-4 text-center">{tc("noData")}</p>
              )}
            </CardBody>
          </Card>

          {/* Confirm button（只读模式隐藏） */}
          {!readonly && (
            <div className="flex justify-end">
              <Button
                color="primary"
                size="lg" radius="full"
                startContent={confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
                isDisabled={confirming || selectedItemIds.size === 0}
                onPress={handleConfirmWeek}
              >
                {confirming ? t("confirming") : t("confirmWeek")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== 单日计划 Tab ==========

function DailyPlanTab({ readonly = false }: { readonly?: boolean }) {
  const t = useTranslations("dailyPlan");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
  const itemDesc = (item: { code?: string | null; description?: string | null }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(`desc.${item.code}`) : (item.description ?? "");
  const { locale } = useLocale();
  const { data: session } = useSession();
  const [date, setDate] = useState(() => formatDateStr(new Date()));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [planData, setPlanData] = useState<DailyPlanResponse | null>(null);
  const [suggestData, setSuggestData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [alert, setAlert] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // 新增临增项 modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // 编辑临增项 modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 删除临增项确认 modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteItemTitle, setDeleteItemTitle] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchPlanData = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-plan?date=${date}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("loadFailed"));
      }
      const data: DailyPlanResponse = await res.json();
      setPlanData(data);

      const mainPlan = data.plans.find((p) => p.targetGrade == null) ?? data.plans[0];
      if (mainPlan?.items?.length) {
        setSelectedIds(new Set(mainPlan.items.map((i) => i.checkItem.id)));
      } else {
        setSelectedIds(new Set());
      }
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : tc("loadFailed"),
      });
      setPlanData(null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const fetchSuggest = useCallback(async () => {
    if (!date) return;
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/daily-plan/suggest?date=${date}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("suggestFailed"));
      }
      const data: SuggestResponse = await res.json();
      setSuggestData(data);
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : t("suggestFailed"),
      });
      setSuggestData(null);
    } finally {
      setSuggestLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { fetchPlanData(); }, [fetchPlanData]);

  useEffect(() => {
    if (!readonly && session?.user?.role === "ADMIN") fetchSuggest();
  }, [readonly, session?.user?.role, fetchSuggest]);

  const showAlert = (type: "success" | "error" | "warning", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const adoptRecommendations = () => {
    if (!suggestData?.recommended?.length) return;
    const ids = suggestData.recommended.map((s) => s.checkItemId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    showAlert("success", t("adopted", { count: ids.length }));
  };

  const handleSubmit = async () => {
    const count = selectedIds.size;
    if (count < 3) { showAlert("warning", t("minWarning")); return; }
    if (count > 5) { showAlert("warning", t("maxWarning")); return; }

    setSubmitLoading(true);
    try {
      const res = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, checkItemIds: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("createPlanFailed"));
      }
      showAlert("success", t("planSaved"));
      fetchPlanData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("createPlanFailed"));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddDynamicItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTitle.trim()) { showAlert("error", t("titleRequired")); return; }
    setAddSubmitting(true);
    try {
      const res = await fetch("/api/inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: addTitle.trim(), description: addDescription.trim() || undefined, date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("dynamicCreateFailed"));
      }
      showAlert("success", t("dynamicCreated"));
      setAddModalOpen(false);
      setAddTitle("");
      setAddDescription("");
      fetchPlanData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("dynamicCreateFailed"));
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEditModal = (item: CheckItem) => {
    setEditItemId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditModalOpen(true);
  };

  const handleEditDynamicItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemId || !editTitle.trim()) { showAlert("error", t("titleRequired")); return; }
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/inspection/${editItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("dynamicUpdateFailed"));
      }
      showAlert("success", t("dynamicUpdated"));
      setEditModalOpen(false);
      setEditItemId(null);
      setEditTitle("");
      setEditDescription("");
      fetchPlanData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("dynamicUpdateFailed"));
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDeleteModal = (item: CheckItem) => {
    setDeleteItemId(item.id);
    setDeleteItemTitle(itemTitle(item));
    setDeleteModalOpen(true);
  };

  const handleDeleteDynamicItem = async () => {
    if (!deleteItemId) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/inspection/${deleteItemId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("dynamicDeleteFailed"));
      }
      const data = await res.json();
      showAlert("success", data.softDeleted ? t("softDeleted") : t("hardDeleted"));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(deleteItemId); return next; });
      setDeleteModalOpen(false);
      setDeleteItemId(null);
      setDeleteItemTitle("");
      fetchPlanData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("dynamicDeleteFailed"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const selectedCount = selectedIds.size;
  const isValidSelection = selectedCount >= 3 && selectedCount <= 5;

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-v-text2">{t("selectDate")}</label>
        <Input
          type="date"
          value={date}
          onValueChange={setDate}
          variant="bordered"
          size="sm"
          className="w-48"
          classNames={{
            inputWrapper: "border-v-border-input bg-v-input",
            input: "text-v-text1 placeholder:text-v-text4",
          }}
        />
      </div>

      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto flex items-center gap-2 ${
              alert.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
                : alert.type === "warning"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 backdrop-blur-sm"
                  : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
            }`}
          >
            {alert.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {alert.type === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {alert.message}
          </div>
        </div>
      )}

      {loading ? (
        <ContentSkeleton rows={5} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: AI Recommendation + Fixed items */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Recommendation */}
            <Card className="bg-v-card border border-v-border overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-v-text1">{t("aiRecommend")}</h2>
                  <Chip variant="flat" size="sm" classNames={{ base: "bg-blue-500/15 shrink-0", content: "text-blue-300 text-xs" }}>
                    {t("fixedRule")}
                  </Chip>
                </div>
                {!readonly && (suggestLoading ? (
                  <Spinner size="sm" color="primary" />
                ) : suggestData?.recommended?.length ? (
                  <Button size="sm" color="primary" variant="flat" radius="full"
                    startContent={<CheckCircle2 className="h-4 w-4" />}
                    onPress={adoptRecommendations}
                  >
                    {t("adoptAll")}
                  </Button>
                ) : null)}
              </CardHeader>
              <CardBody className="pt-0">
                {suggestLoading ? (
                  <div className="py-8 text-center text-v-text3 text-sm">{t("analyzing")}</div>
                ) : suggestData?.recommended?.length ? (
                  <div className="space-y-3">
                    <p className="text-sm text-v-text3">{suggestData.message}</p>
                    <div className="space-y-2">
                      {suggestData.recommended.map((s) => {
                        const isSelected = selectedIds.has(s.checkItemId);
                        return (
                          <div key={s.checkItemId}
                            onClick={() => toggleItem(s.checkItemId)}
                            className={`flex items-start gap-3 rounded-lg p-3 border cursor-pointer transition-all duration-200 min-w-0 ${
                              isSelected
                                ? "bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30"
                                : "bg-v-hover/50 border-v-border hover:bg-v-hover"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-medium text-v-text1 break-words min-w-0">
                                  {s.code} {itemTitle({ code: s.code, title: s.title })}
                                </span>
                                <Chip size="sm" variant="flat"
                                  classNames={{ base: "bg-amber-500/20 shrink-0", content: "text-amber-400 text-xs" }}
                                >
                                  {t("recommended")}
                                </Chip>
                              </div>
                              {s.reasons?.length ? (
                                <p className="text-sm text-v-text3 mt-1">
                                  {s.reasons.join(locale === "zh" ? "；" : "; ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-v-text3 text-sm">
                    {suggestData?.message ?? t("noRecommendation")}
                  </p>
                )}
              </CardBody>
            </Card>

            {/* Fixed items D-1~D-9 */}
            <Card className="bg-v-card border border-v-border overflow-hidden">
              <CardHeader>
                <h2 className="text-base sm:text-lg font-semibold text-v-text1">{t("fixedItems")}</h2>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="space-y-3">
                  {(planData?.fixedItems ?? [])
                    .filter((item) => !suggestData?.recommended?.some((r) => r.checkItemId === item.id))
                    .map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <div key={item.id}
                        onClick={readonly ? undefined : () => toggleItem(item.id)}
                        className={`flex items-start gap-3 rounded-lg p-3 border ${readonly ? "" : "cursor-pointer"} transition-all duration-200 min-w-0 ${
                          isSelected
                            ? "bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30"
                            : "border-v-border hover:bg-v-hover"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-medium text-v-text1 break-words">{item.code} {itemTitle(item)}</span>
                          </div>
                          {itemDesc(item) ? (
                            <p className="text-sm text-v-text3 mt-1">{itemDesc(item)}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Right: Dynamic items + Submit */}
          <div className="space-y-6">
            {/* Dynamic items */}
            <Card className="bg-v-card border border-v-border overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-v-text1">{t("dynamicItems")}</h2>
                {!readonly && (
                  <Button size="sm" variant="bordered" radius="full"
                    className="border-v-border-input text-v-text2 hover:bg-v-hover"
                    startContent={<Plus className="h-4 w-4" />}
                    onPress={() => setAddModalOpen(true)}
                  >
                    {t("addDynamic")}
                  </Button>
                )}
              </CardHeader>
              <CardBody className="pt-0">
                {planData?.dynamicItems?.length ? (
                  <div className="space-y-2">
                    {planData.dynamicItems.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div key={item.id}
                          className={`flex items-start gap-3 rounded-lg p-3 border transition-all duration-200 ${
                            isSelected
                              ? "bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30"
                              : "border-v-border bg-v-hover/30 hover:bg-v-hover"
                          }`}
                        >
                          <div className={`flex-1 min-w-0 ${readonly ? "" : "cursor-pointer"}`} onClick={readonly ? undefined : () => toggleItem(item.id)}>
                            <span className="font-medium text-v-text1 break-words">{itemTitle(item)}</span>
                            {itemDesc(item) ? (
                              <p className="text-sm text-v-text3 mt-1 break-words">{itemDesc(item)}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Chip size="sm" variant="flat"
                              classNames={{ base: "bg-blue-500/20", content: "text-blue-400 text-xs" }}
                            >
                              {t("dynamicTag")}
                            </Chip>
                            {!readonly && (
                              <>
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                                  className="p-1 rounded-md text-v-text3 hover:text-v-text1 hover:bg-v-hover transition-colors"
                                  title={t("editBtn")}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); openDeleteModal(item); }}
                                  className="p-1 rounded-md text-v-text3 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title={t("deleteBtn")}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-4 text-v-text3 text-sm">{t("noDynamicItems")}</p>
                )}
              </CardBody>
            </Card>

            {/* Existing plan summary */}
            {planData?.plans?.length ? (
              <Card className="bg-v-card border border-v-border overflow-hidden">
                <CardHeader>
                  <h2 className="text-base sm:text-lg font-semibold text-v-text1">{t("currentPlan")}</h2>
                </CardHeader>
                <CardBody className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {planData.plans.flatMap((p) =>
                      p.items.map((i) => (
                        <Chip key={i.id} variant="flat" size="sm"
                          classNames={{ base: "bg-v-input max-w-full", content: "text-v-text2 text-xs truncate" }}
                        >
                          {i.checkItem.code ?? ti("dynamic")} {itemTitle(i.checkItem)}
                        </Chip>
                      ))
                    )}
                  </div>
                  {planData.plans[0]?.createdBy && (
                    <p className="text-xs text-v-text4 mt-2">
                      {t("createdBy", { name: planData.plans[0].createdBy.name })}
                    </p>
                  )}
                </CardBody>
              </Card>
            ) : null}

            {/* Submit + validation（只读模式隐藏） */}
            {!readonly && (
              <Card className="bg-v-card border border-v-border">
                <CardBody>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-v-text2">{t("selected")}</span>
                      <span className={`font-semibold ${
                        isValidSelection ? "text-emerald-500" : selectedCount > 5 ? "text-red-500" : "text-amber-500"
                      }`}>
                        {t("selectedCount", { count: selectedCount })}
                      </span>
                    </div>
                    {!isValidSelection && selectedCount > 0 && (
                      <p className="text-sm text-amber-500 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {selectedCount < 3 ? t("minSelection") : t("maxSelection")}
                      </p>
                    )}
                    <Button
                      className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                      size="lg" radius="full"
                      startContent={submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
                      isDisabled={!isValidSelection || submitLoading}
                      onPress={handleSubmit}
                    >
                      {submitLoading ? t("saving") : t("savePlan")}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* 新增临增项 Modal */}
      <Modal isOpen={addModalOpen} onOpenChange={setAddModalOpen} placement="center"
        classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}
      >
        <ModalContent>
          {(onClose) => (
            <form onSubmit={handleAddDynamicItem}>
              <ModalHeader className="text-v-text1">{t("addModalTitle")}</ModalHeader>
              <ModalBody className="space-y-4">
                <Input label={t("titleLabel")} labelPlacement="outside" placeholder={t("titlePlaceholder")}
                  value={addTitle} onValueChange={setAddTitle} isRequired variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
                <Textarea label={t("descriptionLabel")} labelPlacement="outside" placeholder={t("descriptionPlaceholder")}
                  value={addDescription} onValueChange={setAddDescription} minRows={3} variant="flat"
                  classNames={{ base: "w-full", label: "text-v-text2 font-medium", inputWrapper: "bg-v-input border border-v-border-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
                <p className="text-xs text-v-text4">{t("effectiveDate", { date })}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="bordered" radius="full" className="border-v-border-input text-v-text3" onPress={onClose}>{tc("cancel")}</Button>
                <Button type="submit" isLoading={addSubmitting} radius="full" spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                >{tc("create")}</Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* 编辑临增项 Modal */}
      <Modal isOpen={editModalOpen} onOpenChange={setEditModalOpen} placement="center"
        classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}
      >
        <ModalContent>
          {(onClose) => (
            <form onSubmit={handleEditDynamicItem}>
              <ModalHeader className="text-v-text1">{t("editModalTitle")}</ModalHeader>
              <ModalBody className="space-y-4">
                <Input label={t("titleLabel")} labelPlacement="outside" placeholder={t("titlePlaceholder")}
                  value={editTitle} onValueChange={setEditTitle} isRequired variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
                <Textarea label={t("descriptionLabel")} labelPlacement="outside" placeholder={t("descriptionPlaceholder")}
                  value={editDescription} onValueChange={setEditDescription} minRows={3} variant="flat"
                  classNames={{ base: "w-full", label: "text-v-text2 font-medium", inputWrapper: "bg-v-input border border-v-border-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="bordered" radius="full" className="border-v-border-input text-v-text3" onPress={onClose}>{tc("cancel")}</Button>
                <Button type="submit" isLoading={editSubmitting} radius="full" spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                >{tc("save")}</Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* 删除临增项确认 Modal */}
      <Modal isOpen={deleteModalOpen} onOpenChange={setDeleteModalOpen} placement="center"
        classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-v-text1">{t("deleteModalTitle")}</ModalHeader>
              <ModalBody>
                <p className="text-v-text2">{t("deleteConfirm", { title: deleteItemTitle })}</p>
                <p className="text-sm text-v-text3 mt-1">{t("deleteHint")}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="bordered" radius="full" className="border-v-border-input text-v-text3" onPress={onClose}>{tc("cancel")}</Button>
                <Button color="danger" radius="full" isLoading={deleteSubmitting} spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  onPress={handleDeleteDynamicItem}
                >{tc("delete")}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

// ========== 主页面 ==========

export default function DailyPlanPage() {
  const t = useTranslations("dailyPlan");
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return <TabPageSkeleton />;
  }

  if (status === "unauthenticated") {
    router.replace("/login");
    return null;
  }

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";

  if (!isAdmin && !isGradeLeader) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-v-text1 mb-2">{t("noPermission")}</h2>
        <p className="text-v-text3">{t("noPermissionHint")}</p>
      </div>
    );
  }

  // 非 ADMIN 角色为只读模式
  const readonly = !isAdmin;

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-v-text1">{t("title")}</h1>
        <p className="text-v-text3 mt-1 text-sm sm:text-base">{t("subtitle")}</p>
      </div>

      {/* Tabs */}
      <Tabs
        aria-label="Check Plan Tabs"
        variant="solid"
        fullWidth
        classNames={{
          base: "w-full",
          tabList: "bg-v-card border border-v-border rounded-xl p-1 gap-1",
          tab: "h-9 text-v-text3 data-[selected=true]:text-v-text1 rounded-lg text-sm",
          cursor: "bg-blue-500/15 rounded-lg shadow-none",
        }}
      >
        <Tab
          key="semester"
          title={
            <div className="flex items-center justify-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("tabSemester")}</span>
            </div>
          }
        >
          <div className="pt-4">
            <SemesterScheduleTab readonly={readonly} />
          </div>
        </Tab>
        <Tab
          key="weekly"
          title={
            <div className="flex items-center justify-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("tabWeekly")}</span>
            </div>
          }
        >
          <div className="pt-4">
            <WeeklyPlanTab readonly={readonly} />
          </div>
        </Tab>
        <Tab
          key="daily"
          title={
            <div className="flex items-center justify-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("tabDaily")}</span>
            </div>
          }
        >
          <div className="pt-4">
            <DailyPlanTab readonly={readonly} />
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
