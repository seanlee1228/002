"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ClipboardCheck, Loader2 } from "lucide-react";

interface InspectionItem {
  id: string;
  title: string;
  description: string | null;
  maxScore: number;
  date: string;
  targetGrade: number | null;
  _count: { scores: number };
}

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function InspectionPage() {
  const { data: session, status } = useSession();
  const [date, setDate] = useState(() => formatDate(new Date()));
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMaxScore, setFormMaxScore] = useState(10);
  const [formDate, setFormDate] = useState(() => formatDate(new Date()));
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inspection?date=${date}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "加载失败");
      }
      const data = await res.json();
      setItems(data);
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "加载失败" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") return;
    fetchItems();
  }, [status, date]);

  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormMaxScore(10);
    setFormDate(date);
    setDialogOpen(true);
  };

  const openEditDialog = (item: InspectionItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormDescription(item.description ?? "");
    setFormMaxScore(item.maxScore);
    setFormDate(item.date);
    setDialogOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showAlert("error", "请输入标题");
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
            maxScore: formMaxScore,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "更新失败");
        }
        showAlert("success", "更新成功");
      } else {
        const res = await fetch("/api/inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
            maxScore: formMaxScore,
            date: formDate,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "创建失败");
        }
        showAlert("success", "创建成功");
      }
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : "操作失败");
    } finally {
      setFormSubmitting(false);
    }
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/inspection/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "删除失败");
      }
      showAlert("success", "删除成功");
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchItems();
    } catch (err) {
      showAlert("error", err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-blue-600" />
          检查项管理
        </h1>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新增检查项
        </Button>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-4">
        <Label htmlFor="date-filter" className="text-sm font-medium">
          日期
        </Label>
        <Input
          id="date-filter"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={`px-4 py-3 rounded-lg ${
            alert.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">
              该日期暂无检查项
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              点击「新增检查项」创建今日检查项
            </p>
            <Button onClick={openCreateDialog} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              新增检查项
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="transition-shadow hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <CardTitle className="text-base font-semibold">
                  {item.title}
                </CardTitle>
                <div className="flex gap-1.5 flex-shrink-0">
                  {item.targetGrade != null ? (
                    <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50 text-xs">
                      {item.targetGrade}年级专属
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">
                      全校
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    满分 {item.maxScore}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    已评分 {item._count.scores} 次
                  </span>
                  {/* GRADE_LEADER 只能编辑/删除自己年级的专属项 */}
                  {(session?.user?.role === "ADMIN" ||
                    (session?.user?.role === "GRADE_LEADER" &&
                      item.targetGrade != null &&
                      item.targetGrade === session?.user?.managedGrade)) && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeleteDialog(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑检查项" : "新增检查项"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-title">标题 *</Label>
              <Input
                id="form-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="请输入标题"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-description">描述</Label>
              <Textarea
                id="form-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="可选"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-maxScore">满分</Label>
              <Input
                id="form-maxScore"
                type="number"
                min={1}
                max={100}
                value={formMaxScore}
                onChange={(e) => setFormMaxScore(Number(e.target.value))}
              />
            </div>
            {!editingId && (
              <div className="space-y-2">
                <Label htmlFor="form-date">日期</Label>
                <Input
                  id="form-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </DialogClose>
              <Button type="submit" disabled={formSubmitting}>
                {formSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {editingId ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            确定要删除该检查项吗？删除后相关评分记录也将被移除。
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
