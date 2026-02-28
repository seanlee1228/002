"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Button as HButton,
  Avatar as HAvatar,
  Divider,
} from "@heroui/react";
import {
  LayoutDashboard,
  ClipboardCheck,
  PenLine,
  BarChart3,
  School,
  Users,
  LogOut,
  GraduationCap,
  X,
  History,
  CalendarCheck,
  ClipboardList,
  Brain,
  Server,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarSkeleton, SidebarUserSkeleton } from "@/components/skeletons";

interface SidebarNavProps {
  open?: boolean;
  onClose?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  external?: boolean;
  disabled?: boolean;
}

export function SidebarNav({ open, onClose }: SidebarNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const t = useTranslations();

  const navItems: NavItem[] = [
    {
      label: t("nav.dashboard"),
      href: "/",
      icon: LayoutDashboard,
      roles: ["ADMIN", "GRADE_LEADER", "DUTY_TEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"],
    },
    {
      label: t("nav.dailyPlan"),
      href: "/daily-plan",
      icon: CalendarCheck,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: t("nav.inspection"),
      href: "/inspection",
      icon: ClipboardCheck,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: t("nav.scoring"),
      href: "/scoring",
      icon: PenLine,
      roles: ["ADMIN", "GRADE_LEADER", "DUTY_TEACHER"],
    },
    {
      label: t("nav.weeklyReview"),
      href: "/weekly-review",
      icon: ClipboardList,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: t("nav.dutyHistory"),
      href: "/duty-history",
      icon: History,
      roles: ["DUTY_TEACHER"],
    },
    {
      label: t("nav.scores"),
      href: "/scores",
      icon: BarChart3,
      roles: ["ADMIN", "GRADE_LEADER", "CLASS_TEACHER", "SUBJECT_TEACHER"],
    },
    {
      label: t("nav.classes"),
      href: "/classes",
      icon: School,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: t("nav.users"),
      href: "/users",
      icon: Users,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: t("nav.attendanceSystem"),
      href: `${process.env.NEXT_PUBLIC_ATTENDANCE_URL ?? "http://localhost:3000"}/admin/overview`,
      icon: UserCheck,
      roles: ["ADMIN", "GRADE_LEADER"],
      external: true,
    },
    {
      label: t("nav.aiPanel"),
      href: "/ai-panel",
      icon: Brain,
      roles: ["ADMIN"],
    },
    {
      label: t("nav.serverMonitor"),
      href: "/server-monitor",
      icon: Server,
      roles: ["ADMIN"],
    },
  ];

  const filteredItems = navItems.filter(
    (item) => role && item.roles.includes(role)
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-v-page/95 backdrop-blur-xl border-r border-v-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-v-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-v-text1 text-sm">
              {t("common.appName")}
            </span>
          </div>
          <HButton
            isIconOnly
            variant="light"
            size="sm"
            className="lg:hidden text-v-text2 hover:text-v-text1"
            onPress={onClose}
          >
            <X className="h-4 w-4" />
          </HButton>
        </div>

        {/* Navigation — session 未加载时渲染骨架占位，避免菜单项突然出现导致 CLS */}
        {!role ? (
          <>
            <SidebarSkeleton />
            <Divider className="bg-v-hover" />
            <SidebarUserSkeleton />
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4">
              <nav className="px-3 space-y-1">
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    !item.disabled &&
                    (item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href));

                  if (item.disabled) {
                    return (
                      <span
                        key={item.label}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-v-text4 cursor-not-allowed opacity-60"
                      >
                        <Icon className="h-4.5 w-4.5 text-v-text4" />
                        {item.label}
                      </span>
                    );
                  }

                  if (item.external) {
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onClose}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-v-text3 hover:bg-v-hover hover:text-v-text1"
                      >
                        <Icon className="h-4.5 w-4.5 text-v-text3" />
                        <span className="flex-1">{item.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-v-text4 shrink-0" />
                      </a>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-blue-500/15 text-blue-400 shadow-sm shadow-blue-500/10"
                          : "text-v-text3 hover:bg-v-hover hover:text-v-text1"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5",
                          isActive ? "text-blue-400" : "text-v-text3"
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <Divider className="bg-v-hover" />

            {/* User section */}
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <HAvatar
                  name={session?.user?.name?.charAt(0) || "U"}
                  size="sm"
                  classNames={{
                    base: "bg-gradient-to-br from-blue-400 to-indigo-500 shrink-0",
                    name: "text-white text-xs font-semibold",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-v-text1 truncate">
                    {session?.user?.name}
                  </p>
                  <p className="text-xs text-v-text3">
                    {role ? t(`nav.roles.${role}`) : ""}
                    {(role === "GRADE_LEADER" || role === "DUTY_TEACHER") &&
                      session?.user?.managedGrade &&
                      ` · ${t("common.grade", { grade: session.user.managedGrade })}`}
                    {session?.user?.className && ` · ${session.user.className}`}
                  </p>
                </div>
              </div>
              <HButton
                variant="light"
                size="sm"
                className="w-full justify-start text-v-text3 hover:text-red-400 hover:bg-red-500/10"
                startContent={<LogOut className="h-4 w-4" />}
                onPress={async () => {
                  await signOut({ redirect: false });
                  window.location.href = "/login";
                }}
              >
                {t("common.logout")}
              </HButton>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
