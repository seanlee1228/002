"use client";

// 周汇总检查报告 — 容器组件
// 第一层：周次 Tabs（横向滚动）+ 选中周的所有班级卡片网格

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Card as HCard,
  CardHeader as HCardHeader,
  CardBody as HCardBody,
  Chip,
  Spinner,
} from "@heroui/react";
import { CalendarRange, BookOpen } from "lucide-react";
import type { WeekOption, WeeklyClassSummary } from "../_lib/types";
import { ClassScoreCard } from "./class-score-card";

export function WeeklySummary() {
  const t = useTranslations("scores");
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [weekMode, setWeekMode] = useState<"school" | "natural">("school");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [classes, setClasses] = useState<WeeklyClassSummary[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  // 加载周次列表
  useEffect(() => {
    async function loadWeeks() {
      try {
        const res = await fetch("/api/scores/weekly-summary");
        if (!res.ok) return;
        const data = await res.json();
        setWeeks(data.weeks ?? []);
        setWeekMode(data.weekMode ?? "school");
        // 默认选中当前周
        const currentWeek = (data.weeks ?? []).find((w: WeekOption) => w.isCurrent);
        if (currentWeek) setSelectedWeek(currentWeek.key);
        else if ((data.weeks ?? []).length > 0) setSelectedWeek(data.weeks[data.weeks.length - 1].key);
      } catch { /* 忽略 */ }
      setLoadingWeeks(false);
    }
    loadWeeks();
  }, []);

  // 选中周变化时加载该周班级数据
  useEffect(() => {
    if (!selectedWeek) return;
    setLoadingClasses(true);
    setClasses([]);
    async function loadClasses() {
      try {
        const res = await fetch(`/api/scores/weekly-summary?week=${selectedWeek}`);
        if (!res.ok) return;
        const data = await res.json();
        setClasses(data.classes ?? []);
      } catch { /* 忽略 */ }
      setLoadingClasses(false);
    }
    loadClasses();
  }, [selectedWeek]);

  // 自动滚动到当前选中的周 tab
  useEffect(() => {
    if (!tabsRef.current || !selectedWeek) return;
    const activeTab = tabsRef.current.querySelector(`[data-week="${selectedWeek}"]`) as HTMLElement | null;
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [weeks, selectedWeek]);

  const handleWeekSelect = useCallback((key: string) => {
    setSelectedWeek(key);
  }, []);

  if (loadingWeeks) {
    return (
      <HCard className="bg-v-card border border-v-border">
        <HCardBody className="flex justify-center py-12">
          <Spinner size="md" />
        </HCardBody>
      </HCard>
    );
  }

  if (weeks.length === 0) return null;

  return (
    <HCard className="bg-v-card border border-v-border">
      <HCardHeader className="px-6 pt-5 pb-3 flex-col items-start gap-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-violet-400" />
            <h3 className="text-base font-semibold text-v-text1">{t("weeklySummaryTitle")}</h3>
          </div>
          <Chip
            size="sm"
            variant="flat"
            startContent={<BookOpen className="h-3 w-3" />}
            classNames={{
              base: weekMode === "school" ? "bg-violet-500/10" : "bg-blue-500/10",
              content: weekMode === "school" ? "text-violet-400 text-xs" : "text-blue-400 text-xs",
            }}
          >
            {weekMode === "school" ? t("schoolWeekMode") : t("naturalWeekMode")}
          </Chip>
        </div>

        {/* 周次横向 Tab 栏 */}
        <div
          ref={tabsRef}
          className="flex gap-1.5 overflow-x-auto pb-1 w-full scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {weeks.map((w) => {
            const isActive = w.key === selectedWeek;
            return (
              <button
                key={w.key}
                data-week={w.key}
                onClick={() => handleWeekSelect(w.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  isActive
                    ? "bg-violet-500 text-white border-violet-500 shadow-sm"
                    : "bg-v-hover/50 text-v-text3 border-v-border hover:bg-v-hover hover:text-v-text1"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </HCardHeader>

      <HCardBody className="px-6 pb-5 pt-0">
        {/* 选中周的日期范围 */}
        {selectedWeek && (
          <p className="text-xs text-v-text4 mb-3">
            {weeks.find((w) => w.key === selectedWeek)?.startDate} ~ {weeks.find((w) => w.key === selectedWeek)?.endDate}
            {weeks.find((w) => w.key === selectedWeek)?.note && (
              <span className="ml-2 text-amber-400">({weeks.find((w) => w.key === selectedWeek)?.note})</span>
            )}
          </p>
        )}

        {/* 班级卡片网格 */}
        {loadingClasses ? (
          <div className="flex justify-center py-8"><Spinner size="sm" /></div>
        ) : classes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {classes.map((cls) => (
              <ClassScoreCard key={cls.classId} cls={cls} weekKey={selectedWeek!} />
            ))}
          </div>
        ) : (
          <p className="text-center text-v-text4 text-sm py-8">{t("noDataForWeek")}</p>
        )}
      </HCardBody>
    </HCard>
  );
}
