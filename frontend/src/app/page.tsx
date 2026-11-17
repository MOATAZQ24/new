"use client";

import { useWorkspace } from "@/context/WorkspaceContext";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/ui/StatsCard";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { BranchIntelligenceFilterBar } from "@/components/ui/BranchIntelligenceFilterBar";
import { Icons } from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DashboardData {
  available_widgets: string[]; critical_tickets: number; upcoming_renewals: number;
  total_companies?: number; total_branches?: number; total_departments?: number;
  present_today?: number; active_projects?: number; total_customers?: number;
  open_opportunities?: number; pending_approvals?: number;
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
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async (branchIds = selectedBranchIds) => {
    setLoading(true); setFailure(""); setData(null);
    try {
      const q = branchIds.length > 0 ? `?branch_ids=${encodeURIComponent(branchIds.join(","))}` : "";
      const res = await api.get<DashboardData>(`/dashboard${q}`);
      setData(res.data);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "تعذر تحميل اللوحة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void fetchDashboard(selectedBranchIds); }, 0);
    return () => clearTimeout(timer);
  }, [activeCompany?.id, selectedBranchIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout>
      <DashboardWorkspace>
      {/* Page Header */}
      <div style={{ order: -2 }} className="lg:col-span-12">
        <PageHeader
          title="لوحة تحكم العمليات التشغيلية"
          description={`نظرة شاملة ومؤشرات أداء فورية لـ ${activeCompany ? activeCompany.name_ar : "الشركة الحالية"}`}
          icon={<Icons.Dashboard size={20} />}
          badge={
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#187A5A]/10 text-[#123D32] font-bold border border-[#187A5A]/20">
              <bdi>{activeCompany?.code || "IGT"}</bdi>
            </span>
          }
          actions={
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              disabled={loading}
              aria-label="تحديث بيانات لوحة التحكم"
              className="motion-control inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Icons.Refresh size={14} className={loading ? "animate-spin" : ""} />
              <span>تحديث</span>
            </button>
          }
        />
      </div>
      <div style={{ order: -2 }} className="lg:col-span-12">
        <BranchIntelligenceFilterBar
          selectedBranchIds={selectedBranchIds}
          onChangeBranchIds={setSelectedBranchIds}
          label="تصفية ومقارنة المؤشرات التنفيذية حسب الفروع المعتمدة (Group → Company → Branch)"
        />
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

      {failure && (
        <div style={{ order: -1 }} className="lg:col-span-12">
          <AlertBanner
            variant="error"
            title="تعذر تحميل بيانات لوحة التحكم"
            message={failure}
            onRetry={() => void fetchDashboard()}
          />
        </div>
      )}
      {loading && !data && (
        <div style={{ order: -1 }} className="lg:col-span-12 space-y-5" aria-busy="true" role="status" aria-label="جاري تحميل البيانات">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white border border-slate-200 p-4 animate-pulse space-y-3">
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
                <div className="h-7 w-1/3 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="h-56 rounded-xl bg-white border border-slate-200 animate-pulse" />
            <div className="h-56 rounded-xl bg-white border border-slate-200 animate-pulse" />
          </div>
        </div>
      )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
          value={loading ? "..." : `${data?.monthly_subscription_cost?.toLocaleString("en-US") || 0} ر.س`}
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
          subtitle={`حضور اليوم: ${data?.present_today || 0} • الفروع: ${data?.total_branches || 5}`}
          icon={<Icons.Users size={20} />}
          accentColor="border-slate-600"
          href="/employees"
        />
      </div>

      {/* KPI Cards Row 3: Enterprise CRM, Projects, HRM & Approvals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <StatsCard
          title="المشاريع المؤسسية النشطة"
          value={loading ? "..." : data?.active_projects || 0}
          subtitle="مرتبطة بالمراحل والمهام التشغيلية"
          icon={<Icons.CheckSquare size={20} />}
          accentColor="border-[#123D32]"
          href="/projects"
        />
        <StatsCard
          title="الفرص البيعية المفتوحة (CRM)"
          value={loading ? "..." : data?.open_opportunities || 0}
          subtitle={`إجمالي العملاء: ${data?.total_customers || 0}`}
          icon={<Icons.Globe size={20} />}
          accentColor="border-[#187A5A]"
          href="/crm"
        />
        <StatsCard
          title="مركز الاعتمادات المعلقة"
          value={loading ? "..." : data?.pending_approvals || 0}
          subtitle="مشتريات، إجازات، وتغييرات تقنية"
          icon={<Icons.ShieldCheck size={20} />}
          accentColor="border-amber-500"
          href="/approvals"
        />
        <StatsCard
          title="الموارد البشرية والحضور"
          value={loading ? "..." : `${data?.present_today || 0} / ${data?.total_employees || 0}`}
          subtitle="بصمة الحضور الفعلي لليوم"
          icon={<Icons.Clock size={20} />}
          accentColor="border-[#C5A46D]"
          href="/hrm"
        />
      </div>

      </DashboardWidget>
      <DashboardWidget id="maintenance" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs h-full flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">ملخص الصيانة والتغييرات</h2>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Icons.Maintenance size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div>
              <div className="text-xs font-semibold text-slate-600">عمليات صيانة معلقة أو جارية</div>
              <div className="motion-counter text-3xl font-black text-slate-900 mt-1">
                {data?.pending_maintenance ?? 0}
              </div>
            </div>
            <Link
              href="/maintenance"
              className="motion-control inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-semibold transition-colors"
            >
              <span>متابعة الصيانة</span>
              <Icons.ChevronLeft size={14} />
            </Link>
          </div>
        </div>
      </DashboardWidget>
      <DashboardWidget id="recent_tasks" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">المهام التشغيلية الأخيرة</h2>
            <Link href="/tasks" className="text-xs font-semibold text-[#187A5A] hover:underline">
              عرض الكل
            </Link>
          </div>
          {data?.recent_tasks?.length ? (
            <div className="divide-y divide-slate-100 flex-1">
              {data.recent_tasks.map((task: { id: string; title: string; status: string }) => (
                <Link
                  className="motion-control flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
                  href="/tasks"
                  key={task.id}
                >
                  <span className="text-xs font-semibold text-slate-800 truncate"><bdi>{task.title}</bdi></span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 shrink-0"><bdi>{task.status}</bdi></span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact title="لا توجد مهام حديثة" description="ستظهر أحدث المهام المسندة هنا فور إنشائها" />
          )}
        </div>
      </DashboardWidget>
      {/* Analytics & Activity Section */}
      
        {/* Asset Status Breakdown */}
        <DashboardWidget id="asset_status" allowed={data?.available_widgets}>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs h-full">
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
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs h-full">
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
                    <span className="text-slate-500 mx-1.5">•</span>
                    <span className="text-slate-700">{act.resource_type}</span>
                  </div>
                  <span className="text-[11px] text-slate-600 font-mono">
                    {act.user_name}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-600 py-4 text-center">لا توجد عمليات مسجلة حديثاً</p>
            )}
          </div>
        </div>
        </DashboardWidget>
      </DashboardWorkspace>
    </DashboardLayout>
  );
}

const WIDGET_SPANS: Record<string, string> = {
  quick_actions: "lg:col-span-12",
  critical_tickets: "lg:col-span-12",
  subscriptions: "lg:col-span-12",
  kpis: "lg:col-span-12",
  asset_status: "lg:col-span-6",
  ticket_priorities: "lg:col-span-6",
  recent_tasks: "lg:col-span-6",
  maintenance: "lg:col-span-6",
  activity: "lg:col-span-12",
};

function DashboardWidget({ id, allowed, children }: { id: string; allowed?: string[]; children: React.ReactNode }) {
  const { draft } = useWorkspace();
  const index = draft.widgets.findIndex(w => w.id === id);
  if (!allowed?.includes(id) || index < 0 || !draft.widgets[index].enabled) return null;
  return (
    <section
      style={{ order: index }}
      data-widget={id}
      className={`${WIDGET_SPANS[id] || "lg:col-span-12"} min-w-0`}
    >
      {children}
    </section>
  );
}

function DashboardWorkspace({ children }: { children: React.ReactNode }) {
  const { draft } = useWorkspace();
  const order = (child: React.ReactNode) => React.isValidElement<{ id?: string }>(child) && child.props.id ? draft.widgets.findIndex(w => w.id === child.props.id) : -1;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      {React.Children.toArray(children).sort((a, b) => order(a) - order(b))}
    </div>
  );
}
