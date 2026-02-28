"use client";

// 值日教师仪表盘视图

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Chip,
  Button as HButton,
} from "@heroui/react";
import {
  ClipboardCheck,
  CheckCircle2,
  Target,
  ChevronRight,
  PenLine,
  Lightbulb,
  History,
  AlertTriangle,
  Brain,
  MessageSquareText,
} from "lucide-react";
import type { DashboardViewProps } from "../_lib/types";
import { StatCard, StatCardSkeleton, CardSkeleton, getItemTitle } from "./dashboard-shared";

export function DutyTeacherView({ data, loading }: DashboardViewProps) {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const itemTitle = (item: { code?: string | null; title: string }) => getItemTitle(item, ti);

  return (
    <>
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <StatCard
              label={t("totalScoredDays")}
              value={data?.dutyTeacherMetrics?.totalScoredDays ?? 0}
              icon={ClipboardCheck}
              accent="blue"
            />
            <StatCard
              label={t("totalRecordCount")}
              value={data?.dutyTeacherMetrics?.totalRecordCount ?? 0}
              icon={CheckCircle2}
              accent="emerald"
            />
            <StatCard
              label={t("personalPassRate")}
              value={`${data?.dutyTeacherMetrics?.personalPassRate ?? 0}%`}
              icon={Target}
              accent="violet"
            />
          </>
        )}
      </div>

      {/* 今日检查项 */}
      <HCard className="bg-v-card border border-v-border">
        <HCardHeader className="px-6 pt-5 pb-3 flex flex-row items-center justify-between">
          <h3 className="text-base font-semibold text-v-text1">{t("dutyCheckItems")}</h3>
          <div className="flex gap-2">
            <HButton
              as={Link}
              href="/duty-history"
              variant="bordered"
              size="sm"
              className="border-v-border-input text-v-text2 hover:text-v-text1"
              startContent={<History className="h-4 w-4" />}
            >
              {t("historyLink")}
            </HButton>
            <HButton
              as={Link}
              href="/scoring"
              size="sm"
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
              startContent={<PenLine className="h-4 w-4" />}
              endContent={<ChevronRight className="h-4 w-4" />}
            >
              {t("goToScoring")}
            </HButton>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 pb-5">
          {loading ? (
            <CardSkeleton />
          ) : data?.todayCheckItems?.length ? (
            <div className="space-y-3">
              {data.todayCheckItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-v-border bg-v-thead hover:bg-v-hover transition-colors"
                >
                  <div>
                    <p className="font-medium text-v-text1">{itemTitle(item)}</p>
                    {item.code && (
                      <p className="text-sm text-v-text3 mt-0.5">{item.code}</p>
                    )}
                  </div>
                  <Chip
                    variant="bordered"
                    size="sm"
                    classNames={{
                      base: "border-v-border-input",
                      content: "text-v-text2 text-xs",
                    }}
                  >
                    {t("passOrFail")}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-v-text4">{t("noCheckItemsToday")}</div>
          )}
        </HCardBody>
      </HCard>

      {/* AI 检查建议 */}
      <HCard className="overflow-hidden bg-v-card border border-v-border">
        <HCardHeader className="px-6 py-4 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-b border-v-border">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-violet-400" />
            <h3 className="text-base font-semibold text-v-text1">{t("aiCheckSuggestion")}</h3>
            <Chip
              variant="flat"
              size="sm"
              classNames={{
                base: data?.aiAnalysis?.source === "llm" ? "bg-violet-500/15" : "bg-zinc-500/15",
                content: data?.aiAnalysis?.source === "llm" ? "text-violet-300 text-xs" : "text-zinc-400 text-xs",
              }}
            >
              {data?.aiAnalysis?.source === "llm" ? t("deepseekAi") : t("basicStats")}
            </Chip>
          </div>
        </HCardHeader>
        <HCardBody className="px-6 py-5">
          {loading ? (
            <CardSkeleton />
          ) : data?.aiAnalysis?.source === "llm" ? (
            <div className="space-y-5">
              {/* 今日关注重点 */}
              {data.aiAnalysis.focusPoints?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <Target className="h-4 w-4 text-blue-400" />
                    {t("focusPointsTitle")}
                  </h4>
                  <div className="space-y-2">
                    {data.aiAnalysis.focusPoints.map((fp, i) => (
                      <div key={i} className="p-3 rounded-xl border border-blue-500/15 bg-blue-500/5">
                        <span className="font-medium text-sm text-v-text1">{itemTitle({ code: (fp as { code?: string | null; title: string }).code, title: fp.title })}</span>
                        <p className="text-xs text-v-text3 mt-0.5">{fp.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 检查小贴士 */}
              {data.aiAnalysis.tips?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <MessageSquareText className="h-4 w-4 text-emerald-400" />
                    {t("tipsTitle")}
                  </h4>
                  <div className="space-y-1.5">
                    {data.aiAnalysis.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <span className="text-emerald-400 mt-0.5">•</span>
                        <span className="text-sm text-v-text1">{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 近期高频问题 */}
              {data.aiAnalysis.recentIssues?.length ? (
                <div>
                  <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    {t("recentIssuesTitle")}
                  </h4>
                  <div className="space-y-1.5">
                    {data.aiAnalysis.recentIssues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span className="text-sm text-v-text1">{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : data?.aiAnalysis ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  {t("riskAreas")}
                </h4>
                {data.aiAnalysis.riskAreas?.length ? (
                  <div className="space-y-2">
                    {data.aiAnalysis.riskAreas.map((area) => (
                      <div key={area.title} className="p-3 rounded-xl border border-amber-500/15 bg-amber-500/5">
                        <span className="font-medium text-sm text-v-text1">{itemTitle({ code: (area as { code?: string | null; title: string }).code, title: area.title })}</span>
                        <Chip variant="bordered" size="sm" classNames={{ base: "border-amber-500/30 ml-2", content: "text-amber-400 text-xs" }}>
                          {t("failRateAreaLabel", { rate: area.failRate })}
                        </Chip>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 text-center">
                    <p className="text-sm text-emerald-400">{t("noRiskAreas")}</p>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-v-text2 flex items-center gap-1.5 mb-3">
                  <Lightbulb className="h-4 w-4 text-blue-400" />
                  {t("recommendations")}
                </h4>
                <div className="space-y-2">
                  {data.aiAnalysis.recommendations?.map((rec) => (
                    <div key={rec.title} className="p-3 rounded-xl border border-blue-500/15 bg-blue-500/5">
                      <span className="font-medium text-sm text-v-text1">{itemTitle({ code: (rec as { code?: string | null; title: string }).code, title: rec.title })}</span>
                      <p className="text-xs text-v-text3">{rec.reason}</p>
                    </div>
                  )) ?? null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center py-6 text-v-text4">{t("noAnalysis")}</p>
          )}
        </HCardBody>
      </HCard>
    </>
  );
}
