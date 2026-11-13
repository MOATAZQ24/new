"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/ui/StatsCard";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { 
  CheckSquareIcon, PlusIcon, SearchIcon, FilterIcon, 
  ClockIcon, MessageSquareIcon, SendIcon, AlertCircleIcon, UserIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface TaskItem {
  id: string;
  company_id: string;
  branch_id?: string;
  title: string;
  description?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  assigned_by_name?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  priority: string;
  status: string;
  start_date?: string;
  due_date?: string;
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
  notes?: string;
  is_overdue: boolean;
  comments_count: number;
  created_at: string;
}

interface CommentItem {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface TaskDetail extends TaskItem {
  comments: CommentItem[];
}

export default function TasksPage() {
  const { currentCompany, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "my">("all");

  // Options for form
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string }[]>([]);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

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
  });

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (filterMode === "my") params.filter_mode = "my";

      const res = await api.get<TaskItem[]>("/tasks", { params });
      setTasks(res.data || []);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, filterMode]);

  const loadDependencies = useCallback(async () => {
    try {
      const [empRes, astRes] = await Promise.all([
        api.get<{ id: string; full_name: string }[]>("/employees?per_page=100"),
        api.get<{ id: string; asset_name: string; asset_code: string }[]>("/assets?per_page=100")
      ]);
      setEmployees(empRes.data || []);
      setAssets(astRes.data || []);
    } catch (err) {
      console.error("Failed to load dependencies", err);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, currentCompany]);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies, currentCompany]);

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
    try {
      const res = await api.get<TaskDetail>(`/tasks/${taskId}`);
      setSelectedTask(res.data);
      setDetailModal(true);
    } catch (err) {
      console.error("Failed to fetch task detail", err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/tasks", {
        title: formData.title,
        description: formData.description || null,
        assigned_to_id: formData.assigned_to_id || null,
        priority: formData.priority,
        status: formData.status,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        related_asset_id: formData.related_asset_id || null,
        notes: formData.notes || null,
      });
      setCreateModal(false);
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
      });
      loadTasks();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  // ── Collaboration Lifecycle Actions ──────────────────────────────────
  const handleAcceptTask = async (taskId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/accept`);
      await refreshSelectedTask(taskId);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل قبول المهمة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل بدء العمل على المهمة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل تعليق المهمة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل إزالة المعوق واستئناف المهمة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل رفع المهمة للمراجعة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل اعتماد المهمة");
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
    } catch (err: any) {
      setActionError(err.response?.data?.detail || "فشل طلب التعديل على المهمة");
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

  // User role check
  const isManagerOrAdmin = user?.is_superadmin || user?.roles?.some(r => ["Super Admin", "Company Admin", "IT Manager"].includes(r));

  // KPIs
  const totalTasks = tasks.length;
  const inProgressCount = tasks.filter(t => t.status === "In Progress").length;
  const reviewPendingCount = tasks.filter(t => t.status === "Submitted for Review").length;
  const blockedCount = tasks.filter(t => t.is_blocked || t.status === "Blocked").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة المهام التشغيلية والتشاركية</h1>
            <p className="text-sm text-gray-500 mt-1">
              متابعة المهام الفنية، تتبع المعوقات، والاعتماد الإداري متعدد المستويات
            </p>
          </div>
          <button
            onClick={() => setCreateModal(true)}
            className="inline-flex items-center gap-2 bg-[#187A5A] hover:bg-[#123D32] text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            إضافة مهمة جديدة
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="إجمالي المهام" value={totalTasks} icon={<CheckSquareIcon className="w-5 h-5" />} accentColor="border-blue-500" />
          <StatsCard title="قيد التنفيذ" value={inProgressCount} icon={<ClockIcon className="w-5 h-5" />} accentColor="border-[#187A5A]" />
          <StatsCard title="مرفوعة للمراجعة" value={reviewPendingCount} icon={<AlertCircleIcon className="w-5 h-5" />} accentColor="border-purple-500" />
          <StatsCard title="معلّقة لوجود معوّق" value={blockedCount} icon={<AlertCircleIcon className="w-5 h-5" />} accentColor="border-rose-500" />
        </div>

        {/* Filters & Tabs */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2 border-b md:border-b-0 pb-2 md:pb-0 w-full md:w-auto">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filterMode === "all"
                    ? "bg-[#187A5A] text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                جميع المهام
              </button>
              <button
                onClick={() => setFilterMode("my")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filterMode === "my"
                    ? "bg-[#187A5A] text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                مهامي المسندة إلي
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <SearchIcon className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث في عنوان المهمة أو الوصف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                />
              </div>

              {/* Status Filter (All 9 States) */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              >
                <option value="">جميع الحالات (9 حالات)</option>
                <option value="Draft">مسودة (Draft)</option>
                <option value="Assigned">تم الإسناد (Assigned)</option>
                <option value="Accepted">تم القبول (Accepted)</option>
                <option value="In Progress">قيد التنفيذ (In Progress)</option>
                <option value="Blocked">معلّق لوجود معوق (Blocked)</option>
                <option value="Waiting for Response">بانتظار الرد (Waiting)</option>
                <option value="Submitted for Review">مرفوع للمراجعة (Review)</option>
                <option value="Rework Required">مطلوب تعديلات (Rework)</option>
                <option value="Completed">معتمد ومكتمل (Completed)</option>
                <option value="Cancelled">ملغي (Cancelled)</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              >
                <option value="">جميع الأولويات</option>
                <option value="Urgent">عاجل جداً (Urgent)</option>
                <option value="High">مرتفع (High)</option>
                <option value="Medium">متوسط (Medium)</option>
                <option value="Low">منخفض (Low)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">جاري تحميل المهام...</div>
          ) : tasks.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <CheckSquareIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium">لا توجد مهام تطابق معايير البحث</p>
              <p className="text-xs text-gray-400 mt-1">ابدأ بإضافة مهمة جديدة لمتابعة الأعمال الفنية</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-5 hover:bg-gray-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      
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

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1">
                      {task.assigned_to_name && (
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                          المسند إليه: <strong className="text-gray-700">{task.assigned_to_name}</strong>
                        </span>
                      )}
                      {task.reviewer_name && (
                        <span className="inline-flex items-center gap-1 text-purple-700">
                          المراجع / المعتمد: <strong>{task.reviewer_name}</strong>
                        </span>
                      )}
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                          موعد التسليم: <span dir="ltr">{task.due_date}</span>
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
                  <div className="flex items-center gap-2">
                    {task.status === "Assigned" && (
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
        </div>

        {/* Modal: Create Task */}
        <Modal
          isOpen={createModal}
          onClose={() => setCreateModal(false)}
          title="إضافة مهمة جديدة"
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                عنوان المهمة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
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
                <label className="block text-xs font-medium text-gray-700 mb-1">الموظف / الفني المسند إليه</label>
                <select
                  value={formData.assigned_to_id}
                  onChange={(e) => setFormData({ ...formData, assigned_to_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="">-- اختياري (غير محدد) --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
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
                className="px-5 py-2 text-sm font-medium text-white bg-[#187A5A] hover:bg-[#123D32] rounded-lg shadow-sm"
              >
                حفظ وإنشاء المهمة
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
              {selectedTask.status === "Completed" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">تم اعتماد واكتمال المهمة بنجاح</h4>
                    <p className="text-xs text-emerald-700">
                      معتمدة بواسطة: <strong>{selectedTask.reviewer_name || "المسؤول"}</strong>
                      {selectedTask.completed_at && ` في ${selectedTask.completed_at.slice(0, 16).replace("T", " ")}`}
                    </p>
                    {selectedTask.review_notes && (
                      <p className="text-xs text-emerald-800 mt-1 italic">ملاحظات الاعتماد: {selectedTask.review_notes}</p>
                    )}
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
