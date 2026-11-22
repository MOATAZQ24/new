"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import {
  Printer,
  Wrench,
  Laptop,
  CheckSquare,
  Calendar,
  ChevronLeft,
  Mic,
  Check,
  AlertTriangle,
} from "lucide-react";

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
    department_name?: string;
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

function getCategoryIcon(task: { title: string; description?: string }) {
  const t = (task.title + " " + (task.description || "")).toLowerCase();
  if (t.includes("طابع") || t.includes("print")) return Printer;
  if (t.includes("صيان") || t.includes("طلب") || t.includes("maint")) return Wrench;
  if (
    t.includes("جهاز") ||
    t.includes("حاسب") ||
    t.includes("لابتوب") ||
    t.includes("برامج") ||
    t.includes("software") ||
    t.includes("تحديث")
  )
    return Laptop;
  return CheckSquare;
}

export function MobileTaskCard({
  task,
  onClick,
  onPlayVoice,
}: MobileTaskCardProps) {
  // Status Meta matching Reference Images (قيد التنفيذ, بانتظار القبول, مكتملة)
  const getStatusMeta = () => {
    const s = (task.status || "").toLowerCase();
    if (s.includes("complet") || s.includes("مكتمل") || s.includes("done")) {
      return {
        label: "مكتملة",
        pillClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
        dotClass: "bg-emerald-500",
        isComplete: true,
      };
    }
    if (
      s.includes("wait") ||
      s.includes("new") ||
      s.includes("assign") ||
      s.includes("قبول") ||
      s.includes("معلق") ||
      s.includes("مفتوح")
    ) {
      return {
        label: "بانتظار القبول",
        pillClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
        dotClass: "bg-amber-500",
        isComplete: false,
      };
    }
    return {
      label: "قيد التنفيذ",
      pillClass: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
      dotClass: "bg-sky-500",
      isComplete: false,
    };
  };

  const statusMeta = getStatusMeta();

  // Format Due Date (اليوم, غداً, or formatted date)
  const formatFriendlyDate = (dateStr?: string | null) => {
    if (!dateStr) return "اليوم";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return "اليوم";
    if (diffDays === 1) return "غداً";
    if (diffDays === -1) return "أمس";
    return d.toLocaleDateString("ar-SA", { day: "numeric", month: "long" });
  };

  const friendlyDate = formatFriendlyDate(task.due_date);
  const subtitle =
    task.department_name || task.assigned_to_name || "قسم العمليات";

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xs p-4 hover:border-primary/40 transition active:scale-[0.99] cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Right side (RTL): Category Icon + Title + Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
            {React.createElement(getCategoryIcon(task), { size: 20, strokeWidth: 2.2 })}
          </div>

          <div className="min-w-0 text-right">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {task.title}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5 font-medium">
              {subtitle}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              <Calendar size={13} className="shrink-0 text-slate-400" />
              <span>{friendlyDate}</span>
              {task.reference && (
                <span dir="ltr" className="font-mono text-[10px] text-slate-400 px-1 bg-slate-50 dark:bg-slate-800 rounded">
                  #{task.reference}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Left side (RTL): Status pill with colored dot + Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusMeta.pillClass}`}
          >
            {statusMeta.isComplete ? (
              <Check size={12} strokeWidth={3} className="shrink-0" />
            ) : (
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dotClass}`} />
            )}
            <span>{statusMeta.label}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>

      {/* Voice task waveform / audio indicator if voice task */}
      {task.is_voice_task && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onPlayVoice) onPlayVoice();
            else onClick();
          }}
          className="bg-primary/[0.06] dark:bg-primary/15 border border-primary/20 rounded-xl px-3 py-2 flex items-center justify-between gap-2 mt-2"
        >
          <div className="flex items-center gap-2 text-primary font-bold text-xs">
            <Mic size={15} />
            <span>مهمة صوتية مسجلة</span>
            {task.voice_note_duration ? (
              <span className="text-[11px] opacity-80 font-mono">
                ({task.voice_note_duration} ث)
              </span>
            ) : null}
          </div>
          <span className="text-[10px] font-bold text-primary underline">تشغيل</span>
        </div>
      )}

      {/* Blocker alert if blocked */}
      {task.is_blocked && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="truncate">{task.blocker_reason || "المهمة متوقفة لوجود عائق"}</span>
        </div>
      )}
    </div>
  );
}
