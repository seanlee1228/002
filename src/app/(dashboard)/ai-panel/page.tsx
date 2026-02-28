"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Button as HButton,
  Chip,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  Input,
  Select,
  SelectItem,
  Switch,
  Slider,
} from "@heroui/react";
import { useChartTheme } from "@/lib/echarts-theme";
import { useLocale } from "@/components/locale-provider";
import { PageSkeleton } from "@/components/skeletons";
import {
  Brain,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Settings,
  History,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Coins,
  Eye,
  Save,
  Thermometer,
  Hash,
  Cpu,
  FileText,
  ToggleRight,
  Check,
  X,
} from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ===== Types =====

interface AnalysisRecord {
  id: string;
  scope: string;
  tokens: number;
  model: string;
  createdAt: string;
}

interface StatusData {
  date: string;
  configured: boolean;
  model: string;
  analyses: AnalysisRecord[];
  todayTokens: number;
  allTimeTotalTokens: number;
  allTimeTotalRecords: number;
}

interface HistoryDay {
  date: string;
  scopes: string[];
  totalTokens: number;
  recordCount: number;
  latestAt: string;
}

interface DetailRecord {
  id: string;
  date: string;
  scope: string;
  content: unknown;
  model: string;
  tokens: number;
  createdAt: string;
}

interface CostData {
  days: Array<Record<string, unknown> & { date: string; total: number }>;
  scopes: string[];
}

interface ModuleConfig {
  scope: string;
  label: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  model: string;
  isActive: boolean;
  updatedAt: string | null;
}

const SCOPE_COLORS: Record<string, string> = {
  duty: "#ec4899",
  "class-summary": "#8b5cf6",
  "grade-report": "#06b6d4",
};

/** 每个配置 scope 对应的 User Prompt 模板说明（从翻译文件读取） */
const PROMPT_DESC_KEYS: Record<string, string> = {
  duty: "promptDescDuty",
  "class-summary": "promptDescClassSummary",
  "grade-report": "promptDescGradeReport",
};

// ===== Component =====

export default function AiPanelPage() {
  const t = useTranslations("aiPanel");
  const tc = useTranslations("common");
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const ct = useChartTheme();
  const { locale } = useLocale();
  const timeLocale = locale === "zh" ? "zh-CN" : "en-US";

  const SCOPE_LABELS = useMemo(
    () =>
      ({
        duty: t("scopeDuty"),
        "class-summary": t("scopeClassSummary"),
        "grade-report": t("scopeGradeReport"),
      }) as Record<string, string>,
    [t]
  );

  const REMOVED_SCOPES = useMemo(
    () =>
      ({
        "daily-recommend": t("removedDailyRecommend"),
        global: t("removedGlobal"),
        "grade-1": t("removedGrade1"),
        "grade-2": t("removedGrade2"),
        "grade-3": t("removedGrade3"),
      }) as Record<string, string>,
    [t]
  );

  const MODEL_OPTIONS = useMemo(
    () => [
      { key: "deepseek-chat", label: t("modelV3") },
      { key: "deepseek-reasoner", label: t("modelR1") },
    ],
    [t]
  );

  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [historyDays, setHistoryDays] = useState<HistoryDay[]>([]);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [detailRecords, setDetailRecords] = useState<DetailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScopes, setRunningScopes] = useState<Set<string>>(new Set());
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<"status" | "history" | "cost">("status");

  // Module config state
  const [moduleConfigs, setModuleConfigs] = useState<ModuleConfig[]>([]);
  const [configModalScope, setConfigModalScope] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Partial<ModuleConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveMsg, setConfigSaveMsg] = useState<string | null>(null);
  // Preview scope for JSON content
  const [previewScope, setPreviewScope] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";

  // ===== Data fetching =====
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/admin?mode=status");
      if (res.ok) setStatusData(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/admin?mode=history");
      if (res.ok) {
        const data = await res.json();
        setHistoryDays(data.days || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCost = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/admin?mode=cost");
      if (res.ok) setCostData(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchDetail = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/ai/admin?mode=detail&date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setDetailRecords(data.records || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/config");
      if (res.ok) {
        const data = await res.json();
        setModuleConfigs(data.configs || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.push("/login"); return; }
    if (authStatus !== "authenticated" || !isAdmin) return;

    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchHistory(), fetchCost(), fetchConfigs()]);
      setLoading(false);
    };
    loadAll();
  }, [authStatus, isAdmin, router, fetchStatus, fetchHistory, fetchCost, fetchConfigs]);

  // ===== Handlers =====
  const runScope = async (scope: string) => {
    setRunningScopes((prev) => new Set(prev).add(scope));
    try {
      const res = await fetch("/api/ai/daily-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: [scope] }),
      });
      await res.json();
      await fetchStatus();
    } catch { /* ignore */ }
    setRunningScopes((prev) => {
      const next = new Set(prev);
      next.delete(scope);
      return next;
    });
  };

  const runAll = async () => {
    setRunAllLoading(true);
    try {
      const res = await fetch("/api/ai/daily-analysis", { method: "POST" });
      await res.json();
      await Promise.all([fetchStatus(), fetchHistory(), fetchCost()]);
    } catch { /* ignore */ }
    setRunAllLoading(false);
  };

  // Open config modal
  const openConfigModal = (configScope: string) => {
    const cfg = moduleConfigs.find((c) => c.scope === configScope);
    setConfigForm({
      scope: configScope,
      systemPrompt: cfg?.systemPrompt ?? "",
      temperature: cfg?.temperature ?? 0.3,
      maxTokens: cfg?.maxTokens ?? 2000,
      model: cfg?.model ?? "deepseek-chat",
      isActive: cfg?.isActive ?? true,
    });
    setConfigSaveMsg(null);
    setConfigModalScope(configScope);
    // Also fetch latest detail for preview
    if (statusData?.date) {
      fetchDetail(statusData.date);
    }
  };

  const saveConfig = async () => {
    if (!configModalScope) return;
    setSavingConfig(true);
    setConfigSaveMsg(null);
    try {
      const res = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      });
      if (res.ok) {
        setConfigSaveMsg(t("saveSuccess"));
        await fetchConfigs();
        setTimeout(() => setConfigSaveMsg(null), 2000);
      } else {
        const data = await res.json();
        setConfigSaveMsg(t("saveFailed", { error: data.error }));
      }
    } catch {
      setConfigSaveMsg(t("saveNetworkError"));
    }
    setSavingConfig(false);
  };

  // Toggle isActive directly from card
  const toggleActive = async (configScope: string, newVal: boolean) => {
    try {
      await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: configScope, isActive: newVal }),
      });
      await fetchConfigs();
    } catch { /* ignore */ }
  };

  // ===== Scope analysis map =====
  const scopeMap = useMemo(() => {
    const map: Record<string, AnalysisRecord | null> = {};
    if (statusData?.analyses) {
      for (const a of statusData.analyses) map[a.scope] = a;
    }
    return map;
  }, [statusData]);

  // Preview JSON for config modal
  const previewDetail = useMemo(() => {
    if (!configModalScope) return null;
    // For class-summary config, find any class-summary-* record
    if (configModalScope === "class-summary") {
      return detailRecords.find((r) => r.scope.startsWith("class-summary-")) || null;
    }
    return detailRecords.find((r) => r.scope === configModalScope) || null;
  }, [configModalScope, detailRecords]);

  // History detail
  useEffect(() => {
    if (selectedHistoryDate) {
      fetchDetail(selectedHistoryDate);
    }
  }, [selectedHistoryDate, fetchDetail]);

  // Preview scope detail
  useEffect(() => {
    if (previewScope && statusData?.date) {
      fetchDetail(statusData.date);
    }
  }, [previewScope, statusData?.date, fetchDetail]);

  const previewScopeDetail = useMemo(() => {
    if (!previewScope) return null;
    return detailRecords.find((r) => r.scope === previewScope) || null;
  }, [previewScope, detailRecords]);

  // ===== Cost chart =====
  const costChartOption = useMemo(() => {
    if (!costData?.days?.length) return null;

    const scopes = costData.scopes;
    const dates = costData.days.map((d) => d.date.slice(5));

    const series = scopes.map((scope) => ({
      name: SCOPE_LABELS[scope] || scope,
      type: "bar" as const,
      stack: "total",
      data: costData.days.map((d) => (d as Record<string, unknown>)[scope] ?? 0),
      itemStyle: { color: SCOPE_COLORS[scope] || "#94a3b8" },
    }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: ct.tooltipBg,
        borderColor: ct.tooltipBorder,
        textStyle: { color: ct.tooltipText, fontSize: 12 },
      },
      legend: {
        data: scopes.map((s) => SCOPE_LABELS[s] || s),
        textStyle: { color: ct.legendText },
        bottom: 0,
      },
      grid: { top: 10, right: 16, bottom: 40, left: 50, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: dates,
        axisLabel: { color: ct.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: ct.axisLine } },
      },
      yAxis: {
        type: "value" as const,
        name: "tokens",
        nameTextStyle: { color: ct.axisLabel },
        axisLabel: { color: ct.axisLabel },
        splitLine: { lineStyle: { color: ct.splitLine } },
      },
      series,
    };
  }, [costData, ct, SCOPE_LABELS]);

  // ===== Auth guard =====
  if (authStatus === "loading" || loading) {
    return <PageSkeleton cards={3} />;
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-v-text4">
        {t("adminOnly")}
      </div>
    );
  }

  // ===== Render =====
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-violet-400" />
          <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
        </div>
        <HButton
          size="sm"
          variant="flat"
          isLoading={runAllLoading}
          onPress={runAll}
          className="bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
          startContent={!runAllLoading ? <RefreshCw className="h-4 w-4" /> : undefined}
        >
          {runAllLoading ? t("running") : t("runAll")}
        </HButton>
      </div>

      {/* Config status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HCard className="bg-v-card border border-v-border">
          <HCardBody className="p-4 flex items-center gap-3">
            <div className={`rounded-xl p-2.5 ${statusData?.configured ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
              <Settings className={`h-5 w-5 ${statusData?.configured ? "text-emerald-400" : "text-red-400"}`} />
            </div>
            <div>
              <p className="text-xs text-v-text3">{t("apiKey")}</p>
              <p className={`text-sm font-semibold ${statusData?.configured ? "text-emerald-400" : "text-red-400"}`}>
                {statusData?.configured ? t("configured") : t("notConfigured")}
              </p>
            </div>
            <Chip size="sm" variant="flat" classNames={{ base: "ml-auto bg-v-hover", content: "text-v-text3 text-xs" }}>
              {statusData?.model || "deepseek-chat"}
            </Chip>
          </HCardBody>
        </HCard>

        <HCard className="bg-v-card border border-v-border">
          <HCardBody className="p-4 flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/15 p-2.5">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-v-text3">{t("todayTokens")}</p>
              <p className="text-sm font-semibold text-v-text1">
                {(statusData?.todayTokens ?? 0).toLocaleString()}
              </p>
            </div>
          </HCardBody>
        </HCard>

        <HCard className="bg-v-card border border-v-border">
          <HCardBody className="p-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2.5">
              <Coins className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-v-text3">{t("totalUsage")}</p>
              <p className="text-sm font-semibold text-v-text1">
                {(statusData?.allTimeTotalTokens ?? 0).toLocaleString()} tokens
              </p>
            </div>
            <Chip size="sm" variant="flat" classNames={{ base: "ml-auto bg-v-hover", content: "text-v-text3 text-xs" }}>
              {t("analysisCount", { count: statusData?.allTimeTotalRecords ?? 0 })}
            </Chip>
          </HCardBody>
        </HCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-v-border pb-0">
        {([
          { key: "status", label: t("tabModules"), icon: Cpu },
          { key: "history", label: t("tabHistory"), icon: History },
          { key: "cost", label: t("tabCost"), icon: BarChart3 },
        ] as const).map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabItem.key
                ? "text-violet-400 border-violet-400"
                : "text-v-text3 border-transparent hover:text-v-text2"
            }`}
          >
            <tabItem.icon className="h-4 w-4" />
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* ===== Tab: 系统模组（原分析状态，改造为模组卡片） ===== */}
      {tab === "status" && (
        <div className="space-y-4">
          {/* 已改为固定规则的功能说明 */}
          <HCard className="bg-v-card border border-v-border">
            <HCardBody className="p-4">
              <h3 className="text-sm font-semibold text-v-text2 mb-2">{t("removedScopesTitle")}</h3>
              <p className="text-xs text-v-text4 mb-3">{t("removedScopesHint")}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(REMOVED_SCOPES).map(([scope, desc]) => (
                  <Chip key={scope} size="sm" variant="flat" classNames={{ base: "bg-zinc-500/10", content: "text-zinc-400 text-xs" }}>
                    {desc}
                  </Chip>
                ))}
              </div>
            </HCardBody>
          </HCard>

          {/* LLM 文字建议模组 — 仅 duty 和 class-summary */}
          <h3 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-violet-400" />
            {t("llmModulesTitle")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(["duty", "class-summary", "grade-report"] as const).map((cfgScope) => {
              const config = moduleConfigs.find((c) => c.scope === cfgScope);
              const isActive = config?.isActive ?? true;
              // For class-summary and grade-report, look for any prefixed records
              const relatedRecords = cfgScope === "class-summary"
                ? (statusData?.analyses ?? []).filter((a) => a.scope.startsWith("class-summary-"))
                : cfgScope === "grade-report"
                  ? (statusData?.analyses ?? []).filter((a) => a.scope.startsWith("grade-report-"))
                  : (statusData?.analyses ?? []).filter((a) => a.scope === cfgScope);
              const hasRecords = relatedRecords.length > 0;
              const totalTokens = relatedRecords.reduce((sum, r) => sum + r.tokens, 0);
              const latestTime = relatedRecords.length > 0
                ? new Date(Math.max(...relatedRecords.map((r) => new Date(r.createdAt).getTime())))
                : null;
              const scopeColor = SCOPE_COLORS[cfgScope];
              const scopeLabel = SCOPE_LABELS[cfgScope] || cfgScope;

              return (
                <HCard
                  key={cfgScope}
                  className={`bg-v-card border transition-all hover:border-violet-500/40 cursor-pointer ${
                    !isActive ? "opacity-60 border-v-border" : "border-v-border"
                  }`}
                  onClick={() => openConfigModal(cfgScope)}
                >
                  <HCardBody className="p-3.5">
                    {/* Header: color dot + name */}
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: scopeColor }}
                      />
                      <span className="font-semibold text-sm text-v-text1 truncate">
                        {scopeLabel}
                      </span>
                      <Chip size="sm" variant="flat" classNames={{ base: "h-[18px] bg-violet-500/15 ml-auto", content: "text-[10px] text-violet-300 px-1" }}>
                        LLM
                      </Chip>
                    </div>

                    {/* Subtitle for class-summary / grade-report */}
                    {cfgScope === "class-summary" && (
                      <p className="text-[10px] text-v-text4 -mt-1 mb-2 ml-[18px]">
                        {t("classSummaryHint")}
                      </p>
                    )}
                    {cfgScope === "grade-report" && (
                      <p className="text-[10px] text-v-text4 -mt-1 mb-2 ml-[18px]">
                        {t("gradeReportHint")}
                      </p>
                    )}

                    {/* Status row */}
                    <div className="flex items-center gap-2 mb-2">
                      {hasRecords ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span className="text-[11px] text-emerald-400">
                            {cfgScope === "class-summary"
                              ? t("generatedClasses", { count: relatedRecords.length })
                              : t("generated")}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-v-text4" />
                          <span className="text-[11px] text-v-text4">{t("notGenerated")}</span>
                        </div>
                      )}
                      {hasRecords && (
                        <span className="text-[11px] text-v-text4 flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5" />{totalTokens}
                        </span>
                      )}
                      {hasRecords && latestTime && (
                        <span className="text-[11px] text-v-text4 flex items-center gap-0.5 ml-auto">
                          <Clock className="h-2.5 w-2.5" />
                          {latestTime.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>

                    {/* Param chips */}
                    <div className="flex items-center gap-1 mb-3 flex-wrap">
                      <Chip size="sm" variant="flat" classNames={{ base: "h-[18px] bg-v-hover", content: "text-[10px] text-v-text4 px-1" }}>
                        T={config?.temperature ?? 0.3}
                      </Chip>
                      <Chip size="sm" variant="flat" classNames={{ base: "h-[18px] bg-v-hover", content: "text-[10px] text-v-text4 px-1" }}>
                        {config?.maxTokens ?? 2000}
                      </Chip>
                      <Chip size="sm" variant="flat" classNames={{ base: "h-[18px] bg-v-hover", content: "text-[10px] text-v-text4 px-1" }}>
                        {(config?.model ?? "deepseek-chat").replace("deepseek-", "")}
                      </Chip>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between border-t border-v-border pt-2.5" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        size="sm"
                        isSelected={isActive}
                        onValueChange={(val) => toggleActive(cfgScope, val)}
                        thumbIcon={({ isSelected, className }) =>
                          isSelected ? <Check className={className} /> : <X className={className} />
                        }
                        classNames={{
                          wrapper: "group-data-[selected=true]:bg-violet-500",
                          thumb: "group-data-[selected=true]:bg-white",
                        }}
                        aria-label={t("enableToggle")}
                      />
                      <HButton
                        size="sm"
                        isIconOnly
                        variant="light"
                        isLoading={runningScopes.has(cfgScope) || runAllLoading}
                        isDisabled={!isActive}
                        onPress={() => {
                          if (!runningScopes.has(cfgScope)) runScope(cfgScope);
                        }}
                        className="text-v-text3 hover:text-violet-400 min-w-6 w-6 h-6"
                        title={t("runScope", { scope: scopeLabel })}
                      >
                        {!(runningScopes.has(cfgScope) || runAllLoading) && <Play className="h-3 w-3" />}
                      </HButton>
                    </div>
                  </HCardBody>
                </HCard>
              );
            })}
          </div>

          {/* Scope-level quick preview */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-violet-400" />
              {t("previewTitle")}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(statusData?.analyses ?? []).map((record) => {
                const isSel = previewScope === record.scope;
                const scopeColor = record.scope.startsWith("class-summary")
                  ? SCOPE_COLORS["class-summary"]
                  : (SCOPE_COLORS[record.scope] || "#94a3b8");
                const scopeLabel = record.scope.startsWith("class-summary-")
                  ? record.scope.replace("class-summary-", "")
                  : (SCOPE_LABELS[record.scope] || record.scope);
                return (
                  <button
                    key={record.scope}
                    onClick={() => setPreviewScope(isSel ? null : record.scope)}
                    className={`rounded-lg px-3 py-2 text-xs text-left transition-all border ${
                      isSel
                        ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/20"
                        : "border-v-border bg-v-card hover:border-v-border-input"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scopeColor }} />
                      <span className="font-medium text-v-text1 truncate">{scopeLabel}</span>
                    </div>
                    <span className="text-emerald-400">{record.tokens} tokens</span>
                  </button>
                );
              })}
              {(statusData?.analyses ?? []).length === 0 && (
                <div className="col-span-full text-center py-4 text-v-text4 text-sm">
                  {t("noAnalysisToday")}
                </div>
              )}
            </div>
            {previewScope && (
              <HCard className="bg-v-card border border-v-border overflow-hidden">
                <HCardHeader className="px-5 py-3 bg-v-thead border-b border-v-border">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-semibold text-v-text1">
                      {t("jsonContent", {
                        scope: previewScope.startsWith("class-summary-")
                          ? previewScope.replace("class-summary-", "")
                          : (SCOPE_LABELS[previewScope] || previewScope),
                      })}
                    </span>
                  </div>
                </HCardHeader>
                <HCardBody className="p-0">
                  {previewScopeDetail ? (
                    <pre className="p-4 text-xs text-v-text2 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
                      <JsonHighlight data={previewScopeDetail.content} />
                    </pre>
                  ) : (
                    <div className="p-6 text-center text-v-text4 text-sm">
                      {t("noScopeData")}
                    </div>
                  )}
                </HCardBody>
              </HCard>
            )}
          </div>
        </div>
      )}

      {/* ===== Tab: 历史记录 ===== */}
      {tab === "history" && (
        <div className="space-y-4">
          {historyDays.length === 0 ? (
            <div className="text-center py-12 text-v-text4">{t("noHistoryRecords")}</div>
          ) : (
            <div className="space-y-2">
              {historyDays.map((day) => {
                const isExpanded = selectedHistoryDate === day.date;
                return (
                  <HCard key={day.date} className="bg-v-card border border-v-border">
                    <HCardBody className="p-0">
                      <button
                        onClick={() => setSelectedHistoryDate(isExpanded ? null : day.date)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-v-hover transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-v-text3 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-v-text3 shrink-0" />
                        )}
                        <span className="font-mono text-sm font-semibold text-v-text1 w-24">
                          {day.date}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap flex-1">
                          {day.scopes.map((s) => (
                            <Chip
                              key={s}
                              size="sm"
                              variant="flat"
                              classNames={{
                                base: "h-5",
                                content: "text-xs px-1.5",
                              }}
                              style={{
                                backgroundColor: (SCOPE_COLORS[s] || "#94a3b8") + "20",
                                color: SCOPE_COLORS[s] || "#94a3b8",
                              }}
                            >
                              {SCOPE_LABELS[s] || s}
                            </Chip>
                          ))}
                        </div>
                        <span className="text-xs text-v-text3 shrink-0">
                          {day.totalTokens.toLocaleString()} tokens
                        </span>
                        <span className="text-xs text-v-text4 shrink-0 w-10 text-right">
                          {t("recordCount", { count: day.recordCount })}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-v-border">
                          {detailRecords.length === 0 ? (
                            <div className="p-4 text-center text-v-text4 text-sm">
                              <Spinner size="sm" />
                            </div>
                          ) : (
                            <div className="divide-y divide-v-border">
                              {detailRecords.map((rec) => (
                                <div key={rec.id}>
                                  <button
                                    onClick={() => setExpandedDetailId(expandedDetailId === rec.id ? null : rec.id)}
                                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-v-hover transition-colors text-left"
                                  >
                                    {expandedDetailId === rec.id ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-v-text4" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-v-text4" />
                                    )}
                                    <Chip
                                      size="sm"
                                      variant="flat"
                                      classNames={{ base: "h-5", content: "text-xs px-1.5" }}
                                      style={{
                                        backgroundColor: (SCOPE_COLORS[rec.scope] || "#94a3b8") + "20",
                                        color: SCOPE_COLORS[rec.scope] || "#94a3b8",
                                      }}
                                    >
                                      {SCOPE_LABELS[rec.scope] || rec.scope}
                                    </Chip>
                                    <span className="text-xs text-v-text3">{rec.tokens} tokens</span>
                                    <span className="text-xs text-v-text4 ml-auto">
                                      {new Date(rec.createdAt).toLocaleTimeString(timeLocale)}
                                    </span>
                                  </button>
                                  {expandedDetailId === rec.id && (
                                    <pre className="px-5 pb-3 text-xs text-v-text2 overflow-x-auto max-h-72 overflow-y-auto leading-relaxed bg-v-thead mx-4 mb-3 rounded-lg p-3">
                                      <JsonHighlight data={rec.content} />
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </HCardBody>
                  </HCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== Tab: 成本趋势 ===== */}
      {tab === "cost" && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader className="px-5 py-3 border-b border-v-border">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-v-text1">{t("costTitle")}</span>
            </div>
          </HCardHeader>
          <HCardBody className="p-4">
            {costChartOption ? (
              <ReactECharts option={costChartOption} style={{ height: 320 }} />
            ) : (
              <div className="text-center py-12 text-v-text4">{t("noCostData")}</div>
            )}
          </HCardBody>
        </HCard>
      )}

      {/* ===== Config Modal ===== */}
      <Modal
        isOpen={!!configModalScope}
        onClose={() => setConfigModalScope(null)}
        size="xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-v-card border border-v-border max-w-[95vw] sm:max-w-[560px] max-h-[calc(100dvh-2rem)]",
          header: "border-b border-v-border",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          {configModalScope && (
            <>
              <ModalHeader className="flex items-center gap-2 py-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: SCOPE_COLORS[configModalScope] || SCOPE_COLORS["grade-1"] }}
                />
                <span className="text-v-text1 text-base">
                  {t("configTitle", {
                    scope: SCOPE_LABELS[configModalScope] || configModalScope,
                  })}
                </span>
              </ModalHeader>
              <ModalBody className="py-4 space-y-4">
                {/* System Prompt */}
                <Textarea
                  label="System Prompt"
                  labelPlacement="outside"
                  placeholder={t("systemPromptPlaceholder")}
                  description={t("systemPromptDescription")}
                  value={configForm.systemPrompt ?? ""}
                  onValueChange={(val) => setConfigForm((f) => ({ ...f, systemPrompt: val }))}
                  minRows={2}
                  maxRows={8}
                  variant="flat"
                  classNames={{
                    base: "w-full",
                    input: "text-sm text-v-text1",
                    label: "text-v-text2 text-sm font-medium",
                    description: "text-v-text4",
                    inputWrapper: "bg-v-hover border border-v-border",
                  }}
                />

                {/* Model + Active toggle */}
                <div className="flex items-end gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium text-v-text2">Model</label>
                    <Select
                      aria-label="Model"
                      placeholder={t("modelPlaceholder")}
                      selectedKeys={configForm.model ? [configForm.model] : ["deepseek-chat"]}
                      onSelectionChange={(keys) => {
                        const key = Array.from(keys)[0] as string;
                        if (key) setConfigForm((f) => ({ ...f, model: key }));
                      }}
                      size="sm"
                      classNames={{
                        trigger: "bg-v-hover border-v-border",
                        value: "text-v-text1 text-sm",
                      }}
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m.key}>{m.label}</SelectItem>
                      ))}
                    </Select>
                    <p className="text-v-text4 text-[11px]">{t("modelHint")}</p>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-v-hover px-3 py-2.5 border border-v-border shrink-0">
                    <ToggleRight className="h-3.5 w-3.5 text-v-text3" />
                    <span className="text-sm font-medium text-v-text1">{t("enableToggle")}</span>
                    <Switch
                      size="sm"
                      isSelected={configForm.isActive ?? true}
                      onValueChange={(val) => setConfigForm((f) => ({ ...f, isActive: val }))}
                      thumbIcon={({ isSelected, className }) =>
                        isSelected ? <Check className={className} /> : <X className={className} />
                      }
                      classNames={{
                        wrapper: "group-data-[selected=true]:bg-violet-500",
                        thumb: "group-data-[selected=true]:bg-white",
                      }}
                    />
                  </div>
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-v-text2 flex items-center gap-1 shrink-0">
                      <Thermometer className="h-3.5 w-3.5" />
                      Temperature
                    </label>
                    <Slider
                      size="sm"
                      step={0.1}
                      minValue={0}
                      maxValue={1}
                      value={configForm.temperature ?? 0.3}
                      onChange={(val) =>
                        setConfigForm((f) => ({
                          ...f,
                          temperature: typeof val === "number" ? val : val[0],
                        }))
                      }
                      className="flex-1"
                      classNames={{
                        track: "bg-v-border-input",
                        filler: "bg-violet-500",
                        thumb: "bg-violet-500 border-violet-600",
                      }}
                      aria-label="Temperature"
                    />
                    <span className="text-xs font-mono text-violet-400 shrink-0 w-6 text-right">
                      {configForm.temperature?.toFixed(1) ?? "0.3"}
                    </span>
                  </div>
                  <p className="text-[11px] text-v-text4 leading-tight">
                    {t("temperatureHint")}
                  </p>
                </div>

                {/* Max Tokens */}
                <Input
                  type="number"
                  label="Max Tokens"
                  labelPlacement="outside"
                  placeholder="500~4000"
                  description={t("maxTokensDescription")}
                  value={String(configForm.maxTokens ?? 2000)}
                  onValueChange={(val) =>
                    setConfigForm((f) => ({ ...f, maxTokens: parseInt(val) || 2000 }))
                  }
                  min={500}
                  max={4000}
                  size="sm"
                  classNames={{
                    input: "text-sm text-v-text1",
                    label: "text-v-text2 text-sm font-medium",
                    description: "text-v-text4 text-[11px]",
                    inputWrapper: "bg-v-hover border-v-border",
                  }}
                  startContent={<Hash className="h-3.5 w-3.5 text-v-text4 shrink-0" />}
                />

                {/* Divider */}
                <div className="border-t border-v-border" />

                {/* Reference info */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-v-text3 uppercase tracking-wide flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    {t("referenceInfo")}
                  </h4>

                  {/* User Prompt template description */}
                  <div className="rounded-lg bg-v-hover p-3 border border-v-border">
                    <p className="text-[11px] font-medium text-v-text2 mb-1.5">{t("userPromptTemplate")}</p>
                    <pre className="text-[11px] text-v-text3 whitespace-pre-wrap leading-relaxed">
                      {PROMPT_DESC_KEYS[configModalScope] ? t(PROMPT_DESC_KEYS[configModalScope]) : t("noDescription")}
                    </pre>
                  </div>

                  {/* Latest output preview */}
                  <div className="rounded-lg border border-v-border overflow-hidden">
                    <div className="px-3 py-2 bg-v-thead border-b border-v-border flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-violet-400" />
                      <span className="text-[11px] font-medium text-v-text2">{t("latestOutputPreview")}</span>
                    </div>
                    {previewDetail ? (
                      <pre className="p-3 text-[11px] text-v-text2 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
                        <JsonHighlight data={previewDetail.content} />
                      </pre>
                    ) : (
                      <div className="p-4 text-center text-v-text4 text-xs">
                        {t("noModuleData")}
                      </div>
                    )}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="py-3">
                {configSaveMsg && (
                  <span className={`text-sm mr-auto ${configSaveMsg === t("saveSuccess") ? "text-emerald-400" : "text-red-400"}`}>
                    {configSaveMsg}
                  </span>
                )}
                <HButton
                  size="sm"
                  variant="flat"
                  onPress={() => setConfigModalScope(null)}
                  className="text-v-text3"
                >
                  {tc("cancel")}
                </HButton>
                <HButton
                  size="sm"
                  color="secondary"
                  isLoading={savingConfig}
                  onPress={saveConfig}
                  startContent={!savingConfig ? <Save className="h-3.5 w-3.5" /> : undefined}
                  className="bg-violet-500 text-white"
                >
                  {t("saveConfig")}
                </HButton>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

// ===== Simple JSON syntax highlighting =====
function JsonHighlight({ data }: { data: unknown }) {
  const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const highlighted = json.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g,
    '<span style="color:#8b5cf6">$1</span>:',
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g,
    ': <span style="color:#10b981">$1</span>',
  ).replace(
    /:\s*(\d+\.?\d*)/g,
    ': <span style="color:#f59e0b">$1</span>',
  ).replace(
    /:\s*(true|false|null)/g,
    ': <span style="color:#3b82f6">$1</span>',
  );

  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
}
