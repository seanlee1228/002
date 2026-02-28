"use client";

// 班级得分卡片 — 三级穿透
// 第一层：收起态（班级名+达标率+等级）
// 第二层：展开态（日x项矩阵）
// 第三层：Popover（单条评分详情）

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Card as HCard,
  CardBody as HCardBody,
  Chip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Spinner,
} from "@heroui/react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import type { WeeklyClassSummary, WeeklyClassDetail, DayItemRecord } from "../_lib/types";

// 等级颜色映射
const GRADE_CHIP_STYLES: Record<string, { base: string; content: string }> = {
  A: { base: "bg-emerald-500/15", content: "text-emerald-400 text-xs font-bold" },
  B: { base: "bg-blue-500/15", content: "text-blue-400 text-xs font-bold" },
  C: { base: "bg-amber-500/15", content: "text-amber-400 text-xs font-bold" },
};

interface ClassScoreCardProps {
  cls: WeeklyClassSummary;
  weekKey: string;
}

export function ClassScoreCard({ cls, weekKey }: ClassScoreCardProps) {
  const t = useTranslations("scores");
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WeeklyClassDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const isWarning = cls.passRate < 70;

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/scores/weekly-summary?week=${weekKey}&classId=${cls.classId}`);
        if (res.ok) {
          setDetail(await res.json());
        }
      } catch { /* 忽略 */ }
      setLoading(false);
    }
  }, [expanded, detail, weekKey, cls.classId]);

  // 收集所有唯一的检查项（按 code 排序），用作矩阵列头
  const allItemCodes = useMemo(() => {
    if (!detail) return [];
    const codeMap = new Map<string, { code: string | null; title: string }>();
    for (const day of detail.days) {
      for (const item of day.items) {
        const key = item.code ?? item.checkItemId;
        if (!codeMap.has(key)) {
          codeMap.set(key, { code: item.code, title: item.title });
        }
      }
    }
    return Array.from(codeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));
  }, [detail]);

  return (
    <HCard
      className={`bg-v-card border transition-all ${
        isWarning ? "border-l-3 border-l-red-500 border-t-v-border border-r-v-border border-b-v-border" : "border-v-border"
      } ${expanded ? "ring-1 ring-violet-500/20" : ""}`}
    >
      <HCardBody className="p-0">
        {/* 第一层：班级概览（收起态头部） */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-v-hover/50 transition-colors text-left"
          onClick={handleToggle}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-v-text1 truncate">{cls.className}</span>
            {cls.latestGrade && (
              <Chip size="sm" variant="flat" classNames={GRADE_CHIP_STYLES[cls.latestGrade] ?? GRADE_CHIP_STYLES.B}>
                {cls.latestGrade}
              </Chip>
            )}
            {isWarning && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-sm font-mono font-bold ${isWarning ? "text-red-400" : "text-v-text1"}`}>
              {cls.passRate}%
            </span>
            <span className="text-xs text-v-text4">{cls.passedItems}/{cls.totalItems}</span>
            {expanded ? <ChevronUp className="h-4 w-4 text-v-text4" /> : <ChevronDown className="h-4 w-4 text-v-text4" />}
          </div>
        </button>

        {/* 第二层：日x项矩阵（展开态） */}
        {expanded && (
          <div className="border-t border-v-border px-4 pb-4 pt-3">
            {loading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : detail && detail.days.length > 0 ? (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse min-w-[280px]">
                  <thead>
                    <tr>
                      <th className="text-left text-v-text4 font-medium px-1.5 py-1.5 whitespace-nowrap">{t("colDate")}</th>
                      {allItemCodes.map((item) => (
                        <th key={item.key} className="text-center text-v-text4 font-medium px-1.5 py-1.5 whitespace-nowrap">
                          {item.code ?? t("wsDynamic")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.days.map((day) => {
                      // 构建该日的 code → record 映射
                      const dayItemMap = new Map<string, DayItemRecord>();
                      for (const item of day.items) {
                        dayItemMap.set(item.code ?? item.checkItemId, item);
                      }
                      return (
                        <tr key={day.date} className="border-t border-v-border/50">
                          <td className="px-1.5 py-2 whitespace-nowrap text-v-text3">
                            <span className="font-mono">{day.date.slice(5)}</span>
                            <span className="ml-1 text-v-text4">{day.dayLabel}</span>
                          </td>
                          {allItemCodes.map((col) => {
                            const record = dayItemMap.get(col.key);
                            return (
                              <td key={col.key} className="text-center px-1.5 py-2">
                                {record ? (
                                  <ItemCell record={record} date={day.date} dayLabel={day.dayLabel} />
                                ) : (
                                  <span className="text-v-text4/40">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* 图例 */}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-v-text4">
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />{t("pass")}</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />{t("failLabel")}</span>
                  <span className="flex items-center gap-1"><span className="text-v-text4/40">—</span>{t("wsNotChecked")}</span>
                </div>
              </div>
            ) : (
              <p className="text-center text-v-text4 text-sm py-4">{t("noDataForWeek")}</p>
            )}
          </div>
        )}
      </HCardBody>
    </HCard>
  );
}

// ===== 第三层：矩阵单元格（含 Popover 详情） =====

function ItemCell({ record, date, dayLabel }: { record: DayItemRecord; date: string; dayLabel: string }) {
  const t = useTranslations("scores");
  const isPassed = record.passed === true;
  const isFailed = record.passed === false;

  const dotColor = isPassed
    ? "bg-emerald-500 hover:ring-2 hover:ring-emerald-500/30"
    : isFailed
      ? "bg-red-500 hover:ring-2 hover:ring-red-500/30"
      : "bg-v-text4/30";

  const severityLabel = record.severity === "minor" ? t("wsSeverityMinor")
    : record.severity === "moderate" ? t("wsSeverityModerate")
      : record.severity === "serious" ? t("wsSeveritySerious")
        : null;

  return (
    <Popover placement="top" showArrow>
      <PopoverTrigger>
        <button className={`inline-block w-3.5 h-3.5 rounded-full transition-all cursor-pointer ${dotColor}`} />
      </PopoverTrigger>
      <PopoverContent className="bg-v-card border border-v-border shadow-lg max-w-[260px]">
        <div className="px-3 py-2.5 space-y-2">
          {/* 标题 */}
          <p className="text-xs font-semibold text-v-text1">
            {record.code ?? record.title} · {date.slice(5)} {dayLabel}
          </p>
          <p className="text-xs text-v-text2">{record.title}</p>

          {/* 状态 */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isPassed ? "text-emerald-400" : "text-red-400"}`}>
              {isPassed ? t("pass") : t("failLabel")}
            </span>
            {severityLabel && (
              <Chip size="sm" variant="flat" classNames={{ base: "h-4 bg-red-500/10", content: "text-[10px] text-red-400 px-1" }}>
                {severityLabel}
              </Chip>
            )}
          </div>

          {/* 评分人 */}
          {record.scoredByName && (
            <p className="text-[11px] text-v-text3">
              {t("wsScorer")}：{record.scoredByName}
              {record.scoredByRole && <span className="text-v-text4 ml-1">({record.scoredByRole})</span>}
            </p>
          )}

          {/* 评分时间 */}
          {record.scoredAt && (
            <p className="text-[11px] text-v-text4">
              {t("wsScoredAt")}：{new Date(record.scoredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {/* 备注 */}
          {record.comment && (
            <p className="text-[11px] text-v-text3 bg-v-hover rounded px-2 py-1">
              {t("wsComment")}：{record.comment}
            </p>
          )}

          {/* 修正记录 */}
          {record.reviewAction && (
            <div className="border-t border-v-border pt-2 mt-1">
              <p className="text-[10px] font-semibold text-v-text4 uppercase mb-1">{t("wsRevisionTitle")}</p>
              <p className="text-[11px] text-v-text3">
                {t("wsRevisedTo", {
                  name: record.reviewedByName ?? "—",
                  result: record.passed === true ? t("pass") : t("failLabel"),
                })}
              </p>
              {record.reviewedAt && (
                <p className="text-[10px] text-v-text4 mt-0.5">
                  {new Date(record.reviewedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {record.originalPassed !== null && record.originalPassed !== record.passed && (
                <p className="text-[10px] text-v-text4">
                  {record.originalPassed ? t("pass") : t("failLabel")} → {record.passed ? t("pass") : t("failLabel")}
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
