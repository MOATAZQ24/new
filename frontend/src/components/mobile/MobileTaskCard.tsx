"use client";

import React from "react";
import {
  Mic,
  Calendar,
  AlertTriangle,
  RotateCcw,
  User,
  ChevronLeft,
  Volume2,
} from "lucide-react";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";

interface MobileTaskCardProps {
  task: {
    id: string;
    reference?: string;
    title: string;
    description?: string;
    priority: string;
    status: string;
    stage_label?: string;
    assigned_to_name?: string;
    due_date?: string | null;
    is_voice_task?: boolean;
    voice_note_duration?: number;
    voice_note_url?: string;
    is_blocked?: boolean;
    blocker_reason?: string;
    is_overdue?: boolean;
    rework_count?: number;
  };
  onClick: () => void;
  onPlayVoice?: () => void;
}

export function MobileTaskCard({
  task,
  onClick,
  onPlayVoice,
}: MobileTaskCardProps) {
  const formattedDueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString("ar-SA", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-4 shadow-2xs hover:border-[#187A5A] transition active:scale-[0.99] cursor-pointer space-y-3"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Top Bar: Reference + Stage + Badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {task.reference && (
            <span
              dir="ltr"
              className="font-mono font-bold text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg"
            >
              #{task.reference}
            </span>
          )}
          {task.stage_label && (
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-lg">
              {task.stage_label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </div>

      {/* Voice Note Banner (if voice task) */}
      {task.is_voice_task && (
        <div className="bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Mic size={15} />
            </span>
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              مهمة صوتية مسجلة
              {task.voice_note_duration ? (
                <span className="text-[11px] font-normal text-emerald-700 dark:text-emerald-300 mr-1.5">
                  ({task.voice_note_duration} ثانية)
                </span>
              ) : null}
            </div>
          </div>

          {task.voice_note_url && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onPlayVoice) onPlayVoice();
                else onClick();
              }}
              className="px-3 py-1.5 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition shadow-2xs cursor-pointer"
            >
              <Volume2 size={13} />
              <span>استماع</span>
            </button>
          )}
        </div>
      )}

      {/* Overdue / Blocked / Rework alert tags */}
      {(task.is_overdue || task.is_blocked || (task.rework_count && task.rework_count > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.is_overdue && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
              <AlertTriangle size={12} />
              <span>متأخرة عن الموعد المحدد</span>
            </span>
          )}

          {task.is_blocked && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <AlertTriangle size={12} />
              <span>معلّق: {task.blocker_reason || "بانتظار طرف خارجي"}</span>
            </span>
          )}

          {task.rework_count && task.rework_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300">
              <RotateCcw size={12} />
              <span>جولة تعديل #{task.rework_count}</span>
            </span>
          )}
        </div>
      )}

      {/* Task Title & Description Preview */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
          {task.title}
        </h3>
        {task.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}
      </div>

      {/* Footer: Assignee & Due Date & Chevron */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <User size={13} className="text-slate-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
              {task.assigned_to_name || "غير مسندة"}
            </span>
          </div>

          {formattedDueDate && (
            <div
              className={`flex items-center gap-1 font-medium ${
                task.is_overdue
                  ? "text-rose-600 dark:text-rose-400 font-bold"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Calendar size={12} />
              <span>{formattedDueDate}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[#187A5A] dark:text-emerald-400 font-bold">
          <span>التفاصيل</span>
          <ChevronLeft size={14} />
        </div>
      </div>
    </div>
  );
}
