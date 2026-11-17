"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/StatsCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface CrmOverviewData {
  kpis: {
    total_customers: number;
    active_customers: number;
    total_opportunities: number;
    open_pipeline_value_sar: number;
    won_revenue_sar: number;
    conversion_rate_percent: number;
    win_rate_percent: number;
  };
  pipeline_by_stage: Record<string, number>;
  pipeline_value_by_stage: Record<string, number>;
  customers: {
    id: string;
    customer_code: string;
    name_ar: string;
    industry: string | null;
    customer_type: string;
    status: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    account_owner_name: string;
  }[];
  opportunities: {
    id: string;
    reference_code: string;
    title: string;
    stage: string;
    expected_value_sar: number;
    probability: number;
    expected_close_date: string | null;
    customer_name: string;
    owner_name: string;
  }[];
  activities: {
    id: string;
    activity_type: string;
    subject: string;
    status: string;
    due_date: string | null;
    customer_name: string;
    employee_name: string;
  }[];
}

export default function CrmDashboardPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<CrmOverviewData | null>(null);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; employee_number: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Customer Modal
  const [showCustModal, setShowCustModal] = useState(false);
  const [custCode, setCustCode] = useState("");
  const [custName, setCustName] = useState("");
  const [custIndustry, setCustIndustry] = useState("التقنية والاتصالات");
  const [custContact, setCustContact] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custOwnerId, setCustOwnerId] = useState("");

  // Add Opportunity Modal
  const [showOppModal, setShowOppModal] = useState(false);
  const [oppRef, setOppRef] = useState("");
  const [oppTitle, setOppTitle] = useState("");
  const [oppValue, setOppValue] = useState("150000");
  const [oppStage, setOppStage] = useState("Proposal");
  const [oppCustomerId, setOppCustomerId] = useState("");
  const [oppOwnerId, setOppOwnerId] = useState("");

  const fetchCrm = useCallback(async () => {
    setLoading(true);
    try {
      const [crmRes, empRes] = await Promise.all([
        api.get<CrmOverviewData>("/crm/overview"),
        api.get<{ id: string; full_name: string; employee_number: string }[]>("/employees?per_page=100"),
      ]);
      setData(crmRes.data);
      setEmployees(empRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل بيانات CRM");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchCrm();
  }, [activeCompanyId, fetchCrm]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/crm/customers", {
        customer_code: custCode,
        name_ar: custName,
        industry: custIndustry,
        contact_person: custContact,
        phone: custPhone,
        account_owner_id: custOwnerId || undefined,
      });
      toast.success("تم تسجيل العميل بنجاح");
      setShowCustModal(false);
      setCustCode("");
      setCustName("");
      await fetchCrm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تسجيل العميل");
    }
  };

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/crm/opportunities", {
        reference_code: oppRef,
        title: oppTitle,
        stage: oppStage,
        expected_value_sar: Number(oppValue) || 0,
        customer_id: oppCustomerId || undefined,
        owner_id: oppOwnerId || undefined,
      });
      toast.success("تم إنشاء الفرصة البيعية بنجاح");
      setShowOppModal(false);
      setOppRef("");
      setOppTitle("");
      await fetchCrm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء الفرصة البيعية");
    }
  };

  const handleAdvanceStage = async (oppId: string, nextStage: string) => {
    try {
      await api.put(`/crm/opportunities/${oppId}/stage`, { stage: nextStage });
      toast.success(`تم تحديث المرحلة إلى ${nextStage}`);
      await fetchCrm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث المرحلة");
    }
  };

  const stageItems = Object.entries(data?.pipeline_by_stage || {}).map(([label, value]) => ({
    label,
    value,
  }));
  const stageValueItems = Object.entries(data?.pipeline_value_by_stage || {}).map(
    ([label, value]) => ({ label, value })
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="إدارة علاقات العملاء والفرص البيعية (Enterprise CRM)"
          description="متابعة العملاء، مراحل الفرص البيعية (Pipeline)، معدلات التحويل، وأنشطة المتابعة المرتبطة بموظفي الشركة"
          icon={<Icons.Globe size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustModal(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
              >
                + عميل جديد
              </button>
              <button
                type="button"
                onClick={() => setShowOppModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold cursor-pointer"
              >
                + فرصة بيعية جديدة
              </button>
            </div>
          }
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="إجمالي العملاء المسجلين"
            value={loading ? "..." : data?.kpis.total_customers || 0}
            subtitle={`عملاء نشطون: ${data?.kpis.active_customers || 0}`}
            icon={<Icons.Companies size={20} />}
            accentColor="border-[#123D32]"
          />
          <StatsCard
            title="قيمة الفرص البيعية المفتوحة"
            value={loading ? "..." : `${(data?.kpis.open_pipeline_value_sar || 0).toLocaleString()} ر.س`}
            subtitle={`عدد الفرص: ${data?.kpis.total_opportunities || 0}`}
            icon={<Icons.Globe size={20} />}
            accentColor="border-[#187A5A]"
          />
          <StatsCard
            title="العقود والفرص المكسوبة (Won)"
            value={loading ? "..." : `${(data?.kpis.won_revenue_sar || 0).toLocaleString()} ر.س`}
            subtitle="إيرادات فعلية مسجلة في النظام"
            icon={<Icons.CheckCircle size={20} />}
            accentColor="border-emerald-600"
          />
          <StatsCard
            title="معدل التحويل والنجاح"
            value={loading ? "..." : `${data?.kpis.conversion_rate_percent || 0}%`}
            subtitle={`نسبة الفوز من المغلق: ${data?.kpis.win_rate_percent || 0}%`}
            icon={<Icons.Sparkles size={20} />}
            accentColor="border-[#C5A46D]"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <EnterpriseBarChart
            title="مراحل الفرص البيعية (Sales Pipeline by Stage)"
            subtitle="توزيع الفرص حسب المرحلة البيعية الحالية"
            unit="فرصة"
            items={stageItems}
          />
          <EnterpriseDonutChart
            title="القيمة المالية المتوقعة حسب المرحلة"
            subtitle="توزيع القيمة بالريال السعودي عبر مراحل Pipeline"
            unit="ر.س"
            totalLabel="إجمالي ر.س"
            items={stageValueItems}
          />
        </div>

        {/* Customers & Opportunities Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">سجل الفرص البيعية (Opportunities Pipeline)</h2>
            {(data?.opportunities || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">لا توجد فرص بيعية مسجلة حالياً</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 px-2">المرجع</th>
                      <th className="py-2 px-2">الفرصة</th>
                      <th className="py-2 px-2">العميل</th>
                      <th className="py-2 px-2">المسؤول</th>
                      <th className="py-2 px-2">القيمة (ر.س)</th>
                      <th className="py-2 px-2">المرحلة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.opportunities.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2 px-2 font-mono font-bold text-[#187A5A]">{o.reference_code}</td>
                        <td className="py-2 px-2 font-bold text-slate-900">{o.title}</td>
                        <td className="py-2 px-2 text-slate-600">{o.customer_name}</td>
                        <td className="py-2 px-2 text-slate-700">{o.owner_name}</td>
                        <td className="py-2 px-2 font-mono font-bold">{o.expected_value_sar.toLocaleString()}</td>
                        <td className="py-2 px-2">
                          <select
                            aria-label={`تغيير مرحلة ${o.title}`}
                            value={o.stage}
                            onChange={(e) => void handleAdvanceStage(o.id, e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-slate-50"
                          >
                            <option value="Lead">Lead</option>
                            <option value="Qualified">Qualified</option>
                            <option value="Proposal">Proposal</option>
                            <option value="Negotiation">Negotiation</option>
                            <option value="Won">Won</option>
                            <option value="Lost">Lost</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">قاعدة العملاء (Customers Directory)</h2>
            {(data?.customers || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">لا يوجد عملاء مسجلون بعد</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data?.customers.map((c) => (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">
                        {c.name_ar} <span className="font-mono text-[10px] text-slate-500">({c.customer_code})</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        المسؤول: {c.account_owner_name} • القطاع: {c.industry || "عام"}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add Customer Modal */}
        <Modal isOpen={showCustModal} onClose={() => setShowCustModal(false)} title="تسجيل عميل جديد">
          <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">كود العميل *</label>
                <input
                  type="text"
                  required
                  value={custCode}
                  onChange={(e) => setCustCode(e.target.value)}
                  placeholder="CUST-101"
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="شركة الأفق الرقمي"
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الموظف المسؤول عن الحساب</label>
              <select
                value={custOwnerId}
                onChange={(e) => setCustOwnerId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                <option value="">اختر من الدليل الموحد للموظفين...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} (#{emp.employee_number})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">جهة الاتصال</label>
                <input
                  type="text"
                  value={custContact}
                  onChange={(e) => setCustContact(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                حفظ العميل
              </button>
            </div>
          </form>
        </Modal>

        {/* Add Opportunity Modal */}
        <Modal isOpen={showOppModal} onClose={() => setShowOppModal(false)} title="إنشاء فرصة بيعية جديدة">
          <form onSubmit={handleCreateOpportunity} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الرقم المرجعي *</label>
                <input
                  type="text"
                  required
                  value={oppRef}
                  onChange={(e) => setOppRef(e.target.value)}
                  placeholder="OPP-2026-01"
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">القيمة المتوقعة (ر.س) *</label>
                <input
                  type="number"
                  required
                  value={oppValue}
                  onChange={(e) => setOppValue(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">عنوان الفرصة البيعية *</label>
              <input
                type="text"
                required
                value={oppTitle}
                onChange={(e) => setOppTitle(e.target.value)}
                placeholder="مشروع ترقية البنية السحابية والأمن السيبراني"
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">العميل</label>
                <select
                  value={oppCustomerId}
                  onChange={(e) => setOppCustomerId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                >
                  <option value="">اختر العميل...</option>
                  {(data?.customers || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">الموظف المسؤول</label>
                <select
                  value={oppOwnerId}
                  onChange={(e) => setOppOwnerId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} (#{emp.employee_number})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">المرحلة</label>
              <select
                value={oppStage}
                onChange={(e) => setOppStage(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                <option value="Lead">Lead</option>
                <option value="Qualified">Qualified</option>
                <option value="Proposal">Proposal</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Won">Won</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                حفظ الفرصة
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
