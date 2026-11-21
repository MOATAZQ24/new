/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState } from "react";
import {
  Clock,
  User,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Mic,
  AlertCircle,
  CheckCircle2,
  Flame,
  Zap,
} from "lucide-react";

export interface KanbanTaskItem {
  id: string;
  reference?: string;
  title: string;
  description?: string;
  assigned_to_name?: string;
  priority: string;
  status: string;
  due_date?: string;
  is_voice_task?: boolean;
  comments_count?: number;
}

interface TaskKanbanViewProps {
  tasks: KanbanTaskItem[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => Promise<void>;
  className?: string;
}

const KANBAN_STAGES = [
  { id: "Assigned", label: "بانتظار القبول", color: "border-amber-500/40 bg-amber-500/5", dot: "bg-amber-500" },
  { id: "In Progress", label: "قيد التنفيذ", color: "border-sky-500/40 bg-sky-500/5", dot: "bg-sky-500" },
  { id: "Blocked", label: "معلّقة / عائق", color: "border-rose-500/40 bg-rose-500/5", dot: "bg-rose-500" },
  { id: "Completed", label: "مكتملة ومغلقة", color: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-500" },
];

export function TaskKanbanView({
  tasks,
  selectedTaskId,
  onSelectTask,
  onStatusChange,
  className = "",
}: TaskKanbanViewProps) {
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMove = async (taskId: string, currentStatus: string, direction: "next" | "prev") => {
    const currentIndex = KANBAN_STAGES.findIndex((s) => s.id === currentStatus);
    if (currentIndex === -1) return;

    const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= KANBAN_STAGES.length) return;

    const targetStatus = KANBAN_STAGES[targetIndex].id;
    try {
      setMovingId(taskId);
      await onStatusChange(taskId, targetStatus);
    } finally {
      setMovingId(null);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "Critical":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
            <Flame className="w-3 h-3 text-rose-500 animate-pulse" /> حرج جداً
          </span>
        );
      case "Urgent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <Zap className="w-3 h-3 text-amber-500" /> عاجل
          </span>
        );
      case "High":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20">
            مرتفع
          </span>
        );
      case "Low":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            منخفض
          </span>
        );
      case "Medium":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
            متوسط
          </span>
        );
    }
  };

  return (
    <div className={`w-full overflow-x-auto pb-4 ${className}`}>
      <div className="flex gap-4 min-w-[1000px] items-start">
        {KANBAN_STAGES.map((col, colIdx) => {
          const colTasks = tasks.filter((t) => {
            if (col.id === "Completed") {
              return t.status === "Completed" || t.status === "Approved / Completed";
            }
            if (col.id === "Assigned") {
              return t.status === "Assigned" || t.status === "Draft";
            }
            return t.status === col.id;
          });

          return (
            <div
              key={col.id}
              className={`flex-1 min-w-[240px] max-w-[320px] rounded-2xl border ${col.color} flex flex-col max-h-[700px] shadow-2xs overflow-hidden`}
            >
              {/* Stage Header */}
              <div className="p-3.5 border-b border-border/60 flex items-center justify-between bg-card/60 backdrop-blur-xs">
                <span className="w-6 h-6 rounded-full bg-card border border-border text-xs font-black flex items-center justify-center text-foreground">
                  {colTasks.length}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h3 className="text-xs font-extrabold text-foreground">{col.label}</h3>
                </div>
              </div>

              {/* Tasks List Container */}
              <div className="p-2.5 flex-1 overflow-y-auto space-y-2.5">
                {colTasks.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground/60">
                    لا توجد مهام في هذه المرحلة
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const isSelected = selectedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className={`bg-card border rounded-xl p-3 shadow-2xs hover:shadow-md transition text-right space-y-2.5 cursor-pointer ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-border/80 hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {task.reference || "مهمة"}
                          </span>
                          {getPriorityBadge(task.priority)}
                        </div>

                        <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-relaxed">
                          {task.title}
                        </h4>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                          <span className="flex items-center gap-1 truncate max-w-[140px]">
                            <User className="w-3 h-3 text-primary shrink-0" />
                            <span className="truncate">{task.assigned_to_name || "غير محدد"}</span>
                          </span>

                          <div className="flex items-center gap-2 shrink-0">
                            {task.is_voice_task && (
                              <span title="مهمة صوتية">
                                <Mic className="w-3 h-3 text-primary" />
                              </span>
                            )}
                            {task.comments_count ? (
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="w-3 h-3" />
                                <span>{task.comments_count}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Bottom Row: Quick Status Controls */}
                        <div
                          className="flex items-center justify-between pt-1 border-t border-border/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {task.due_date ? new Date(task.due_date).toLocaleDateString("ar-EG") : "مفتوحة"}
                          </span>

                          <div className="flex items-center gap-1">
                            {colIdx > 0 && (
                              <button
                                type="button"
                                disabled={movingId === task.id}
                                onClick={() => handleMove(task.id, task.status, "prev")}
                                title="المرحلة السابقة"
                                className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            {colIdx < KANBAN_STAGES.length - 1 && (
                              <button
                                type="button"
                                disabled={movingId === task.id}
                                onClick={() => handleMove(task.id, task.status, "next")}
                                title="المرحلة التالية"
                                className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TaskKanbanView;
