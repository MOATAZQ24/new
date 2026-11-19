"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/ui/StatsCard";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  CheckSquareIcon, PlusIcon,
  ClockIcon, MessageSquareIcon, SendIcon, AlertCircleIcon, UserIcon, LifeBuoyIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import EmployeeCombobox, { type EmployeeOption } from "@/components/ui/EmployeeCombobox";
import VoiceTaskRecorder, { type VoiceRecordingResult } from "@/components/tasks/VoiceTaskRecorder";
import VoiceTaskPlayer from "@/components/tasks/VoiceTaskPlayer";

interface TaskItem {
  id: string;
  reference?: string;
  company_id: string;
  branch_id?: string;
  title: string;
  description?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  assigned_by_id?: string;
  assigned_by_name?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  priority: string;
  status: string;
  stage?: string;
  stage_label?: string;
  start_date?: string;
  due_date?: string;
  acknowledged_at?: string;
  is_acknowledged?: boolean;
  accepted_at?: string;
  submitted_for_review_at?: string;
  completed_at?: string;
  is_blocked: boolean;
  blocker_reason?: string;
  blocked_at?: string;
  unblocked_at?: string;
  review_notes?: string;
  rework_count: number;
  related_asset_name?: string;
  related_asset_id?: string;
  related_ticket_id?: string;
  related_ticket_number?: string;
  related_ticket_title?: string;
  notes?: string;
  is_overdue: boolean;
  comments_count: number;
  is_voice_task?: boolean;
  voice_note_url?: string;
  voice_note_duration?: number;
  created_at: string;
  updated_at?: string;
}

interface TaskSummary {
  total: number;
  new: number;
  in_progress: number;
  waiting: number;
  completed: number;
  rejected: number;
  cancelled: number;
  active: number;
  overdue: number;
  version: string;
  unknown_status: number;
}

interface CommentItem {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface TaskDetail extends TaskItem {
  comments: CommentItem[];
  telegram_info?: {
    is_employee_linked: boolean;
    telegram_username?: string;
    notifications_enabled: boolean;
    delivery_status: string;
    sent_at?: string;
    last_error?: string;
    retry_count: number;
    outbox_id?: string;
  };
}

export default function TasksPage() {
  const { currentCompany, user } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const versionRef = useRef<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "my">("all");
  const [sortBy, setSortBy] = useState<"created_desc" | "due_asc" | "updated_desc">("created_desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Options for form
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string }[]>([]);
  const [filterEmployees, setFilterEmployees] = useState<EmployeeOption[]>([]);

  // Modals & Feedback
  const [createModal, setCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<"text" | "voice">("text");
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecordingResult | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Collaboration Action Modals
  const [blockModal, setBlockModal] = useState(false);
  const [blockerReasonInput, setBlockerReasonInput] = useState("");
  
  const [submitModal, setSubmitModal] = useState(false);
  const [submissionNotesInput, setSubmissionNotesInput] = useState("");
  
  const [reworkModal, setReworkModal] = useState(false);
  const [reworkNotesInput, setReworkNotesInput] = useState("");
  
  const [approveModal, setApproveModal] = useState(false);
  const [approvalNotesInput, setApprovalNotesInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state for task creation
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigned_to_id: "",
    priority: "Medium",
    status: "Assigned",
    start_date: "",
    due_date: "",
    related_asset_id: "",
    notes: "",
    notify_telegram: true,
    is_voice_task: false,
    voice_note_url: "",
    voice_note_duration: 0,
  });

  const buildBaseParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (priorityFilter) params.priority = priorityFilter;
    if (filterAssigneeId) params.assigned_to_id = filterAssigneeId;
    if (filterMode === "my") params.filter_mode = "my";
    return params;
  }, [debouncedSearch, priorityFilter, filterAssigneeId, filterMode]);

  const loadTasks = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      const baseParams = buildBaseParams();
      const listParams: Record<string, string> = {
        ...baseParams,
        page: String(page),
        per_page: "50",
        sort_by: sortBy,
      };
      if (statusFilter) listParams.status = statusFilter;
      if (overdueOnly) listParams.overdue = "true";

      const [listRes, summaryRes] = await Promise.all([
        api.get<TaskItem[]>("/tasks", { params: listParams }),
        api.get<TaskSummary>("/tasks/summary", { params: baseParams }),
      ]);
      setTasks(listRes.data || []);
      if (listRes.pagination) {
        setTotalPages(Math.max(1, listRes.pagination.total_pages || 1));
        setTotalFiltered(listRes.pagination.total ?? (listRes.data || []).length);
      } else {
        setTotalPages(1);
        setTotalFiltered((listRes.data || []).length);
      }
      if (summaryRes.data) {
        setSummary(summaryRes.data);
        versionRef.current = summaryRes.data.version || "";
      }
    } catch (err) {
      console.error("Failed to load tasks", err);
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : "تعذر تحميل المهام من الخادم");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildBaseParams, statusFilter, overdueOnly, page, sortBy]);

  const loadDependencies = useCallback(async () => {
    try {
      const [astRes, empRes] = await Promise.all([
        api.get<{ id: string; asset_name: string; asset_code: string }[]>("/assets?per_page=100"),
        api.get<EmployeeOption[]>("/tasks/assignees?limit=30").catch(() => ({ data: [] as EmployeeOption[] })),
      ]);
      setAssets(astRes.data || []);
      setFilterEmployees(empRes.data || []);
    } catch (err) {
      console.error("Failed to load dependencies", err);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTasks(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks, currentCompany]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDependencies(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDependencies, currentCompany]);

  // Real-time Dashboard synchronization with Telegram & background updates
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const summaryRes = await api.get<TaskSummary>("/tasks/summary", { params: buildBaseParams() });
        if (summaryRes.data && summaryRes.data.version !== versionRef.current) {
          await loadTasks(true);
          if (detailModal && selectedTask?.id) {
            const detailRes = await api.get<TaskDetail>(`/tasks/${selectedTask.id}`);
            if (detailRes.data) setSelectedTask(detailRes.data);
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    };
    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void checkUpdates();
      }
    }, 3000);
    const onFocus = () => { void checkUpdates(); };
    const onTasksUpdated = () => { void loadTasks(true); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("tasks:updated", onTasksUpdated);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("tasks:updated", onTasksUpdated);
    };
  }, [buildBaseParams, loadTasks, detailModal, selectedTask?.id]);

  const refreshSelectedTask = async (taskId: string) => {
    try {
      const res = await api.get<TaskDetail>(`/tasks/${taskId}`);
      setSelectedTask(res.data);
      loadTasks();
    } catch (err) {
      console.error("Failed to refresh task detail", err);
    }
  };

  const handleOpenDetail = async (taskId: string) => {
    setActionError(null);
    setResendMessage(null);
    try {
      const res = await api.get<TaskDetail>(`/tasks/${taskId}`);
      setSelectedTask(res.data);
      setDetailModal(true);
    } catch (err) {
      console.error("Failed to fetch task detail", err);
    }
  };

  const handleResendTelegram = async (taskId: string) => {
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await api.post(`/tasks/${taskId}/resend-telegram`);
      setResendMessage(res.message || "تمت إعادة إرسال إشعار المهمة عبر Telegram بنجاح!");
      await refreshSelectedTask(taskId);
    } catch (err: unknown) {
      setResendMessage(err instanceof Error ? err.message : "فشلت إعادة الإرسال");
    } finally {
      setResendLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      const isVoice = createMode === "voice" && !editingTask;
      let voiceUrl = formData.voice_note_url || "";
      let voiceDur = formData.voice_note_duration || 0;

      if (isVoice) {
        if (!voiceRecording?.blob) {
          const msg = "يرجى تسجيل الرسالة الصوتية أولاً قبل إرسال المهمة.";
          setCreateError(msg);
          toast.error(msg);
          setCreateLoading(false);
          return;
        }

        const uploadData = new FormData();
        uploadData.append("file", voiceRecording.blob, "voice_task.webm");
        uploadData.append("duration", String(voiceRecording.duration));

        const uploadRes = await api.post<{
          voice_note_url: string;
          duration: number;
          filename: string;
        }>("/tasks/voice-upload", uploadData);

        voiceUrl = uploadRes.data.voice_note_url;
        voiceDur = uploadRes.data.duration;
      }

      const finalTitle = formData.title.trim()
        ? formData.title.trim()
        : isVoice
        ? `مهمة صوتية (${voiceDur} ثانية)`
        : "";

      if (!finalTitle && !isVoice) {
        const msg = "يرجى إدخال عنوان المهمة.";
        setCreateError(msg);
        toast.error(msg);
        setCreateLoading(false);
        return;
      }

      const payload = {
        company_id: currentCompany?.id || undefined,
        title: finalTitle,
        description: formData.description?.trim() || null,
        assigned_to_id: formData.assigned_to_id || null,
        priority: formData.priority,
        status: formData.status,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        related_asset_id: formData.related_asset_id || null,
        notes: formData.notes?.trim() || null,
        notify_telegram: formData.notify_telegram,
        is_voice_task: isVoice || formData.is_voice_task,
        voice_note_url: voiceUrl || null,
        voice_note_duration: voiceDur || 0,
      };
      const res = editingTask
        ? await api.put<{ delivery_status?: { status?: string } }>(`/tasks/${editingTask.id}`, payload)
        : await api.post<{ delivery_status?: { status?: string } }>("/tasks", payload);

      setCreateModal(false);
      setSelectedEmployee(null);
      setEditingTask(null);
      setVoiceRecording(null);
      setCreateMode("text");
      setFormData({
        title: "",
        description: "",
        assigned_to_id: "",
        priority: "Medium",
        status: "Assigned",
        start_date: "",
        due_date: "",
        related_asset_id: "",
        notes: "",
        notify_telegram: true,
        is_voice_task: false,
        voice_note_url: "",
        voice_note_duration: 0,
      });

      const dStatus = res.data?.delivery_status?.status;
      let successMsg = "تم إنشاء المهمة بنجاح ✓";
      if (editingTask) {
        successMsg = "تم تحديث المهمة والإسناد بنجاح ✓";
      } else if (isVoice) {
        successMsg = "تم تسجيل وإرسال المهمة الصوتية بنجاح 🎙️ ✓";
      } else if (dStatus === "Sent") {
        successMsg = "تم إنشاء المهمة بنجاح، وتم تسليم إشعار Telegram للموظف فوراً! 🟢";
      } else if (dStatus === "Pending") {
        successMsg = "تم إنشاء المهمة بنجاح، وإدراج إشعار Telegram في قائمة الإرسال الفوري 🟡";
      }
      setToastMessage(successMsg);
      toast.success(successMsg);
      setTimeout(() => setToastMessage(null), 6000);

      setPage(1);
      loadTasks();
    } catch (err: unknown) {
      console.error("Failed to create task", err);
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء المهمة";
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Collaboration Lifecycle Actions ──────────────────────────────────
  const handleAcceptTask = async (taskId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/accept`);
      await refreshSelectedTask(taskId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل قبول المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTask = async (taskId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/start`);
      await refreshSelectedTask(taskId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل بدء العمل على المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockTask = async () => {
    if (!selectedTask || !blockerReasonInput.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${selectedTask.id}/block`, { reason: blockerReasonInput.trim() });
      setBlockModal(false);
      setBlockerReasonInput("");
      await refreshSelectedTask(selectedTask.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تعليق المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblockTask = async (taskId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/unblock`);
      await refreshSelectedTask(taskId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل إزالة المعوق واستئناف المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedTask) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${selectedTask.id}/submit-review`, { notes: submissionNotesInput.trim() || null });
      setSubmitModal(false);
      setSubmissionNotesInput("");
      await refreshSelectedTask(selectedTask.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل رفع المهمة للمراجعة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveTask = async () => {
    if (!selectedTask) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${selectedTask.id}/approve`, { review_notes: approvalNotesInput.trim() || null });
      setApproveModal(false);
      setApprovalNotesInput("");
      await refreshSelectedTask(selectedTask.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل اعتماد المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReworkTask = async () => {
    if (!selectedTask || !reworkNotesInput.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${selectedTask.id}/rework`, { review_notes: reworkNotesInput.trim() });
      setReworkModal(false);
      setReworkNotesInput("");
      await refreshSelectedTask(selectedTask.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل طلب التعديل على المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;
    try {
      setCommentSubmitting(true);
      await api.post(`/tasks/${selectedTask.id}/comments`, { content: newComment.trim() });
      setNewComment("");
      await refreshSelectedTask(selectedTask.id);
    } catch (err) {
      console.error("Failed to add comment", err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleWorkflowAction = async (taskId: string, action: "complete" | "clarify" | "reopen" | "cancel", reason?: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/${action}`, reason ? { reason } : {});
      await refreshSelectedTask(taskId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء على المهمة");
      setActionError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء على المهمة");
    } finally {
      setActionLoading(false);
    }
  };

  // User role check
  const isManagerOrAdmin = user?.is_superadmin || user?.roles?.some(r => ["Super Admin", "Company Admin", "IT Manager"].includes(r));

  // Authoritative KPIs from database summary endpoint (falls back to list counts before first response)
  const totalTasks = summary ? summary.total : tasks.length;
  const newCount = summary ? summary.new : tasks.filter(t => t.stage === "new" || ["Draft", "Assigned", "To Do", "Pending", "Pending Acceptance"].includes(t.status)).length;
  const inProgressCount = summary ? summary.in_progress : tasks.filter(t => t.stage === "in_progress" || ["Accepted", "In Progress", "Rework Required", "Blocked", "On Hold", "Submitted for Review"].includes(t.status)).length;
  const completedCount = summary ? summary.completed : tasks.filter(t => t.stage === "completed" || ["Completed", "Done", "Approved / Completed"].includes(t.status)).length;
  const overdueCount = summary ? summary.overdue : tasks.filter(t => t.is_overdue).length;
  const activeFilterCount = [search.trim(), statusFilter, priorityFilter, filterAssigneeId, overdueOnly ? "1" : ""].filter(Boolean).length;

  const resetAllFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setFilterAssigneeId("");
    setOverdueOnly(false);
    setSortBy("created_desc");
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="إدارة المهام التشغيلية والتشاركية"
          description="متابعة المهام الفنية، تتبع المعوقات، والتكامل الفوري مع Telegram والاعتماد متعدد المستويات"
          icon={<CheckSquareIcon className="w-5 h-5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setSelectedEmployee(null);
                  setFormData({
                    title: "",
                    description: "",
                    assigned_to_id: "",
                    priority: "Medium",
                    status: "Assigned",
                    start_date: "",
                    due_date: "",
                    related_asset_id: "",
                    notes: "",
                    notify_telegram: true,
                    is_voice_task: true,
                    voice_note_url: "",
                    voice_note_duration: 0,
                  });
                  setVoiceRecording(null);
                  setCreateMode("voice");
                  setCreateError(null);
                  setCreateModal(true);
                }}
                className="motion-control inline-flex items-center gap-1.5 bg-gradient-to-r from-[#123D32] to-[#187A5A] hover:opacity-95 text-white px-3.5 py-2.5 rounded-xl text-sm font-semibold shadow-xs transition-all cursor-pointer"
              >
                <span>🎙️</span>
                <span>تسجيل مهمة صوتية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setSelectedEmployee(null);
                  setFormData({
                    title: "",
                    description: "",
                    assigned_to_id: "",
                    priority: "Medium",
                    status: "Assigned",
                    start_date: "",
                    due_date: "",
                    related_asset_id: "",
                    notes: "",
                    notify_telegram: true,
                    is_voice_task: false,
                    voice_note_url: "",
                    voice_note_duration: 0,
                  });
                  setVoiceRecording(null);
                  setCreateMode("text");
                  setCreateError(null);
                  setCreateModal(true);
                }}
                className="motion-control inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xs transition-colors cursor-pointer"
              >
                <PlusIcon className="w-5 h-5 text-[#187A5A]" />
                إضافة مهمة نصية
              </button>
            </div>
          }
        />

        {/* Interactive Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="إجمالي المهام"
            value={totalTasks}
            icon={<CheckSquareIcon className="w-5 h-5" />}
            accentColor="border-blue-500"
            active={!statusFilter && !overdueOnly}
            onClick={() => { setStatusFilter(""); setOverdueOnly(false); }}
          />
          <StatsCard
            title="بانتظار القبول (جديدة)"
            value={newCount}
            icon={<ClockIcon className="w-5 h-5" />}
            accentColor="border-amber-500"
            active={statusFilter === "new"}
            onClick={() => { setStatusFilter(statusFilter === "new" ? "" : "new"); setOverdueOnly(false); }}
          />
          <StatsCard
            title="قيد التنفيذ"
            value={inProgressCount}
            icon={<ClockIcon className="w-5 h-5" />}
            accentColor="border-[#187A5A]"
            active={statusFilter === "in_progress"}
            onClick={() => { setStatusFilter(statusFilter === "in_progress" ? "" : "in_progress"); setOverdueOnly(false); }}
          />
          <StatsCard
            title="مكتملة"
            value={completedCount}
            icon={<CheckSquareIcon className="w-5 h-5" />}
            accentColor="border-emerald-600"
            active={statusFilter === "completed"}
            onClick={() => { setStatusFilter(statusFilter === "completed" ? "" : "completed"); setOverdueOnly(false); }}
          />
          <StatsCard
            title="متأخرة عن الموعد"
            value={overdueCount}
            icon={<AlertCircleIcon className="w-5 h-5" />}
            accentColor="border-rose-500"
            active={overdueOnly || statusFilter === "overdue"}
            onClick={() => { setOverdueOnly(!overdueOnly); if (!overdueOnly) setStatusFilter(""); }}
          />
        </div>

        {/* Filters & Tabs */}
        <DataToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="بحث في عنوان المهمة أو الوصف..."
          searchLabel="بحث في المهام"
          activeFilterCount={activeFilterCount}
          onResetFilters={resetAllFilters}
          onRefresh={() => void loadTasks()}
          refreshing={loading}
          topSlot={
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`motion-control px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer ${
                    filterMode === "all"
                      ? "bg-[#187A5A] text-white shadow-xs"
                      : "text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  جميع المهام
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("my")}
                  className={`motion-control px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer ${
                    filterMode === "my"
                      ? "bg-[#187A5A] text-white shadow-xs"
                      : "text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  مهامي المسندة إلي
                </button>
              </div>
              <span className="text-xs text-slate-600">
                النتائج المعروضة: <strong className="text-slate-900 font-bold"><bdi>{tasks.length}</bdi></strong>
              </span>
            </div>
          }
          filters={
            <>
              <select
                aria-label="تصفية حسب المرحلة أو الحالة"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-2 text-xs sm:text-sm rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="">جميع الحالات والمراحل ({summary?.total ?? totalTasks})</option>
                <optgroup label="مراحل دورة العمل الموحدة (Stages)">
                  <option value="active">🔄 المهام النشطة ({summary?.active ?? "-"})</option>
                  <option value="new">📨 بانتظار القبول / جديدة ({summary?.new ?? "-"})</option>
                  <option value="in_progress">🔵 قيد التنفيذ ({summary?.in_progress ?? "-"})</option>
                  <option value="waiting">🟡 بانتظار التوضيح ({summary?.waiting ?? "-"})</option>
                  <option value="overdue">🔴 متأخرة عن الموعد ({summary?.overdue ?? "-"})</option>
                  <option value="completed">🟢 مكتملة ({summary?.completed ?? "-"})</option>
                  <option value="rejected">⛔ مرفوضة ({summary?.rejected ?? "-"})</option>
                  <option value="cancelled">⚫ ملغاة ({summary?.cancelled ?? "-"})</option>
                </optgroup>
                <optgroup label="الحالات التفصيلية (Exact Status)">
                  <option value="Draft">مسودة (Draft)</option>
                  <option value="Assigned">تم الإسناد (Assigned)</option>
                  <option value="Accepted">تم القبول (Accepted)</option>
                  <option value="In Progress">قيد التنفيذ (In Progress)</option>
                  <option value="Blocked">معلّق لوجود معوق (Blocked)</option>
                  <option value="Waiting for Response">بانتظار التوضيح (Waiting)</option>
                  <option value="Submitted for Review">مرفوع للمراجعة (Review)</option>
                  <option value="Rework Required">مطلوب تعديلات (Rework)</option>
                  <option value="Completed">معتمد ومكتمل (Completed)</option>
                  <option value="Rejected">مرفوض (Rejected)</option>
                  <option value="Cancelled">ملغي (Cancelled)</option>
                </optgroup>
              </select>

              {filterEmployees.length > 0 && (
                <select
                  aria-label="تصفية حسب الموظف المسند إليه"
                  value={filterAssigneeId}
                  onChange={(e) => setFilterAssigneeId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 px-3 py-2 text-xs sm:text-sm rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
                >
                  <option value="">جميع الموظفين</option>
                  {filterEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              )}

              <select
                aria-label="تصفية حسب الأولوية"
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                className="bg-slate-50 border border-slate-200 px-3 py-2 text-xs sm:text-sm rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="">جميع الأولويات</option>
                <option value="Urgent">عاجل جداً (Urgent)</option>
                <option value="High">مرتفع (High)</option>
                <option value="Medium">متوسط (Medium)</option>
                <option value="Low">منخفض (Low)</option>
              </select>

              <select
                aria-label="ترتيب المهام"
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as "created_desc" | "due_asc" | "updated_desc"); setPage(1); }}
                className="bg-slate-50 border border-slate-200 px-3 py-2 text-xs sm:text-sm rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="created_desc">الترتيب: الأحدث أولاً</option>
                <option value="due_asc">الترتيب: الأقرب موعداً</option>
                <option value="updated_desc">الترتيب: آخر تحديث</option>
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>المتأخرة فقط</span>
              </label>
            </>
          }
          bottomSlot={
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
              {[
                { key: "", label: "الكل", count: summary?.total },
                { key: "active", label: "🔄 النشطة", count: summary?.active },
                { key: "new", label: "📨 بانتظار القبول", count: summary?.new },
                { key: "in_progress", label: "🔵 قيد التنفيذ", count: summary?.in_progress },
                { key: "waiting", label: "🟡 بانتظار التوضيح", count: summary?.waiting },
                { key: "overdue", label: "🔴 المتأخرة", count: summary?.overdue },
                { key: "completed", label: "🟢 المكتملة", count: summary?.completed },
                { key: "rejected", label: "⛔ المرفوضة", count: summary?.rejected },
              ].map((chip) => (
                <button
                  key={chip.key || "all"}
                  type="button"
                  onClick={() => { setStatusFilter(chip.key); setPage(1); }}
                  className={`motion-control inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    statusFilter === chip.key
                      ? "bg-[#123D32] text-white border-[#123D32]"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>{chip.label}</span>
                  {chip.count !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${statusFilter === chip.key ? "bg-white/20 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
                      {chip.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          }
        />

        {loadError && (
          <AlertBanner
            variant="error"
            title="تعذر تحديث قائمة المهام"
            message={loadError}
            onRetry={() => void loadTasks()}
            onDismiss={() => setLoadError(null)}
          />
        )}

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="motion-toast p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm font-bold flex items-center justify-between shadow-xs">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              aria-label="إغلاق الرسالة"
              className="text-emerald-700 hover:text-emerald-950 font-mono text-xs px-2 py-1 rounded hover:bg-emerald-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Task List */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {loading ? (
            <TableSkeleton variant="list" rows={5} />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquareIcon className="w-7 h-7" />}
              title="لا توجد مهام تطابق معايير البحث"
              description="يمكنك تعديل فلاتر الحالة أو إنشاء مهمة جديدة لمتابعة الأعمال الفنية"
              action={
                activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="motion-control px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    عرض جميع المهام
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="motion-task-row p-5 hover:bg-gray-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      {task.stage_label && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {task.stage_label}
                        </span>
                      )}
                      {task.reference && (
                        <span dir="ltr" className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          #{task.reference}
                        </span>
                      )}
                      
                      {task.is_voice_task && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          🎙️ مهمة صوتية {task.voice_note_duration ? `(${task.voice_note_duration} ث)` : ""}
                        </span>
                      )}
                      
                      {task.is_blocked && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          ⚠️ معلّق: {task.blocker_reason}
                        </span>
                      )}

                      {task.rework_count > 0 && task.status === "Rework Required" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                          🔄 جولة تعديل #{task.rework_count}
                        </span>
                      )}

                      {task.is_overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                          <AlertCircleIcon className="w-3.5 h-3.5" />
                          متأخرة عن الموعد
                        </span>
                      )}

                      {task.acknowledged_at ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          ✓ تم تأكيد الاستلام ({task.acknowledged_at.slice(0, 10)})
                        </span>
                      ) : task.assigned_to_name && (task.stage === "new" || task.status === "Assigned" || task.status === "To Do" || task.status === "Pending" || task.status === "Pending Acceptance") ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300">
                          ⏳ بانتظار تأكيد الاستلام
                        </span>
                      ) : null}

                      <h3 
                        onClick={() => handleOpenDetail(task.id)}
                        className="text-base font-semibold text-gray-900 cursor-pointer hover:text-[#187A5A] transition-colors"
                      >
                        {task.title}
                      </h3>
                    </div>

                    {task.description && (
                      <p className="text-sm text-gray-600 line-clamp-1">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                      {task.assigned_to_name && (
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                          المسند إليه: <strong className="text-slate-900">{task.assigned_to_name}</strong>
                        </span>
                      )}
                      {task.reviewer_name && (
                        <span className="inline-flex items-center gap-1 text-purple-800">
                          المراجع / المعتمد: <strong>{task.reviewer_name}</strong>
                        </span>
                      )}
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-slate-500" />
                          موعد التسليم: <bdi dir="ltr">{task.due_date}</bdi>
                        </span>
                      )}
                      {task.comments_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-[#187A5A]">
                          <MessageSquareIcon className="w-3.5 h-3.5" />
                          {task.comments_count} تعليقات
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar in Table */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(task.stage === "new" || task.status === "Assigned" || task.status === "To Do") && (
                      <button
                        onClick={() => handleAcceptTask(task.id)}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                      >
                        قبول المهمة
                      </button>
                    )}

                    {task.status === "Accepted" && (
                      <button
                        onClick={() => handleStartTask(task.id)}
                        className="px-3 py-1.5 text-xs font-medium text-[#187A5A] bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                      >
                        بدء العمل
                      </button>
                    )}

                    {(task.stage === "in_progress" || task.stage === "waiting" || task.status === "In Progress") && task.status !== "Submitted for Review" && (
                      <button
                        onClick={() => handleWorkflowAction(task.id, "complete")}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg border border-emerald-300 transition-colors"
                      >
                        ☑️ إنهاء المهمة
                      </button>
                    )}

                    {task.status === "In Progress" && (
                      <button
                        onClick={() => handleOpenDetail(task.id)}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
                      >
                        رفع للمراجعة
                      </button>
                    )}

                    {task.status === "Submitted for Review" && isManagerOrAdmin && (
                      <button
                        onClick={() => handleOpenDetail(task.id)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-[#187A5A] hover:bg-[#123D32] rounded-lg transition-colors"
                      >
                        مراجعة واعتماد
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenDetail(task.id)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      التفاصيل وسير العمل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <span>
                صفحة <strong className="text-slate-900">{page}</strong> من <strong className="text-slate-900">{totalPages}</strong> (إجمالي النتائج المطابقة: <strong className="text-slate-900">{totalFiltered}</strong>)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 cursor-pointer"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 cursor-pointer"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Create Task */}
        <Modal
          isOpen={createModal}
          onClose={() => setCreateModal(false)}
          title={editingTask ? "تعديل المهمة" : (createMode === "voice" ? "تسجيل مهمة صوتية جديدة 🎙️" : "إضافة مهمة جديدة")}
          maxWidth="max-w-2xl"
        >
          {!editingTask && (
            <div className="flex border-b border-gray-200 mb-4 gap-2">
              <button
                type="button"
                onClick={() => setCreateMode("text")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                  createMode === "text"
                    ? "border-[#187A5A] text-[#123D32]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>📝</span>
                <span>مهمة نصية اعتيادية</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("voice")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                  createMode === "voice"
                    ? "border-[#187A5A] text-[#123D32]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>🎙️</span>
                <span>مهمة صوتية (WhatsApp-style)</span>
              </button>
            </div>
          )}

          <form onSubmit={handleCreateTask} className="space-y-4">
            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <span className="font-bold shrink-0">⚠️ خطأ:</span>
                <span className="leading-relaxed">{createError}</span>
              </div>
            )}

            {createMode === "voice" && !editingTask ? (
              <div className="space-y-4">
                <VoiceTaskRecorder
                  onRecordingComplete={setVoiceRecording}
                  disabled={createLoading}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    عنوان المهمة الصوتية <span className="text-gray-400 font-normal">(اختياري — سيتم تعيين عنوان تلقائي في حال تركه فارغاً)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="مثال: تعليمات فحص السيرفر الصباحية"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    عنوان المهمة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={createMode !== "voice"}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="مثال: ترقية خوادم قواعد البيانات، تهيئة طابعات القسم المالي"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">وصف المهمة</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="تفاصيل وإرشادات تنفيذ المهمة الفنية..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <EmployeeCombobox
                  value={formData.assigned_to_id}
                  initialName={editingTask?.assigned_to_name}
                  companyId={currentCompany?.id}
                  onResolve={setSelectedEmployee}
                  onChange={(employee) => {
                    setSelectedEmployee(employee);
                    setFormData(current => ({ ...current, assigned_to_id: employee?.id || "", notify_telegram: employee?.is_telegram_linked ?? true }));
                  }}
                />

                {/* Live Telegram Connection & Notification Capability Indicator */}
                {formData.assigned_to_id && (() => {
                  const selectedEmp = selectedEmployee;
                  if (!selectedEmp) return null;
                  return (
                    <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-700">حالة الربط بـ Telegram:</span>
                        {selectedEmp.is_telegram_linked ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            🟢 مرتبط ({selectedEmp.telegram_username ? `@${selectedEmp.telegram_username}` : "مفعل ومؤكد"})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            ⚪ غير مرتبط
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-gray-700">
                          <input
                            type="checkbox"
                            checked={formData.notify_telegram && !!selectedEmp.is_telegram_linked}
                            disabled={!selectedEmp.is_telegram_linked}
                            onChange={(e) => setFormData({ ...formData, notify_telegram: e.target.checked })}
                            className="rounded border-gray-300 text-[#187A5A] focus:ring-[#187A5A]"
                          />
                          <span>إرسال إشعار فوري عبر Telegram</span>
                        </label>
                        {selectedEmp.is_telegram_linked ? (
                          <span className="text-[10px] text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded font-medium">متاح للإرسال</span>
                        ) : (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">يتطلب ربط الحساب أولاً</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الأصل المرتبط</label>
                <select
                  value={formData.related_asset_id}
                  onChange={(e) => setFormData({ ...formData, related_asset_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="">-- غير مرتبط بأصل --</option>
                  {assets.map((ast) => (
                    <option key={ast.id} value={ast.id}>{ast.asset_name} ({ast.asset_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">مستوى الأولوية</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="Urgent">عاجل جداً (Urgent)</option>
                  <option value="High">مرتفع (High)</option>
                  <option value="Medium">متوسط (Medium)</option>
                  <option value="Low">منخفض (Low)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">حالة البداية</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="Assigned">تم الإسناد (Assigned)</option>
                  <option value="Draft">مسودة (Draft)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">تاريخ البدء</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">تاريخ الاستحقاق (الموعد النهائي)</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ملاحظات إضافية</label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <span className="font-bold shrink-0">⚠️ خطأ:</span>
                <span className="leading-relaxed">{createError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="px-5 py-2 text-sm font-medium text-white bg-[#187A5A] hover:bg-[#123D32] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-2"
              >
                {createLoading && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {createLoading
                  ? (createMode === "voice" ? "جاري رفع التسجيل الصوتي وإرسال المهمة..." : "جاري الحفظ والمعالجة...")
                  : editingTask
                  ? "حفظ تعديلات المهمة"
                  : createMode === "voice"
                  ? "إرسال المهمة الصوتية 🎙️"
                  : "حفظ وإنشاء المهمة"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Task Detail & Collaboration Drawer */}
        {selectedTask && (
          <Modal
            isOpen={detailModal}
            onClose={() => setDetailModal(false)}
            title={`تفاصيل المهمة: ${selectedTask.title}`}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-6">
              {isManagerOrAdmin && <button type="button" className="rounded-lg bg-[#187A5A] px-4 py-2 text-sm text-white" onClick={() => {
                setEditingTask(selectedTask); setSelectedEmployee(null); setCreateError(null);
                setFormData({
                  title: selectedTask.title,
                  description: selectedTask.description || "",
                  assigned_to_id: selectedTask.assigned_to_id || "",
                  priority: selectedTask.priority,
                  status: selectedTask.status,
                  start_date: selectedTask.start_date || "",
                  due_date: selectedTask.due_date || "",
                  related_asset_id: selectedTask.related_asset_id || "",
                  notes: selectedTask.notes || "",
                  notify_telegram: true,
                  is_voice_task: Boolean(selectedTask.is_voice_task),
                  voice_note_url: selectedTask.voice_note_url || "",
                  voice_note_duration: selectedTask.voice_note_duration || 0,
                });
                setDetailModal(false); setCreateModal(true);
              }}>تعديل المهمة والإسناد</button>}
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircleIcon className="w-4 h-4 text-red-500" />
                  {actionError}
                </div>
              )}

              {/* Blocker Alert Banner */}
              {selectedTask.is_blocked && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <h4 className="text-sm font-bold text-rose-800">المهمة معلقة لوجود معوّق تقني أو لوجستي</h4>
                      <p className="text-xs text-rose-700 mt-0.5">{selectedTask.blocker_reason}</p>
                      {selectedTask.blocked_at && (
                        <span className="text-[10px] text-rose-500 block mt-1">
                          تاريخ التعليق: {selectedTask.blocked_at.slice(0, 16).replace("T", " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblockTask(selectedTask.id)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm whitespace-nowrap self-end sm:self-center"
                  >
                    فك التعليق واستئناف العمل
                  </button>
                </div>
              )}

              {/* Rework Alert Banner */}
              {selectedTask.status === "Rework Required" && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-orange-800 font-bold text-sm">
                    <span>🔄</span>
                    <h4>مطلوب تعديلات إضافية من قِبل المسؤول (جولة تعديل #{selectedTask.rework_count})</h4>
                  </div>
                  <p className="text-xs text-orange-700 bg-white/80 p-2.5 rounded-lg border border-orange-100">
                    {selectedTask.review_notes || "يرجى مراجعة الملاحظات وإعادة العمل على المهمة ثم رفعها مجدداً."}
                  </p>
                </div>
              )}

              {/* Submitted for Review Alert Banner */}
              {selectedTask.status === "Submitted for Review" && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    <div>
                      <h4 className="text-sm font-bold text-purple-900">المهمة مكتملة فنياً وبانتظار المراجعة والاعتماد</h4>
                      <p className="text-xs text-purple-700">لا تعتبر المهمة مكتملة نهائياً حتى يتم اعتمادها من قِبل مدير النظام أو المسؤول.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed Status Card */}
              {(selectedTask.stage === "completed" || selectedTask.status === "Completed") && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">تم اعتماد واكتمال المهمة بنجاح</h4>
                    <p className="text-xs text-emerald-700">
                      معتمدة بواسطة: <strong>{selectedTask.reviewer_name || selectedTask.assigned_to_name || "المسؤول"}</strong>
                      {selectedTask.completed_at && ` في ${selectedTask.completed_at.slice(0, 16).replace("T", " ")}`}
                    </p>
                    {selectedTask.review_notes && (
                      <p className="text-xs text-emerald-800 mt-1 italic">ملاحظات الاعتماد: {selectedTask.review_notes}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Rejected Status Card */}
              {(selectedTask.stage === "rejected" || selectedTask.status === "Rejected") && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl">⛔</span>
                  <div>
                    <h4 className="text-sm font-bold text-rose-900">تم رفض المهمة</h4>
                    <p className="text-xs text-rose-700">
                      {selectedTask.review_notes || selectedTask.blocker_reason || "تم تسجيل رفض المهمة من قبل الموظف المسند إليه."}
                    </p>
                  </div>
                </div>
              )}

              {/* Task Meta Information Card */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={selectedTask.priority} />
                    <StatusBadge status={selectedTask.status} />
                    {selectedTask.is_overdue && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                        متأخرة
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    أنشئت بواسطة: {selectedTask.assigned_by_name || "النظام"}
                  </div>
                </div>

                {selectedTask.is_voice_task && selectedTask.voice_note_url && (
                  <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm">🎙️</span>
                        <span>الرسالة الصوتية للمهمة (Voice Task Note)</span>
                      </span>
                      {selectedTask.voice_note_duration ? (
                        <span className="text-gray-500 font-mono text-[11px]">
                          المدة: {selectedTask.voice_note_duration} ثانية
                        </span>
                      ) : null}
                    </div>
                    <VoiceTaskPlayer
                      src={selectedTask.voice_note_url}
                      duration={selectedTask.voice_note_duration}
                    />
                  </div>
                )}

                {selectedTask.description && (
                  <p className="text-sm text-gray-800 leading-relaxed bg-white p-3 rounded-lg border border-gray-100">
                    {selectedTask.description}
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400 block">المسند إليه:</span>
                    <strong className="text-gray-800">{selectedTask.assigned_to_name || "غير محدد"}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block">تاريخ البدء:</span>
                    <span>{selectedTask.start_date || "-"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">تاريخ الاستحقاق:</span>
                    <span className="font-semibold text-gray-800">{selectedTask.due_date || "-"}</span>
                  </div>
                  {selectedTask.accepted_at && (
                    <div>
                      <span className="text-gray-400 block">تاريخ القبول:</span>
                      <span className="text-blue-700">{selectedTask.accepted_at.slice(0, 16).replace("T", " ")}</span>
                    </div>
                  )}
                  {selectedTask.submitted_for_review_at && (
                    <div>
                      <span className="text-gray-400 block">تاريخ الرفع للمراجعة:</span>
                      <span className="text-purple-700">{selectedTask.submitted_for_review_at.slice(0, 16).replace("T", " ")}</span>
                    </div>
                  )}
                  {selectedTask.related_asset_name && (
                    <div>
                      <span className="text-gray-400 block">الأصل المرتبط:</span>
                      <span>{selectedTask.related_asset_name}</span>
                    </div>
                  )}
                  {selectedTask.acknowledged_at && (
                    <div>
                      <span className="text-gray-400 block">تأكيد استلام الموظف:</span>
                      <span className="text-emerald-700 font-bold">
                        ✓ {selectedTask.acknowledged_at.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                  )}

                  {selectedTask.related_ticket_id && (
                    <div className="col-span-2 sm:col-span-3 bg-sky-50 border border-sky-200 p-2.5 rounded-lg flex items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-2 text-xs text-sky-950 font-medium">
                        <LifeBuoyIcon className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>
                          تذكرة الدعم الفني المرتبطة: <strong className="font-mono text-sky-800">{selectedTask.related_ticket_number || "تذكرة دعم"}</strong>
                          {selectedTask.related_ticket_title ? ` — ${selectedTask.related_ticket_title}` : ""}
                        </span>
                      </div>
                      <Link
                        href={`/tickets?search=${encodeURIComponent(selectedTask.related_ticket_number || "")}`}
                        className="motion-control px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-bold whitespace-nowrap"
                      >
                        عرض التذكرة &larr;
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Telegram Notification & Acknowledgement Pipeline Card */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✈️</span>
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      إشعار Telegram وتأكيد استلام المهمة (Delivery & Acknowledgement)
                    </h4>
                  </div>
                  {selectedTask.assigned_to_id && (
                    <button
                      onClick={() => handleResendTelegram(selectedTask.id)}
                      disabled={resendLoading}
                      className="text-xs font-medium text-[#187A5A] hover:text-[#123D32] bg-white hover:bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {resendLoading ? "جاري الإرسال..." : "🔄 إعادة إرسال الإشعار لـ Telegram"}
                    </button>
                  )}
                </div>

                {resendMessage && (
                  <div className="text-xs p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                    {resendMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-gray-500 block">حالة التسليم عبر Telegram:</span>
                    <div className="flex items-center gap-2">
                      {selectedTask.telegram_info?.delivery_status === "Sent" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          🟢 تم الإرسال للموظف
                        </span>
                      ) : selectedTask.telegram_info?.delivery_status === "Pending" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          🟡 بانتظار الإرسال
                        </span>
                      ) : selectedTask.telegram_info?.delivery_status === "Failed" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          🔴 تعذر التسليم
                        </span>
                      ) : (
                        <span className="text-gray-500 font-medium">
                          {selectedTask.telegram_info?.is_employee_linked ? "تم تجهيز الإشعار" : "الموظف غير مرتبط بـ Telegram"}
                        </span>
                      )}
                      {selectedTask.telegram_info?.sent_at && (
                        <span className="text-[11px] text-gray-400">
                          ({selectedTask.telegram_info.sent_at.slice(0, 16).replace("T", " ")})
                        </span>
                      )}
                    </div>
                    {selectedTask.telegram_info?.last_error && selectedTask.telegram_info.delivery_status === "Failed" && (
                      <p className="text-[11px] text-rose-600 mt-1">{selectedTask.telegram_info.last_error}</p>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-gray-500 block">تأكيد استلام الموظف للمهمة:</span>
                    {selectedTask.acknowledged_at ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                          ✓ تم تأكيد الاستلام من الفني
                        </span>
                        <span className="text-[11px] text-emerald-800 font-medium">
                          {selectedTask.acknowledged_at.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-700">
                        <span className="text-sm">⏳</span>
                        <span className="font-medium">بانتظار تأكيد الاستلام من الفني عبر Telegram</span>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      * تأكيد الاستلام يثبت إشعار الفني وبدء المتابعة، ولا يعني اكتمال تنفيذ المهمة.
                    </p>
                  </div>
                </div>
              </div>

              {/* Collaboration Interactive Action Bar */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  إجراءات دورة حياة المهمة (Workflow Actions)
                </h4>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Step 1: Accept Task */}
                  {selectedTask.status === "Assigned" && (
                    <button
                      onClick={() => handleAcceptTask(selectedTask.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                    >
                      ✓ قبول المهمة (Accept)
                    </button>
                  )}

                  {/* Step 2: Start Task */}
                  {(selectedTask.status === "Assigned" || selectedTask.status === "Accepted" || selectedTask.status === "Rework Required") && (
                    <button
                      onClick={() => handleStartTask(selectedTask.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#187A5A] hover:bg-[#123D32] rounded-lg shadow-sm transition-colors"
                    >
                      🚀 بدء التنفيذ (Start Work)
                    </button>
                  )}

                  {/* Step 3: Block Task with Reason */}
                  {selectedTask.status === "In Progress" && (
                    <button
                      onClick={() => setBlockModal(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    >
                      ⚠️ تعليق لوجود معوّق (Block)
                    </button>
                  )}

                  {/* Step 4: Submit for Review (CRITICAL: Doesn't auto-complete) */}
                  {(selectedTask.status === "In Progress" || selectedTask.status === "Rework Required") && (
                    <button
                      onClick={() => setSubmitModal(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors"
                    >
                      📋 رفع للمراجعة والاعتماد (Submit for Review)
                    </button>
                  )}

                  {/* Direct Complete Action (Unified Workflow) */}
                  {(selectedTask.stage === "new" || selectedTask.stage === "in_progress" || selectedTask.stage === "waiting") && selectedTask.status !== "Submitted for Review" && (
                    <button
                      onClick={() => handleWorkflowAction(selectedTask.id, "complete")}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                    >
                      ☑️ إنهاء المهمة (Complete)
                    </button>
                  )}

                  {/* Manager Reopen / Cancel Actions */}
                  {isManagerOrAdmin && (selectedTask.stage === "completed" || selectedTask.stage === "rejected" || selectedTask.stage === "cancelled") && (
                    <button
                      onClick={() => handleWorkflowAction(selectedTask.id, "reopen")}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                    >
                      ♻️ إعادة فتح المهمة (Reopen)
                    </button>
                  )}

                  {/* Step 5: Manager Approval & Rework Request (RBAC Enforced) */}
                  {selectedTask.status === "Submitted for Review" && isManagerOrAdmin && (
                    <>
                      <button
                        onClick={() => setApproveModal(true)}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#187A5A] hover:bg-[#123D32] rounded-lg shadow-sm transition-colors"
                      >
                        🎉 اعتماد واكتمال المهمة (Approve)
                      </button>
                      <button
                        onClick={() => setReworkModal(true)}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-orange-800 bg-orange-100 hover:bg-orange-200 border border-orange-300 rounded-lg transition-colors"
                      >
                        🔄 طلب تعديلات إضافية (Rework)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquareIcon className="w-4 h-4 text-[#187A5A]" />
                  سجل التعليقات والتحديثات الفنية ({selectedTask.comments?.length || 0})
                </h4>

                <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                  {selectedTask.comments && selectedTask.comments.length > 0 ? (
                    selectedTask.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 border border-gray-200/80 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
                          <span className="font-bold text-gray-800">{comment.user_name}</span>
                          <span>{comment.created_at?.slice(0, 16).replace("T", " ")}</span>
                        </div>
                        <p className="text-gray-700 leading-normal">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 py-3 text-center">لا توجد تعليقات سابقة على هذه المهمة</p>
                  )}
                </div>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="اكتب تعليقاً أو استفساراً تشغيلياً..."
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  />
                  <button
                    type="submit"
                    disabled={commentSubmitting || !newComment.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#187A5A] hover:bg-[#123D32] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <SendIcon className="w-4 h-4" />
                    إرسال
                  </button>
                </form>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Block Task */}
        <Modal
          isOpen={blockModal}
          onClose={() => setBlockModal(false)}
          title="تسجيل معوّق وإيقاف المهمة مؤقتاً"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              يرجى توضيح سبب المعوّق التقني أو اللوجستي بدقة ليتم إشعار مدير النظام والمشرفين لمساعدتك في إزالته:
            </p>
            <textarea
              rows={3}
              required
              value={blockerReasonInput}
              onChange={(e) => setBlockerReasonInput(e.target.value)}
              placeholder="مثال: انقطاع كابل الألياف، عدم توفر صلاحيات المسؤول على الخادم، انتظار رد المورد..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setBlockModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleBlockTask}
                disabled={actionLoading || !blockerReasonInput.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                تأكيد تعليق المهمة
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal: Submit for Review */}
        <Modal
          isOpen={submitModal}
          onClose={() => setSubmitModal(false)}
          title="رفع المهمة للمراجعة والاعتماد الإداري"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              أدخل ملخص الإنجاز والنتائج الفنية التي تم تحقيقها للمراجع:
            </p>
            <textarea
              rows={3}
              value={submissionNotesInput}
              onChange={(e) => setSubmissionNotesInput(e.target.value)}
              placeholder="مثال: تم إكمال تثبيت الحزم، واختبار الخدمة بنجاح، كافة الفحوصات سليمة..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setSubmitModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                تأكيد الرفع للمراجعة
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal: Request Rework */}
        <Modal
          isOpen={reworkModal}
          onClose={() => setReworkModal(false)}
          title="طلب تعديلات إضافية على المهمة (Rework)"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              اكتب التوجيهات والملاحظات الإلزامية التي يجب على الفني تعديلها قبل إعادة الاعتماد:
            </p>
            <textarea
              rows={3}
              required
              value={reworkNotesInput}
              onChange={(e) => setReworkNotesInput(e.target.value)}
              placeholder="مثال: يرجى إضافة التقرير الفني لاختبار الأداء وضبط جدار الحماية..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setReworkModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReworkTask}
                disabled={actionLoading || !reworkNotesInput.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                إرسال طلب التعديل
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal: Approve Task */}
        <Modal
          isOpen={approveModal}
          onClose={() => setApproveModal(false)}
          title="الاعتماد النهائي وإكمال المهمة"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              هل أنت متأكد من اكتمال العمل واعتماد المهمة نهائياً وإغلاقها؟ يمكنك تدوين ملاحظات الاعتماد:
            </p>
            <textarea
              rows={2}
              value={approvalNotesInput}
              onChange={(e) => setApprovalNotesInput(e.target.value)}
              placeholder="ملاحظات الاعتماد (اختياري)..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setApproveModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApproveTask}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-[#187A5A] hover:bg-[#123D32] disabled:opacity-50 rounded-lg shadow-sm"
              >
                اعتماد وإكمال المهمة
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
