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

interface ProjectsData {
  kpis: {
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    delayed_projects: number;
    total_budget_sar: number;
    total_spent_sar: number;
  };
  status_distribution: Record<string, number>;
  projects: {
    id: string;
    project_code: string;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    target_end_date: string | null;
    budget_sar: number;
    spent_sar: number;
    progress_percent: number;
    manager_id: string | null;
    manager_name: string;
    department_name: string;
    branch_name: string;
    total_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    is_delayed: boolean;
    milestones: {
      id: string;
      title: string;
      status: string;
      start_date: string | null;
      due_date: string | null;
      completion_percent: number;
      owner_name: string;
    }[];
  }[];
}

export default function ProjectsDashboardPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ProjectsData | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; employee_number: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [projCode, setProjCode] = useState("");
  const [projName, setProjName] = useState("");
  const [projManagerId, setProjManagerId] = useState("");
  const [projBudget, setProjBudget] = useState("250000");
  const [projEndDate, setProjEndDate] = useState("");
  const [projProgress, setProjProgress] = useState("35");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const bq = selectedBranchIds.length > 0 ? `?branch_ids=${encodeURIComponent(selectedBranchIds.join(","))}` : "";
      const [projRes, empRes] = await Promise.all([
        api.get<ProjectsData>(`/projects${bq}`),
        api.get<{ id: string; full_name: string; employee_number: string }[]>("/employees?per_page=100"),
      ]);
      setData(projRes.data);
      setEmployees(empRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل بيانات المشاريع");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchIds, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeCompanyId, fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/projects", {
        project_code: projCode,
        name: projName,
        manager_id: projManagerId || undefined,
        budget_sar: Number(projBudget) || 0,
        target_end_date: projEndDate || undefined,
        progress_percent: Number(projProgress) || 0,
      });
      toast.success("تم إنشاء المشروع بنجاح");
      setShowAddModal(false);
      setProjCode("");
      setProjName("");
      await fetchProjects();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء المشروع");
    }
  };

  const progressItems = (data?.projects || []).map((p) => ({
    label: `${p.project_code} — ${p.name}`,
    value: p.progress_percent,
    badge: p.manager_name,
  }));
  const statusItems = Object.entries(data?.status_distribution || {}).map(([label, value]) => ({
    label,
    value,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="إدارة المشاريع والجدولة الزمنية (Enterprise Projects & Gantt)"
          description="متابعة تقدم المشاريع، المراحل الزمنية (Milestones)، الميزانيات المعتمدة، وربط مديري المشاريع من الدليل الموحد"
          icon={<Icons.CheckSquare size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold cursor-pointer"
              >
                + مشروع جديد
              </button>
              <Link
                href="/tasks"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                لوحة المهام التشغيلية
              </Link>
            </div>
          }
        />

        {/* Canonical 5-Branch Filter Bar */}
        <BranchIntelligenceFilterBar
          selectedBranchIds={selectedBranchIds}
          onChangeBranchIds={setSelectedBranchIds}
          label="تصفية المشاريع والجدولة الزمنية حسب الفرع المعتمد"
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="إجمالي المشاريع"
            value={loading ? "..." : data?.kpis.total_projects || 0}
            subtitle={`نشطة: ${data?.kpis.active_projects || 0} • مكتملة: ${data?.kpis.completed_projects || 0}`}
            icon={<Icons.CheckSquare size={20} />}
            accentColor="border-[#123D32]"
          />
          <StatsCard
            title="المشاريع المتأخرة أو الحرجة"
            value={loading ? "..." : data?.kpis.delayed_projects || 0}
            subtitle="تتطلب معالجة المهام المتأخرة"
            icon={<Icons.AlertTriangle size={20} />}
            accentColor="border-rose-600"
          />
          <StatsCard
            title="إجمالي الميزانيات المعتمدة"
            value={loading ? "..." : `${(data?.kpis.total_budget_sar || 0).toLocaleString("en-US")} ر.س`}
            subtitle={`المنصرف: ${(data?.kpis.total_spent_sar || 0).toLocaleString("en-US")} ر.س`}
            icon={<Icons.Subscriptions size={20} />}
            accentColor="border-[#187A5A]"
          />
          <StatsCard
            title="نسبة الإنجاز الكلية"
            value={
              loading || !data?.projects.length
                ? "0%"
                : `${Math.round(
                    data.projects.reduce((a, b) => a + b.progress_percent, 0) /
                      data.projects.length
                  )}%`
            }
            subtitle="متوسط تقدم المشاريع المسجلة"
            icon={<Icons.Sparkles size={20} />}
            accentColor="border-[#C5A46D]"
          />
        </div>

        {/* Visual Intelligence Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <EnterpriseBarChart
            title="مخطط تقدم المشاريع والجدول الزمني (Gantt Progress)"
            subtitle="نسبة الإنجاز الفعلي لكل مشروع مع المدير المسؤول"
            unit="%"
            items={progressItems}
          />
          <EnterpriseDonutChart
            title="توزيع حالات المشاريع"
            subtitle="حالات دورة حياة المشاريع في المنشأة"
            totalLabel="مشروع"
            items={statusItems}
          />
        </div>

        {/* Projects Table */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900">سجل المشاريع ومؤشرات الإنجاز</h2>
          {(data?.projects || []).length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">لا توجد مشاريع مسجلة بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-2">الكود</th>
                    <th className="py-2.5 px-2">اسم المشروع</th>
                    <th className="py-2.5 px-2">مدير المشروع</th>
                    <th className="py-2.5 px-2">الميزانية (ر.س)</th>
                    <th className="py-2.5 px-2">تاريخ الانتهاء</th>
                    <th className="py-2.5 px-2">التقدم</th>
                    <th className="py-2.5 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.projects.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-2 font-mono font-bold text-[#187A5A]">{p.project_code}</td>
                      <td className="py-2.5 px-2 font-bold text-slate-900">{p.name}</td>
                      <td className="py-2.5 px-2 text-slate-700">
                        {p.manager_id ? (
                          <Link href={`/employees/${p.manager_id}`} className="text-[#187A5A] font-semibold hover:underline">
                            {p.manager_name}
                          </Link>
                        ) : (
                          p.manager_name
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono">{p.budget_sar.toLocaleString("en-US")}</td>
                      <td className="py-2.5 px-2 font-mono">{p.target_end_date || "—"}</td>
                      <td className="py-2.5 px-2 w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#187A5A]" style={{ width: `${p.progress_percent}%` }} />
                          </div>
                          <span className="font-mono font-bold">{p.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Project Modal */}
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="إنشاء مشروع مؤسسي جديد">
          <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">كود المشروع *</label>
                <input
                  type="text"
                  required
                  value={projCode}
                  onChange={(e) => setProjCode(e.target.value)}
                  placeholder="PRJ-2026-01"
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">الميزانية المعتمدة (ر.س)</label>
                <input
                  type="number"
                  value={projBudget}
                  onChange={(e) => setProjBudget(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">اسم المشروع *</label>
              <input
                type="text"
                required
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="تحديث مركز البيانات والشبكة الداخلية"
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">مدير المشروع (من الدليل الموحد)</label>
              <select
                value={projManagerId}
                onChange={(e) => setProjManagerId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                <option value="">اختر مدير المشروع...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} (#{emp.employee_number})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">تاريخ الانتهاء المستهدف</label>
                <input
                  type="date"
                  value={projEndDate}
                  onChange={(e) => setProjEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نسبة الإنجاز المبدئية (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={projProgress}
                  onChange={(e) => setProjProgress(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                حفظ المشروع
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
