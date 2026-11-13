"use client";

import { useWorkspace } from "@/context/WorkspaceContext";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/ui/StatsCard";
import { Icons } from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DashboardData {
  available_widgets: string[]; critical_tickets: number; upcoming_renewals: number;
  total_assets: number; available_assets: number; assigned_assets: number; infrastructure_devices: number;
  open_tickets: number; open_tasks: number; overdue_tasks: number; active_subscriptions: number;
  monthly_subscription_cost: number; pending_maintenance: number; total_employees: number;
  asset_status_distribution: Record<string, number>; ticket_priority_distribution: Record<string, number>;
  recent_tasks: { id: string; title: string; status: string }[];
  recent_activities: { id: string; action: string; resource_type: string; user_name: string }[];
}
export default function DashboardPage() {
  const { activeCompany } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    setLoading(true); setFailure(""); setData(null);
    try {
      const res = await api.get<DashboardData>("/dashboard");
      setData(res.data);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "تعذر تحميل اللوحة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void fetchDashboard(); }, 0);
    return () => clearTimeout(timer);
  }, [activeCompany?.id]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div style={{ order: -2 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            لوحة تحكم العمليات التشغيلية (IT Operations Dashboard)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            نظرة شاملة ومؤشرات أداء فورية لـ{" "}
            <span className="font-bold text-[#187A5A]">
              {activeCompany ? activeCompany.name_ar : "الشركة الحالية"}
            </span>
          </p>
        </div>

        {/* Quick Action Buttons */}
        <DashboardWidget id="quick_actions" allowed={data?.available_widgets}>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/assets"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={15} />
            <span>تسجيل أصل</span>
          </Link>
          <Link
            href="/tickets"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.HelpDesk size={15} className="text-[#187A5A]" />
            <span>فتح تذكرة</span>
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Tasks size={15} className="text-[#187A5A]" />
            <span>إدارة المهام</span>
          </Link>
          <Link
            href="/reports"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Download size={15} />
            <span>التقارير والتصدير</span>
          </Link>
        </div>
        </DashboardWidget>
      </div>

      {failure && <div role="alert" style={{ order: -1 }}>{failure} <button onClick={() => void fetchDashboard()}>إعادة المحاولة / Retry</button></div>}
      {loading && <p role="status" style={{ order: -1 }}>تحميل لوحة المعلومات…</p>}
      {/* Critical Alerts Banner (if any) */}
      <DashboardWidget id="critical_tickets" allowed={data?.available_widgets}>
      {(data?.critical_tickets ?? 0) > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <Icons.AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-rose-900">
                تنبيه أمني وتشغيلي عاجل: يوجد {data?.critical_tickets} تذكرة دعم ذات أولوية حرجة (Urgent)
              </div>
              <div className="text-[11px] text-rose-700 mt-0.5">
                تتطلب هذه التذاكر تدخل الفريق التقني فوراً لضمان استمرارية الأعمال
              </div>
            </div>
          </div>
          <Link
            href="/tickets?priority=Urgent"
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            معالجة التذاكر الحرجة الآن
          </Link>
        </div>
      )}

      </DashboardWidget>

      {/* Expiring Subscriptions Banner (if any) */}
      <DashboardWidget id="subscriptions" allowed={data?.available_widgets}>
      {(data?.upcoming_renewals ?? 0) > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <Icons.Clock size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900">
                تنبيه تجديد الاشتراكات: {data?.upcoming_renewals} اشتراك سحابي قارب على الانتهاء خلال 30 يوم
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5">
                يرجى مراجعة وتجديد اشتراكات السيرفرات والبرمجيات لتفادي انقطاع الخدمة
              </div>
            </div>
          </div>
          <Link
            href="/subscriptions"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            عرض الاشتراكات القادمة
          </Link>
        </div>
      )}

      </DashboardWidget>

      {/* KPI Cards Row 1 (Clickable) */}
      <DashboardWidget id="kpis" allowed={data?.available_widgets}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="إجمالي الأصول التقنية"
          value={loading ? "..." : data?.total_assets || 0}
          subtitle={`متاح: ${data?.available_assets || 0} • مسلّم: ${data?.assigned_assets || 0}`}
          icon={<Icons.Assets size={20} />}
          accentColor="border-[#123D32]"
          href="/assets"
        />
        <StatsCard
          title="أجهزة البنية التحتية"
          value={loading ? "..." : data?.infrastructure_devices || 0}
          subtitle="سيرفرات، جدران حماية، راوترات"
          icon={<Icons.Infrastructure size={20} />}
          accentColor="border-[#187A5A]"
          href="/infrastructure"
        />
        <StatsCard
          title="تذاكر الدعم المفتوحة"
          value={loading ? "..." : data?.open_tickets || 0}
          subtitle={`تذاكر حرجة: ${data?.critical_tickets || 0}`}
          icon={<Icons.HelpDesk size={20} />}
          accentColor="border-amber-500"
          trend={(data?.critical_tickets ?? 0) > 0 ? "عاجل" : undefined}
          href="/tickets"
        />
        <StatsCard
          title="المهام التشغيلية المفتوحة"
          value={loading ? "..." : data?.open_tasks || 0}
          subtitle={`متأخرة عن الموعد: ${data?.overdue_tasks || 0}`}
          icon={<Icons.Tasks size={20} />}
          accentColor="border-blue-600"
          href="/tasks"
        />
      </div>

      {/* KPI Cards Row 2 (Clickable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="الاشتراكات السحابية النشطة"
          value={loading ? "..." : data?.active_subscriptions || 0}
          subtitle={`تجديدات قادمة (30 يوم): ${data?.upcoming_renewals || 0}`}
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-[#C5A46D]"
          href="/subscriptions"
        />
        <StatsCard
          title="التكلفة الشهرية للاشتراكات"
          value={loading ? "..." : `${data?.monthly_subscription_cost?.toLocaleString() || 0} ر.س`}
          subtitle="برمجيات، خوادم سحابية، استضافة"
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-emerald-600"
          href="/subscriptions"
        />
        <StatsCard
          title="عمليات صيانة وتغيير معلقة"
          value={loading ? "..." : data?.pending_maintenance || 0}
          subtitle="بانتظار الاعتماد أو قيد التنفيذ"
          icon={<Icons.Maintenance size={20} />}
          accentColor="border-rose-600"
          href="/maintenance"
        />
        <StatsCard
          title="إجمالي موظفي الشركة"
          value={loading ? "..." : data?.total_employees || 0}
          subtitle="مسجلين في نظام العهد والصلاحيات"
          icon={<Icons.Users size={20} />}
          accentColor="border-slate-600"
          href="/employees"
        />
      </div>

      </DashboardWidget>
      <DashboardWidget id="maintenance" allowed={data?.available_widgets}><div className="bg-white rounded-xl border p-5"><h2 className="font-bold">ملخص الصيانة / Maintenance</h2><Link href="/maintenance">عمليات معلقة: {data?.pending_maintenance ?? "…"}</Link></div></DashboardWidget>
      <DashboardWidget id="recent_tasks" allowed={data?.available_widgets}><div className="bg-white rounded-xl border p-5"><h2 className="font-bold mb-3">المهام الأخيرة / Recent tasks</h2>{data?.recent_tasks?.length ? data.recent_tasks.map((task: { id: string; title: string; status: string }) => <Link className="flex justify-between py-2 border-b" href="/tasks" key={task.id}><bdi>{task.title}</bdi><bdi>{task.status}</bdi></Link>) : <p>لا توجد مهام / No tasks</p>}</div></DashboardWidget>
      {/* Analytics & Activity Section */}
      
        {/* Asset Status Breakdown */}
        <DashboardWidget id="asset_status" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>توزيع حالات الأصول</span>
            <Icons.Assets size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-3">
            {data?.asset_status_distribution &&
              Object.entries(data.asset_status_distribution).map(
                ([status, count]: [string, number]) => {
                  const total = data?.total_assets || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={status}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{status}</span>
                        <span className="text-slate-500 font-mono">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#187A5A] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
          </div>
        </div>

        </DashboardWidget>
        {/* Task & Ticket Distribution */}
        <DashboardWidget id="ticket_priorities" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>أولويات تذاكر الدعم</span>
            <Icons.HelpDesk size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-3">
            {data?.ticket_priority_distribution &&
              Object.entries(data.ticket_priority_distribution).map(
                ([prio, count]: [string, number]) => {
                  const colors: Record<string, string> = {
                    "حرج (Urgent)": "bg-rose-500",
                    "مرتفع (High)": "bg-amber-500",
                    "متوسط (Medium)": "bg-blue-500",
                    "منخفض (Low)": "bg-slate-400",
                  };
                  const color = colors[prio] || "bg-[#187A5A]";
                  return (
                    <div
                      key={prio}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="text-xs font-semibold text-slate-700">{prio}</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {count}
                      </span>
                    </div>
                  );
                }
              )}
          </div>
        </div>

        </DashboardWidget>
        {/* Recent Audit Activity */}
        <DashboardWidget id="activity" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>سجل العمليات الأخير</span>
            <Icons.Audit size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-2.5">
            {data?.recent_activities && data.recent_activities.length > 0 ? (
              data.recent_activities.map((act) => (
                <div
                  key={act.id}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800">{act.action}</span>
                    <span className="text-slate-400 mx-1.5">•</span>
                    <span className="text-slate-600">{act.resource_type}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {act.user_name}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">لا توجد عمليات مسجلة حديثاً</p>
            )}
          </div>
        </div>
        </DashboardWidget>
      </div>
    </DashboardLayout>
  );
}

function DashboardWidget({ id, allowed, children }: { id: string; allowed?: string[]; children: React.ReactNode }) {
  const { draft } = useWorkspace();
  const index = draft.widgets.findIndex(w => w.id === id);
  if (!allowed?.includes(id) || index < 0 || !draft.widgets[index].enabled) return null;
  return <section style={{ order: index }} data-widget={id}>{children}</section>;
}
