"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button as HButton,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Divider,
  addToast,
} from "@heroui/react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  UserCheck,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CourseInfo {
  slotId: string;
  classId: string;
  className: string;
  classGrade: number;
  subject: string;
  periodNo: number;
  periodLabel: string | null;
  startTime: string;
  endTime: string;
  isSubstitute: boolean;
  status: "in_progress" | "upcoming" | "completed";
  attendanceCount: number;
  weeklyAbsences: number;
}

interface CancelledCourse {
  slotId: string;
  className: string;
  subject: string;
  periodNo: number;
  startTime: string;
  endTime: string;
  status: "cancelled";
  reason?: string;
}

interface Student {
  id: string;
  name: string;
  studentNo: string | null;
}

interface AttendanceEntry {
  studentId: string;
  status: "present" | "absent" | "excused" | "late";
  comment?: string;
}

export default function AttendancePage() {
  const t = useTranslations("attendance.record");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [cancelled, setCancelled] = useState<CancelledCourse[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [today, setToday] = useState("");

  // 点名界面
  const [selectedCourse, setSelectedCourse] = useState<CourseInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Map<string, AttendanceEntry>>(
    new Map()
  );
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载课程列表
  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      setCourses(data.courses || []);
      setCancelled(data.cancelled || []);
      setCurrentTime(data.currentTime || "");
      setToday(data.date || "");
    } catch {
      addToast({ title: tc("loadFailed"), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // 选择课程 → 加载学生
  const selectCourse = async (course: CourseInfo) => {
    setSelectedCourse(course);
    setLoadingStudents(true);

    try {
      // 加载学生列表
      const studentsRes = await fetch(
        `/api/attendance/students?classId=${course.classId}`
      );
      const studentsData = await studentsRes.json();
      const studentList: Student[] = studentsData.students || [];
      setStudents(studentList);

      // 加载已有考勤记录
      const newEntries = new Map<string, AttendanceEntry>();
      for (const s of studentList) {
        newEntries.set(s.id, { studentId: s.id, status: "present" });
      }

      // 如果已有记录，从服务器获取
      if (course.attendanceCount > 0) {
        const recordsRes = await fetch(
          `/api/attendance/records?courseSlotId=${course.slotId}&date=${today}`
        );
        if (recordsRes.ok) {
          const recordsData = await recordsRes.json();
          for (const r of recordsData.records || []) {
            if (newEntries.has(r.studentId)) {
              newEntries.set(r.studentId, {
                studentId: r.studentId,
                status: r.status,
                comment: r.comment,
              });
            }
          }
        }
      }

      setEntries(newEntries);
    } catch {
      addToast({ title: tc("loadFailed"), color: "danger" });
    } finally {
      setLoadingStudents(false);
    }
  };

  // 切换学生状态
  const toggleStatus = (studentId: string) => {
    setEntries((prev) => {
      const newMap = new Map(prev);
      const entry = newMap.get(studentId);
      if (!entry) return prev;

      const statusCycle: Array<AttendanceEntry["status"]> = [
        "present",
        "absent",
        "excused",
        "late",
      ];
      const currentIdx = statusCycle.indexOf(entry.status);
      const nextIdx = (currentIdx + 1) % statusCycle.length;
      newMap.set(studentId, {
        ...entry,
        status: statusCycle[nextIdx],
      });
      return newMap;
    });
  };

  // 全部出勤
  const markAllPresent = () => {
    setEntries((prev) => {
      const newMap = new Map(prev);
      for (const [id, entry] of newMap) {
        newMap.set(id, { ...entry, status: "present" });
      }
      return newMap;
    });
  };

  // 保存考勤
  const saveAttendance = async () => {
    if (!selectedCourse) return;
    setSaving(true);

    try {
      const records = Array.from(entries.values());
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlotId: selectedCourse.slotId,
          date: today,
          records,
        }),
      });

      if (res.ok) {
        addToast({ title: t("saveSuccess"), color: "success" });
        setSelectedCourse(null);
        loadCourses();
      } else {
        const data = await res.json();
        addToast({
          title: data.error || tc("operationFailed"),
          color: "danger",
        });
      }
    } catch {
      addToast({ title: tc("operationFailed"), color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  // 状态颜色和标签
  const statusConfig = {
    present: { color: "success" as const, label: t("present"), icon: CheckCircle2, cardStyle: { borderColor: "hsl(var(--heroui-success) / 0.3)", backgroundColor: "hsl(var(--heroui-success) / 0.08)" } },
    absent: { color: "danger" as const, label: t("absent"), icon: XCircle, cardStyle: { borderColor: "hsl(var(--heroui-danger) / 0.4)", backgroundColor: "hsl(var(--heroui-danger) / 0.1)" } },
    excused: { color: "warning" as const, label: t("excused"), icon: AlertCircle, cardStyle: { borderColor: "hsl(var(--heroui-warning) / 0.4)", backgroundColor: "hsl(var(--heroui-warning) / 0.1)" } },
    late: { color: "secondary" as const, label: t("late"), icon: Clock, cardStyle: { borderColor: "hsl(var(--heroui-secondary) / 0.4)", backgroundColor: "hsl(var(--heroui-secondary) / 0.12)" } },
  };

  const courseStatusConfig = {
    in_progress: { color: "primary" as const, label: t("inProgress") },
    upcoming: { color: "default" as const, label: t("upcoming") },
    completed: { color: "success" as const, label: t("completed") },
    cancelled: { color: "danger" as const, label: t("cancelled") },
  };

  // ======== 点名界面 ========
  if (selectedCourse) {
    const absentCount = Array.from(entries.values()).filter(
      (e) => e.status === "absent"
    ).length;

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {/* 头部 */}
        <div className="flex items-center gap-3">
          <HButton
            isIconOnly
            variant="light"
            size="sm"
            onPress={() => setSelectedCourse(null)}
          >
            <ArrowLeft className="w-4 h-4" />
          </HButton>
          <div>
            <h2 className="font-bold text-v-text1">
              {selectedCourse.className} · {selectedCourse.subject}
            </h2>
            <p className="text-xs text-v-text3">
              {selectedCourse.periodLabel || `第${selectedCourse.periodNo}节`}{" "}
              {selectedCourse.startTime}-{selectedCourse.endTime}
            </p>
          </div>
          <div className="flex-1" />
          {selectedCourse.isSubstitute && (
            <Chip color="warning" variant="flat" size="sm">
              {t("substitute")}
            </Chip>
          )}
        </div>

        {/* 本周缺勤汇总 */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-v-input/50 border border-v-border">
          <UserCheck className="w-4 h-4 text-v-text3" />
          <span className="text-sm text-v-text2">
            {t("weekSummary", {
              count: selectedCourse.weeklyAbsences + absentCount,
            })}
          </span>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center gap-2">
          <HButton
            size="sm"
            variant="flat"
            onPress={markAllPresent}
          >
            {t("allPresent")}
          </HButton>
          <div className="flex-1" />
          <span className="text-xs text-v-text3">
            {students.length} 人
          </span>
        </div>

        {/* 学生名单 */}
        {loadingStudents ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : students.length === 0 ? (
          <Card className="bg-v-card border border-v-border">
            <CardBody className="py-8 text-center">
              <p className="text-v-text3">{t("noStudents")}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {students.map((student, idx) => {
              const entry = entries.get(student.id);
              const status = entry?.status || "present";
              const config = statusConfig[status];

              return (
                <button
                  key={student.id}
                  onClick={() => toggleStatus(student.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                  style={config.cardStyle}
                >
                  <span className="w-6 text-xs text-v-text4 text-right">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-v-text1">
                    {student.name}
                  </span>
                  {student.studentNo && (
                    <span className="text-xs text-v-text4">
                      {student.studentNo}
                    </span>
                  )}
                  <Chip
                    color={config.color}
                    variant="flat"
                    size="sm"
                    startContent={
                      <config.icon className="w-3 h-3" />
                    }
                  >
                    {config.label}
                  </Chip>
                </button>
              );
            })}
          </div>
        )}

        {/* 保存按钮 */}
        {students.length > 0 && (
          <div className="sticky bottom-4">
            <HButton
              color="primary"
              size="lg"
              className="w-full"
              isLoading={saving}
              onPress={saveAttendance}
            >
              {saving ? t("saving") : t("saveAttendance")}
            </HButton>
          </div>
        )}
      </div>
    );
  }

  // ======== 课程列表界面 ========
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-v-text1">
            {t("title")}
          </h1>
          {currentTime && (
            <p className="text-sm text-v-text3 mt-0.5">
              {today} · {t("currentPeriod")}: {currentTime}
            </p>
          )}
        </div>
        <HButton
          isIconOnly
          variant="light"
          size="sm"
          onPress={loadCourses}
        >
          <RefreshCw className="w-4 h-4" />
        </HButton>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : courses.length === 0 && cancelled.length === 0 ? (
        <Card className="bg-v-card border border-v-border">
          <CardBody className="py-12 text-center">
            <UserCheck className="w-12 h-12 text-v-text4 mx-auto mb-3" />
            <p className="text-v-text3">{t("noCourses")}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-v-text2">
            {t("todayCourses")}
          </h2>

          {/* 活跃课程 */}
          {courses.map((course) => {
            const statusCfg = courseStatusConfig[course.status];
            return (
              <Card
                key={course.slotId}
                isPressable
                onPress={() => selectCourse(course)}
                className={`bg-v-card border transition-colors ${
                  course.status === "in_progress"
                    ? "border-blue-500/30 shadow-sm shadow-blue-500/10"
                    : "border-v-border"
                }`}
              >
                <CardBody className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-v-input flex items-center justify-center">
                      <span className="text-sm font-bold text-v-text2">
                        {course.periodNo}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-v-text1">
                          {course.className}
                        </span>
                        <span className="text-sm text-v-text3">
                          {course.subject}
                        </span>
                        {course.isSubstitute && (
                          <Chip
                            color="warning"
                            variant="flat"
                            size="sm"
                          >
                            {t("substitute")}
                          </Chip>
                        )}
                      </div>
                      <p className="text-xs text-v-text4 mt-0.5">
                        {course.startTime} - {course.endTime}
                        {course.weeklyAbsences > 0 &&
                          ` · ${t("weekSummary", { count: course.weeklyAbsences })}`}
                      </p>
                    </div>
                    <Chip
                      color={statusCfg.color}
                      variant="flat"
                      size="sm"
                    >
                      {statusCfg.label}
                    </Chip>
                  </div>
                </CardBody>
              </Card>
            );
          })}

          {/* 取消的课程 */}
          {cancelled.length > 0 && (
            <>
              <Divider className="bg-v-border" />
              {cancelled.map((course) => (
                <Card
                  key={course.slotId}
                  className="bg-v-card border border-v-border opacity-50"
                >
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-v-input flex items-center justify-center">
                        <span className="text-sm font-bold text-v-text4">
                          {course.periodNo}
                        </span>
                      </div>
                      <div className="flex-1">
                        <span className="text-v-text3 line-through">
                          {course.className} · {course.subject}
                        </span>
                        {course.reason && (
                          <p className="text-xs text-v-text4">
                            {course.reason}
                          </p>
                        )}
                      </div>
                      <Chip
                        color="danger"
                        variant="flat"
                        size="sm"
                      >
                        {t("cancelled")}
                      </Chip>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
