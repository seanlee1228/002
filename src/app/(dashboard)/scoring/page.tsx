"use client";

// 评分页面 — 类型/常量/画像面板已拆分到子模块
// 修改评分表单逻辑时只需关注本文件
// 修改画像面板时请编辑 _components/inspector-profile-panel.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useLocale } from "@/components/locale-provider";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Spinner,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import {
  Check,
  X,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Save,
  Loader2,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  Play,
  Lock,
  ShieldCheck,
} from "lucide-react";

import type { ClassData, ScoringData } from "./_lib/types";
import {
  CHECK_CODES,
  ITEMS_COLLAPSED_KEY,
  getGradeColor,
  formatDisplayDate,
  saveDraft,
  loadDraft,
  clearDraft,
} from "./_lib/constants";
import { InspectorProfilePanel } from "./_components/inspector-profile-panel";
import { getScoringAuthority } from "@/lib/permissions";
import { PageSkeleton } from "@/components/skeletons";

// ==================== Main Page ====================

export default function ScoringPage() {
  const t = useTranslations("scoring");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
  const itemDesc = (item: { code?: string | null; description?: string | null }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(`desc.${item.code}`) : (item.description ?? "");
  const { locale } = useLocale();
  const { data: session, status } = useSession();

  // Main state
  const [data, setData] = useState<ScoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [records, setRecords] = useState<Record<string, { passed: boolean; severity: string; comment: string }>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [touchedItems, setTouchedItems] = useState<Set<string>>(new Set());

  // UI state
  const [itemsCollapsed, setItemsCollapsed] = useState(true);

  // 从 localStorage 读取折叠状态（避免 SSR hydration mismatch）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ITEMS_COLLAPSED_KEY);
      if (saved !== null) setItemsCollapsed(saved === "true");
    } catch { /* ignore */ }
  }, []);

  // Quick pass modal state
  const quickPassModal = useDisclosure();
  const [quickPassClass, setQuickPassClass] = useState<ClassData | null>(null);
  const [quickPassItem, setQuickPassItem] = useState<{ code: string | null; title: string; description: string | null; isRecentFailed: boolean } | null>(null);
  const [quickPassSubmitting, setQuickPassSubmitting] = useState(false);

  // Refs
  const classListRef = useRef<HTMLDivElement | null>(null);
  const scoringTitleRef = useRef<HTMLHeadingElement | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==================== Data Fetching ====================

  const fetchData = async (): Promise<ScoringData | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scoring");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("loadFailed"));
      }
      const json = await res.json();
      setData(json);
      return json;
    } catch (err) {
      const msg = err instanceof Error ? err.message : tc("loadFailed");
      setError(msg);
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tc]);

  // ==================== Alert Handling ====================

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    if (type === "success") {
      setTimeout(() => setAlert(null), 3000);
    }
    // Error alerts persist until dismissed
  };

  const dismissAlert = () => setAlert(null);

  // ==================== Draft Caching ====================

  const saveDraftDebounced = useCallback((classId: string, date: string, recs: typeof records) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(classId, date, recs), 500);
  }, []);

  // 组件卸载时清理草稿定时器，避免内存泄漏
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  // Save draft on records change
  useEffect(() => {
    if (selectedClass && data?.date) {
      saveDraftDebounced(selectedClass.id, data.date, records);
    }
  }, [records, selectedClass, data?.date, saveDraftDebounced]);

  // ==================== Class Selection ====================

  const handleSelectClass = (cls: ClassData) => {
    setSelectedClass(cls);
    setTouchedItems(new Set());

    // Try to load draft first
    const draft = data?.date ? loadDraft(cls.id, data.date) : null;
    if (draft && Object.keys(draft).length > 0) {
      setRecords(draft);
      setExpandedComments({});
      // Check which items have fail records in draft
      const expanded: Record<string, boolean> = {};
      for (const [itemId, rec] of Object.entries(draft)) {
        if (!rec.passed) expanded[itemId] = true;
      }
      setExpandedComments(expanded);
      showAlert("success", t("draftRestored"));
      return;
    }

    // Otherwise initialize from server data
    const initial: Record<string, { passed: boolean; severity: string; comment: string }> = {};
    for (const item of cls.items) {
      if (item.record != null) {
        initial[item.id] = {
          passed: item.record.passed,
          severity: item.record.severity ?? "minor",
          comment: item.record.comment ?? "",
        };
      } else {
        initial[item.id] = { passed: true, severity: "minor", comment: "" };
      }
    }
    setRecords(initial);
    setExpandedComments({});
  };

  useEffect(() => {
    if (!selectedClass) return;
    scoringTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedClass?.id]);

  // ==================== Record Handlers ====================

  const handlePassChange = (itemId: string, passed: boolean) => {
    setRecords((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { passed: true, severity: "minor", comment: "" }), passed },
    }));
    setTouchedItems((prev) => new Set(prev).add(itemId));
    if (passed) {
      setExpandedComments((prev) => ({ ...prev, [itemId]: false }));
    } else {
      setExpandedComments((prev) => ({ ...prev, [itemId]: true }));
    }
  };

  const handleSeverityChange = (itemId: string, severity: string) => {
    setRecords((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { passed: false, severity: "minor", comment: "" }), severity },
    }));
  };

  const handleCommentChange = (itemId: string, value: string) => {
    setRecords((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { passed: true, severity: "minor", comment: "" }), comment: value },
    }));
  };

  const toggleCommentExpanded = (itemId: string) => {
    setExpandedComments((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // ==================== Submission ====================

  const doSubmit = async (method: "item_by_item" | "quick_pass", targetClass: ClassData, recordInputs: Array<{ checkItemId: string; passed: boolean; severity?: string; comment?: string }>) => {
    const res = await fetch("/api/scoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: targetClass.id, records: recordInputs, method }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t("submitFailed"));
    }
    // Clear draft on success
    if (data?.date) clearDraft(targetClass.id, data.date);
  };

  const handleSubmit = async (e: React.FormEvent, goToNext = false) => {
    e.preventDefault();
    if (!selectedClass || !data?.checkItems.length) return;

    const recordInputs = selectedClass.items.map((item) => {
      const rec = records[item.id];
      const passed = rec?.passed ?? true;
      return {
        checkItemId: item.id,
        passed,
        severity: !passed ? (rec?.severity || "minor") : undefined,
        comment: rec?.comment || undefined,
      };
    });

    setSubmitting(true);
    try {
      await doSubmit("item_by_item", selectedClass, recordInputs);
      showAlert("success", t("recordSaved"));
      const newData = await fetchData();
      if (newData) {
        if (goToNext) {
          // Find next unscored class
          const nextClass = findNextUnscoredClass(newData, selectedClass);
          if (nextClass) {
            handleSelectClass(nextClass);
          } else {
            showAlert("success", t("allComplete"));
            setSelectedClass(null);
            setRecords({});
            setExpandedComments({});
            setTouchedItems(new Set());
            classListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        } else {
          setSelectedClass(null);
          setRecords({});
          setExpandedComments({});
          setTouchedItems(new Set());
          classListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== Quick Pass ====================

  const handleQuickPass = (cls: ClassData) => {
    // 优先从14天内有不达标记录的项目中抽取
    const items = cls.items;
    const failedItems = items.filter((item) => cls.recentFailedItemIds.includes(item.id));
    const pool = failedItems.length > 0 ? failedItems : items;
    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    const isRecentFailed = failedItems.length > 0 && cls.recentFailedItemIds.includes(randomItem.id);
    setQuickPassClass(cls);
    setQuickPassItem({ code: randomItem.code, title: itemTitle(randomItem), description: randomItem.description, isRecentFailed });
    quickPassModal.onOpen();
  };

  const confirmQuickPass = async () => {
    if (!quickPassClass || !data?.checkItems.length) return;
    setQuickPassSubmitting(true);
    try {
      const recordInputs = quickPassClass.items.map((item) => ({
        checkItemId: item.id,
        passed: true,
      }));
      await doSubmit("quick_pass", quickPassClass, recordInputs);
      showAlert("success", t("recordSaved"));
      quickPassModal.onClose();
      setQuickPassClass(null);
      setQuickPassItem(null);
      await fetchData();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setQuickPassSubmitting(false);
    }
  };

  const quickPassToDetail = () => {
    if (quickPassClass) {
      handleSelectClass(quickPassClass);
    }
    quickPassModal.onClose();
    setQuickPassClass(null);
    setQuickPassItem(null);
  };

  // ==================== Helper Functions ====================

  const scoredCount = (cls: ClassData) => cls.scoredItemIds.length;
  const totalCount = data?.checkItems?.length ?? 0;
  const isClassComplete = (cls: ClassData) => totalCount > 0 && scoredCount(cls) === totalCount;

  const findNextUnscoredClass = (currentData: ScoringData, current: ClassData): ClassData | null => {
    const allClasses = currentData.classes;
    const itemCount = currentData.checkItems.length;
    // Same grade first, then other grades
    const sameGrade = allClasses.filter((c) => c.grade === current.grade && c.id !== current.id && !(itemCount > 0 && c.scoredItemIds.length === itemCount));
    if (sameGrade.length > 0) return sameGrade[0];
    const otherGrades = allClasses.filter((c) => c.grade !== current.grade && !(itemCount > 0 && c.scoredItemIds.length === itemCount));
    if (otherGrades.length > 0) return otherGrades[0];
    return null;
  };

  // Sorted classes: unscored first within each grade
  const classesByGrade = (data?.classes ?? []).reduce(
    (acc, cls) => {
      const g = cls.grade;
      if (!acc[g]) acc[g] = [];
      acc[g].push(cls);
      return acc;
    },
    {} as Record<number, ClassData[]>
  );
  // Sort within each grade: incomplete first, then complete
  for (const grade in classesByGrade) {
    classesByGrade[Number(grade)].sort((a, b) => {
      const aComplete = isClassComplete(a);
      const bComplete = isClassComplete(b);
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return a.section - b.section;
    });
  }

  // Progress stats
  const completedClasses = (data?.classes ?? []).filter((c) => isClassComplete(c)).length;
  const totalClasses = data?.classes?.length ?? 0;

  // First unscored class for quick resume
  const firstUnscoredClass = (data?.classes ?? []).find((c) => !isClassComplete(c)) ?? null;

  // 重点关注：汇总所有班级近14天不达标的检查项目，按项目分组
  const focusItems = useMemo(() => {
    if (!data) return [];
    const itemClassMap = new Map<string, Set<string>>();
    for (const cls of data.classes) {
      for (const failedId of cls.recentFailedItemIds) {
        if (!itemClassMap.has(failedId)) itemClassMap.set(failedId, new Set());
        itemClassMap.get(failedId)!.add(cls.id);
      }
    }
    if (itemClassMap.size === 0) return [];
    const checkItemMap = new Map(data.checkItems.map((i) => [i.id, i]));
    return Array.from(itemClassMap.entries())
      .map(([itemId, classIds]) => {
        const item = checkItemMap.get(itemId);
        if (!item) return null;
        const classes = data.classes
          .filter((c) => classIds.has(c.id))
          .map((c) => ({ id: c.id, name: c.name }));
        return { itemId, code: item.code, title: itemTitle(item), classes };
      })
      .filter(Boolean) as Array<{ itemId: string; code: string | null; title: string; classes: Array<{ id: string; name: string }> }>;
  }, [data]);

  // 重点关注折叠状态
  const [focusCollapsed, setFocusCollapsed] = useState(false);

  // Items collapsed toggle
  const toggleItemsCollapsed = () => {
    const next = !itemsCollapsed;
    setItemsCollapsed(next);
    try { localStorage.setItem(ITEMS_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
  };

  // In-form progress: count touched items
  const touchedCount = selectedClass ? selectedClass.items.filter((item) => {
    // Either already scored from server, or touched in this session
    return item.hasBeenScored || touchedItems.has(item.id);
  }).length : 0;

  // ==================== Render ====================

  if (status === "loading" || status === "unauthenticated") {
    return <PageSkeleton cards={5} />;
  }

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
        <p className="text-v-text3 mt-1">
          {t("dateInfo", { date: data?.date ? formatDisplayDate(data.date, locale) : "—", count: data?.checkItems?.length ?? 0 })}
        </p>
      </div>

      {/* Plan status alerts */}
      {!loading && data && data.planSource === "none" && (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <p className="font-medium">{t("planAlertNone")}</p>
        </div>
      )}
      {!loading && data && data.planSource === "auto" && (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <p className="font-medium">{t("planAlertAuto")}</p>
        </div>
      )}
      {!loading && data && data.planSource === "fallback" && (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <p className="font-medium">{t("planAlertFallback")}</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400">
          <X className="h-6 w-6 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Alert toast */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto flex items-center gap-3 ${
              alert.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
                : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
            }`}
          >
            <span>{alert.message}</span>
            {alert.type === "error" && (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={dismissAlert}
                  className="text-xs px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
                >
                  {t("dismissError")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Spinner size="lg" color="primary" />
        </div>
      ) : !data ? null : (
        <>
          {/* Inspector Profile Panel */}
          {data.inspectorProfile && (
            <InspectorProfilePanel profile={data.inspectorProfile} t={t} />
          )}

          {/* Today's check items overview (collapsible) */}
          {data.checkItems.length > 0 && (
            <Card className="bg-v-card border border-v-border">
              <CardBody className="p-4">
                <button
                  onClick={toggleItemsCollapsed}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h2 className="font-semibold text-v-text1">{t("todayItems")}</h2>
                  {itemsCollapsed ? <ChevronDown className="h-4 w-4 text-v-text3" /> : <ChevronUp className="h-4 w-4 text-v-text3" />}
                </button>
                {!itemsCollapsed && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      {data.checkItems.map((item) => (
                        <Chip
                          key={item.id}
                          variant="flat"
                          size="sm"
                          classNames={{
                            base: "bg-v-hover",
                            content: "text-v-text2 text-xs",
                          }}
                        >
                          <span className="font-mono text-v-text3 mr-1">{item.code ?? ti("dynamic")}</span>
                          {itemTitle(item)}
                        </Chip>
                      ))}
                    </div>
                    {data.checkItems.some((item) => itemDesc(item)) && (
                      <div className="mt-3 pt-3 border-t border-v-border space-y-1.5">
                        {data.checkItems.map((item) => {
                          const desc = itemDesc(item);
                          return desc ? (
                            <p key={item.id} className="text-xs text-v-text3">
                              <span className="font-mono text-v-text4 mr-1.5">{item.code ?? ti("dynamic")}</span>
                              {desc}
                            </p>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* 重点关注：近14天不达标项目提醒 */}
          {focusItems.length > 0 && (
            <Card className="bg-v-card border border-amber-500/30">
              <CardBody className="p-4">
                <button
                  onClick={() => setFocusCollapsed(!focusCollapsed)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h2 className="font-semibold text-v-text1">{t("focusAlertTitle")}</h2>
                    <span className="text-xs text-amber-400 font-medium">
                      {t("focusAlertCount", { count: focusItems.length })}
                    </span>
                  </div>
                  {focusCollapsed ? <ChevronDown className="h-4 w-4 text-v-text3" /> : <ChevronUp className="h-4 w-4 text-v-text3" />}
                </button>
                {!focusCollapsed && (
                  <div className="mt-3 space-y-2.5">
                    <p className="text-xs text-v-text3">{t("focusAlertDesc")}</p>
                    {focusItems.map((fi) => (
                      <div key={fi.itemId} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-v-border">
                        <span className="text-sm font-medium text-v-text1 shrink-0">
                          {fi.code ? <span className="font-mono text-v-text3 mr-1">{fi.code}</span> : null}
                          {fi.title}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {fi.classes.map((cls) => (
                            <Chip
                              key={cls.id}
                              variant="flat"
                              size="sm"
                              classNames={{
                                base: "bg-amber-500/10 border border-amber-500/20",
                                content: "text-amber-400 text-xs font-medium",
                              }}
                            >
                              {cls.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Quick Resume Bar */}
          {!selectedClass && firstUnscoredClass && completedClasses > 0 && (
            <Card className="bg-v-card border border-v-border">
              <CardBody className="p-4">
                <button
                  onClick={() => handleSelectClass(firstUnscoredClass)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-primary" />
                    <span className="font-medium text-v-text1">
                      {t("continueClass", { name: firstUnscoredClass.name })}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-v-text3" />
                </button>
              </CardBody>
            </Card>
          )}

          {/* Progress summary + Class selection cards grouped by grade */}
          <div ref={classListRef} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-v-text1">{t("selectClass")}</h2>
              <span className="text-sm text-v-text3">
                {t("todayProgress", { done: completedClasses, total: totalClasses })}
              </span>
            </div>
            {Object.entries(classesByGrade)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([grade, classes]) => {
                const color = getGradeColor(Number(grade));
                return (
                  <div key={grade}>
                    <p className="text-sm font-medium text-v-text3 mb-2">{t("gradeLabel", { grade })}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {classes.map((cls) => {
                        const complete = isClassComplete(cls);
                        const isSelected = selectedClass?.id === cls.id;
                        return (
                          <Card
                            key={cls.id}
                            isPressable
                            className={`cursor-pointer transition-all duration-200 border-2 ${
                              isSelected
                                ? `${color.bg} ${color.border} ring-2 ${color.ring}`
                                : complete
                                  ? "bg-v-card border-v-border opacity-60 hover:opacity-80"
                                  : "bg-v-card border-v-border hover:bg-v-hover"
                            }`}
                            onPress={() => handleSelectClass(cls)}
                          >
                            <CardBody className="p-4">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-semibold text-sm truncate ${isSelected ? "text-v-text1" : "text-v-text2"}`}>
                                  {cls.name}
                                </span>
                                {complete ? (
                                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-v-text4 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <p className="text-xs text-v-text3">
                                  {t("itemCount", { scored: scoredCount(cls), total: totalCount })}
                                </p>
                                {!complete && (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handleQuickPass(cls);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleQuickPass(cls);
                                      }
                                    }}
                                    className="flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer"
                                  >
                                    <Zap className="h-3 w-3" />
                                    {t("quickPass")}
                                  </span>
                                )}
                              </div>
                            </CardBody>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Scoring form */}
          <div>
            {selectedClass ? (
              (() => {
                const color = getGradeColor(selectedClass.grade);
                return (
                  <Card className={`border-2 ${color.border} bg-transparent`}>
                    <div className={`${color.headerBg} px-5 py-4 flex items-center justify-between`}>
                      <h3
                        ref={scoringTitleRef}
                        className="flex items-center gap-2 text-white font-semibold scroll-mt-24"
                      >
                        <Button
                          isIconOnly
                          variant="light"
                          size="sm"
                          className="text-white/80 hover:text-white min-w-unit-8"
                          onPress={() => {
                            setSelectedClass(null);
                            setTouchedItems(new Set());
                          }}
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        {t("scoringHeader", { className: selectedClass.name })}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Chip
                          variant="flat"
                          size="sm"
                          classNames={{ base: "bg-white/20", content: "text-white text-xs" }}
                        >
                          {t("markedCount", { count: touchedCount, total: totalCount })}
                        </Chip>
                      </div>
                    </div>
                    <CardBody className={`${color.bg} p-5`}>
                      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
                        {selectedClass.items.map((item) => {
                          const passed = records[item.id]?.passed ?? true;
                          const comment = records[item.id]?.comment ?? "";
                          const showComment = expandedComments[item.id] ?? !passed;

                          // 审计权限判断
                          const myRole = session?.user?.role ?? "CLASS_TEACHER";
                          const myAuthority = getScoringAuthority(myRole);
                          const rec = item.record;
                          const existingScorerRole = rec?.scoredByRole;
                          const existingAuthority = existingScorerRole ? getScoringAuthority(existingScorerRole) : -1;
                          const isLockedByHigher = rec != null && existingAuthority > myAuthority && rec.scoredByName !== session?.user?.name;
                          const hasReview = rec?.reviewAction != null;

                          return (
                            <div
                              key={item.id}
                              className={`rounded-xl border bg-v-card p-4 space-y-3 ${isLockedByHigher ? "border-amber-500/40 opacity-80" : "border-v-border"}`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Chip
                                      variant="flat"
                                      size="sm"
                                      classNames={{
                                        base: "bg-v-hover",
                                        content: "text-v-text2 font-mono text-xs",
                                      }}
                                    >
                                      {item.code ?? "—"}
                                    </Chip>
                                    <span className="font-semibold text-v-text1">{itemTitle(item)}</span>
                                    {isLockedByHigher && (
                                      <Chip size="sm" variant="flat" startContent={<Lock className="h-3 w-3" />} classNames={{ base: "bg-amber-500/15", content: "text-amber-500 text-xs" }}>
                                        {t("lockedByHigher")}
                                      </Chip>
                                    )}
                                    {hasReview && (
                                      <Chip size="sm" variant="flat" startContent={<ShieldCheck className="h-3 w-3" />} classNames={{ base: "bg-blue-500/15", content: "text-blue-400 text-xs" }}>
                                        {t("reviewed")}
                                      </Chip>
                                    )}
                                  </div>
                                  {itemDesc(item) && (
                                    <p className="text-sm text-v-text3 mt-1">{itemDesc(item)}</p>
                                  )}
                                  {/* 审计信息：评分来源 */}
                                  {rec?.scoredByName && (
                                    <p className="text-xs text-v-text4 mt-1">
                                      {t("scoredByInfo", { name: rec.scoredByName, role: tc(`nav.roles.${rec.scoredByRole ?? "DUTY_TEACHER"}`) })}
                                      {hasReview && rec.reviewedByName && (
                                        <span className="ml-2">
                                          {t("reviewedByInfo", { name: rec.reviewedByName })}
                                        </span>
                                      )}
                                    </p>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isLockedByHigher}
                                    className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all min-h-[44px] ${
                                      isLockedByHigher ? "opacity-50 cursor-not-allowed border-v-border bg-v-input text-v-text4" :
                                      passed
                                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                                        : "border-v-border bg-v-input text-v-text3 hover:border-v-border-input"
                                    }`}
                                    onClick={() => !isLockedByHigher && handlePassChange(item.id, true)}
                                  >
                                    <Check className="h-4 w-4" />
                                    {t("pass")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLockedByHigher}
                                    className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all min-h-[44px] ${
                                      isLockedByHigher ? "opacity-50 cursor-not-allowed border-v-border bg-v-input text-v-text4" :
                                      !passed
                                        ? "border-red-500 bg-red-500/15 text-red-400"
                                        : "border-v-border bg-v-input text-v-text3 hover:border-v-border-input"
                                    }`}
                                    onClick={() => !isLockedByHigher && handlePassChange(item.id, false)}
                                  >
                                    <X className="h-4 w-4" />
                                    {t("fail")}
                                  </button>
                                </div>
                              </div>

                              {/* Fail expanded area: severity + comment */}
                              {!passed && (
                                <div className="pt-3 border-t border-v-border space-y-3">
                                  {/* Severity */}
                                  <div>
                                    <p className="text-sm font-medium text-v-text2 mb-2">{t("failSeverity")}</p>
                                    <div className="grid grid-cols-3 gap-2">
                                      {([
                                        { value: "minor", label: t("minor"), border: "border-amber-500", bg: "bg-amber-500/15", text: "text-amber-400" },
                                        { value: "moderate", label: t("moderate"), border: "border-orange-500", bg: "bg-orange-500/15", text: "text-orange-400" },
                                        { value: "serious", label: t("serious"), border: "border-red-500", bg: "bg-red-500/15", text: "text-red-400" },
                                      ] as const).map((opt) => {
                                        const selected = (records[item.id]?.severity ?? "minor") === opt.value;
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            className={`p-2.5 rounded-lg border text-sm font-medium text-center transition-all min-h-[44px] ${
                                              selected
                                                ? `${opt.border} ${opt.bg} ${opt.text}`
                                                : "border-v-border bg-v-input text-v-text3 hover:border-v-border-input"
                                            }`}
                                            onClick={() => handleSeverityChange(item.id, opt.value)}
                                          >
                                            {opt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {/* Comment */}
                                  <div>
                                    <button
                                      type="button"
                                      className="flex items-center gap-2 text-sm text-v-text2 hover:text-v-text1 transition-colors"
                                      onClick={() => toggleCommentExpanded(item.id)}
                                    >
                                      <MessageSquare className="h-4 w-4" />
                                      {showComment ? t("collapseComment") : t("addComment")}
                                    </button>
                                    {showComment && (
                                      <Textarea
                                        placeholder={t("commentPlaceholder")}
                                        value={comment}
                                        onValueChange={(val) => handleCommentChange(item.id, val)}
                                        minRows={2}
                                        variant="bordered"
                                        classNames={{
                                          base: "w-full max-w-full min-w-0",
                                          inputWrapper: "border-v-border-input bg-v-input mt-2 !max-w-full",
                                          input: "text-v-text2 placeholder:text-v-text4",
                                        }}
                                      />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Desktop submit buttons */}
                        <div className="hidden sm:flex items-center gap-3">
                          <Button
                            type="submit"
                            isLoading={submitting}
                            spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                            startContent={!submitting ? <Save className="h-4 w-4" /> : undefined}
                            className={`bg-gradient-to-r ${color.gradientFrom} ${color.gradientTo} text-white`}
                          >
                            {t("saveRecord")}
                          </Button>
                          <Button
                            type="button"
                            isLoading={submitting}
                            spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                            startContent={!submitting ? <ArrowRight className="h-4 w-4" /> : undefined}
                            variant="bordered"
                            className="border-v-border text-v-text2"
                            onPress={() => {
                              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                              handleSubmit(fakeEvent, true);
                            }}
                          >
                            {t("saveAndNext")}
                          </Button>
                        </div>
                      </form>
                    </CardBody>
                  </Card>
                );
              })()
            ) : (
              <Card className="bg-v-card border border-dashed border-v-border">
                <CardBody className="flex flex-col items-center justify-center py-16 text-center">
                  <ClipboardCheck className="h-12 w-12 text-v-text4 mb-3" />
                  <p className="text-v-text3 font-medium">{t("emptyTitle")}</p>
                  <p className="text-sm text-v-text4 mt-1">{t("emptySubtitle")}</p>
                </CardBody>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Sticky bottom bar (mobile only, when form is visible) */}
      {selectedClass && !loading && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-v-card/95 backdrop-blur-sm border-t border-v-border px-4 py-3 flex items-center gap-3">
          <Button
            isLoading={submitting}
            spinner={<Loader2 className="h-4 w-4 animate-spin" />}
            startContent={!submitting ? <Save className="h-4 w-4" /> : undefined}
            className={`flex-1 bg-gradient-to-r ${getGradeColor(selectedClass.grade).gradientFrom} ${getGradeColor(selectedClass.grade).gradientTo} text-white`}
            onPress={() => {
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSubmit(fakeEvent, false);
            }}
          >
            {t("saveRecord")}
          </Button>
          <Button
            isLoading={submitting}
            spinner={<Loader2 className="h-4 w-4 animate-spin" />}
            startContent={!submitting ? <ArrowRight className="h-4 w-4" /> : undefined}
            variant="bordered"
            className="flex-1 border-v-border text-v-text2"
            onPress={() => {
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSubmit(fakeEvent, true);
            }}
          >
            {t("saveAndNext")}
          </Button>
        </div>
      )}

      {/* Quick Pass Confirmation Modal */}
      <Modal
        isOpen={quickPassModal.isOpen}
        onClose={quickPassModal.onClose}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-black/50",
          base: "bg-v-card border border-v-border shadow-xl rounded-2xl mx-4",
          header: "border-b border-v-border",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-base font-semibold text-v-text1">{t("quickPass")}</span>
              {quickPassClass && (
                <span className="ml-2 text-sm font-normal text-v-text3">
                  {quickPassClass.name}
                </span>
              )}
            </div>
          </ModalHeader>
          <ModalBody className="py-5">
            {quickPassItem && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-v-text2 leading-relaxed">
                  {t("quickPassConfirm", { item: quickPassItem.title })}
                </p>
                <div className={`rounded-xl px-3.5 py-2.5 border ${quickPassItem.isRecentFailed ? "bg-red-500/5 border-red-500/20" : "bg-v-hover/60 border-v-border"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-v-text3">{t(quickPassItem.isRecentFailed ? "quickPassRecentFailed" : "quickPassSpotCheck")}</p>
                    {quickPassItem.isRecentFailed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
                        {t("quickPassFailedTag")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-v-text1 mt-1">
                    {quickPassItem.code ? `${quickPassItem.code} ` : ""}{quickPassItem.title}
                  </p>
                  {quickPassItem.description && (
                    <p className="text-xs text-v-text3 mt-1.5 leading-relaxed">
                      {quickPassItem.description}
                    </p>
                  )}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter className="gap-2.5">
            <Button
              variant="flat"
              className="rounded-xl bg-v-hover text-v-text2 font-medium min-h-[44px]"
              onPress={quickPassToDetail}
            >
              {t("quickPassDetail")}
            </Button>
            <Button
              color="primary"
              className="rounded-xl font-medium min-h-[44px]"
              isLoading={quickPassSubmitting}
              spinner={<Loader2 className="h-4 w-4 animate-spin" />}
              onPress={confirmQuickPass}
            >
              {t("quickPassSubmit")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
