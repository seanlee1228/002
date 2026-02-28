"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * 应用级错误边界 — 捕获页面组件内的未处理错误
 * 在 dashboard 布局内显示友好提示，保留导航栏
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  const tc = useTranslations("common");

  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-v-text1 mb-2">
          {t("pageLoadError")}
        </h2>
        <p className="text-sm text-v-text3 mb-6 leading-relaxed">
          {t("pageLoadHint")}
          <br />
          {t("refreshHint")}
        </p>
        {error?.digest && (
          <p className="text-xs text-v-text4 mb-4 font-mono">
            {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-violet-500 text-white text-sm font-medium rounded-lg hover:bg-violet-600 transition-colors"
          >
            {tc("retry")}
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-5 py-2.5 bg-v-hover text-v-text2 text-sm font-medium rounded-lg border border-v-border hover:bg-v-card transition-colors"
          >
            {t("backToHome")}
          </button>
        </div>
      </div>
    </div>
  );
}
