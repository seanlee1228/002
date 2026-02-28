"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Card as HCard,
  CardBody as HCardBody,
  Button as HButton,
  Chip as HChip,
  Switch as HSwitch,
  Spinner as HSpinner,
  Input as HInput,
  Textarea as HTextarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListPageSkeleton } from "@/components/skeletons";

interface CheckItem {
  id: string;
  code: string | null;
  module: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isDynamic: boolean;
  planCategory?: string | null;
  date?: string | null;
  targetGrade?: number | null;
  _count: { records: number };
  creator?: { name: string; username: string } | null;
}

interface InspectionResponse {
  fixedItems: CheckItem[];
  dynamicItems: CheckItem[];
}

function formatDateStr(date: Date) {
  return date.toLocaleDateString("en-CA");
}

export default function InspectionPage() {
  const { data: session, status } = useSession();
  const [fixedItems, setFixedItems] = useState<CheckItem[]>([]);
  const [dynamicItems, setDynamicItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicDateFilter, setDynamicDateFilter] = useState(() =>
    formatDateStr(new Date())
  );
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(() => formatDateStr(new Date()));
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";
  const canEditFixed = isAdmin; // Only ADMIN can toggle isActive / edit fixed items
  const canEditDynamic = isAdmin;

  const t = useTranslations("inspection");
  const tc = useTranslations("common");
  const ti = useTranslations("checkItems");
  const CHECK_CODES = ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "W-1", "W-2", "W-3", "W-4", "W-5"];
  const itemTitle = (item: { code?: string | null; title: string }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(item.code) : item.title;
  const itemDesc = (item: { code?: string | null; description?: string | null }) =>
    item.code && CHECK_CODES.includes(item.code) ? ti(`desc.${item.code}`) : (item.description ?? "");

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("date", dynamicDateFilter);
      const res = await fetch(`/api/inspection?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("loadFailed"));
      }
      const data: InspectionResponse = await res.json();
      setFixedItems(data.fixedItems ?? []);
      setDynamicItems(data.dynamicItems ?? []);
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : tc("loadFailed"),
      });
      setFixedItems([]);
      setDynamicItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dynamicDateFilter, tc]);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormDate(dynamicDateFilter);
    setModalOpen(true);
  };

  const openEditModal = (item: CheckItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormDescription(item.description ?? "");
    setFormDate(item.date ?? dynamicDateFilter);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showAlert("error", t("titleRequired"));
      return;
    }
    setFormSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/inspection/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || tc("updateFailed"));
        }
        showAlert("success", tc("updateSuccess"));
      } else {
        const res = await fetch("/api/inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
            date: formDate,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || tc("createFailed"));
        }
        showAlert("success", tc("createSuccess"));
      }
      setModalOpen(false);
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("operationFailed"));
    } finally {
      setFormSubmitting(false);
    }
  };

  const openDeleteModal = (id: string) => {
    setDeleteId(id);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/inspection/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("deleteFailed"));
      }
      showAlert("success", tc("deleteSuccess"));
      setDeleteModalOpen(false);
      setDeleteId(null);
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("deleteFailed"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleFixedToggle = async (item: CheckItem, checked: boolean) => {
    if (!canEditFixed) return;
    try {
      const res = await fetch(`/api/inspection/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: checked }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("updateFailed"));
      }
      showAlert("success", checked ? tc("enabled") : tc("disabled"));
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("operationFailed"));
    }
  };

  const handleFixedEdit = (item: CheckItem) => {
    if (!canEditFixed) return;
    openEditModal(item);
  };

  const cyclePlanCategory = async (item: CheckItem) => {
    if (!canEditFixed) return;
    // 只在 resident ↔ rotating 之间切换
    const nextVal = item.planCategory === "resident" ? "rotating" : "resident";

    // 常驻项上限 3 个校验
    if (nextVal === "resident") {
      const currentResidentCount = fixedItems.filter(
        (fi) => fi.planCategory === "resident" && fi.id !== item.id
      ).length;
      if (currentResidentCount >= 3) {
        showAlert("error", t("residentMax"));
        return;
      }
    }

    try {
      const res = await fetch(`/api/inspection/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCategory: nextVal }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("updateFailed"));
      }
      showAlert("success", tc("updateSuccess"));
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : tc("operationFailed"));
    }
  };

  const canEditDynamicItem = (item: CheckItem) => {
    if (!canEditDynamic) return false;
    if (isAdmin) return true;
    if (isGradeLeader && item.targetGrade != null) {
      return item.targetGrade === session?.user?.managedGrade;
    }
    return item.targetGrade == null; // 全校 dynamic items
  };

  if (status === "loading" || status === "unauthenticated") {
    return <ListPageSkeleton cols={3} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-v-text1">{t("title")}</h1>
        <p className="text-v-text3 mt-1">{t("subtitle")}</p>
      </div>

      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg text-center pointer-events-auto ${
              alert.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm"
                : "bg-red-500/10 text-red-400 border border-red-500/20 backdrop-blur-sm"
            }`}
          >
            {alert.message}
          </div>
        </div>
      )}

      {/* Fixed Items */}
      <section>
        <h2 className="text-lg font-semibold text-v-text1 mb-4">{t("fixedItems")}</h2>
        {loading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <HSpinner size="lg" color="primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fixedItems.map((item) => (
              <HCard
                key={item.id}
                className="bg-v-card border border-v-border hover:bg-v-hover transition-colors"
              >
                <HCardBody className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {item.code && (
                        <HChip
                          variant="flat"
                          size="sm"
                          classNames={{
                            base: "bg-v-input",
                            content: "text-v-text2 text-xs font-mono",
                          }}
                        >
                          {item.code}
                        </HChip>
                      )}
                      <HChip
                        variant="bordered"
                        size="sm"
                        classNames={{
                          base: "border-blue-500/30",
                          content: "text-blue-400 text-xs",
                        }}
                      >
                        {item.module === "DAILY" ? t("daily") : t("weekly")}
                      </HChip>
                      {item.module === "DAILY" && !item.isDynamic && (
                        <HChip
                          variant="flat"
                          size="sm"
                          className={canEditFixed ? "cursor-pointer" : ""}
                          classNames={{
                            base: item.planCategory === "resident"
                              ? "bg-emerald-500/15"
                              : item.planCategory === "rotating"
                                ? "bg-amber-500/15"
                                : "bg-v-input",
                            content: item.planCategory === "resident"
                              ? "text-emerald-400 text-xs"
                              : item.planCategory === "rotating"
                                ? "text-amber-400 text-xs"
                                : "text-v-text3 text-xs",
                          }}
                          onClick={canEditFixed ? () => cyclePlanCategory(item) : undefined}
                        >
                          {item.planCategory === "resident"
                            ? t("categoryResident")
                            : item.planCategory === "rotating"
                              ? t("categoryRotating")
                              : t("categoryAuto")}
                        </HChip>
                      )}
                    </div>
                    {canEditFixed && (
                      <HSwitch
                        size="sm"
                        isSelected={item.isActive}
                        onValueChange={(checked) =>
                          handleFixedToggle(item, checked)
                        }
                        thumbIcon={({ isSelected, className }) =>
                          isSelected ? <Check className={className} /> : <X className={className} />
                        }
                        classNames={{
                          wrapper: "group-data-[selected=true]:bg-emerald-500",
                          thumb: "group-data-[selected=true]:bg-white",
                        }}
                      />
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-v-text1">
                    {itemTitle(item)}
                  </h3>
                  {itemDesc(item) && (
                    <p className="text-sm text-v-text3 line-clamp-2">
                      {itemDesc(item)}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-v-text4">
                      {t("recordCount", { count: item._count.records })}
                    </span>
                    {canEditFixed && (
                      <HButton
                        variant="bordered"
                        size="sm"
                        className="border-v-border-input text-v-text3 hover:text-v-text1"
                        startContent={<Pencil className="h-3.5 w-3.5" />}
                        onPress={() => handleFixedEdit(item)}
                      >
                        {tc("edit")}
                      </HButton>
                    )}
                  </div>
                </HCardBody>
              </HCard>
            ))}
          </div>
        )}
      </section>

      {/* Dynamic Items */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-v-text1">{t("dynamicItems")}</h2>
          <div className="flex items-center gap-3">
            <HInput
              type="date"
              value={dynamicDateFilter}
              onValueChange={setDynamicDateFilter}
              variant="bordered"
              size="sm"
              className="w-40"
              classNames={{
                inputWrapper: "border-v-border-input bg-v-input",
                input: "text-v-text2 placeholder:text-v-text4",
              }}
            />
            {canEditDynamic && (
              <HButton
                color="primary"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                onPress={openCreateModal}
              >
                {t("addDynamic")}
              </HButton>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[120px]">
            <HSpinner size="lg" color="primary" />
          </div>
        ) : dynamicItems.length === 0 ? (
          <HCard className="bg-v-card border border-dashed border-v-border">
            <HCardBody className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-v-text3 font-medium">{t("noDynamicForDate")}</p>
              <p className="text-sm text-v-text4 mt-1">
                {canEditDynamic ? t("addDynamicHint") : tc("noData")}
              </p>
              {canEditDynamic && (
                <HButton
                  color="primary"
                  size="sm"
                  className="mt-4"
                  startContent={<Plus className="h-4 w-4" />}
                  onPress={openCreateModal}
                >
                  {t("addDynamic")}
                </HButton>
              )}
            </HCardBody>
          </HCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dynamicItems.map((item) => (
              <HCard
                key={item.id}
                className="bg-v-card border border-v-border hover:bg-v-hover transition-colors"
              >
                <HCardBody className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-v-text1">
                      {itemTitle(item)}
                    </h3>
                    {item.targetGrade != null ? (
                      <HChip
                        variant="bordered"
                        size="sm"
                        classNames={{
                          base: "border-orange-500/30",
                          content: "text-orange-400 text-xs",
                        }}
                      >
                        {tc(`gradeNames.${item.targetGrade}`)}
                      </HChip>
                    ) : (
                      <HChip
                        variant="bordered"
                        size="sm"
                        classNames={{
                          base: "border-blue-500/30",
                          content: "text-blue-400 text-xs",
                        }}
                      >
                        {tc("allSchool")}
                      </HChip>
                    )}
                  </div>
                  {itemDesc(item) && (
                    <p className="text-sm text-v-text3 line-clamp-2">
                      {itemDesc(item)}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-v-text4">
                    <span>{item.date ?? "-"}</span>
                    <span>{t("recordCount", { count: item._count.records })}</span>
                  </div>
                  {canEditDynamicItem(item) && (
                    <div className="flex gap-2 pt-1">
                      <HButton
                        variant="bordered"
                        size="sm"
                        className="border-v-border-input text-v-text3 hover:text-v-text1"
                        startContent={<Pencil className="h-3.5 w-3.5" />}
                        onPress={() => openEditModal(item)}
                      >
                        {tc("edit")}
                      </HButton>
                      <HButton
                        variant="bordered"
                        size="sm"
                        className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                        startContent={<Trash2 className="h-3.5 w-3.5" />}
                        onPress={() => openDeleteModal(item.id)}
                      >
                        {tc("delete")}
                      </HButton>
                    </div>
                  )}
                </HCardBody>
              </HCard>
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        placement="center"
        classNames={{
          base: "bg-v-card border border-v-border",
          header: "border-b border-v-border",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <form onSubmit={handleFormSubmit}>
              <ModalHeader className="text-v-text1">
                {editingId ? t("editTitle") : t("createTitle")}
              </ModalHeader>
              <ModalBody className="space-y-4">
                <HInput
                  label={t("titleLabel")}
                  labelPlacement="outside"
                  placeholder={t("titlePlaceholder")}
                  value={formTitle}
                  onValueChange={setFormTitle}
                  isRequired
                  variant="bordered"
                  classNames={{
                    label: "text-v-text2 font-medium",
                    inputWrapper: "border-v-border-input bg-v-input",
                    input: "text-v-text1 placeholder:text-v-text4",
                  }}
                />
                <HTextarea
                  label={t("descriptionLabel")}
                  labelPlacement="outside"
                  placeholder={t("descriptionPlaceholder")}
                  value={formDescription}
                  onValueChange={setFormDescription}
                  minRows={3}
                  variant="bordered"
                  classNames={{
                    base: "w-full",
                    label: "text-v-text2 font-medium",
                    inputWrapper: "border-v-border-input bg-v-input",
                    input: "text-v-text1 placeholder:text-v-text4",
                  }}
                />
                {!editingId && (
                  <HInput
                    type="date"
                    label={t("dateLabel")}
                    labelPlacement="outside"
                    value={formDate}
                    onValueChange={setFormDate}
                    variant="bordered"
                    classNames={{
                      label: "text-v-text2 font-medium",
                      inputWrapper: "border-v-border-input bg-v-input",
                      input: "text-v-text1",
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                <HButton
                  variant="bordered"
                  className="border-v-border-input text-v-text3"
                  onPress={onClose}
                >
                  {tc("cancel")}
                </HButton>
                <HButton
                  type="submit"
                  isLoading={formSubmitting}
                  spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  color="primary"
                >
                  {editingId ? tc("save") : tc("create")}
                </HButton>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        placement="center"
        classNames={{
          base: "bg-v-card border border-v-border",
          header: "border-b border-v-border",
          footer: "border-t border-v-border",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-v-text1">{tc("confirmDelete")}</ModalHeader>
              <ModalBody>
                <p className="text-v-text3 text-sm">
                  {t("deleteConfirm")}
                </p>
              </ModalBody>
              <ModalFooter>
                <HButton
                  variant="bordered"
                  className="border-v-border-input text-v-text3"
                  onPress={onClose}
                >
                  {tc("cancel")}
                </HButton>
                <HButton
                  color="danger"
                  isLoading={deleteSubmitting}
                  spinner={<Loader2 className="h-4 w-4 animate-spin" />}
                  onPress={handleDelete}
                >
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
