"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  BellOff,
  Bookmark,
  CheckSquare,
  GitMerge,
  Keyboard,
  ListTodo,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  workApi,
  type MacroItem,
  type SavedViewItem,
  type TeamItem,
  type TicketEventItem,
  type TicketInboxDetail,
  type TicketInboxItem,
} from "@/lib/workApi";
import { SlaBadge } from "@/components/work-management/SlaBadge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface UserOption {
  id: string;
  username: string;
  full_name?: string;
}

interface HelpDeskInboxViewProps {
  onCreateNew?: () => void;
}

const PRIORITY_BADGE: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  "Urgent / Critical": "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  Urgent: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/25",
  High: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/25",
  Medium: "bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/25",
  Low: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
};

const EVENT_KIND_LABEL: Record<string, string> = {
  comment_public: "رد عام",
  comment_internal: "ملاحظة داخلية",
  assignment: "تحديث الإسناد",
  status_change: "تغيير الحالة",
  priority_change: "تغيير الأولوية",
  sla_warning: "تنبيه SLA",
  sla_breach: "تجاوز SLA",
  merge: "دمج تذكرة",
  task_linked: "مهمة مرتبطة",
};

export function HelpDeskInboxView({ onCreateNew }: HelpDeskInboxViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  const selectedTicketId = searchParams.get("ticket") || "";

  // List state
  const [tickets, setTickets] = useState<TicketInboxItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters & Views
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [slaFilter, setSlaFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [savedViews, setSavedViews] = useState<SavedViewItem[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");

  // Reference metadata
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [macros, setMacros] = useState<MacroItem[]>([]);

  // Detail & Timeline state
  const [detail, setDetail] = useState<TicketInboxDetail | null>(null);
  const [events, setEvents] = useState<TicketEventItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Composer state
  const [replyText, setReplyText] = useState("");
  const [replyMode, setReplyMode] = useState<"public" | "internal">("public");
  const [showMacroMenu, setShowMacroMenu] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Modals
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [requireTasksToClose, setRequireTasksToClose] = useState(true);
  const [transitionCommentModal, setTransitionCommentModal] = useState<{ toStatus: string; comment: string } | null>(null);

  const assignSelectRef = useRef<HTMLSelectElement>(null);
  const replyBoxRef = useRef<HTMLTextAreaElement>(null);
  const firstStatusBtnRef = useRef<HTMLButtonElement>(null);

  const isStaff = Boolean(
    user?.is_superadmin ||
      user?.roles?.some((r) => ["Super Admin", "Company Admin", "IT Manager", "IT Technician"].includes(r))
  );

  // Load metadata (teams, users, macros, saved views)
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      workApi.listTeams(),
      api.get<UserOption[]>("/users?per_page=100"),
      workApi.listMacros(),
      workApi.listSavedViews("tickets"),
    ]).then(([tRes, uRes, mRes, svRes]) => {
      if (!mounted) return;
      if (tRes.status === "fulfilled" && Array.isArray(tRes.value.data)) setTeams(tRes.value.data);
      if (uRes.status === "fulfilled" && Array.isArray(uRes.value.data)) setUsers(uRes.value.data);
      if (mRes.status === "fulfilled" && Array.isArray(mRes.value.data)) setMacros(mRes.value.data);
      if (svRes.status === "fulfilled" && Array.isArray(svRes.value.data)) setSavedViews(svRes.value.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadTickets = useCallback(
    async (cursor?: string | null) => {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoadingList(true);
        setListError(null);
      }
      try {
        const res = await workApi.listTickets({
          per_page: 25,
          q: q.trim() || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          sla_state: slaFilter || undefined,
          team_id: teamFilter || undefined,
          assignee_id: assigneeFilter || undefined,
          saved_view_id: activeViewId || undefined,
          cursor: cursor || undefined,
        });
        const rows = Array.isArray(res.data) ? res.data : [];
        if (cursor) {
          setTickets((prev) => [...prev, ...rows]);
        } else {
          setTickets(rows);
        }
        const pg = res.pagination as { next_cursor?: string | null } | undefined;
        setNextCursor(pg?.next_cursor || null);
      } catch (err) {
        setListError(err instanceof Error ? err.message : "تعذر تحميل التذاكر");
      } finally {
        setLoadingList(false);
        setLoadingMore(false);
      }
    },
    [q, statusFilter, priorityFilter, slaFilter, teamFilter, assigneeFilter, activeViewId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTickets(null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadTickets]);

  const loadDetail = useCallback(async (ticketId: string) => {
    if (!ticketId) {
      setDetail(null);
      setEvents([]);
      return;
    }
    setLoadingDetail(true);
    try {
      const [dRes, eRes] = await Promise.all([
        workApi.getTicket(ticketId),
        workApi.listTicketEvents(ticketId),
      ]);
      setDetail(dRes.data);
      setEvents(Array.isArray(eRes.data) ? eRes.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحميل تفاصيل التذكرة");
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedTicketId) {
      const t = window.setTimeout(() => void loadDetail(selectedTicketId), 0);
      return () => window.clearTimeout(t);
    }
    if (tickets.length > 0 && typeof window !== "undefined" && window.innerWidth >= 1024) {
      // Auto-select first ticket on desktop split-pane
      const firstId = tickets[0].id;
      const params = new URLSearchParams(searchParams.toString());
      params.set("ticket", firstId);
      router.replace(`/tickets?${params.toString()}`, { scroll: false });
    }
  }, [selectedTicketId, tickets, router, searchParams, loadDetail]);

  const selectTicket = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("ticket", id);
      router.replace(`/tickets?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Keyboard shortcuts (J/K, A, S, R, N, ?)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (key === "j" || key === "k") {
        if (tickets.length === 0) return;
        e.preventDefault();
        const curIdx = tickets.findIndex((t) => t.id === selectedTicketId);
        const nextIdx =
          key === "j"
            ? Math.min(tickets.length - 1, curIdx < 0 ? 0 : curIdx + 1)
            : Math.max(0, curIdx <= 0 ? 0 : curIdx - 1);
        selectTicket(tickets[nextIdx].id);
      } else if (key === "a") {
        e.preventDefault();
        assignSelectRef.current?.focus();
      } else if (key === "s") {
        e.preventDefault();
        firstStatusBtnRef.current?.focus();
      } else if (key === "r") {
        e.preventDefault();
        replyBoxRef.current?.focus();
      } else if (key === "n" && onCreateNew) {
        e.preventDefault();
        onCreateNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tickets, selectedTicketId, selectTicket, onCreateNew]);

  const handleAssign = async (opts: { team_id?: string | null; assignee_id?: string | null; auto_assign?: boolean }) => {
    if (!detail) return;
    try {
      await workApi.assignTicket(detail.id, opts);
      toast.success("تم تحديث إسناد التذكرة");
      await Promise.all([loadDetail(detail.id), loadTickets(null)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث الإسناد");
    }
  };

  const handleTransition = async (toStatus: string, requiresComment: boolean, providedComment?: string) => {
    if (!detail) return;
    if (requiresComment && !providedComment?.trim()) {
      setTransitionCommentModal({ toStatus, comment: "" });
      return;
    }
    try {
      await workApi.transitionTicket(detail.id, {
        to_status: toStatus,
        comment: providedComment?.trim() || undefined,
      });
      toast.success(`تم نقل الحالة إلى ${toStatus}`);
      setTransitionCommentModal(null);
      await Promise.all([loadDetail(detail.id), loadTickets(null)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "لا يمكن تنفيذ هذا الانتقال");
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await workApi.postTicketEvent(detail.id, {
        content: replyText.trim(),
        visibility: isStaff ? replyMode : "public",
      });
      setReplyText("");
      toast.success(replyMode === "internal" ? "تم حفظ الملاحظة الداخلية" : "تم إرسال الرد");
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إرسال التحديث");
    } finally {
      setSendingReply(false);
    }
  };

  const handleInsertMacro = (macro: MacroItem) => {
    setReplyText((prev) => (prev ? `${prev}\n${macro.body}` : macro.body));
    if (isStaff && macro.visibility === "internal") {
      setReplyMode("internal");
    }
    setShowMacroMenu(false);
    replyBoxRef.current?.focus();
  };

  const handleToggleWatch = async () => {
    if (!detail || !user) return;
    const isWatching = (detail.watchers || []).some((w) => w.user_id === user.id);
    try {
      if (isWatching) {
        await workApi.unwatchTicket(detail.id, user.id);
        toast.info("تم إلغاء متابعة التذكرة");
      } else {
        await workApi.watchTicket(detail.id);
        toast.success("تمت إضافة التذكرة إلى قائمة متابعتك");
      }
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث المتابعة");
    }
  };

  const handleBulkAction = async (
    action: "assign" | "transition" | "priority" | "close",
    extra: Record<string, unknown> = {}
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await workApi.bulkTickets({ ticket_ids: ids, action, ...extra });
      const { succeeded_count, failed_count } = res.data;
      toast.success(`تم التحديث على ${succeeded_count} تذكرة${failed_count ? ` (فشل ${failed_count})` : ""}`);
      setSelectedIds(new Set());
      setBulkStatus("");
      setBulkAssignee("");
      setBulkPriority("");
      await loadTickets(null);
      if (detail && ids.includes(detail.id)) {
        await loadDetail(detail.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء الجماعي");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleCreateLinkedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    try {
      await workApi.createTaskFromTicket(detail.id, {
        title: newTaskTitle.trim() || `مهمة: ${detail.issue_title}`,
        require_tasks_done_to_close: requireTasksToClose,
        auto_assign: !detail.assigned_technician_id,
      });
      toast.success("تم إنشاء المهمة المرتبطة بالتذكرة");
      setShowTaskModal(false);
      setNewTaskTitle("");
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء المهمة");
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !mergeTargetId) return;
    try {
      await workApi.mergeTicket(detail.id, mergeTargetId, "دمج تذكرة مكررة");
      toast.success("تم دمج التذكرة بنجاح");
      setShowMergeModal(false);
      setMergeTargetId("");
      selectTicket(mergeTargetId);
      await loadTickets(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر دمج التذكرة");
    }
  };

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    try {
      const res = await workApi.createSavedView({
        scope: "tickets",
        name: newViewName.trim(),
        filters: {
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          sla_state: slaFilter || undefined,
          team_id: teamFilter || undefined,
          assignee_id: assigneeFilter || undefined,
        },
      });
      setSavedViews((prev) => [...prev, res.data]);
      setNewViewName("");
      setShowSaveViewModal(false);
      toast.success("تم حفظ العرض بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ العرض");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isWatchingDetail = useMemo(
    () => Boolean(detail && user && (detail.watchers || []).some((w) => w.user_id === user.id)),
    [detail, user]
  );

  return (
    <div className="space-y-3">
      {/* Quick Views & Filter Bar */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "all", label: "الكل", onClick: () => { setActiveViewId(""); setAssigneeFilter(""); setSlaFilter(""); setStatusFilter(""); } },
              { key: "me", label: "مسند لي", onClick: () => { setActiveViewId(""); setAssigneeFilter("me"); setSlaFilter(""); } },
              { key: "unassigned", label: "غير معين", onClick: () => { setActiveViewId(""); setAssigneeFilter("unassigned"); setSlaFilter(""); } },
              { key: "breached", label: "متجاوز SLA", onClick: () => { setActiveViewId(""); setSlaFilter("breached"); setAssigneeFilter(""); } },
            ].map((chip) => {
              const active =
                (chip.key === "all" && !activeViewId && !assigneeFilter && !slaFilter && !statusFilter) ||
                (chip.key === "me" && assigneeFilter === "me") ||
                (chip.key === "unassigned" && assigneeFilter === "unassigned") ||
                (chip.key === "breached" && slaFilter === "breached");
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClick}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                      : "bg-[var(--muted)]/50 text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
            {savedViews.map((sv) => (
              <button
                key={sv.id}
                type="button"
                onClick={() => setActiveViewId(activeViewId === sv.id ? "" : sv.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                  activeViewId === sv.id
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]"
                }`}
              >
                <Bookmark className="w-3 h-3" />
                <span>{sv.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSaveViewModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
              title="حفظ التصفية الحالية كعرض"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>حفظ العرض</span>
            </button>
            <button
              type="button"
              onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
              title="تبديل كثافة القائمة"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{density === "compact" ? "مضغوط" : "مريح"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
              aria-label="اختصارات لوحة المفاتيح"
              title="اختصارات لوحة المفاتيح (?)"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">?</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث برقم التذكرة أو العنوان..."
              className="w-full ps-9 pe-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل الحالات</option>
            <option value="Open">Open</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Waiting for User">Waiting for User</option>
            <option value="Waiting for Vendor">Waiting for Vendor</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل الأولويات</option>
            <option value="Critical">Critical</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل الفرق</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
          <select
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل حالات SLA</option>
            <option value="ok">ضمن SLA</option>
            <option value="at_risk">قريب الانتهاء</option>
            <option value="breached">متجاوز SLA</option>
            <option value="paused">متوقف مؤقتاً</option>
          </select>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {isStaff && selectedIds.size > 0 && (
        <div className="bg-[var(--primary)] text-white rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CheckSquare className="w-4 h-4" />
            <span>تم تحديد {selectedIds.size} تذكرة</span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="underline opacity-85 hover:opacity-100 ms-2 cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkAssignee}
              onChange={(e) => {
                setBulkAssignee(e.target.value);
                if (e.target.value) void handleBulkAction("assign", { assignee_id: e.target.value });
              }}
              disabled={bulkBusy}
              className="px-2 py-1 text-xs rounded-lg bg-white/15 text-white border border-white/25"
            >
              <option value="" className="text-slate-900">إسناد جماعي...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id} className="text-slate-900">
                  {u.full_name || u.username}
                </option>
              ))}
            </select>
            <select
              value={bulkStatus}
              onChange={(e) => {
                setBulkStatus(e.target.value);
                if (e.target.value) void handleBulkAction("transition", { to_status: e.target.value });
              }}
              disabled={bulkBusy}
              className="px-2 py-1 text-xs rounded-lg bg-white/15 text-white border border-white/25"
            >
              <option value="" className="text-slate-900">تغيير الحالة...</option>
              <option value="In Progress" className="text-slate-900">In Progress</option>
              <option value="Waiting for User" className="text-slate-900">Waiting for User</option>
              <option value="Resolved" className="text-slate-900">Resolved</option>
            </select>
            <select
              value={bulkPriority}
              onChange={(e) => {
                setBulkPriority(e.target.value);
                if (e.target.value) void handleBulkAction("priority", { priority: e.target.value });
              }}
              disabled={bulkBusy}
              className="px-2 py-1 text-xs rounded-lg bg-white/15 text-white border border-white/25"
            >
              <option value="" className="text-slate-900">الأولوية...</option>
              <option value="Critical" className="text-slate-900">Critical</option>
              <option value="High" className="text-slate-900">High</option>
              <option value="Medium" className="text-slate-900">Medium</option>
              <option value="Low" className="text-slate-900">Low</option>
            </select>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkAction("close")}
              className="px-3 py-1 rounded-lg bg-white text-[var(--primary)] text-xs font-bold hover:opacity-90 cursor-pointer"
            >
              إغلاق المحدد
            </button>
          </div>
        </div>
      )}

      {/* Split-Pane Master / Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[620px]">
        {/* Ticket Queue List */}
        <div className="lg:col-span-5 xl:col-span-4 bg-[var(--card)] border border-[var(--border)] rounded-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span className="font-semibold text-[var(--foreground)]">قائمة التذاكر ({tickets.length})</span>
            <button
              type="button"
              onClick={() => void loadTickets(null)}
              className="p-1 rounded hover:bg-[var(--muted)] cursor-pointer"
              title="تحديث"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] max-h-[680px]">
            {loadingList && tickets.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-[var(--muted)] animate-pulse" />
                ))}
              </div>
            ) : listError ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-red-600">{listError}</p>
                <button
                  type="button"
                  onClick={() => void loadTickets(null)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[var(--primary)] text-white cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                لا توجد تذاكر مطابقة لمعايير التصفية الحالية.
              </div>
            ) : (
              tickets.map((t) => {
                const isActive = t.id === selectedTicketId;
                const isChecked = selectedIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => selectTicket(t.id)}
                    className={`flex items-start gap-2.5 cursor-pointer transition-colors ${
                      density === "compact" ? "px-3 py-2" : "px-3.5 py-3"
                    } ${
                      isActive
                        ? "bg-[var(--primary)]/8 border-s-2 border-s-[var(--primary)]"
                        : "hover:bg-[var(--muted)]/50"
                    }`}
                  >
                    {isStaff && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`تحديد ${t.ticket_number}`}
                        className="mt-1 rounded border-[var(--border)] cursor-pointer"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[var(--muted-foreground)]">
                          <bdi>{t.ticket_number}</bdi>
                        </span>
                        <SlaBadge state={t.sla_state} dueAt={t.resolution_due_at} compact />
                      </div>
                      <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                        {t.issue_title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.Medium}`}>
                          {t.priority}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)] text-[10px]">{t.status}</span>
                        {t.team_name && <span className="truncate max-w-[110px]">• {t.team_name}</span>}
                        <span className="truncate max-w-[110px]">
                          • {t.assigned_technician_name || "غير معين"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {nextCursor && (
            <div className="p-2.5 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadTickets(nextCursor)}
                className="w-full py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
              >
                {loadingMore ? "جاري التحميل..." : "تحميل المزيد"}
              </button>
            </div>
          )}
        </div>

        {/* Ticket Detail & Unified Timeline Pane */}
        <div className="lg:col-span-7 xl:col-span-8 bg-[var(--card)] border border-[var(--border)] rounded-xl flex flex-col overflow-hidden">
          {!selectedTicketId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-sm text-[var(--muted-foreground)]">
              <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
              <p>اختر تذكرة من القائمة لعرض التفاصيل والسجل الزمني الكامل</p>
              <p className="text-xs mt-1">استخدم مفتاحي J / K للتنقل السريع أو ? لعرض الاختصارات</p>
            </div>
          ) : loadingDetail && !detail ? (
            <div className="p-6 space-y-4">
              <div className="h-8 w-2/3 bg-[var(--muted)] rounded animate-pulse" />
              <div className="h-24 bg-[var(--muted)] rounded animate-pulse" />
              <div className="h-48 bg-[var(--muted)] rounded animate-pulse" />
            </div>
          ) : detail ? (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-[var(--border)] space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--muted)]">
                        <bdi>{detail.ticket_number}</bdi>
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--primary)]/12 text-[var(--primary)]">
                        {detail.status}
                      </span>
                      <SlaBadge state={detail.sla_state} dueAt={detail.resolution_due_at} />
                      {detail.merged_into_ticket_id && (
                        <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          مدمجة في تذكرة أخرى
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-[var(--foreground)]">{detail.issue_title}</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      مقدم الطلب: {detail.requester_name || "غير محدد"} • التصنيف: {detail.category} • الأولوية: {detail.priority}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleToggleWatch()}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${
                        isWatchingDetail
                          ? "bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]"
                          : "border-[var(--border)] hover:bg-[var(--muted)]"
                      }`}
                    >
                      {isWatchingDetail ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      <span>{isWatchingDetail ? "إلغاء المتابعة" : "متابعة"} ({detail.watchers?.length || 0})</span>
                    </button>
                    {isStaff && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setNewTaskTitle(`مهمة: ${detail.issue_title}`);
                            setShowTaskModal(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                        >
                          <ListTodo className="w-3.5 h-3.5" />
                          <span>مهمة مرتبطة</span>
                        </button>
                        {!detail.merged_into_ticket_id && (
                          <button
                            type="button"
                            onClick={() => setShowMergeModal(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            <span>دمج</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Staff Controls: Team + Assignee + Auto-Assign + Workflow Transitions */}
                {isStaff && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]/70">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      <select
                        aria-label="الفريق"
                        value={detail.team_id || ""}
                        onChange={(e) => void handleAssign({ team_id: e.target.value || null })}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                      >
                        <option value="">بدون فريق</option>
                        {teams.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      <select
                        ref={assignSelectRef}
                        aria-label="الفني المكلف"
                        value={detail.assigned_technician_id || ""}
                        onChange={(e) =>
                          void handleAssign(
                            e.target.value ? { assignee_id: e.target.value } : { assignee_id: null }
                          )
                        }
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                      >
                        <option value="">غير معين</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.username}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleAssign({ auto_assign: true })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--muted)]/80 border border-[var(--border)] cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>توزيع تلقائي</span>
                    </button>

                    <div className="flex flex-wrap items-center gap-1 ms-auto">
                      {(detail.allowed_transitions || []).slice(0, 5).map((tr, idx) => (
                        <button
                          key={tr.to_status}
                          ref={idx === 0 ? firstStatusBtnRef : undefined}
                          type="button"
                          onClick={() => void handleTransition(tr.to_status, tr.requires_comment)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-colors cursor-pointer"
                        >
                          ← {tr.to_status}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description + Linked Tasks */}
              <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/25 space-y-2.5">
                <p className="text-xs leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
                  {detail.issue_description}
                </p>
                {detail.linked_tasks && detail.linked_tasks.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border)]/60">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--muted-foreground)] mb-1.5">
                      <span>المهام المرتبطة ({detail.linked_tasks.length})</span>
                      {detail.require_tasks_done_to_close && (
                        <span className="text-amber-700 dark:text-amber-300">
                          إغلاق التذكرة يتطلب إكمال المهام المرتبطة
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.linked_tasks.map((lt) => (
                        <button
                          key={lt.id}
                          type="button"
                          onClick={() => router.push(`/tasks?task=${lt.id}`)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] cursor-pointer"
                        >
                          <ListTodo className="w-3 h-3 text-[var(--primary)]" />
                          <span>{lt.title}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--muted)] text-[10px]">{lt.status}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Unified Event Timeline */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[340px]">
                {events.length === 0 ? (
                  <p className="text-xs text-center text-[var(--muted-foreground)] py-6">لا توجد أحداث أو ردود بعد.</p>
                ) : (
                  events.map((ev) => {
                    const isInternal = ev.visibility === "internal";
                    const content = typeof ev.payload?.content === "string" ? ev.payload.content : null;
                    return (
                      <div
                        key={ev.id}
                        className={`rounded-xl p-3 text-xs border ${
                          isInternal
                            ? "bg-amber-500/10 border-amber-500/30"
                            : ev.kind.startsWith("comment_")
                            ? "bg-[var(--background)] border-[var(--border)]"
                            : "bg-[var(--muted)]/40 border-[var(--border)]/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
                            {isInternal && <Lock className="w-3 h-3 text-amber-600" />}
                            <span>{ev.actor_name || "النظام"}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--card)] border border-[var(--border)]">
                              {EVENT_KIND_LABEL[ev.kind] || ev.kind}
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                            <bdi>{new Date(ev.created_at).toLocaleString("ar-SA")}</bdi>
                          </span>
                        </div>
                        {content ? (
                          <p className="text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">{content}</p>
                        ) : (
                          <p className="text-[var(--muted-foreground)]">
                            {ev.kind === "status_change"
                              ? `${String(ev.payload?.from || "جديد")} ← ${String(ev.payload?.to || "")}`
                              : ev.kind === "assignment"
                              ? `الاستراتيجية: ${String(ev.payload?.strategy || "manual")} (${String(ev.payload?.reason || "")})`
                              : JSON.stringify(ev.payload)}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply / Internal Note Composer with `/` Macro Picker */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-[var(--border)] bg-[var(--card)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setReplyMode("public")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                        replyMode === "public"
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--muted)] text-[var(--foreground)]"
                      }`}
                    >
                      رد عام
                    </button>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => setReplyMode("internal")}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                          replyMode === "internal"
                            ? "bg-amber-600 text-white"
                            : "bg-[var(--muted)] text-[var(--foreground)]"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>ملاحظة داخلية</span>
                      </button>
                    )}
                  </div>

                  {macros.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMacroMenu((v) => !v)}
                        className="px-2.5 py-1 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                      >
                        / رد جاهز ({macros.length})
                      </button>
                      {showMacroMenu && (
                        <div className="absolute bottom-full end-0 mb-1 w-72 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl z-20 p-1.5 space-y-1">
                          {macros.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleInsertMacro(m)}
                              className="w-full text-start p-2 rounded-lg hover:bg-[var(--muted)] text-xs cursor-pointer"
                            >
                              <div className="font-semibold text-[var(--foreground)] flex items-center justify-between">
                                <span>{m.title}</span>
                                {m.visibility === "internal" && (
                                  <span className="text-[10px] text-amber-600">داخلي</span>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--muted-foreground)] truncate">{m.body}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    ref={replyBoxRef}
                    rows={2}
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      if (e.target.value === "/" && macros.length > 0) setShowMacroMenu(true);
                    }}
                    placeholder={
                      replyMode === "internal"
                        ? "اكتب ملاحظة فنية داخلية للفريق فقط (لن تظهر للموظف)..."
                        : "اكتب ردك هنا أو اكتب / لإدراج رد جاهز..."
                    }
                    className={`flex-1 rounded-xl px-3 py-2 text-xs border resize-none focus:outline-none focus:ring-2 ${
                      replyMode === "internal"
                        ? "bg-amber-500/8 border-amber-500/40 focus:ring-amber-500/30"
                        : "bg-[var(--background)] border-[var(--border)] focus:ring-[var(--primary)]/30"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--primary)] text-white disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingReply ? "جاري الإرسال..." : "إرسال"}</span>
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {/* Shortcuts Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">اختصارات لوحة المفاتيح</h3>
              <button type="button" onClick={() => setShowShortcuts(false)} className="p-1 rounded hover:bg-[var(--muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["J / K", "التذكرة التالية / السابقة"],
                ["A", "تغيير الفني المكلف"],
                ["S", "نقل حالة التذكرة"],
                ["R", "التركيز على صندوق الرد"],
                ["N", "إنشاء تذكرة جديدة"],
                ["?", "إظهار / إخفاء الاختصارات"],
              ].map(([k, desc]) => (
                <div key={k} className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/50">
                  <span>{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono text-[11px]">{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save View Modal */}
      {showSaveViewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveViewModal(false)}>
          <form onSubmit={handleSaveView} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-sm w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">حفظ العرض الحالي</h3>
            <input
              type="text"
              required
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="اسم العرض (مثال: تذاكر الشبكات العاجلة)"
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSaveViewModal(false)} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] cursor-pointer">إلغاء</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white cursor-pointer">حفظ</button>
            </div>
          </form>
        </div>
      )}

      {/* Transition Required Comment Modal */}
      {transitionCommentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTransitionCommentModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleTransition(transitionCommentModal.toStatus, false, transitionCommentModal.comment);
            }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold">ملاحظة مطلوبة للانتقال إلى ({transitionCommentModal.toStatus})</h3>
            <textarea
              required
              rows={3}
              value={transitionCommentModal.comment}
              onChange={(e) => setTransitionCommentModal({ ...transitionCommentModal, comment: e.target.value })}
              placeholder="اذكر سبب تغيير الحالة..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTransitionCommentModal(null)} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] cursor-pointer">إلغاء</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white cursor-pointer">تأكيد الانتقال</button>
            </div>
          </form>
        </div>
      )}

      {/* Create Linked Task Modal */}
      {showTaskModal && detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
          <form onSubmit={handleCreateLinkedTask} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">إنشاء مهمة مرتبطة بالتذكرة {detail.ticket_number}</h3>
            <input
              type="text"
              required
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={requireTasksToClose}
                onChange={(e) => setRequireTasksToClose(e.target.checked)}
              />
              <span>منع إغلاق التذكرة قبل إكمال هذه المهمة</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTaskModal(false)} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] cursor-pointer">إلغاء</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white cursor-pointer">إنشاء المهمة</button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Duplicate Modal */}
      {showMergeModal && detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMergeModal(false)}>
          <form onSubmit={handleMerge} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">دمج التذكرة {detail.ticket_number} في تذكرة أخرى</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              سيتم إغلاق التذكرة الحالية ونقل مهامها ومتابعيها إلى التذكرة الهدف.
            </p>
            <select
              required
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              <option value="">اختر التذكرة الهدف...</option>
              {tickets
                .filter((t) => t.id !== detail.id && !t.merged_into_ticket_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ticket_number} — {t.issue_title}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowMergeModal(false)} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] cursor-pointer">إلغاء</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white cursor-pointer">تأكيد الدمج</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
