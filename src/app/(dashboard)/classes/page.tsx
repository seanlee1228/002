"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Button as HButton,
  Input as HInput,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Plus, Pencil, Trash2, Loader2, School } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListPageSkeleton } from "@/components/skeletons";

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
  teacherNames?: string[];
}

export default function ClassesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [gradeLeaders, setGradeLeaders] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [formName, setFormName] = useState("");
  const [formGrade, setFormGrade] = useState<number>(1);
  const [formSection, setFormSection] = useState<number>(1);

  const hasAccess = session?.user?.role === "ADMIN" || session?.user?.role === "GRADE_LEADER";
  const t = useTranslations("classes");
  const tc = useTranslations("common");

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (!hasAccess) return;

    const fetchClasses = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/classes");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || tc("loadFailed"));
        }
        const data = await res.json();
        // 兼容新旧格式：新格式 { classes, gradeLeaders }，旧格式直接数组
        if (data && data.classes) {
          setClasses(Array.isArray(data.classes) ? data.classes : []);
          setGradeLeaders(data.gradeLeaders || {});
        } else {
          setClasses(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("loadFailed"));
        setClasses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasAccess, tc]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !hasAccess) {
      router.push("/");
    }
  }, [status, hasAccess, router]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormGrade(1);
    setFormSection(1);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (cls: ClassItem) => {
    setEditingId(cls.id);
    setFormName(cls.name);
    setFormGrade(cls.grade);
    setFormSection(cls.section);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/classes/${editingId}` : "/api/classes";
      const method = editingId ? "PUT" : "POST";
      const body = JSON.stringify({
        name: formName.trim(),
        grade: formGrade,
        section: formSection,
      });
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("operationFailed"));
      }
      const updated = await res.json();
      if (editingId) {
        setClasses((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...updated } : c)));
      } else {
        setClasses((prev) => [...prev, updated]);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("operationFailed"));
    } finally {
      setFormLoading(false);
    }
  };

  const openDelete = (cls: ClassItem) => {
    setDeleteTarget(cls);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/classes/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("deleteFailed"));
      }
      setClasses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const groupedByGrade = classes.reduce(
    (acc, cls) => {
      const key = cls.grade;
      if (!acc[key]) acc[key] = [];
      acc[key].push(cls);
      return acc;
    },
    {} as Record<number, ClassItem[]>
  );

  const sortedGrades = Object.keys(groupedByGrade).map(Number).sort((a, b) => a - b);

  if (status === "loading" || status === "unauthenticated") {
    return <ListPageSkeleton cols={4} />;
  }

  if (!hasAccess) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-v-text1">
          {session?.user?.role === "GRADE_LEADER"
            ? t("titleWithGrade", { grade: session?.user?.managedGrade ?? "" })
            : t("title")}
        </h1>
        <HButton
          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
          startContent={<Plus className="h-4 w-4" />}
          onPress={openCreate}
        >
          {t("addClass")}
        </HButton>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-red-400">{error}</p>
          <HButton variant="bordered" size="sm" className="border-v-border-input text-v-text3" onPress={() => window.location.reload()}>
            {tc("retry")}
          </HButton>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-v-text4" />
        </div>
      ) : classes.length === 0 ? (
        <HCard className="bg-v-card border border-v-border">
          <HCardBody className="flex flex-col items-center justify-center py-16">
            <School className="h-12 w-12 text-v-text4 mb-4" />
            <p className="text-v-text3 mb-4">{t("emptyHint")}</p>
            <HButton
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
              startContent={<Plus className="h-4 w-4" />}
              onPress={openCreate}
            >
              {t("addClass")}
            </HButton>
          </HCardBody>
        </HCard>
      ) : (
        <div className="space-y-8">
          {sortedGrades.map((grade) => (
            <div key={grade}>
              <div className="flex items-baseline gap-2 mb-4">
                <h2 className="text-lg font-semibold text-v-text1">
                  {tc("gradeNames." + grade) || tc("grade", { grade })}
                </h2>
                {gradeLeaders[grade] && gradeLeaders[grade].length > 0 && (
                  <span className="text-sm text-v-text3">
                    {gradeLeaders[grade].join("、")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {groupedByGrade[grade]
                  ?.sort((a, b) => a.section - b.section)
                  .map((cls) => (
                    <div
                      key={cls.id}
                      className="group bg-v-card border border-v-border rounded-xl px-3.5 py-3 hover:bg-v-hover transition-colors flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-v-text1 truncate">{cls.name}</p>
                        {cls.teacherNames && cls.teacherNames.length > 0 && (
                          <p className="text-xs text-v-text3 truncate mt-0.5">
                            {cls.teacherNames.join("、")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <HButton isIconOnly variant="light" size="sm" className="text-v-text3 hover:text-v-text1 min-w-7 w-7 h-7" onPress={() => openEdit(cls)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </HButton>
                        <HButton isIconOnly variant="light" size="sm" className="text-red-400 hover:text-red-300 min-w-7 w-7 h-7" onPress={() => openDelete(cls)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </HButton>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={dialogOpen} onOpenChange={setDialogOpen} placement="center" classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}>
        <ModalContent>
          {(onClose) => (
            <form onSubmit={handleSubmit}>
              <ModalHeader className="text-v-text1">
                {editingId ? t("editTitle") : t("createTitle")}
              </ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-sm text-v-text3">{editingId ? t("editSubtitle") : t("createSubtitle")}</p>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <HInput
                  label={t("nameLabel")}
                  labelPlacement="outside"
                  value={formName}
                  onValueChange={setFormName}
                  placeholder={t("namePlaceholder")}
                  isRequired
                  variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
                <HInput
                  type="number"
                  label={t("gradeLabel")}
                  labelPlacement="outside"
                  value={String(formGrade)}
                  onChange={(e) => setFormGrade(Number(e.target.value) || 1)}
                  min={1}
                  max={9}
                  variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1" }}
                />
                <HInput
                  type="number"
                  label={t("sectionLabel")}
                  labelPlacement="outside"
                  value={String(formSection)}
                  onChange={(e) => setFormSection(Number(e.target.value) || 1)}
                  min={1}
                  variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1" }}
                />
              </ModalBody>
              <ModalFooter>
                <HButton variant="bordered" className="border-v-border-input text-v-text3" onPress={onClose}>
                  {tc("cancel")}
                </HButton>
                <HButton type="submit" isLoading={formLoading} spinner={<Loader2 className="h-4 w-4 animate-spin" />} className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                  {editingId ? tc("save") : tc("create")}
                </HButton>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} placement="center" classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-v-text1">{tc("confirmDelete")}</ModalHeader>
              <ModalBody>
                <p className="text-v-text3 text-sm">
                  {t("deleteConfirm", { name: deleteTarget?.name ?? "" })}
                </p>
              </ModalBody>
              <ModalFooter>
                <HButton variant="bordered" className="border-v-border-input text-v-text3" isDisabled={deleteLoading} onPress={onClose}>
                  {tc("cancel")}
                </HButton>
                <HButton color="danger" isLoading={deleteLoading} spinner={<Loader2 className="h-4 w-4 animate-spin" />} onPress={handleDelete}>
                  {tc("delete")}
                </HButton>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
