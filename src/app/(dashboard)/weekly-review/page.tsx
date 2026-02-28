"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Spinner,
  Textarea,
  Tabs,
  Tab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import {
  ClipboardList,
  Loader2,
  Save,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Circle,
  Info,
  AlertTriangle,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { PageSkeleton } from "@/components/skeletons";

interface WeekInfo {
  startDate: string;
  endDate: string;
  friday: string;
}

interface WeeklyItem {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
}

interface ClassData {
  id: string;
  name: string;
  grade: number;
  section: number;
  weeklyRecords: Array<{
    checkItemId: string;
    optionValue: string | null;
    comment: string | null;
    checkItem: { code: string | null };
  }>;
  completedItems: number;
  totalItems: number;
  currentGrade: string | null;
  dailyPassRate: number | null;
  dailyTotal: number;
  dailyPassed: number;
}

interface GradeSuggestion {
  grade: "A" | "B" | "C";
  reason: string;
  confidence: "high" | "medium" | "low";
  dailyTotal: number;
  dailyPassed: number;
  dailyPassRate: number;
}

interface DeadlineInfo {
  open: boolean;
  allowed: boolean;
  isOverride: boolean;
  deadline: string | null;
}

interface ApiResponse {
  week: WeekInfo;
  weekParam: string;
  weeklyItems: WeeklyItem[];
  classes: ClassData[];
  gradeSuggestion?: GradeSuggestion | null;
  deadlineInfo?: DeadlineInfo | null;
}

const GRADE_COLORS = {
  A: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  B: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  C: "text-amber-400 bg-amber-500/15 border-amber-500/30",
} as const;

function needsComment(code: string | null, value: string) {
  // W-1~W-4 选择 1 或 ≥2 时需填写说明
  if (["W-1", "W-2", "W-3", "W-4"].includes(code || "")) {
    return value === "1" || value === "gte2";
  }
  // W-5 选择后需填写评定说明
  if (code === "W-5") return !!value;
  return false;
}

const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

export default function WeeklyReviewPage() {
  const t = useTranslations("weeklyReview");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
  const itemDesc = (item: { code?: string | null; description?: string | null }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(`desc.${item.code}`) : (item.description ?? "");
  const { data: session, status } = useSession();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, { optionValue: string; comment: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [weekTab, setWeekTab] = useState<string>("current");
  const [aiCommentLoading, setAiCommentLoading] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const classListRef = useRef<HTMLDivElement | null>(null);
  const formTitleRef = useRef<HTMLSpanElement | null>(null);

  const W1_W4_OPTIONS = useMemo(
    () => [
      { value: "0", label: t("optionZero") },
      { value: "1", label: t("optionOne") },
      { value: "gte2", label: t("optionGte2") },
    ],
    [t]
  );

  const W5_OPTIONS = useMemo(
    () => [
      { value: "A", label: t("gradeA"), color: "text-emerald-400" },
      { value: "B", label: t("gradeB"), color: "text-blue-400" },
      { value: "C", label: t("gradeC"), color: "text-amber-400" },
    ],
    [t]
  );

  const CONFIDENCE_LABELS = useMemo(
    () => ({
      high: { label: t("confidenceHigh"), color: "text-emerald-400" },
      medium: { label: t("confidenceMedium"), color: "text-amber-400" },
      low: { label: t("confidenceLow"), color: "text-red-400" },
    }),
    [t]
  );

  const getOptionsForCode = useCallback(
    (code: string | null) => {
      if (code === "W-1" || code === "W-2" || code === "W-3" || code === "W-4") return W1_W4_OPTIONS;
      if (code === "W-5") return W5_OPTIONS;
      return [];
    },
    [W1_W4_OPTIONS, W5_OPTIONS]
  );

  const fetchData = useCallback(async (classId?: string, week?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      params.set("week", week ?? weekTab);
      const res = await fetch(`/api/weekly-review?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("loadFailed"));
      }
      const json: ApiResponse = await res.json();
      // 仅全量查询（无 classId）时才直接设置 data；
      // 带 classId 的查询只返回数据，由调用方负责合并，避免覆盖其他班级的已有状态
      if (!classId) {
        setData(json);
      }
      return json;
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : tc("loadFailed") });
      if (!classId) setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [weekTab]);

  useEffect(() => {
    if (status === "unauthenticated") return;
    setSelectedClass(null);
    setFormValues({});
    fetchData(undefined, weekTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, weekTab, fetchData]);

  const handleSelectClass = useCallback(
    async (cls: ClassData) => {
      setSelectedClass(cls);
      setFormValues({});
      const newData = await fetchData(cls.id, weekTab);
      if (newData) {
        setData((prev) => {
          if (!prev) return newData;
          const mergedClasses = prev.classes.map((c) =>
            c.id === cls.id ? (newData.classes.find((nc) => nc.id === cls.id) ?? c) : c
          );
          return { ...newData, classes: mergedClasses };
        });
      }
    },
    [fetchData, weekTab]
  );

  useEffect(() => {
    if (!selectedClass || !data?.weeklyItems) return;
    const initial: Record<string, { optionValue: string; comment: string }> = {};
    for (const item of data.weeklyItems) {
      const record = selectedClass.weeklyRecords.find((r) => r.checkItemId === item.id);
      initial[item.id] = {
        optionValue: record?.optionValue ?? "",
        comment: record?.comment ?? "",
      };
    }
    setFormValues(initial);
  }, [selectedClass?.id, selectedClass?.weeklyRecords, data?.weeklyItems]);

  useEffect(() => {
    if (!selectedClass) return;
    formTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedClass?.id]);

  const handleOptionChange = (itemId: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { optionValue: "", comment: "" }), optionValue: value },
    }));
  };

  const handleCommentChange = (itemId: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { optionValue: "", comment: "" }), comment: value },
    }));
  };

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  // 采纳 AI 等级建议（固定规则）
  const handleAcceptSuggestion = () => {
    if (!data?.gradeSuggestion || !data.weeklyItems) return;
    const w5Item = data.weeklyItems.find((i) => i.code === "W-5");
    if (!w5Item) return;
    handleOptionChange(w5Item.id, data.gradeSuggestion.grade);
    handleCommentChange(
      w5Item.id,
      t("aiCommentPrefix", { reason: data.gradeSuggestion.reason })
    );
  };

  // AI 生成 W-5 评定说明（LLM 文字建议）
  const handleGenerateAiComment = async () => {
    if (!selectedClass || !data?.weeklyItems) return;
    const w5Item = data.weeklyItems.find((i) => i.code === "W-5");
    if (!w5Item) return;
    const currentGrade = formValues[w5Item.id]?.optionValue;
    if (!currentGrade) {
      showAlert("error", t("selectGradeFirst"));
      return;
    }

    setAiCommentLoading(true);
    try {
      const params = new URLSearchParams({
        classId: selectedClass.id,
        week: weekTab,
        grade: currentGrade,
      });
      const res = await fetch(`/api/weekly-review/suggest?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("aiGenerateFailed"));
      }
      const json = await res.json();
      if (json.comment) {
        handleCommentChange(w5Item.id, json.comment);
        showAlert("success", t("aiCommentGenerated"));
      }
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("aiGenerateFailed"));
    } finally {
      setAiCommentLoading(false);
    }
  };

  // 校验表单数据，返回 records 数组或 null（校验失败）
  const validateForm = (): Array<{ checkItemId: string; optionValue: string; comment?: string }> | null => {
    if (!selectedClass || !data?.weeklyItems) return null;

    const records: Array<{ checkItemId: string; optionValue: string; comment?: string }> = [];
    for (const item of data.weeklyItems) {
      const v = formValues[item.id];
      const optionValue = v?.optionValue?.trim();
      if (!optionValue) {
        showAlert("error", t("validationIncomplete", { title: itemTitle(item) }));
        return null;
      }
      const comment = v?.comment?.trim();
      // W-1~W-4 有问题需备注；W-5 必填说明
      if (item.code === "W-5" && !comment) {
        showAlert("error", t("validationCommentRequired", { title: itemTitle(item) }));
        return null;
      }
      if (needsComment(item.code, optionValue) && item.code !== "W-5" && !comment) {
        showAlert("error", t("validationNeedsExplanation", { title: itemTitle(item) }));
        return null;
      }
      records.push({
        checkItemId: item.id,
        optionValue,
        ...(comment ? { comment } : {}),
      });
    }
    return records;
  };

  // 实际提交逻辑
  const doSubmit = async (records: Array<{ checkItemId: string; optionValue: string; comment?: string }>) => {
    if (!selectedClass) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedClass.id, records, week: weekTab }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("submitFailed"));
      }
      showAlert("success", t("weeklySaved"));
      const newData = await fetchData(selectedClass.id, weekTab);
      if (newData) {
        setData((prev) => {
          if (!prev) return newData;
          const mergedClasses = prev.classes.map((c) =>
            c.id === selectedClass.id ? (newData.classes.find((nc) => nc.id === selectedClass.id) ?? c) : c
          );
          return { ...newData, classes: mergedClasses };
        });
        setSelectedClass(null);
        setFormValues({});
        classListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const records = validateForm();
    if (!records) return;

    // 如果管理员超期操作，弹出确认对话框
    const di = data?.deadlineInfo;
    if (di && di.isOverride) {
      setShowOverrideConfirm(true);
      return;
    }

    await doSubmit(records);
  };

  // 管理员确认超期提交
  const handleConfirmOverride = async () => {
    setShowOverrideConfirm(false);
    const records = validateForm();
    if (!records) return;
    await doSubmit(records);
  };

  const classesByGrade = (data?.classes ?? []).reduce(
    (acc, cls) => {
      const g = cls.grade;
      if (!acc[g]) acc[g] = [];
      acc[g].push(cls);
      return acc;
    },
    {} as Record<number, ClassData[]>
  );

  const isClassComplete = (cls: ClassData) =>
    cls.completedItems >= cls.totalItems && cls.totalItems > 0;

  if (status === "loading" || status === "unauthenticated") {
    return <PageSkeleton cards={4} />;
  }

  return (
    <div className="space-y-6">
      {/* Header + Week Tab */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-v-text1 flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-blue-400" />
            {t("title")}
          </h1>
          <p className="text-v-text3 mt-1">
            {data?.week ? `${data.week.startDate} ~ ${data.week.endDate}` : "—"}
            {weekTab === "previous" && (
              <span className="ml-2 text-amber-400 text-sm">{t("supplementPrevious")}</span>
            )}
          </p>
        </div>
        <Tabs
          selectedKey={weekTab}
          onSelectionChange={(key) => setWeekTab(key as string)}
          variant="bordered"
          size="sm"
          classNames={{
            tabList: "bg-v-card border-v-border",
            tab: "text-v-text3",
            cursor: "bg-v-hover",
          }}
        >
          <Tab key="current" title={t("currentWeek")} />
          <Tab key="previous" title={t("previousWeek")} />
        </Tabs>
      </div>

      {/* Deadline info banner */}
      {data?.deadlineInfo && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm ${
            data.deadlineInfo.open
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : data.deadlineInfo.isOverride
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          {data.deadlineInfo.open ? (
            <>
              <Clock className="h-4 w-4 shrink-0" />
              <span>{t("deadlineOpen", { date: data.deadlineInfo.deadline ?? "" })}</span>
            </>
          ) : data.deadlineInfo.isOverride ? (
            <>
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{t("deadlineClosed", { date: data.deadlineInfo.deadline ?? "" })}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("deadlineClosed", { date: data.deadlineInfo.deadline ?? "" })}</span>
            </>
          )}
        </div>
      )}

      {/* Admin override confirmation modal */}
      <Modal
        isOpen={showOverrideConfirm}
        onClose={() => setShowOverrideConfirm(false)}
        classNames={{
          base: "bg-v-card border border-v-border",
          header: "border-b border-v-border",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            <span className="text-v-text1">{t("adminOverrideTitle")}</span>
          </ModalHeader>
          <ModalBody>
            <p className="text-v-text2">{t("adminOverrideMessage")}</p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              className="text-v-text3"
              onPress={() => setShowOverrideConfirm(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              className="bg-amber-500/20 text-amber-400 border border-amber-500/30"
              onPress={handleConfirmOverride}
            >
              {t("adminOverrideConfirm")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto ${
              alert.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
                : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
            }`}
          >
            {alert.message}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Spinner size="lg" color="primary" />
        </div>
      ) : !data?.classes?.length ? (
        <Card className="bg-v-card border border-dashed border-v-border">
          <CardBody className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-12 w-12 text-v-text4 mb-3" />
            <p className="text-v-text3 font-medium">{t("noClasses")}</p>
            <p className="text-sm text-v-text4 mt-1">{t("noClassesHint")}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Class selection */}
          <div ref={classListRef} className="space-y-3">
            <h2 className="font-semibold text-v-text1">{t("selectClass")}</h2>
            {Object.entries(classesByGrade)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([grade, classes]) => (
                <div key={grade}>
                  <p className="text-sm font-medium text-v-text3 mb-2">{t("gradeLabel", { grade })}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                    {classes.map((cls) => {
                      const isSelected = selectedClass?.id === cls.id;
                      const complete = isClassComplete(cls);
                      const gradeColor =
                        cls.currentGrade && GRADE_COLORS[cls.currentGrade as keyof typeof GRADE_COLORS]
                          ? GRADE_COLORS[cls.currentGrade as keyof typeof GRADE_COLORS]
                          : "text-v-text2 bg-v-input border-v-border";
                      return (
                        <Card
                          key={cls.id}
                          isPressable
                          className={`cursor-pointer transition-all duration-200 border-2 ${
                            isSelected
                              ? "bg-v-hover border-blue-500/50 ring-2 ring-blue-500/30"
                              : "bg-v-card border-v-border hover:bg-v-hover hover:border-v-border-hover"
                          }`}
                          onPress={() => handleSelectClass(cls)}
                        >
                          <CardBody className="p-3">
                            <div className="flex items-center justify-between gap-1.5">
                              <span
                                className={`font-semibold text-sm truncate ${
                                  isSelected ? "text-v-text1" : "text-v-text2"
                                }`}
                              >
                                {cls.name}
                              </span>
                              {complete ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-v-text4 shrink-0" />
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {cls.dailyPassRate != null && (
                                <Chip
                                  variant="flat"
                                  size="sm"
                                  classNames={{
                                    base: "bg-v-input",
                                    content: "text-v-text3 text-xs",
                                  }}
                                >
                                  {t("dailyRate", { rate: cls.dailyPassRate })}
                                </Chip>
                              )}
                              {cls.currentGrade && (
                                <Chip
                                  variant="bordered"
                                  size="sm"
                                  classNames={{
                                    base: `border ${gradeColor}`,
                                    content: "text-xs font-medium",
                                  }}
                                >
                                  {cls.currentGrade}
                                </Chip>
                              )}
                            </div>
                          </CardBody>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          {/* Form when class selected */}
          {selectedClass && (
            <Card className="bg-v-card border border-v-border">
              <CardBody className="p-5 space-y-6 overflow-visible">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <Button
                    variant="light"
                    size="sm"
                    className="text-v-text3 hover:text-v-text1 -ml-2"
                    startContent={<ArrowLeft className="h-4 w-4" />}
                    onPress={() => setSelectedClass(null)}
                  >
                    {t("backToSelect")}
                  </Button>
                  <span
                    ref={formTitleRef}
                    className="text-v-text2 font-medium scroll-mt-24"
                  >
                    {selectedClass.name}
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {data?.weeklyItems.map((item, idx) => {
                    const isW5 = item.code === "W-5";
                    const isAbnormalGroup = ["W-2", "W-3", "W-4"].includes(item.code ?? "");
                    const isFirstAbnormal = item.code === "W-2";
                    const value = formValues[item.id]?.optionValue ?? "";
                    const comment = formValues[item.id]?.comment ?? "";
                    const showComment = isW5 ? !!value : needsComment(item.code, value);
                    const suggestion = isW5 ? data.gradeSuggestion : null;

                    if (isW5) {
                      // === W-5 特殊布局：AI 建议 + 人工确认 ===
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border-2 border-blue-500/30 bg-blue-500/5 p-5 space-y-4"
                        >
                          <div>
                            <p className="font-semibold text-v-text1 text-lg">{itemTitle(item)}</p>
                            {itemDesc(item) && (
                              <p className="text-sm text-v-text3 mt-0.5">{itemDesc(item)}</p>
                            )}
                          </div>

                          {/* AI Suggestion Card */}
                          {suggestion && (
                            <div className="rounded-lg border border-v-border bg-v-card p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium text-v-text1">{t("aiSuggestion")}</span>
                                <Chip
                                  variant="flat"
                                  size="sm"
                                  classNames={{
                                    base: `${GRADE_COLORS[suggestion.grade]}`,
                                    content: "text-xs font-bold",
                                  }}
                                >
                                  {suggestion.grade}
                                </Chip>
                                <span className={`text-xs ${CONFIDENCE_LABELS[suggestion.confidence].color}`}>
                                  {CONFIDENCE_LABELS[suggestion.confidence].label}
                                </span>
                              </div>
                              <p className="text-sm text-v-text3">{suggestion.reason}</p>
                              <div className="flex items-center gap-3 text-xs text-v-text4">
                                <span>{t("dailyStats", { passed: suggestion.dailyPassed, total: suggestion.dailyTotal })}</span>
                                <span>{t("passRate", { rate: suggestion.dailyPassRate })}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="bordered"
                                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                                startContent={<Sparkles className="h-3.5 w-3.5" />}
                                onPress={handleAcceptSuggestion}
                              >
                                {t("acceptSuggestion")}
                              </Button>
                            </div>
                          )}

                          {/* Manual override */}
                          <div>
                            <p className="text-sm font-medium text-v-text2 mb-2 flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5" />
                              {t("manualOverride")}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {W5_OPTIONS.map((opt) => {
                                const selected = value === opt.value;
                                const colorMap = {
                                  A: { border: "border-emerald-500", bg: "bg-emerald-500/15" },
                                  B: { border: "border-blue-500", bg: "bg-blue-500/15" },
                                  C: { border: "border-amber-500", bg: "bg-amber-500/15" },
                                } as const;
                                const colors = colorMap[opt.value as keyof typeof colorMap];
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={`p-3 rounded-lg border text-sm font-medium text-center transition-all ${
                                      selected
                                        ? `${colors.border} ${colors.bg} ${opt.color}`
                                        : "border-v-border bg-v-input text-v-text3 hover:border-v-border-input"
                                    }`}
                                    onClick={() => handleOptionChange(item.id, opt.value)}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* W-5 必填评定说明 */}
                          {showComment && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-v-text2">{t("commentLabel")}</span>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  className="bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                                  startContent={aiCommentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                  isLoading={aiCommentLoading}
                                  onPress={handleGenerateAiComment}
                                >
                                  {t("aiGenerateComment")}
                                </Button>
                              </div>
                              <Textarea
                                placeholder={t("commentPlaceholder")}
                                value={comment}
                                onValueChange={(v) => handleCommentChange(item.id, v)}
                                minRows={3}
                                isRequired
                                variant="flat"
                                classNames={{
                                  base: "w-full",
                                  inputWrapper: "bg-v-input",
                                  input: "text-v-text1 placeholder:text-v-text4",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    }

                    // === W-1~W-4 常规布局 ===
                    const options = getOptionsForCode(item.code);
                    const itemBlock = (
                      <div
                        key={item.id}
                        className={`rounded-xl border border-v-border ${isAbnormalGroup ? "bg-amber-500/5 border-amber-500/20" : "bg-v-input/50"} p-4 space-y-3`}
                      >
                        <div>
                          <p className="font-semibold text-v-text1">{itemTitle(item)}</p>
                          {itemDesc(item) && (
                            <p className="text-sm text-v-text3 mt-0.5">{itemDesc(item)}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {options.map((opt) => {
                            const selected = value === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={`p-2.5 rounded-lg border text-sm font-medium text-center transition-all ${
                                  selected
                                    ? "border-blue-500 bg-blue-500/15 text-blue-400"
                                    : "border-v-border bg-v-input text-v-text3 hover:border-v-border-input"
                                }`}
                                onClick={() => handleOptionChange(item.id, opt.value)}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        {showComment && (
                          <Textarea
                            label={t("detailCommentLabel")}
                            labelPlacement="outside"
                            placeholder={t("detailCommentPlaceholder")}
                            value={comment}
                            onValueChange={(v) => handleCommentChange(item.id, v)}
                            minRows={3}
                            isRequired
                            variant="flat"
                            classNames={{
                              base: "w-full",
                              label: "text-v-text2 font-medium",
                              inputWrapper: "bg-v-input",
                              input: "text-v-text1 placeholder:text-v-text4",
                            }}
                          />
                        )}
                      </div>
                    );

                    // W-2 前面插入异常情况分组标题
                    if (isFirstAbnormal) {
                      return (
                        <div key={`abnormal-group-${item.id}`} className="space-y-3">
                          <div className="flex items-center gap-2 pt-2">
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                            <span className="text-sm font-semibold text-amber-400">{t("abnormalGroupTitle")}</span>
                            <div className="flex-1 border-t border-amber-500/20" />
                          </div>
                          {itemBlock}
                        </div>
                      );
                    }

                    return itemBlock;
                  })}

                  {/* Summary card */}
                  {(data?.gradeSuggestion ?? selectedClass.dailyPassRate != null) && (
                    <Card className="bg-v-card border border-v-border">
                      <CardBody className="p-4">
                        <h3 className="font-semibold text-v-text1 mb-3">{t("dailyPassStats")}</h3>
                        <div className="flex flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-v-text3 text-sm">{t("dailyLabel")}</span>
                            <span className="text-v-text1 font-medium">
                              {t("passedCount", {
                                passed: (data?.gradeSuggestion ?? selectedClass).dailyPassed ?? 0,
                                total: (data?.gradeSuggestion ?? selectedClass).dailyTotal ?? 0,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-v-text3 text-sm">{t("passRate", { rate: (data?.gradeSuggestion ?? selectedClass).dailyPassRate ?? 0 })}</span>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {/* 截止后非管理员不允许提交 */}
                  {data?.deadlineInfo && !data.deadlineInfo.allowed ? (
                    <div className="text-center text-sm text-red-400 py-2">
                      {t("deadlineClosed", { date: data.deadlineInfo.deadline ?? "" })}
                    </div>
                  ) : (
                    <Button
                      type="submit"
                      isLoading={submitting}
                      spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                      startContent={!submitting ? <Save className="h-4 w-4" /> : undefined}
                      className={
                        data?.deadlineInfo?.isOverride
                          ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white"
                          : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                      }
                    >
                      {t("saveWeekly")}
                    </Button>
                  )}
                </form>
              </CardBody>
            </Card>
          )}

          {!selectedClass && (
            <Card className="bg-v-card border border-dashed border-v-border">
              <CardBody className="flex flex-col items-center justify-center py-12 text-center">
                <Circle className="h-12 w-12 text-v-text4 mb-3" />
                <p className="text-v-text3 font-medium">{t("emptyTitle")}</p>
                <p className="text-sm text-v-text4 mt-1">{t("emptySubtitle")}</p>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
