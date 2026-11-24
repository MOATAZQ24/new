"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect, useRef } from "react";
import { TaskChecklistPanel } from "@/components/work-management/TaskChecklistPanel";
import {
  X,
  Maximize2,
  MoreHorizontal,
  Link as LinkIcon,
  Flame,
  Clock,
  Calendar,
  Building,
  User,
  Paperclip,
  FileText,
  Play,
  Pause,
  MessageSquare,
  Edit3,
  CheckCircle2,
  ChevronDown,
  Volume2,
} from "lucide-react";

export interface SplitDrawerTask {
  id: string;
  reference?: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  department?: string;
  category?: string;
  assigned_to_name?: string;
  assigned_to_avatar?: string;
  assigned_by_name?: string;
  created_at: string;
  due_date?: string;
  target_duration_minutes?: number;
  remaining_seconds?: number;
  voice_note_url?: string;
  voice_note_duration?: number;
  is_voice_task?: boolean;
  comments_count?: number;
  attachments_count?: number;
  activities?: {
    id: string;
    action: string;
    user: string;
    time: string;
    type: "create" | "assign" | "start" | "complete" | "comment";
  }[];
}

interface TasksSplitDrawerProps {
  task: SplitDrawerTask | null;
  onClose: () => void;
  onMaximize?: () => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onOpenComment: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onCopyLink?: (taskId: string) => void;
  className?: string;
}

export function TasksSplitDrawer({
  task,
  onClose,
  onMaximize,
  onStatusChange,
  onOpenComment,
  onEdit,
  onCopyLink,
  className = "",
}: TasksSplitDrawerProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>("00:14:32");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live countdown ticker
  useEffect(() => {
    if (!task) return;

    const calculateRemaining = () => {
      if (task.status === "Completed" || task.status === "Approved / Completed") {
        return "تم الإنجاز";
      }

      if (task.due_date) {
        const dueTime = new Date(task.due_date).getTime();
        const now = new Date().getTime();
        const diff = dueTime - now;

        if (diff <= 0) return "متأخرة عن الموعد";

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours >= 24) {
          const days = Math.floor(hours / 24);
          return `${days} أيام`;
        }

        const hh = String(hours).padStart(2, "0");
        const mm = String(mins).padStart(2, "0");
        const ss = String(secs).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      }

      return "00:14:32";
    };

    const animId = requestAnimationFrame(() => setRemainingTime(calculateRemaining()));
    const interval = setInterval(() => {
      setRemainingTime(calculateRemaining());
    }, 1000);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(interval);
    };
  }, [task]);

  if (!task) return null;

  const priorityLabelMap: Record<string, { label: string; color: string; flame?: boolean }> = {
    Critical: { label: "حرج جداً", color: "text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800", flame: true },
    Urgent: { label: "عاجل", color: "text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800", flame: true },
    High: { label: "مرتفع", color: "text-blue-800 bg-blue-50 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" },
    Medium: { label: "متوسط", color: "text-slate-800 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
    Low: { label: "منخفض", color: "text-slate-700 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  };

  const currentPriority = priorityLabelMap[task.priority] || {
    label: task.priority || "متوسط",
    color: "text-slate-800 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  };

  const statusLabelMap: Record<string, { label: string; dot: string }> = {
    Draft: { label: "مسودة", dot: "bg-slate-400" },
    Assigned: { label: "بانتظار القبول", dot: "bg-indigo-500" },
    Accepted: { label: "تم القبول", dot: "bg-blue-500" },
    "In Progress": { label: "قيد التنفيذ", dot: "bg-blue-600" },
    Blocked: { label: "معلّق لوجود عائق", dot: "bg-rose-500" },
    Completed: { label: "مكتملة", dot: "bg-sky-500" },
  };

  const currentStatus = statusLabelMap[task.status] || {
    label: task.status || "قيد التنفيذ",
    dot: "bg-sky-500",
  };

  // Mock audio toggle
  const togglePlayAudio = () => {
    setIsPlayingAudio(!isPlayingAudio);
  };

  return (
    <div
      dir="rtl"
      className={`w-full bg-card border border-border/80 rounded-2xl shadow-xs flex flex-col h-full overflow-hidden text-right transition-all animate-in fade-in duration-200 ${className}`}
    >
      {/* 1. Header Toolbar (Reference 2) */}
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            title="إغلاق اللوحة الجانبية"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={onMaximize}
            title="توسيع للوضع الكامل"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            title="خيارات إضافية"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>

        {/* Task Code Badge with Link */}
        <button
          type="button"
          onClick={() => onCopyLink?.(task.id)}
          title="نسخ رمز المهمة"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition cursor-pointer"
        >
          <span>{task.reference || `TASK-${task.id.slice(0, 6)}`}</span>
          <LinkIcon size={12} className="text-slate-400" />
        </button>
      </div>

      {/* 2. Scrollable Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title & Description */}
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 leading-snug">
            {currentPriority.flame && (
              <Flame size={16} className="text-rose-500 shrink-0" />
            )}
            <span>{task.title}</span>
          </h2>
          {task.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Department & Operational Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 dark:bg-primary/20 text-primary border border-primary/20">
              {task.department || "تقنية المعلومات"}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {task.category || "تشغيلي"}
            </span>
          </div>
        </div>

        {/* Interactive Task Checklist */}
        <TaskChecklistPanel taskId={task.id} />

        {/* 3. Live Countdown & Priority Box (Reference 2) */}
        <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                الوقت المتبقي
              </span>
              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-mono font-black text-xl">
                <span>{remainingTime}</span>
                <Clock size={16} strokeWidth={2.5} />
              </div>
            </div>

            <div className="text-left">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                الأولوية
              </span>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                <Flame size={14} className="text-rose-500" />
                <span>{currentPriority.label}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-rose-200/50 dark:border-rose-900/30">
            ينتهي {task.due_date ? `اليوم ${task.due_date.slice(11, 16) || "11:00 ص"}` : "اليوم 11:00 ص"}
          </div>
        </div>

        {/* 4. Metadata Details Grid */}
        <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5 text-xs">
          {/* المسند إليه */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <User size={14} />
              <span>المسند إليه</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {task.assigned_to_name || "أحمد الحربي"}
              </span>
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {task.assigned_to_name ? task.assigned_to_name[0] : "أ"}
              </div>
            </div>
          </div>

          {/* الحالة */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock size={14} />
              <span>الحالة</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold text-sky-700 dark:text-sky-300">
              <span className={`w-2 h-2 rounded-full ${currentStatus.dot}`} />
              <span>{currentStatus.label}</span>
            </span>
          </div>

          {/* الموعد النهائي */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Calendar size={14} />
              <span>الموعد النهائي</span>
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              اليوم، 11:00 ص
            </span>
          </div>

          {/* تاريخ الإسناد */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Calendar size={14} />
              <span>تاريخ الإسناد</span>
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              اليوم، 10:00 ص
            </span>
          </div>

          {/* الإدارة / القسم */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Building size={14} />
              <span>الإدارة / القسم</span>
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {task.department || "تقنية المعلومات"}
            </span>
          </div>
        </div>

        {/* 5. Attachments Section (المرفقات 2) (Reference 2) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
            <span className="flex items-center gap-1.5">
              <Paperclip size={14} className="text-primary" />
              <span>المرفقات (2)</span>
            </span>
          </div>

          {/* Audio Waveform Attachment Player */}
          <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={togglePlayAudio}
                className="w-9 h-9 rounded-xl bg-primary hover:opacity-90 text-primary-foreground flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-xs"
                title={isPlayingAudio ? "إيقاف مؤقت" : "تشغيل التسجيل الصوتي"}
              >
                {isPlayingAudio ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  وصف العطل صوتي.mp3
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  1.2 MB
                </div>
              </div>
            </div>

            {/* Waveform graphic visualization */}
            <div className="flex items-center gap-1">
              <div className="text-[11px] font-mono font-bold text-primary">
                02:48
              </div>
              <div className="flex items-center gap-0.5 h-5 px-1">
                {[12, 18, 8, 20, 14, 16, 22, 10, 18, 14, 8, 16].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`w-1 rounded-full transition-all duration-300 ${
                      isPlayingAudio
                        ? "bg-primary animate-pulse"
                        : "bg-primary/30 dark:bg-primary/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Document PDF Attachment */}
          <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  سجل الأعطال والخادم.pdf
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  840 KB
                </div>
              </div>
            </div>
            <a
              href="#download"
              onClick={(e) => {
                e.preventDefault();
                alert("جاري تحميل الملف...");
              }}
              className="text-xs font-semibold text-primary hover:underline shrink-0"
            >
              تحميل
            </a>
          </div>
        </div>

        {/* 6. Activity Timeline (سجل النشاط) (Reference 2) */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Clock size={14} className="text-primary" />
            <span>سجل النشاط</span>
          </div>

          <div className="relative border-r-2 border-primary/20 dark:border-primary/30 mr-2 pr-4 space-y-4">
            {/* 1. بدء التنفيذ */}
            <div className="relative">
              <div className="absolute -right-[23px] top-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] ring-4 ring-white dark:ring-slate-900">
                <Play size={8} className="fill-current mr-0.5" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  تم بدء التنفيذ
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  أحمد الحربي — اليوم 10:03 ص
                </div>
              </div>
            </div>

            {/* 2. إسناد المهمة */}
            <div className="relative">
              <div className="absolute -right-[23px] top-0.5 w-4 h-4 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center text-[9px] ring-4 ring-white dark:ring-slate-900">
                <User size={9} />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  تم إسناد المهمة
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  صدام العامري — اليوم 10:00 ص
                </div>
              </div>
            </div>

            {/* 3. إنشاء المهمة */}
            <div className="relative">
              <div className="absolute -right-[23px] top-0.5 w-4 h-4 rounded-full bg-primary/60 text-primary-foreground flex items-center justify-center text-[9px] ring-4 ring-white dark:ring-slate-900">
                +
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  تم إنشاء المهمة
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  صدام العامري — اليوم 09:58 ص
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Sticky Bottom Action Toolbar (Reference 2) */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
        {/* Status Dropdown Trigger */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className="w-full bg-primary hover:opacity-90 text-primary-foreground px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors shadow-xs cursor-pointer"
          >
            <span>تحديث الحالة</span>
            <ChevronDown size={14} className={statusMenuOpen ? "rotate-180" : ""} />
          </button>

          {statusMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-right">
              {[
                { key: "Accepted", label: "قبول المهمة (Accepted)" },
                { key: "In Progress", label: "بدء التنفيذ (In Progress)" },
                { key: "Submitted for Review", label: "مرفوع للمراجعة (Review)" },
                { key: "Completed", label: "اعتماد وإكمال (Completed)" },
                { key: "Blocked", label: "معلّق لوجود معوق (Blocked)" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => {
                    onStatusChange(task.id, st.key);
                    setStatusMenuOpen(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-primary/10 dark:hover:bg-primary/20 hover:text-primary cursor-pointer"
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comment Action Button */}
        <button
          type="button"
          onClick={() => onOpenComment(task.id)}
          title="إضافة تعليق"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        >
          <MessageSquare size={16} />
        </button>

        {/* Edit Pencil Button */}
        <button
          type="button"
          onClick={() => onEdit(task.id)}
          title="تعديل تفاصيل المهمة"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        >
          <Edit3 size={16} />
        </button>

        {/* More Actions Button */}
        <button
          type="button"
          title="خيارات إضافية"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}
