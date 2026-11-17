"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/StatsCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface ApprovalsOverview {
  can_approve: boolean;
  kpis: {
    total_approvals: number;
    pending_approvals: number;
    approved_count: number;
    rejected_count: number;
    total_purchase_requests: number;
    pending_purchase_amount_sar: number;
  };
  approvals: {
    id: string;
    workflow_type: string;
    target_resource_type: string;
    target_resource_id: string;
    title: string;
    current_state: string;
    priority: string;
    amount_sar: number | null;
    initiator_name: string;
    approver_name: string | null;
    decision_notes: string | null;
    created_at: string | null;
  }[];
  purchase_requests: {
    id: string;
    request_number: string;
    item_name: string;
    category: string;
    vendor_name: string | null;
    quantity: number;
    unit_cost_sar: number;
    total_cost_sar: number;
    status: string;
    requester_name: string;
    department_name: string;
    justification: string | null;
  }[];
}

export default function ApprovalsDashboardPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ApprovalsOverview | null>(null);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; employee_number: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [reqNum, setReqNum] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("Hardware");
  const [vendorName] = useState("");
  const [quantity, setQuantity] = useState("2");
  const [unitCost, setUnitCost] = useState("4500");
  const [requesterId, setRequesterId] = useState("");
  const [justification, setJustification] = useState("");

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const [appRes, empRes] = await Promise.all([
        api.get<ApprovalsOverview>("/approvals"),
        api.get<{ id: string; full_name: string; employee_number: string }[]>("/employees?per_page=100"),
      ]);
      setData(appRes.data);
      setEmployees(empRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل بيانات الاعتمادات والمشتريات");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchApprovals();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeCompanyId, fetchApprovals]);

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/approvals/purchase-requests", {
        request_number: reqNum,
        item_name: itemName,
        category,
        vendor_name: vendorName || undefined,
        quantity: Number(quantity) || 1,
        unit_cost_sar: Number(unitCost) || 0,
        requester_id: requesterId || undefined,
        justification,
      });
      toast.success("تم إنشاء طلب الشراء وإرساله لمركز الاعتمادات");
      setShowPurchaseModal(false);
      setReqNum("");
      setItemName("");
      await fetchApprovals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تقديم طلب الشراء");
    }
  };

  const handleDecide = async (approvalId: string, decision: "Approved" | "Rejected") => {
    try {
      await api.post(`/approvals/${approvalId}/decide`, {
        decision,
        notes: decision === "Approved" ? "تم الاعتماد وفق الصلاحيات" : "مرفوض",
      });
      toast.success(`تم تحديث حالة الطلب إلى ${decision}`);
      await fetchApprovals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تنفيذ القرار");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="مركز الاعتمادات الموحد وطلبات الشراء (Workflows & Procurement)"
          description="محرك BPMN موحد لاعتماد طلبات الشراء، الإجازات، التغييرات التقنية، والعهد مع توثيق كامل في سجل المراجعة"
          icon={<Icons.ShieldCheck size={20} />}
          actions={
            <button
              type="button"
              onClick={() => setShowPurchaseModal(true)}
              className="px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold cursor-pointer"
            >
              + طلب شراء / توريد جديد
            </button>
          }
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="طلبات بانتظار الاعتماد"
            value={loading ? "..." : data?.kpis.pending_approvals || 0}
            subtitle={`إجمالي طلبات سير العمل: ${data?.kpis.total_approvals || 0}`}
            icon={<Icons.Clock size={20} />}
            accentColor="border-amber-500"
          />
          <StatsCard
            title="طلبات تم اعتمادها"
            value={loading ? "..." : data?.kpis.approved_count || 0}
            subtitle={`مرفوضة: ${data?.kpis.rejected_count || 0}`}
            icon={<Icons.CheckCircle size={20} />}
            accentColor="border-[#187A5A]"
          />
          <StatsCard
            title="إجمالي طلبات الشراء (ERP)"
            value={loading ? "..." : data?.kpis.total_purchase_requests || 0}
            subtitle="أجهزة، تراخيص، ومستلزمات تقنية"
            icon={<Icons.Assets size={20} />}
            accentColor="border-[#123D32]"
          />
          <StatsCard
            title="قيمة المشتريات المعلقة"
            value={loading ? "..." : `${(data?.kpis.pending_purchase_amount_sar || 0).toLocaleString("en-US")} ر.س`}
            subtitle="بانتظار اعتماد صاحب الصلاحية"
            icon={<Icons.Subscriptions size={20} />}
            accentColor="border-[#C5A46D]"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Unified Approval Queue */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">صندوق الاعتمادات الموحد (BPMN Approval Queue)</h2>
            {(data?.approvals || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">لا توجد طلبات اعتماد مسجلة حالياً</p>
            ) : (
              <div className="space-y-2.5">
                {data?.approvals.map((a) => (
                  <div
                    key={a.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900">{a.title}</div>
                      <div className="text-[11px] text-slate-500">
                        النوع: {a.workflow_type} • مقدم الطلب: {a.initiator_name}
                        {a.amount_sar !== null ? ` • القيمة: ${a.amount_sar.toLocaleString("en-US")} ر.س` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.current_state} />
                      {data.can_approve && a.current_state === "Pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDecide(a.id, "Approved")}
                            className="px-2.5 py-1 rounded-lg bg-[#187A5A] hover:bg-[#123D32] text-white font-bold cursor-pointer"
                          >
                            اعتماد
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDecide(a.id, "Rejected")}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold cursor-pointer"
                          >
                            رفض
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-5">
            <EnterpriseDonutChart
              title="حالات طلبات الاعتماد"
              subtitle="توزيع حالات سير العمل (Pending / Approved / Rejected)"
              totalLabel="طلب"
              items={[
                { label: "بانتظار الاعتماد (Pending)", value: data?.kpis.pending_approvals || 0, color: "#D97706" },
                { label: "معتمد (Approved)", value: data?.kpis.approved_count || 0, color: "#187A5A" },
                { label: "مرفوض (Rejected)", value: data?.kpis.rejected_count || 0, color: "#E11D48" },
              ]}
            />
          </div>
        </div>

        {/* Purchase Requests Table */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900">سجل طلبات الشراء والتوريد (Purchase Requisitions)</h2>
          {(data?.purchase_requests || []).length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لا توجد طلبات شراء مسجلة بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-2">رقم الطلب</th>
                    <th className="py-2 px-2">البند / الجهاز</th>
                    <th className="py-2 px-2">التصنيف</th>
                    <th className="py-2 px-2">طالب الشراء</th>
                    <th className="py-2 px-2">الكمية</th>
                    <th className="py-2 px-2">الإجمالي (ر.س)</th>
                    <th className="py-2 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.purchase_requests.map((pr) => (
                    <tr key={pr.id}>
                      <td className="py-2 px-2 font-mono font-bold text-[#187A5A]">{pr.request_number}</td>
                      <td className="py-2 px-2 font-bold text-slate-900">{pr.item_name}</td>
                      <td className="py-2 px-2 text-slate-600">{pr.category}</td>
                      <td className="py-2 px-2 text-slate-700">{pr.requester_name}</td>
                      <td className="py-2 px-2 font-mono">{pr.quantity}</td>
                      <td className="py-2 px-2 font-mono font-bold">{pr.total_cost_sar.toLocaleString("en-US")}</td>
                      <td className="py-2 px-2"><StatusBadge status={pr.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Purchase Request Modal */}
        <Modal isOpen={showPurchaseModal} onClose={() => setShowPurchaseModal(false)} title="تقديم طلب شراء / توريد جديد">
          <form onSubmit={handleCreatePurchase} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الطلب *</label>
                <input
                  type="text"
                  required
                  value={reqNum}
                  onChange={(e) => setReqNum(e.target.value)}
                  placeholder="PR-2026-001"
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">التصنيف</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                >
                  <option value="Hardware">أجهزة ومعدات (Hardware)</option>
                  <option value="Software">تراخيص برمجية (Software)</option>
                  <option value="Network">شبكات وأمن معلومات (Network)</option>
                  <option value="CloudSubscription">اشتراك سحابي (Cloud)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">اسم البند / الجهاز *</label>
              <input
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="أجهزة لابتوب مهندسي الشبكات"
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الكمية *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">سعر الوحدة (ر.س) *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الموظف مقدم الطلب</label>
              <select
                value={requesterId}
                onChange={(e) => setRequesterId(e.target.value)}
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
            <div>
              <label className="block font-bold text-slate-700 mb-1">المبررات</label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                إرسال للاعتماد
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
