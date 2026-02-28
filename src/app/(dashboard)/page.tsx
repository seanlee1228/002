"use client";

// 仪表盘主入口 — 负责认证、数据加载、角色路由
// 各角色视图拆分到 _components/ 目录，图表配置拆分到 _lib/

import { useEffect, useState, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LayoutDashboard } from "lucide-react";
import { Button as HButton } from "@heroui/react";

import type { DashboardData } from "./_lib/types";
import { AdminView } from "./_components/admin-view";
import { GradeLeaderView } from "./_components/grade-leader-view";
import { DutyTeacherView } from "./_components/duty-teacher-view";
import { ClassTeacherView } from "./_components/class-teacher-view";
import { PageSkeleton } from "@/components/skeletons";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user?.role;
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  // 会话缺少角色（常见于数据库重建后旧 token），自动跳转重新登录
  useEffect(() => {
    if (status === "authenticated" && !role) {
      void signOut({ callbackUrl: "/login" });
    }
  }, [status, role]);

  // 数据加载
  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status !== "authenticated" || !role) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scores/dashboard");
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || tc("loadFailed"));
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("loadFailed"));
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role, tc]);

  // 子视图更新数据的回调（如 AI 分析刷新后）
  const handleDataUpdate = useCallback((newData: DashboardData) => {
    setData(newData);
  }, []);

  // ---- 加载/错误状态 ----

  if (status === "loading" || status === "unauthenticated") {
    return <PageSkeleton cards={4} />;
  }

  if (!role) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-v-text3">{tc("loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-red-400">{error}</p>
        <HButton
          variant="bordered"
          className="border-v-border-input text-v-text2"
          onPress={() => window.location.reload()}
        >
          {tc("retry")}
        </HButton>
      </div>
    );
  }

  // ---- 视图 Props ----
  const viewProps = { data, loading, onDataUpdate: handleDataUpdate };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-v-text1 flex items-center gap-2">
          <LayoutDashboard className="h-7 w-7 text-blue-400" />
          {role === "ADMIN" && t("adminTitle")}
          {role === "GRADE_LEADER" &&
            t("gradeLeaderTitle", { grade: session?.user?.managedGrade ?? "" })}
          {role === "DUTY_TEACHER" &&
            (session?.user?.managedGrade
              ? t("dutyTeacherTitleWithGrade", { grade: session.user.managedGrade })
              : t("dutyTeacherTitle"))}
          {role === "CLASS_TEACHER" && t("classTeacherTitle")}
          {role === "SUBJECT_TEACHER" && t("subjectTeacherTitle")}
        </h1>
        <p className="text-v-text3 mt-1">{t("welcome", { name: session?.user?.name ?? "" })}</p>
      </div>

      {/* 按角色渲染对应视图 */}
      {role === "ADMIN" && <AdminView {...viewProps} />}
      {role === "GRADE_LEADER" && <GradeLeaderView {...viewProps} />}
      {role === "DUTY_TEACHER" && <DutyTeacherView {...viewProps} />}
      {role === "CLASS_TEACHER" && <ClassTeacherView {...viewProps} />}
      {role === "SUBJECT_TEACHER" && <ClassTeacherView {...viewProps} />}
    </div>
  );
}
