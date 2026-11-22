"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


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
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  SlidersHorizontal,
  Plus,
  ListTodo,
  Search,
  List,
  LayoutGrid,
  CalendarDays,
  GanttChartSquare,
  Users as UsersIcon,
  Sparkles,
  Filter,
  X,
  Mic,
  Send,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/context/ToastContext";
import EmployeeCombobox, { type EmployeeOption } from "@/components/ui/EmployeeCombobox";
import VoiceTaskRecorder, { type VoiceRecordingResult } from "@/components/tasks/VoiceTaskRecorder";
import VoiceTaskPlayer from "@/components/tasks/VoiceTaskPlayer";
import { TasksKpiCards } from "@/components/tasks/TasksKpiCards";
import { QuickComposerMenu, type ComposerActionType } from "@/components/tasks/QuickComposerMenu";
import { TasksSplitDrawer, type SplitDrawerTask } from "@/components/tasks/TasksSplitDrawer";
import { TasksDataTable, type TaskRowItem } from "@/components/tasks/TasksDataTable";
import MasterDetailLayout from "@/components/ui/MasterDetailLayout";
import TaskKanbanView from "@/components/tasks/TaskKanbanView";
import TaskCalendarView from "@/components/tasks/TaskCalendarView";
import TaskAnalyticsView from "@/components/tasks/TaskAnalyticsView";
import RelativeScheduler from "@/components/tasks/RelativeScheduler";
import { MobileToolbar } from "@/components/mobile/MobileToolbar";
import { MobileFilterSheet } from "@/components/mobile/MobileFilterSheet";
import { MobileTaskCard } from "@/components/mobile/MobileTaskCard";

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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
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
  const [createMode, setCreateMode] = useState<"text" | "voice" | "broadcast">("text");
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecordingResult | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAdvancedVoiceFields, setShowAdvancedVoiceFields] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Broadcast & Fast Assignment (Phase 2 & 3)
  const [broadcastData, setBroadcastData] = useState<{
    title: string;
    description: string;
    priority: string;
    broadcast_mode: "individual" | "shared" | "announcement";
    recipients: EmployeeOption[];
    accountable_id: string;
    deadline_type: "duration" | "fixed_datetime";
    target_duration_minutes: number;
    due_date: string;
    notify_telegram: boolean;
  }>({
    title: "",
    description: "",
    priority: "Medium",
    broadcast_mode: "individual",
    recipients: [],
    accountable_id: "",
    deadline_type: "duration",
    target_duration_minutes: 4320,
    due_date: "",
    notify_telegram: true,
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
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

  // Desktop Enterprise UI 2.0 States (References 1 & 2)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<"list" | "kanban" | "calendar" | "timeline">("list");
  const [activeScopeTab, setActiveScopeTab] = useState<"all" | "my" | "assigned_by_me">("all");
  const [selectedSplitTaskId, setSelectedSplitTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const handleComposerAction = useCallback((action: ComposerActionType) => {
    switch (action) {
      case "new_task":
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
        break;
      case "broadcast":
        setEditingTask(null);
        setCreateMode("broadcast");
        setBroadcastData((prev) => ({ ...prev, broadcast_mode: "individual" }));
        setCreateModal(true);
        break;
      case "announcement":
        setEditingTask(null);
        setCreateMode("broadcast");
        setBroadcastData((prev) => ({ ...prev, broadcast_mode: "announcement" }));
        setCreateModal(true);
        break;
      case "template":
        setEditingTask(null);
        setSelectedEmployee(null);
        setFormData({
          title: "معالجة عطل الخادم الرئيسي",
          description: "استعادة الخدمة لمستخدمي النظام والتحقق من استقرار الخادم ومنع تكرار العطل.",
          assigned_to_id: "",
          priority: "Critical",
          status: "Assigned",
          start_date: "",
          due_date: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
          related_asset_id: "",
          notes: "أولوية قصوى وفق معايير الحوادث الحرجة ITIL",
          notify_telegram: true,
          is_voice_task: false,
          voice_note_url: "",
          voice_note_duration: 0,
        });
        setCreateMode("text");
        setCreateModal(true);
        toast.info("تم تحميل قالب المهمة بنجاح");
        break;
      case "voice":
        setEditingTask(null);
        setSelectedEmployee(null);
        setCreateMode("voice");
        setCreateModal(true);
        break;
      case "camera":
        cameraInputRef.current?.click();
        break;
      case "file_upload":
        fileInputRef.current?.click();
        break;
    }
  }, [toast]);

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

        if (!formData.assigned_to_id) {
          const msg = "يرجى اختيار الموظف أو الفني المسند إليه حتى يتم إرسال المهمة الصوتية وإشعاره فوراً.";
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
      let successMsg = "تم إنشاء المهمة بنجاح";
      if (editingTask) {
        successMsg = "تم تحديث المهمة والإسناد بنجاح";
      } else if (isVoice) {
        successMsg = "تم تسجيل وإرسال المهمة الصوتية بنجاح";
      } else if (dStatus === "Sent") {
        successMsg = "تم إنشاء المهمة بنجاح، وتم تسليم إشعار Telegram للموظف فوراً!";
      } else if (dStatus === "Pending") {
        successMsg = "تم إنشاء المهمة بنجاح، وإدراج إشعار Telegram في قائمة الإرسال الفوري";
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

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastData.recipients.length === 0) {
      setBroadcastError("يرجى اختيار موظف واحد على الأقل في قائمة المستلمين");
      return;
    }
    if (!broadcastData.title.trim()) {
      setBroadcastError("يرجى كتابة عنوان المهمة أو التعميم");
      return;
    }
    setBroadcastLoading(true);
    setBroadcastError(null);
    try {
      const payload = {
        title: broadcastData.title.trim(),
        description: broadcastData.description.trim() || undefined,
        priority: broadcastData.priority,
        broadcast_mode: broadcastData.broadcast_mode,
        recipient_ids: broadcastData.recipients.map((r) => r.id),
        accountable_id: broadcastData.broadcast_mode === "shared" ? (broadcastData.accountable_id || broadcastData.recipients[0]?.id) : undefined,
        deadline_type: broadcastData.deadline_type,
        target_duration_minutes: broadcastData.target_duration_minutes,
        due_date: broadcastData.due_date || undefined,
        notify_telegram: broadcastData.notify_telegram,
      };
      const res = await api.post<{ broadcast_group_id: string; mode: string }>("/tasks/broadcast", payload);
      const msg = res.message || "تم تنفيذ البث وتوزيع المهام بنجاح!";
      setToastMessage(msg);
      toast.success(msg);
      setTimeout(() => setToastMessage(null), 6000);
      setCreateModal(false);
      setBroadcastData({
        title: "",
        description: "",
        priority: "Medium",
        broadcast_mode: "individual",
        recipients: [],
        accountable_id: "",
        deadline_type: "duration",
        target_duration_minutes: 4320,
        due_date: "",
        notify_telegram: true,
      });
      setPage(1);
      loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل تنفيذ البث";
      setBroadcastError(msg);
      toast.error(msg);
    } finally {
      setBroadcastLoading(false);
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

  // User role check & adaptive behavior
  const { roleCategory, isEmployee, isTechnician, isManager, isAdmin, canAssignTasks } = useUserRole();
  const isManagerOrAdmin = !isEmployee && (isManager || isAdmin || user?.is_superadmin || user?.roles?.some(r => ["Super Admin", "Company Admin", "IT Manager"].includes(r)));

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

  const userDisplayName =
    user?.employee?.full_name || user?.full_name || user?.username || "فهد";
  const userFirstName = userDisplayName.split(" ")[0] || "فهد";
  const userInitial = userFirstName.charAt(0) || "ف";

  return (
    <DashboardLayout>
      <div className="space-y-4 lg:space-y-6">
        {/* Mobile Presentation Header (Reference Images 2, 4, 7) */}
        <div className="block lg:hidden space-y-3.5 pt-1">
          {/* Greeting Row (Avatar & Greeting grouped on right) */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/[0.15] dark:bg-primary/25 text-primary font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
              {userInitial}
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                مرحباً، {userFirstName}
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                أعمالك اليوم
              </p>
            </div>
          </div>

          {/* 3 Metric Tiles Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* المهام اليوم */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter("");
                setOverdueOnly(false);
                setFilterMode("all");
              }}
              className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/60 dark:border-emerald-900/40 rounded-2xl p-3 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-emerald-500 mb-0.5">
                <CheckCircle2 size={18} strokeWidth={2.4} />
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                المهام اليوم
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {summary?.total ?? totalTasks}
              </div>
            </button>

            {/* قيد التنفيذ */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter("in_progress");
                setOverdueOnly(false);
              }}
              className="bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100/60 dark:border-sky-900/40 rounded-2xl p-3 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-sky-500 mb-0.5">
                <Clock size={18} strokeWidth={2.4} />
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                قيد التنفيذ
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {inProgressCount}
              </div>
            </button>

            {/* متأخرة */}
            <button
              type="button"
              onClick={() => {
                setOverdueOnly(true);
                setStatusFilter("");
              }}
              className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/60 dark:border-rose-900/40 rounded-2xl p-3 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-rose-500 mb-0.5">
                <AlertCircle size={18} strokeWidth={2.4} />
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                متأخرة
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {overdueCount}
              </div>
            </button>
          </div>

          {/* Section Title & Filter Chips */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900 dark:text-white">
                <ListTodo size={16} className="text-primary" />
                <span>المهام</span>
              </div>
            </div>

            {/* Filter Chips Horizontal Pill List */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {/* الكل */}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("");
                  setOverdueOnly(false);
                  setFilterMode("all");
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                  !statusFilter && !overdueOnly && filterMode === "all"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                الكل
              </button>

              {/* مهامي */}
              <button
                type="button"
                onClick={() => setFilterMode("my")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                  filterMode === "my"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                مهامي
              </button>

              {/* قيد التنفيذ */}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === "in_progress" ? "" : "in_progress");
                  setOverdueOnly(false);
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                  statusFilter === "in_progress"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                قيد التنفيذ
              </button>

              {/* المتأخرة */}
              <button
                type="button"
                onClick={() => {
                  setOverdueOnly(!overdueOnly);
                  if (!overdueOnly) setStatusFilter("");
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                  overdueOnly || statusFilter === "overdue"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                المتأخرة
              </button>
            </div>
          </div>

          {/* Search & Filter Bar (Search on right, filter button on left) */}
          <div className="flex items-center gap-2">
            {/* Search Input Box */}
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في المهام..."
                className="w-full h-11 pr-4 pl-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 shadow-2xs outline-none focus:border-primary transition"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {/* Filter Sheet Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xs flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer shrink-0"
              aria-label="تصفية المهام المتقدمة"
            >
              <SlidersHorizontal size={18} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Desktop Enterprise Workspace Header (Reference 1 & 2) */}
        <div className="hidden lg:flex items-center justify-between gap-4 py-2">
          {/* Right side in RTL: Title & Subtitle with Themed Icon */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/20 border border-primary/20 text-primary flex items-center justify-center shadow-2xs shrink-0">
              <CheckSquareIcon className="w-6 h-6" />
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>إدارة المهام والتشغيل</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                متابعة المهام، الإسناد، التنفيذ، والاعتماد عبر الإدارات والفرق
              </p>
            </div>
          </div>

          {/* Left side in RTL: Actions (+ إنشاء مهمة Quick Composer + Broadcast Button) */}
          <div className="flex items-center gap-2.5">
            {/* Quick Composer Dropdown (Reference 1) */}
            <QuickComposerMenu
              isOpen={composerMenuOpen}
              onToggle={() => setComposerMenuOpen(!composerMenuOpen)}
              onClose={() => setComposerMenuOpen(false)}
              onSelectAction={handleComposerAction}
            />

            {/* Direct Broadcast Button (Reference 2) */}
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setCreateMode("broadcast");
                setBroadcastData((prev) => ({ ...prev, broadcast_mode: "individual" }));
                setCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-primary/20 bg-primary/10 dark:bg-primary/15 text-primary hover:bg-primary/20 transition-colors shadow-2xs cursor-pointer"
            >
              <UsersIcon size={16} />
              <span>إسناد جماعي (Broadcast)</span>
            </button>

            {/* Hidden file & camera inputs */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  toast.success(`تم اختيار الملف: ${e.target.files[0].name}`);
                }
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  toast.success(`تم التقاط الصورة: ${e.target.files[0].name}`);
                }
              }}
            />
          </div>
        </div>

        {/* Mobile Filter Sheet */}
        <MobileFilterSheet
          isOpen={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="تصفية وترتيب المهام"
          activeCount={activeFilterCount}
          onReset={resetAllFilters}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                نطاق المهام
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition cursor-pointer ${
                    filterMode === "all"
                      ? "bg-[#187A5A] text-white border-[#187A5A]"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  جميع المهام
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("my")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition cursor-pointer ${
                    filterMode === "my"
                      ? "bg-[#187A5A] text-white border-[#187A5A]"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  مهامي المسندة إلي
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المرحلة أو الحالة
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
              >
                <option value="">جميع الحالات والمراحل</option>
                <optgroup label="مراحل دورة العمل الموحدة">
                  <option value="active">المهام النشطة</option>
                  <option value="new">بانتظار القبول</option>
                  <option value="in_progress">قيد التنفيذ</option>
                  <option value="waiting">بانتظار التوضيح</option>
                  <option value="overdue">متأخرة عن الموعد</option>
                  <option value="completed">مكتملة</option>
                  <option value="rejected">مرفوضة</option>
                  <option value="cancelled">ملغاة</option>
                </optgroup>
                <optgroup label="الحالات التفصيلية">
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
            </div>

            {filterEmployees.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الموظف المسند إليه
                </label>
                <select
                  value={filterAssigneeId}
                  onChange={(e) => setFilterAssigneeId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
                >
                  <option value="">جميع الموظفين</option>
                  {filterEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                مستوى الأولوية
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
              >
                <option value="">جميع الأولويات</option>
                <option value="Critical">حرج جداً (Critical)</option>
                <option value="Urgent">عاجل (Urgent)</option>
                <option value="High">مرتفع (High)</option>
                <option value="Medium">متوسط (Medium)</option>
                <option value="Low">منخفض (Low)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ترتيب العرض
              </label>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as "created_desc" | "due_asc" | "updated_desc"); setPage(1); }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
              >
                <option value="created_desc">الأحدث أولاً</option>
                <option value="due_asc">الأقرب موعداً</option>
                <option value="updated_desc">آخر تحديث</option>
              </select>
            </div>

            <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-rose-600 dark:text-rose-400 cursor-pointer">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
              />
              <span>عرض المهام المتأخرة عن الموعد فقط</span>
            </label>
          </div>
        </MobileFilterSheet>

        {/* Desktop 6 KPI Stat Cards Grid (Reference 1 & 2) */}
        <div className="hidden lg:block">
          <TasksKpiCards
            total={summary?.total ?? totalTasks}
            newCount={newCount}
            inProgressCount={inProgressCount}
            completedCount={completedCount}
            overdueCount={overdueCount}
            completionRate={72}
            activeFilter={statusFilter || (overdueOnly ? "overdue" : "all")}
            onFilterClick={(filterKey) => {
              if (filterKey === "all") {
                setStatusFilter("");
                setOverdueOnly(false);
              } else if (filterKey === "overdue") {
                setOverdueOnly(true);
                setStatusFilter("");
              } else {
                setOverdueOnly(false);
                setStatusFilter(filterKey);
              }
              setPage(1);
            }}
          />
        </div>

        {/* Desktop Unified Toolbar & View Switcher (Reference 1 & 2) */}
        <div className="hidden lg:block space-y-3">
          {/* Toolbar Row 1: Scope Tabs (Right in RTL) & View Modes (Left in RTL) */}
          <div className="flex items-center justify-between gap-4">
            {/* View Modes on Left (in RTL) */}
            <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveViewMode("list")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  activeViewMode === "list"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <List size={15} />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode("kanban")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  activeViewMode === "kanban"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <LayoutGrid size={15} />
                <span>لوحة (Kanban)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode("calendar")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  activeViewMode === "calendar"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <CalendarDays size={15} />
                <span>تقويم</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode("timeline")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  activeViewMode === "timeline"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <GanttChartSquare size={15} />
                <span>مخططات</span>
              </button>
            </div>

            {/* Scope Tabs on Right (in RTL) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterMode("all");
                  setActiveScopeTab("all");
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  activeScopeTab === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                }`}
              >
                جميع المهام ({summary?.total ?? totalTasks})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterMode("my");
                  setActiveScopeTab("my");
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  activeScopeTab === "my"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                }`}
              >
                مهامي
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterMode("all");
                  setActiveScopeTab("assigned_by_me");
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  activeScopeTab === "assigned_by_me"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                }`}
              >
                المسندة مني
              </button>
            </div>
          </div>

          {/* Toolbar Row 2: Search Input & Filter Dropdowns */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            {/* Search Input (Right side in RTL) */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في المهام..."
                className="w-full h-10 pr-4 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-primary transition"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* الموظف */}
              <select
                value={filterAssigneeId}
                onChange={(e) => setFilterAssigneeId(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-primary cursor-pointer"
              >
                <option value="">الموظف (الكل)</option>
                {filterEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>

              {/* الإدارة / القسم */}
              <select
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-primary cursor-pointer"
              >
                <option value="">الإدارة / القسم (الكل)</option>
                <option value="it">تقنية المعلومات</option>
                <option value="ops">العمليات والتشغيل</option>
                <option value="hr">الموارد البشرية</option>
                <option value="finance">المالية</option>
              </select>

              {/* الحالة */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-primary cursor-pointer"
              >
                <option value="">الحالة (الكل)</option>
                <option value="in_progress">قيد التنفيذ</option>
                <option value="new">بانتظار القبول</option>
                <option value="completed">مكتملة</option>
                <option value="overdue">متأخرة</option>
              </select>

              {/* الأولوية */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-primary cursor-pointer"
              >
                <option value="">الأولوية (الكل)</option>
                <option value="Critical">حرج جداً (Critical)</option>
                <option value="Urgent">عاجل (Urgent)</option>
                <option value="High">مرتفع (High)</option>
                <option value="Medium">متوسط (Medium)</option>
                <option value="Low">منخفض (Low)</option>
              </select>

              {/* Reset Filter Button */}
              <button
                type="button"
                onClick={resetAllFilters}
                title="إعادة تعيين الفلاتر"
                className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
              >
                <Filter size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Unified View Switcher Engine (List, Kanban, Calendar, Analytics) */}
        {activeViewMode === "list" && (
          <MasterDetailLayout
            hasSelection={!!selectedTask}
            onCloseDetail={() => setSelectedTask(null)}
            masterWidthPercentage={selectedTask ? 58 : 100}
            masterContent={
              <TasksDataTable
                tasks={tasks as unknown as TaskRowItem[]}
                totalCount={summary?.total ?? totalTasks}
                selectedTaskId={selectedTask?.id || null}
                onSelectTask={async (task) => {
                  try {
                    const res = await api.get<TaskDetail>(`/tasks/${task.id}`);
                    setSelectedTask(res.data);
                  } catch (err) {
                    console.error("Failed to load task details for split drawer", err);
                  }
                }}
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                onActionClick={async (task) => {
                  try {
                    const res = await api.get<TaskDetail>(`/tasks/${task.id}`);
                    setSelectedTask(res.data);
                  } catch (err) {
                    console.error("Failed to load task details", err);
                  }
                }}
              />
            }
            detailContent={
              selectedTask ? (
                <TasksSplitDrawer
                  task={{
                    id: selectedTask.id,
                    reference: selectedTask.reference,
                    title: selectedTask.title,
                    description: selectedTask.description,
                    priority: selectedTask.priority,
                    status: selectedTask.status,
                    department: "تقنية المعلومات",
                    category: "تشغيلي",
                    assigned_to_name: selectedTask.assigned_to_name,
                    created_at: selectedTask.created_at,
                    due_date: selectedTask.due_date,
                    target_duration_minutes: 60,
                    voice_note_url: selectedTask.voice_note_url,
                    voice_note_duration: selectedTask.voice_note_duration,
                    is_voice_task: selectedTask.is_voice_task,
                    comments_count: selectedTask.comments?.length || 0,
                    attachments_count: 2,
                  }}
                  onClose={() => {
                    setSelectedTask(null);
                  }}
                  onMaximize={() => {
                    setDetailModal(true);
                  }}
                  onStatusChange={async (taskId, newStatus) => {
                    if (newStatus === "Accepted") {
                      await handleAcceptTask(taskId);
                    } else if (newStatus === "In Progress") {
                      await handleStartTask(taskId);
                    } else if (newStatus === "Submitted for Review") {
                      await handleSubmitForReview();
                    } else if (newStatus === "Completed") {
                      await handleWorkflowAction(taskId, "complete");
                    } else {
                      try {
                        await api.put(`/tasks/${taskId}`, { status: newStatus });
                        await refreshSelectedTask(taskId);
                        toast.success("تم تحديث حالة المهمة بنجاح");
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : "فشل تحديث الحالة");
                      }
                    }
                  }}
                  onOpenComment={() => {
                    setDetailModal(true);
                  }}
                  onEdit={() => {
                    setEditingTask(selectedTask);
                    setCreateModal(true);
                  }}
                  onCopyLink={(taskId) => {
                    const code = selectedTask.reference || `TASK-${taskId.slice(0, 6)}`;
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(code).catch(() => {});
                    }
                    toast.success(`تم نسخ رمز المهمة: ${code}`);
                  }}
                />
              ) : null
            }
          />
        )}

        {/* KANBAN BOARD VIEW */}
        {activeViewMode === "kanban" && (
          <TaskKanbanView
            tasks={tasks.map((t) => ({
              id: t.id,
              reference: t.reference,
              title: t.title,
              description: t.description,
              assigned_to_name: t.assigned_to_name,
              priority: t.priority,
              status: t.status,
              due_date: t.due_date,
              is_voice_task: t.is_voice_task,
              comments_count: t.comments_count,
            }))}
            selectedTaskId={selectedTask?.id || null}
            onSelectTask={async (taskId) => {
              try {
                const res = await api.get<TaskDetail>(`/tasks/${taskId}`);
                setSelectedTask(res.data);
              } catch (err) {
                console.error("Failed to load task detail", err);
              }
            }}
            onStatusChange={async (taskId, newStatus) => {
              try {
                await api.put(`/tasks/${taskId}`, { status: newStatus });
                toast.success("تم تحديث حالة المهمة بنجاح");
                loadTasks();
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "فشل تحديث الحالة");
              }
            }}
          />
        )}

        {/* CALENDAR VIEW */}
        {activeViewMode === "calendar" && (
          <TaskCalendarView
            tasks={tasks.map((t) => ({
              id: t.id,
              reference: t.reference,
              title: t.title,
              description: t.description,
              assigned_to_name: t.assigned_to_name,
              priority: t.priority,
              status: t.status,
              due_date: t.due_date,
              is_voice_task: t.is_voice_task,
              comments_count: t.comments_count,
            }))}
            selectedTaskId={selectedTask?.id || null}
            onSelectTask={async (taskId) => {
              try {
                const res = await api.get<TaskDetail>(`/tasks/${taskId}`);
                setSelectedTask(res.data);
              } catch (err) {
                console.error("Failed to load task detail", err);
              }
            }}
          />
        )}

        {/* ANALYTICS & TIMELINE VIEW */}
        {activeViewMode === "timeline" && (
          <TaskAnalyticsView
            tasks={tasks.map((t) => ({
              id: t.id,
              reference: t.reference,
              title: t.title,
              description: t.description,
              assigned_to_name: t.assigned_to_name,
              priority: t.priority,
              status: t.status,
              due_date: t.due_date,
              is_voice_task: t.is_voice_task,
              comments_count: t.comments_count,
            }))}
            totalCount={summary?.total ?? totalTasks}
          />
        )}

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
              className="text-emerald-700 hover:text-emerald-950 text-xs p-1 rounded hover:bg-emerald-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mobile Task List (Purpose-built for mobile screens, Reference 2) */}
        <div className="block lg:hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          {loading ? (
            <TableSkeleton variant="list" rows={5} />
          ) : loadError ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-gray-900">تعذر تحميل قائمة المهام</h3>
                <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">{loadError}</p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void loadTasks()}
                  className="motion-control inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#187A5A] hover:bg-[#123D32] rounded-xl shadow-xs transition cursor-pointer"
                >
                  <Clock className="w-4 h-4 text-slate-500 inline" />
                  <span>إعادة المحاولة الآن</span>
                </button>
              </div>
            </div>
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
            <div className="p-3 space-y-3">
              {tasks.map((task) => (
                <MobileTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleOpenDetail(task.id)}
                  onPlayVoice={() => handleOpenDetail(task.id)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <span>
                صفحة <strong className="text-slate-900">{page}</strong> من <strong className="text-slate-900">{totalPages}</strong>
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

        {/* Floating Action Button (FAB) - Reference Images 2, 4, 7 */}
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
          className="fixed bottom-20 left-4 z-30 lg:hidden w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center transition active:scale-95 cursor-pointer"
          aria-label="إضافة مهمة جديدة"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>

        {/* Modal: Create Task */}
        <Modal
          isOpen={createModal}
          onClose={() => setCreateModal(false)}
          title={editingTask ? "تعديل المهمة" : (createMode === "voice" ? "تسجيل مهمة صوتية جديدة" : "إضافة مهمة جديدة")}
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
                <span className="text-xs font-bold">كتابية</span>
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
                <span className="text-xs font-bold">صوتية</span>
                <span>مهمة صوتية (WhatsApp-style)</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("broadcast")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                  createMode === "broadcast"
                    ? "border-[#187A5A] text-[#123D32]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className="text-xs font-bold">بث جماعي</span>
                <span>بث وإسناد جماعي</span>
              </button>
            </div>
          )}

          {createMode === "broadcast" && !editingTask ? (
            <form onSubmit={handleBroadcastSubmit} className="space-y-4">
              {broadcastError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                  <span className="font-bold shrink-0">خطأ:</span>
                  <span className="leading-relaxed">{broadcastError}</span>
                </div>
              )}

              {/* Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">نمط البث والإسناد:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBroadcastData({ ...broadcastData, broadcast_mode: "individual" })}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      broadcastData.broadcast_mode === "individual"
                        ? "border-[#187A5A] bg-[#187A5A]/5 text-[#123D32] ring-1 ring-[#187A5A]"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">فردي متعدد (Individual)</div>
                    <div className="text-[11px] text-gray-500">إنشاء مهمة مستقلة لكل موظف مع منع التكرار</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastData({ ...broadcastData, broadcast_mode: "shared" })}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      broadcastData.broadcast_mode === "shared"
                        ? "border-[#187A5A] bg-[#187A5A]/5 text-[#123D32] ring-1 ring-[#187A5A]"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">مهمة مشتركة (Shared RACI)</div>
                    <div className="text-[11px] text-gray-500">مهمة واحدة بفريق عمل ومسؤول أول محدد</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastData({ ...broadcastData, broadcast_mode: "announcement" })}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      broadcastData.broadcast_mode === "announcement"
                        ? "border-[#187A5A] bg-[#187A5A]/5 text-[#123D32] ring-1 ring-[#187A5A]"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">تعميم إداري (Announcement)</div>
                    <div className="text-[11px] text-gray-500">إشعار فوري عاجل دون إنشاء مهمة عمل</div>
                  </button>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {broadcastData.broadcast_mode === "announcement" ? "عنوان التعميم الإداري *" : "عنوان المهمة الجماعية *"}
                </label>
                <input
                  type="text"
                  value={broadcastData.title}
                  onChange={(e) => setBroadcastData({ ...broadcastData, title: e.target.value })}
                  placeholder={broadcastData.broadcast_mode === "announcement" ? "مثال: تعميم بخصوص تحديث سياسات الأمن السيبراني" : "مثال: فحص وتحديث أجهزة قسم العمليات"}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">تفاصيل التوجيه / الوصف:</label>
                <textarea
                  value={broadcastData.description}
                  onChange={(e) => setBroadcastData({ ...broadcastData, description: e.target.value })}
                  rows={3}
                  placeholder="اكتب التوجيهات الفنية أو تفاصيل الإسناد هنا..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                />
              </div>

              {/* Recipient Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700">
                  إضافة مستلمين ({broadcastData.recipients.length} محدد):
                </label>
                <EmployeeCombobox
                  value=""
                  onChange={(emp) => {
                    if (emp && !broadcastData.recipients.some((r) => r.id === emp.id)) {
                      setBroadcastData({
                        ...broadcastData,
                        recipients: [...broadcastData.recipients, emp],
                      });
                    }
                  }}
                />

                {/* Selected Recipient Badges */}
                {broadcastData.recipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200/80 max-h-36 overflow-y-auto">
                    {broadcastData.recipients.map((emp) => (
                      <span
                        key={emp.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-800 shadow-2xs"
                      >
                        <span>{emp.full_name}</span>
                        {emp.is_telegram_linked && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
                        <button
                          type="button"
                          onClick={() =>
                            setBroadcastData({
                              ...broadcastData,
                              recipients: broadcastData.recipients.filter((r) => r.id !== emp.id),
                            })
                          }
                          className="text-gray-400 hover:text-rose-600 font-bold ml-0.5 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* For Shared mode: Pick Accountable Owner */}
              {broadcastData.broadcast_mode === "shared" && broadcastData.recipients.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">المسؤول الأول المعتمد (Accountable Owner):</label>
                  <select
                    value={broadcastData.accountable_id || broadcastData.recipients[0]?.id}
                    onChange={(e) => setBroadcastData({ ...broadcastData, accountable_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  >
                    {broadcastData.recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} ({r.job_title || "فني"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Priority & Deadline Policies */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">مستوى الأولوية:</label>
                  <select
                    value={broadcastData.priority}
                    onChange={(e) => {
                      const p = e.target.value;
                      const durMap: Record<string, number> = { Critical: 60, Urgent: 240, High: 1440, Medium: 4320, Low: 10080 };
                      setBroadcastData({
                        ...broadcastData,
                        priority: p,
                        target_duration_minutes: durMap[p] || 4320,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  >
                    <option value="Critical">طارئ (مستهدف: ساعة واحدة)</option>
                    <option value="Urgent">عاجل (مستهدف: 4 ساعات)</option>
                    <option value="High">مرتفع (مستهدف: 24 ساعة)</option>
                    <option value="Medium">متوسط (مستهدف: 3 أيام)</option>
                    <option value="Low">منخفض (مستهدف: 7 أيام)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">المدة المستهدفة للإنجاز (دقيقة):</label>
                  <input
                    type="number"
                    value={broadcastData.target_duration_minutes}
                    onChange={(e) => setBroadcastData({ ...broadcastData, target_duration_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                  />
                </div>
              </div>

              {/* Telegram Notification */}
              <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastData.notify_telegram}
                  onChange={(e) => setBroadcastData({ ...broadcastData, notify_telegram: e.target.checked })}
                  className="rounded text-[#187A5A] focus:ring-[#187A5A]"
                />
                <span className="text-xs font-medium text-gray-700">
                  إرسال إشعار فوري عبر Telegram لكافة الموظفين المرتبطين
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={broadcastLoading || broadcastData.recipients.length === 0}
                  className="px-5 py-2 text-sm font-bold text-white bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {broadcastLoading && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                  {broadcastLoading ? "جاري تنفيذ البث..." : `تنفيذ البث (${broadcastData.recipients.length} مستلم)`}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreateTask} className="space-y-4">
              {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <span className="font-bold shrink-0">خطأ:</span>
                <span className="leading-relaxed">{createError}</span>
              </div>
            )}

            {createMode === "voice" && !editingTask ? (
              <div className="space-y-4">
                <VoiceTaskRecorder
                  onRecordingComplete={setVoiceRecording}
                  disabled={createLoading}
                />

                <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#123D32] mb-1">
                      الموظف / الفني المسند إليه <span className="text-red-500">*</span>
                    </label>
                    <EmployeeCombobox
                      value={formData.assigned_to_id}
                      initialName={undefined}
                      companyId={currentCompany?.id}
                      onResolve={setSelectedEmployee}
                      onChange={(employee) => {
                        setSelectedEmployee(employee);
                        setFormData(current => ({ ...current, assigned_to_id: employee?.id || "", notify_telegram: employee?.is_telegram_linked ?? true }));
                      }}
                    />

                    {!formData.assigned_to_id && (
                      <p className="text-[11px] text-amber-700 font-semibold mt-1.5 flex items-center gap-1.5 bg-amber-50/80 p-2 rounded border border-amber-200">
                        <AlertCircle className="w-4 h-4 text-amber-500 inline" />
                        <span>يجب اختيار الموظف المسند إليه حتى يتم إرسال التسجيل الصوتي وإشعاره على Telegram فوراً.</span>
                      </p>
                    )}

                    {/* Live Telegram Connection & Notification Capability Indicator */}
                    {formData.assigned_to_id && (() => {
                      const selectedEmp = selectedEmployee;
                      if (!selectedEmp) return null;
                      return (
                        <div className="mt-2 p-2 bg-white rounded-lg border border-emerald-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-700">إشعار Telegram المباشر:</span>
                            {selectedEmp.is_telegram_linked ? (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                سيصل التسجيل الصوتي فوراً ({selectedEmp.telegram_username ? `@${selectedEmp.telegram_username}` : "مفعل ومؤكد"})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                غير مرتبط بـ Telegram
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      عنوان المهمة الصوتية <span className="text-gray-400 font-normal">(اختياري — سيتم تعيين عنوان تلقائي في حال تركه فارغاً)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="مثال: تعليمات فحص السيرفر الصباحية"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                    />
                  </div>
                </div>

                {/* Collapsible toggle for advanced fields */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedVoiceFields(!showAdvancedVoiceFields)}
                    className="text-xs font-semibold text-[#187A5A] hover:text-[#123D32] flex items-center gap-1.5 py-1 cursor-pointer transition-colors"
                  >
                    <span>{showAdvancedVoiceFields ? "إخفاء الخيارات الإضافية" : "خيارات إضافية (أولوية، موعد نهائي، أصل مرتبط...)"}</span>
                  </button>
                </div>

                {showAdvancedVoiceFields && (
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">الأصل المرتبط</label>
                        <select
                          value={formData.related_asset_id}
                          onChange={(e) => setFormData({ ...formData, related_asset_id: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A] bg-white"
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
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A] bg-white"
                        >
                          <option value="Urgent">عاجل جداً (Urgent)</option>
                          <option value="High">مرتفع (High)</option>
                          <option value="Medium">متوسط (Medium)</option>
                          <option value="Low">منخفض (Low)</option>
                        </select>
                      </div>

                      <div>
                        <RelativeScheduler
                          value={formData.due_date}
                          onChange={(val) => setFormData((c) => ({ ...c, due_date: val }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">ملاحظات إضافية</label>
                        <input
                          type="text"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="ملاحظة سريعة..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A] bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
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
                              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>مرتبط ({selectedEmp.telegram_username ? `@${selectedEmp.telegram_username}` : "مفعل ومؤكد"})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                <span>غير مرتبط</span>
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

                  <div className="sm:col-span-2">
                    <RelativeScheduler
                      value={formData.due_date}
                      onChange={(val) => setFormData((c) => ({ ...c, due_date: val }))}
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
              </>
            )}

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <span className="font-bold shrink-0">خطأ:</span>
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
                  ? "إرسال المهمة الصوتية"
                  : "حفظ وإنشاء المهمة"}
              </button>
            </div>
          </form>
          )}
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
                    <AlertCircle className="w-5 h-5 text-amber-500 inline" />
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
                    <Clock className="w-4 h-4 text-slate-500 inline" />
                    <h4>مطلوب تعديلات إضافية من قِبل المسؤول (جولة تعديل #{selectedTask.rework_count})</h4>
                  </div>
                  <p className="text-xs text-orange-700 bg-white/80 p-2.5 rounded-lg border border-orange-100">
                    {selectedTask.review_notes || "يرجى مراجعة الملاحظات وإعادة العمل على المهمة ثم رفعها مجدداً."}
                  </p>
                </div>
              )}

              {/* Submitted for Review Alert Banner */}
              {selectedTask.status === "Submitted for Review" && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-5 h-5 text-slate-600 inline" />
                    <div>
                      <h4 className="text-sm font-bold text-primary">المهمة مكتملة فنياً وبانتظار المراجعة والاعتماد</h4>
                      <p className="text-xs text-muted-foreground">لا تعتبر المهمة مكتملة نهائياً حتى يتم اعتمادها من قِبل مدير النظام أو المسؤول.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed Status Card */}
              {(selectedTask.stage === "completed" || selectedTask.status === "Completed") && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 inline" />
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
                  <AlertCircle className="w-6 h-6 text-rose-600 inline" />
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
                        <Mic className="w-4 h-4 text-emerald-700" />
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
                      <span className="text-primary font-bold">{selectedTask.submitted_for_review_at.slice(0, 16).replace("T", " ")}</span>
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
                      <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{selectedTask.acknowledged_at.slice(0, 16).replace("T", " ")}</span>
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
                    <Send className="w-4 h-4 text-sky-600" />
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
                      {resendLoading ? "جاري الإرسال..." : "إعادة إرسال الإشعار لـ Telegram"}
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
                          تم الإرسال للموظف
                        </span>
                      ) : selectedTask.telegram_info?.delivery_status === "Pending" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          بانتظار الإرسال
                        </span>
                      ) : selectedTask.telegram_info?.delivery_status === "Failed" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          تعذر التسليم
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
                          تم تأكيد الاستلام من الفني
                        </span>
                        <span className="text-[11px] text-emerald-800 font-medium">
                          {selectedTask.acknowledged_at.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-700">
                        <Clock className="w-4 h-4 text-amber-600" />
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
                      قبول المهمة (Accept)
                    </button>
                  )}

                  {/* Step 2: Start Task */}
                  {(selectedTask.status === "Assigned" || selectedTask.status === "Accepted" || selectedTask.status === "Rework Required") && (
                    <button
                      onClick={() => handleStartTask(selectedTask.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#187A5A] hover:bg-[#123D32] rounded-lg shadow-sm transition-colors"
                    >
                      بدء التنفيذ (Start Work)
                    </button>
                  )}

                  {/* Step 3: Block Task with Reason */}
                  {selectedTask.status === "In Progress" && (
                    <button
                      onClick={() => setBlockModal(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    >
                      تعليق لوجود معوّق (Block)
                    </button>
                  )}

                  {/* Step 4: Submit for Review (CRITICAL: Doesn't auto-complete) */}
                  {(selectedTask.status === "In Progress" || selectedTask.status === "Rework Required") && (
                    <button
                      onClick={() => setSubmitModal(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:opacity-90 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      رفع للمراجعة والاعتماد (Submit for Review)
                    </button>
                  )}

                  {/* Direct Complete Action (Unified Workflow) */}
                  {(selectedTask.stage === "new" || selectedTask.stage === "in_progress" || selectedTask.stage === "waiting") && selectedTask.status !== "Submitted for Review" && (
                    <button
                      onClick={() => handleWorkflowAction(selectedTask.id, "complete")}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                    >
                      إنهاء المهمة (Complete)
                    </button>
                  )}

                  {/* Manager Reopen / Cancel Actions */}
                  {isManagerOrAdmin && (selectedTask.stage === "completed" || selectedTask.stage === "rejected" || selectedTask.stage === "cancelled") && (
                    <button
                      onClick={() => handleWorkflowAction(selectedTask.id, "reopen")}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                    >
                      إعادة فتح المهمة (Reopen)
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
                        اعتماد واكتمال المهمة (Approve)
                      </button>
                      <button
                        onClick={() => setReworkModal(true)}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-orange-800 bg-orange-100 hover:bg-orange-200 border border-orange-300 rounded-lg transition-colors"
                      >
                        طلب تعديلات إضافية (Rework)
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer"
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

        {/* Desktop WhatsApp-Style Floating Action Button for Rapid Voice Task Assignment (Hidden on Mobile to preserve single clean FAB) */}
        <div className="hidden lg:block fixed bottom-8 right-8 z-50">
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setVoiceRecording(null);
              setCreateError(null);
              setShowAdvancedVoiceFields(false);
              setCreateMode("voice");
              setFormData({
                title: "",
                description: "",
                assigned_to_id: "",
                priority: "Medium",
                status: "Assigned",
                start_date: new Date().toISOString().split("T")[0],
                due_date: "",
                related_asset_id: "",
                notes: "",
                notify_telegram: true,
                is_voice_task: true,
                voice_note_url: "",
                voice_note_duration: 0,
              });
              setCreateModal(true);
            }}
            className="group relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-[#123D32] via-[#187A5A] to-[#1e9e74] text-white shadow-2xl hover:shadow-emerald-900/60 hover:scale-110 active:scale-95 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[#C5A46D]/60 border-2 border-[#C5A46D]/80 cursor-pointer"
            title="تسجيل وإسناد مهمة صوتية سريعة"
            aria-label="تسجيل وإسناد مهمة صوتية سريعة"
          >
            {/* Animated ping ring */}
            <span className="absolute -inset-1 rounded-full bg-[#187A5A] opacity-35 animate-ping pointer-events-none group-hover:opacity-70" />
            <Mic className="w-7 h-7 sm:w-8 sm:h-8 select-none drop-shadow-md text-white" />

            {/* Desktop / Tablet Hover Tooltip */}
            <span className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900/95 text-white text-xs font-bold rounded-xl shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block border border-gray-700">
              إسناد مهمة صوتية سريعة
            </span>
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
