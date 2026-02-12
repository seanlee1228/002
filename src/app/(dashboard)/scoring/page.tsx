"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Circle,
  ArrowLeft,
  Save,
  Loader2,
  ClipboardCheck,
} from "lucide-react";

interface InspectionItem {
  id: string;
  title: string;
  description: string | null;
  maxScore: number;
}

interface ClassScore {
  id: string;
  name: string;
  grade: number;
  section: number;
  scores: Array<{
    id: string;
    title: string;
    description: string | null;
    maxScore: number;
    score: { score: number; comment: string | null } | null;
    hasBeenScored: boolean;
  }>;
  scoredItemIds: string[];
}

interface ScoringData {
  date: string;
  classes: ClassScore[];
  inspectionItems: InspectionItem[];
}

// 12 distinct, stable color schemes for class cards
const CLASS_COLOR_PALETTE = [
  { bg: "bg-blue-50",    border: "border-blue-300",    ring: "ring-blue-500",    headerBg: "bg-blue-500",    headerText: "text-blue-700",    accent: "text-blue-600",    badgeBg: "bg-blue-100",  badgeText: "text-blue-700",  gradientFrom: "from-blue-500",    gradientTo: "to-blue-600"    },
  { bg: "bg-violet-50",  border: "border-violet-300",  ring: "ring-violet-500",  headerBg: "bg-violet-500",  headerText: "text-violet-700",  accent: "text-violet-600",  badgeBg: "bg-violet-100",badgeText: "text-violet-700",gradientFrom: "from-violet-500",  gradientTo: "to-violet-600"  },
  { bg: "bg-emerald-50", border: "border-emerald-300", ring: "ring-emerald-500", headerBg: "bg-emerald-500", headerText: "text-emerald-700", accent: "text-emerald-600", badgeBg: "bg-emerald-100",badgeText:"text-emerald-700",gradientFrom: "from-emerald-500", gradientTo: "to-emerald-600" },
  { bg: "bg-amber-50",   border: "border-amber-300",   ring: "ring-amber-500",   headerBg: "bg-amber-500",   headerText: "text-amber-700",   accent: "text-amber-600",   badgeBg: "bg-amber-100", badgeText: "text-amber-700", gradientFrom: "from-amber-500",   gradientTo: "to-amber-600"   },
  { bg: "bg-rose-50",    border: "border-rose-300",    ring: "ring-rose-500",    headerBg: "bg-rose-500",    headerText: "text-rose-700",    accent: "text-rose-600",    badgeBg: "bg-rose-100",  badgeText: "text-rose-700",  gradientFrom: "from-rose-500",    gradientTo: "to-rose-600"    },
  { bg: "bg-cyan-50",    border: "border-cyan-300",    ring: "ring-cyan-500",    headerBg: "bg-cyan-500",    headerText: "text-cyan-700",    accent: "text-cyan-600",    badgeBg: "bg-cyan-100",  badgeText: "text-cyan-700",  gradientFrom: "from-cyan-500",    gradientTo: "to-cyan-600"    },
  { bg: "bg-indigo-50",  border: "border-indigo-300",  ring: "ring-indigo-500",  headerBg: "bg-indigo-500",  headerText: "text-indigo-700",  accent: "text-indigo-600",  badgeBg: "bg-indigo-100",badgeText: "text-indigo-700",gradientFrom: "from-indigo-500",  gradientTo: "to-indigo-600"  },
  { bg: "bg-orange-50",  border: "border-orange-300",  ring: "ring-orange-500",  headerBg: "bg-orange-500",  headerText: "text-orange-700",  accent: "text-orange-600",  badgeBg: "bg-orange-100",badgeText: "text-orange-700",gradientFrom: "from-orange-500",  gradientTo: "to-orange-600"  },
  { bg: "bg-teal-50",    border: "border-teal-300",    ring: "ring-teal-500",    headerBg: "bg-teal-500",    headerText: "text-teal-700",    accent: "text-teal-600",    badgeBg: "bg-teal-100",  badgeText: "text-teal-700",  gradientFrom: "from-teal-500",    gradientTo: "to-teal-600"    },
  { bg: "bg-pink-50",    border: "border-pink-300",    ring: "ring-pink-500",    headerBg: "bg-pink-500",    headerText: "text-pink-700",    accent: "text-pink-600",    badgeBg: "bg-pink-100",  badgeText: "text-pink-700",  gradientFrom: "from-pink-500",    gradientTo: "to-pink-600"    },
  { bg: "bg-lime-50",    border: "border-lime-300",    ring: "ring-lime-500",    headerBg: "bg-lime-500",    headerText: "text-lime-700",    accent: "text-lime-600",    badgeBg: "bg-lime-100",  badgeText: "text-lime-700",  gradientFrom: "from-lime-500",    gradientTo: "to-lime-600"    },
  { bg: "bg-sky-50",     border: "border-sky-300",     ring: "ring-sky-500",     headerBg: "bg-sky-500",     headerText: "text-sky-700",     accent: "text-sky-600",     badgeBg: "bg-sky-100",   badgeText: "text-sky-700",   gradientFrom: "from-sky-500",     gradientTo: "to-sky-600"     },
];

/** Stable color for a class based on grade & section */
function getClassColor(grade: number, section: number) {
  const idx = ((grade - 1) * 20 + (section - 1)) % CLASS_COLOR_PALETTE.length;
  return CLASS_COLOR_PALETTE[idx];
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function ScoringPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<ScoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassScore | null>(null);
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchData = async (): Promise<ScoringData | null> => {
    setLoading(true);
    try {
      const res = await fetch("/api/scoring");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "加载失败");
      }
      const json = await res.json();
      setData(json);
      return json;
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "加载失败" });
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") return;
    fetchData();
  }, [status]);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleSelectClass = (cls: ClassScore) => {
    setSelectedClass(cls);
    const initial: Record<string, { score: number; comment: string }> = {};
    for (const item of cls.scores) {
      if (item.score) {
        initial[item.id] = {
          score: item.score.score,
          comment: item.score.comment ?? "",
        };
      } else {
        initial[item.id] = { score: 0, comment: "" };
      }
    }
    setScores(initial);
  };

  const handleScoreChange = (itemId: string, value: number) => {
    setScores((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { score: 0, comment: "" }), score: value },
    }));
  };

  const handleCommentChange = (itemId: string, value: string) => {
    setScores((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { score: 0, comment: "" }), comment: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !data?.inspectionItems.length) return;

    const scoreInputs = data.inspectionItems.map((item) => ({
      inspectionItemId: item.id,
      score: scores[item.id]?.score ?? 0,
      comment: scores[item.id]?.comment || undefined,
    }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
          scores: scoreInputs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "提交失败");
      }
      showAlert("success", "评分已保存");
      const newData = await fetchData();
      if (newData) {
        const updatedClass = newData.classes.find((c) => c.id === selectedClass.id);
        if (updatedClass) setSelectedClass(updatedClass);
      }
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const isClassScored = (cls: ClassScore) =>
    data?.inspectionItems
      ? cls.scoredItemIds.length === data.inspectionItems.length
      : false;

  const classesByGrade = (data?.classes ?? []).reduce(
    (acc, cls) => {
      const g = cls.grade;
      if (!acc[g]) acc[g] = [];
      acc[g].push(cls);
      return acc;
    },
    {} as Record<number, ClassScore[]>
  );

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + today's inspection items */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-blue-600" />
            {session?.user?.managedGrade ? `${session.user.managedGrade}年级 · 今日评分` : "今日评分"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {formatDisplayDate(today)}
          </p>
        </div>
        {/* Today's inspection items — enlarged with color blocks */}
        {!loading && data?.inspectionItems?.length ? (
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white shadow-sm overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <ClipboardCheck className="h-4.5 w-4.5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-blue-900">今日检查项目</h2>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 ml-auto">
                  共 {data.inspectionItems.length} 项
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.inspectionItems.map((item, idx) => {
                  const colors = [
                    "from-blue-500 to-blue-600",
                    "from-violet-500 to-violet-600",
                    "from-emerald-500 to-emerald-600",
                    "from-amber-500 to-amber-600",
                    "from-rose-500 to-rose-600",
                  ];
                  const bgColors = [
                    "bg-blue-50 border-blue-200",
                    "bg-violet-50 border-violet-200",
                    "bg-emerald-50 border-emerald-200",
                    "bg-amber-50 border-amber-200",
                    "bg-rose-50 border-rose-200",
                  ];
                  const textColors = [
                    "text-blue-700",
                    "text-violet-700",
                    "text-emerald-700",
                    "text-amber-700",
                    "text-rose-700",
                  ];
                  const ci = idx % colors.length;
                  return (
                    <div
                      key={item.id}
                      className={`relative rounded-xl border p-4 ${bgColors[ci]} transition-transform hover:scale-[1.02]`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-base ${textColors[ci]} truncate`}>
                            {item.title}
                          </p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className={`shrink-0 rounded-lg bg-gradient-to-br ${colors[ci]} text-white text-sm font-bold px-3 py-1.5 shadow-sm`}>
                          {item.maxScore}分
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={`px-4 py-3 rounded-lg ${
            alert.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {alert.message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.inspectionItems?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">
              今日暂无检查项
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              请先创建今日检查项后再进行评分
            </p>
            {(session?.user?.role === "ADMIN" || session?.user?.role === "GRADE_LEADER") && (
              <Button asChild className="mt-4">
                <Link href="/inspection">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  去创建检查项
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
        {/* ---- Top: Class selection cards (full width, vertical layout) ---- */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900">选择班级</h2>
          {Object.entries(classesByGrade)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([grade, classes]) => (
              <div key={grade}>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  {grade}年级
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                  {classes.map((cls) => {
                    const scored = isClassScored(cls);
                    const isSelected = selectedClass?.id === cls.id;
                    const color = getClassColor(cls.grade, cls.section);
                    return (
                      <div
                        key={cls.id}
                        className={`relative cursor-pointer rounded-xl border-2 p-3 transition-all duration-200 hover:shadow-lg hover:scale-[1.03] ${
                          isSelected
                            ? `${color.bg} ${color.border} ring-2 ${color.ring} shadow-md`
                            : `bg-white ${color.border} border-opacity-60 hover:${color.bg}`
                        }`}
                        onClick={() => handleSelectClass(cls)}
                      >
                        {/* Color strip at top */}
                        <div className={`absolute top-0 left-3 right-3 h-1 rounded-b-full bg-gradient-to-r ${color.gradientFrom} ${color.gradientTo}`} />
                        <div className="flex items-center justify-between gap-1.5 mt-1">
                          <span className={`font-semibold text-sm truncate ${isSelected ? color.headerText : "text-gray-800"}`}>
                            {cls.name}
                          </span>
                          {scored ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                          )}
                        </div>
                        {/* Inline scores */}
                        <div className="flex items-center gap-0 mt-1.5 text-xs font-mono">
                          {cls.scores.map((item, idx) => (
                            <span key={item.id} className="flex items-center">
                              {idx > 0 && <span className="text-gray-300 mx-0.5">/</span>}
                              <span
                                className={
                                  item.score
                                    ? item.score.score >= item.maxScore * 0.9
                                      ? "text-emerald-600"
                                      : item.score.score >= item.maxScore * 0.7
                                      ? color.accent
                                      : "text-amber-600"
                                    : "text-gray-300"
                                }
                              >
                                {item.score ? item.score.score : "—"}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>

        {/* ---- Bottom: Scoring form (full width, color-matched) ---- */}
        <div>
          {selectedClass ? (
            (() => {
              const color = getClassColor(selectedClass.grade, selectedClass.section);
              return (
                <Card className={`overflow-hidden border-2 ${color.border}`}>
                  {/* Color-matched header */}
                  <CardHeader className={`${color.headerBg} text-white flex flex-row items-center justify-between`}>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/80 hover:text-white hover:bg-white/20"
                        onClick={() => setSelectedClass(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      {selectedClass.name} — 评分
                    </CardTitle>
                    {isClassScored(selectedClass) && (
                      <Badge className="bg-white/20 text-white hover:bg-white/30 border-white/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        已评分
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className={`${color.bg} pt-6`}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {data.inspectionItems.map((item) => (
                        <div key={item.id} className="space-y-2 bg-white rounded-xl border p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <Label className={`font-semibold text-base ${color.headerText}`}>
                                {item.title}
                              </Label>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {item.description}
                                </p>
                              )}
                              <Badge variant="outline" className={`mt-2 ${color.badgeText} border-current/30`}>
                                满分 {item.maxScore}
                              </Badge>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={item.maxScore}
                              step={0.5}
                              value={scores[item.id]?.score ?? ""}
                              onChange={(e) =>
                                handleScoreChange(
                                  item.id,
                                  Math.max(
                                    0,
                                    Math.min(
                                      item.maxScore,
                                      parseFloat(e.target.value) || 0
                                    )
                                  )
                                )
                              }
                              className="w-24 text-center text-lg font-semibold"
                            />
                          </div>
                          <div className="mt-2">
                            <Label htmlFor={`comment-${item.id}`} className="text-sm text-muted-foreground">
                              备注（可选）
                            </Label>
                            <Textarea
                              id={`comment-${item.id}`}
                              value={scores[item.id]?.comment ?? ""}
                              onChange={(e) =>
                                handleCommentChange(item.id, e.target.value)
                              }
                              placeholder="可选"
                              rows={2}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        type="submit"
                        disabled={submitting}
                        className={`w-full sm:w-auto bg-gradient-to-r ${color.gradientFrom} ${color.gradientTo} hover:opacity-90 text-white shadow-md`}
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        保存评分
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })()
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Circle className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">
                  请点击上方班级卡片开始评分
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  选中班级后，评分区域将变为对应班级的颜色
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        </>
      )}
    </div>
  );
}
