"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";

type UserRole = "ADMIN" | "GRADE_LEADER" | "DUTY_TEACHER" | "CLASS_TEACHER";

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

const roleLabels: Record<UserRole, string> = {
  ADMIN: "管理员",
  GRADE_LEADER: "年级负责人",
  DUTY_TEACHER: "值日老师",
  CLASS_TEACHER: "班主任",
};

const roleBadgeClasses: Record<UserRole, string> = {
  ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  GRADE_LEADER: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DUTY_TEACHER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CLASS_TEACHER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
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

  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("CLASS_TEACHER");
  const [formClassId, setFormClassId] = useState<string>("");
  const [formManagedGrade, setFormManagedGrade] = useState<string>("none");

  const isAdmin = session?.user?.role === "ADMIN";
  const isGradeLeader = session?.user?.role === "GRADE_LEADER";
  const hasAccess = isAdmin || isGradeLeader;

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
          throw new Error(err.error || `请求失败: ${res.status}`);
        }
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [status, hasAccess]);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (!hasAccess) return;

    fetch("/api/classes")
      .then((res) => res.json())
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, [status, hasAccess]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !hasAccess) {
      router.push("/");
    }
  }, [status, hasAccess, router]);

  // GRADE_LEADER 可以编辑/删除的用户
  const canEditTargetUser = (target: UserItem) => {
    if (isAdmin) return true;
    if (isGradeLeader) {
      // 不可操作自身
      if (target.id === session?.user?.id) return false;
      // 不可操作 ADMIN 或其他 GRADE_LEADER
      if (target.role === "ADMIN" || target.role === "GRADE_LEADER") return false;
      return true;
    }
    return false;
  };

  // GRADE_LEADER 可选的角色
  const availableRoles: { value: UserRole; label: string }[] = isAdmin
    ? [
        { value: "ADMIN", label: "管理员" },
        { value: "GRADE_LEADER", label: "年级负责人" },
        { value: "DUTY_TEACHER", label: "值日老师" },
        { value: "CLASS_TEACHER", label: "班主任" },
      ]
    : [
        { value: "DUTY_TEACHER", label: "值日老师" },
        { value: "CLASS_TEACHER", label: "班主任" },
      ];

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormUsername("");
    setFormPassword("");
    setFormRole(isGradeLeader ? "CLASS_TEACHER" : "CLASS_TEACHER");
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
        if (!formPassword.trim()) throw new Error("创建用户时密码为必填项");
        body.password = formPassword;
      } else if (formPassword.trim()) {
        body.password = formPassword;
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `请求失败: ${res.status}`);
      }
      const updated = await res.json();
      if (editingId) {
        setUsers((prev) =>
          prev.map((u) => (u.id === editingId ? { ...u, ...updated } : u))
        );
      } else {
        setUsers((prev) => [...prev, updated]);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "操作失败");
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
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `删除失败: ${res.status}`);
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载中...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isGradeLeader ? `${session?.user?.managedGrade}年级用户管理` : "用户管理"}
        </h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          新增用户
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            重试
          </Button>
        </div>
      )}

      {formError && deleteDialogOpen && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive">{formError}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">暂无用户，请点击上方按钮新增</p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新增用户
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>关联班级/年级</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={roleBadgeClasses[user.role]}
                      >
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(user.role === "GRADE_LEADER" || user.role === "DUTY_TEACHER") && user.managedGrade
                        ? `${user.managedGrade}年级`
                        : user.class?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditTargetUser(user) ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(user)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDelete(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            删除
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑用户" : "新增用户"}</DialogTitle>
            <DialogDescription>
              {editingId ? "修改用户信息" : "填写新用户信息"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="请输入姓名"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="请输入用户名"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                密码 {editingId && "(留空则不修改)"}
              </Label>
              <Input
                id="password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingId ? "留空则不修改" : "请输入密码"}
                required={!editingId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(formRole === "GRADE_LEADER" || formRole === "DUTY_TEACHER") && (
              <div className="space-y-2">
                <Label htmlFor="managedGrade">
                  {formRole === "GRADE_LEADER" ? "负责年级" : "归属年级"}
                </Label>
                <Select value={formManagedGrade} onValueChange={setFormManagedGrade}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择年级" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    <SelectItem value="1">1年级</SelectItem>
                    <SelectItem value="2">2年级</SelectItem>
                    <SelectItem value="3">3年级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {formRole === "CLASS_TEACHER" && (
              <div className="space-y-2">
                <Label htmlFor="classId">关联班级</Label>
                <Select value={formClassId} onValueChange={setFormClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择班级（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除用户「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
