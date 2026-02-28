"use client";

import zhCommon from "../../messages/zh/common.json";
import zhError from "../../messages/zh/error.json";
import enCommon from "../../messages/en/common.json";
import enError from "../../messages/en/error.json";

type Locale = "zh" | "en";

function getLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem("app-locale");
  return stored === "en" ? "en" : "zh";
}

const zhMessages = { common: zhCommon, error: zhError } as const;
const enMessages = { common: enCommon, error: enError } as const;
const messagesMap = { zh: zhMessages, en: enMessages } as const;

/**
 * 全局错误边界 — 捕获根布局级别的未处理错误
 * 当整个应用崩溃时显示此页面，而非白屏
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = getLocale();
  const msgs = messagesMap[locale];

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body className="bg-[#0A0A0A] text-[#EDEDED] flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="text-5xl mb-6">⚠</div>
          <h1 className="text-xl font-semibold mb-3">{msgs.error.globalError}</h1>
          <p className="text-sm text-[#A1A1A1] mb-6 leading-relaxed">
            {msgs.error.globalHint}
            <br />
            {msgs.error.globalContactHint}
          </p>
          {error?.digest && (
            <p className="text-xs text-[#444444] mb-4 font-mono">
              {msgs.error.errorCode} {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-[#8b5cf6] text-white text-sm font-medium rounded-lg hover:bg-[#7c3aed] transition-colors"
          >
            {msgs.common.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
