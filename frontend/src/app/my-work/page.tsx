"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SlaBadge } from "@/components/work-management/SlaBadge";
import { workApi, type MyWorkResponse, type WorkItem } from "@/lib/workApi";
import { useLocale } from "@/lib/i18n";
import { useToast } from "@/context/ToastContext";
import {
  AlertTriangle,
  ArrowUpLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Headphones,
  ListTodo,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

const BUCKET_META: { key: "overdue" | "today" | "this_week" | "later"; titleAr: string; titleEn: string; accent: string }[] = [
  { key: "overdue", titleAr: "متأخرة وتحتاج تدخلاً عاجلاً", titleEn: "Overdue", accent: "text-red-600 border-red-500/30 bg-red-500/8" },
  { key: "today", titleAr: "مستحقة اليوم", titleEn: "Due Today", accent: "text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/8" },
  { key: "this_week", titleAr: "خلال هذا الأسبوع", titleEn: "This Week", accent: "text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/8" },
  { key: "later", titleAr: "لاحقاً / بدون موعد عاجل", titleEn: "Later", accent: "text-[var(--muted-foreground)] border-[var(--border)] bg-[var(--muted)]/40" },
];

export default function MyWorkPage() {
  const { locale, setLocale, t } = useLocale();
  const toast = useToast();

  const [data, setData] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<"all" | "ticket" | "task" | "approval">("all");
  const [bucketFilter, setBucketFilter] = useState<"" | "overdue" | "today" | "this_week" | "later">("");
  const [slaFilter, setSlaFilter] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await workApi.getMyWork({
        kind: kindFilter,
        bucket: bucketFilter || undefined,
        sla_state: slaFilter || undefined,
        q: q.trim() || undefined,
        limit: 100,
      });
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل قائمة أعمالي");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, bucketFilter, slaFilter, q]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleQuickAction = async (item: WorkItem, nextStatus: string) => {
    setBusyId(item.id);
    try {
      if (item.kind === "ticket") {
        await workApi.transitionTicket(item.id, { to_status: nextStatus });
      } else if (item.kind === "task") {
        await workApi.transitionTask(item.id, { to_status: nextStatus });
      }
      toast.success(`تم تحديث الحالة إلى ${nextStatus}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء السريع");
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">{t("my_work")}</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{t("my_work_subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] cursor-pointer"
            >
              {locale === "ar" ? "EN" : "العربية"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>تحديث</span>
            </button>
            <Link
              href="/tickets"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white hover:opacity-90"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>صندوق التذاكر</span>
            </Link>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { key: "" as const, label: t("all"), value: counts?.total ?? 0, icon: ListTodo, tone: "text-[var(--foreground)]" },
            { key: "overdue" as const, label: t("overdue"), value: counts?.overdue ?? 0, icon: AlertTriangle, tone: "text-red-600" },
            { key: "today" as const, label: t("today"), value: counts?.today ?? 0, icon: Clock, tone: "text-amber-600" },
            { key: "this_week" as const, label: t("this_week"), value: counts?.this_week ?? 0, icon: Calendar, tone: "text-sky-600" },
            { key: "later" as const, label: t("later"), value: counts?.later ?? 0, icon: CheckCircle2, tone: "text-emerald-600" },
          ].map((card) => {
            const Icon = card.icon;
            const active = bucketFilter === card.key;
            return (
              <button
                key={card.key || "all"}
                type="button"
                onClick={() => setBucketFilter(card.key)}
                className={`text-start p-3 rounded-xl border transition-all cursor-pointer ${
                  active
                    ? "bg-[var(--primary)]/8 border-[var(--primary)] shadow-xs"
                    : "bg-[var(--card)] border-[var(--border)] hover:bg-[var(--muted)]/40"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                  <span>{card.label}</span>
                  <Icon className={`w-4 h-4 ${card.tone}`} />
                </div>
                <div className={`text-2xl font-bold mt-1 ${card.tone}`}>{card.value}</div>
              </button>
            );
          })}
          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>{t("approvals")}</span>
              <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <div className="text-2xl font-bold mt-1">{counts?.approvals ?? 0}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {(["all", "ticket", "task", "approval"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  kindFilter === k
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)]/50 text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                {k === "all" ? t("all") : k === "ticket" ? t("tickets") : k === "task" ? t("tasks") : t("approvals")}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث في تذاكرك ومهامك وموافقاتك..."
              className="w-full ps-9 pe-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
            />
          </div>

          <select
            aria-label="تصفية حسب حالة SLA"
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل حالات SLA</option>
            <option value="breached">متجاوز SLA</option>
            <option value="at_risk">قريب الانتهاء</option>
            <option value="ok">ضمن SLA</option>
            <option value="paused">متوقف مؤقتاً</option>
          </select>
        </div>

        {/* Content */}
        {loading && !data ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-[var(--muted)] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-[var(--card)] border border-red-500/30 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer"
            >
              {t("retry")}
            </button>
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 opacity-80" />
            <h3 className="text-sm font-bold">قائمة أعمالك مكتملة حالياً!</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              لا توجد تذاكر أو مهام أو موافقات مفتوحة مطابقة للتصفية الحالية.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {BUCKET_META.map((sec) => {
              const bucketItems = data?.grouped?.[sec.key] || [];
              if (bucketItems.length === 0) return null;
              return (
                <section key={sec.key} className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className={`px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between text-xs font-bold ${sec.accent}`}>
                    <span>{locale === "ar" ? sec.titleAr : sec.titleEn}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]">
                      {bucketItems.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {bucketItems.map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--muted)]/35 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="mt-0.5 p-2 rounded-lg bg-[var(--muted)] shrink-0">
                            {item.kind === "ticket" ? (
                              <Headphones className="w-4 h-4 text-[var(--primary)]" />
                            ) : item.kind === "task" ? (
                              <ListTodo className="w-4 h-4 text-sky-600" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-[var(--muted-foreground)]">
                                <bdi>{item.ref}</bdi>
                              </span>
                              <Link
                                href={item.url}
                                className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] truncate"
                              >
                                {item.title}
                              </Link>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                              <span className="px-2 py-0.5 rounded bg-[var(--muted)] font-medium text-[var(--foreground)]">
                                {item.status}
                              </span>
                              <span>الأولوية: {item.priority}</span>
                              {item.relationship === "watching" && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/12 text-sky-700 dark:text-sky-300">
                                  متابع
                                </span>
                              )}
                              <SlaBadge state={item.sla_state} dueAt={item.due_at} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.kind === "ticket" && item.status !== "In Progress" && (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleQuickAction(item, "In Progress")}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              <span>بدء العمل</span>
                            </button>
                          )}
                          {item.kind === "ticket" && item.status !== "Resolved" && (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleQuickAction(item, "Resolved")}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:opacity-90 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>تم الحل</span>
                            </button>
                          )}
                          {item.kind === "task" && item.status !== "In Progress" && (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleQuickAction(item, "In Progress")}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              <span>بدء</span>
                            </button>
                          )}
                          {item.kind === "task" && (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleQuickAction(item, "Completed")}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:opacity-90 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>إكمال</span>
                            </button>
                          )}
                          <Link
                            href={item.url}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] hover:bg-[var(--muted)]"
                          >
                            <span>فتح</span>
                            <ArrowUpLeft className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
