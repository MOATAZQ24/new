"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect } from "react";
import { TaskChecklistPanel } from "@/components/work-management/TaskChecklistPanel";
import VoiceTaskPlayer from "@/components/tasks/VoiceTaskPlayer";
import {
  X,
  Maximize2,
  Link as LinkIcon,
  Flame,
  Clock,
  Calendar,
  Building,
  User,
  Paperclip,
  FileText,
  Play,
  MessageSquare,
  Edit3,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

export interface SplitDrawerAttachment {
  name?: string;
  url?: string;
  size?: string | number;
  is_image?: boolean;
  stage?: string;
}

export interface SplitDrawerComment {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export interface SplitDrawerTask {
  id: string;
  reference?: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  department?: string;
  team_name?: string;
  category?: string;
  assigned_to_name?: string;
  assigned_to_avatar?: string;
  assigned_by_name?: string;
  reviewer_name?: string;
  created_at: string;
  due_date?: string;
  resolution_due_at?: string;
  accepted_at?: string;
  acknowledged_at?: string;
  submitted_for_review_at?: string;
  completed_at?: string;
  blocked_at?: string;
  blocker_reason?: string;
  related_asset_name?: string;
  related_ticket_number?: string;
  target_duration_minutes?: number;
  remaining_seconds?: number;
  voice_note_url?: string;
  voice_note_duration?: number;
  is_voice_task?: boolean;
  comments_count?: number;
  comments?: SplitDrawerComment[];
  attachments?: SplitDrawerAttachment[] | string[] | null;
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
  onAttachFile?: (taskId: string, file: File, advanceToNextStage?: boolean) => Promise<void> | void;
  uploadingAttachment?: boolean;
  className?: string;
}

function formatArabicDateTime(iso?: string | null): string {
  if (!iso) return "غير محدد";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TasksSplitDrawer({
  task,
  onClose,
  onMaximize,
  onStatusChange,
  onOpenComment,
  onEdit,
  onCopyLink,
  onAttachFile,
  uploadingAttachment = false,
  className = "",
}: TasksSplitDrawerProps) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>("غير محدد");
  const [advanceOnUpload, setAdvanceOnUpload] = useState(false);
  const drawerFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const effectiveDueDate = task?.due_date || task?.resolution_due_at;

  // Live countdown ticker
  useEffect(() => {
    if (!task) return;

    const calculateRemaining = () => {
      if (task.status === "Completed" || task.status === "Approved / Completed" || task.status === "Done") {
        return "تم الإنجاز";
      }

      const targetIso = task.due_date || task.resolution_due_at;
      if (targetIso) {
        const dueTime = new Date(targetIso).getTime();
        if (Number.isNaN(dueTime)) return "غير محدد";
        const now = Date.now();
        const diff = dueTime - now;

        if (diff <= 0) return "متأخرة عن الموعد";

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours >= 24) {
          const days = Math.floor(hours / 24);
          return `${days} يوم`;
        }

        const hh = String(hours).padStart(2, "0");
        const mm = String(mins).padStart(2, "0");
        const ss = String(secs).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      }

      return "غير محدد";
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
    Medium: { label: "متوسط", color: "text-[var(--text)] bg-[var(--surface-2)] border-[var(--border)] dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
    Low: { label: "منخفض", color: "text-[var(--text-2)] bg-[var(--surface-2)] border-[var(--border)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  };

  const currentPriority = priorityLabelMap[task.priority] || {
    label: task.priority || "متوسط",
    color: "text-[var(--text)] bg-[var(--surface-2)] border-[var(--border)] dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  };

  const statusLabelMap: Record<string, { label: string; dot: string }> = {
    Draft: { label: "مسودة", dot: "bg-slate-400" },
    Assigned: { label: "بانتظار القبول", dot: "bg-indigo-500" },
    "Pending Acceptance": { label: "بانتظار القبول", dot: "bg-indigo-500" },
    Pending: { label: "بانتظار القبول", dot: "bg-indigo-500" },
    Accepted: { label: "تم القبول", dot: "bg-blue-500" },
    "In Progress": { label: "قيد التنفيذ", dot: "bg-blue-600" },
    "Submitted for Review": { label: "قيد المراجعة", dot: "bg-indigo-500" },
    Blocked: { label: "معلّق لوجود عائق", dot: "bg-rose-500" },
    Completed: { label: "مكتملة", dot: "bg-sky-500" },
    "Approved / Completed": { label: "معتمدة ومكتملة", dot: "bg-sky-500" },
    Done: { label: "مكتملة", dot: "bg-sky-500" },
  };

  const currentStatus = statusLabelMap[task.status] || {
    label: task.status || "قيد التنفيذ",
    dot: "bg-sky-500",
  };

  // Normalize real attachments from API
  const normalizedAttachments: { name: string; url: string; size?: string; is_image?: boolean }[] = Array.isArray(task.attachments)
    ? task.attachments
        .map((att, idx) => {
          if (typeof att === "string") {
            const filename = att.split("/").pop() || `مرفق ${idx + 1}`;
            const isImg = /\.(png|jpe?g|webp|gif)$/i.test(att);
            return { name: filename, url: att, is_image: isImg };
          }
          if (att && typeof att === "object") {
            const url = att.url || "#";
            const isImg = Boolean(att.is_image || /\.(png|jpe?g|webp|gif)$/i.test(url) || /\.(png|jpe?g|webp|gif)$/i.test(att.name || ""));
            return {
              name: att.name || `مرفق ${idx + 1}`,
              url,
              size: att.size ? String(att.size) : undefined,
              is_image: isImg,
            };
          }
          return null;
        })
        .filter((x): x is { name: string; url: string; size?: string; is_image?: boolean } => Boolean(x))
    : [];

  const totalAttachmentsCount = normalizedAttachments.length + (task.voice_note_url ? 1 : 0);

  // Build authentic chronological activity timeline from real task timestamps and comments
  const timelineEvents: {
    id: string;
    title: string;
    actor: string;
    timestamp: string;
    detail?: string;
    kind: "create" | "accept" | "start" | "review" | "complete" | "block" | "comment";
  }[] = [];

  timelineEvents.push({
    id: "created",
    title: "تم إنشاء المهمة",
    actor: task.assigned_by_name || "النظام",
    timestamp: task.created_at,
    kind: "create",
  });

  if (task.acknowledged_at) {
    timelineEvents.push({
      id: "ack",
      title: "تم استلام المهمة",
      actor: task.assigned_to_name || "المكلف",
      timestamp: task.acknowledged_at,
      kind: "accept",
    });
  }

  if (task.accepted_at) {
    timelineEvents.push({
      id: "accepted",
      title: "تم قبول المهمة وبدء العمل",
      actor: task.assigned_to_name || "المكلف",
      timestamp: task.accepted_at,
      kind: "start",
    });
  }

  if (task.blocked_at) {
    timelineEvents.push({
      id: "blocked",
      title: "تم تعليق المهمة لوجود عائق",
      actor: task.assigned_to_name || "المكلف",
      timestamp: task.blocked_at,
      detail: task.blocker_reason,
      kind: "block",
    });
  }

  if (task.submitted_for_review_at) {
    timelineEvents.push({
      id: "review",
      title: "تم رفع المهمة للمراجعة",
      actor: task.assigned_to_name || "المكلف",
      timestamp: task.submitted_for_review_at,
      kind: "review",
    });
  }

  if (task.completed_at) {
    timelineEvents.push({
      id: "completed",
      title: "تم إكمال واعتماد المهمة",
      actor: task.reviewer_name || task.assigned_by_name || task.assigned_to_name || "النظام",
      timestamp: task.completed_at,
      kind: "complete",
    });
  }

  if (Array.isArray(task.comments)) {
    for (const c of task.comments) {
      timelineEvents.push({
        id: `comment-${c.id}`,
        title: `تعليق من ${c.user_name || "مستخدم"}`,
        actor: c.user_name || "مستخدم",
        timestamp: c.created_at,
        detail: c.content,
        kind: "comment",
      });
    }
  }

  timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const isOverdue = remainingTime === "متأخرة عن الموعد";
  const isCompleted = remainingTime === "تم الإنجاز";

  return (
    <div
      dir="rtl"
      className={`w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs flex flex-col h-full overflow-hidden text-right transition-all animate-in fade-in duration-200 ${className}`}
    >
      {/* 1. Header Toolbar */}
      <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2 shrink-0 bg-[var(--surface-2)]/60">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            title="إغلاق اللوحة الجانبية"
            aria-label="إغلاق اللوحة الجانبية"
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={onMaximize}
            title="توسيع لعرض كافة التفاصيل والتعليقات"
            aria-label="توسيع للوضع الكامل"
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        {/* Task Code Badge with Link */}
        <button
          type="button"
          onClick={() => onCopyLink?.(task.id)}
          title="نسخ رمز المهمة"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition cursor-pointer"
        >
          <span>{task.reference || `TASK-${task.id.slice(0, 6)}`}</span>
          <LinkIcon size={12} className="text-[var(--icon-muted)]" />
        </button>
      </div>

      {/* 2. Scrollable Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title & Description */}
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-1.5 leading-snug">
            {currentPriority.flame && (
              <Flame size={16} className="text-rose-500 shrink-0" />
            )}
            <span>{task.title}</span>
          </h2>
          {task.description && (
            <p className="text-xs text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          {/* Department & Operational Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--primary-soft)] text-[var(--primary-text)] border border-[var(--primary)]/20">
              {task.team_name || task.department || "تقنية المعلومات"}
            </span>
            {task.related_ticket_number && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                تذكرة: {task.related_ticket_number}
              </span>
            )}
            {task.related_asset_name && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                أصل: {task.related_asset_name}
              </span>
            )}
          </div>
        </div>

        {/* Interactive Task Checklist */}
        <TaskChecklistPanel taskId={task.id} />

        {/* 3. Live Countdown & Priority Box */}
        <div
          className={`rounded-2xl p-3.5 space-y-2 border ${
            isOverdue
              ? "bg-rose-50/70 dark:bg-rose-950/25 border-rose-200/70 dark:border-rose-900/40"
              : isCompleted
              ? "bg-sky-50/70 dark:bg-sky-950/25 border-sky-200/70 dark:border-sky-900/40"
              : "bg-[var(--surface-2)]/70 border-[var(--border)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-[var(--text-3)] block">
                الوقت المتبقي
              </span>
              <div
                className={`flex items-center gap-1.5 font-mono font-black text-lg ${
                  isOverdue
                    ? "text-rose-600 dark:text-rose-400"
                    : isCompleted
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-[var(--text)]"
                }`}
              >
                <span>{remainingTime}</span>
                <Clock size={16} strokeWidth={2.5} />
              </div>
            </div>

            <div className="text-left">
              <span className="text-[11px] font-bold text-[var(--text-3)] block">
                الأولوية
              </span>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text)]">
                {currentPriority.flame && <Flame size={14} className="text-rose-500" />}
                <span>{currentPriority.label}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[var(--text-3)] pt-1 border-t border-[var(--border)]">
            {effectiveDueDate ? `الموعد النهائي: ${formatArabicDateTime(effectiveDueDate)}` : "لم يتم تحديد موعد نهائي"}
          </div>
        </div>

        {/* 4. Metadata Details Grid */}
        <div className="bg-[var(--surface-2)]/60 border border-[var(--border)] rounded-2xl p-3.5 space-y-2.5 text-xs">
          {/* المسند إليه */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)] flex items-center gap-1.5">
              <User size={14} />
              <span>المسند إليه</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text)]">
                {task.assigned_to_name || "غير معين"}
              </span>
              <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--on-primary)] text-[10px] font-bold flex items-center justify-center">
                {task.assigned_to_name ? task.assigned_to_name[0] : "؟"}
              </div>
            </div>
          </div>

          {task.assigned_by_name && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-3)] flex items-center gap-1.5">
                <User size={14} />
                <span>المسند بواسطة</span>
              </span>
              <span className="font-semibold text-[var(--text)]">
                {task.assigned_by_name}
              </span>
            </div>
          )}

          {/* الحالة */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)] flex items-center gap-1.5">
              <Clock size={14} />
              <span>الحالة</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--primary-text)]">
              <span className={`w-2 h-2 rounded-full ${currentStatus.dot}`} />
              <span>{currentStatus.label}</span>
            </span>
          </div>

          {/* الموعد النهائي */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)] flex items-center gap-1.5">
              <Calendar size={14} />
              <span>الموعد النهائي</span>
            </span>
            <span className="font-semibold text-[var(--text)]">
              {formatArabicDateTime(effectiveDueDate)}
            </span>
          </div>

          {/* تاريخ الإسناد */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)] flex items-center gap-1.5">
              <Calendar size={14} />
              <span>تاريخ الإنشاء</span>
            </span>
            <span className="font-semibold text-[var(--text)]">
              {formatArabicDateTime(task.created_at)}
            </span>
          </div>

          {/* الإدارة / القسم */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)] flex items-center gap-1.5">
              <Building size={14} />
              <span>الفريق / الإدارة</span>
            </span>
            <span className="font-semibold text-[var(--text)]">
              {task.team_name || task.department || "تقنية المعلومات"}
            </span>
          </div>
        </div>

        {/* 5. Real Voice Note & Attachments Section */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--text)]">
            <span className="flex items-center gap-1.5">
              <Paperclip size={14} className="text-[var(--primary)]" />
              <span>المرفقات والتسجيلات ({totalAttachmentsCount})</span>
            </span>

            {onAttachFile && (
              <div className="flex items-center gap-1.5">
                <input
                  ref={drawerFileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void onAttachFile(task.id, f, advanceOnUpload);
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingAttachment}
                  onClick={() => {
                    setAdvanceOnUpload(false);
                    drawerFileInputRef.current?.click();
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer disabled:opacity-50"
                  title="إرفاق صورة أو ملف بهذه المهمة"
                >
                  + إرفاق صورة / ملف
                </button>
                <button
                  type="button"
                  disabled={uploadingAttachment}
                  onClick={() => {
                    setAdvanceOnUpload(true);
                    drawerFileInputRef.current?.click();
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--primary-soft)] text-[var(--primary-text)] border border-[var(--primary)]/30 hover:bg-[var(--primary)] hover:text-white transition cursor-pointer disabled:opacity-50"
                  title="إرفاق صورة أو ملف وإرسال المهمة للمرحلة القادمة مباشرة"
                >
                  {uploadingAttachment ? "جاري الرفع..." : "إرفاق وإرسال للمرحلة القادمة ←"}
                </button>
              </div>
            )}
          </div>

          {task.voice_note_url && (
            <VoiceTaskPlayer
              src={task.voice_note_url}
              duration={task.voice_note_duration}
              title={task.title}
            />
          )}

          {normalizedAttachments.map((att, idx) => (
            <div
              key={`${att.name}-${idx}`}
              className="bg-[var(--surface-2)]/70 border border-[var(--border)] rounded-2xl p-3 space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary-soft)] text-[var(--primary-text)] flex items-center justify-center shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--text)] truncate">
                      {att.name}
                    </div>
                    {att.size && (
                      <div className="text-[10px] text-[var(--text-3)] font-mono mt-0.5">
                        {att.size}
                      </div>
                    )}
                  </div>
                </div>
                {att.url && att.url !== "#" && (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.name}
                    className="text-xs font-semibold text-[var(--primary-text)] hover:underline shrink-0"
                  >
                    عرض / تحميل
                  </a>
                )}
              </div>
              {att.is_image && att.url && att.url !== "#" && (
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-44 w-full object-contain"
                  />
                </a>
              )}
            </div>
          ))}

          {totalAttachmentsCount === 0 && (
            <div className="bg-[var(--surface-2)]/40 border border-[var(--border)] rounded-xl p-3 text-center text-xs text-[var(--text-3)]">
              لا توجد مرفقات لهذه المهمة — يمكنك إرفاق صورة أو ملف وإرساله للمرحلة القادمة
            </div>
          )}
        </div>

        {/* 6. Real Activity Timeline (سجل النشاط) */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
            <Clock size={14} className="text-[var(--primary)]" />
            <span>سجل النشاط ({timelineEvents.length})</span>
          </div>

          <div className="relative border-r-2 border-[var(--primary)]/25 mr-2 pr-4 space-y-3.5">
            {timelineEvents.map((ev) => (
              <div key={ev.id} className="relative">
                <div className="absolute -right-[23px] top-0.5 w-4 h-4 rounded-full bg-[var(--primary)] text-[var(--on-primary)] flex items-center justify-center text-[9px] ring-4 ring-[var(--surface)]">
                  {ev.kind === "complete" ? (
                    <CheckCircle2 size={9} />
                  ) : ev.kind === "start" ? (
                    <Play size={8} className="fill-current mr-0.5" />
                  ) : ev.kind === "block" ? (
                    <AlertCircle size={9} />
                  ) : ev.kind === "comment" ? (
                    <MessageSquare size={8} />
                  ) : (
                    <User size={9} />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--text)]">
                    {ev.title}
                  </div>
                  {ev.detail && (
                    <p className="text-xs text-[var(--text-2)] bg-[var(--surface-2)]/70 border border-[var(--border)] rounded-lg px-2.5 py-1.5 mt-1 whitespace-pre-wrap">
                      {ev.detail}
                    </p>
                  )}
                  <div className="text-[11px] text-[var(--text-3)]">
                    {ev.actor} — {formatArabicDateTime(ev.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. Sticky Bottom Action Toolbar */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)] flex items-center gap-2 shrink-0">
        {/* Status Dropdown Trigger */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--on-primary)] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors shadow-xs cursor-pointer"
          >
            <span>تحديث الحالة</span>
            <ChevronDown size={14} className={statusMenuOpen ? "rotate-180" : ""} />
          </button>

          {statusMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-50 text-right">
              {[
                { key: "Accepted", label: "قبول المهمة" },
                { key: "In Progress", label: "بدء التنفيذ" },
                { key: "Submitted for Review", label: "رفع للمراجعة" },
                { key: "Completed", label: "اعتماد وإكمال" },
                { key: "Blocked", label: "تعليق لوجود عائق" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => {
                    onStatusChange(task.id, st.key);
                    setStatusMenuOpen(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-text)] cursor-pointer"
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
          aria-label="إضافة تعليق"
          className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-2)] transition-colors cursor-pointer"
        >
          <MessageSquare size={16} />
        </button>

        {/* Edit Pencil Button */}
        <button
          type="button"
          onClick={() => onEdit(task.id)}
          title="تعديل تفاصيل المهمة"
          aria-label="تعديل تفاصيل المهمة"
          className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-2)] transition-colors cursor-pointer"
        >
          <Edit3 size={16} />
        </button>
      </div>
    </div>
  );
}
