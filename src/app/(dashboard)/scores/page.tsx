"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Loader2,
  Trophy,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Period = "today" | "week" | "month" | "year";
type Scope = "all" | "grade" | "class";

const PERIOD_LABELS: Record<Period, string> = {
  today: "今日",
  week: "本周",
  month: "本月",
  year: "本学年",
};

interface ClassSummary {
  classId: string;
  className: string;
  grade: number;
  section: number;
  totalScore: number;
  avgScore: number;
  scoreCount: number;
  rank: number;
}

interface SummaryData {
  period: string;
  scope: string;
  classSummaries: ClassSummary[];
  overallAvg: number;
  overallTotal: number;
}

interface ItemSummary {
  title: string;
  totalScore: number;
  maxPossible: number;
  scoreRate: number;
  count: number;
}

interface DetailData {
  className: string;
  classId: string;
  grade: number;
  section: number;
  period: string;
  itemSummaries: ItemSummary[];
  total: number;
  average: number;
  schoolAvgScoreRate?: number;
  gradeAvgScoreRate?: number;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
}

export default function ScoresPage() {
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<Period>("today");
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

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";
  const isDutyTeacher = session?.user?.role === "DUTY_TEACHER";
  const isClassTeacher = session?.user?.role === "CLASS_TEACHER";

  // Fetch classes for selectors
  useEffect(() => {
    if (status !== "authenticated") return;
    if (isAdmin || isGradeLeader || isDutyTeacher) {
      fetch("/api/classes")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setClasses(data);
            if (data.length > 0 && !classId) setClassId(data[0].id);
          }
        })
        .catch(() => setClasses([]));
    }
  }, [status, isAdmin, isGradeLeader, isDutyTeacher]);

  // Fetch main data
  const fetchData = useCallback(async () => {
    if (status !== "authenticated") return;

    // Class teacher goes directly to their own class detail
    if (isClassTeacher && session?.user?.classId) {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          classId: session.user.classId,
          period,
        });
        const res = await fetch(`/api/scores/detail?${params}`);
        if (!res.ok) throw new Error("加载失败");
        const json = await res.json();
        setDetailData(json);
        setSummaryData(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Admin / Duty Teacher: scope-based view
    if (scope === "class" && classId) {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          classId,
          period,
        });
        const res = await fetch(`/api/scores/detail?${params}`);
        if (!res.ok) throw new Error("加载失败");
        const json = await res.json();
        setDetailData(json);
        setSummaryData(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Scope all or grade: summary view
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope, period });
      if (scope === "grade") params.set("grade", gradeFilter);
      const res = await fetch(`/api/scores?${params}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setSummaryData(json);
      setDetailData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [status, period, scope, gradeFilter, classId, isClassTeacher, session?.user?.classId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Drill-down: click a class row to see detail
  const handleDrillDown = async (targetClassId: string) => {
    setDetailLoading(true);
    setDialogOpen(true);
    setDetailData(null);
    try {
      const params = new URLSearchParams({
        classId: targetClassId,
        period,
      });
      const res = await fetch(`/api/scores/detail?${params}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setDetailData(json);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载中...
        </div>
      </div>
    );
  }

  const filteredClasses = scope === "grade"
    ? classes.filter((c) => c.grade === parseInt(gradeFilter))
    : classes;

  // Find best & worst from summary
  const bestClass = summaryData?.classSummaries?.length
    ? summaryData.classSummaries.reduce((best, c) => (c.avgScore > best.avgScore ? c : best))
    : null;
  const worstClass = summaryData?.classSummaries?.length
    ? summaryData.classSummaries.reduce((worst, c) =>
        c.scoreCount > 0 && c.avgScore < worst.avgScore ? c : worst
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {(isGradeLeader || isDutyTeacher) && session?.user?.managedGrade
            ? `${session.user.managedGrade}年级成绩查看`
            : "成绩查看"}
        </h1>
        {isClassTeacher && session?.user?.className && (
          <p className="text-muted-foreground mt-1">{session.user.className}</p>
        )}
      </div>

      {/* Controls - only for Admin/DutyTeacher */}
      {!isClassTeacher && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">范围:</span>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全校</SelectItem>
                  <SelectItem value="grade">年级组</SelectItem>
                  <SelectItem value="class">班级</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "grade" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">年级:</span>
                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1年级</SelectItem>
                    <SelectItem value="2">2年级</SelectItem>
                    <SelectItem value="3">3年级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "class" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">班级:</span>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="选择班级" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <TabsList>
              <TabsTrigger value="today" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                今日
              </TabsTrigger>
              <TabsTrigger value="week" className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                本周
              </TabsTrigger>
              <TabsTrigger value="month" className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                本月
              </TabsTrigger>
              <TabsTrigger value="year" className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                本学年
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Class teacher period selector */}
      {isClassTeacher && (
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="today">今日</TabsTrigger>
            <TabsTrigger value="week">本周</TabsTrigger>
            <TabsTrigger value="month">本月</TabsTrigger>
            <TabsTrigger value="year">本学年</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            重试
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ---- Summary view (scope=all or scope=grade) ---- */}
          {summaryData && !isClassTeacher && scope !== "class" && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">全局平均分</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {summaryData.overallAvg.toFixed(1)}
                    </p>
                  </CardContent>
                </Card>
                {bestClass && bestClass.scoreCount > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">最高分班级</p>
                      <p className="text-lg font-bold text-emerald-600 mt-1">
                        {bestClass.className}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        平均 {bestClass.avgScore.toFixed(1)}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {worstClass && worstClass.scoreCount > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">最低分班级</p>
                      <p className="text-lg font-bold text-amber-600 mt-1">
                        {worstClass.className}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        平均 {worstClass.avgScore.toFixed(1)}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Class ranking table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    班级排名 - {PERIOD_LABELS[period]}
                    {scope === "grade" && ` (${gradeFilter}年级)`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {summaryData.classSummaries.length === 0 ? (
                    <p className="text-center py-12 text-muted-foreground">暂无数据</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">排名</TableHead>
                          <TableHead>班级</TableHead>
                          <TableHead className="text-right">总分</TableHead>
                          <TableHead className="text-right">平均分</TableHead>
                          <TableHead className="text-right">评分次数</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...summaryData.classSummaries]
                          .sort((a, b) => a.rank - b.rank)
                          .map((cls) => (
                            <TableRow
                              key={cls.classId}
                              className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                              onClick={() => handleDrillDown(cls.classId)}
                            >
                              <TableCell>
                                <span
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                                    cls.rank === 1
                                      ? "bg-amber-100 text-amber-700"
                                      : cls.rank === 2
                                      ? "bg-gray-100 text-gray-600"
                                      : cls.rank === 3
                                      ? "bg-orange-100 text-orange-600"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {cls.rank}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{cls.className}</TableCell>
                              <TableCell className="text-right font-mono">
                                {cls.totalScore.toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {cls.avgScore.toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {cls.scoreCount}
                              </TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ---- Detail view (scope=class or CLASS_TEACHER) ---- */}
          {((scope === "class" && !isClassTeacher) || isClassTeacher) && detailData && (
            <DetailView data={detailData} period={period} />
          )}
        </>
      )}

      {/* Drill-down dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailData
                ? `${detailData.className} - ${PERIOD_LABELS[period]}评分详情`
                : "加载中..."}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detailData ? (
            <DetailView data={detailData} period={period} compact />
          ) : (
            <p className="text-center py-8 text-muted-foreground">加载失败</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Shared detail view component
function DetailView({
  data,
  period,
  compact = false,
}: {
  data: DetailData;
  period: Period;
  compact?: boolean;
}) {
  return (
    <div className={`space-y-${compact ? "4" : "6"}`}>
      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary" className="text-sm">
          总分: {data.total.toFixed(1)}
        </Badge>
        <Badge variant="outline" className="text-sm">
          平均分: {data.average.toFixed(1)}
        </Badge>
        <Badge variant="outline" className="text-sm">
          评分项: {data.itemSummaries.length} 类
        </Badge>
      </div>

      {/* Score rate chart — sorted by scoreRate descending, with reference lines */}
      {data.itemSummaries.length > 0 && (() => {
        const sortedByRate = [...data.itemSummaries].sort((a, b) => b.scoreRate - a.scoreRate);
        const chartHeight = Math.max(compact ? 180 : 240, sortedByRate.length * 36);
        return (
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedByRate}
                margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <YAxis
                  type="category"
                  dataKey="title"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                  formatter={(value?: number | string) => [`${value ?? 0}%`, "得分率"]}
                />
                {/* School avg reference line */}
                {data.schoolAvgScoreRate != null && data.schoolAvgScoreRate > 0 && (
                  <ReferenceLine
                    x={data.schoolAvgScoreRate}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    label={{
                      value: `全校 ${data.schoolAvgScoreRate}%`,
                      position: "top",
                      fill: "#f59e0b",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                )}
                {/* Grade avg reference line */}
                {data.gradeAvgScoreRate != null && data.gradeAvgScoreRate > 0 && (
                  <ReferenceLine
                    x={data.gradeAvgScoreRate}
                    stroke="#8b5cf6"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: `年级 ${data.gradeAvgScoreRate}%`,
                      position: "insideTopRight",
                      fill: "#8b5cf6",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                )}
                <Bar dataKey="scoreRate" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Legend for reference lines */}
      {data.itemSummaries.length > 0 && (data.schoolAvgScoreRate || data.gradeAvgScoreRate) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground justify-end">
          {data.schoolAvgScoreRate != null && data.schoolAvgScoreRate > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-amber-500 inline-block" style={{ borderTop: "2px dashed #f59e0b" }} />
              全校平均 {data.schoolAvgScoreRate}%
            </span>
          )}
          {data.gradeAvgScoreRate != null && data.gradeAvgScoreRate > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-violet-500 inline-block" style={{ borderTop: "2px dashed #8b5cf6" }} />
              年级平均 {data.gradeAvgScoreRate}%
            </span>
          )}
        </div>
      )}

      {/* Detail table — sorted by totalScore descending */}
      {data.itemSummaries.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>检查项</TableHead>
              <TableHead className="text-right">总得分</TableHead>
              <TableHead className="text-right">满分合计</TableHead>
              <TableHead className="text-right">得分率</TableHead>
              <TableHead className="text-right">评分次数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data.itemSummaries]
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((item) => (
              <TableRow key={item.title}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell className="text-right font-mono">
                  {item.totalScore.toFixed(1)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {item.maxPossible.toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={
                      item.scoreRate >= 90
                        ? "text-emerald-600 border-emerald-300"
                        : item.scoreRate >= 75
                        ? "text-blue-600 border-blue-300"
                        : "text-red-600 border-red-300"
                    }
                  >
                    {item.scoreRate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {item.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-center py-8 text-muted-foreground">暂无评分记录</p>
      )}
    </div>
  );
}
