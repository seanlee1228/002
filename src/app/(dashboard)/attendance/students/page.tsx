"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button as HButton,
  Card,
  CardBody,
  CardHeader,
  Input,
  Textarea,
  Select,
  SelectItem,
  Spinner,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  addToast,
} from "@heroui/react";
import { Plus, Upload, Trash2, Edit3 } from "lucide-react";
import { useTranslations } from "next-intl";

interface Student {
  id: string;
  name: string;
  studentNo: string | null;
  classId: string;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
}

export default function StudentManagementPage() {
  const t = useTranslations("attendance.students");
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  // 单个添加/编辑
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const editModal = useDisclosure();

  // 批量添加
  const [batchText, setBatchText] = useState("");
  const batchModal = useDisclosure();

  // 加载班级列表
  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((data) => {
        if (data.classes) {
          setClasses(data.classes);
          if (data.classes.length > 0 && !selectedClassId) {
            setSelectedClassId(data.classes[0].id);
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载学生列表
  const loadStudents = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance/students?classId=${selectedClassId}`
      );
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // 保存单个学生
  const handleSaveStudent = async () => {
    if (!studentName.trim()) return;

    try {
      const res = await fetch("/api/attendance/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingStudent?.id,
          name: studentName.trim(),
          studentNo: studentNo.trim() || null,
          classId: selectedClassId,
        }),
      });

      if (res.ok) {
        addToast({
          title: editingStudent ? tc("updateSuccess") : tc("createSuccess"),
          color: "success",
        });
        editModal.onClose();
        loadStudents();
      } else {
        const data = await res.json();
        addToast({ title: data.error || tc("operationFailed"), color: "danger" });
      }
    } catch {
      addToast({ title: tc("operationFailed"), color: "danger" });
    }
  };

  // 批量添加
  const handleBatchAdd = async () => {
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const students = lines.map((line) => {
      const parts = line.split(/[\t\s]+/);
      return {
        name: parts[0],
        studentNo: parts[1] || undefined,
      };
    });

    try {
      const res = await fetch("/api/attendance/students/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedClassId, students }),
      });

      if (res.ok) {
        const data = await res.json();
        addToast({
          title: `成功添加 ${data.count} 名学生`,
          color: "success",
        });
        batchModal.onClose();
        setBatchText("");
        loadStudents();
      } else {
        const data = await res.json();
        addToast({ title: data.error || tc("operationFailed"), color: "danger" });
      }
    } catch {
      addToast({ title: tc("operationFailed"), color: "danger" });
    }
  };

  // 删除学生
  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;

    try {
      const res = await fetch(`/api/attendance/students?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        addToast({ title: tc("deleteSuccess"), color: "success" });
        loadStudents();
      }
    } catch {
      addToast({ title: tc("deleteFailed"), color: "danger" });
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-v-text1">{t("title")}</h1>
        </div>
      </div>

      {/* 班级选择 */}
      <div className="flex items-center gap-3">
        <Select
          label={t("selectClass")}
          selectedKeys={selectedClassId ? [selectedClassId] : []}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string;
            if (v) setSelectedClassId(v);
          }}
          size="sm"
          variant="flat"
          className="max-w-xs"
          classNames={{
            trigger: "bg-v-input",
            value: "text-v-text1",
          }}
        >
          {classes.map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>

        <div className="flex-1" />

        <HButton
          size="sm"
          variant="flat"
          startContent={<Upload className="w-4 h-4" />}
          onPress={() => {
            setBatchText("");
            batchModal.onOpen();
          }}
        >
          {t("batchAdd")}
        </HButton>
        <HButton
          size="sm"
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={() => {
            setEditingStudent(null);
            setStudentName("");
            setStudentNo("");
            editModal.onOpen();
          }}
        >
          {t("addStudent")}
        </HButton>
      </div>

      {/* 学生列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : students.length === 0 ? (
        <Card className="bg-v-card border border-v-border">
          <CardBody className="py-12 text-center">
            <p className="text-v-text3">{t("noStudents")}</p>
          </CardBody>
        </Card>
      ) : (
        <Card className="bg-v-card border border-v-border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-v-text1">
                {selectedClass?.name}
              </span>
              <Chip size="sm" variant="flat">
                {students.length} 人
              </Chip>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="divide-y divide-v-border">
              {students.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="w-6 text-xs text-v-text4 text-right">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-v-text1">
                    {s.name}
                  </span>
                  {s.studentNo && (
                    <span className="text-xs text-v-text3">
                      {s.studentNo}
                    </span>
                  )}
                  <HButton
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="text-v-text3 hover:text-blue-400"
                    onPress={() => {
                      setEditingStudent(s);
                      setStudentName(s.name);
                      setStudentNo(s.studentNo || "");
                      editModal.onOpen();
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </HButton>
                  <HButton
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="text-v-text3 hover:text-red-400"
                    onPress={() => handleDelete(s.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </HButton>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={editModal.isOpen} onOpenChange={editModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>
            {editingStudent ? tc("edit") : t("addStudent")}
          </ModalHeader>
          <ModalBody>
            <Input
              label={t("name")}
              value={studentName}
              onValueChange={setStudentName}
              isRequired
              variant="flat"
              classNames={{
                input: "text-v-text1",
                inputWrapper: "bg-v-input",
              }}
            />
            <Input
              label={t("studentNo")}
              value={studentNo}
              onValueChange={setStudentNo}
              variant="flat"
              classNames={{
                input: "text-v-text1",
                inputWrapper: "bg-v-input",
              }}
            />
          </ModalBody>
          <ModalFooter>
            <HButton variant="flat" onPress={editModal.onClose}>
              {tc("cancel")}
            </HButton>
            <HButton
              color="primary"
              onPress={handleSaveStudent}
              isDisabled={!studentName.trim()}
            >
              {tc("save")}
            </HButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 批量添加弹窗 */}
      <Modal
        isOpen={batchModal.isOpen}
        onOpenChange={batchModal.onOpenChange}
        size="lg"
      >
        <ModalContent>
          <ModalHeader>{t("batchAdd")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-v-text3">{t("batchHint")}</p>
            <Textarea
              value={batchText}
              onValueChange={setBatchText}
              minRows={8}
              placeholder={"张三\n李四 20240101\n王五 20240102"}
              variant="flat"
              classNames={{
                input: "text-v-text1 font-mono",
                inputWrapper: "bg-v-input",
              }}
            />
            {batchText.trim() && (
              <p className="text-xs text-v-text3">
                将添加{" "}
                {
                  batchText
                    .split("\n")
                    .filter((l) => l.trim()).length
                }{" "}
                名学生
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <HButton variant="flat" onPress={batchModal.onClose}>
              {tc("cancel")}
            </HButton>
            <HButton
              color="primary"
              onPress={handleBatchAdd}
              isDisabled={!batchText.trim()}
            >
              {t("batchAdd")}
            </HButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
