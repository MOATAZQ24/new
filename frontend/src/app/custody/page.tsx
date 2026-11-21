"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface CustodyRecordRow {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  serial_number?: string;
  employee_name: string;
  employee_number: string;
  assignment_date: string;
  actual_return_date?: string | null;
  condition_on_assignment?: string;
  status: string;
}

interface CustodyAssetOption {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
}

interface CustodyEmployeeOption {
  id: string;
  full_name: string;
  employee_number: string;
  job_title?: string | null;
}

interface CustodyReceiptData {
  receipt_number: string;
  company_name_ar: string;
  assignment_date: string;
  employee_name: string;
  employee_number: string;
  department?: string;
  job_title?: string;
  asset_name: string;
  asset_code: string;
  asset_type?: string;
  brand?: string;
  serial_number?: string;
  condition_on_assignment: string;
  declaration_text: string;
}

export default function CustodyPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<CustodyRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Active");

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<CustodyAssetOption[]>([]);
  const [employees, setEmployees] = useState<CustodyEmployeeOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [assignCondition, setAssignCondition] = useState("Good");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  // Return modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CustodyRecordRow | null>(null);
  const [returnCondition, setReturnCondition] = useState("Good");
  const [returnNotes, setReturnNotes] = useState("");

  // Receipt modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<CustodyReceiptData | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let url = "/custody";
      if (statusFilter) url += `?status=${statusFilter}`;
      const res = await api.get<CustodyRecordRow[]>(url);
      setRecords(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchRecords();
    }, 0);
    return () => window.clearTimeout(t);
  }, [statusFilter, activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAssignModal = async () => {
    try {
      const [astRes, empRes] = await Promise.all([
        api.get<CustodyAssetOption[]>("/assets?status=Available"),
        api.get<CustodyEmployeeOption[]>("/employees?status=Active"),
      ]);
      setAvailableAssets(astRes.data || []);
      setEmployees(empRes.data || []);
      setShowAssignModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/custody/assign", {
        asset_id: selectedAssetId,
        employee_id: selectedEmployeeId,
        condition_on_assignment: assignCondition,
        expected_return_date: expectedReturn || undefined,
        notes: assignNotes,
        acknowledgment: true,
      });
      setShowAssignModal(false);
      fetchRecords();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تسليم العهدة");
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    try {
      await api.post(`/custody/return/${selectedRecord.id}`, {
        condition_on_return: returnCondition,
        notes: returnNotes,
      });
      setShowReturnModal(false);
      fetchRecords();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل استرجاع العهدة");
    }
  };

  const openReceipt = async (recordId: string) => {
    try {
      const res = await api.get<CustodyReceiptData>(`/custody/receipt/${recordId}`);
      setReceiptData(res.data);
      setShowReceiptModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل سند التسليم");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <PageHeader
        title="عهدة الأصول والتسليم (Asset Custody & Handover)"
        description="إدارة تسليم العهد للموظفين، وتوليد السندات، وتتبع الإرجاع والنقل"
        icon={<Icons.Custody size={20} />}
        actions={
          <button
            type="button"
            onClick={openAssignModal}
            className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={16} />
            <span>تسليم عهدة جديدة</span>
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["Active", "Returned", "Transferred", ""].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`motion-control px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? "bg-[#187A5A] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {st === "Active"
                ? "العهد النشطة"
                : st === "Returned"
                ? "العهد المسترجعة"
                : st === "Transferred"
                ? "العهد المنقولة"
                : "جميع السجلات"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={fetchRecords}
          disabled={loading}
          aria-label="تحديث سجل العهد"
          title="تحديث البيانات"
          className="motion-control p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
        >
          <Icons.Refresh size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Custody Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={6} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Icons.Custody size={26} />}
            title="لا توجد سجلات عهد مطابقة"
            description="يمكنك تغيير حالة العهدة أو تسليم عهدة تقنية جديدة الآن"
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="p-3.5">الأصل التقني</th>
                <th className="p-3.5">الموظف المستلم</th>
                <th className="p-3.5">تاريخ التسليم</th>
                <th className="p-3.5">الحالة عند التسليم</th>
                <th className="p-3.5">حالة العهدة</th>
                <th className="p-3.5">تاريخ الإرجاع</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">
                    <div>{r.asset_name}</div>
                    <div className="text-[11px] font-mono text-[#187A5A] font-semibold">
                      <bdi dir="ltr">{r.asset_code}</bdi>
                    </div>
                  </td>
                  <td className="p-3.5 font-bold text-slate-800">
                    {r.employee_name}
                  </td>
                  <td className="p-3.5 text-slate-700 font-mono">
                    <bdi dir="ltr">{new Date(r.assignment_date).toLocaleDateString("ar-SA")}</bdi>
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {r.condition_on_assignment}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3.5 text-slate-600 font-mono">
                    <bdi dir="ltr">
                    {r.actual_return_date
                      ? new Date(r.actual_return_date).toLocaleDateString("ar-SA")
                      : "-"}
                    </bdi>
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openReceipt(r.id)}
                        className="motion-control px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] cursor-pointer"
                      >
                        سند الاستلام
                      </button>

                      {r.status === "Active" && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecord(r);
                            setShowReturnModal(true);
                          }}
                          className="motion-control px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold text-[11px] cursor-pointer"
                        >
                          إرجاع العهدة
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="تسليم عهدة أصل تقني لموظف"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختر الأصل المتاح للتسليم *
            </label>
            <select
              required
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">-- حدد الأصل التقني --</option>
              {availableAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_name} ({a.asset_code}) - {a.asset_type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختر الموظف المستلم *
            </label>
            <select
              required
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">-- حدد الموظف --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_number}) - {e.job_title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الأصل عند التسليم
              </label>
              <select
                value={assignCondition}
                onChange={(e) => setAssignCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاريخ الإرجاع المتوقع
              </label>
              <input
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات أو ملحقات مسلّمة (شاحن، حقيبة، ماوس)
            </label>
            <textarea
              rows={2}
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="مثال: تم تسليم الشاحن الأصلي وحقيبة لابتوب..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
            * سيتم تغيير حالة الأصل تلقائياً إلى &laquo;Assigned&raquo; وحفظ حركة التسليم في السجل التاريخي.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              تأكيد التسليم
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title={`استرجاع الأصل: ${selectedRecord?.asset_name || ""}`}
      >
        <form onSubmit={handleReturn} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              حالة الأصل عند الإرجاع والتقييم الفني *
            </label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="Excellent">ممتاز (Excellent)</option>
              <option value="Good">جيد (Good)</option>
              <option value="Fair">مقبول (Fair)</option>
              <option value="Damaged">تالف أو يحتاج صيانة (Damaged)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات الفحص الفني
            </label>
            <textarea
              rows={3}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="تم فحص الشاشة ولوحة المفاتيح والملحقات..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              تأكيد استرجاع الأصل للمستودع
            </button>
          </div>
        </form>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="سند تسليم عهدة أصل تقني (Handover Receipt)"
        maxWidth="max-w-xl"
      >
        {receiptData && (
          <div className="space-y-5 p-2" id="printable-receipt">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#123D32]">
              <div>
                <h3 className="text-base font-bold text-[#123D32]">
                  {receiptData.company_name_ar}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {receiptData.receipt_number}
                </p>
              </div>
              <div className="text-left text-xs font-mono text-slate-500">
                {receiptData.assignment_date}
              </div>
            </div>

            {/* Employee Info */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-400">اسم الموظف المستلم:</span>{" "}
                <span className="font-bold text-slate-900">{receiptData.employee_name}</span>{" "}
                ({receiptData.employee_number})
              </div>
              <div>
                <span className="text-slate-400">المسمى والقسم:</span>{" "}
                <span>
                  {receiptData.job_title} • {receiptData.department || "-"}
                </span>
              </div>
            </div>

            {/* Asset Info */}
            <div className="border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
              <div className="font-bold text-slate-900 text-sm">{receiptData.asset_name}</div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>كود الأصل: <span className="font-mono font-bold text-[#187A5A]">{receiptData.asset_code}</span></div>
                <div>النوع: {receiptData.asset_type}</div>
                <div>الماركة: {receiptData.brand}</div>
                <div>الرقم التسلسلي: <span className="font-mono">{receiptData.serial_number || "-"}</span></div>
              </div>
              <div className="pt-1 text-slate-500">
                حالة الأصل عند الاستلام: <span className="font-bold">{receiptData.condition_on_assignment}</span>
              </div>
            </div>

            {/* Legal Declaration */}
            <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl text-[11px] text-slate-700 leading-relaxed text-justify">
              {receiptData.declaration_text}
            </div>

            {/* Signatures */}
            <div className="pt-6 grid grid-cols-2 gap-6 text-xs text-center border-t border-slate-200">
              <div>
                <div className="text-slate-400">توقيع مسؤول تقنية المعلومات:</div>
                <div className="mt-8 font-bold">إدارة تقنية المعلومات</div>
              </div>
              <div>
                <div className="text-slate-400">توقيع الموظف المستلم:</div>
                <div className="mt-8 font-bold">{receiptData.employee_name}</div>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold mt-4"
            >
              طباعة السند الرسمي
            </button>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
