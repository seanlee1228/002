"use client";

import { useState, useCallback } from "react";
import {
  Button as HButton,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Checkbox,
  CheckboxGroup,
  Divider,
  Input,
  Spinner,
  addToast,
} from "@heroui/react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Users,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

type StepId = "period" | "timetable" | "assignment" | "mark_outdoor" | "confirm";

interface UploadState {
  filename: string | null;
  data: unknown[] | null;
  errors: unknown[] | null;
  summary: Record<string, unknown> | null;
  subjects?: string[];
  teachers?: string[];
  classes?: string[];
}

export default function AttendanceSetupPage() {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");

  const [step, setStep] = useState<StepId>("period");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // 三张表的上传状态
  const [periodState, setPeriodState] = useState<UploadState>({
    filename: null,
    data: null,
    errors: null,
    summary: null,
  });
  const [timetableState, setTimetableState] = useState<UploadState>({
    filename: null,
    data: null,
    errors: null,
    summary: null,
  });
  const [assignmentState, setAssignmentState] = useState<UploadState>({
    filename: null,
    data: null,
    errors: null,
    summary: null,
  });

  // 室外课标记
  const [outdoorSubjects, setOutdoorSubjects] = useState<string[]>([]);

  // 默认密码
  const [defaultPassword, setDefaultPassword] = useState("bgys2026");

  // 导入结果
  const [importResult, setImportResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  // 现有配置状态
  const [setupStatus, setSetupStatus] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [clearExisting, setClearExisting] = useState(false);

  // 加载配置状态
  const loadSetupStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/setup");
      if (res.ok) {
        const data = await res.json();
        setSetupStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // 首次加载
  useState(() => {
    loadSetupStatus();
  });

  // 上传文件
  const handleUpload = async (
    type: "period_schedule" | "timetable" | "teacher_assignment",
    file: File
  ) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/attendance/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        addToast({ title: result.error || "上传失败", color: "danger" });
        return;
      }

      const state: UploadState = {
        filename: result.filename,
        data: result.data,
        errors: result.errors,
        summary: result.summary,
        subjects: result.subjects,
        teachers: result.teachers,
        classes: result.classes,
      };

      switch (type) {
        case "period_schedule":
          setPeriodState(state);
          break;
        case "timetable":
          setTimetableState(state);
          break;
        case "teacher_assignment":
          setAssignmentState(state);
          break;
      }

      addToast({
        title: `${file.name} 解析完成`,
        color: result.errors?.length > 0 ? "warning" : "success",
      });
    } catch {
      addToast({ title: "上传失败", color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // 确认导入
  const handleImport = async () => {
    if (!periodState.data || !timetableState.data || !assignmentState.data) {
      addToast({ title: "请先上传全部三张表", color: "warning" });
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/attendance/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periods: periodState.data,
          slots: timetableState.data,
          assignments: assignmentState.data,
          outdoorSubjects,
          defaultPassword,
          clearExisting,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        addToast({ title: result.error || "导入失败", color: "danger" });
        return;
      }

      setImportResult(result.stats);
      setStep("confirm");
      addToast({ title: "导入成功", color: "success" });
      loadSetupStatus();
    } catch {
      addToast({ title: "导入失败", color: "danger" });
    } finally {
      setImporting(false);
    }
  };

  // 文件选择器
  const FileUploader = ({
    label,
    type,
    state,
    icon: Icon,
  }: {
    label: string;
    type: "period_schedule" | "timetable" | "teacher_assignment";
    state: UploadState;
    icon: typeof Clock;
  }) => (
    <Card className="bg-v-card border border-v-border">
      <CardBody className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-v-text1">{label}</p>
            {state.filename && (
              <p className="text-xs text-v-text3 mt-0.5">
                {state.filename}
              </p>
            )}
          </div>
          {state.data && (
            <Chip
              color={
                (state.errors as unknown[])?.length > 0
                  ? "warning"
                  : "success"
              }
              variant="flat"
              size="sm"
            >
              {(state.errors as unknown[])?.length > 0
                ? `${(state.data as unknown[]).length} 条数据, ${(state.errors as unknown[]).length} 个警告`
                : `${(state.data as unknown[]).length} 条数据`}
            </Chip>
          )}
        </div>

        <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-v-border rounded-xl cursor-pointer hover:border-blue-400/50 hover:bg-blue-500/5 transition-colors">
          <Upload className="w-4 h-4 text-v-text3" />
          <span className="text-sm text-v-text3">
            {state.data ? "重新上传" : "点击选择 .xlsx 文件"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(type, f);
              e.target.value = "";
            }}
          />
        </label>

        {/* 预览数据 */}
        {state.data && (state.data as unknown[]).length > 0 && (
          <div className="max-h-48 overflow-auto rounded-lg border border-v-border">
            <table className="w-full text-xs">
              <tbody>
                {(state.data as Record<string, unknown>[])
                  .slice(0, 8)
                  .map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-v-border last:border-0"
                    >
                      {Object.values(row).map((val, j) => (
                        <td
                          key={j}
                          className="px-2 py-1.5 text-v-text2"
                        >
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                {(state.data as unknown[]).length > 8 && (
                  <tr>
                    <td
                      colSpan={99}
                      className="px-2 py-1.5 text-center text-v-text4"
                    >
                      ... 还有 {(state.data as unknown[]).length - 8}{" "}
                      条
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 错误信息 */}
        {state.errors && (state.errors as unknown[]).length > 0 && (
          <div className="space-y-1">
            {(
              state.errors as { row?: number; message: string }[]
            )
              .slice(0, 3)
              .map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-amber-400"
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {err.row ? `第${err.row}行: ` : ""}
                    {err.message}
                  </span>
                </div>
              ))}
          </div>
        )}
      </CardBody>
    </Card>
  );

  const steps: { id: StepId; label: string }[] = [
    { id: "period", label: t("setup.stepPeriod") },
    { id: "timetable", label: t("setup.stepTimetable") },
    { id: "assignment", label: t("setup.stepAssignment") },
    { id: "mark_outdoor", label: t("setup.stepOutdoor") },
    { id: "confirm", label: t("setup.stepConfirm") },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-bold text-v-text1">
          {t("setup.title")}
        </h1>
        <p className="text-sm text-v-text3 mt-1">
          {t("setup.description")}
        </p>
      </div>

      {/* 现有配置状态 */}
      {setupStatus &&
        (setupStatus as { configured: boolean }).configured && (
          <Card className="bg-v-card border border-v-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="font-semibold text-v-text1 text-sm">
                  {t("setup.currentConfig")}
                </span>
              </div>
            </CardHeader>
            <CardBody className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  {
                    label: t("setup.periods"),
                    value: (
                      setupStatus as { stats: { periods: number } }
                    ).stats.periods,
                  },
                  {
                    label: t("setup.totalSlots"),
                    value: (
                      setupStatus as {
                        stats: { totalSlots: number };
                      }
                    ).stats.totalSlots,
                  },
                  {
                    label: t("setup.outdoorSlots"),
                    value: (
                      setupStatus as {
                        stats: { outdoorSlots: number };
                      }
                    ).stats.outdoorSlots,
                  },
                  {
                    label: t("setup.teachers"),
                    value: (
                      setupStatus as {
                        stats: { teachers: number };
                      }
                    ).stats.teachers,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-v-text3 text-xs">
                      {item.label}
                    </p>
                    <p className="font-bold text-v-text1">
                      {String(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

      {/* 步骤指示器 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <button
              onClick={() => setStep(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                s.id === step
                  ? "bg-blue-500/15 text-blue-400"
                  : i < currentStepIndex
                    ? "bg-green-500/10 text-green-400"
                    : "text-v-text4 hover:text-v-text2"
              }`}
            >
              {i + 1}. {s.label}
            </button>
            {i < steps.length - 1 && (
              <ArrowRight className="w-3 h-3 text-v-text4 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}

      {/* Step 1: 作息时间表 */}
      {step === "period" && !loading && (
        <div className="space-y-4">
          <FileUploader
            label={t("setup.periodSchedule")}
            type="period_schedule"
            state={periodState}
            icon={Clock}
          />
          <p className="text-xs text-v-text4">
            {t("setup.periodHint")}
          </p>
          <div className="flex justify-end">
            <HButton
              color="primary"
              isDisabled={!periodState.data}
              onPress={() => setStep("timetable")}
            >
              {tc("save")} →
            </HButton>
          </div>
        </div>
      )}

      {/* Step 2: 课程表 */}
      {step === "timetable" && !loading && (
        <div className="space-y-4">
          <FileUploader
            label={t("setup.timetable")}
            type="timetable"
            state={timetableState}
            icon={BookOpen}
          />
          <p className="text-xs text-v-text4">
            {t("setup.timetableHint")}
          </p>
          <div className="flex justify-end gap-2">
            <HButton
              variant="flat"
              onPress={() => setStep("period")}
            >
              ← {t("setup.prev")}
            </HButton>
            <HButton
              color="primary"
              isDisabled={!timetableState.data}
              onPress={() => setStep("assignment")}
            >
              {tc("save")} →
            </HButton>
          </div>
        </div>
      )}

      {/* Step 3: 任课表 */}
      {step === "assignment" && !loading && (
        <div className="space-y-4">
          <FileUploader
            label={t("setup.teacherAssignment")}
            type="teacher_assignment"
            state={assignmentState}
            icon={Users}
          />
          <p className="text-xs text-v-text4">
            {t("setup.assignmentHint")}
          </p>

          <Card className="bg-v-card border border-v-border">
            <CardBody className="p-4 space-y-3">
              <p className="text-sm font-semibold text-v-text1">
                {t("setup.defaultPassword")}
              </p>
              <Input
                value={defaultPassword}
                onValueChange={setDefaultPassword}
                size="sm"
                variant="flat"
                description={t("setup.defaultPasswordHint")}
                classNames={{
                  input: "text-v-text1",
                  inputWrapper: "bg-v-input",
                }}
              />
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2">
            <HButton
              variant="flat"
              onPress={() => setStep("timetable")}
            >
              ← {t("setup.prev")}
            </HButton>
            <HButton
              color="primary"
              isDisabled={!assignmentState.data}
              onPress={() => setStep("mark_outdoor")}
            >
              {tc("save")} →
            </HButton>
          </div>
        </div>
      )}

      {/* Step 4: 标记室外课 */}
      {step === "mark_outdoor" && !loading && (
        <div className="space-y-4">
          <Card className="bg-v-card border border-v-border">
            <CardHeader>
              <span className="font-semibold text-v-text1">
                {t("setup.markOutdoorTitle")}
              </span>
            </CardHeader>
            <CardBody className="pt-0">
              <p className="text-sm text-v-text3 mb-4">
                {t("setup.markOutdoorDesc")}
              </p>
              {timetableState.subjects &&
              timetableState.subjects.length > 0 ? (
                <CheckboxGroup
                  value={outdoorSubjects}
                  onValueChange={setOutdoorSubjects}
                  classNames={{ wrapper: "gap-2" }}
                >
                  {(timetableState.subjects as string[]).map(
                    (subject) => (
                      <Checkbox
                        key={subject}
                        value={subject}
                        classNames={{
                          label: "text-v-text1",
                        }}
                      >
                        {subject}
                      </Checkbox>
                    )
                  )}
                </CheckboxGroup>
              ) : (
                <p className="text-sm text-v-text4">
                  {t("setup.noSubjects")}
                </p>
              )}
            </CardBody>
          </Card>

          {setupStatus &&
            (setupStatus as { configured: boolean }).configured && (
              <Card className="bg-v-card border border-amber-500/20">
                <CardBody className="p-4">
                  <Checkbox
                    isSelected={clearExisting}
                    onValueChange={setClearExisting}
                    classNames={{ label: "text-v-text1 text-sm" }}
                  >
                    <div>
                      <p className="font-medium">
                        {t("setup.clearExisting")}
                      </p>
                      <p className="text-xs text-amber-400 mt-0.5">
                        {t("setup.clearExistingWarn")}
                      </p>
                    </div>
                  </Checkbox>
                </CardBody>
              </Card>
            )}

          <div className="flex justify-end gap-2">
            <HButton
              variant="flat"
              onPress={() => setStep("assignment")}
            >
              ← {t("setup.prev")}
            </HButton>
            <HButton
              color="primary"
              isLoading={importing}
              onPress={handleImport}
              startContent={
                !importing && (
                  <FileSpreadsheet className="w-4 h-4" />
                )
              }
            >
              {t("setup.confirmImport")}
            </HButton>
          </div>
        </div>
      )}

      {/* Step 5: 导入结果 */}
      {step === "confirm" && importResult && (
        <Card className="bg-v-card border border-green-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="font-bold text-v-text1">
                {t("setup.importSuccess")}
              </span>
            </div>
          </CardHeader>
          <CardBody className="pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-v-text3">{t("setup.periodsCreated")}</p>
                <p className="font-bold text-v-text1">
                  {String(
                    (importResult as { periodsCreated: number })
                      .periodsCreated
                  )}
                </p>
              </div>
              <div>
                <p className="text-v-text3">{t("setup.slotsCreated")}</p>
                <p className="font-bold text-v-text1">
                  {String(
                    (importResult as { slotsCreated: number })
                      .slotsCreated
                  )}
                </p>
              </div>
              <div>
                <p className="text-v-text3">
                  {t("setup.teachersCreated")}
                </p>
                <p className="font-bold text-v-text1">
                  {String(
                    (importResult as { teachersCreated: number })
                      .teachersCreated
                  )}
                </p>
              </div>
              <div>
                <p className="text-v-text3">
                  {t("setup.teachersExisting")}
                </p>
                <p className="font-bold text-v-text1">
                  {String(
                    (importResult as { teachersExisting: number })
                      .teachersExisting
                  )}
                </p>
              </div>
            </div>

            {(importResult as { classesNotFound: string[] })
              .classesNotFound?.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">
                    {t("setup.unmatchedClasses")}
                  </span>
                </div>
                <p className="text-xs text-v-text3">
                  {(
                    importResult as {
                      classesNotFound: string[];
                    }
                  ).classesNotFound.join(", ")}
                </p>
              </div>
            )}

            <Divider className="bg-v-border" />

            <div className="flex gap-2">
              <HButton
                variant="flat"
                startContent={<Trash2 className="w-4 h-4" />}
                onPress={() => {
                  setPeriodState({
                    filename: null,
                    data: null,
                    errors: null,
                    summary: null,
                  });
                  setTimetableState({
                    filename: null,
                    data: null,
                    errors: null,
                    summary: null,
                  });
                  setAssignmentState({
                    filename: null,
                    data: null,
                    errors: null,
                    summary: null,
                  });
                  setOutdoorSubjects([]);
                  setImportResult(null);
                  setStep("period");
                }}
              >
                {t("setup.resetAndReupload")}
              </HButton>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
