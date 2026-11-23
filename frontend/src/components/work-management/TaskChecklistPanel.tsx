"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import { workApi, type TaskChecklistItem } from "@/lib/workApi";
import { useToast } from "@/context/ToastContext";

interface TaskChecklistPanelProps {
  taskId: string;
}

export function TaskChecklistPanel({ taskId }: TaskChecklistPanelProps) {
  const toast = useToast();
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workApi.listChecklist(taskId);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await workApi.addChecklistItem(taskId, newTitle.trim());
      setItems((prev) => [...prev, res.data]);
      setNewTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إضافة العنصر");
    }
  };

  const handleToggle = async (item: TaskChecklistItem) => {
    const nextVal = !item.is_completed;
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_completed: nextVal } : x)));
    try {
      await workApi.updateChecklistItem(taskId, item.id, { is_completed: nextVal });
    } catch (err) {
      // Rollback optimistic toggle
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_completed: !nextVal } : x)));
      toast.error(err instanceof Error ? err.message : "تعذر تحديث العنصر");
    }
  };

  const handleDelete = async (itemId: string) => {
    const prev = items;
    setItems((cur) => cur.filter((x) => x.id !== itemId));
    try {
      await workApi.deleteChecklistItem(taskId, itemId);
    } catch (err) {
      setItems(prev);
      toast.error(err instanceof Error ? err.message : "تعذر حذف العنصر");
    }
  };

  const completed = items.filter((i) => i.is_completed).length;
  const pct = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="space-y-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/25">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-[var(--foreground)]">قائمة التحقق ({completed}/{items.length})</span>
        <span className="text-[11px] font-mono text-[var(--muted-foreground)]">{pct}%</span>
      </div>

      {items.length > 0 && (
        <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="h-10 rounded bg-[var(--muted)] animate-pulse" />
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)]/60">
              <button
                type="button"
                onClick={() => void handleToggle(item)}
                className="flex items-center gap-2 text-start flex-1 min-w-0 cursor-pointer"
              >
                {item.is_completed ? (
                  <CheckSquare className="w-4 h-4 text-[var(--primary)] shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
                )}
                <span className={item.is_completed ? "line-through text-[var(--muted-foreground)] truncate" : "truncate"}>
                  {item.title}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                className="p-1 text-[var(--muted-foreground)] hover:text-red-600 cursor-pointer"
                aria-label="حذف عنصر"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-1.5">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="إضافة خطوة جديدة..."
          className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة</span>
        </button>
      </form>
    </div>
  );
}
