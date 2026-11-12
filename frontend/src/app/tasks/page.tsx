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
  priority: string;
  status: string;
  start_date?: string;
  due_date?: string;
  completed_at?: string;
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
  const { currentCompany } = useAuth();
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

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigned_to_id: "",
    priority: "Medium",
    status: "Pending",
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

  const handleOpenDetail = async (taskId: string) => {
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
        status: "Pending",
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

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      loadTasks();
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
    } catch (err) {
      console.error("Failed to update task status", err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;
    try {
      setCommentSubmitting(true);
      await api.post(`/tasks/${selectedTask.id}/comments`, { content: newComment.trim() });
      setNewComment("");
      // Refresh detail
      const res = await api.get<TaskDetail>(`/tasks/${selectedTask.id}`);
      setSelectedTask(res.data);
    } catch (err) {
      console.error("Failed to add comment", err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  // KPIs
  const totalTasks = tasks.length;
  const inProgressCount = tasks.filter(t => t.status === "In Progress").length;
  const completedCount = tasks.filter(t => t.status === "Completed").length;
  const overdueCount = tasks.filter(t => t.is_overdue).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة المهام التشغيلية</h1>
            <p className="text-sm text-gray-500 mt-1">
              متابعة المهام الفنية، التكليفات، ومواعيد التسليم لفرق تقنية المعلومات
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
          <StatsCard title="قيد التنفيذ" value={inProgressCount} icon={<ClockIcon className="w-5 h-5" />} accentColor="border-amber-500" />
          <StatsCard title="المكتملة" value={completedCount} icon={<CheckSquareIcon className="w-5 h-5" />} accentColor="border-green-500" />
          <StatsCard title="المتأخرة عن الموعد" value={overdueCount} icon={<AlertCircleIcon className="w-5 h-5" />} accentColor="border-red-500" />
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

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              >
                <option value="">جميع الحالات</option>
                <option value="Pending">قيد الانتظار</option>
                <option value="In Progress">قيد التنفيذ</option>
                <option value="Completed">مكتملة</option>
                <option value="Cancelled">ملغاة</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              >
                <option value="">جميع الأولويات</option>
                <option value="Urgent">عاجل</option>
                <option value="High">مرتفع</option>
                <option value="Medium">متوسط</option>
                <option value="Low">منخفض</option>
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
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                          موعد التسليم: <span dir="ltr">{task.due_date}</span>
                        </span>
                      )}
                      {task.related_asset_name && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          الأصل المرتبط: {task.related_asset_name}
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

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {task.status !== "Completed" && (
                      <button
                        onClick={() => handleStatusChange(task.id, "Completed")}
                        className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors"
                      >
                        إكمال المهمة
                      </button>
                    )}
                    {task.status === "Pending" && (
                      <button
                        onClick={() => handleStatusChange(task.id, "In Progress")}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                      >
                        بدء التنفيذ
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenDetail(task.id)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      التفاصيل والتعليقات
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
                placeholder="مثال: ترقية ذاكرة الخادم الرئيسي، تهيئة طابعات القسم المالي"
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
                  <option value="Pending">قيد الانتظار</option>
                  <option value="In Progress">قيد التنفيذ</option>
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

        {/* Modal: Task Detail & Comments */}
        {selectedTask && (
          <Modal
            isOpen={detailModal}
            onClose={() => setDetailModal(false)}
            title={`تفاصيل المهمة: ${selectedTask.title}`}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-6">
              {/* Task Meta */}
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
                    أضيفت بواسطة: {selectedTask.assigned_by_name || "النظام"}
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
                  {selectedTask.related_asset_name && (
                    <div>
                      <span className="text-gray-400 block">الأصل المرتبط:</span>
                      <span>{selectedTask.related_asset_name}</span>
                    </div>
                  )}
                  {selectedTask.completed_at && (
                    <div>
                      <span className="text-gray-400 block">تاريخ الإكمال:</span>
                      <span className="text-green-700 font-semibold">{selectedTask.completed_at.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquareIcon className="w-4 h-4 text-[#187A5A]" />
                  سجل التعليقات والتحديثات ({selectedTask.comments?.length || 0})
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

                {/* Add Comment */}
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="اكتب تعليقاً أو تحديثاً على سير العمل..."
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

              {/* Status Update Quick Bar */}
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-xs text-gray-500">تحديث حالة المهمة سريعا:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStatusChange(selectedTask.id, "In Progress")}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                  >
                    قيد التنفيذ
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedTask.id, "Completed")}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                  >
                    مكتملة
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedTask.id, "Cancelled")}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
