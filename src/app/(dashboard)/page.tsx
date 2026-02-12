"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  PenLine,
  TrendingUp,
  BarChart3,
  FileText,
  ChevronRight,
  CheckCircle2,
  Circle,
  Sparkles,
  AlertTriangle,
  TrendingDown,
  Activity,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  GraduationCap,
  CalendarDays,
  Target,
  Scale,
  History,
  Trophy,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface RankingItem {
  title: string;
  avgScore: number;
  avgDeduction: number;
  maxScore: number;
  scoreRate: number;
  count: number;
}

interface RiskArea {
  title: string;
  trend: "declining" | "volatile";
  avgScore: number;
  suggestion: string;
}

interface Recommendation {
  title: string;
  reason: string;
  priority: "high" | "medium";
}

interface GradeAlert {
  grade: number;
  weakArea: string;
  avgScore: number;
}

interface DashboardData {
  stats: {
    inspectionCount: number;
    scoredClasses: number;
    totalClasses: number;
    teacherCount: number;
  };
  weeklyTrend: Array<Record<string, number | string>>;
  todayItems: Array<{
    id: string;
    title: string;
    description: string;
    maxScore: number;
  }>;
  unscoredClasses?: Array<{
    id: string;
    name: string;
    grade: number;
  }>;
  scoringRanking?: {
    worstItems: RankingItem[];
    bestItems: RankingItem[];
  };
  aiAnalysis?: {
    riskAreas: RiskArea[];
    recommendations: Recommendation[];
    gradeAlerts: GradeAlert[];
  };
  classScores?: Array<{
    title: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  classTotalToday?: number;
  classWeekRank?: number;
  classWeekGradeTotal?: number;
  classItemAnalysis?: {
    range: string;
    topDeductions: Array<{ title: string; avgDeduction: number; maxScore: number; count: number }>;
    topScores: Array<{ title: string; avgScoreRate: number; maxScore: number; count: number }>;
    aiTips: string[];
  };
  dutyTeacherMetrics?: {
    totalScoredDays: number;
    totalScoreCount: number;
    distinctClasses: number;
    personalAvgRate: number;
    gradeAvgRate: number;
  };
  dutyTeacherAiInsights?: {
    tendency: "strict" | "lenient" | "balanced";
    tendencyDesc: string;
    stabilityLevel: "stable" | "moderate" | "volatile";
    stabilityDesc: string;
    frequentDeductions: Array<{
      title: string;
      avgDeduction: number;
      maxScore: number;
      count: number;
    }>;
    suggestions: string[];
    sampleSufficient: boolean;
  };
}

interface LogMetrics {
  loginCount: number;
  scoreRecordCount: number;
  systemErrorCount: number;
}

function StatCardSkeleton() {
  return (
    <div className="h-28 rounded-xl bg-white border border-gray-200 animate-pulse">
      <div className="p-5 h-full flex flex-col">
        <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
        <div className="h-8 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

function ChartSkeleton({ height = 256 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{ height }}>
      <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
      <div className="flex items-end gap-2 h-[calc(100%-2rem)]">
        {[50, 65, 45, 80, 55, 70, 60].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-200 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <Card className={`overflow-hidden border-0 shadow-sm ${gradient} text-white`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white/90">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="rounded-lg bg-white/20 p-2">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const GRADE_COLORS: Record<string, string> = {
  grade1Avg: "#3b82f6",
  grade2Avg: "#10b981",
  grade3Avg: "#f59e0b",
};

const GRADE_LABELS: Record<string, string> = {
  grade1Avg: "1年级",
  grade2Avg: "2年级",
  grade3Avg: "3年级",
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [logMetrics, setLogMetrics] = useState<LogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisRange, setAnalysisRange] = useState<"week" | "month" | "year">("month");
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const role = session?.user?.role;

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status !== "authenticated" || !role) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const dashboardReq = fetch("/api/scores/dashboard?classAnalysisRange=month");
        const logsReq =
          role === "ADMIN" ? fetch("/api/logs?limit=1") : Promise.resolve(null);

        const [dashboardRes, logsRes] = await Promise.all([dashboardReq, logsReq]);

        if (!dashboardRes.ok) {
          const errData = await dashboardRes.json().catch(() => ({}));
          throw new Error(errData.error || `请求失败: ${dashboardRes.status}`);
        }

        const dashboardJson = await dashboardRes.json();
        setData(dashboardJson);

        if (logsRes && logsRes.ok) {
          const logsJson = await logsRes.json();
          setLogMetrics({
            loginCount: logsJson.loginCount ?? 0,
            scoreRecordCount: logsJson.scoreRecordCount ?? 0,
            systemErrorCount: logsJson.systemErrorCount ?? 0,
          });
        } else {
          setLogMetrics(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        setData(null);
        setLogMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [status, role]);

  // Refetch only the analysis range for CLASS_TEACHER
  const handleAnalysisRangeChange = useCallback(async (range: "week" | "month" | "year") => {
    setAnalysisRange(range);
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/scores/dashboard?classAnalysisRange=${range}`);
      if (res.ok) {
        const json = await res.json();
        setData((prev) =>
          prev ? { ...prev, classItemAnalysis: json.classItemAnalysis } : prev
        );
      }
    } catch {
      // silently fail
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">无法获取您的角色信息</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {role === "ADMIN" && "管理仪表盘"}
          {role === "GRADE_LEADER" && `${session?.user?.managedGrade ?? ""}年级仪表盘`}
          {role === "DUTY_TEACHER" && (session?.user?.managedGrade ? `${session.user.managedGrade}年级 · 今日评分` : "今日评分")}
          {role === "CLASS_TEACHER" && "班级成绩"}
        </h1>
        <p className="text-muted-foreground mt-1">{session?.user?.name}，欢迎回来</p>
      </div>

      {/* ============ ADMIN / GRADE_LEADER Dashboard ============ */}
      {(role === "ADMIN" || role === "GRADE_LEADER") && (
        <>
          {/* Change 3: Only 2 stat cards (removed totalClasses & teacherCount) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="今日检查项"
                  value={data?.stats?.inspectionCount ?? 0}
                  icon={ClipboardCheck}
                  gradient="bg-gradient-to-br from-blue-500 to-blue-600"
                />
                <StatCard
                  label="今日已评班级"
                  value={data?.stats?.scoredClasses ?? 0}
                  icon={CheckCircle2}
                  gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
                />
              </>
            )}
          </div>

          {/* Change 1: Today's inspection items list */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                今日检查项目
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardSkeleton />
              ) : data?.todayItems?.length ? (
                <div className="space-y-3">
                  {data.todayItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">满分 {item.maxScore}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  今日暂无检查项
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change 2: Inspection progress + unscored classes */}
          <Card>
            <CardHeader>
              <CardTitle>今日检查进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <CardSkeleton />
              ) : data?.stats ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">已评班级 / 总班级</span>
                        <span className="font-medium">
                          {data.stats.scoredClasses} / {data.stats.totalClasses}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                          style={{
                            width: `${
                              data.stats.totalClasses > 0
                                ? (data.stats.scoredClasses / data.stats.totalClasses) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {data.stats.totalClasses > 0
                        ? Math.round(
                            (data.stats.scoredClasses / data.stats.totalClasses) * 100
                          )
                        : 0}
                      %
                    </Badge>
                  </div>
                  {/* Unscored classes list */}
                  {data.unscoredClasses && data.unscoredClasses.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        未检查班级 ({data.unscoredClasses.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {data.unscoredClasses.map((cls) => (
                          <Badge
                            key={cls.id}
                            variant="outline"
                            className="text-orange-700 border-orange-300 bg-orange-50"
                          >
                            {cls.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">暂无数据</p>
              )}
            </CardContent>
          </Card>

          {/* Change 4: Weekly trend by grade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {role === "GRADE_LEADER"
                  ? `近7日评分趋势（${session?.user?.managedGrade}年级）`
                  : "近7日评分趋势（按年级）"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton />
              ) : data?.weeklyTrend?.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.weeklyTrend}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                        formatter={(value?: number | string, name?: string) => [
                          value != null ? Number(value).toFixed(1) : "",
                          name ? (GRADE_LABELS[name] || name) : "",
                        ]}
                      />
                      <Legend
                        formatter={(value: string) => GRADE_LABELS[value] || value}
                      />
                      {(role === "GRADE_LEADER" ? [session?.user?.managedGrade ?? 1] : [1, 2, 3]).map(
                        (grade) => {
                          const key = `grade${grade}Avg`;
                          return (
                            <Line
                              key={key}
                              type="monotone"
                              dataKey={key}
                              stroke={GRADE_COLORS[key] || "#3b82f6"}
                              strokeWidth={2}
                              dot={{ fill: GRADE_COLORS[key] || "#3b82f6", r: 3 }}
                            />
                          );
                        }
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  暂无数据
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change 5: Best / Worst scoring items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Worst items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ThumbsDown className="h-5 w-5 text-red-500" />
                  近期扣分最多项目
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <CardSkeleton />
                ) : data?.scoringRanking?.worstItems?.length ? (
                  <div className="space-y-3">
                    {data.scoringRanking.worstItems.map((item, idx) => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-red-400">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              平均扣分 {item.avgDeduction} · 得分率 {item.scoreRate}%
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          {item.avgScore}/{item.maxScore}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-6 text-muted-foreground">暂无数据</p>
                )}
              </CardContent>
            </Card>

            {/* Best items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ThumbsUp className="h-5 w-5 text-emerald-500" />
                  近期最佳评分项目
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <CardSkeleton />
                ) : data?.scoringRanking?.bestItems?.length ? (
                  <div className="space-y-3">
                    {data.scoringRanking.bestItems.map((item, idx) => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 bg-emerald-50/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-emerald-400">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              得分率 {item.scoreRate}% · 共{item.count}次评分
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-emerald-600 border-emerald-300"
                        >
                          {item.avgScore}/{item.maxScore}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-6 text-muted-foreground">暂无数据</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Change 6: AI Analysis Module */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                AI 智能分析
                <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 text-xs">
                  基于近30天数据
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <CardSkeleton />
              ) : data?.aiAnalysis ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Risk areas */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      风险预警
                    </h4>
                    {data.aiAnalysis.riskAreas.length > 0 ? (
                      <div className="space-y-2">
                        {data.aiAnalysis.riskAreas.map((area) => (
                          <div
                            key={area.title}
                            className="p-3 rounded-lg border border-amber-200 bg-amber-50/50"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {area.trend === "declining" ? (
                                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <Activity className="h-3.5 w-3.5 text-amber-500" />
                              )}
                              <span className="font-medium text-sm">{area.title}</span>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  area.trend === "declining"
                                    ? "text-red-600 border-red-300"
                                    : "text-amber-600 border-amber-300"
                                }`}
                              >
                                {area.trend === "declining" ? "下降" : "波动"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{area.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 text-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                        <p className="text-sm text-emerald-700">暂无风险</p>
                      </div>
                    )}
                  </div>

                  {/* Recommendations */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                      <Lightbulb className="h-4 w-4 text-blue-500" />
                      推荐关注
                    </h4>
                    <div className="space-y-2">
                      {data.aiAnalysis.recommendations.map((rec) => (
                        <div
                          key={rec.title}
                          className="p-3 rounded-lg border border-blue-200 bg-blue-50/50"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{rec.title}</span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                rec.priority === "high"
                                  ? "text-red-600 border-red-300"
                                  : "text-blue-600 border-blue-300"
                              }`}
                            >
                              {rec.priority === "high" ? "高优先" : "建议"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{rec.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grade alerts */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                      <GraduationCap className="h-4 w-4 text-violet-500" />
                      年级提醒
                    </h4>
                    {data.aiAnalysis.gradeAlerts.length > 0 ? (
                      <div className="space-y-2">
                        {data.aiAnalysis.gradeAlerts.map((alert) => (
                          <div
                            key={`${alert.grade}-${alert.weakArea}`}
                            className="p-3 rounded-lg border border-violet-200 bg-violet-50/50"
                          >
                            <p className="font-medium text-sm">
                              {alert.grade}年级 - {alert.weakArea}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              平均分 {alert.avgScore}，低于合格线，建议重点关注
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 text-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                        <p className="text-sm text-emerald-700">各年级表现均衡</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center py-6 text-muted-foreground">暂无分析数据</p>
              )}
            </CardContent>
          </Card>

          {/* ============ ADMIN Log Statistics (bottom) ============ */}
          {role === "ADMIN" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  系统日志统计
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link href="/logs">查看详情</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                  </div>
                ) : logMetrics ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="登录总次数"
                      value={logMetrics.loginCount}
                      icon={FileText}
                      gradient="bg-gradient-to-br from-blue-500 to-blue-600"
                    />
                    <StatCard
                      label="评分记录总次数"
                      value={logMetrics.scoreRecordCount}
                      icon={PenLine}
                      gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
                    />
                    <StatCard
                      label="系统错误数量"
                      value={logMetrics.systemErrorCount}
                      icon={AlertTriangle}
                      gradient="bg-gradient-to-br from-red-500 to-red-600"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无统计数据</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ============ DUTY_TEACHER Dashboard ============ */}
      {role === "DUTY_TEACHER" && (
        <>
          {/* Stat cards: today + cumulative */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="已评班级"
                  value={data?.stats?.scoredClasses ?? 0}
                  icon={CheckCircle2}
                  gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
                />
                <StatCard
                  label="待评班级"
                  value={
                    (data?.stats?.totalClasses ?? 0) - (data?.stats?.scoredClasses ?? 0)
                  }
                  icon={Circle}
                  gradient="bg-gradient-to-br from-amber-500 to-amber-600"
                />
                <StatCard
                  label="累计评分天数"
                  value={data?.dutyTeacherMetrics?.totalScoredDays ?? 0}
                  icon={CalendarDays}
                  gradient="bg-gradient-to-br from-violet-500 to-violet-600"
                />
              </>
            )}
          </div>

          {/* Today's inspection items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>今日检查项</CardTitle>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/duty-history">
                    <History className="mr-2 h-4 w-4" />
                    历史评分
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/scoring">
                    <PenLine className="mr-2 h-4 w-4" />
                    去评分
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardSkeleton />
              ) : data?.todayItems?.length ? (
                <div className="space-y-3">
                  {data.todayItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">满分 {item.maxScore}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  今日暂无检查项
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Scoring Habit Analysis */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                AI 评分习惯分析
                <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 text-xs">
                  基于历史全部数据
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <CardSkeleton />
              ) : data?.dutyTeacherAiInsights ? (
                !data.dutyTeacherAiInsights.sampleSufficient ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      评分天数不足 5 天，AI 分析样本不足。请继续积累评分数据。
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      当前已评分 {data.dutyTeacherMetrics?.totalScoredDays ?? 0} 天
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xs text-muted-foreground">累计评分次数</p>
                        <p className="text-xl font-bold mt-1">
                          {data.dutyTeacherMetrics?.totalScoreCount ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xs text-muted-foreground">覆盖班级数</p>
                        <p className="text-xl font-bold mt-1">
                          {data.dutyTeacherMetrics?.distinctClasses ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xs text-muted-foreground">个人平均得分率</p>
                        <p className="text-xl font-bold mt-1">
                          {data.dutyTeacherMetrics?.personalAvgRate ?? 0}%
                        </p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xs text-muted-foreground">年级平均得分率</p>
                        <p className="text-xl font-bold mt-1">
                          {data.dutyTeacherMetrics?.gradeAvgRate ?? 0}%
                        </p>
                      </div>
                    </div>

                    {/* Insights grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Tendency */}
                      <div className="p-4 rounded-lg border">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                          <Scale className="h-4 w-4 text-blue-500" />
                          严宽倾向
                        </h4>
                        <Badge
                          variant="outline"
                          className={
                            data.dutyTeacherAiInsights.tendency === "strict"
                              ? "text-red-600 border-red-300 mb-2"
                              : data.dutyTeacherAiInsights.tendency === "lenient"
                              ? "text-amber-600 border-amber-300 mb-2"
                              : "text-emerald-600 border-emerald-300 mb-2"
                          }
                        >
                          {data.dutyTeacherAiInsights.tendency === "strict"
                            ? "偏严格"
                            : data.dutyTeacherAiInsights.tendency === "lenient"
                            ? "偏宽松"
                            : "均衡"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {data.dutyTeacherAiInsights.tendencyDesc}
                        </p>
                      </div>

                      {/* Stability */}
                      <div className="p-4 rounded-lg border">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                          <Activity className="h-4 w-4 text-violet-500" />
                          评分稳定性
                        </h4>
                        <Badge
                          variant="outline"
                          className={
                            data.dutyTeacherAiInsights.stabilityLevel === "volatile"
                              ? "text-red-600 border-red-300 mb-2"
                              : data.dutyTeacherAiInsights.stabilityLevel === "moderate"
                              ? "text-amber-600 border-amber-300 mb-2"
                              : "text-emerald-600 border-emerald-300 mb-2"
                          }
                        >
                          {data.dutyTeacherAiInsights.stabilityLevel === "volatile"
                            ? "波动较大"
                            : data.dutyTeacherAiInsights.stabilityLevel === "moderate"
                            ? "一般"
                            : "非常稳定"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {data.dutyTeacherAiInsights.stabilityDesc}
                        </p>
                      </div>

                      {/* Frequent deductions */}
                      <div className="p-4 rounded-lg border">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                          <Target className="h-4 w-4 text-red-500" />
                          常见扣分项
                        </h4>
                        {data.dutyTeacherAiInsights.frequentDeductions.length > 0 ? (
                          <div className="space-y-2">
                            {data.dutyTeacherAiInsights.frequentDeductions.map((d, idx) => (
                              <div key={d.title} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-red-400">{idx + 1}</span>
                                  <span className="truncate max-w-[120px]">{d.title}</span>
                                </span>
                                <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                                  扣 {d.avgDeduction}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">暂无显著扣分项</p>
                        )}
                      </div>
                    </div>

                    {/* Suggestions */}
                    <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                        <Lightbulb className="h-4 w-4 text-blue-500" />
                        AI 建议
                      </h4>
                      <ul className="space-y-2">
                        {data.dutyTeacherAiInsights.suggestions.map((s, idx) => (
                          <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无分析数据
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ CLASS_TEACHER Dashboard ============ */}
      {role === "CLASS_TEACHER" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="今日总分"
                  value={data?.classTotalToday ?? 0}
                  icon={BarChart3}
                  gradient="bg-gradient-to-br from-blue-500 to-blue-600"
                />
                <StatCard
                  label="本周年级排名"
                  value={
                    data?.classWeekRank
                      ? data.classWeekRank <= 3
                        ? `第${data.classWeekRank}名`
                        : "仍需努力"
                      : "-"
                  }
                  icon={Trophy}
                  gradient={
                    data?.classWeekRank === 1
                      ? "bg-gradient-to-br from-yellow-400 to-amber-500"
                      : data?.classWeekRank === 2
                      ? "bg-gradient-to-br from-gray-300 to-gray-400"
                      : data?.classWeekRank === 3
                      ? "bg-gradient-to-br from-orange-400 to-orange-500"
                      : "bg-gradient-to-br from-orange-500 to-orange-600"
                  }
                />
              </>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>本周趋势</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton height={160} />
              ) : data?.weeklyTrend?.length ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.weeklyTrend}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        dataKey="avgScore"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        width={28}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ fill: "#10b981", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground">
                  暂无数据
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>今日班级评分明细</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardSkeleton />
              ) : data?.classScores?.length ? (
                <div className="space-y-3">
                  {data.classScores.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 rounded-lg border border-gray-200"
                    >
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.comment && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.comment}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600">{item.score}</span>
                        <span className="text-muted-foreground">/ {item.maxScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  今日暂无评分记录
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Item Analysis Module ---- */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-cyan-500/10 border-b">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  评分项目分析
                </CardTitle>
                <div className="flex gap-1">
                  {(["week", "month", "year"] as const).map((r) => {
                    const labels = { week: "本周", month: "本月", year: "本学年" };
                    return (
                      <Button
                        key={r}
                        variant={analysisRange === r ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7 px-3"
                        disabled={analysisLoading}
                        onClick={() => handleAnalysisRangeChange(r)}
                      >
                        {labels[r]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {(loading || analysisLoading) ? (
                <CardSkeleton />
              ) : data?.classItemAnalysis ? (
                <div className="space-y-6">
                  {/* Top deductions + Top scores grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Deductions */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <ThumbsDown className="h-4 w-4 text-red-500" />
                        扣分最多项目
                      </h4>
                      {data.classItemAnalysis.topDeductions.length > 0 ? (
                        <div className="space-y-2">
                          {data.classItemAnalysis.topDeductions.map((d, idx) => (
                            <div
                              key={d.title}
                              className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/50"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                                  {idx + 1}
                                </span>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{d.title}</p>
                                  <p className="text-xs text-muted-foreground">{d.count} 次评分</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-red-600 border-red-300">
                                平均扣 {d.avgDeduction} 分
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground p-3 rounded-lg border border-dashed text-center">
                          暂无扣分数据
                        </div>
                      )}
                    </div>

                    {/* Top scores */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <ThumbsUp className="h-4 w-4 text-emerald-500" />
                        得分最高项目
                      </h4>
                      {data.classItemAnalysis.topScores.length > 0 ? (
                        <div className="space-y-2">
                          {data.classItemAnalysis.topScores.map((d, idx) => (
                            <div
                              key={d.title}
                              className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 bg-emerald-50/50"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                  {idx + 1}
                                </span>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{d.title}</p>
                                  <p className="text-xs text-muted-foreground">{d.count} 次评分</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                                得分率 {d.avgScoreRate}%
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground p-3 rounded-lg border border-dashed text-center">
                          暂无得分数据
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Tips */}
                  {data.classItemAnalysis.aiTips.length > 0 && (
                    <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                        <Sparkles className="h-4 w-4 text-blue-500" />
                        AI 班级管理建议
                      </h4>
                      <ul className="space-y-2">
                        {data.classItemAnalysis.aiTips.map((tip, idx) => (
                          <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无分析数据
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
