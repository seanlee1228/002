"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";

export interface ChartThemeColors {
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  legendText: string;
  axisLine: string;
  axisLabel: string;
  axisLabelSecondary: string;
  splitLine: string;
  markLabelText: string;
}

const darkColors: ChartThemeColors = {
  tooltipBg: "rgba(15,23,42,0.9)",
  tooltipBorder: "rgba(255,255,255,0.1)",
  tooltipText: "#e2e8f0",
  legendText: "rgba(255,255,255,0.6)",
  axisLine: "rgba(255,255,255,0.1)",
  axisLabel: "rgba(255,255,255,0.5)",
  axisLabelSecondary: "rgba(255,255,255,0.4)",
  splitLine: "rgba(255,255,255,0.06)",
  markLabelText: "rgba(255,255,255,0.6)",
};

const lightColors: ChartThemeColors = {
  tooltipBg: "rgba(255,255,255,0.95)",
  tooltipBorder: "rgba(0,0,0,0.08)",
  tooltipText: "#1e293b",
  legendText: "rgba(0,0,0,0.55)",
  axisLine: "rgba(0,0,0,0.1)",
  axisLabel: "rgba(0,0,0,0.5)",
  axisLabelSecondary: "rgba(0,0,0,0.4)",
  splitLine: "rgba(0,0,0,0.06)",
  markLabelText: "rgba(0,0,0,0.55)",
};

export function useChartTheme(): ChartThemeColors {
  const { resolvedTheme } = useTheme();

  return useMemo(
    () => (resolvedTheme === "dark" ? darkColors : lightColors),
    [resolvedTheme]
  );
}
