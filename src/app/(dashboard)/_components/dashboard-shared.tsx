"use client";

// 仪表盘共享组件：骨架屏、统计卡片、辅助函数

import {
  Card as HCard,
  CardBody as HCardBody,
  Tooltip,
} from "@heroui/react";
import { CHECK_CODES } from "../_lib/types";

// ---- 骨架屏组件 ----

export function StatCardSkeleton() {
  return (
    <div className="h-28 rounded-2xl bg-v-input border border-v-border animate-pulse">
      <div className="p-5 h-full flex flex-col">
        <div className="h-4 w-24 bg-v-hover rounded mb-3" />
        <div className="h-8 w-16 bg-v-hover rounded" />
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 256 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{ height }}>
      <div className="h-4 w-32 bg-v-hover rounded mb-4" />
      <div className="flex items-end gap-2 h-[calc(100%-2rem)]">
        {[50, 65, 45, 80, 55, 70, 60].map((h, i) => (
          <div key={i} className="flex-1 bg-v-hover rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-v-input rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

// ---- Tooltip 样式 ----

export const tipClass =
  "max-w-xs rounded-lg border border-v-border bg-v-card px-3 py-2 text-xs text-v-text2 shadow-lg backdrop-blur-sm";

// ---- 统计卡片组件 ----
// accent: 强调色名（blue / emerald / amber / violet 等）

const accentMap: Record<string, { border: string; text: string; iconBg: string; iconText: string }> = {
  blue:    { border: "border-l-blue-500",    text: "text-blue-400",    iconBg: "bg-blue-500/15",    iconText: "text-blue-400" },
  emerald: { border: "border-l-emerald-500", text: "text-emerald-400", iconBg: "bg-emerald-500/15", iconText: "text-emerald-400" },
  amber:   { border: "border-l-amber-500",   text: "text-amber-400",   iconBg: "bg-amber-500/15",   iconText: "text-amber-400" },
  violet:  { border: "border-l-violet-500",  text: "text-violet-400",  iconBg: "bg-violet-500/15",  iconText: "text-violet-400" },
  red:     { border: "border-l-red-500",     text: "text-red-400",     iconBg: "bg-red-500/15",     iconText: "text-red-400" },
  cyan:    { border: "border-l-cyan-500",    text: "text-cyan-400",    iconBg: "bg-cyan-500/15",    iconText: "text-cyan-400" },
  indigo:  { border: "border-l-indigo-500",  text: "text-indigo-400",  iconBg: "bg-indigo-500/15",  iconText: "text-indigo-400" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "blue",
  tooltip,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
  tooltip?: React.ReactNode;
}) {
  const a = accentMap[accent] ?? accentMap.blue;

  const card = (
    <HCard className={`bg-v-card border border-v-border border-l-3 ${a.border} overflow-hidden`}>
      <HCardBody className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-v-text2">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${a.text}`}>{value}</p>
          </div>
          <div className={`rounded-xl ${a.iconBg} p-2.5`}>
            <Icon className={`h-5 w-5 ${a.iconText}`} />
          </div>
        </div>
      </HCardBody>
    </HCard>
  );

  if (!tooltip) return card;

  return (
    <Tooltip
      content={<div className={tipClass}>{tooltip}</div>}
      placement="bottom"
      offset={6}
      classNames={{ content: "p-0 bg-transparent border-0 shadow-none" }}
    >
      {card}
    </Tooltip>
  );
}

// ---- 检查项标题国际化辅助 ----

export function getItemTitle(
  item: { code?: string | null; title: string },
  ti: (key: string) => string,
): string {
  return item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
}
