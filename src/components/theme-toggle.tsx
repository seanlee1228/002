"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button as HButton } from "@heroui/react";
import { Sun, Moon } from "lucide-react";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("common");

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <HButton variant="light" size="sm" className="text-v-text2 gap-1.5">
        <div className="h-4 w-4" />
      </HButton>
    );
  }

  const isDark = theme === "dark";

  return (
    <HButton
      variant="light"
      size="sm"
      className="text-v-text2 hover:text-v-text1 gap-1.5"
      onPress={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t("switchToLight") : t("switchToDark")}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-300" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-300" />
      )}
      <span className="text-xs">{isDark ? t("light") : t("dark")}</span>
    </HButton>
  );
}
