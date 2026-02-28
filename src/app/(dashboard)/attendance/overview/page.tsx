"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Button as HButton,
} from "@heroui/react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface OverviewData {
  date: string;
  dayOfWeek: number;
  totalCourses: number;
  completedCourses: number;
  pendingCourses: number;
  cancelledCourses: number;
  absentCount: number;
  completionRate: number;
  byGrade: Array<{
    grade: number;
    totalSlots: number;
    completed: number;
    absent: number;
  }>;
}

export default function AttendanceOverviewPage() {
  const t = useTranslations("attendance.overview");
  const tc = useTranslations("common");

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance/overview");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-v-text3">
        {tc("loadFailed")}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-v-text1">{t("title")}</h1>
          <p className="text-sm text-v-text3 mt-0.5">{data.date}</p>
        </div>
        <HButton isIconOnly variant="light" size="sm" onPress={loadData}>
          <RefreshCw className="w-4 h-4" />
        </HButton>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-v-card border border-v-border">
          <CardBody className="p-4 text-center">
            <BarChart3 className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-v-text1">
              {data.completionRate}%
            </p>
            <p className="text-xs text-v-text3">{t("completionRate")}</p>
          </CardBody>
        </Card>
        <Card className="bg-v-card border border-v-border">
          <CardBody className="p-4 text-center">
            <Clock className="w-6 h-6 text-v-text3 mx-auto mb-2" />
            <p className="text-2xl font-bold text-v-text1">
              {data.totalCourses}
            </p>
            <p className="text-xs text-v-text3">{t("totalCourses")}</p>
          </CardBody>
        </Card>
        <Card className="bg-v-card border border-v-border">
          <CardBody className="p-4 text-center">
            <CheckCircle2 className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-400">
              {data.completedCourses}
            </p>
            <p className="text-xs text-v-text3">{t("completedCourses")}</p>
          </CardBody>
        </Card>
        <Card className="bg-v-card border border-v-border">
          <CardBody className="p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-400">
              {data.absentCount}
            </p>
            <p className="text-xs text-v-text3">{t("absentToday")}</p>
          </CardBody>
        </Card>
      </div>

      {/* 按年级统计 */}
      {data.byGrade.length > 0 && (
        <Card className="bg-v-card border border-v-border">
          <CardHeader>
            <span className="font-semibold text-v-text1">{t("byGrade")}</span>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="space-y-3">
              {data.byGrade.map((g) => {
                const rate =
                  g.totalSlots > 0
                    ? Math.round((g.completed / g.totalSlots) * 100)
                    : 0;
                return (
                  <div
                    key={g.grade}
                    className="flex items-center gap-3 p-3 rounded-lg bg-v-input/50"
                  >
                    <span className="font-semibold text-v-text1 w-20">
                      {tc(`gradeNames.${g.grade}`)}
                    </span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-v-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                    <Chip
                      color={rate === 100 ? "success" : rate > 0 ? "primary" : "default"}
                      variant="flat"
                      size="sm"
                    >
                      {g.completed}/{g.totalSlots}
                    </Chip>
                    {g.absent > 0 && (
                      <Chip color="danger" variant="flat" size="sm">
                        {g.absent} 缺勤
                      </Chip>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {data.totalCourses === 0 && (
        <Card className="bg-v-card border border-v-border">
          <CardBody className="py-12 text-center">
            <p className="text-v-text3">今日无室外课安排</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
