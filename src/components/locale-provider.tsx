"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";

type Locale = "zh" | "en";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "zh",
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

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
import zhAttendance from "../../messages/zh/attendance.json";

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
import enAttendance from "../../messages/en/attendance.json";

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
  attendance: zhAttendance,
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
  attendance: enAttendance,
};

const messagesMap: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

const STORAGE_KEY = "app-locale";
const APP_TIME_ZONE = "Asia/Shanghai";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const initial = getInitialLocale();
      setLocaleState(initial);
      document.cookie = `locale=${initial};path=/;max-age=31536000`;
      setMounted(true);
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.cookie = `locale=${l};path=/;max-age=31536000`;
  }, []);

  // Avoid hydration mismatch: always render zh on server, switch after mount
  const activeLocale = mounted ? locale : "zh";

  return (
    <LocaleContext.Provider value={{ locale: activeLocale, setLocale }}>
      <NextIntlClientProvider
        locale={activeLocale}
        messages={messagesMap[activeLocale]}
        timeZone={APP_TIME_ZONE}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
