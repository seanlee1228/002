"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Button as HButton,
  Input as HInput,
  Chip,
  Select as HSelect,
  SelectItem as HSelectItem,
} from "@heroui/react";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { TablePageSkeleton } from "@/components/skeletons";

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

export default function LogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [level, setLevel] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isAdmin = session?.user?.role === "ADMIN";
  const t = useTranslations("logs");
  const tc = useTranslations("common");

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "300");
      if (level !== "ALL") params.set("level", level);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("loadFailed"));
      }
      const json = await res.json();
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
      setFilteredTotal(
        typeof json.filteredTotal === "number" ? json.filteredTotal : 0
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("loadFailed"));
      setLogs([]);
      setTotal(0);
      setFilteredTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const params = new URLSearchParams();
    params.set("download", "1");
    if (level !== "ALL") params.set("level", level);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    window.open(`/api/logs?${params.toString()}`, "_blank");
  };

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
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin, router, level, dateFrom, dateTo, tc]);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((item) => {
      const haystack = JSON.stringify(item).toLowerCase();
      return haystack.includes(keyword);
    });
  }, [logs, query]);

  if (status === "loading" || status === "unauthenticated") {
    return <TablePageSkeleton />;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
          <p className="text-sm text-v-text3 mt-1">
            {t("summary", { loaded: logs.length, filtered: filteredTotal, total })}
          </p>
        </div>
        <div className="flex gap-2">
          <HButton
            variant="bordered"
            className="border-v-border-input text-v-text2 hover:text-v-text1"
            startContent={<Download className="h-4 w-4" />}
            onPress={handleDownload}
          >
            {t("download")}
          </HButton>
          <HButton
            variant="bordered"
            className="border-v-border-input text-v-text2 hover:text-v-text1"
            isLoading={loading}
            spinner={<Loader2 className="h-4 w-4 animate-spin" />}
            startContent={!loading ? <RefreshCw className="h-4 w-4" /> : undefined}
            onPress={fetchLogs}
          >
            {t("refresh")}
          </HButton>
        </div>
      </div>

      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-v-text1">{t("filter")}</h3>
        </HCardHeader>
        <HCardBody className="px-6 pb-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HSelect
              placeholder={t("levelFilter")}
              selectedKeys={[level]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                if (val) setLevel(val);
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
              <HSelectItem key="ALL">{t("allLevels")}</HSelectItem>
              <HSelectItem key="INFO">INFO</HSelectItem>
              <HSelectItem key="WARN">WARN</HSelectItem>
              <HSelectItem key="ERROR">ERROR</HSelectItem>
            </HSelect>
            <HInput
              type="date"
              placeholder={t("dateFrom")}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              variant="bordered"
              size="sm"
              classNames={{
                inputWrapper: "border-v-border-input bg-v-input",
                input: "text-v-text2 placeholder:text-v-text4",
              }}
            />
            <HInput
              type="date"
              placeholder={t("dateTo")}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              variant="bordered"
              size="sm"
              classNames={{
                inputWrapper: "border-v-border-input bg-v-input",
                input: "text-v-text2 placeholder:text-v-text4",
              }}
            />
            <HButton
              variant="light"
              className="text-v-text3 hover:text-v-text1 self-end"
              onPress={() => {
                setLevel("ALL");
                setDateFrom("");
                setDateTo("");
              }}
            >
              {t("clearFilter")}
            </HButton>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-v-text4 z-10" />
            <HInput
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              variant="bordered"
              classNames={{
                inputWrapper: "border-v-border-input bg-v-input pl-9",
                input: "text-v-text2 placeholder:text-v-text4",
              }}
            />
          </div>
        </HCardBody>
      </HCard>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      <HCard className="bg-v-card border border-v-border">
        <HCardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-v-text4" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-v-text4">{t("noLogs")}</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto divide-y divide-v-border">
              {filteredLogs.map((item, idx) => (
                <div key={`${item.timestamp ?? "time"}-${idx}`} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip variant="bordered" size="sm" classNames={{ base: "border-v-border-input", content: "text-v-text2 text-xs" }}>
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
                    <span className="text-xs text-v-text4">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : t("unknownTime")}
                    </span>
                  </div>
                  <div className="text-sm text-v-text3 flex flex-wrap gap-x-4 gap-y-1">
                    <span>{t("user")}: {item.user ?? "-"}</span>
                    <span>{t("role")}: {item.role ?? "-"}</span>
                    <span>{t("model")}: {item.model ?? "-"}</span>
                    <span>{t("ip")}: {item.ip ?? "-"}</span>
                  </div>
                  {item.error && (
                    <p className="text-sm text-red-400">{t("error")}: {item.error}</p>
                  )}
                  {item.detail && (
                    <p className="text-sm text-v-text3">{t("detail")}: {item.detail}</p>
                  )}
                  {item.data !== undefined && (
                    <pre className="text-xs bg-v-card rounded-xl p-3 overflow-x-auto border border-v-border text-v-text3">
                      {JSON.stringify(item.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </HCardBody>
      </HCard>
    </div>
  );
}
