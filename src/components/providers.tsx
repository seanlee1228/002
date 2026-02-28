"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { HeroUIProvider } from "@heroui/react";
import { LocaleProvider } from "@/components/locale-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <HeroUIProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </HeroUIProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
