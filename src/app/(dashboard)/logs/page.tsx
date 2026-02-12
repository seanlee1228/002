"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";

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
        throw new Error(err.error || `请求失败: ${res.status}`);
      }
      const json = await res.json();
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
      setFilteredTotal(
        typeof json.filteredTotal === "number" ? json.filteredTotal : 0
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "日志加载失败");
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
  }, [status, isAdmin, router, level, dateFrom, dateTo]);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((item) => {
      const haystack = JSON.stringify(item).toLowerCase();
      return haystack.includes(keyword);
    });
  }, [logs, query]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统日志</h1>
          <p className="text-sm text-muted-foreground mt-1">
            已加载最近 {logs.length} 条，筛选命中 {filteredTotal} 条，总计 {total} 条
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            下载日志
          </Button>
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            刷新
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue placeholder="级别筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部级别</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Button
              variant="ghost"
              onClick={() => {
                setLevel("ALL");
                setDateFrom("");
                setDateTo("");
              }}
            >
              清空条件
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="按用户、动作、模型、IP、错误信息搜索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">暂无日志</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto divide-y">
              {filteredLogs.map((item, idx) => (
                <div key={`${item.timestamp ?? "time"}-${idx}`} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.level ?? "INFO"}</Badge>
                    {item.category && <Badge variant="secondary">{item.category}</Badge>}
                    {item.action && <Badge variant="secondary">{item.action}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : "未知时间"}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>用户: {item.user ?? "-"}</span>
                    <span>角色: {item.role ?? "-"}</span>
                    <span>模型: {item.model ?? "-"}</span>
                    <span>IP: {item.ip ?? "-"}</span>
                  </div>
                  {item.error && (
                    <p className="text-sm text-red-600">错误: {item.error}</p>
                  )}
                  {item.detail && (
                    <p className="text-sm text-muted-foreground">详情: {item.detail}</p>
                  )}
                  {item.data !== undefined && (
                    <pre className="text-xs bg-gray-50 rounded-md p-3 overflow-x-auto border">
                      {JSON.stringify(item.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
