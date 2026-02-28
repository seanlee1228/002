"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card as HCard,
  CardBody as HCardBody,
  Button as HButton,
  Input as HInput,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select as HSelect,
  SelectItem as HSelectItem,
} from "@heroui/react";
import { Plus, Pencil, Trash2, Loader2, Users, Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListPageSkeleton } from "@/components/skeletons";

type UserRole = "ADMIN" | "GRADE_LEADER" | "DUTY_TEACHER" | "SUBJECT_TEACHER" | "CLASS_TEACHER";

interface UserItem {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  managedGrade?: number | null;
  class?: { id: string; name: string; grade: number; section: number } | null;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
}

const roleChipColors: Record<UserRole, { base: string; content: string }> = {
  ADMIN: { base: "bg-purple-100 dark:bg-purple-500/20", content: "text-v-text1 text-xs" },
  GRADE_LEADER: { base: "bg-orange-100 dark:bg-orange-500/20", content: "text-v-text1 text-xs" },
  DUTY_TEACHER: { base: "bg-blue-100 dark:bg-blue-500/20", content: "text-v-text1 text-xs" },
  SUBJECT_TEACHER: { base: "bg-cyan-100 dark:bg-cyan-500/20", content: "text-v-text1 text-xs" },
  CLASS_TEACHER: { base: "bg-emerald-100 dark:bg-emerald-500/20", content: "text-v-text1 text-xs" },
};

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 筛选状态
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterClass, setFilterClass] = useState<string>("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("CLASS_TEACHER");
  const [formClassId, setFormClassId] = useState<string>("none");
  const [formManagedGrade, setFormManagedGrade] = useState<string>("none");

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";
  const hasAccess = isAdmin || isGradeLeader;

  const t = useTranslations("users");
  const tc = useTranslations("common");
  const tRoles = useTranslations("nav.roles");

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (!hasAccess) return;
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/users");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || tc("loadFailed"));
        }
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("loadFailed"));
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasAccess, tc]);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (!hasAccess) return;
    fetch("/api/classes")
      .then((res) => res.json())
      .then((data) => setClasses(data?.classes ? data.classes : Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, [status, hasAccess, tc]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !hasAccess) {
      router.push("/");
    }
  }, [status, hasAccess, router]);

  const canEditTargetUser = (target: UserItem) => {
    if (isAdmin) return true;
    if (isGradeLeader) {
      if (target.id === session?.user?.id) return false;
      if (target.role === "ADMIN" || target.role === "GRADE_LEADER") return false;
      return true;
    }
    return false;
  };

  const availableRoles: { value: UserRole; label: string }[] = isAdmin
    ? [
        { value: "ADMIN", label: tRoles("ADMIN") },
        { value: "GRADE_LEADER", label: tRoles("GRADE_LEADER") },
        { value: "DUTY_TEACHER", label: tRoles("DUTY_TEACHER") },
        { value: "SUBJECT_TEACHER", label: tRoles("SUBJECT_TEACHER") },
        { value: "CLASS_TEACHER", label: tRoles("CLASS_TEACHER") },
      ]
    : [
        { value: "DUTY_TEACHER", label: tRoles("DUTY_TEACHER") },
        { value: "CLASS_TEACHER", label: tRoles("CLASS_TEACHER") },
      ];

  // 筛选后的用户列表
  const filteredUsers = useMemo(() => {
    const keyword = searchKeyword.trim();
    const keywordLower = keyword.toLowerCase();

    return users.filter((u) => {
      if (filterRole !== "ALL" && u.role !== filterRole) return false;
      if (filterClass !== "ALL") {
        if (filterClass === "NONE") {
          // 未关联班级：非班主任，或班主任但没有 class
          if (u.class) return false;
        } else {
          if (u.class?.id !== filterClass) return false;
        }
      }
      if (keyword) {
        const nameMatch = u.name.includes(keyword);
        const usernameMatch = u.username.toLowerCase().includes(keywordLower);
        if (!nameMatch && !usernameMatch) return false;
      }
      return true;
    });
  }, [users, filterRole, filterClass, searchKeyword]);

  // 提取班级选项（去重）
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      if (u.class) map.set(u.class.id, u.class.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);

  // 可选年级选项：根据当前系统已有班级的年级动态生成，避免与实际不符
  const gradeOptions = useMemo(() => {
    const set = new Set<number>();
    for (const cls of classes) {
      if (typeof cls.grade === "number") {
        set.add(cls.grade);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [classes]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormUsername("");
    setFormPassword("");
    setFormRole("CLASS_TEACHER");
    setFormClassId("none");
    setFormManagedGrade("none");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (user: UserItem) => {
    setEditingId(user.id);
    setFormName(user.name);
    setFormUsername(user.username);
    setFormPassword("");
    setFormRole(user.role);
    setFormClassId(user.class?.id ?? "none");
    setFormManagedGrade(user.managedGrade != null ? String(user.managedGrade) : "none");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/users/${editingId}` : "/api/users";
      const method = editingId ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        name: formName.trim(),
        username: formUsername.trim(),
        role: formRole,
        classId: formRole === "CLASS_TEACHER" && formClassId && formClassId !== "none" ? formClassId : null,
        managedGrade: (formRole === "GRADE_LEADER" || formRole === "DUTY_TEACHER") && formManagedGrade !== "none"
          ? parseInt(formManagedGrade)
          : null,
      };
      if (!editingId) {
        if (!formPassword.trim()) throw new Error(t("passwordRequired"));
        body.password = formPassword;
      } else if (formPassword.trim()) {
        body.password = formPassword;
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("operationFailed"));
      }
      const updated = await res.json();
      if (editingId) {
        setUsers((prev) => prev.map((u) => (u.id === editingId ? { ...u, ...updated } : u)));
      } else {
        setUsers((prev) => [...prev, updated]);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("operationFailed"));
    } finally {
      setFormLoading(false);
    }
  };

  const openDelete = (user: UserItem) => {
    setDeleteTarget(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("deleteFailed"));
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return <ListPageSkeleton cols={4} />;
  }

  if (!hasAccess) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-v-text1">
          {isGradeLeader ? t("titleWithGrade", { grade: session?.user?.managedGrade ?? "" }) : t("title")}
        </h1>
        <HButton
          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
          startContent={<Plus className="h-4 w-4" />}
          onPress={openCreate}
        >
          {t("addUser")}
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

      {/* 筛选栏 */}
      {!loading && users.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-v-text3 shrink-0" />
          <HSelect
            aria-label={t("filterRole")}
            placeholder={t("filterRole")}
            selectedKeys={[filterRole]}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as string;
              if (val) setFilterRole(val);
            }}
            variant="bordered"
            size="sm"
            className="w-36"
            classNames={{
              trigger: "border-v-border-input bg-v-input pe-8",
              value: "text-v-text2 truncate",
              selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
              popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
              listbox: "text-v-text1",
            }}
          >
            <HSelectItem key="ALL">{t("allRoles")}</HSelectItem>
            <HSelectItem key="ADMIN">{tRoles("ADMIN")}</HSelectItem>
            <HSelectItem key="GRADE_LEADER">{tRoles("GRADE_LEADER")}</HSelectItem>
            <HSelectItem key="DUTY_TEACHER">{tRoles("DUTY_TEACHER")}</HSelectItem>
            <HSelectItem key="SUBJECT_TEACHER">{tRoles("SUBJECT_TEACHER")}</HSelectItem>
            <HSelectItem key="CLASS_TEACHER">{tRoles("CLASS_TEACHER")}</HSelectItem>
          </HSelect>
          {classOptions.length > 0 && (
            <HSelect
              aria-label={t("filterClass")}
              placeholder={t("filterClass")}
              selectedKeys={[filterClass]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                if (val) setFilterClass(val);
              }}
              variant="bordered"
              size="sm"
              className="w-40"
              classNames={{
                trigger: "border-v-border-input bg-v-input pe-8",
                value: "text-v-text2 truncate",
                selectorIcon: "text-v-text3 shrink-0 end-2 absolute",
                popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl",
                listbox: "text-v-text1",
              }}
              items={[
                { id: "ALL", name: t("allClasses") },
                { id: "NONE", name: t("noClass") },
                ...classOptions.map(([id, name]) => ({ id, name })),
              ]}
            >
              {(item) => <HSelectItem key={item.id}>{item.name}</HSelectItem>}
            </HSelect>
          )}
          <HInput
            aria-label={t("searchByName")}
            placeholder={t("searchPlaceholder")}
            size="sm"
            value={searchKeyword}
            onValueChange={setSearchKeyword}
            variant="bordered"
            className="w-40 sm:w-56"
            classNames={{
              inputWrapper: "border-v-border-input bg-v-input h-9",
              input: "text-v-text2 placeholder:text-v-text4 text-xs",
            }}
          />
          {(filterRole !== "ALL" || filterClass !== "ALL") && (
            <HButton
              variant="light"
              size="sm"
              className="text-v-text3 hover:text-v-text1"
              onPress={() => {
                setFilterRole("ALL");
                setFilterClass("ALL");
                setSearchKeyword("");
              }}
            >
              {t("clearFilter")}
            </HButton>
          )}
          <span className="text-xs text-v-text4 ml-auto">
            {t("filterCount", { shown: filteredUsers.length, total: users.length })}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-v-text4" />
        </div>
      ) : users.length === 0 ? (
        <HCard className="bg-v-card border border-v-border">
          <HCardBody className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-v-text4 mb-4" />
            <p className="text-v-text3 mb-4">{t("emptyHint")}</p>
            <HButton className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
              {t("addUser")}
            </HButton>
          </HCardBody>
        </HCard>
      ) : filteredUsers.length === 0 ? (
        <div className="py-12 text-center text-v-text4">{t("noFilterResult")}</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredUsers.map((user) => {
            const assoc = (user.role === "GRADE_LEADER" || user.role === "DUTY_TEACHER") && user.managedGrade
              ? tc(`gradeNames.${user.managedGrade}`)
              : user.class?.name ?? null;
            return (
              <div
                key={user.id}
                className="group bg-v-card border border-v-border rounded-xl px-4 py-3 hover:bg-v-hover transition-colors relative"
              >
                {/* 第一行：姓名 + 角色标签 */}
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-v-text1 truncate">{user.name}</p>
                  <Chip variant="flat" size="sm" classNames={roleChipColors[user.role]}>
                    {tRoles(user.role)}
                  </Chip>
                </div>
                {/* 第二行：班级 / 年级 + 用户名 */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-v-text2 truncate">{assoc || "—"}</span>
                  <span className="text-xs text-v-text4 font-mono">{user.username}</span>
                </div>
                {/* 操作按钮 — 悬浮显示 */}
                {canEditTargetUser(user) && (
                  <div className="absolute top-2.5 right-2.5 flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <HButton isIconOnly variant="light" size="sm" className="text-v-text3 hover:text-v-text1 min-w-7 w-7 h-7" onPress={() => openEdit(user)} aria-label={tc("edit")}>
                      <Pencil className="h-3.5 w-3.5" />
                    </HButton>
                    <HButton isIconOnly variant="light" size="sm" className="text-red-400 hover:text-red-300 min-w-7 w-7 h-7" onPress={() => openDelete(user)} aria-label={tc("delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </HButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={dialogOpen} onOpenChange={setDialogOpen} size="md" placement="center" classNames={{ base: "bg-v-card border border-v-border", header: "border-b border-v-border", footer: "border-t border-v-border" }}>
        <ModalContent>
          {(onClose) => (
            <form onSubmit={handleSubmit}>
              <ModalHeader className="text-v-text1">{editingId ? t("editTitle") : t("createTitle")}</ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-sm text-v-text3">{editingId ? t("editSubtitle") : t("createSubtitle")}</p>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <HInput label={t("nameLabel")} labelPlacement="outside" placeholder={t("namePlaceholder")} value={formName} onValueChange={setFormName} isRequired variant="bordered" classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }} />
                <HInput label={t("usernameLabel")} labelPlacement="outside" placeholder={t("usernamePlaceholder")} value={formUsername} onValueChange={setFormUsername} isRequired variant="bordered" classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }} />
                <HInput
                  label={t("passwordLabel")}
                  labelPlacement="outside"
                  placeholder={editingId ? t("passwordEditHint") : t("passwordPlaceholder")}
                  type="password"
                  value={formPassword}
                  onValueChange={setFormPassword}
                  isRequired={!editingId}
                  variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", inputWrapper: "border-v-border-input bg-v-input", input: "text-v-text1 placeholder:text-v-text4" }}
                />
                <HSelect
                  label={t("roleLabel")}
                  labelPlacement="outside"
                  selectedKeys={[formRole]}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as UserRole;
                    if (val) setFormRole(val);
                  }}
                  variant="bordered"
                  classNames={{ label: "text-v-text2 font-medium", trigger: "border-v-border-input bg-v-input pe-8", value: "text-v-text2 truncate", selectorIcon: "text-v-text3 shrink-0 end-2 absolute", popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl", listbox: "text-v-text1" }}
                >
                  {availableRoles.map((r) => (
                    <HSelectItem key={r.value}>{r.label}</HSelectItem>
                  ))}
                </HSelect>
                {(formRole === "GRADE_LEADER" || formRole === "DUTY_TEACHER") && (
                  <HSelect
                    label={formRole === "GRADE_LEADER" ? t("managedGradeLabel") : t("belongGradeLabel")}
                    labelPlacement="outside"
                    selectedKeys={[formManagedGrade]}
                    onSelectionChange={(keys) => {
                      const val = Array.from(keys)[0] as string;
                      if (val) setFormManagedGrade(val);
                    }}
                    variant="bordered"
                    classNames={{ label: "text-v-text2 font-medium", trigger: "border-v-border-input bg-v-input pe-8", value: "text-v-text2 truncate", selectorIcon: "text-v-text3 shrink-0 end-2 absolute", popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl", listbox: "text-v-text1" }}
                    items={[{ id: "none", label: t("none") }, ...gradeOptions.map((g) => ({ id: String(g), label: tc(`gradeNames.${g}`) }))]}
                  >
                    {(item) => <HSelectItem key={item.id}>{item.label}</HSelectItem>}
                  </HSelect>
                )}
                {formRole === "CLASS_TEACHER" && (
                  <HSelect
                    label={t("linkedClassLabel")}
                    labelPlacement="outside"
                    selectedKeys={[formClassId]}
                    onSelectionChange={(keys) => {
                      const val = Array.from(keys)[0] as string;
                      if (val) setFormClassId(val);
                    }}
                    variant="bordered"
                    classNames={{ label: "text-v-text2 font-medium", trigger: "border-v-border-input bg-v-input pe-8", value: "text-v-text2 truncate", selectorIcon: "text-v-text3 shrink-0 end-2 absolute", popoverContent: "bg-v-card border border-v-border shadow-xl rounded-xl", listbox: "text-v-text1" }}
                    items={[{ id: "none", name: t("none") }, ...classes.map((c) => ({ id: c.id, name: c.name }))]}
                  >
                    {(item) => <HSelectItem key={item.id}>{item.name}</HSelectItem>}
                  </HSelect>
                )}
              </ModalBody>
              <ModalFooter>
                <HButton variant="bordered" className="border-v-border-input text-v-text3" onPress={onClose}>{tc("cancel")}</HButton>
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
                <HButton variant="bordered" className="border-v-border-input text-v-text3" isDisabled={deleteLoading} onPress={onClose}>{tc("cancel")}</HButton>
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
