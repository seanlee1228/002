"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CalendarDays,
  ClipboardList,
  Users,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
} from "lucide-react";

interface ScoreRecord {
  id: string;
  score: number;
  comment: string | null;
  class: { id: string; name: string; grade: number; section: number };
  inspectionItem: {
    id: string;
    title: string;
    description: string | null;
    maxScore: number;
    date: string;
  };
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
  totalScore: number;
  totalMaxScore: number;
  scoreRate: number;
}

interface HistoryData {
  scores: ScoreRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    totalScoredDays: number;
    totalScoreCount: number;
    distinctClasses: number;
  };
  classesScored: ClassOption[];
  dailySummary: DailySummary[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
  return `${month}月${day}日 (周${weekNames[d.getDay()]})`;
}

export default function DutyHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"records" | "daily">("records");

  // Redirect non-DUTY_TEACHER users
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
  }, [page, classFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "DUTY_TEACHER") {
      fetchData();
    }
  }, [status, session, fetchData]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    );
  }

  if (session?.user?.role !== "DUTY_TEACHER") return null;

  const managedGrade = session?.user?.managedGrade;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History className="h-7 w-7 text-violet-600" />
          {managedGrade ? `${managedGrade}年级 · 历史评分预览` : "历史评分预览"}
        </h1>
        <Badge variant="outline" className="text-violet-600 border-violet-300">
          只读
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-violet-100 p-2.5">
              <CalendarDays className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">累计评分天数</p>
              <p className="text-2xl font-bold text-violet-700">
                {data?.summary.totalScoredDays ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2.5">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">累计评分次数</p>
              <p className="text-2xl font-bold text-blue-700">
                {data?.summary.totalScoreCount ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2.5">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">覆盖班级数</p>
              <p className="text-2xl font-bold text-emerald-700">
                {data?.summary.distinctClasses ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & View mode toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">班级筛选</label>
              <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="全部班级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部班级</SelectItem>
                  {data?.classesScored.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">起始日期</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">截止日期</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-[150px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); setClassFilter("all"); setPage(1); }}
            >
              <Search className="h-4 w-4 mr-1" />
              重置
            </Button>
            <div className="ml-auto flex gap-1">
              <Button
                variant={viewMode === "records" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("records")}
              >
                评分明细
              </Button>
              <Button
                variant={viewMode === "daily" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("daily")}
              >
                按日汇总
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records view */}
      {viewMode === "records" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">评分明细</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600" />
              </div>
            ) : data?.scores.length ? (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">日期</TableHead>
                        <TableHead>班级</TableHead>
                        <TableHead>检查项目</TableHead>
                        <TableHead className="w-[80px] text-center">得分</TableHead>
                        <TableHead className="w-[80px] text-center">满分</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.scores.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">
                            {formatDate(s.inspectionItem.date)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.class.name}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{s.inspectionItem.title}</TableCell>
                          <TableCell className="text-center font-semibold">
                            <span
                              className={
                                s.score >= s.inspectionItem.maxScore * 0.8
                                  ? "text-emerald-600"
                                  : s.score >= s.inspectionItem.maxScore * 0.6
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }
                            >
                              {s.score}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {s.inspectionItem.maxScore}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {s.comment || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      共 {data.pagination.totalCount} 条记录，第 {data.pagination.page}/{data.pagination.totalPages} 页
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= data.pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                暂无评分记录
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Daily summary view */}
      {viewMode === "daily" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">按日汇总（近 90 天）</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600" />
              </div>
            ) : data?.dailySummary.length ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">日期</TableHead>
                      <TableHead className="w-[80px] text-center">评分次数</TableHead>
                      <TableHead className="w-[100px] text-center">总得分</TableHead>
                      <TableHead className="w-[100px] text-center">总满分</TableHead>
                      <TableHead className="w-[100px] text-center">得分率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dailySummary.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="text-sm">{formatDate(d.date)}</TableCell>
                        <TableCell className="text-center">{d.count}</TableCell>
                        <TableCell className="text-center font-semibold">{d.totalScore}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{d.totalMaxScore}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              d.scoreRate >= 80
                                ? "text-emerald-600 border-emerald-300"
                                : d.scoreRate >= 60
                                ? "text-amber-600 border-amber-300"
                                : "text-red-600 border-red-300"
                            }
                          >
                            {d.scoreRate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                暂无按日汇总数据
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
