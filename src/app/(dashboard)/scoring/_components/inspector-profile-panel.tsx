"use client";

// 检查员画像面板 — 展示个人评分倾向分析

import { useState, useEffect } from "react";
import { Card, CardBody, Chip } from "@heroui/react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import type { InspectorProfile } from "../_lib/types";
import { PROFILE_COLLAPSED_KEY } from "../_lib/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function InspectorProfilePanel({ profile, t }: { profile: InspectorProfile; t: any }) {
  const [collapsed, setCollapsed] = useState(false);

  // 从 localStorage 读取折叠状态（避免 SSR hydration mismatch）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_COLLAPSED_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = new Date().toLocaleDateString("en-CA");
        if (parsed.date === today) setCollapsed(parsed.collapsed);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(PROFILE_COLLAPSED_KEY, JSON.stringify({ collapsed: next, date: new Date().toLocaleDateString("en-CA") }));
    } catch { /* ignore */ }
  };

  if (profile.personalTotal < 5) {
    return (
      <Card className="bg-v-card border border-v-border">
        <CardBody className="p-4">
          <div className="flex items-center gap-2 text-v-text3 text-sm">
            <Activity className="h-4 w-4" />
            <span>{t("profileNoData")}</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  const guidanceMap: Record<string, string> = {
    balanced: t("profileGuidanceBalanced"),
    lenient_mild: t("profileGuidanceLenientMild"),
    lenient_high: t("profileGuidanceLenientHigh"),
    strict_mild: t("profileGuidanceStrictMild"),
    strict_high: t("profileGuidanceStrictHigh"),
  };

  const toGaugePos = (rate: number) => Math.max(0, Math.min(100, ((100 - rate) / 50) * 100));
  const teacherGaugePos = toGaugePos(profile.personalPassRate);
  const schoolGaugePos = toGaugePos(profile.schoolAvgPassRate);

  const getGuidanceColor = () => {
    if (profile.guidanceLevel === "balanced") return "text-v-text2";
    if (profile.guidanceLevel.includes("mild")) return "text-amber-400";
    return "text-orange-400";
  };

  if (collapsed) {
    return (
      <Card className="bg-v-card border border-v-border">
        <CardBody className="p-3">
          <button onClick={toggleCollapse} className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-v-text3" />
              <span className="text-sm font-medium text-v-text2">{t("profileTitle")}</span>
              <span className="text-xs text-v-text3">
                {t("profilePassRate", { rate: profile.personalPassRate, avg: profile.schoolAvgPassRate })}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-v-text4" />
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="bg-v-card border border-v-border">
      <CardBody className="p-4 space-y-4">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-v-text2" />
            <span className="font-semibold text-v-text1">{t("profileTitle")}</span>
          </div>
          <button onClick={toggleCollapse} className="flex items-center gap-1 text-xs text-v-text3 hover:text-v-text2 transition-colors">
            {t("profileCollapse")}
            <ChevronUp className="h-3 w-3" />
          </button>
        </div>

        {/* 宽严度仪表 */}
        <div>
          <div className="flex items-center justify-between text-xs text-v-text3 mb-1.5">
            <span>{t("profileLenient")}</span>
            <span>{t("profileLeniencyGauge")}</span>
            <span>{t("profileStrict")}</span>
          </div>
          <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-500/30 via-gray-500/20 to-orange-500/30 overflow-visible">
            {/* 全校平均三角 */}
            <div className="absolute transition-all duration-500" style={{ left: `${schoolGaugePos}%`, bottom: "-6px", transform: "translateX(-50%)" }}>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 0L11.5 8H0.5L6 0Z" fill="rgb(52 211 153)" fillOpacity="0.8" />
              </svg>
            </div>
            {/* 教师位置三角 */}
            <div className="absolute transition-all duration-500" style={{ left: `${teacherGaugePos}%`, top: "-6px", transform: "translateX(-50%)" }}>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7 10L0.5 0H13.5L7 10Z"
                  fill={profile.guidanceLevel === "balanced" ? "rgb(107 114 128)" : profile.guidanceLevel.includes("lenient") ? "rgb(59 130 246)" : "rgb(249 115 22)"}
                />
              </svg>
            </div>
          </div>
          <p className="text-xs mt-1.5 text-center text-v-text3">
            {t("profilePassRate", { rate: profile.personalPassRate, avg: profile.schoolAvgPassRate })}
            {profile.deviation !== 0 && (
              <span className={profile.deviation > 0 ? "text-blue-400 ml-1" : "text-orange-400 ml-1"}>
                ({profile.deviation > 0 ? "+" : ""}{profile.deviation}%)
              </span>
            )}
          </p>
        </div>

        {/* 指导文字 */}
        <p className={`text-sm ${getGuidanceColor()}`}>
          {guidanceMap[profile.guidanceLevel] || guidanceMap.balanced}
        </p>

        {/* 严重程度分布 */}
        {profile.teacherFailTotal >= 10 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-v-text3">{t("profileSeverityDist")}</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-v-text3 w-16 shrink-0">{t("profileYou")}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-v-hover">
                  <div className="bg-amber-400 h-full transition-all" style={{ width: `${profile.severityDist.minor}%` }} />
                  <div className="bg-orange-400 h-full transition-all" style={{ width: `${profile.severityDist.moderate}%` }} />
                  <div className="bg-red-400 h-full transition-all" style={{ width: `${profile.severityDist.serious}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-v-text3 w-16 shrink-0">{t("profileSchoolAvg")}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-v-hover">
                  <div className="bg-amber-400/60 h-full transition-all" style={{ width: `${profile.schoolSeverityDist.minor}%` }} />
                  <div className="bg-orange-400/60 h-full transition-all" style={{ width: `${profile.schoolSeverityDist.moderate}%` }} />
                  <div className="bg-red-400/60 h-full transition-all" style={{ width: `${profile.schoolSeverityDist.serious}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-v-text4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{t("minor")}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />{t("moderate")}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />{t("serious")}</span>
              </div>
            </div>
          </div>
        )}

        {/* 微标签 */}
        <div className="flex flex-wrap gap-2">
          <Chip variant="flat" size="sm" classNames={{ base: "bg-v-hover", content: "text-v-text3 text-xs" }}>
            {t("profileCommentRate", { rate: profile.commentRate })}
          </Chip>
          <Chip variant="flat" size="sm" classNames={{ base: "bg-v-hover", content: "text-v-text3 text-xs" }}>
            {t("profileDailyAvg", { count: profile.avgDailyClasses })}
          </Chip>
          <Chip variant="flat" size="sm" classNames={{ base: "bg-v-hover", content: "text-v-text3 text-xs" }}>
            {t("profileTotalDays", { days: profile.totalScoredDays })}
          </Chip>
        </div>
      </CardBody>
    </Card>
  );
}
