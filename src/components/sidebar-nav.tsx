"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ClipboardCheck,
  PenLine,
  BarChart3,
  School,
  Users,
  FileText,
  LogOut,
  GraduationCap,
  X,
  History,
} from "lucide-react";

interface SidebarNavProps {
  open?: boolean;
  onClose?: () => void;
}

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  GRADE_LEADER: "年级负责人",
  DUTY_TEACHER: "值日老师",
  CLASS_TEACHER: "班主任",
};

export function SidebarNav({ open, onClose }: SidebarNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const navItems = [
    {
      label: "仪表盘",
      href: "/",
      icon: LayoutDashboard,
      roles: ["ADMIN", "GRADE_LEADER", "DUTY_TEACHER", "CLASS_TEACHER"],
    },
    {
      label: "检查项管理",
      href: "/inspection",
      icon: ClipboardCheck,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: "今日评分",
      href: "/scoring",
      icon: PenLine,
      roles: ["ADMIN", "GRADE_LEADER", "DUTY_TEACHER"],
    },
    {
      label: "历史评分预览",
      href: "/duty-history",
      icon: History,
      roles: ["DUTY_TEACHER"],
    },
    {
      label: "成绩查看",
      href: "/scores",
      icon: BarChart3,
      roles: ["ADMIN", "GRADE_LEADER", "CLASS_TEACHER"],
    },
    {
      label: "班级管理",
      href: "/classes",
      icon: School,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: "用户管理",
      href: "/users",
      icon: Users,
      roles: ["ADMIN", "GRADE_LEADER"],
    },
    {
      label: "系统日志",
      href: "/logs",
      icon: FileText,
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">
              班级评分系统
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="px-3 space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5",
                      isActive ? "text-blue-600" : "text-gray-400"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* User section */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-semibold">
                {session?.user?.name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session?.user?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {role ? roleLabels[role] : ""}
                {(role === "GRADE_LEADER" || role === "DUTY_TEACHER") && session?.user?.managedGrade && ` · ${session.user.managedGrade}年级`}
                {session?.user?.className && ` · ${session.user.className}`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50"
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.href = "/login";
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>
    </>
  );
}
