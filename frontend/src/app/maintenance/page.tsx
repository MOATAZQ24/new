"use client";

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

export default function MaintenancePage() {
  const { activeCompanyId, user } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // New Record Form
  const [actionType, setActionType] = useState("Configuration Change");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState("infrastructure");
  const [targetId, setTargetId] = useState("");
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [infraList, setInfraList] = useState<any[]>([]);
  const [changeReason, setChangeReason] = useState("");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [windowTime, setWindowTime] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [cost, setCost] = useState("0");

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let url = "/maintenance?";
      if (actionFilter) url += `action_type=${actionFilter}&`;
      if (statusFilter) url += `status=${statusFilter}&`;
      const res = await api.get(url);
      setRecords(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [actionFilter, statusFilter, activeCompanyId]);

  const openAddModal = async () => {
    try {
      const [aRes, iRes] = await Promise.all([
        api.get("/assets"),
        api.get("/infrastructure"),
      ]);
      setAssetsList(aRes.data || []);
      setInfraList(iRes.data || []);
      setShowAddModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/maintenance", {
        company_id: activeCompanyId,
        action_type: actionType,
        target_type: targetType,
        target_id: targetId,
        title,
        description,
        change_reason: changeReason || undefined,
        risk_assessment: riskAssessment || undefined,
        planned_execution_window: windowTime || undefined,
        rollback_plan: rollbackPlan || undefined,
        cost: parseFloat(cost) || 0,
        status: actionType === "Configuration Change" ? "Pending Approval" : "Open",
        approval_status: actionType === "Configuration Change" ? "Pending" : "Not Required",
      });
      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setChangeReason("");
      setRiskAssessment("");
      setRollbackPlan("");
      fetchRecords();
    } catch (err: any) {
      toast.error(err?.message || "فشل تسجيل العملية");
    }
  };

  const handleApprove = async (recordId: string, decision: "Approved" | "Rejected") => {
    try {
      await api.post(`/maintenance/${recordId}/approve?decision=${decision}`);
      fetchRecords();
      if (showDetailModal) setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err?.message || "فشل تحديث حالة الاعتماد");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            الصيانة والاستبدال وإدارة التغييرات (Maintenance & Changes)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            توثيق الصيانة الفنية، استبدال الأجهزة، واعتماد تعديل إعدادات الشبكة والخوادم
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Icons.Plus size={16} />
          <span>طلب صيانة / تغيير جديد</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["", "Configuration Change", "Maintenance", "Replacement"].map((act) => (
            <button
              key={act}
              type="button"
              onClick={() => setActionFilter(act)}
              className={`motion-control px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                actionFilter === act
                  ? "bg-[#187A5A] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {act === ""
                ? "جميع الإجراءات"
                : act === "Configuration Change"
                ? "تغيير إعدادات (Config Change)"
                : act === "Maintenance"
                ? "صيانة وإصلاح (Maintenance)"
                : "استبدال جهاز (Replacement)"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={fetchRecords}
          disabled={loading}
          aria-label="تحديث سجل الصيانة"
          title="تحديث البيانات"
          className="motion-control p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
        >
          <Icons.Refresh size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={6} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Icons.Maintenance size={26} />}
            title="لا توجد طلبات صيانة أو تغيير مطابقة"
            description="يمكنك تغيير تصنيف الإجراء أو تسجيل طلب صيانة أو تغيير إعدادات جديد"
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="p-3.5">عنوان الإجراء</th>
                <th className="p-3.5">النوع</th>
                <th className="p-3.5">الهدف المتأثر</th>
                <th className="p-3.5">حالة الاعتماد</th>
                <th className="p-3.5">الحالة التشغيلية</th>
                <th className="p-3.5">الفني المسؤول</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">
                    <div>{r.title}</div>
                    <div className="text-[11px] text-slate-600 font-normal line-clamp-1">
                      {r.description || "-"}
                    </div>
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700">
                      {r.action_type}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-800 font-medium">
                    {r.target_name || `${r.target_type}`}
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={r.approval_status} />
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3.5 text-slate-700 font-semibold">
                    {r.assigned_technician_name || "غير محدد"}
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecord(r);
                        setShowDetailModal(true);
                      }}
                      className="motion-control px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] cursor-pointer"
                    >
                      عرض وتقييم المخاطر
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل صيانة أو تغيير إعدادات"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الإجراء التشغيلي *
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Configuration Change">تعديل إعدادات (Configuration Change)</option>
                <option value="Maintenance">صيانة وإصلاح (Maintenance)</option>
                <option value="Replacement">استبدال جهاز (Replacement)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الهدف المتأثر *
              </label>
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  setTargetId("");
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="infrastructure">جهاز بنية تحتية (خادم، راوتر، جدار حماية)</option>
                <option value="asset">أصل تقني (لابتوب، طابعة، شاشة)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختر الجهاز أو الأصل المتأثر *
            </label>
            <select
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">-- اختر من القائمة --</option>
              {targetType === "infrastructure"
                ? infraList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.device_name} ({i.device_type}) - IP: {i.management_ip}
                    </option>
                  ))
                : assetsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.asset_name} ({a.asset_code}) - {a.asset_type}
                    </option>
                  ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان الإجراء أو التغيير *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تعديل قواعد Firewall لعزل خوادم الدفع"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الوصف الفني والتفاصيل
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="شرح خطوات التغيير والإعدادات المعدلة..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          {actionType === "Configuration Change" && (
            <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <h4 className="text-xs font-bold text-slate-800">
                بيانات خطة التغيير وتقييم المخاطر (Change Management)
              </h4>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  سبب التغيير (Change Reason)
                </label>
                <input
                  type="text"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="سد ثغرة أمنية أو تحسين أداء..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    تقييم المخاطر (Risk Assessment)
                  </label>
                  <input
                    type="text"
                    value={riskAssessment}
                    onChange={(e) => setRiskAssessment(e.target.value)}
                    placeholder="مخاطر انقطاع مؤقت لخدمة..."
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    نافذة التنفيذ المخططة (Execution Window)
                  </label>
                  <input
                    type="text"
                    value={windowTime}
                    onChange={(e) => setWindowTime(e.target.value)}
                    placeholder="الجمعة 11:00م إلى 01:00ص"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  خطة التراجع في حال الفشل (Rollback Plan)
                </label>
                <textarea
                  rows={2}
                  value={rollbackPlan}
                  onChange={(e) => setRollbackPlan(e.target.value)}
                  placeholder="استعادة ملف الإعدادات الاحتياطي backup.cfg..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              تقديم الطلب
            </button>
          </div>
        </form>
      </Modal>

      {/* Details & Approval Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`تفاصيل الطلب: ${selectedRecord?.title || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-3">
            <div>
              <span className="text-slate-400">نوع الإجراء:</span>{" "}
              <span className="font-bold">{selectedRecord?.action_type}</span>
            </div>
            <div>
              <span className="text-slate-400">الهدف:</span>{" "}
              <span className="font-semibold">{selectedRecord?.target_name || selectedRecord?.target_type}</span>
            </div>
            <div>
              <span className="text-slate-400">حالة الاعتماد:</span>{" "}
              <StatusBadge status={selectedRecord?.approval_status || "Pending"} />
            </div>
            <div>
              <span className="text-slate-400">الحالة العامة:</span>{" "}
              <StatusBadge status={selectedRecord?.status || "Open"} />
            </div>
          </div>

          {selectedRecord?.change_reason && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div>
                <span className="font-bold text-slate-800">سبب التغيير:</span>
                <p className="text-slate-600 mt-0.5">{selectedRecord.change_reason}</p>
              </div>
              {selectedRecord?.risk_assessment && (
                <div>
                  <span className="font-bold text-amber-800">تقييم المخاطر:</span>
                  <p className="text-slate-600 mt-0.5">{selectedRecord.risk_assessment}</p>
                </div>
              )}
              {selectedRecord?.rollback_plan && (
                <div>
                  <span className="font-bold text-rose-800">خطة التراجع (Rollback):</span>
                  <p className="text-slate-600 mt-0.5">{selectedRecord.rollback_plan}</p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons for Managers / Super Admin */}
          {selectedRecord?.approval_status === "Pending" && (
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">هل ترغب في اعتماد هذا الإجراء؟</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(selectedRecord.id, "Rejected")}
                  className="px-4 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold"
                >
                  رفض
                </button>
                <button
                  onClick={() => handleApprove(selectedRecord.id, "Approved")}
                  className="px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold shadow-xs"
                >
                  اعتماد وتنفيذ
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
}
