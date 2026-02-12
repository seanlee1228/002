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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, School } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: number;
  teacherNames?: string[];
}

const gradeLabels: Record<number, string> = {
  1: "一年级",
  2: "二年级",
  3: "三年级",
  4: "四年级",
  5: "五年级",
  6: "六年级",
  7: "七年级",
  8: "八年级",
  9: "九年级",
};

export default function ClassesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
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
          throw new Error(err.error || `请求失败: ${res.status}`);
        }
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        setClasses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [status, hasAccess]);

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
        throw new Error(err.error || `请求失败: ${res.status}`);
      }
      const updated = await res.json();
      if (editingId) {
        setClasses((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, ...updated } : c))
        );
      } else {
        setClasses((prev) => [...prev, updated]);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "操作失败");
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
      const res = await fetch(`/api/classes/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `删除失败: ${res.status}`);
      }
      setClasses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "删除失败");
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

  const sortedGrades = Object.keys(groupedByGrade)
    .map(Number)
    .sort((a, b) => a - b);

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
          {session?.user?.role === "GRADE_LEADER"
            ? `${session?.user?.managedGrade}年级班级管理`
            : "班级管理"}
        </h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          新增班级
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <School className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">暂无班级，请点击上方按钮新增</p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新增班级
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedGrades.map((grade) => (
            <div key={grade}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {gradeLabels[grade] || `${grade}年级`}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedByGrade[grade]
                  ?.sort((a, b) => a.section - b.section)
                  .map((cls) => (
                    <Card key={cls.id} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{cls.name}</CardTitle>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(cls)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDelete(cls)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground">
                          年级: {grade} · 班级: {cls.section}
                        </p>
                        {cls.teacherNames && cls.teacherNames.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            班主任: {cls.teacherNames.join("、")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑班级" : "新增班级"}</DialogTitle>
            <DialogDescription>
              {editingId ? "修改班级信息" : "填写新班级信息"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">班级名称</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：一年级1班"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">年级</Label>
              <Input
                id="grade"
                type="number"
                min={1}
                max={9}
                value={formGrade}
                onChange={(e) => setFormGrade(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section">班级编号</Label>
              <Input
                id="section"
                type="number"
                min={1}
                value={formSection}
                onChange={(e) => setFormSection(Number(e.target.value) || 1)}
              />
            </div>
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
              确定要删除班级「{deleteTarget?.name}」吗？此操作将同时删除该班级的所有评分记录，且不可恢复。
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
