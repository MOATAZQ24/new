"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_BASE, api, parseApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";

interface ProgressStep {
  key: string;
  label: string;
  status: "running" | "completed" | "warning" | "failed" | "denied";
  detail?: string;
}

interface CandidateOption {
  employee_id?: string;
  short_id?: string;
  employee_number?: string;
  full_name?: string;
  job_title?: string;
  branch_name?: string | null;
  department_name?: string | null;
  has_user_account?: boolean;
  username?: string | null;
  telegram_linked?: boolean;
  telegram_username?: string | null;
  distinguishing_label?: string;
  task_id?: string;
  reference?: string;
  title?: string;
  status?: string;
  assignee_name?: string;
  ticket_id?: string;
  ticket_number?: string;
}

interface PendingConfirmation {
  confirmation_token: string;
  action_label: string;
  summary: string;
}

interface ResultCardData {
  type: string;
  task_id?: string;
  reference?: string;
  title?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  assignee_name?: string;
  in_app_status?: string;
  telegram_status?: string;
  telegram_error?: string;
  notification_summary?: string;
  ticket_id?: string;
  ticket_number?: string;
  category?: string;
  open_tasks?: number;
  overdue_tasks?: number;
  completed_tasks?: number;
  open_tickets?: number;
  urgent_tickets?: number;
  total_assets?: number;
  pending_maintenance?: number;
  count?: number;
  total_count?: number;
  truncated?: boolean;
  filter_label?: string;
  scope_note?: string | null;
  items?: Array<Record<string, unknown>>;
  tasks?: ResultCardData[];
}

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  steps?: ProgressStep[];
  resultCard?: ResultCardData | null;
  clarificationOptions?: CandidateOption[] | null;
  pendingIntent?: Record<string, unknown> | null;
  pendingConfirmation?: PendingConfirmation | null;
  suggestedFollowups?: string[];
  duplicate?: boolean;
  engineSource?: string;
}

interface AgentApiResponse {
  reply?: string;
  status?: string;
  steps?: ProgressStep[];
  result_card?: ResultCardData | null;
  clarification_options?: CandidateOption[] | null;
  pending_intent?: Record<string, unknown> | null;
  pending_confirmation?: PendingConfirmation | null;
  suggested_followups?: string[];
  duplicate?: boolean;
  engine_source?: string;
}

interface Capabilities {
  gemini_live_configured: boolean;
  model: string;
}

const STARTER_PROMPTS = [
  "اعرض المهام المتأخرة الخاصة بفريقي",
  "اعرض الملخص التشغيلي الحالي",
  "أنشئ مهمة لأحمد لمراجعة السيرفر غدًا وأرسل له إشعارًا",
  "أرسل إشعارًا لأحمد بضرورة مراجعة التذكرة رقم 125",
];

function createClientKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function AiAgentSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { activeCompany } = useAuth();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ProgressStep[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      status: "info",
      content:
        "مرحباً بك في الوكيل الذكي لـ Investor Gate OS. يمكنك إصدار أوامر مباشرة بالعربية أو الإنجليزية لإنشاء المهام، متابعة المتأخرات، إرسال الإشعارات، أو فتح وتحويل التذاكر.",
    },
  ]);

  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadCapabilities = useCallback(async () => {
    try {
      const res = await api.get<Capabilities>("/ai/agent/capabilities");
      if (res.data) setCapabilities(res.data);
    } catch {
      // Silently ignore if panel closed or offline
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadCapabilities();
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose, loadCapabilities]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveSteps, busy]);

  const sendCommand = async (
    text: string,
    opts?: {
      resolvedEmployeeId?: string;
      pendingIntent?: Record<string, unknown> | null;
      confirmationToken?: string;
      confirmDecision?: "confirm" | "cancel";
      displayUserText?: string;
      silentUserBubble?: boolean;
    }
  ) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userText = opts?.displayUserText || trimmed;
    const turnKey = createClientKey();

    if (!opts?.silentUserBubble) {
      setMessages((prev) => [
        ...prev,
        { id: `u-${turnKey}`, role: "user", content: userText },
      ]);
      setInput("");
    }

    setBusy(true);
    setLiveSteps([
      {
        key: "init",
        label: "جارٍ التحقق من الصلاحيات وتحليل الطلب...",
        status: "running",
      },
    ]);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (typeof window !== "undefined") {
        const activeCid = localStorage.getItem("active_company_id");
        if (activeCid) headers["X-Company-ID"] = activeCid;
      }

      const historyPayload = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const lowTrimmed = trimmed.toLowerCase().replace(/[.!؟]/g, "");
      const typedConfirmDecision: "confirm" | "cancel" | undefined =
        !opts?.confirmationToken && lastAssistant?.pendingConfirmation
          ? ["نعم", "تأكيد", "تاكيد", "موافق", "أكيد", "اكيد", "نفذ", "تمام", "yes", "confirm", "ok", "proceed"].includes(lowTrimmed)
            ? "confirm"
            : ["لا", "إلغاء", "الغاء", "تراجع", "ألغ", "الغ", "no", "cancel", "abort"].includes(lowTrimmed)
            ? "cancel"
            : undefined
          : undefined;

      const resolvedConfToken = opts?.confirmationToken || (typedConfirmDecision ? lastAssistant?.pendingConfirmation?.confirmation_token : undefined);
      const resolvedPendingIntent =
        opts?.pendingIntent !== undefined
          ? opts.pendingIntent
          : !resolvedConfToken && lastAssistant?.status === "needs_clarification" && lastAssistant.pendingIntent
          ? lastAssistant.pendingIntent
          : undefined;

      const selectedAssetId =
        typeof window !== "undefined" && pathname?.startsWith("/assets")
          ? sessionStorage.getItem("ig_selected_asset_id") || undefined
          : undefined;
      const empPathMatch = pathname?.match(/^\/employees\/([0-9a-f-]{36})$/i);

      const body = {
        message: trimmed,
        idempotency_key: turnKey,
        confirmation_token: resolvedConfToken || undefined,
        confirm_decision: opts?.confirmDecision || typedConfirmDecision || undefined,
        resolved_employee_id: opts?.resolvedEmployeeId || undefined,
        pending_intent: resolvedPendingIntent || undefined,
        history: historyPayload,
        context: {
          current_page: pathname,
          selected_asset_id: selectedAssetId,
          selected_employee_id: empPathMatch ? empPathMatch[1] : undefined,
        },
      };

      const res = await fetch(`${API_BASE}/ai/agent/chat/stream`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errJson: unknown = null;
        try {
          errJson = await res.json();
        } catch {
          errJson = null;
        }
        throw new Error(parseApiErrorMessage(errJson, res.status));
      }

      let finalPayload: AgentApiResponse | null = null;
      const streamedSteps: ProgressStep[] = [];

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const clean = line.trim();
            if (!clean) continue;
            try {
              const evt = JSON.parse(clean);
              if (evt.type === "progress" && evt.step) {
                const s: ProgressStep = evt.step;
                const idx = streamedSteps.findIndex((x) => x.key === s.key);
                if (idx >= 0) streamedSteps[idx] = s;
                else streamedSteps.push(s);
                setLiveSteps([...streamedSteps]);
              } else if (evt.type === "complete" && evt.data) {
                finalPayload = evt.data;
              }
            } catch {
              // Ignore malformed partial chunk lines
            }
          }
        }
      }

      if (!finalPayload) {
        const fallback = await api.post<AgentApiResponse>("/ai/agent/chat", body);
        finalPayload = fallback.data;
      }

      const data: AgentApiResponse = finalPayload;
      const assistantEntry: ChatEntry = {
        id: `a-${turnKey}`,
        role: "assistant",
        content: data.reply || "تمت معالجة الطلب.",
        status: data.status,
        steps: data.steps || streamedSteps,
        resultCard: data.result_card || null,
        clarificationOptions: data.clarification_options || null,
        pendingIntent: data.pending_intent || null,
        pendingConfirmation: data.pending_confirmation || null,
        suggestedFollowups: data.suggested_followups || [],
        duplicate: Boolean(data.duplicate),
        engineSource: data.engine_source,
      };

      setMessages((prev) => [
        ...prev.map((m) =>
          m.role === "assistant"
            ? { ...m, pendingConfirmation: null, pendingIntent: null, clarificationOptions: null }
            : m
        ),
        assistantEntry,
      ]);

      if (data.status === "executed" || data.status === "partial_failure") {
        window.dispatchEvent(new Event("tasks:updated"));
        window.dispatchEvent(new Event("notifications:updated"));
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${turnKey}`,
          role: "assistant",
          status: "error",
          content: err instanceof Error ? err.message : "تعذر تنفيذ الأمر عبر المساعد الذكي.",
        },
      ]);
    } finally {
      setBusy(false);
      setLiveSteps([]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Subtle Backdrop on Small Viewports */}
      <div
        className="fixed inset-0 top-16 z-40 bg-slate-900/20 lg:hidden motion-backdrop-enter"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="false"
        aria-label="الوكيل الذكي للإجراءات التشغيلية"
        className="motion-drawer fixed top-16 bottom-0 end-0 z-50 w-[min(94vw,430px)] bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col"
      >
        {/* Compact Panel Header */}
        <div className="px-4 py-3 bg-[#123D32] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#C5A46D] text-[#123D32] flex items-center justify-center shrink-0">
              <Icons.Sparkles size={17} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight truncate">
                الوكيل الذكي | AI Action Agent
              </div>
              <div className="text-[10px] text-white/80 flex items-center gap-1.5 truncate mt-0.5">
                <span>{activeCompany?.name_ar || "المنشأة الحالية"}</span>
                <span>•</span>
                <span className="text-[#C5A46D] font-mono">
                  {capabilities?.gemini_live_configured ? capabilities.model : "Planner Engine"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                setMessages((prev) => prev.slice(0, 1))
              }
              title="بدء محادثة جديدة"
              aria-label="مسح المحادثة"
              className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Icons.Refresh size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق لوحة المساعد الذكي"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Icons.X size={17} />
            </button>
          </div>
        </div>

        {/* Starter Commands Strip */}
        <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {STARTER_PROMPTS.map((cmd, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (cmd.includes("لأحمد")) {
                  setInput(cmd);
                  inputRef.current?.focus();
                } else {
                  void sendCommand(cmd);
                }
              }}
              className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#187A5A] text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors cursor-pointer shrink-0"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Conversation Timeline */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-2 ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                  msg.role === "user"
                    ? "bg-[#123D32] text-white rounded-ee-none"
                    : msg.status === "denied" || msg.status === "error"
                    ? "bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                    : msg.status === "partial_failure"
                    ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700"
                }`}
              >
                {msg.content}
                {msg.duplicate && (
                  <div className="mt-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    (تم استرجاع النتيجة السابقة لمنع التكرار)
                  </div>
                )}
              </div>

              {/* Execution Step Trace */}
              {msg.steps && msg.steps.length > 0 && (
                <div className="w-[92%] space-y-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
                  {msg.steps.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
                        {s.status === "completed" ? (
                          <Icons.CheckCircle size={13} className="text-emerald-600 shrink-0" />
                        ) : s.status === "warning" ? (
                          <Icons.AlertTriangle size={13} className="text-amber-600 shrink-0" />
                        ) : s.status === "failed" || s.status === "denied" ? (
                          <Icons.AlertCircle size={13} className="text-rose-600 shrink-0" />
                        ) : (
                          <Icons.Refresh size={13} className="text-[#187A5A] animate-spin shrink-0" />
                        )}
                        <span>{s.label}</span>
                      </span>
                      {s.detail && (
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 font-mono truncate max-w-[140px]">
                          <bdi>{s.detail}</bdi>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Compact Verified Task Result Card */}
              {msg.resultCard && msg.resultCard.type === "task" && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#187A5A] bg-[#187A5A]/10 px-2 py-0.5 rounded">
                      <bdi dir="ltr">{msg.resultCard.reference}</bdi>
                    </span>
                    {msg.resultCard.status && <StatusBadge status={msg.resultCard.status} />}
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {msg.resultCard.title}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {msg.resultCard.assignee_name && (
                      <span>المسند إليه: <strong className="text-slate-900 dark:text-white">{msg.resultCard.assignee_name}</strong></span>
                    )}
                    {msg.resultCard.due_date && (
                      <span>الموعد: <bdi dir="ltr">{msg.resultCard.due_date}</bdi></span>
                    )}
                  </div>
                  {msg.resultCard.notification_summary && (
                    <div
                      className={`text-[11px] p-2 rounded-lg border ${
                        msg.resultCard.telegram_status === "Sent"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                      }`}
                    >
                      {msg.resultCard.notification_summary}
                    </div>
                  )}
                  <Link
                    href="/tasks"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#187A5A] hover:underline pt-0.5"
                  >
                    <span>فتح في صفحة المهام</span>
                    <Icons.ChevronLeft size={13} />
                  </Link>
                </div>
              )}

              {/* Compact Verified Notification Result Card */}
              {msg.resultCard && msg.resultCard.type === "notification" && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-xs space-y-1.5 text-[11px]">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {msg.resultCard.title} → {msg.resultCard.assignee_name}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {msg.resultCard.notification_summary}
                  </div>
                </div>
              )}

              {/* Compact Verified Ticket Result Card */}
              {msg.resultCard && msg.resultCard.type === "ticket" && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-xs space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#187A5A] bg-[#187A5A]/10 px-2 py-0.5 rounded">
                      <bdi dir="ltr">{msg.resultCard.ticket_number}</bdi>
                    </span>
                    {msg.resultCard.status && <StatusBadge status={msg.resultCard.status} />}
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {msg.resultCard.title}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    التصنيف: <strong className="text-slate-900 dark:text-white">{msg.resultCard.category || "—"}</strong> • الأولوية: <strong className="text-slate-900 dark:text-white">{msg.resultCard.priority || "Medium"}</strong>
                  </div>
                </div>
              )}

              {/* Compact Operational Summary Card */}
              {msg.resultCard && msg.resultCard.type === "summary" && (
                <div className="w-[94%] grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 shadow-xs text-[11px]">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5">
                    <div className="text-slate-500">مهام نشطة</div>
                    <div className="font-bold text-slate-900 dark:text-white">{msg.resultCard.open_tasks ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5">
                    <div className="text-rose-700 dark:text-rose-300">مهام متأخرة</div>
                    <div className="font-bold text-rose-900 dark:text-rose-100">{msg.resultCard.overdue_tasks ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5">
                    <div className="text-slate-500">تذاكر مفتوحة</div>
                    <div className="font-bold text-slate-900 dark:text-white">{msg.resultCard.open_tickets ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5">
                    <div className="text-emerald-700 dark:text-emerald-300">أصول مسجلة</div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-100">{msg.resultCard.total_assets ?? 0}</div>
                  </div>
                </div>
              )}

              {/* Compact Multi-Task Batch Result Card */}
              {msg.resultCard && msg.resultCard.type === "task_batch" && Array.isArray(msg.resultCard.tasks) && msg.resultCard.tasks.length > 0 && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-xs space-y-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      المهام المنشأة ({msg.resultCard.count ?? msg.resultCard.tasks.length})
                    </span>
                    <Link href="/tasks" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                      عرض في المهام
                    </Link>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {msg.resultCard.tasks.map((t, idx) => (
                      <div key={String(t.task_id || idx)} className="rounded-lg border border-slate-100 dark:border-slate-700/70 p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-[#187A5A]"><bdi dir="ltr">{t.reference}</bdi></span>
                          {t.status && <StatusBadge status={t.status} />}
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                        <div className="text-slate-600 dark:text-slate-300">
                          {t.assignee_name || "غير مسند"} • {t.notification_summary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compact Employee Search Result Card */}
              {msg.resultCard && msg.resultCard.type === "employee_list" && Array.isArray(msg.resultCard.items) && msg.resultCard.items.length > 0 && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 shadow-xs space-y-2 text-[11px]">
                  {msg.resultCard.items.map((emp, idx) => {
                    const empName = String(emp.full_name || "");
                    const linked = Boolean(emp.telegram_linked);
                    return (
                      <div key={String(emp.employee_id || idx)} className="space-y-1.5 border-b border-slate-100 dark:border-slate-700/60 last:border-0 pb-2 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{empName}</div>
                            <div className="text-slate-600 dark:text-slate-300 truncate">
                              {String(emp.job_title || "موظف")} {emp.department_name ? `• ${String(emp.department_name)}` : ""}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${linked ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"}`}>
                            {linked ? "Telegram مرتبط" : "داخلي فقط"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setInput(`أنشئ مهمة للموظف ${empName} بعنوان `);
                              inputRef.current?.focus();
                            }}
                            className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#123D32] font-semibold hover:bg-emerald-100 cursor-pointer"
                          >
                            + مهمة جديدة
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void sendCommand(`اعرض مهام الموظف ${empName}`)}
                            className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
                          >
                            عرض مهامه
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Compact Task List Query Card */}
              {msg.resultCard && msg.resultCard.type === "task_list" && Array.isArray(msg.resultCard.items) && msg.resultCard.items.length > 0 && (
                <div className="w-[94%] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 shadow-xs space-y-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-700/70">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {msg.resultCard.filter_label || "قائمة المهام"}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      عرض {msg.resultCard.count ?? msg.resultCard.items.length} من أصل {msg.resultCard.total_count ?? msg.resultCard.items.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pe-1">
                    {msg.resultCard.items.slice(0, 12).map((item, idx) => (
                      <div key={String(item.task_id || idx)} className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0 pb-1.5 last:pb-0">
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-[#187A5A] me-1.5"><bdi dir="ltr">{String(item.reference || "")}</bdi></span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{String(item.title || "")}</span>
                          {typeof item.assignee_name === "string" && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {item.assignee_name}{item.due_date ? ` • ${String(item.due_date)}` : ""}
                            </div>
                          )}
                        </div>
                        {typeof item.status === "string" && <StatusBadge status={item.status} />}
                      </div>
                    ))}
                  </div>
                  {msg.resultCard.truncated && (
                    <Link
                      href="/tasks"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#187A5A] hover:underline pt-0.5"
                    >
                      <span>عرض الكل في صفحة المهام</span>
                      <Icons.ChevronLeft size={13} />
                    </Link>
                  )}
                </div>
              )}

              {/* Interactive Employee / Candidate Disambiguation Picker */}
              {msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                <div className="w-[94%] space-y-1.5">
                  {msg.clarificationOptions.map((opt, idx) => {
                    if (opt.employee_id) {
                      return (
                        <button
                          key={opt.employee_id}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void sendCommand(opt.full_name || "", {
                              resolvedEmployeeId: opt.employee_id,
                              pendingIntent: msg.pendingIntent,
                              displayUserText: `اخترت الموظف: ${opt.full_name}${opt.employee_number ? ` (#${opt.employee_number})` : ""}`,
                            })
                          }
                          className="motion-control w-full text-right p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#187A5A] hover:bg-emerald-50/40 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                              <span>{idx + 1}. {opt.full_name}</span>
                              {opt.employee_number && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                  <bdi dir="ltr">#{opt.employee_number}</bdi>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                              {opt.job_title || "موظف"}
                              {opt.department_name ? ` • ${opt.department_name}` : ""}
                              {opt.branch_name ? ` • فرع: ${opt.branch_name}` : ""}
                              {opt.username ? ` • حساب: ${opt.username}` : " • بدون حساب مستخدم"}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              opt.telegram_linked
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {opt.telegram_linked
                              ? `Telegram مرتبط${opt.telegram_username ? ` (@${opt.telegram_username})` : ""}`
                              : "داخلي فقط"}
                          </span>
                        </button>
                      );
                    }
                    if (opt.task_id) {
                      return (
                        <button
                          key={opt.task_id || idx}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void sendCommand(`غيّر حالة المهمة ${opt.reference} إلى مكتملة`)
                          }
                          className="w-full text-right p-2 rounded-xl border border-slate-200 bg-white hover:border-[#187A5A] text-xs cursor-pointer"
                        >
                          <span className="font-mono font-bold text-[#187A5A] me-2"><bdi dir="ltr">{opt.reference}</bdi></span>
                          <span className="font-semibold text-slate-800">{opt.title}</span>
                        </button>
                      );
                    }
                    if (opt.ticket_id) {
                      return (
                        <button
                          key={opt.ticket_id || idx}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void sendCommand(`حوّل التذكرة ${opt.ticket_number} إلى مهمة وأسندها للفني المسؤول`)
                          }
                          className="w-full text-right p-2 rounded-xl border border-slate-200 bg-white hover:border-[#187A5A] text-xs cursor-pointer"
                        >
                          <span className="font-mono font-bold text-[#187A5A] me-2"><bdi dir="ltr">{opt.ticket_number}</bdi></span>
                          <span className="font-semibold text-slate-800">{opt.title}</span>
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              {/* High-Impact Action Confirmation Controls */}
              {msg.pendingConfirmation && (
                <div className="w-[94%] p-3 rounded-xl border border-amber-300 bg-amber-50/90 space-y-2.5">
                  <div className="text-xs font-bold text-amber-950">
                    {msg.pendingConfirmation.action_label}
                  </div>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    {msg.pendingConfirmation.summary}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void sendCommand(msg.pendingConfirmation!.action_label, {
                          confirmationToken: msg.pendingConfirmation!.confirmation_token,
                          confirmDecision: "confirm",
                          displayUserText: `تأكيد: ${msg.pendingConfirmation!.action_label}`,
                        })
                      }
                      className="motion-control px-3 py-1.5 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold cursor-pointer"
                    >
                      تأكيد التنفيذ
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void sendCommand("إلغاء", {
                          confirmationToken: msg.pendingConfirmation!.confirmation_token,
                          confirmDecision: "cancel",
                          displayUserText: "إلغاء الإجراء",
                        })
                      }
                      className="motion-control px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {/* Follow-up Action Chips */}
              {msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-w-[94%]">
                  {msg.suggestedFollowups.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={busy}
                      onClick={() => void sendCommand(f)}
                      className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-semibold text-[#123D32] cursor-pointer transition-colors"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Active Execution Progress Banner */}
          {busy && liveSteps.length > 0 && (
            <div className="w-[92%] rounded-xl border border-[#187A5A]/30 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 space-y-1.5">
              {liveSteps.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs text-[#123D32] dark:text-emerald-200 font-medium">
                  <Icons.Refresh size={13} className="animate-spin shrink-0" />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          <div ref={listEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCommand(input);
          }}
          className="px-3 pt-3 pb-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/70 shrink-0"
        >
          <div className="flex items-start gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              dir="auto"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendCommand(input);
                }
              }}
              placeholder="اكتب أمراً مثل: أنشئ مهمة لأحمد لمراجعة السيرفر غدًا وأرسل له إشعارًا..."
              className="flex-1 min-w-0 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 outline-none focus:border-[#187A5A]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="إرسال الأمر للمساعد الذكي"
              className="motion-control h-10 px-3.5 rounded-xl bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Icons.Send size={15} />
              <span>تنفيذ</span>
            </button>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 ps-12">
            <span>تُنفّذ العمليات ضمن صلاحيات دورك ونطاق المنشأة</span>
            <span className="font-mono"><bdi dir="ltr">Alt+A</bdi></span>
          </div>
        </form>
      </aside>
    </>
  );
}

export default AiAgentSidePanel;
