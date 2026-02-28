"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { Button as HButton } from "@heroui/react";
import { Menu } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(() => {
    const currentY = window.scrollY;
    // 向下滚动超过阈值时隐藏，向上滚动时显示
    if (currentY > lastScrollY.current && currentY > 48) {
      setHeaderVisible(false);
    } else {
      setHeaderVisible(true);
    }
    lastScrollY.current = currentY;
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div className="min-h-screen bg-v-page flex">
      <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — auto-hide on scroll down (mobile), always visible on lg+ */}
        <header
          className={`h-12 lg:h-16 bg-v-page/80 backdrop-blur-xl border-b border-v-border flex items-center px-4 lg:px-6 sticky top-0 z-30 transition-transform duration-300 ${
            !headerVisible ? "-translate-y-full lg:translate-y-0" : "translate-y-0"
          }`}
        >
          <HButton
            isIconOnly
            variant="light"
            size="sm"
            className="lg:hidden mr-2 text-v-text2 hover:text-v-text1"
            onPress={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </HButton>
          <div className="flex-1" />
          <LocaleToggle />
          <ThemeToggle />
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
