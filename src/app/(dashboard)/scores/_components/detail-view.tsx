"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@heroui/react";
import dynamic from "next/dynamic";
import { useChartTheme } from "@/lib/echarts-theme";
import type { DetailData, Period } from "../_lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// 检查项代码常量，用于 i18n 翻译映射
const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];

interface DetailViewProps {
  data: DetailData;
  period: Period;
  compact?: boolean;
}

export function DetailView({ data, period, compact = false }: DetailViewProps) {
  const t = useTranslations("scores");
  const ti = useTranslations("checkItems");
  const ct = useChartTheme();
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;

  // 按达标率从高到低排序
  const sortedItems = useMemo(() => {
    return [...data.itemSummaries].sort((a, b) => b.passRate - a.passRate);
  }, [data.itemSummaries]);

  const chartOption = useMemo(() => {
    if (sortedItems.length === 0) return null;

    const categories = sortedItems.map((d) => itemTitle(d));
    const hasSchoolData = sortedItems.some((d) => (d.schoolPassRate ?? 0) > 0);
    const hasGradeData = sortedItems.some((d) => (d.gradePassRate ?? 0) > 0);

    // 冷色调协调配色
    const COLOR_OK = "#3b82f6";      // 蓝色 - 达标（>=平均）
    const COLOR_OK_LIGHT = "#60a5fa";
    const COLOR_WARN = "#f59e0b";    // 琥珀色 - 低于平均
    const COLOR_WARN_LIGHT = "#fbbf24";
    const COLOR_SCHOOL = "#06b6d4";  // 青色 - 全校
    const COLOR_GRADE = "#6366f1";   // 靛色 - 年级

    // 判断本班达标率是否低于年级或学校平均
    const barData = sortedItems.map((d) => {
      const schoolAvg = d.schoolPassRate ?? 0;
      const gradeAvg = d.gradePassRate ?? 0;
      const refLine = Math.max(schoolAvg, gradeAvg); // 取较高的作为参考线
      const belowAvg = refLine > 0 && d.passRate < refLine;
      return {
        value: d.passRate,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: belowAvg
              ? [{ offset: 0, color: COLOR_WARN }, { offset: 1, color: COLOR_WARN_LIGHT }]
              : [{ offset: 0, color: COLOR_OK }, { offset: 1, color: COLOR_OK_LIGHT }],
          },
          borderRadius: [0, 4, 4, 0],
        },
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: t("seriesClass"),
        type: "bar" as const,
        data: barData,
        barWidth: 16,
        label: {
          show: true,
          position: "right" as const,
          color: ct.axisLabel,
          fontSize: 11,
          fontWeight: 600,
          formatter: "{c}%",
        },
        z: 2,
      },
    ];

    if (hasSchoolData) {
      series.push({
        name: t("seriesSchool"),
        type: "scatter" as const,
        symbol: "rect",
        symbolSize: [3, 18],
        data: sortedItems.map((d, i) => [d.schoolPassRate ?? 0, i]),
        itemStyle: { color: COLOR_SCHOOL },
        z: 10,
      });
    }

    if (hasGradeData) {
      series.push({
        name: t("seriesGrade"),
        type: "scatter" as const,
        symbol: "rect",
        symbolSize: [3, 18],
        data: sortedItems.map((d, i) => [d.gradePassRate ?? 0, i]),
        itemStyle: { color: COLOR_GRADE },
        z: 10,
      });
    }

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: ct.tooltipBg,
        borderColor: ct.tooltipBorder,
        textStyle: { color: ct.tooltipText, fontSize: 12 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return "";
          const name = params[0].name || (params[0].data ? categories[params[0].data[1]] : "");
          let html = `<b>${name}</b>`;
          for (const p of params) {
            const val = Array.isArray(p.data) ? p.data[0] : p.data;
            html += `<br/>${p.marker} ${p.seriesName}: <b>${val}%</b>`;
          }
          return html;
        },
      },
      legend: {
        show: true,
        bottom: 0,
        textStyle: { color: ct.axisLabelSecondary, fontSize: 11 },
        itemWidth: 14,
        itemHeight: 10,
        itemGap: 16,
      },
      grid: { top: 10, right: 50, bottom: 50, left: 100, containLabel: false },
      xAxis: {
        type: "value" as const,
        max: 100,
        axisLine: { lineStyle: { color: ct.axisLine } },
        splitLine: { lineStyle: { color: ct.splitLine } },
        axisLabel: { color: ct.axisLabelSecondary, fontSize: 11, formatter: "{value}%" },
      },
      yAxis: {
        type: "category" as const,
        data: categories,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ct.axisLabel, fontSize: 12 },
      },
      series,
    };
  }, [sortedItems, ct, t, ti, itemTitle]);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <Chip variant="flat" size="sm" classNames={{ base: "bg-v-input", content: "text-v-text2 text-sm" }}>
          {t("chipPassRate", { rate: data.passRate })}
        </Chip>
        <Chip variant="bordered" size="sm" classNames={{ base: "border-v-border-input", content: "text-v-text2 text-sm" }}>
          {t("chipPassedTotal", { passed: data.passed, total: data.total })}
        </Chip>
        <Chip variant="bordered" size="sm" classNames={{ base: "border-v-border-input", content: "text-v-text2 text-sm" }}>
          {t("chipItemCount", { count: data.itemSummaries.length })}
        </Chip>
      </div>

      {/* ECharts horizontal bar chart - per-item pass rates */}
      {chartOption && (
        <div style={{ height: Math.max(compact ? 200 : 260, sortedItems.length * 40) }}>
          <ReactECharts
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            theme="dark"
            opts={{ renderer: "svg" }}
          />
        </div>
      )}

      {/* Daily records table */}
      {data.dailyRecords.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-v-text1 mb-2">{t("dailyRecords")}</h4>
          <div className="rounded-xl border border-v-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-v-border bg-v-thead">
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colDate")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colCheckItem")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colPass")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colScoredBy")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colComment")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {data.dailyRecords.map((r, i) => (
                  <tr key={`${r.date}-${r.checkItem.code}-${i}`} className="hover:bg-v-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-v-text2">{r.date}</td>
                    <td className="px-4 py-3 text-v-text1">{itemTitle(r.checkItem)}</td>
                    <td className="px-4 py-3">
                      {r.passed === true ? (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-emerald-500/20", content: "text-emerald-400" }}>{t("pass")}</Chip>
                      ) : r.passed === false ? (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-red-500/20", content: "text-red-400" }}>{t("failLabel")}</Chip>
                      ) : (
                        <span className="text-v-text4">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-v-text3 text-xs">
                      <span>{r.scoredByName || "—"}</span>
                      {r.reviewAction && (
                        <span className="ml-1 text-blue-400" title={r.reviewedByName ?? ""}>✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-v-text3 max-w-[120px] sm:max-w-[200px] truncate">{r.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weekly records table */}
      {data.weeklyRecords.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-v-text1 mb-2">{t("weeklyRecords")}</h4>
          <div className="rounded-xl border border-v-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-v-border bg-v-thead">
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colDate")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colCheckItem")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colWeekResult")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colScoredBy")}</th>
                  <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colComment")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {data.weeklyRecords.map((r, i) => (
                  <tr key={`${r.date}-${r.checkItem.code}-${i}`} className="hover:bg-v-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-v-text2">{r.date}</td>
                    <td className="px-4 py-3 text-v-text1">{itemTitle(r.checkItem)}</td>
                    <td className="px-4 py-3">
                      {r.optionValue ? (
                        <Chip size="sm" variant="flat" classNames={{ base: "bg-v-input", content: "text-v-text2" }}>{r.optionValue}</Chip>
                      ) : (
                        <span className="text-v-text4">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-v-text3 text-xs">
                      <span>{r.scoredByName || "—"}</span>
                      {r.reviewAction && (
                        <span className="ml-1 text-blue-400" title={r.reviewedByName ?? ""}>✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-v-text3 max-w-[120px] sm:max-w-[200px] truncate">{r.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item summaries table (fallback when no records) */}
      {data.itemSummaries.length > 0 && data.dailyRecords.length === 0 && data.weeklyRecords.length === 0 && (
        <div className="rounded-xl border border-v-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-v-border bg-v-thead">
                <th className="px-4 py-3 text-left text-v-text3 font-medium">{t("colItemTitle")}</th>
                <th className="px-4 py-3 text-right text-v-text3 font-medium">{t("colItemPassedTotal")}</th>
                <th className="px-4 py-3 text-right text-v-text3 font-medium">{t("colItemPassRate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-v-border">
              {[...data.itemSummaries].sort((a, b) => b.passRate - a.passRate).map((item) => (
                <tr key={item.title} className="hover:bg-v-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-v-text1">{itemTitle(item)}</td>
                  <td className="px-4 py-3 text-right font-mono text-v-text2">{item.passed}/{item.total}</td>
                  <td className="px-4 py-3 text-right">
                    <Chip
                      variant="bordered"
                      size="sm"
                      classNames={{
                        base: item.passRate >= 90 ? "border-emerald-500/30" : item.passRate >= 75 ? "border-blue-500/30" : "border-red-500/30",
                        content: item.passRate >= 90 ? "text-emerald-400 text-xs" : item.passRate >= 75 ? "text-blue-400 text-xs" : "text-red-400 text-xs",
                      }}
                    >
                      {item.passRate}%
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.itemSummaries.length === 0 && data.dailyRecords.length === 0 && data.weeklyRecords.length === 0 && (
        <p className="text-center py-8 text-v-text4">{t("noRecords")}</p>
      )}
    </div>
  );
}
