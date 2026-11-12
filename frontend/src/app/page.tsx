"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/ui/StatsCard";
import { Icons } from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { activeCompany } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get("/dashboard");
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            لوحة تحكم العمليات التشغيلية
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            نظرة شاملة على الأصول والعهدة والبنية التحتية وتذاكر الدعم لـ{" "}
            <span className="font-bold text-[#187A5A]">
              {activeCompany ? activeCompany.name_ar : "الشركة الحالية"}
            </span>
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <a
            href="/assets"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Icons.Plus size={15} />
            <span>تسجيل أصل</span>
          </a>
          <a
            href="/tickets"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Icons.HelpDesk size={15} className="text-[#187A5A]" />
            <span>فتح تذكرة</span>
          </a>
          <a
            href="/reports"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Icons.Download size={15} />
            <span>تصدير تقرير</span>
          </a>
        </div>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="إجمالي الأصول التقنية"
          value={loading ? "..." : data?.total_assets || 0}
          subtitle={`متاح: ${data?.available_assets || 0} • مسلّم: ${data?.assigned_assets || 0}`}
          icon={<Icons.Assets size={20} />}
          accentColor="border-[#123D32]"
        />
        <StatsCard
          title="أجهزة البنية التحتية"
          value={loading ? "..." : data?.infrastructure_devices || 0}
          subtitle="سيرفرات، جدران حماية، راوترات"
          icon={<Icons.Infrastructure size={20} />}
          accentColor="border-[#187A5A]"
        />
        <StatsCard
          title="تذاكر الدعم المفتوحة"
          value={loading ? "..." : data?.open_tickets || 0}
          subtitle={`تذاكر حرجة: ${data?.critical_tickets || 0}`}
          icon={<Icons.HelpDesk size={20} />}
          accentColor="border-amber-500"
          trend={data?.critical_tickets > 0 ? "عاجل" : undefined}
        />
        <StatsCard
          title="المهام التشغيلية المفتوحة"
          value={loading ? "..." : data?.open_tasks || 0}
          subtitle={`متأخرة عن الموعد: ${data?.overdue_tasks || 0}`}
          icon={<Icons.Tasks size={20} />}
          accentColor="border-blue-600"
        />
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="الاشتراكات السحابية النشطة"
          value={loading ? "..." : data?.active_subscriptions || 0}
          subtitle={`تجديدات قادمة (30 يوم): ${data?.upcoming_renewals || 0}`}
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-[#C5A46D]"
        />
        <StatsCard
          title="التكلفة الشهرية للاشتراكات"
          value={loading ? "..." : `${data?.monthly_subscription_cost?.toLocaleString() || 0} ر.س`}
          subtitle="برمجيات، خوادم سحابية، استضافة"
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-emerald-600"
        />
        <StatsCard
          title="عمليات صيانة وتغيير معلقة"
          value={loading ? "..." : data?.pending_maintenance || 0}
          subtitle="بانتظار الاعتماد أو قيد التنفيذ"
          icon={<Icons.Maintenance size={20} />}
          accentColor="border-rose-600"
        />
        <StatsCard
          title="إجمالي موظفي الشركة"
          value={loading ? "..." : data?.total_employees || 0}
          subtitle="مسجلين في نظام العهد والصلاحيات"
          icon={<Icons.Users size={20} />}
          accentColor="border-slate-600"
        />
      </div>

      {/* Analytics & Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset Status Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>توزيع حالات الأصول</span>
            <Icons.Assets size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-3">
            {data?.asset_status_distribution &&
              Object.entries(data.asset_status_distribution).map(
                ([status, count]: [string, any]) => {
                  const total = data.total_assets || 1;
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

        {/* Task & Ticket Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>أولويات تذاكر الدعم</span>
            <Icons.HelpDesk size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-3">
            {data?.ticket_priority_distribution &&
              Object.entries(data.ticket_priority_distribution).map(
                ([prio, count]: [string, any]) => {
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

        {/* Recent Audit Activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>سجل العمليات الأخير</span>
            <Icons.Audit size={16} className="text-[#187A5A]" />
          </h2>

          <div className="space-y-2.5">
            {data?.recent_activities && data.recent_activities.length > 0 ? (
              data.recent_activities.map((act: any) => (
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
      </div>
    </DashboardLayout>
  );
}
