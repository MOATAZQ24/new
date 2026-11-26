"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import EmployeeCombobox, { type EmployeeOption } from "@/components/ui/EmployeeCombobox";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import {
  Camera,
  Paperclip,
  CheckSquare,
  Headphones,
  ArrowLeftRight,
  FileText,
  Trash2,
  Upload,
  CheckCircle2,
  Sparkles,
  Server,
  Monitor,
  ShieldCheck,
  Wifi,
  HardDrive,
  Wrench,
} from "lucide-react";

export interface UploadedAttachmentItem {
  name: string;
  url: string;
  size?: string;
  is_image?: boolean;
  stage?: string;
}

export interface ActiveTaskOption {
  id: string;
  reference?: string;
  title: string;
  status: string;
  assigned_to_name?: string;
}

export interface AssetOptionItem {
  id: string;
  asset_name: string;
  asset_code: string;
}

interface SmartUploadActionModalProps {
  isOpen: boolean;
  initialMode?: "camera" | "file";
  companyId?: string;
  preselectedTask?: ActiveTaskOption | null;
  activeTasks: ActiveTaskOption[];
  assets: AssetOptionItem[];
  onClose: () => void;
  onSuccessRefresh: (updatedTaskId?: string) => void;
}

type DestinationType = "new_task" | "existing_task_stage" | "helpdesk_ticket";

export function SmartUploadActionModal({
  isOpen,
  initialMode = "file",
  companyId,
  preselectedTask,
  activeTasks,
  assets,
  onClose,
  onSuccessRefresh,
}: SmartUploadActionModalProps) {
  const router = useRouter();
  const toast = useToast();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [attachments, setAttachments] = useState<UploadedAttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: Destination choice
  const [destination, setDestination] = useState<DestinationType>(
    preselectedTask ? "existing_task_stage" : "new_task"
  );

  // Destination A: New Task fields
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("High");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssetId, setTaskAssetId] = useState("");
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeOption | null>(null);

  // Destination B: Existing Task + Next Stage fields
  const [targetTaskId, setTargetTaskId] = useState(preselectedTask?.id || "");
  const [nextStageStatus, setNextStageStatus] = useState("Submitted for Review");
  const [stageNote, setStageNote] = useState("");

  // Destination C: Help Desk Ticket fields
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketCategory, setTicketCategory] = useState("Hardware");
  const [ticketPriority, setTicketPriority] = useState("High");
  const [ticketAssetId, setTicketAssetId] = useState("");

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (preselectedTask) {
        setDestination("existing_task_stage");
        setTargetTaskId(preselectedTask.id);
      } else if (!targetTaskId && activeTasks.length > 0) {
        setTargetTaskId(activeTasks[0].id);
      }
    }
  }, [isOpen, preselectedTask, activeTasks, targetTaskId]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const newlyUploaded: UploadedAttachmentItem[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post<UploadedAttachmentItem>("/tasks/attachment-upload", fd);
        if (res.data) {
          newlyUploaded.push(res.data);
        }
      }
      setAttachments((prev) => [...prev, ...newlyUploaded]);
      if (newlyUploaded.length > 0) {
        const firstName = newlyUploaded[0].name.replace(/\.[^/.]+$/, "");
        if (!taskTitle.trim()) {
          setTaskTitle(
            initialMode === "camera"
              ? `معالجة ملاحظة مصورة: ${firstName}`
              : `متابعة مرفق تشغيلي: ${firstName}`
          );
        }
        if (!ticketTitle.trim()) {
          setTicketTitle(`بلاغ فني مرفق: ${firstName}`);
        }
        toast.success(`تم رفع ${newlyUploaded.length} ملف/صورة بنجاح — اختر الآن نوع الإجراء المطلوب`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل رفع الملف المرفق";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (attachments.length === 0) {
      setError("يرجى رفع صورة واحدة أو ملف واحد على الأقل أولاً قبل تنفيذ الإجراء.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (destination === "new_task") {
        const finalTitle = taskTitle.trim() || `مهمة بمرفق (${attachments[0].name})`;
        await api.post("/tasks", {
          company_id: companyId || undefined,
          title: finalTitle,
          description:
            taskDescription.trim() ||
            `يرجى مراجعة المرفقات المرسلة (${attachments.map((a) => a.name).join("، ")}) وتنفيذ اللازم.`,
          assigned_to_id: taskAssigneeId || null,
          priority: taskPriority,
          status: "Assigned",
          due_date: taskDueDate || null,
          related_asset_id: taskAssetId || null,
          attachments,
          notify_telegram: notifyTelegram,
        });
        toast.success("تم إنشاء وإسناد المهمة مع الصور والمرفقات بنجاح!");
        resetAndClose();
        onSuccessRefresh();
      } else if (destination === "existing_task_stage") {
        if (!targetTaskId) {
          setError("يرجى اختيار المهمة المراد إرفاق الملف بها.");
          setSubmitting(false);
          return;
        }
        await api.post(`/tasks/${targetTaskId}/route-attachments`, {
          attachments,
          stage_note: stageNote.trim() || null,
          advance_to_status: nextStageStatus === "NONE" ? null : nextStageStatus,
        });
        toast.success(
          nextStageStatus === "NONE"
            ? "تم إرفاق الملفات وتوثيقها في سجل المهمة بنجاح!"
            : "تم إرفاق الملفات ونقل المهمة للمرحلة القادمة بنجاح!"
        );
        const updatedId = targetTaskId;
        resetAndClose();
        onSuccessRefresh(updatedId);
      } else if (destination === "helpdesk_ticket") {
        const finalIssueTitle = ticketTitle.trim() || `بلاغ دعم فني مرفق (${attachments[0].name})`;
        const attachmentLinks = attachments
          .map((a) => `• ${a.name}: ${a.url}`)
          .join("\n");
        const finalDesc =
          (ticketDescription.trim() || "تم رفع هذا البلاغ مع مرفقات توضيحية لمعالجة المشكلة.") +
          `\n\nالمرفقات:\n${attachmentLinks}`;

        await api.post("/tickets", {
          company_id: companyId || undefined,
          issue_title: finalIssueTitle,
          issue_description: finalDesc,
          category: ticketCategory,
          priority: ticketPriority,
          ticket_type: "Incident",
          tier: "L1",
          related_asset_id: ticketAssetId || null,
          attachments,
        });
        toast.success("تم فتح تذكرة الدعم الفني (Help Desk) مع المرفقات بنجاح!");
        resetAndClose();
        router.push("/tickets");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر تنفيذ الإجراء المطلوب";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setAttachments([]);
    setTaskTitle("");
    setTaskDescription("");
    setStageNote("");
    setTicketTitle("");
    setTicketDescription("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={
        initialMode === "camera"
          ? "التقاط / رفع صورة وتوجيه الإجراء التشغيلي"
          : "مركز رفع الصور والمرفقات والتوجيه الذكي"
      }
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleExecuteAction} className="space-y-5 text-right" dir="rtl">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* STEP 1: UPLOAD OR CAPTURE FILES/IMAGES */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[11px] flex items-center justify-center font-bold">
                1
              </span>
              <span>ارفع أو التقط الصورة / الملف المرفق</span>
            </span>
            <span className="text-[11px] text-[var(--text-3)]">
              يدعم الصور (PNG, JPG, WEBP) والمستندات (PDF, Word, Excel, ZIP)
            </span>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="p-4 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)]/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-soft)] text-[var(--primary-text)] flex items-center justify-center shrink-0">
                {initialMode === "camera" ? <Camera size={20} /> : <Upload size={20} />}
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text)]">
                  {attachments.length === 0
                    ? "اختر صورة من الكاميرا أو ارفع ملفاً من جهازك"
                    : `تم تجهيز (${attachments.length}) مرفق للإرسال`}
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  يمكنك إرفاق أكثر من صورة أو مستند في نفس العملية
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer disabled:opacity-50"
              >
                <Camera size={14} className="text-[var(--primary)]" />
                <span>التقاط / اختيار صورة</span>
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition cursor-pointer disabled:opacity-50"
              >
                <Paperclip size={14} />
                <span>{uploading ? "جاري الرفع..." : "رفع ملف / مستند"}</span>
              </button>
            </div>
          </div>

          {/* Uploaded Attachments Preview Grid */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {attachments.map((att, idx) => (
                <div
                  key={`${att.url}-${idx}`}
                  className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between gap-2.5 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {att.is_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.url}
                        alt={att.name}
                        className="w-11 h-11 rounded-lg object-cover border border-[var(--border)] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-[var(--primary-soft)] text-[var(--primary-text)] flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] truncate">
                        {att.name}
                      </div>
                      <div className="text-[10px] text-[var(--text-3)] font-mono flex items-center gap-1.5">
                        <span>{att.size || "مرفق جاهز"}</span>
                        <span className="text-sky-600 dark:text-sky-400 font-sans font-bold">
                          • تم الرفع
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    title="حذف المرفق"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 2: CHOOSE DESTINATION & WORKFLOW ACTION */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[11px] flex items-center justify-center font-bold">
              2
            </span>
            <span>حدد نوع الرفع والوجهة التي تريد إرسال المرفق إليها</span>
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: "new_task" as const,
                title: "إسناد مهمة جديدة",
                desc: "إنشاء مهمة عمل وإسنادها لموظف مع الصورة أو الملف",
                icon: <CheckSquare size={16} />,
              },
              {
                id: "existing_task_stage" as const,
                title: "مهمة قائمة ← المرحلة القادمة",
                desc: "إرفاق إثبات بمهمة حالية ونقلها للمراجعة أو الاعتماد",
                icon: <ArrowLeftRight size={16} />,
              },
              {
                id: "helpdesk_ticket" as const,
                title: "فتح تذكرة دعم (Help Desk)",
                desc: "رفع بلاغ عطل فني إلى مكتب المساعدة مع الصورة",
                icon: <Headphones size={16} />,
              },
            ].map((opt) => {
              const active = destination === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDestination(opt.id)}
                  className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/70 text-[var(--primary-text)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text)]">{opt.title}</span>
                    <span className={active ? "text-[var(--primary)]" : "text-[var(--text-3)]"}>
                      {opt.icon}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-3)] leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 3: CONTEXTUAL ACTION FORM */}
        <div className="p-4 rounded-2xl bg-[var(--surface-2)]/60 border border-[var(--border)] space-y-3.5">
          {destination === "new_task" && (
            <>
              <div className="text-xs font-bold text-[var(--primary-text)] flex items-center gap-1.5">
                <CheckSquare size={14} />
                <span>بيانات إسناد المهمة الجديدة بالمرفق</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    عنوان المهمة *
                  </label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="مثال: معالجة الملاحظة المصورة في غرفة الخوادم"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>

                <div>
                  <EmployeeCombobox
                    value={taskAssigneeId}
                    companyId={companyId}
                    onResolve={setSelectedEmp}
                    onChange={(emp) => {
                      setSelectedEmp(emp);
                      setTaskAssigneeId(emp?.id || "");
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    الأولوية
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="Critical">حرج جداً</option>
                    <option value="Urgent">عاجل</option>
                    <option value="High">مرتفع</option>
                    <option value="Medium">متوسط</option>
                    <option value="Low">منخفض</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    الأصل التقني المرتبط (اختياري)
                  </label>
                  <select
                    value={taskAssetId}
                    onChange={(e) => setTaskAssetId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="">-- بدون أصل محدد --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.asset_name} ({a.asset_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    الموعد النهائي (اختياري)
                  </label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    التوجيهات الفنية للموظف المكلف
                  </label>
                  <textarea
                    rows={2}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="اكتب المطلوب تنفيذه بناءً على الصورة أو الملف المرفق..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                />
                <span>
                  إرسال إشعار فوري للموظف عبر Telegram
                  {selectedEmp?.is_telegram_linked ? " (مرتبط ومفعل)" : ""}
                </span>
              </label>
            </>
          )}

          {destination === "existing_task_stage" && (
            <>
              <div className="text-xs font-bold text-[var(--primary-text)] flex items-center gap-1.5">
                <ArrowLeftRight size={14} />
                <span>إرفاق بمهمة قائمة وتحديد إجراء المرحلة القادمة</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    اختر المهمة المستهدفة *
                  </label>
                  <select
                    required
                    value={targetTaskId}
                    onChange={(e) => setTargetTaskId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="">-- اختر مهمة من القائمة --</option>
                    {activeTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.reference || `TASK-${t.id.slice(0, 6)}`} — {t.title} (
                        {t.assigned_to_name || "غير معين"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    الإجراء المطلوب / الانتقال للمرحلة القادمة *
                  </label>
                  <select
                    value={nextStageStatus}
                    onChange={(e) => setNextStageStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="Submitted for Review">
                      رفع المهمة والمرفقات للمراجعة والاعتماد الإداري
                    </option>
                    <option value="In Progress">
                      بدء التنفيذ وتحويل المهمة إلى (قيد التنفيذ)
                    </option>
                    <option value="Completed">
                      اعتماد وإكمال المهمة نهائياً مع مرفق الإثبات
                    </option>
                    <option value="Blocked">
                      تعليق المهمة لوجود عائق (مع إرفاق صورة/مستند المعوق)
                    </option>
                    <option value="Rework Required">
                      طلب تعديلات إضافية من الفني بناءً على المرفق
                    </option>
                    <option value="NONE">
                      إرفاق وتوثيق في سجل المهمة فقط (دون تغيير المرحلة)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    ملاحظة المرحلة القادمة / شرح المرفق
                  </label>
                  <textarea
                    rows={2}
                    value={stageNote}
                    onChange={(e) => setStageNote(e.target.value)}
                    placeholder="مثال: مرفق لكم صورة إتمام التركيب وتقرير الفحص الفني لاعتماد المرحلة..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
              </div>
            </>
          )}

          {destination === "helpdesk_ticket" && (
            <>
              <div className="text-xs font-bold text-[var(--primary-text)] flex items-center gap-1.5">
                <Headphones size={14} />
                <span>فتح تذكرة دعم فني (Help Desk) بالمرفقات</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    عنوان البلاغ / المشكلة الفنية *
                  </label>
                  <input
                    type="text"
                    required
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                    placeholder="مثال: توقف طابعة الشبكة وظهور رمز خطأ على الشاشة"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    تصنيف البلاغ
                  </label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="Hardware">أجهزة وعتاد</option>
                    <option value="Network">شبكات واتصالات</option>
                    <option value="Software">برمجيات وأنظمة</option>
                    <option value="Access">صلاحيات ووصول</option>
                    <option value="Email">بريد إلكتروني</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    مستوى الأولوية
                  </label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="Critical">حرج جداً</option>
                    <option value="Urgent">عاجل</option>
                    <option value="High">مرتفع</option>
                    <option value="Medium">متوسط</option>
                    <option value="Low">منخفض</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    الأصل التقني المتأثر (اختياري)
                  </label>
                  <select
                    value={ticketAssetId}
                    onChange={(e) => setTicketAssetId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="">-- غير مرتبط بأصل معين --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.asset_name} ({a.asset_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">
                    وصف المشكلة وتفاصيل الصورة المرفقة
                  </label>
                  <textarea
                    rows={2}
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    placeholder="اشرح تفاصيل العطل الظاهر في الصورة ليتم توجيه الفني المختص فوراً..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="submit"
            disabled={submitting || uploading || attachments.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-sm cursor-pointer transition"
          >
            <CheckCircle2 size={15} />
            <span>
              {submitting
                ? "جاري التنفيذ والإرسال..."
                : destination === "new_task"
                ? "إنشاء وإسناد المهمة مع المرفقات"
                : destination === "existing_task_stage"
                ? "إرفاق الملف وإرسال المهمة للمرحلة القادمة"
                : "فتح تذكرة دعم فني (Help Desk) بالمرفقات"}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

export interface TaskTemplateDefinition {
  id: string;
  title: string;
  description: string;
  priority: string;
  notes: string;
  durationHours: number;
  categoryLabel: string;
  icon: React.ReactNode;
}

export const READY_TASK_TEMPLATES: TaskTemplateDefinition[] = [
  {
    id: "server_incident",
    title: "معالجة عطل الخادم الرئيسي واستعادة الخدمة",
    description:
      "فحص سجلات الخادم، التحقق من حالة الخدمات وقواعد البيانات، استعادة التشغيل، وتوثيق السبب الجذري لمنع التكرار.",
    priority: "Critical",
    notes: "أولوية قصوى وفق معايير الحوادث الحرجة ITIL — يرجى إرفاق صورة تقرير الحالة عند الإغلاق.",
    durationHours: 2,
    categoryLabel: "بنية تحتية وخوادم",
    icon: <Server size={18} className="text-rose-600" />,
  },
  {
    id: "employee_onboarding",
    title: "تهيئة وتسليم جهاز وحسابات موظف جديد",
    description:
      "تجهيز جهاز الحاسب، تثبيت البرامج المعتمدة، إعداد البريد الإلكتروني وصلاحيات الدخول، وتوثيق نموذج استلام العهدة.",
    priority: "Medium",
    notes: "يرجى إرفاق صورة محضر التسليم أو الرقم التسلسلي للجهاز بعد الانتهاء.",
    durationHours: 24,
    categoryLabel: "أجهزة وعهد موظفين",
    icon: <Monitor size={18} className="text-blue-600" />,
  },
  {
    id: "backup_verification",
    title: "فحص والتحقق من سلامة النسخ الاحتياطي الدوري",
    description:
      "مراجعة اكتمال مهام النسخ الاحتياطي للخوادم وقواعد البيانات، وإجراء اختبار استعادة تجريبي للتأكد من سلامة البيانات.",
    priority: "High",
    notes: "يرجى إرفاق لقطة شاشة من لوحة النسخ الاحتياطي لإرسالها لمرحلة الاعتماد.",
    durationHours: 6,
    categoryLabel: "أمن بيانات ونسخ احتياطي",
    icon: <HardDrive size={18} className="text-indigo-600" />,
  },
  {
    id: "network_maintenance",
    title: "فحص وصيانة شبكة الفرع ونقاط الوصول (Wi-Fi / Switches)",
    description:
      "فحص استقرار الاتصال، مراجعة حالة الموجهات والسويتشات، قياس سرعة واستجابة الشبكة، ومعالجة أي نقاط ضعف.",
    priority: "High",
    notes: "يرجى توثيق قراءات الشبكة وإرفاق صورة بعد انتهاء الصيانة.",
    durationHours: 12,
    categoryLabel: "شبكات واتصالات",
    icon: <Wifi size={18} className="text-sky-600" />,
  },
  {
    id: "security_access_audit",
    title: "مراجعة وتدقيق الصلاحيات الأمنية وحسابات المستخدمين",
    description:
      "مراجعة الحسابات النشطة، إيقاف الحسابات غير المستخدمة، والتحقق من تطبيق سياسات كلمات المرور والمصادقة.",
    priority: "Medium",
    notes: "مهمة رقابة أمنية دورية — تُرفع للمراجعة الإدارية بعد التدقيق.",
    durationHours: 48,
    categoryLabel: "أمن سيبراني وصلاحيات",
    icon: <ShieldCheck size={18} className="text-blue-700" />,
  },
  {
    id: "preventive_maintenance",
    title: "صيانة وقائية وجرد للأصول التقنية والطابعات",
    description:
      "تنظيف وفحص الأجهزة المشتركة والطابعات، تحديث التعريفات، والتأكد من مطابقة الأصول المسجلة في العهدة.",
    priority: "Low",
    notes: "صيانة وقائية مجدولة.",
    durationHours: 72,
    categoryLabel: "صيانة وقائية وأصول",
    icon: <Wrench size={18} className="text-slate-600" />,
  },
];

interface TaskTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (tpl: TaskTemplateDefinition) => void;
}

export function TaskTemplatesModal({
  isOpen,
  onClose,
  onSelectTemplate,
}: TaskTemplatesModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="مكتبة قوالب المهام التشغيلية الجاهزة"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-3 text-right" dir="rtl">
        <p className="text-xs text-[var(--text-2)]">
          اختر القالب المناسب ليتم تعبئة تفاصيل المهمة والأولوية والمهلة المستهدفة تلقائياً، ثم اختر الموظف المكلف:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {READY_TASK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                onSelectTemplate(tpl);
                onClose();
              }}
              className="p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]/40 text-right transition-all cursor-pointer flex flex-col justify-between gap-2 group shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  {tpl.icon}
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                  {tpl.categoryLabel}
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--primary-text)] mb-1">
                  {tpl.title}
                </div>
                <p className="text-[11px] text-[var(--text-3)] line-clamp-2 leading-relaxed">
                  {tpl.description}
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] pt-1 border-t border-[var(--border)]/60">
                <span>المهلة المقترحة: {tpl.durationHours} ساعة</span>
                <span className="font-bold text-[var(--primary-text)] inline-flex items-center gap-1">
                  <Sparkles size={11} />
                  <span>استخدام القالب ←</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
