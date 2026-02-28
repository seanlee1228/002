"use client";

import { Button as HButton } from "@heroui/react";
import { Globe } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { useTranslations } from "next-intl";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const tc = useTranslations("common");

  return (
    <HButton
      variant="light"
      size="sm"
      className="text-v-text2 hover:text-v-text1 gap-1.5"
      onPress={() => setLocale(locale === "zh" ? "en" : "zh")}
      aria-label={tc("switchLocale")}
    >
      <Globe className="h-4 w-4 transition-transform duration-300" />
      <span className="text-xs">{locale === "zh" ? "EN" : "中"}</span>
    </HButton>
  );
}
