// 仪表盘 ECharts 图表配置工厂函数
// 纯函数，不依赖 React hooks，方便在不同视图复用

import type { ChartThemeColors } from "@/lib/echarts-theme";
import type { DashboardData } from "./types";
import { GRADE_COLORS } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// 周趋势折线图（ADMIN + GRADE_LEADER 共用）
export function buildWeeklyTrendOption(
  weeklyTrend: DashboardData["weeklyTrend"],
  ct: ChartThemeColors,
  gradeLabels: Record<string, string>,
  gradeKeys: string[],
): Record<string, any> | null {
  if (!weeklyTrend?.length) return null;

  const series = gradeKeys
    .filter((k) => weeklyTrend.some((d) => (d as any)[k] != null))
    .map((key) => ({
      name: gradeLabels[key] || key,
      type: "line" as const,
      smooth: true,
      data: weeklyTrend.map((d) => (d as any)[key] ?? 0),
      lineStyle: { width: 2.5, color: GRADE_COLORS[key] || "#60a5fa" },
      itemStyle: { color: GRADE_COLORS[key] || "#60a5fa" },
      symbolSize: 6,
      areaStyle: {
        color: {
          type: "linear" as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: (GRADE_COLORS[key] || "#60a5fa") + "40" },
            { offset: 1, color: (GRADE_COLORS[key] || "#60a5fa") + "05" },
          ],
        },
      },
    }));

  if (series.length === 0) return null;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params : [];
        if (p.length === 0) return "";
        let s = (p[0].axisValue ?? "") + "<br/>";
        p.forEach((item: any) => {
          s += (item.marker ?? "") + " " + item.seriesName + ": " + item.value + "%<br/>";
        });
        return s;
      },
    },
    legend: {
      data: series.map((s) => s.name),
      textStyle: { color: ct.legendText ?? ct.tooltipText, fontSize: 12 },
      bottom: 0,
    },
    grid: { top: 20, right: 16, bottom: 40, left: 40 },
    xAxis: {
      type: "category",
      data: weeklyTrend.map((d) => d.date),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: 0, max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11, formatter: "{value}%" },
    },
    series,
  };
}

// 环比/同比对比柱状图（ADMIN + GRADE_LEADER 共用）
export function buildTrendComparisonOption(
  trendData: NonNullable<DashboardData["aiAnalysis"]["trendData"]>,
  ct: ChartThemeColors,
  labels: { compare: string; thisWeek: string; weekComparison: string; monthComparison: string },
): Record<string, any> {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.tooltipText, fontSize: 12 },
    },
    legend: {
      data: [labels.compare, labels.thisWeek],
      textStyle: { color: ct.legendText ?? ct.tooltipText, fontSize: 11 },
      bottom: 0,
    },
    grid: { top: 20, right: 16, bottom: 55, left: 50 },
    xAxis: {
      type: "category",
      data: [labels.weekComparison, labels.monthComparison],
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: 0, max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11, formatter: "{value}%" },
    },
    series: [
      {
        name: labels.compare,
        type: "bar",
        data: [trendData.prevWeekRate, trendData.fourWeeksAgoRate],
        itemStyle: { color: "#94a3b8", borderRadius: [4, 4, 0, 0] },
        barWidth: "30%",
        label: { show: true, position: "top", color: ct.axisLabel, fontSize: 11, formatter: "{c}%" },
      },
      {
        name: labels.thisWeek,
        type: "bar",
        data: [trendData.weekRate, trendData.weekRate],
        itemStyle: { color: "#8b5cf6", borderRadius: [4, 4, 0, 0] },
        barWidth: "30%",
        label: { show: true, position: "top", color: ct.axisLabel, fontSize: 11, formatter: "{c}%" },
      },
    ],
  };
}

// 年级对比柱状图（ADMIN 专用）
export function buildGradeComparisonOption(
  gcd: NonNullable<DashboardData["aiAnalysis"]["gradeComparisonData"]>,
  ct: ChartThemeColors,
  t: (key: string, params?: Record<string, any>) => string,
  gradeName?: (grade: number) => string,
): Record<string, any> | null {
  if (!gcd?.grades?.length) return null;
  const gradeColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params : [];
        if (p.length === 0) return "";
        const first = p[0];
        return `${first.axisValue ?? ""}: ${first.value ?? 0}%`;
      },
    },
    grid: { top: 20, right: 16, bottom: 45, left: 50 },
    xAxis: {
      type: "category",
      data: gcd.grades.map((g) => gradeName ? gradeName(g.grade) : t("gradeNLabel", { n: g.grade })),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: 0, max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 11, formatter: "{value}%" },
    },
    series: [{
      type: "bar",
      data: gcd.grades.map((g, i) => ({
        value: g.rate,
        itemStyle: { color: gradeColors[i % gradeColors.length], borderRadius: [4, 4, 0, 0] },
      })),
      barWidth: "40%",
      label: { show: true, position: "top", color: ct.axisLabel, fontSize: 11, formatter: "{c}%" },
      markLine: {
        silent: true,
        data: [{
          yAxis: gcd.average,
          label: { formatter: t("chartAverage", { value: gcd.average }), color: "#ef4444", fontSize: 10 },
          lineStyle: { color: "#ef4444", type: "dashed", width: 1.5 },
        }],
      },
    }],
  };
}

// 检查项薄弱度水平柱状图（ADMIN 专用）
export function buildFailRateBarOption(
  checkItemFailRates: NonNullable<DashboardData["checkItemFailRates"]>,
  ct: ChartThemeColors,
  t: (key: string, params?: Record<string, any>) => string,
  ti: (key: string) => string,
): Record<string, any> | null {
  if (!checkItemFailRates?.length) return null;
  const items = checkItemFailRates.slice(0, 9);
  const CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9"];
  const labels = items.map((d) => d.code && CODES.includes(d.code) ? ti(d.code) : d.title);
  const values = items.map((d) => d.failRate);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params : [];
        if (!p.length) return "";
        const item = p[0];
        return `${item.name ?? ""}: ${t("failRateLabel", { rate: item.value ?? 0 })}`;
      },
    },
    grid: { top: 8, right: 50, bottom: 8, left: 110 },
    xAxis: {
      type: "value",
      max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.axisLabel, fontSize: 10, formatter: "{value}%" },
    },
    yAxis: {
      type: "category",
      data: labels.reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ct.axisLabel, fontSize: 11, width: 100, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: values.reverse().map((v) => ({
        value: v,
        itemStyle: {
          color: v > 30 ? "#ef4444" : v > 15 ? "#f59e0b" : "#10b981",
          borderRadius: [0, 4, 4, 0],
        },
      })),
      barWidth: "55%",
      label: { show: true, position: "right", color: ct.axisLabel, fontSize: 11, formatter: "{c}%" },
    }],
  };
}

// 评价时间分布瀑布图（ADMIN 专用）
export function buildScoringTimeOption(
  scoringTimeDistribution: NonNullable<DashboardData["scoringTimeDistribution"]>,
  ct: ChartThemeColors,
  t: (key: string, params?: Record<string, any>) => string,
): Record<string, any> | null {
  if (!scoringTimeDistribution?.length) return null;
  const raw = scoringTimeDistribution;
  const hourMap = new Map(raw.map(d => [d.hour, d.count]));
  const minHour = Math.min(...raw.map(d => d.hour));
  const maxHour = Math.max(...raw.map(d => d.hour));
  const hours: number[] = [];
  const counts: number[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    hours.push(h);
    counts.push(hourMap.get(h) ?? 0);
  }
  const bases: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < counts.length; i++) {
    bases.push(cumulative);
    cumulative += counts[i];
  }
  const maxCount = Math.max(...counts, 1);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const bar = params.find((p: any) => p.seriesIndex === 1);
        if (!bar) return "";
        const idx = hours.indexOf(Number(bar.name));
        const base = idx >= 0 ? bases[idx] : 0;
        return `<div style="font-size:12px"><b>${bar.name}:00</b><br/>${t("scoringTimeUnit")}: <b>${bar.value}</b><br/>累计: ${base + bar.value}</div>`;
      },
    },
    grid: { left: 48, right: 16, top: 32, bottom: 30 },
    xAxis: {
      type: "category",
      data: hours.map(h => `${h}`),
      axisLabel: { color: ct.axisLabel, fontSize: 11, formatter: (v: string) => `${v}:00` },
      axisLine: { lineStyle: { color: ct.splitLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: ct.axisLabel, fontSize: 11 },
      splitLine: { lineStyle: { color: ct.splitLine, type: "dashed", opacity: 0.4 } },
    },
    series: [
      {
        type: "bar",
        stack: "waterfall",
        data: bases.map(b => ({ value: b, itemStyle: { color: "transparent" } })),
        barWidth: "50%",
        emphasis: { itemStyle: { color: "transparent" } },
      },
      {
        type: "bar",
        stack: "waterfall",
        data: counts.map(c => ({
          value: c,
          itemStyle: {
            color: c >= maxCount * 0.6 ? "#dc2626" : c >= maxCount * 0.25 ? "#e85d5d" : "#334155",
            borderRadius: [2, 2, 0, 0],
          },
        })),
        barWidth: "50%",
        label: {
          show: true,
          position: "top",
          fontSize: 11,
          fontWeight: "bold",
          color: ct.axisLabel,
          formatter: (p: any) => p.value > 0 ? `${p.value}` : "",
        },
      },
    ],
  };
}
