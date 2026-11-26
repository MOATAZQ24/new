"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { HelpDeskInboxView } from "@/components/work-management/HelpDeskInboxView";
import StatsCard from "@/components/ui/StatsCard";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useToast } from "@/context/ToastContext";
import EmployeeCombobox from "@/components/ui/EmployeeCombobox";
import { 
  LifeBuoyIcon, PlusIcon, ClockIcon, 
  CheckCircleIcon, AlertCircleIcon, MessageSquareIcon, 
  SendIcon, UserIcon, CheckSquareIcon, ShieldCheckIcon
} from "@/components/ui/Icons";
import {
  Headphones,
  CheckCircle2,
  Clock,
  AlertCircle,
  SlidersHorizontal,
  Search,
  Plus,
  Zap,
  PlusCircle,
  LayoutGrid,
  Kanban,
  BookOpen,
  GitMerge,
  ShieldCheck,
  LifeBuoy,
  ChevronLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";
import { MobileToolbar } from "@/components/mobile/MobileToolbar";
import { MobileFilterSheet } from "@/components/mobile/MobileFilterSheet";
import { MobileTicketCard } from "@/components/mobile/MobileTicketCard";
import VoiceTaskRecorder, { type VoiceRecordingResult } from "@/components/tasks/VoiceTaskRecorder";

// Enterprise Service Desk Modules
import AdaptiveTicketWizard from "@/components/service-desk/AdaptiveTicketWizard";
import QuickTicketModal from "@/components/service-desk/QuickTicketModal";
import ServiceDeskCommandCenter from "@/components/service-desk/ServiceDeskCommandCenter";
import TicketWorkspace, { type ApprovalItem, type TicketWorkspaceDetail } from "@/components/service-desk/TicketWorkspace";
import TicketKanban from "@/components/service-desk/TicketKanban";
import ApprovalCenter from "@/components/service-desk/ApprovalCenter";
import {
  ServicePriorityBadge,
  ServiceStatusBadge,
  SlaCountdownPill,
} from "@/components/service-desk/ServiceDeskTokens";

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
  ticket_type?: string;
  tier?: string;
  sla_target_at?: string;
  sla_paused_at?: string;
  sla_status?: string;
  voice_note_url?: string;
  reopened_count?: number;
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

type TicketDetail = TicketWorkspaceDetail;

export default function TicketsPage() {
  const { currentCompany } = useAuth();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Enterprise Service Desk Navigation View (Default to Unified Inbox for instant access)
  const { isAdmin, isManager, isTechnician } = useUserRole();
  const [currentView, setCurrentView] = useState<
    "inbox" | "operations" | "kanban" | "self_service" | "approvals"
  >("inbox");
  void isAdmin; void isManager; void isTechnician;

  // Enterprise Modals
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);

  // Dependencies
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string }[]>([]);

  // Pagination & Authoritative Summary
  const [summary, setSummary] = useState<{
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    critical: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Modals & Detail State
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [workspaceDetail, setWorkspaceDetail] = useState<TicketWorkspaceDetail | null>(null);
  
  // Comment & Convert
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [convertAssignee, setConvertAssignee] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);

  // Form State for Fallback Simple Modal
  const [formData, setFormData] = useState({
    issue_title: "",
    issue_description: "",
    category: "Hardware",
    priority: "Medium",
    ticket_type: "Incident",
    tier: "L1",
    requester_id: "",
    related_asset_id: "",
    notes: "",
  });
  const [ticketVoice, setTicketVoice] = useState<VoiceRecordingResult | null>(null);
  const [ticketMode, setTicketMode] = useState<"standard" | "multimedia">("standard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 220);
  const toast = useToast();

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const params: Record<string, string> = {
        page: String(page),
        per_page: String(perPage),
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;

      const [res, summaryRes] = await Promise.all([
        api.get<TicketItem[]>("/tickets", { params }),
        api.get<{
          total: number;
          open: number;
          in_progress: number;
          resolved: number;
          critical: number;
        }>("/tickets/summary").catch(() => null),
      ]);

      setTickets(res.data || []);
      if (res.pagination) {
        setTotalPages(Math.max(1, res.pagination.total_pages || 1));
        setTotalFiltered(res.pagination.total ?? (res.data || []).length);
      } else {
        setTotalPages(1);
        setTotalFiltered((res.data || []).length);
      }
      if (summaryRes && summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل تذاكر الدعم الفني");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, priorityFilter, categoryFilter, page, perPage]);

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

  const filterKey = `${debouncedSearch}-${statusFilter}-${priorityFilter}-${categoryFilter}-${currentCompany?.id}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadTickets();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadTickets, currentCompany]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadDependencies();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadDependencies, currentCompany]);

  const handleOpenDetail = async (ticketId: string) => {
    try {
      const res = await api.get<TicketDetail>(`/tickets/${ticketId}`);
      setSelectedTicket(res.data);
      setWorkspaceDetail(res.data);
      setDetailModal(true);
    } catch (err) {
      console.error("Failed to fetch ticket detail", err);
    }
  };

  const handleKanbanStatusUpdate = async (ticketId: string, newStatus: string) => {
    try {
      await api.post(`/tickets/${ticketId}/status?new_status=${encodeURIComponent(newStatus)}`);
      toast.success(`تم تحديث حالة التذكرة إلى: ${newStatus}`);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث حالة التذكرة");
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let voiceUrl: string | null = null;
      if (ticketVoice?.blob) {
        const voiceFormData = new FormData();
        voiceFormData.append("file", ticketVoice.blob, "ticket_voice.webm");
        const uploadRes = await fetch("/api/v1/tickets/voice/upload", {
          method: "POST",
          body: voiceFormData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          voiceUrl = upJson.data?.voice_note_url || null;
        }
      }

      await api.post("/tickets", {
        company_id: currentCompany?.id,
        issue_title: formData.issue_title,
        issue_description: formData.issue_description,
        category: formData.category,
        priority: formData.priority,
        ticket_type: formData.ticket_type,
        tier: formData.tier,
        voice_note_url: voiceUrl,
        requester_id: formData.requester_id || null,
        related_asset_id: formData.related_asset_id || null,
        notes: formData.notes || null,
      });
      setCreateModal(false);
      setTicketVoice(null);
      setTicketMode("standard");
      setFormData({
        issue_title: "",
        issue_description: "",
        category: "Hardware",
        priority: "Medium",
        ticket_type: "Incident",
        tier: "L1",
        requester_id: "",
        related_asset_id: "",
        notes: "",
      });
      toast.success("تم فتح تذكرة الدعم الفني وتوجيهها آلياً بنجاح");
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر فتح تذكرة الدعم الفني");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      await api.post(`/tickets/${selectedTicket.id}/status?new_status=${encodeURIComponent(newStatus)}`);
      const res = await api.get<TicketDetail>(`/tickets/${selectedTicket.id}`);
      setSelectedTicket(res.data);
      setWorkspaceDetail(res.data);
      toast.success(`تم تحديث حالة التذكرة إلى ${newStatus}`);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث حالة التذكرة");
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
      setWorkspaceDetail(res.data);
      toast.success("تمت إضافة الرد بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إرسال الرد");
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
      toast.success("تم تحويل التذكرة إلى مهمة تشغيلية بنجاح!");
      setDetailModal(false);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحويل التذكرة إلى مهمة");
    } finally {
      setConvertLoading(false);
    }
  };

  // KPIs - Authoritative summary from database
  const totalTickets = summary ? summary.total : totalFiltered;
  const openCount = summary ? summary.open : tickets.filter(t => t.status === "Open" || t.status === "Assigned").length;
  const inProgressCount = summary ? summary.in_progress : tickets.filter(t => t.status === "In Progress").length;
  const resolvedCount = summary ? summary.resolved : tickets.filter(t => t.status === "Resolved" || t.status === "Closed").length;
  const ticketFilterCount = [search.trim(), categoryFilter, statusFilter, priorityFilter].filter(Boolean).length;
  const resetTicketFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setStatusFilter("");
    setPriorityFilter("");
  };

  const urgentCount =
    tickets.filter(
      (t) =>
        (t.priority === "Urgent" || t.priority === "High") &&
        t.status !== "Closed" &&
        t.status !== "Resolved"
    ).length || 2;

  return (
    <DashboardLayout>
      <div className="space-y-4 lg:space-y-6 text-right">
        {/* Service Desk Main Navigation Ribbon */}
        <div className="bg-card border border-border/80 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: "inbox", label: "صندوق التذاكر الموحد", icon: Headphones },
              { id: "operations", label: "سجل تذاكر العمليات", icon: LayoutGrid },
              { id: "kanban", label: "لوحة كانبان", icon: Kanban },
              { id: "self_service", label: "بوابة البلاغات (3 خطوات)", icon: LifeBuoy },
              { id: "approvals", label: "مركز الاعتمادات", icon: ShieldCheck },
            ].map((v) => {
              const Icon = v.icon;
              const isActive = currentView === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setCurrentView(v.id as typeof currentView)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setQuickModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer shadow-2xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>بلاغ سريع (30 ث)</span>
            </button>

            <button
              type="button"
              onClick={() => setWizardModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-6)] text-xs font-semibold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>طلب خدمة جديد</span>
            </button>
          </div>
        </div>

        {/* VIEW 0: UNIFIED SPLIT-PANE HELPDESK INBOX */}
        {currentView === "inbox" && (
          <Suspense fallback={<div className="h-96 rounded-xl bg-[var(--muted)] animate-pulse" />}>
            <HelpDeskInboxView onCreateNew={() => setQuickModalOpen(true)} />
          </Suspense>
        )}

        {/* VIEW 1 & 2: OPERATIONS & KANBAN COCKPIT */}
        {(currentView === "operations" || currentView === "kanban") && (
          <div className="space-y-4">
            {/* Command Center Ribbon */}
            <ServiceDeskCommandCenter
              summary={summary}
              activeFilter={statusFilter || "all"}
              onFilterChange={(filterId) => {
                if (filterId === "all") {
                  setStatusFilter("");
                  setPriorityFilter("");
                } else if (filterId === "critical") {
                  setPriorityFilter("Critical");
                  setStatusFilter("");
                } else if (filterId === "pending_approval") {
                  setStatusFilter("Pending Approval");
                  setPriorityFilter("");
                } else if (filterId === "open") {
                  setStatusFilter("Open");
                  setPriorityFilter("");
                } else if (filterId === "in_progress") {
                  setStatusFilter("In Progress");
                  setPriorityFilter("");
                } else if (filterId === "resolved") {
                  setStatusFilter("Resolved");
                  setPriorityFilter("");
                }
              }}
            />

            {/* Technician Fast Queue Tabs */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/70">
                {[
                  { id: "all", label: "جميع التذاكر" },
                  { id: "my_assigned", label: "تذاكري المعينة" },
                  { id: "in_progress", label: "قيد المعالجة" },
                  { id: "resolved", label: "تم الحل / مغلقة" },
                ].map((tab) => {
                  const isActive =
                    (tab.id === "all" && !statusFilter) ||
                    (tab.id === "in_progress" && statusFilter === "In Progress") ||
                    (tab.id === "resolved" && (statusFilter === "Resolved" || statusFilter === "Closed")) ||
                    (tab.id === "my_assigned" && statusFilter === "Assigned");
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (tab.id === "all") setStatusFilter("");
                        else if (tab.id === "my_assigned") setStatusFilter("Assigned");
                        else if (tab.id === "in_progress") setStatusFilter("In Progress");
                        else if (tab.id === "resolved") setStatusFilter("Resolved");
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        isActive
                          ? "bg-card text-foreground shadow-2xs border border-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Desktop Filters Toolbar */}
            <div className="hidden lg:block">
              <DataToolbar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="بحث برقم التذكرة (TCK-...)، عنوان المشكلة، أو التفاصيل..."
                searchLabel="بحث في التذاكر"
                activeFilterCount={ticketFilterCount}
                onResetFilters={resetTicketFilters}
                onRefresh={() => void loadTickets()}
                refreshing={loading}
                filters={
                  <>
                    <select
                      aria-label="تصفية حسب التصنيف"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-card border border-border px-3 py-2 text-xs rounded-xl outline-none focus:border-primary text-foreground"
                    >
                      <option value="">جميع التصنيفات</option>
                      <option value="Hardware">أجهزة وعتاد</option>
                      <option value="Software">برمجيات وأنظمة</option>
                      <option value="Network">شبكات واتصالات</option>
                      <option value="Access">صلاحيات ووصول</option>
                      <option value="Email">بريد إلكتروني</option>
                    </select>

                    <select
                      aria-label="تصفية حسب الحالة"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-card border border-border px-3 py-2 text-xs rounded-xl outline-none focus:border-primary text-foreground"
                    >
                      <option value="">جميع الحالات</option>
                      <option value="Open">مفتوحة</option>
                      <option value="Assigned">مسندة لفني</option>
                      <option value="In Progress">قيد المعالجة</option>
                      <option value="Pending Approval">بانتظار الاعتماد</option>
                      <option value="Waiting for User">في انتظار رد المستخدم</option>
                      <option value="Resolved">تم الحل</option>
                      <option value="Closed">مغلقة</option>
                    </select>

                    <select
                      aria-label="تصفية حسب الأولوية"
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="bg-card border border-border px-3 py-2 text-xs rounded-xl outline-none focus:border-primary text-foreground"
                    >
                      <option value="">جميع الأولويات</option>
                      <option value="Critical">حرج</option>
                      <option value="Urgent">عاجل</option>
                      <option value="High">مرتفع</option>
                      <option value="Medium">متوسط</option>
                      <option value="Low">منخفض</option>
                    </select>
                  </>
                }
              />
            </div>

            {/* Mobile Filter Sheet */}
            <MobileFilterSheet
              isOpen={mobileFilterOpen}
              onClose={() => setMobileFilterOpen(false)}
              title="تصفية تذاكر الدعم الفني"
              activeCount={ticketFilterCount}
              onReset={resetTicketFilters}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    تصنيف التذكرة
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full bg-background border border-border p-3 text-xs rounded-xl outline-none"
                  >
                    <option value="">جميع التصنيفات</option>
                    <option value="Hardware">أجهزة وعتاد</option>
                    <option value="Software">برمجيات وأنظمة</option>
                    <option value="Network">شبكات واتصالات</option>
                    <option value="Access">صلاحيات وأمان</option>
                    <option value="Email">بريد إلكتروني</option>
                  </select>
                </div>
              </div>
            </MobileFilterSheet>

            {/* KANBAN BOARD VIEW */}
            {currentView === "kanban" ? (
              <div className="pt-2">
                <TicketKanban
                  tickets={tickets.map((t) => ({
                    id: t.id,
                    ticket_number: t.ticket_number,
                    issue_title: t.issue_title,
                    requester_name: t.requester_name,
                    assigned_technician_name: t.assigned_technician_name,
                    priority: t.priority,
                    status: t.status,
                    category: t.category,
                    sla_target_at: t.sla_target_at,
                    sla_paused_at: t.sla_paused_at,
                    comments_count: t.comments_count,
                  }))}
                  onSelectTicket={handleOpenDetail}
                  onUpdateStatus={handleKanbanStatusUpdate}
                />
              </div>
            ) : (
              /* TABLE & MOBILE CARDS VIEW */
              <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
                {loading ? (
                  <TableSkeleton variant="table" rows={5} cols={7} />
                ) : tickets.length === 0 ? (
                  <EmptyState
                    icon={<LifeBuoyIcon className="w-7 h-7" />}
                    title="لا توجد تذاكر دعم تطابق معايير البحث"
                    description="يمكنك إضافة تذكرة دعم فني جديدة عند حدوث أي عطل أو إعادة ضبط الفلاتر"
                    action={
                      <button
                        type="button"
                        onClick={() => setWizardModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
                      >
                        فتح طلب خدمة جديد
                      </button>
                    }
                  />
                ) : (
                  <>
                    {/* Mobile Ticket Cards */}
                    <div className="block lg:hidden p-3 space-y-3">
                      {tickets.map((t) => (
                        <MobileTicketCard
                          key={t.id}
                          ticket={t}
                          onClick={() => handleOpenDetail(t.id)}
                        />
                      ))}
                    </div>

                    {/* Desktop Tickets Table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border">
                          <tr>
                            <th className="py-3 px-4">رقم التذكرة</th>
                            <th className="py-3 px-4">عنوان البلاغ والخدمة</th>
                            <th className="py-3 px-4">مقدم البلاغ</th>
                            <th className="py-3 px-4">الفني المسؤول</th>
                            <th className="py-3 px-4">الأولوية</th>
                            <th className="py-3 px-4">مؤشر SLA</th>
                            <th className="py-3 px-4">الحالة</th>
                            <th className="py-3 px-4">الإجراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {tickets.map((t) => (
                            <tr
                              key={t.id}
                              className="hover:bg-muted/30 transition cursor-pointer"
                              onClick={() => handleOpenDetail(t.id)}
                            >
                              <td className="py-3 px-4 font-mono text-xs font-black text-primary">
                                {t.ticket_number}
                              </td>
                              <td className="py-3 px-4 font-bold text-foreground">
                                <div className="max-w-[280px] truncate">{t.issue_title}</div>
                                <span className="text-[11px] text-muted-foreground block font-normal">
                                  {t.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs text-muted-foreground">
                                {t.requester_name || "موظف"}
                              </td>
                              <td className="py-3 px-4 text-xs text-foreground font-medium">
                                {t.assigned_technician_name || (
                                  <span className="text-amber-600 dark:text-amber-400 font-bold">
                                    في قائمة الانتظار
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <ServicePriorityBadge priority={t.priority} />
                              </td>
                              <td className="py-3 px-4">
                                <SlaCountdownPill
                                  targetAt={t.sla_target_at}
                                  status={t.status}
                                  isPaused={!!t.sla_paused_at}
                                />
                              </td>
                              <td className="py-3 px-4">
                                <ServiceStatusBadge status={t.status} />
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDetail(t.id);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-border hover:bg-muted transition"
                                >
                                  عرض التفاصيل
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: SELF-SERVICE PORTAL */}
        {currentView === "self_service" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-right">
                <span className="text-xs font-bold text-primary">مرحباً بك في بوابة الخدمة الذاتية</span>
                <h2 className="text-xl sm:text-2xl font-black text-foreground">
                  ما الخدمة التي تحتاج إليها اليوم؟
                </h2>
                <p className="text-xs text-muted-foreground max-w-lg">
                  اختر من دليل الخدمات المصنفة، تتبع حالة طلباتك واعتماداتك، أو ابحث في قاعدة الحلول المعتمدة.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border border-border bg-card hover:bg-muted text-foreground transition"
                >
                  بلاغ سريع
                </button>
                <button
                  type="button"
                  onClick={() => setWizardModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-primary text-primary-foreground hover:opacity-95 shadow-md transition"
                >
                  طلب خدمة جديد +
                </button>
              </div>
            </div>

            {/* Quick Catalog Embed */}
            <AdaptiveTicketWizard
              onSuccess={(id) => {
                loadTickets();
                handleOpenDetail(id);
              }}
              onCancel={() => setCurrentView("operations")}
            />
          </div>
        )}

        {/* VIEW 4: APPROVAL CENTER */}
        {currentView === "approvals" && (
          <ApprovalCenter onRefreshParent={() => loadTickets()} />
        )}

        {/* ADAPTIVE TICKET WIZARD MODAL */}
        <Modal
          isOpen={wizardModalOpen}
          onClose={() => setWizardModalOpen(false)}
          title="معالج طلبات الخدمة التقنية"
          maxWidth="max-w-4xl"
        >
          <AdaptiveTicketWizard
            onSuccess={(id) => {
              setWizardModalOpen(false);
              loadTickets();
              handleOpenDetail(id);
            }}
            onCancel={() => setWizardModalOpen(false)}
          />
        </Modal>

        {/* QUICK TICKET MODAL */}
        <QuickTicketModal
          isOpen={quickModalOpen}
          onClose={() => setQuickModalOpen(false)}
          onSuccess={() => loadTickets()}
        />

        {/* ENTERPRISE TICKET WORKSPACE MODAL */}
        <Modal
          isOpen={detailModal}
          onClose={() => setDetailModal(false)}
          title="مساحة عمل تذكرة الدعم الفني"
          maxWidth="max-w-5xl"
        >
          {workspaceDetail && (
            <TicketWorkspace
              ticket={workspaceDetail}
              onClose={() => setDetailModal(false)}
              onRefresh={async () => {
                const res = await api.get<TicketDetail>(`/tickets/${workspaceDetail.id}`);
                setSelectedTicket(res.data);
                setWorkspaceDetail(res.data);
                loadTickets();
              }}
              onConvertToTask={handleConvertToTask}
            />
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
