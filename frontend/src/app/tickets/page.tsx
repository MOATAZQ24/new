"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/ui/StatsCard";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { 
  LifeBuoyIcon, PlusIcon, SearchIcon, ClockIcon, 
  CheckCircleIcon, AlertCircleIcon, MessageSquareIcon, 
  SendIcon, UserIcon, ArrowRightIcon, CheckSquareIcon, ShieldCheckIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface TicketItem {
  id: string;
  company_id: string;
  branch_id?: string;
  ticket_number: string;
  issue_title: string;
  issue_description: string;
  requester_id?: string;
  requester_name?: string;
  assigned_technician_id?: string;
  assigned_technician_name?: string;
  priority: string;
  status: string;
  category: string;
  related_asset_name?: string;
  resolved_at?: string;
  closed_at?: string;
  comments_count: number;
  created_at: string;
}

interface TicketCommentItem {
  id: string;
  user_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

interface TicketDetail extends TicketItem {
  requester_email?: string;
  notes?: string;
  comments: TicketCommentItem[];
}

export default function TicketsPage() {
  const { currentCompany } = useAuth();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Dependencies
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string }[]>([]);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  
  // Comment & Convert
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [convertAssignee, setConvertAssignee] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    issue_title: "",
    issue_description: "",
    category: "Hardware",
    priority: "Medium",
    requester_id: "",
    related_asset_id: "",
    notes: "",
  });

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;

      const res = await api.get<TicketItem[]>("/tickets", { params });
      setTickets(res.data || []);
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, categoryFilter]);

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
    loadTickets();
  }, [loadTickets, currentCompany]);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies, currentCompany]);

  const handleOpenDetail = async (ticketId: string) => {
    try {
      const res = await api.get<TicketDetail>(`/tickets/${ticketId}`);
      setSelectedTicket(res.data);
      setDetailModal(true);
    } catch (err) {
      console.error("Failed to fetch ticket detail", err);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/tickets", {
        issue_title: formData.issue_title,
        issue_description: formData.issue_description,
        category: formData.category,
        priority: formData.priority,
        requester_id: formData.requester_id || null,
        related_asset_id: formData.related_asset_id || null,
        notes: formData.notes || null,
      });
      setCreateModal(false);
      setFormData({
        issue_title: "",
        issue_description: "",
        category: "Hardware",
        priority: "Medium",
        requester_id: "",
        related_asset_id: "",
        notes: "",
      });
      loadTickets();
    } catch (err) {
      console.error("Failed to create ticket", err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      await api.post(`/tickets/${selectedTicket.id}/status?new_status=${encodeURIComponent(newStatus)}`);
      // Refresh
      const res = await api.get<TicketDetail>(`/tickets/${selectedTicket.id}`);
      setSelectedTicket(res.data);
      loadTickets();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTicket) return;
    try {
      setCommentSubmitting(true);
      await api.post(`/tickets/${selectedTicket.id}/comments`, {
        content: newComment.trim(),
        is_internal: isInternal,
      });
      setNewComment("");
      setIsInternal(false);
      const res = await api.get<TicketDetail>(`/tickets/${selectedTicket.id}`);
      setSelectedTicket(res.data);
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleConvertToTask = async () => {
    if (!selectedTicket) return;
    try {
      setConvertLoading(true);
      const url = convertAssignee
        ? `/tickets/${selectedTicket.id}/convert-to-task?assigned_to_id=${convertAssignee}`
        : `/tickets/${selectedTicket.id}/convert-to-task`;
      await api.post(url);
      alert("تم تحويل التذكرة إلى مهمة تشغيلية بنجاح!");
      setDetailModal(false);
      loadTickets();
    } catch (err) {
      console.error("Failed to convert ticket", err);
    } finally {
      setConvertLoading(false);
    }
  };

  // KPIs
  const totalTickets = tickets.length;
  const openCount = tickets.filter(t => t.status === "Open" || t.status === "Assigned").length;
  const inProgressCount = tickets.filter(t => t.status === "In Progress").length;
  const resolvedCount = tickets.filter(t => t.status === "Resolved" || t.status === "Closed").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">مكتب المساعدة والدعم الفني (Help Desk)</h1>
            <p className="text-sm text-gray-500 mt-1">
              إدارة بلاغات وتذاكر الدعم الفني، متابعة حل الأعطال، والتواصل مع الموظفين
            </p>
          </div>
          <button
            onClick={() => setCreateModal(true)}
            className="inline-flex items-center gap-2 bg-[#187A5A] hover:bg-[#123D32] text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            فتح تذكرة دعم جديدة
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="إجمالي التذاكر" value={totalTickets} icon={<LifeBuoyIcon className="w-5 h-5" />} accentColor="border-blue-500" />
          <StatsCard title="التذاكر المفتوحة" value={openCount} icon={<AlertCircleIcon className="w-5 h-5" />} accentColor="border-amber-500" />
          <StatsCard title="قيد المعالجة" value={inProgressCount} icon={<ClockIcon className="w-5 h-5" />} accentColor="border-blue-500" />
          <StatsCard title="تم حلها وإغلاقها" value={resolvedCount} icon={<CheckCircleIcon className="w-5 h-5" />} accentColor="border-green-500" />
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[240px]">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث برقم التذكرة (TCK-...)، عنوان المشكلة، أو التفاصيل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
            >
              <option value="">جميع التصنيفات</option>
              <option value="Hardware">أجهزة وعتاد (Hardware)</option>
              <option value="Software">برمجيات وأنظمة (Software)</option>
              <option value="Network">شبكات واتصالات (Network)</option>
              <option value="Access">صلاحيات ووصول (Access)</option>
              <option value="Email">بريد إلكتروني (Email)</option>
              <option value="Other">أخرى</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
            >
              <option value="">جميع الحالات</option>
              <option value="Open">مفتوحة (Open)</option>
              <option value="Assigned">مسندة لفني</option>
              <option value="In Progress">قيد المعالجة</option>
              <option value="Waiting for User">في انتظار رد المستخدم</option>
              <option value="Resolved">تم الحل</option>
              <option value="Closed">مغلقة</option>
            </select>

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

        {/* Tickets Table */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">جاري تحميل تذاكر الدعم الفني...</div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <LifeBuoyIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium">لا توجد تذاكر دعم تطابق معايير البحث</p>
              <p className="text-xs text-gray-400 mt-1">يمكن إضافة تذكرة دعم فني جديدة عند حدوث أي عطل</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-gray-600 font-medium text-xs border-b">
                  <tr>
                    <th className="py-3 px-4">رقم التذكرة</th>
                    <th className="py-3 px-4">عنوان البلاغ والمشكلة</th>
                    <th className="py-3 px-4">مقدم البلاغ</th>
                    <th className="py-3 px-4">الفني المسؤول</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">الأولوية</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">تاريخ الفتح</th>
                    <th className="py-3 px-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <span 
                          onClick={() => handleOpenDetail(t.id)}
                          className="font-mono text-xs font-bold text-[#187A5A] hover:underline cursor-pointer bg-[#187A5A]/10 px-2 py-0.5 rounded"
                        >
                          {t.ticket_number}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div 
                          onClick={() => handleOpenDetail(t.id)}
                          className="font-semibold text-gray-900 cursor-pointer hover:text-[#187A5A]"
                        >
                          {t.issue_title}
                        </div>
                        {t.related_asset_name && (
                          <div className="text-xs text-gray-400">الأصل: {t.related_asset_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {t.requester_name || "مستخدم غير محدد"}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {t.assigned_technician_name ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                            <UserIcon className="w-3 h-3 text-gray-400" />
                            {t.assigned_technician_name}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">بانتظار التكليف</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {t.category}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500" dir="ltr">
                        {t.created_at?.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenDetail(t.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-[#187A5A] hover:bg-[#123D32] rounded transition-colors"
                        >
                          معاينة وإدارة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Create Ticket */}
        <Modal
          isOpen={createModal}
          onClose={() => setCreateModal(false)}
          title="فتح تذكرة دعم فني جديدة"
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                عنوان المشكلة / العطل <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.issue_title}
                onChange={(e) => setFormData({ ...formData, issue_title: e.target.value })}
                placeholder="مثال: عطل في الشاشة الرئيسية، تعذر الاتصال بالشبكة اللاسلكية..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                وصف المشكلة بالتفصيل <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={formData.issue_description}
                onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                placeholder="اذكر رسالة الخطأ الظاهرة، متى بدأت المشكلة، والإجراءات المتخذة..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">تصنيف العطل</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="Hardware">أجهزة وعتاد (Hardware)</option>
                  <option value="Software">برمجيات وأنظمة (Software)</option>
                  <option value="Network">شبكات واتصالات (Network)</option>
                  <option value="Access">صلاحيات وكلمات مرور (Access)</option>
                  <option value="Email">بريد إلكتروني (Email)</option>
                  <option value="Other">أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الأولوية</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="Urgent">عاجل جداً (توقف كلي للعمل)</option>
                  <option value="High">مرتفع</option>
                  <option value="Medium">متوسط</option>
                  <option value="Low">منخفض</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الموظف صاحب البلاغ</label>
                <select
                  value={formData.requester_id}
                  onChange={(e) => setFormData({ ...formData, requester_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="">-- اختياري (تلقائي حسب المستخدم الحالي) --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الجهاز أو الأصل المعني</label>
                <select
                  value={formData.related_asset_id}
                  onChange={(e) => setFormData({ ...formData, related_asset_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
                >
                  <option value="">-- غير مرتبط بجهاز محدد --</option>
                  {assets.map((ast) => (
                    <option key={ast.id} value={ast.id}>{ast.asset_name} ({ast.asset_code})</option>
                  ))}
                </select>
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
                فتح التذكرة
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Ticket Detail & Workflow */}
        {selectedTicket && (
          <Modal
            isOpen={detailModal}
            onClose={() => setDetailModal(false)}
            title={`تذكرة رقم: ${selectedTicket.ticket_number}`}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-6">
              {/* Ticket Overview Card */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{selectedTicket.issue_title}</h3>
                    <PriorityBadge priority={selectedTicket.priority} />
                    <StatusBadge status={selectedTicket.status} />
                  </div>
                  <span className="text-xs text-gray-400" dir="ltr">
                    {selectedTicket.created_at?.slice(0, 16).replace("T", " ")}
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-gray-100 text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedTicket.issue_description}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400 block">صاحب البلاغ:</span>
                    <strong className="text-gray-800">{selectedTicket.requester_name || "غير محدد"}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block">الفني المعين:</span>
                    <strong className="text-gray-800">{selectedTicket.assigned_technician_name || "غير معين"}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block">التصنيف:</span>
                    <span>{selectedTicket.category}</span>
                  </div>
                  {selectedTicket.related_asset_name && (
                    <div>
                      <span className="text-gray-400 block">الأصل المرتبط:</span>
                      <span className="text-[#187A5A] font-medium">{selectedTicket.related_asset_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar: Workflow Status Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div className="text-xs font-medium text-gray-700">تحديث حالة التذكرة:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTicket.status !== "In Progress" && selectedTicket.status !== "Closed" && (
                    <button
                      onClick={() => handleStatusChange("In Progress")}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                    >
                      بدء المعالجة (In Progress)
                    </button>
                  )}
                  {selectedTicket.status !== "Waiting for User" && selectedTicket.status !== "Closed" && (
                    <button
                      onClick={() => handleStatusChange("Waiting for User")}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                    >
                      بانتظار رد الموظف
                    </button>
                  )}
                  {selectedTicket.status !== "Resolved" && selectedTicket.status !== "Closed" && (
                    <button
                      onClick={() => handleStatusChange("Resolved")}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                    >
                      تم الحل (Resolved)
                    </button>
                  )}
                  {selectedTicket.status !== "Closed" && (
                    <button
                      onClick={() => handleStatusChange("Closed")}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      إغلاق التذكرة نهائياً
                    </button>
                  )}
                </div>
              </div>

              {/* Convert to Task Box */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-200/80">
                <div className="flex items-center gap-2">
                  <CheckSquareIcon className="w-5 h-5 text-[#C5A46D]" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">هل تتطلب هذه التذكرة تدخلاً كبيراً أو مشروعاً صغيراً؟</h4>
                    <p className="text-xs text-gray-500">يمكنك تحويل هذه التذكرة تلقائياً إلى مهمة فنية في قائمة المهام</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={convertAssignee}
                    onChange={(e) => setConvertAssignee(e.target.value)}
                    className="px-2 py-1 text-xs rounded border border-gray-300"
                  >
                    <option value="">إسناد للفني...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleConvertToTask}
                    disabled={convertLoading}
                    className="px-3 py-1 text-xs font-medium text-white bg-[#187A5A] hover:bg-[#123D32] rounded whitespace-nowrap"
                  >
                    {convertLoading ? "جاري التحويل..." : "تحويل لمهمة"}
                  </button>
                </div>
              </div>

              {/* Comments & History */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquareIcon className="w-4 h-4 text-[#187A5A]" />
                  المحادثة والردود الفنية ({selectedTicket.comments?.length || 0})
                </h4>

                <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                  {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                    selectedTicket.comments.map((comment) => (
                      <div 
                        key={comment.id} 
                        className={`rounded-lg p-3 text-sm border ${
                          comment.is_internal 
                            ? "bg-amber-50/70 border-amber-200 text-amber-900" 
                            : "bg-gray-50 border-gray-200/80 text-gray-800"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1 text-xs">
                          <span className="font-bold flex items-center gap-2">
                            {comment.user_name}
                            {comment.is_internal && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-200 text-amber-800 font-bold flex items-center gap-1">
                                <ShieldCheckIcon className="w-3 h-3" />
                                ملاحظة فنية داخلية (خاصة بالفريق)
                              </span>
                            )}
                          </span>
                          <span className="text-gray-400" dir="ltr">
                            {comment.created_at?.slice(0, 16).replace("T", " ")}
                          </span>
                        </div>
                        <p className="leading-relaxed">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 py-3 text-center">لا توجد ردود بعد على هذه التذكرة</p>
                  )}
                </div>

                {/* Add Comment */}
                <form onSubmit={handleAddComment} className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="اكتب ردك أو تحديثك للمستخدم أو الفريق الفني..."
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
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>تعيين كملاحظة فنية داخلية (لا تظهر للموظف العادي مقدم التذكرة)</span>
                  </label>
                </form>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
