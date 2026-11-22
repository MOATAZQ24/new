"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MobileMyDay } from "@/components/dashboard/MobileMyDay";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { Icons } from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";

interface RecentTicketItem {
  id: string;
  ticket_number: string;
  issue_title: string;
  priority: string;
  status: string;
  created_at?: string;
}

interface RecentTaskItem {
  id: string;
  title: string;
  status: string;
  due_date?: string | null;
}

interface RecentNotificationItem {
  id: string;
  title: string;
  message?: string;
  is_read?: boolean;
  created_at?: string;
}

interface DashboardData {
  available_widgets: string[];
  total_branches?: number;
  total_employees: number;
  active_employees?: number;
  inactive_employees?: number;
  total_assets: number;
  assigned_assets: number;
  available_assets: number;
  maintenance_assets?: number;
  total_tickets?: number;
  open_tickets: number;
  closed_tickets?: number;
  waiting_tickets?: number;
  in_progress_tickets?: number;
  critical_tickets: number;
  open_tasks: number;
  overdue_tasks: number;
  telegram_connected?: boolean;
  asset_status_distribution?: Record<string, number>;
  recent_tickets?: RecentTicketItem[];
  recent_tasks: RecentTaskItem[];
  recent_notifications?: RecentNotificationItem[];
  recent_activities?: {
    id: string;
    action: string;
    resource_type: string;
    user_name: string;
    created_at?: string;
  }[];
}

function formatPriorityBadge(priority: string) {
  const p = (priority || "").toLowerCase();
  if (p.includes("urgent") || p.includes("critical") || p.includes("high")) {
    return { label: "عالية", cls: "bg-rose-100 text-rose-700 border-rose-200" };
  }
  if (p.includes("medium")) {
    return { label: "متوسطة", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  return { label: "منخفضة", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
}

function formatTaskBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("overdue") || s.includes("متأخر")) {
    return { label: "متأخرة", cls: "bg-rose-100 text-rose-700" };
  }
  if (s.includes("progress") || s.includes("تنفيذ")) {
    return { label: "قيد التنفيذ", cls: "bg-amber-100 text-amber-800" };
  }
  if (s.includes("complete") || s.includes("done") || s.includes("مكتمل")) {
    return { label: "مكتملة", cls: "bg-emerald-100 text-emerald-700" };
  }
  return { label: "جديدة", cls: "bg-sky-100 text-sky-700" };
}

function formatShortArabicDate(value?: string | null) {
  if (!value) return "غير محدد";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

export default function DashboardPage() {
  const { activeCompany } = useAuth();
  const { primaryRoleTitleAr } = useUserRole();
  const [data, setData] = useState<DashboardData | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [donutMode, setDonutMode] = useState<"employees" | "tickets">("employees");
  const [mobileViewMode, setMobileViewMode] = useState<"my_day" | "full">("my_day");

  const todayArabic = useMemo(() => {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setFailure("");
    try {
      const res = await api.get<DashboardData>("/dashboard");
      setData(res.data);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "تعذر تحميل بيانات لوحة المتابعة");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDashboard, activeCompany?.id]);

  const canViewKpis = Boolean(data?.available_widgets?.includes("kpis"));

  const assetStatusItems = useMemo(() => {
    if (!data) return [];
    const dist = data.asset_status_distribution || {};
    const outOfService =
      (dist["تالف (Damaged)"] || 0) + (dist["متقاعد (Retired)"] || 0);
    return [
      { label: "قيد الاستخدام", value: data.assigned_assets || 0, color: "var(--chart-1)" },
      { label: "تحت الصيانة", value: data.maintenance_assets || 0, color: "var(--chart-3)" },
      { label: "احتياطي", value: data.available_assets || 0, color: "var(--chart-2)" },
      { label: "خارج الخدمة", value: outOfService, color: "var(--destructive)" },
    ];
  }, [data]);

  const employeeStatusItems = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "نشط",
        value: data.active_employees ?? data.total_employees ?? 0,
        color: "var(--chart-1)",
      },
      {
        label: "متوقف مؤقتاً",
        value: data.inactive_employees ?? 0,
        color: "var(--chart-3)",
      },
    ];
  }, [data]);

  const ticketStatusItems = useMemo(() => {
    if (!data) return [];
    return [
      { label: "مغلقة", value: data.closed_tickets ?? 0, color: "var(--chart-1)" },
      { label: "قيد التنفيذ", value: data.in_progress_tickets ?? data.open_tickets ?? 0, color: "var(--chart-2)" },
      { label: "بانتظار الرد", value: data.waiting_tickets ?? 0, color: "var(--chart-3)" },
    ];
  }, [data]);

  const recentNotifications = useMemo(() => {
    if (data?.recent_notifications && data.recent_notifications.length > 0) {
      return data.recent_notifications.slice(0, 3);
    }
    if (data?.recent_activities && data.recent_activities.length > 0) {
      return data.recent_activities.slice(0, 3).map((a) => ({
        id: a.id,
        title: `${a.action} — ${a.resource_type}`,
        message: a.user_name,
        created_at: a.created_at,
      }));
    }
    return [];
  }, [data]);

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1440px] mx-auto">
        {/* On Mobile: Dedicated "My Day" Zero-Friction Experience */}
        {data && mobileViewMode === "my_day" ? (
          <div className="lg:hidden">
            <MobileMyDay
              data={data}
              onSwitchToFullDashboard={() => setMobileViewMode("full")}
            />
          </div>
        ) : null}

        {/* Full Dashboard: Always shown on desktop; on mobile shown only when toggled to "full" */}
        <div className={`space-y-5 ${mobileViewMode === "my_day" ? "hidden lg:block" : "block"}`}>
          {mobileViewMode === "full" && (
            <div className="lg:hidden flex items-center justify-between pb-1">
              <button
                type="button"
                onClick={() => setMobileViewMode("my_day")}
                className="text-xs font-bold text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3.5 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <span>←</span>
                <span>العودة إلى ملخص اليوم (My Day)</span>
              </button>
            </div>
          )}

          {/* Header Row matching Reference Screenshots 1, 3, 5 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0 mt-0.5">
              <Icons.Dashboard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  لوحة المتابعة
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-[#078363]/10 dark:bg-emerald-950/50 text-[#078363] dark:text-emerald-400 text-xs font-bold border border-[#078363]/20">
                  {primaryRoleTitleAr}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                نظرة عامة على الأصول، التذاكر، المهام، والموظفين
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs">
              <Icons.Calendar size={15} className="text-slate-500" />
              <span>{todayArabic}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              disabled={loading}
              aria-label="تحديث بيانات لوحة المتابعة"
              className="motion-control p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:text-[#187A5A] hover:border-[#187A5A]/40 shadow-xs transition-colors cursor-pointer"
            >
              <Icons.Refresh size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {failure && (
          <AlertBanner
            variant="error"
            message={failure}
            onRetry={() => void fetchDashboard()}
          />
        )}

        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="h-24 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : data && !canViewKpis ? (
          /* Self-service restricted view preserving role permissions cleanly */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Icons.Tasks size={17} className="text-[#187A5A]" />
                  <span>مهامي الحالية</span>
                </h2>
                <Link href="/tasks" className="text-xs font-semibold text-[#187A5A] hover:underline">
                  عرض المهام ←
                </Link>
              </div>
              {data.recent_tasks.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">لا توجد مهام مسندة حالياً</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.recent_tasks.slice(0, 4).map((task) => {
                    const badge = formatTaskBadge(task.status);
                    return (
                      <div key={task.id} className="py-2.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {task.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Icons.HelpDesk size={17} className="text-sky-600" />
                  <span>تذاكر الدعم العاجلة</span>
                </h2>
                <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-3">
                  {data.critical_tickets}
                </div>
              </div>
              <Link
                href="/tickets"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold transition-colors"
              >
                <Icons.Plus size={15} />
                <span>فتح تذكرة دعم جديدة</span>
              </Link>
            </section>
          </div>
        ) : data ? (
          <>
            {/* Row 1: 4 Harmonized Executive KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                href="/assets"
                className="motion-card rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 border-s-4 border-s-[var(--primary)] p-4 flex items-center justify-between gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-[#187A5A] flex items-center justify-center shrink-0">
                    <Icons.Assets size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none">
                      {data.total_assets}
                    </div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1.5 truncate">
                      إجمالي الأصول والعهد
                    </div>
                  </div>
                </div>
              </Link>

              <Link
                href="/tickets"
                className="motion-card rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 border-s-4 border-s-[var(--secondary)] p-4 flex items-center justify-between gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[#123D32]/10 dark:bg-slate-700 text-[#123D32] dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <Icons.HelpDesk size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none">
                      {data.total_tickets ?? data.open_tickets}
                    </div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1.5 truncate">
                      تذكرة (Help Desk)
                    </div>
                  </div>
                </div>
              </Link>

              <Link
                href="/tasks"
                className="motion-card rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 border-s-4 border-s-[var(--accent)] p-4 flex items-center justify-between gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[#C5A46D]/15 dark:bg-amber-900/30 text-[#8A6D3B] dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Icons.Refresh size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none">
                      {data.open_tasks}
                    </div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1.5 truncate">
                      قيد التنفيذ
                    </div>
                  </div>
                </div>
              </Link>

              <Link
                href="/tasks"
                className="motion-card rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 border-s-4 border-s-rose-500 p-4 flex items-center justify-between gap-3 shadow-xs hover:border-rose-300 transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-900/40 text-rose-600 flex items-center justify-center shrink-0">
                    <Icons.AlertTriangle size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-black font-mono text-rose-700 dark:text-rose-300 leading-none">
                      {data.overdue_tasks}
                    </div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1.5 truncate">
                      متأخرة
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* Row 2: 4 White Operational KPI Cards (Image 5) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                href="/companies"
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-4 flex items-center gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Icons.Companies size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black font-mono text-slate-900 dark:text-white leading-none">
                    {data.total_branches ?? 5}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1 truncate">
                    فروع
                  </div>
                </div>
              </Link>

              <Link
                href="/employees"
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-4 flex items-center gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center shrink-0">
                  <Icons.Clock size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black font-mono text-slate-900 dark:text-white leading-none">
                    {data.inactive_employees ?? 0}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1 truncate">
                    متوقف مؤقتاً
                  </div>
                </div>
              </Link>

              <Link
                href="/employees"
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-4 flex items-center gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center shrink-0">
                  <Icons.User size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black font-mono text-slate-900 dark:text-white leading-none">
                    {data.active_employees ?? data.total_employees}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1 truncate">
                    موظف نشط
                  </div>
                </div>
              </Link>

              <Link
                href="/employees"
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-4 flex items-center gap-3 shadow-xs hover:border-[#187A5A]/40 transition-colors min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 flex items-center justify-center shrink-0">
                  <Icons.Users size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black font-mono text-slate-900 dark:text-white leading-none">
                    {data.total_employees}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1 truncate">
                    إجمالي الموظفين
                  </div>
                </div>
              </Link>
            </div>

            {/* Row 3: 3 Operational Activity Cards (Recent Tickets, Current Tasks, Recent Alerts) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Recent Help Desk Tickets */}
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-700">
                    <Icons.HelpDesk size={17} className="text-[#123D32] dark:text-emerald-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      تذاكر Help Desk الأخيرة
                    </h2>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-700 mt-2">
                    {data.recent_tickets && data.recent_tickets.length > 0 ? (
                      data.recent_tickets.slice(0, 3).map((tx) => {
                        const badge = formatPriorityBadge(tx.priority);
                        return (
                          <Link
                            key={tx.id}
                            href="/tickets"
                            className="py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 dark:hover:bg-slate-700/40 rounded-lg px-1 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {tx.issue_title}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5" dir="ltr">
                                #{tx.ticket_number}
                              </div>
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">
                        لا توجد تذاكر مسجلة حديثاً
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-700">
                  <Link
                    href="/tickets"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>عرض جميع التذاكر</span>
                    <span>←</span>
                  </Link>
                </div>
              </section>

              {/* Current Tasks */}
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-700">
                    <Icons.CheckSquare size={17} className="text-[#187A5A]" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      المهام الحالية
                    </h2>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-700 mt-2">
                    {data.recent_tasks && data.recent_tasks.length > 0 ? (
                      data.recent_tasks.slice(0, 3).map((t) => {
                        const badge = formatTaskBadge(t.status);
                        return (
                          <Link
                            key={t.id}
                            href="/tasks"
                            className="py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 dark:hover:bg-slate-700/40 rounded-lg px-1 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {t.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                الموعد: {formatShortArabicDate(t.due_date)}
                              </div>
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">
                        لا توجد مهام حالية
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-700">
                  <Link
                    href="/tasks"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>عرض جميع المهام</span>
                    <span>←</span>
                  </Link>
                </div>
              </section>

              {/* Recent Alerts & Notifications */}
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-700">
                    <Icons.Notifications size={17} className="text-amber-600" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      التنبيهات الأخيرة
                    </h2>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-700 mt-2">
                    {recentNotifications.length > 0 ? (
                      recentNotifications.map((n, idx) => (
                        <Link
                          key={n.id}
                          href="/notifications"
                          className="py-3 flex items-start gap-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-700/40 rounded-lg px-1 transition-colors"
                        >
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              idx === 0
                                ? "bg-rose-50 text-rose-600"
                                : idx === 1
                                ? "bg-sky-50 text-sky-600"
                                : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            {idx === 0 ? (
                              <Icons.AlertCircle size={14} />
                            ) : idx === 1 ? (
                              <Icons.HelpDesk size={14} />
                            ) : (
                              <Icons.Calendar size={14} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {n.title}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {n.created_at
                                ? formatShortArabicDate(n.created_at)
                                : n.message || "إشعار نظام"}
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">
                        لا توجد تنبيهات جديدة
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-700">
                  <Link
                    href="/notifications"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>عرض جميع التنبيهات</span>
                    <span>←</span>
                  </Link>
                </div>
              </section>
            </div>

            {/* Row 4: Quick Actions (2x2), Asset Status Donut, Employees/Tickets Donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Quick Actions 2x2 Tile Card */}
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Icons.Sparkles size={17} className="text-[#C5A46D]" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    إجراءات سريعة
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 flex-1">
                  <Link
                    href="/assets"
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 transition-colors"
                  >
                    <Icons.Assets size={17} className="text-[#187A5A] shrink-0" />
                    <span>إضافة أصل/عهد</span>
                  </Link>

                  <Link
                    href="/tickets"
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 transition-colors"
                  >
                    <Icons.HelpDesk size={17} className="text-[#123D32] shrink-0" />
                    <span>فتح تذكرة (Help Desk)</span>
                  </Link>

                  <Link
                    href="/employees"
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 transition-colors"
                  >
                    <Icons.Users size={17} className="text-[#187A5A] shrink-0" />
                    <span>إضافة موظف</span>
                  </Link>

                  <Link
                    href="/tasks"
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 transition-colors"
                  >
                    <Icons.Tasks size={17} className="text-[#8A6D3B] shrink-0" />
                    <span>إسناد مهمة</span>
                  </Link>
                </div>
              </section>

              {/* Assets & Custody by Status Donut */}
              <EnterpriseDonutChart
                title="الأصول والعهد حسب الحالة"
                totalLabel="أصل/عهد"
                items={assetStatusItems}
              />

              {/* Employees / Tickets by Status Donut (matching Images 1, 3, 5) */}
              <div className="flex flex-col">
                <div className="relative flex-1">
                  <div className="absolute top-4 inset-inline-end-4 z-10 inline-flex rounded-lg bg-slate-100 dark:bg-slate-700 p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setDonutMode("employees")}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        donutMode === "employees"
                          ? "bg-white dark:bg-slate-900 text-[#123D32] dark:text-white shadow-2xs"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      الموظفون
                    </button>
                    <button
                      type="button"
                      onClick={() => setDonutMode("tickets")}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        donutMode === "tickets"
                          ? "bg-white dark:bg-slate-900 text-[#123D32] dark:text-white shadow-2xs"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      التذاكر
                    </button>
                  </div>

                  {donutMode === "employees" ? (
                    <EnterpriseDonutChart
                      title="الموظفون حسب الحالة"
                      totalLabel="موظف"
                      items={employeeStatusItems}
                    />
                  ) : (
                    <EnterpriseDonutChart
                      title="التذاكر حسب الحالة"
                      totalLabel="تذكرة"
                      items={ticketStatusItems}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
