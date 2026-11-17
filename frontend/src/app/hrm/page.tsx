"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/StatsCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { BranchIntelligenceFilterBar } from "@/components/ui/BranchIntelligenceFilterBar";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface HrmOverviewData {
  kpis: {
    total_headcount: number;
    active_headcount: number;
    on_leave_headcount: number;
    present_today: number;
    late_today: number;
    absent_today: number;
    unrecorded_today: number;
    pending_leave_requests: number;
  };
  distributions: {
    by_department: Record<string, number>;
    by_branch: Record<string, number>;
    attendance_status: Record<string, number>;
  };
  workload_by_employee: {
    employee_id: string;
    full_name: string;
    employee_number: string;
    job_title: string | null;
    department_name: string;
    active_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
  }[];
  recent_attendance: {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_number: string;
    attendance_date: string;
    check_in_at: string | null;
    check_out_at: string | null;
    status: string;
    late_minutes: number;
    worked_minutes: number;
    source: string;
  }[];
  leave_requests: {
    id: string;
    employee_id: string;
    employee_name: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    status: string;
    reason: string | null;
  }[];
}

export default function HrmDashboardPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<HrmOverviewData | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [eventType, setEventType] = useState<"check_in" | "check_out" | "remote">("check_in");
  const [notes, setNotes] = useState("");

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const bq = selectedBranchIds.length > 0 ? `?branch_ids=${encodeURIComponent(selectedBranchIds.join(","))}` : "";
      const res = await api.get<HrmOverviewData>(`/hrm/overview${bq}`);
      setData(res.data);
      if (res.data?.workload_by_employee?.length && !selectedEmpId) {
        setSelectedEmpId(res.data.workload_by_employee[0].employee_id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل بيانات الموارد البشرية");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchIds, selectedEmpId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeCompanyId, fetchOverview]);

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    try {
      await api.post("/hrm/attendance", {
        employee_id: selectedEmpId,
        event_type: eventType,
        notes,
      });
      toast.success("تم تسجيل حركة الحضور والانصراف بنجاح");
      setShowAttendanceModal(false);
      setNotes("");
      await fetchOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تسجيل الحضور");
    }
  };

  const deptChartItems = Object.entries(data?.distributions.by_department || {}).map(
    ([label, value]) => ({ label, value })
  );
  const attStatusItems = Object.entries(data?.distributions.attendance_status || {}).map(
    ([label, value]) => ({ label, value })
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="إدارة الموارد البشرية والحضور والانصراف (HRM & Attendance)"
          description="متابعة القوى العاملة، حركات الحضور والانصراف الفعلية، توزيع عبء العمل، وطلبات الإجازات المعتمدة"
          icon={<Icons.Clock size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAttendanceModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold cursor-pointer"
              >
                + تسجيل حضور / انصراف
              </button>
              <Link
                href="/employees"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                دليل الموظفين 360°
              </Link>
            </div>
          }
        />

        {/* Canonical 5-Branch Filter Bar */}
        <BranchIntelligenceFilterBar
          selectedBranchIds={selectedBranchIds}
          onChangeBranchIds={setSelectedBranchIds}
          label="تصفية القوى العاملة والحضور حسب الفروع المعتمدة"
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="إجمالي القوى العاملة"
            value={loading ? "..." : data?.kpis.total_headcount || 0}
            subtitle={`على رأس العمل: ${data?.kpis.active_headcount || 0} • في إجازة: ${data?.kpis.on_leave_headcount || 0}`}
            icon={<Icons.Users size={20} />}
            accentColor="border-[#123D32]"
            href="/employees"
          />
          <StatsCard
            title="الحضور الفعلي المسجل اليوم"
            value={loading ? "..." : data?.kpis.present_today || 0}
            subtitle={`متأخر اليوم: ${data?.kpis.late_today || 0} • غير مسجل: ${data?.kpis.unrecorded_today || 0}`}
            icon={<Icons.CheckCircle size={20} />}
            accentColor="border-[#187A5A]"
          />
          <StatsCard
            title="الغياب المؤكد اليوم"
            value={loading ? "..." : data?.kpis.absent_today || 0}
            subtitle="يُفصل الغياب المؤكد عن عدم تسجيل البصمة"
            icon={<Icons.AlertCircle size={20} />}
            accentColor="border-rose-600"
          />
          <StatsCard
            title="طلبات إجازة بانتظار الاعتماد"
            value={loading ? "..." : data?.kpis.pending_leave_requests || 0}
            subtitle="مرتبطة بمركز الاعتمادات الموحد"
            icon={<Icons.Clock size={20} />}
            accentColor="border-amber-500"
            href="/approvals"
          />
        </div>

        {/* Visual Intelligence Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <EnterpriseBarChart
            title="توزيع الموظفين حسب القسم"
            subtitle="القوى العاملة الفعلية المسجلة في الدليل الموحد للمنشأة"
            unit="موظف"
            items={deptChartItems}
          />
          <EnterpriseDonutChart
            title="توزيع حالات الحضور والانصراف (الشهر الحالي)"
            subtitle="السجلات الموثقة فعلياً دون استنتاج من تسجيل دخول النظام"
            totalLabel="سجل"
            items={attStatusItems}
          />
        </div>

        {/* Workload & Attendance Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">توزيع عبء العمل والإنجاز حسب الموظف</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-2">الموظف</th>
                    <th className="py-2.5 px-2">القسم</th>
                    <th className="py-2.5 px-2">مهام نشطة</th>
                    <th className="py-2.5 px-2">مكتملة</th>
                    <th className="py-2.5 px-2">متأخرة</th>
                    <th className="py-2.5 px-2">الملف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.workload_by_employee || []).map((w) => (
                    <tr key={w.employee_id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-bold text-slate-900">
                        {w.full_name}{" "}
                        <span className="font-mono text-[10px] text-slate-500">#{w.employee_number}</span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{w.department_name}</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-blue-700">{w.active_tasks}</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-emerald-700">{w.completed_tasks}</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-rose-700">{w.overdue_tasks}</td>
                      <td className="py-2.5 px-2">
                        <Link
                          href={`/employees/${w.employee_id}`}
                          className="text-[#187A5A] font-bold hover:underline"
                        >
                          360°
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">أحدث حركات الحضور والانصراف المسجلة</h2>
            {(data?.recent_attendance || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                لا توجد حركات حضور مسجلة بعد في هذه الفترة
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data?.recent_attendance.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{r.employee_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {r.attendance_date} • دخول: {r.check_in_at || "—"} • خروج: {r.check_out_at || "—"}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attendance Recording Modal */}
        <Modal
          isOpen={showAttendanceModal}
          onClose={() => setShowAttendanceModal(false)}
          title="تسجيل حركة حضور أو انصراف فعلية"
        >
          <form onSubmit={handleRecordAttendance} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">الموظف</label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                {(data?.workload_by_employee || []).map((e) => (
                  <option key={e.employee_id} value={e.employee_id}>
                    {e.full_name} (#{e.employee_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">نوع الحركة</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as "check_in" | "check_out" | "remote")}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                <option value="check_in">تسجيل حضور (Check-In)</option>
                <option value="check_out">تسجيل انصراف (Check-Out)</option>
                <option value="remote">عمل عن بُعد معتمد (Remote)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">ملاحظات</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
                placeholder="ملاحظة اختيارية..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer"
              >
                حفظ الحركة
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
