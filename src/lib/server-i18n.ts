import { cookies } from "next/headers";

type Locale = "zh" | "en";

// 按命名空间拆分导入，合并为完整 messages
import zhNav from "../../messages/zh/nav.json";
import zhCommon from "../../messages/zh/common.json";
import zhError from "../../messages/zh/error.json";
import zhAuth from "../../messages/zh/auth.json";
import zhLogs from "../../messages/zh/logs.json";
import zhClasses from "../../messages/zh/classes.json";
import zhUsers from "../../messages/zh/users.json";
import zhInspection from "../../messages/zh/inspection.json";
import zhScoring from "../../messages/zh/scoring.json";
import zhDutyHistory from "../../messages/zh/dutyHistory.json";
import zhWeeklyReview from "../../messages/zh/weeklyReview.json";
import zhScores from "../../messages/zh/scores.json";
import zhDailyPlan from "../../messages/zh/dailyPlan.json";
import zhAiPanel from "../../messages/zh/aiPanel.json";
import zhDashboard from "../../messages/zh/dashboard.json";
import zhApi from "../../messages/zh/api.json";
import zhCheckItems from "../../messages/zh/checkItems.json";
import zhServerMonitor from "../../messages/zh/serverMonitor.json";

import enNav from "../../messages/en/nav.json";
import enCommon from "../../messages/en/common.json";
import enError from "../../messages/en/error.json";
import enAuth from "../../messages/en/auth.json";
import enLogs from "../../messages/en/logs.json";
import enClasses from "../../messages/en/classes.json";
import enUsers from "../../messages/en/users.json";
import enInspection from "../../messages/en/inspection.json";
import enScoring from "../../messages/en/scoring.json";
import enDutyHistory from "../../messages/en/dutyHistory.json";
import enWeeklyReview from "../../messages/en/weeklyReview.json";
import enScores from "../../messages/en/scores.json";
import enDailyPlan from "../../messages/en/dailyPlan.json";
import enAiPanel from "../../messages/en/aiPanel.json";
import enDashboard from "../../messages/en/dashboard.json";
import enApi from "../../messages/en/api.json";
import enCheckItems from "../../messages/en/checkItems.json";
import enServerMonitor from "../../messages/en/serverMonitor.json";

const zhMessages = {
  nav: zhNav,
  common: zhCommon,
  error: zhError,
  auth: zhAuth,
  logs: zhLogs,
  classes: zhClasses,
  users: zhUsers,
  inspection: zhInspection,
  scoring: zhScoring,
  dutyHistory: zhDutyHistory,
  weeklyReview: zhWeeklyReview,
  scores: zhScores,
  dailyPlan: zhDailyPlan,
  aiPanel: zhAiPanel,
  dashboard: zhDashboard,
  api: zhApi,
  checkItems: zhCheckItems,
  serverMonitor: zhServerMonitor,
};

const enMessages = {
  nav: enNav,
  common: enCommon,
  error: enError,
  auth: enAuth,
  logs: enLogs,
  classes: enClasses,
  users: enUsers,
  inspection: enInspection,
  scoring: enScoring,
  dutyHistory: enDutyHistory,
  weeklyReview: enWeeklyReview,
  scores: enScores,
  dailyPlan: enDailyPlan,
  aiPanel: enAiPanel,
  dashboard: enDashboard,
  api: enApi,
  checkItems: enCheckItems,
  serverMonitor: enServerMonitor,
};

const allMessages: Record<Locale, Record<string, unknown>> = {
  zh: zhMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
};

/**
 * Read locale from the request cookie. Falls back to "zh".
 * Must be called inside a Route Handler or Server Component.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const val = cookieStore.get("locale")?.value;
  return val === "en" ? "en" : "zh";
}

/**
 * Create a translator function for the given locale + optional namespace.
 *
 * Usage:
 *   const t = createTranslator(locale, "api.errors");
 *   t("loadFailed")            // simple key
 *   t("trendUp", { rate: 85 }) // with ICU-style {param} interpolation
 */
export function createTranslator(locale: Locale, namespace?: string) {
  let base: unknown = allMessages[locale];
  if (namespace) {
    for (const part of namespace.split(".")) {
      base = (base as Record<string, unknown>)?.[part];
    }
  }

  return function t(key: string, params?: Record<string, string | number>): string {
    let value: unknown = base;
    for (const k of key.split(".")) {
      value = (value as Record<string, unknown>)?.[k];
    }
    if (typeof value !== "string") return key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = (value as string).replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value as string;
  };
}
