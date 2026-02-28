"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Button as HButton,
  Chip,
  Progress,
  Input as HInput,
  Select as HSelect,
  SelectItem as HSelectItem,
  Divider,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Users,
  AlertTriangle,
  Download,
  RefreshCw,
  Loader2,
  Activity,
  Database,
  FileText,
  Search,
  ExternalLink,
  Shield,
  Thermometer,
  Zap,
  Package,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { PageSkeleton } from "@/components/skeletons";

// ===== 类型定义 =====
interface ServerData {
  system: {
    platform: string;
    arch: string;
    hostname: string;
    release: string;
    uptime: number;
    loadAvg: number[];
  };
  cpu: {
    model: string;
    cores: number;
    usage: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: string;
  } | null;
  process: {
    uptime: number;
    pid: number;
    nodeVersion: string;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
  database: {
    size: number | null;
    stats: Record<string, number>;
  };
  logs: {
    totalLines: number;
    logFileSize: number;
    recentLogins: Array<{ user: string; time: string; ip: string }>;
    activeUsersToday: number;
    errorsToday: number;
    errorsWeek: number;
    recentErrors: Array<{ time: string; action: string; error: string; user: string }>;
    loginCountToday: number;
    loginCountWeek: number;
  };
}

interface LogItem {
  timestamp?: string;
  level?: string;
  category?: string;
  action?: string;
  user?: string;
  role?: string;
  ip?: string;
  model?: string;
  data?: unknown;
  error?: string;
  detail?: string;
}

// ===== 工具函数 =====
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getUsageColor(percent: number): "success" | "warning" | "danger" {
  if (percent < 60) return "success";
  if (percent < 85) return "warning";
  return "danger";
}

function getUsageTextColor(percent: number): string {
  if (percent < 60) return "text-green-400";
  if (percent < 85) return "text-yellow-400";
  return "text-red-400";
}

// ===== 组件 =====
export default function ServerMonitorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("serverMonitor");
  const tc = useTranslations("common");
  const tl = useTranslations("logs");

  // 服务器状态
  const [serverData, setServerData] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // 日志模块
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLevel, setLogLevel] = useState("ALL");
  const [logQuery, setLogQuery] = useState("");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsFilteredTotal, setLogsFilteredTotal] = useState(0);

  // 备份状态
  const [backingUp, setBackingUp] = useState<string | null>(null);

  // 展开/折叠状态
  const [expandedSections, setExpandedSections] = useState({
    hardware: false,
    database: true,
    logs: true,
    errors: true,
    logins: true,
  });

  // 错误行展开状态（记录哪些 index 展开了）
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  // 复制成功状态（记录哪个 index 刚复制成功）
  const [copiedError, setCopiedError] = useState<number | null>(null);

  // 确认弹窗
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: string;
    title: string;
    message: string;
  }>({ open: false, type: "", title: "", message: "" });

  const isAdmin = session?.user?.role === "ADMIN";

  // 获取服务器状态
  const fetchServerData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/server-monitor");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServerData(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  // 获取日志
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (logLevel !== "ALL") params.set("level", logLevel);
      if (logDateFrom) params.set("from", logDateFrom);
      if (logDateTo) params.set("to", logDateTo);
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      setLogsTotal(json.total || 0);
      setLogsFilteredTotal(json.filteredTotal || 0);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [logLevel, logDateFrom, logDateTo]);

  // 日志下载
  const handleLogDownload = () => {
    const params = new URLSearchParams();
    params.set("download", "1");
    if (logLevel !== "ALL") params.set("level", logLevel);
    if (logDateFrom) params.set("from", logDateFrom);
    if (logDateTo) params.set("to", logDateTo);
    window.open(`/api/logs?${params.toString()}`, "_blank");
  };

  // 备份下载
  const handleBackup = async (type: string) => {
    setBackingUp(type);
    try {
      const res = await fetch("/api/server-monitor/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Backup failed");
      }

      // 触发浏览器下载
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `backup-${type}-${Date.now()}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Backup error:", err);
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBackingUp(null);
      setConfirmModal({ open: false, type: "", title: "", message: "" });
    }
  };

  // 过滤日志
  const filteredLogs = useMemo(() => {
    const keyword = logQuery.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((item) => {
      const haystack = JSON.stringify(item).toLowerCase();
      return haystack.includes(keyword);
    });
  }, [logs, logQuery]);

  // 折叠/展开
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // 错误行展开/折叠
  const toggleErrorRow = (idx: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // 复制错误详情
  const copyErrorDetail = async (err: ServerData["logs"]["recentErrors"][0], idx: number) => {
    const text = `[${err.action}] ${new Date(err.time).toLocaleString()}\n${t("user_label")}: ${err.user}\n${err.error}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedError(idx);
      setTimeout(() => setCopiedError(null), 2000);
    } catch {
      // 回退方案
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedError(idx);
      setTimeout(() => setCopiedError(null), 2000);
    }
  };

  // 初始化
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && !isAdmin) {
      router.push("/");
      return;
    }
    if (status === "authenticated" && isAdmin) {
      fetchServerData();
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin, router]);

  // 自动刷新服务器状态（30秒）
  useEffect(() => {
    if (!autoRefresh || !isAdmin || status !== "authenticated") return;
    const interval = setInterval(() => {
      fetchServerData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isAdmin, status, fetchServerData]);

  // 日志筛选变更时重新获取
  useEffect(() => {
    if (status === "authenticated" && isAdmin) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logLevel, logDateFrom, logDateTo]);

  if (status === "loading" || status === "unauthenticated") {
    return <PageSkeleton cards={4} />;
  }

  if (!isAdmin) return null;

  const sd = serverData;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
          <p className="text-sm text-v-text3 mt-1">
            {lastRefreshed
              ? t("lastRefreshed", { time: lastRefreshed.toLocaleTimeString() })
              : t("notRefreshedYet")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Tooltip content={autoRefresh ? t("autoRefreshOn") : t("autoRefreshOff")}>
            <HButton
              variant={autoRefresh ? "solid" : "bordered"}
              size="sm"
              className={autoRefresh
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "border-v-border-input text-v-text3"
              }
              startContent={<Activity className="h-3.5 w-3.5" />}
              onPress={() => setAutoRefresh(!autoRefresh)}
            >
              {t("autoRefresh")}
            </HButton>
          </Tooltip>
          <HButton
            variant="bordered"
            size="sm"
            className="border-v-border-input text-v-text2 hover:text-v-text1"
            isLoading={loading}
            spinner={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            startContent={!loading ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
            onPress={() => { fetchServerData(); fetchLogs(); }}
          >
            {t("refresh")}
          </HButton>
          <HButton
            variant="bordered"
            size="sm"
            className="border-v-border-input text-v-text2 hover:text-v-text1"
            startContent={<ExternalLink className="h-3.5 w-3.5" />}
            onPress={() => window.open("http://8.145.51.48:8888/login", "_blank")}
          >
            {t("btPanel")}
          </HButton>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* === 概览卡片行 === */}
      {sd && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* CPU */}
          <HCard className="bg-v-card border border-v-border">
            <HCardBody className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Cpu className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-v-text3">{t("cpuUsage")}</p>
                  <p className={`text-xl font-bold ${getUsageTextColor(sd.cpu.usage)}`}>
                    {sd.cpu.usage}%
                  </p>
                </div>
              </div>
              <Progress
                aria-label={t("cpuUsage")}
                value={sd.cpu.usage}
                color={getUsageColor(sd.cpu.usage)}
                size="sm"
                className="mb-1"
              />
              <p className="text-xs text-v-text4 truncate">{sd.cpu.cores} {t("cores")}</p>
            </HCardBody>
          </HCard>

          {/* 内存 */}
          <HCard className="bg-v-card border border-v-border">
            <HCardBody className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <MemoryStick className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-v-text3">{t("memUsage")}</p>
                  <p className={`text-xl font-bold ${getUsageTextColor(sd.memory.usagePercent)}`}>
                    {sd.memory.usagePercent}%
                  </p>
                </div>
              </div>
              <Progress
                aria-label={t("memUsage")}
                value={sd.memory.usagePercent}
                color={getUsageColor(sd.memory.usagePercent)}
                size="sm"
                className="mb-1"
              />
              <p className="text-xs text-v-text4">
                {formatBytes(sd.memory.used)} / {formatBytes(sd.memory.total)}
              </p>
            </HCardBody>
          </HCard>

          {/* 今日登录 */}
          <HCard className="bg-v-card border border-v-border">
            <HCardBody className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                  <Users className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-v-text3">{t("todayLogins")}</p>
                  <p className="text-xl font-bold text-v-text1">
                    {sd.logs.loginCountToday}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-v-text4">
                  {t("activeUsers")}: {sd.logs.activeUsersToday}
                </p>
                <p className="text-xs text-v-text4">
                  {t("weekLogins")}: {sd.logs.loginCountWeek}
                </p>
              </div>
            </HCardBody>
          </HCard>

          {/* 错误统计 */}
          <HCard className="bg-v-card border border-v-border">
            <HCardBody className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  sd.logs.errorsToday > 0 ? "bg-red-500/15" : "bg-emerald-500/15"
                }`}>
                  <AlertTriangle className={`h-5 w-5 ${
                    sd.logs.errorsToday > 0 ? "text-red-400" : "text-emerald-400"
                  }`} />
                </div>
                <div>
                  <p className="text-xs text-v-text3">{t("todayErrors")}</p>
                  <p className={`text-xl font-bold ${
                    sd.logs.errorsToday > 0 ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {sd.logs.errorsToday}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-v-text4">
                  {t("weekErrors")}: {sd.logs.errorsWeek}
                </p>
                <p className="text-xs text-v-text4">
                  {t("totalLogLines")}: {sd.logs.totalLines.toLocaleString()}
                </p>
              </div>
            </HCardBody>
          </HCard>
        </div>
      )}

      {/* === 硬件与系统信息 === */}
      {sd && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader
            className="px-6 pt-5 pb-3 cursor-pointer"
            onClick={() => toggleSection("hardware")}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Server className="h-4.5 w-4.5 text-blue-400" />
                <h3 className="text-base font-semibold text-v-text1">{t("systemInfo")}</h3>
              </div>
              {expandedSections.hardware ? (
                <ChevronUp className="h-4 w-4 text-v-text3" />
              ) : (
                <ChevronDown className="h-4 w-4 text-v-text3" />
              )}
            </div>
          </HCardHeader>
          {expandedSections.hardware && (
            <HCardBody className="px-6 pb-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow icon={<Server className="h-4 w-4" />} label={t("hostname")} value={sd.system.hostname} />
                <InfoRow icon={<Shield className="h-4 w-4" />} label={t("os")} value={`${sd.system.platform} ${sd.system.release} (${sd.system.arch})`} />
                <InfoRow icon={<Clock className="h-4 w-4" />} label={t("systemUptime")} value={formatUptime(sd.system.uptime)} />
                <InfoRow icon={<Cpu className="h-4 w-4" />} label={t("cpuModel")} value={sd.cpu.model} />
                <InfoRow icon={<Thermometer className="h-4 w-4" />} label={t("loadAvg")} value={sd.system.loadAvg.map((v) => v.toFixed(2)).join(" / ")} />
                <InfoRow icon={<Zap className="h-4 w-4" />} label={t("nodeVersion")} value={sd.process.nodeVersion} />
                <InfoRow icon={<Package className="h-4 w-4" />} label={t("processPid")} value={`PID ${sd.process.pid}`} />
                <InfoRow icon={<Clock className="h-4 w-4" />} label={t("processUptime")} value={formatUptime(sd.process.uptime)} />
                <InfoRow
                  icon={<MemoryStick className="h-4 w-4" />}
                  label={t("processMemory")}
                  value={`RSS ${formatBytes(sd.process.memory.rss)} / Heap ${formatBytes(sd.process.memory.heapUsed)}`}
                />
                {sd.disk && (
                  <>
                    <InfoRow
                      icon={<HardDrive className="h-4 w-4" />}
                      label={t("diskUsage")}
                      value={`${sd.disk.usagePercent}% (${formatBytes(sd.disk.used)} / ${formatBytes(sd.disk.total)})`}
                    />
                    <InfoRow
                      icon={<HardDrive className="h-4 w-4" />}
                      label={t("diskFree")}
                      value={formatBytes(sd.disk.free)}
                    />
                  </>
                )}
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label={t("logFileSize")}
                  value={formatBytes(sd.logs.logFileSize)}
                />
              </div>
            </HCardBody>
          )}
        </HCard>
      )}

      {/* === 数据库信息 === */}
      {sd && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader
            className="px-6 pt-5 pb-3 cursor-pointer"
            onClick={() => toggleSection("database")}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-emerald-400" />
                <h3 className="text-base font-semibold text-v-text1">{t("databaseInfo")}</h3>
              </div>
              {expandedSections.database ? (
                <ChevronUp className="h-4 w-4 text-v-text3" />
              ) : (
                <ChevronDown className="h-4 w-4 text-v-text3" />
              )}
            </div>
          </HCardHeader>
          {expandedSections.database && (
            <HCardBody className="px-6 pb-5">
              <div className="mb-4">
                <p className="text-sm text-v-text3">
                  {t("dbSize")}: <span className="text-v-text1 font-medium">{formatBytes(sd.database.size)}</span>
                </p>
              </div>
              {Object.keys(sd.database.stats).length > 0 && (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(sd.database.stats).map(([table, count]) => (
                    <div key={table} className="bg-v-input rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-v-text1">{count.toLocaleString()}</p>
                      <p className="text-xs text-v-text3">{(t as (key: string) => string)(`dbTable_${table}`)}</p>
                    </div>
                  ))}
                </div>
              )}
            </HCardBody>
          )}
        </HCard>
      )}

      {/* === 最近错误 === */}
      {sd && sd.logs.recentErrors.length > 0 && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader
            className="px-6 pt-5 pb-3 cursor-pointer"
            onClick={() => toggleSection("errors")}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-red-400" />
                <h3 className="text-base font-semibold text-v-text1">{t("recentErrors")}</h3>
                <Chip variant="flat" size="sm" classNames={{ base: "bg-red-500/15", content: "text-red-400 text-xs" }}>
                  {sd.logs.recentErrors.length}
                </Chip>
              </div>
              {expandedSections.errors ? (
                <ChevronUp className="h-4 w-4 text-v-text3" />
              ) : (
                <ChevronDown className="h-4 w-4 text-v-text3" />
              )}
            </div>
          </HCardHeader>
          {expandedSections.errors && (
            <HCardBody className="px-6 pb-5">
              <div className="space-y-1.5">
                {sd.logs.recentErrors.map((err, idx) => {
                  const isOpen = expandedErrors.has(idx);
                  const isCopied = copiedError === idx;
                  return (
                    <div key={idx} className="rounded-xl bg-red-500/5 border border-red-500/10 overflow-hidden">
                      {/* 摘要行 — 点击展开 */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-red-500/10 transition-colors"
                        onClick={() => toggleErrorRow(idx)}
                      >
                        {isOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <Chip variant="flat" size="sm" classNames={{ base: "bg-red-500/15 shrink-0", content: "text-red-400 text-xs font-medium" }}>
                          {err.action}
                        </Chip>
                        <span className="text-xs text-v-text3 shrink-0">
                          {new Date(err.time).toLocaleString()}
                        </span>
                        <span className="text-xs text-v-text4 ml-auto shrink-0">
                          {err.user}
                        </span>
                      </button>

                      {/* 详情区域 — 展开时显示 */}
                      {isOpen && (
                        <div className="px-3 pb-3 pt-0">
                          <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3 relative group">
                            <p className="text-sm text-red-400 break-all pr-8 font-mono leading-relaxed whitespace-pre-wrap">
                              {err.error}
                            </p>
                            {/* 复制按钮 */}
                            <Tooltip content={isCopied ? t("copied") : t("copyError")}>
                              <button
                                type="button"
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-v-card/80 border border-v-border hover:bg-v-hover transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyErrorDetail(err, idx);
                                }}
                              >
                                {isCopied ? (
                                  <Check className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-v-text3" />
                                )}
                              </button>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-v-text4">
                            <span>{t("user_label")}: {err.user}</span>
                            <span>{new Date(err.time).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </HCardBody>
          )}
        </HCard>
      )}

      {/* === 最近登录 === */}
      {sd && sd.logs.recentLogins.length > 0 && (
        <HCard className="bg-v-card border border-v-border">
          <HCardHeader
            className="px-6 pt-5 pb-3 cursor-pointer"
            onClick={() => toggleSection("logins")}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-green-400" />
                <h3 className="text-base font-semibold text-v-text1">{t("recentLogins")}</h3>
              </div>
              {expandedSections.logins ? (
                <ChevronUp className="h-4 w-4 text-v-text3" />
              ) : (
                <ChevronDown className="h-4 w-4 text-v-text3" />
              )}
            </div>
          </HCardHeader>
          {expandedSections.logins && (
            <HCardBody className="px-6 pb-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-v-text3 text-xs">
                      <th className="text-left py-2 pr-4">{t("user_label")}</th>
                      <th className="text-left py-2 pr-4">{t("loginTime")}</th>
                      <th className="text-left py-2">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {sd.logs.recentLogins.map((login, idx) => (
                      <tr key={idx} className="text-v-text2">
                        <td className="py-2 pr-4 font-medium">{login.user}</td>
                        <td className="py-2 pr-4 text-v-text3">{new Date(login.time).toLocaleString()}</td>
                        <td className="py-2 text-v-text4 font-mono text-xs">{login.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HCardBody>
          )}
        </HCard>
      )}

      {/* === 数据备份 === */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Download className="h-4.5 w-4.5 text-amber-400" />
            <h3 className="text-base font-semibold text-v-text1">{t("backupTitle")}</h3>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          <p className="text-sm text-v-text3 mb-4">{t("backupDesc")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* 数据库备份 */}
            <div className="bg-v-input rounded-xl p-4 border border-v-border">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-v-text1">{t("backupDb")}</span>
              </div>
              <p className="text-xs text-v-text3 mb-3">{t("backupDbDesc")}</p>
              <HButton
                size="sm"
                variant="bordered"
                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                startContent={backingUp !== "database" ? <Download className="h-3.5 w-3.5" /> : undefined}
                isLoading={backingUp === "database"}
                spinner={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
                onPress={() => setConfirmModal({
                  open: true,
                  type: "database",
                  title: t("backupDb"),
                  message: t("backupConfirmDb"),
                })}
              >
                {t("downloadBtn")}
              </HButton>
            </div>

            {/* 日志备份 */}
            <div className="bg-v-input rounded-xl p-4 border border-v-border">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-v-text1">{t("backupLogs")}</span>
              </div>
              <p className="text-xs text-v-text3 mb-3">{t("backupLogsDesc")}</p>
              <HButton
                size="sm"
                variant="bordered"
                className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                startContent={backingUp !== "logs" ? <Download className="h-3.5 w-3.5" /> : undefined}
                isLoading={backingUp === "logs"}
                spinner={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
                onPress={() => handleBackup("logs")}
              >
                {t("downloadBtn")}
              </HButton>
            </div>

            {/* 完整备份 */}
            <div className="bg-v-input rounded-xl p-4 border border-v-border">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium text-v-text1">{t("backupFull")}</span>
              </div>
              <p className="text-xs text-v-text3 mb-3">{t("backupFullDesc")}</p>
              <HButton
                size="sm"
                variant="bordered"
                className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                startContent={backingUp !== "full" ? <Download className="h-3.5 w-3.5" /> : undefined}
                isLoading={backingUp === "full"}
                spinner={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
                onPress={() => setConfirmModal({
                  open: true,
                  type: "full",
                  title: t("backupFull"),
                  message: t("backupConfirmFull"),
                })}
              >
                {t("downloadBtn")}
              </HButton>
            </div>
          </div>
        </HCardBody>
      </HCard>

      {/* === 系统日志 === */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader
          className="px-6 pt-5 pb-3 cursor-pointer"
          onClick={() => toggleSection("logs")}
        >
          <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-indigo-400 shrink-0" />
              <h3 className="text-base font-semibold text-v-text1 whitespace-nowrap">{t("logsTitle")}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Chip variant="flat" size="sm" classNames={{ base: "bg-v-input shrink-0", content: "text-v-text3 text-xs" }}>
                {t("logsSummary", { loaded: filteredLogs.length, total: logsTotal })}
              </Chip>
              <div className="flex items-center gap-0.5 ml-auto">
                <HButton
                  size="sm"
                  variant="light"
                  isIconOnly
                  className="text-v-text3 hover:text-v-text1"
                  onPress={() => { handleLogDownload(); }}
                >
                  <Download className="h-3.5 w-3.5" />
                </HButton>
                <HButton
                  size="sm"
                  variant="light"
                  isIconOnly
                  className="text-v-text3 hover:text-v-text1"
                  isLoading={logsLoading}
                  spinner={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  onPress={() => { fetchLogs(); }}
                >
                  {!logsLoading && <RefreshCw className="h-3.5 w-3.5" />}
                </HButton>
                {expandedSections.logs ? (
                  <ChevronUp className="h-4 w-4 text-v-text3" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-v-text3" />
                )}
              </div>
            </div>
          </div>
        </HCardHeader>
        {expandedSections.logs && (
          <HCardBody className="px-6 pb-5 space-y-4">
            {/* 筛选条件 */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <HSelect
                aria-label={tl("levelFilter")}
                placeholder={tl("levelFilter")}
                selectedKeys={[logLevel]}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string;
                  if (val) setLogLevel(val);
                }}
                variant="bordered"
                size="sm"
                classNames={{
                  trigger: "border-v-border-input bg-v-input pe-8",
                  value: "text-v-text2 truncate",
                  selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                  popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                  listbox: "text-v-text1",
                }}
              >
                <HSelectItem key="ALL">{tl("allLevels")}</HSelectItem>
                <HSelectItem key="INFO">INFO</HSelectItem>
                <HSelectItem key="WARN">WARN</HSelectItem>
                <HSelectItem key="ERROR">ERROR</HSelectItem>
              </HSelect>
              <HInput
                type="date"
                placeholder={tl("dateFrom")}
                value={logDateFrom}
                onChange={(e) => setLogDateFrom(e.target.value)}
                variant="bordered"
                size="sm"
                classNames={{
                  inputWrapper: "border-v-border-input bg-v-input",
                  input: "text-v-text2 placeholder:text-v-text4",
                }}
              />
              <HInput
                type="date"
                placeholder={tl("dateTo")}
                value={logDateTo}
                onChange={(e) => setLogDateTo(e.target.value)}
                variant="bordered"
                size="sm"
                classNames={{
                  inputWrapper: "border-v-border-input bg-v-input",
                  input: "text-v-text2 placeholder:text-v-text4",
                }}
              />
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-v-text4 z-10" />
                <HInput
                  placeholder={tl("searchPlaceholder")}
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  variant="bordered"
                  size="sm"
                  classNames={{
                    inputWrapper: "border-v-border-input bg-v-input pl-9",
                    input: "text-v-text2 placeholder:text-v-text4",
                  }}
                />
              </div>
            </div>

            {/* 日志列表 */}
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-v-text4" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-v-text4">{tl("noLogs")}</div>
            ) : (
              <div className="max-h-[50vh] overflow-auto divide-y divide-v-border rounded-xl border border-v-border">
                {filteredLogs.map((item, idx) => (
                  <div key={`${item.timestamp ?? "t"}-${idx}`} className="p-3 space-y-1.5 hover:bg-v-hover/50 transition-colors">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip
                        variant="bordered"
                        size="sm"
                        classNames={{
                          base: `border-${item.level === "ERROR" ? "red" : item.level === "WARN" ? "yellow" : "v-border"}-500/30`,
                          content: `text-${item.level === "ERROR" ? "red" : item.level === "WARN" ? "yellow" : "v-text2"}-400 text-xs`,
                        }}
                      >
                        {item.level ?? "INFO"}
                      </Chip>
                      {item.category && (
                        <Chip variant="flat" size="sm" classNames={{ base: "bg-v-input", content: "text-v-text3 text-xs" }}>
                          {item.category}
                        </Chip>
                      )}
                      {item.action && (
                        <Chip variant="flat" size="sm" classNames={{ base: "bg-v-input", content: "text-v-text3 text-xs" }}>
                          {item.action}
                        </Chip>
                      )}
                      <span className="text-xs text-v-text4 ml-auto">
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : tl("unknownTime")}
                      </span>
                    </div>
                    <div className="text-xs text-v-text3 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{tl("user")}: {item.user ?? "-"}</span>
                      <span>{tl("role")}: {item.role ?? "-"}</span>
                      {item.model && <span>{tl("model")}: {item.model}</span>}
                      <span>IP: {item.ip ?? "-"}</span>
                    </div>
                    {item.error && (
                      <p className="text-xs text-red-400">{tl("error")}: {item.error}</p>
                    )}
                    {item.detail && (
                      <p className="text-xs text-v-text3">{tl("detail")}: {item.detail}</p>
                    )}
                    {item.data !== undefined && (
                      <pre className="text-xs bg-v-card rounded-lg p-2 overflow-x-auto border border-v-border text-v-text3 max-h-32">
                        {JSON.stringify(item.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </HCardBody>
        )}
      </HCard>

      {/* === 备份确认弹窗 === */}
      <Modal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, type: "", title: "", message: "" })}
        classNames={{
          base: "bg-v-card border border-v-border",
          header: "border-b border-v-border",
          body: "py-4",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-v-text1">{confirmModal.title}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-v-text2">{confirmModal.message}</p>
          </ModalBody>
          <ModalFooter>
            <HButton
              variant="light"
              className="text-v-text3"
              onPress={() => setConfirmModal({ open: false, type: "", title: "", message: "" })}
            >
              {tc("cancel")}
            </HButton>
            <HButton
              className="bg-blue-500/20 text-blue-400"
              isLoading={backingUp === confirmModal.type}
              spinner={<Loader2 className="h-4 w-4 animate-spin" />}
              onPress={() => handleBackup(confirmModal.type)}
            >
              {t("confirmDownload")}
            </HButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ===== 辅助组件 =====
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-v-input">
      <div className="text-v-text3 mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-v-text4">{label}</p>
        <p className="text-sm text-v-text1 font-medium truncate" title={value}>{value}</p>
      </div>
    </div>
  );
}
