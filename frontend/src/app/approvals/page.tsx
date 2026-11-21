"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Icons, ShieldCheckIcon } from "@/components/ui/Icons";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MobileApprovalCard } from "@/components/mobile/MobileApprovalCard";

interface WorkflowItem {
  id: string;
  workflow_type: string;
  target_resource_type: string;
  target_resource_id: string;
  title: string;
  current_state: string;
  priority: string;
  amount_sar?: number | null;
  initiator_name: string;
  approver_name?: string | null;
  decision_notes?: string | null;
  created_at: string;
  decided_at?: string | null;
}

interface PurchaseItem {
  id: string;
  request_number: string;
  item_name: string;
  category: string;
  vendor_name?: string | null;
  quantity: number;
  unit_cost_sar: number;
  total_cost_sar: number;
  status: string;
  requester_name: string;
  department_name: string;
  justification?: string | null;
  created_at: string;
}

interface ApprovalsData {
  can_approve: boolean;
  kpis: {
    total_approvals: number;
    pending_approvals: number;
    approved_count: number;
    rejected_count: number;
    total_purchase_requests: number;
    pending_purchase_amount_sar: number;
  };
  approvals: WorkflowItem[];
  purchase_requests: PurchaseItem[];
}

export default function ApprovalsPage() {
  const { currentCompany } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApprovalsData | null>(null);
  const [tab, setTab] = useState<"approvals" | "purchases" | "create">("approvals");
  const [statusFilter, setStatusFilter] = useState("");

  // Decision Modal
  const [decisionModal, setDecisionModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<WorkflowItem | null>(null);
  const [decisionType, setDecisionType] = useState<"Approved" | "Rejected">("Approved");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // New Purchase Request Form
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; department_name: string }[]>([]);
  const [formData, setFormData] = useState({
    request_number: `PR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    item_name: "",
    category: "Hardware",
    vendor_name: "",
    branch_id: "",
    department_id: "",
    quantity: 1,
    unit_cost_sar: 0,
    justification: "",
  });
  const [submittingForm, setSubmittingForm] = useState(false);

  const loadApprovals = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter) params.state = statusFilter;
      const res = await api.get<ApprovalsData>("/approvals", { params });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load approvals", err);
      toast.error(err instanceof Error ? err.message : "تعذر تحميل بيانات مركز الاعتمادات");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  const loadDependencies = useCallback(async () => {
    if (!currentCompany?.id) return;
    try {
      const [brRes, dpRes] = await Promise.all([
        api.get<{ id: string; branch_name: string }[]>(`/companies/${currentCompany.id}/branches`),
        api.get<{ id: string; department_name: string }[]>(`/companies/${currentCompany.id}/departments`),
      ]);
      setBranches(brRes.data || []);
      setDepartments(dpRes.data || []);
      if ((brRes.data || []).length > 0) {
        setFormData((prev) => ({ ...prev, branch_id: brRes.data[0].id }));
      }
    } catch (err) {
      console.error("Failed to load branches/departments", err);
    }
  }, [currentCompany?.id]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals, currentCompany]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  const handleOpenDecision = (item: WorkflowItem, decision: "Approved" | "Rejected") => {
    setSelectedApproval(item);
    setDecisionType(decision);
    setDecisionNotes("");
    setDecisionModal(true);
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApproval) return;
    setSubmittingDecision(true);
    try {
      await api.post(`/approvals/${selectedApproval.id}/decide`, {
        decision: decisionType,
        notes: decisionNotes.trim() || undefined,
      });
      toast.success(
        decisionType === "Approved"
          ? "تم اعتماد الطلب وتحديث مسار العمل بنجاح!"
          : "تم رفض الطلب وتسجيل الملاحظات الفنية."
      );
      setDecisionModal(false);
      setSelectedApproval(null);
      void loadApprovals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تسجيل قرار الاعتماد");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingForm(true);
    try {
      await api.post("/approvals/purchase-requests", {
        request_number: formData.request_number,
        item_name: formData.item_name,
        category: formData.category,
        vendor_name: formData.vendor_name || null,
        branch_id: formData.branch_id || null,
        department_id: formData.department_id || null,
        quantity: Number(formData.quantity),
        unit_cost_sar: Number(formData.unit_cost_sar),
        justification: formData.justification || null,
      });
      toast.success("تم إنشاء طلب الشراء وإدراجه تلقائياً في قائمة الاعتمادات!");
      setFormData({
        request_number: `PR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        item_name: "",
        category: "Hardware",
        vendor_name: "",
        branch_id: branches[0]?.id || "",
        department_id: "",
        quantity: 1,
        unit_cost_sar: 0,
        justification: "",
      });
      setTab("approvals");
      void loadApprovals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء طلب الشراء");
    } finally {
      setSubmittingForm(false);
    }
  };

  const totalCostCalc = Number(formData.quantity || 1) * Number(formData.unit_cost_sar || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="مركز الاعتمادات وطلبات الخدمة (Approval Center)"
          description="إدارة ومتابعة قرارات الاعتماد لمسارات العمل، طلبات شراء الأجهزة وتراخيص البرمجيات والتكليفات الفنية"
          icon={<ShieldCheckIcon className="w-5 h-5 text-[#187A5A]" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTab("approvals")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tab === "approvals" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  مسارات الاعتماد ({data?.kpis.total_approvals || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("purchases")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tab === "purchases" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  طلبات الشراء والتوريد ({data?.kpis.total_purchase_requests || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tab === "create" ? "bg-[#123D32] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  + طلب شراء جديد
                </button>
              </div>
            </div>
          }
        />

        {/* 5 KPI Summary Cards (Hidden on mobile) */}
        <div className="hidden lg:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">{data?.kpis.total_approvals ?? 0}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">إجمالي طلبات الاعتماد</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-amber-600">{data?.kpis.pending_approvals ?? 0}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">بانتظار الاعتماد</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Icons.Clock size={18} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#187A5A]">{data?.kpis.approved_count ?? 0}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">تم اعتمادها</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
              <Icons.CheckCircle size={18} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">{data?.kpis.total_purchase_requests ?? 0}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">طلبات الشراء المسجلة</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Icons.Assets size={18} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#C5A46D]">
                {(data?.kpis.pending_purchase_amount_sar ?? 0).toLocaleString()} <span className="text-xs font-normal text-slate-500">ر.س</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">مبالغ الشراء المعلقة</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#C5A46D]/15 text-[#8A6D3B] flex items-center justify-center shrink-0">
              <Icons.CreditCard size={18} />
            </div>
          </div>
        </div>

        {/* Tab 1: Workflow Approvals */}
        {tab === "approvals" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">سجل مسارات الاعتماد الفنية والإدارية</span>
                <span className="text-xs text-slate-500">({data?.approvals.length || 0} طلب)</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 bg-slate-50 outline-none"
                >
                  <option value="">جميع الحالات</option>
                  <option value="Pending">معلق (Pending)</option>
                  <option value="Approved">معتمد (Approved)</option>
                  <option value="Rejected">مرفوض (Rejected)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-4">
                <TableSkeleton variant="cards" rows={4} />
              </div>
            ) : !data?.approvals || data.approvals.length === 0 ? (
              <EmptyState
                icon={<ShieldCheckIcon className="w-8 h-8 text-slate-400" />}
                title="لا توجد طلبات اعتماد مسجلة حالياً"
                description="يتم إنشاء مسارات الاعتماد تلقائياً عند طلب شراء أجهزة جديدة، أو طلبات الصيانة الاستثنائية وتراخيص البرمجيات."
              />
            ) : (
              <>
                {/* Mobile Approvals Cards (Purpose-built for mobile, 1-tap decision buttons) */}
                <div className="block lg:hidden p-3 space-y-3">
                  {data.approvals.map((item) => (
                    <MobileApprovalCard
                      key={item.id}
                      item={item}
                      canApprove={data.can_approve}
                      onApprove={() => handleOpenDecision(item, "Approved")}
                      onReject={() => handleOpenDecision(item, "Rejected")}
                      onClick={() => {
                        setSelectedApproval(item);
                        setDecisionModal(true);
                      }}
                    />
                  ))}
                </div>

                {/* Desktop Approvals Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">عنوان الطلب / المسار</th>
                        <th className="py-3 px-4">النوع</th>
                        <th className="py-3 px-4">مقدم الطلب</th>
                        <th className="py-3 px-4">المبلغ المقدر</th>
                        <th className="py-3 px-4">الأولوية</th>
                        <th className="py-3 px-4">الحالة</th>
                        <th className="py-3 px-4">تاريخ التقديم</th>
                        <th className="py-3 px-4 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.approvals.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.title}</div>
                            {item.decision_notes && (
                              <div className="text-[11px] text-slate-500 mt-0.5">ملاحظات: {item.decision_notes}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">{item.workflow_type}</td>
                          <td className="py-3 px-4 font-medium text-slate-700">{item.initiator_name}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {item.amount_sar ? `${item.amount_sar.toLocaleString()} ر.س` : "—"}
                          </td>
                          <td className="py-3 px-4">
                            <PriorityBadge priority={item.priority} />
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={item.current_state} />
                          </td>
                          <td className="py-3 px-4 text-slate-500" dir="ltr">
                            {item.created_at?.slice(0, 10)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.current_state === "Pending" && data.can_approve ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDecision(item, "Approved")}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>اعتماد</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDecision(item, "Rejected")}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>رفض</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">
                                {item.current_state === "Approved" ? "معتمد" : item.current_state === "Rejected" ? "مرفوض" : "قيد المراجعة"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Purchase & Service Requests */}
        {tab === "purchases" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">كتالوج طلبات الشراء والتوريد الفني</h3>
                <p className="text-xs text-slate-500">طلبات الأجهزة، الملحقات، وتراخيص الأنظمة المسجلة بالشركة</p>
              </div>
              <button
                type="button"
                onClick={() => setTab("create")}
                className="px-3.5 py-1.5 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                + إنشاء طلب جديد
              </button>
            </div>

            {loading ? (
              <div className="p-4">
                <TableSkeleton variant="table" rows={4} />
              </div>
            ) : !data?.purchase_requests || data.purchase_requests.length === 0 ? (
              <EmptyState
                icon={<Icons.Assets size={28} className="text-slate-400" />}
                title="لا توجد طلبات شراء مسجلة"
                description="يمكنك تسجيل أول طلب شراء أو توريد عتاد وتقنية للموظفين والأقسام."
                action={
                  <button
                    type="button"
                    onClick={() => setTab("create")}
                    className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold text-xs"
                  >
                    تقديم طلب شراء
                  </button>
                }
              />
            ) : (
              <>
                {/* Mobile Purchase Cards */}
                <div className="block lg:hidden p-3 space-y-3">
                  {data.purchase_requests.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-4 shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg">
                          #{p.request_number}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {p.item_name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                            {p.category}
                          </span>
                          {p.vendor_name && <span>المورد: {p.vendor_name}</span>}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                        <div className="font-mono text-slate-600 dark:text-slate-300">
                          {p.quantity} × {p.unit_cost_sar.toLocaleString()} ر.س
                        </div>
                        <div className="font-mono font-black text-xs text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md">
                          {p.total_cost_sar.toLocaleString()} ر.س
                        </div>
                      </div>

                      <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{p.requester_name} ({p.department_name})</span>
                        <span dir="ltr">{p.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Purchases Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">رقم الطلب</th>
                      <th className="py-3 px-4">الصنف / الجهاز</th>
                      <th className="py-3 px-4">التصنيف</th>
                      <th className="py-3 px-4">المورد المقترح</th>
                      <th className="py-3 px-4">الكمية</th>
                      <th className="py-3 px-4">سعر الوحدة</th>
                      <th className="py-3 px-4">الإجمالي (ر.س)</th>
                      <th className="py-3 px-4">مقدم الطلب</th>
                      <th className="py-3 px-4">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.purchase_requests.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#187A5A]">{p.request_number}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{p.item_name}</div>
                          {p.justification && (
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">{p.justification}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{p.category}</td>
                        <td className="py-3 px-4 text-slate-600">{p.vendor_name || "—"}</td>
                        <td className="py-3 px-4 font-mono font-semibold">{p.quantity}</td>
                        <td className="py-3 px-4 font-mono">{p.unit_cost_sar.toLocaleString()} ر.س</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {p.total_cost_sar.toLocaleString()} ر.س
                        </td>
                        <td className="py-3 px-4 text-slate-700">{p.requester_name}</td>
                        <td className="py-3 px-4">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* Tab 3: Create New Procurement Request */}
        {tab === "create" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 max-w-3xl mx-auto">
            <div className="mb-5 border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">تقديم طلب شراء وتوريد فني جديد</h3>
              <p className="text-xs text-slate-500 mt-1">
                سيتم إدراج الطلب تلقائياً في دورة الاعتماد وإرساله للمسؤولين الماليين والتقنيين للموافقة.
              </p>
            </div>

            <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    رقم الطلب <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.request_number}
                    onChange={(e) => setFormData({ ...formData, request_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs outline-none focus:border-[#187A5A]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تصنيف الصنف <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  >
                    <option value="Hardware">أجهزة وعتاد (Hardware)</option>
                    <option value="Software">تراخيص برمجيات (Software)</option>
                    <option value="Access">صلاحيات ووصول سحابي (Access)</option>
                    <option value="Maintenance">قطع غيار وصيانة (Maintenance)</option>
                    <option value="Network">معدات شبكات واتصالات (Network)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اسم الصنف / الجهاز المطلوب <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: لابتوب Dell Latitude 5540، شاشة 27 بوصة، ترخيص Zoom Enterprise..."
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المورد المقترح (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: جرير، إكسترا، عصر الجوال..."
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الكمية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    سعر الوحدة المقدر (ر.س) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.unit_cost_sar}
                    onChange={(e) => setFormData({ ...formData, unit_cost_sar: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرع المستفيد</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  >
                    <option value="">-- اختياري --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الإدارة / القسم</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                  >
                    <option value="">-- اختياري --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.department_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">مبررات الشروع والاحتياج العملي</label>
                <textarea
                  rows={3}
                  placeholder="بيان سبب طلب الشراء، الموظفين المستفيدين، أو المشروع المرتبط..."
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                />
              </div>

              {/* Total Summary Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="font-bold text-slate-700">التكلفة التقديرية الإجمالية:</span>
                <span className="font-mono text-base font-black text-[#187A5A]">
                  {totalCostCalc.toLocaleString()} ر.س
                </span>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTab("approvals")}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="px-6 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingForm ? "جاري الإرسال..." : "إرسال طلب الشراء للاعتماد"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal: Approval Decision */}
        <Modal
          isOpen={decisionModal}
          onClose={() => setDecisionModal(false)}
          title={decisionType === "Approved" ? "تأكيد اعتماد الطلب" : "رفض طلب الاعتماد"}
          maxWidth="max-w-md"
        >
          {selectedApproval && (
            <form onSubmit={handleConfirmDecision} className="space-y-4 text-xs">
              <div className={`p-3.5 rounded-xl border ${
                decisionType === "Approved" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
              }`}>
                <div className="font-bold text-sm mb-1">{selectedApproval.title}</div>
                <div>مقدم الطلب: {selectedApproval.initiator_name}</div>
                {selectedApproval.amount_sar && (
                  <div className="font-mono mt-1 font-bold">المبلغ: {selectedApproval.amount_sar.toLocaleString()} ر.س</div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ملاحظات وتوجيهات الاعتماد {decisionType === "Rejected" && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  required={decisionType === "Rejected"}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder={
                    decisionType === "Approved"
                      ? "ملاحظات الاعتماد والموافقة الفنية (اختياري)..."
                      : "يرجى ذكر سبب الرفض أو التعديلات المطلوبة (إلزامي)..."
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDecisionModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingDecision}
                  className={`px-5 py-2 text-white rounded-xl font-bold shadow-xs cursor-pointer disabled:opacity-50 ${
                    decisionType === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {submittingDecision ? "جاري التسجيل..." : decisionType === "Approved" ? "تأكيد الاعتماد" : "تأكيد الرفض"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
