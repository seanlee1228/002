"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Select,
  SelectItem,
  Input,
  Spinner,
  Button as HButton,
} from "@heroui/react";
import { Search, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClassItem {
  id: string;
  name: string;
  grade: number;
}

interface RecordItem {
  id: string;
  date: string;
  studentName: string;
  studentNo: string | null;
  subject: string;
  periodNo: number;
  status: string;
  comment: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { color: "success" | "danger" | "warning" | "secondary"; label: string }
> = {
  present: { color: "success", label: "出勤" },
  absent: { color: "danger", label: "缺勤" },
  excused: { color: "warning", label: "请假" },
  late: { color: "secondary", label: "迟到" },
};

export default function AttendanceRecordsPage() {
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 默认日期范围：本周
  useEffect(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    setDateFrom(fmt(monday));
    setDateTo(fmt(friday));
  }, []);

  // 加载班级
  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((data) => {
        if (data.classes) {
          setClasses(data.classes);
          if (data.classes.length > 0) {
            setSelectedClassId(data.classes[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // 查询记录
  const loadRecords = useCallback(async () => {
    if (!selectedClassId || !dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId: selectedClassId,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/attendance/records?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, dateFrom, dateTo]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // 统计
  const absentCount = records.filter((r) => r.status === "absent").length;
  const excusedCount = records.filter((r) => r.status === "excused").length;
  const lateCount = records.filter((r) => r.status === "late").length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-v-text1">考勤记录查询</h1>

      {/* 筛选条件 */}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="班级"
          selectedKeys={selectedClassId ? [selectedClassId] : []}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string;
            if (v) setSelectedClassId(v);
          }}
          size="sm"
          variant="flat"
          className="w-40"
          classNames={{ trigger: "bg-v-input", value: "text-v-text1" }}
        >
          {classes.map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>

        <Input
          type="date"
          label="开始日期"
          value={dateFrom}
          onValueChange={setDateFrom}
          size="sm"
          variant="flat"
          className="w-40"
          classNames={{ input: "text-v-text1", inputWrapper: "bg-v-input" }}
        />
        <Input
          type="date"
          label="结束日期"
          value={dateTo}
          onValueChange={setDateTo}
          size="sm"
          variant="flat"
          className="w-40"
          classNames={{ input: "text-v-text1", inputWrapper: "bg-v-input" }}
        />

        <HButton
          size="sm"
          color="primary"
          startContent={<Search className="w-4 h-4" />}
          onPress={loadRecords}
        >
          查询
        </HButton>
      </div>

      {/* 统计概要 */}
      {records.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <Chip variant="flat">共 {records.length} 条记录</Chip>
          {absentCount > 0 && (
            <Chip color="danger" variant="flat">
              缺勤 {absentCount} 人次
            </Chip>
          )}
          {excusedCount > 0 && (
            <Chip color="warning" variant="flat">
              请假 {excusedCount} 人次
            </Chip>
          )}
          {lateCount > 0 && (
            <Chip color="secondary" variant="flat">
              迟到 {lateCount} 人次
            </Chip>
          )}
        </div>
      )}

      {/* 记录列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : records.length === 0 ? (
        <Card className="bg-v-card border border-v-border">
          <CardBody className="py-12 text-center">
            <p className="text-v-text3">{tc("noData")}</p>
          </CardBody>
        </Card>
      ) : (
        <Card className="bg-v-card border border-v-border">
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-v-border">
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      日期
                    </th>
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      节次
                    </th>
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      科目
                    </th>
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      学生
                    </th>
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-v-text3 font-medium">
                      备注
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const cfg = STATUS_CONFIG[r.status] || {
                      color: "default" as const,
                      label: r.status,
                    };
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-v-border last:border-0 hover:bg-v-hover/50"
                      >
                        <td className="px-4 py-2.5 text-v-text2">
                          {r.date}
                        </td>
                        <td className="px-4 py-2.5 text-v-text2">
                          第{r.periodNo}节
                        </td>
                        <td className="px-4 py-2.5 text-v-text1">
                          {r.subject}
                        </td>
                        <td className="px-4 py-2.5 text-v-text1">
                          {r.studentName}
                          {r.studentNo && (
                            <span className="text-v-text4 ml-1 text-xs">
                              {r.studentNo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Chip
                            color={cfg.color}
                            variant="flat"
                            size="sm"
                          >
                            {cfg.label}
                          </Chip>
                        </td>
                        <td className="px-4 py-2.5 text-v-text3 text-xs">
                          {r.comment || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
