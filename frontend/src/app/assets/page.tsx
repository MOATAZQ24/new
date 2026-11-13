"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AssetsPage() {
  const { activeCompanyId, user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Handover (Assign Custody) Modal
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [handoverEmployeeId, setHandoverEmployeeId] = useState("");
  const [handoverCondition, setHandoverCondition] = useState("Good");
  const [handoverExpectedReturn, setHandoverExpectedReturn] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");

  // Return Custody Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [activeCustodyId, setActiveCustodyId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState("Good");
  const [returnNotes, setReturnNotes] = useState("");

  // Custody Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  // New Asset Form
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("Laptop");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState("Good");
  const [statusVal, setStatusVal] = useState("Available");
  const [notes, setNotes] = useState("");

  // Edit Asset Form
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("Laptop");
  const [editBrand, setEditBrand] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editCondition, setEditCondition] = useState("Good");
  const [editStatus, setEditStatus] = useState("Available");
  const [editNotes, setEditNotes] = useState("");

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager") || user?.roles?.includes("IT Technician");

  const fetchAssets = async () => {
    setLoading(true);
    try {
      let url = `/assets?search=${encodeURIComponent(search)}`;
      if (typeFilter) url += `&asset_type=${typeFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await api.get(url);
      setAssets(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [typeFilter, statusFilter, activeCompanyId]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSerial(text);
    setTimeout(() => setCopiedSerial(null), 2000);
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/assets", {
        company_id: activeCompanyId,
        asset_code: assetCode,
        asset_name: assetName,
        asset_type: assetType,
        brand,
        model,
        serial_number: serial,
        condition,
        status: statusVal,
        notes,
      });
      setShowAddModal(false);
      setAssetCode("");
      setAssetName("");
      setBrand("");
      setModel("");
      setSerial("");
      setNotes("");
      fetchAssets();
    } catch (err: any) {
      alert(err?.message || "فشل إضافة الأصل");
    }
  };

  const openEditAsset = (ast: any) => {
    setEditId(ast.id);
    setEditName(ast.asset_name);
    setEditType(ast.asset_type);
    setEditBrand(ast.brand || "");
    setEditModel(ast.model || "");
    setEditSerial(ast.serial_number || "");
    setEditCondition(ast.condition || "Good");
    setEditStatus(ast.status || "Available");
    setEditNotes(ast.notes || "");
    setShowEditModal(true);
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/assets/${editId}`, {
        asset_name: editName,
        asset_type: editType,
        brand: editBrand,
        model: editModel,
        serial_number: editSerial,
        condition: editCondition,
        status: editStatus,
        notes: editNotes,
      });
      setShowEditModal(false);
      fetchAssets();
    } catch (err: any) {
      alert(err?.message || "فشل تحديث بيانات الأصل");
    }
  };

  const handleDeleteAsset = async (assetId: string, code: string) => {
    if (!confirm(`هل أنت متأكد من حذف الأصل "${code}" نهائياً من النظام؟`)) return;
    try {
      await api.delete(`/assets/${assetId}`);
      fetchAssets();
    } catch (err: any) {
      alert(err?.message || "فشل حذف الأصل");
    }
  };

  const openAssetDetails = async (ast: any) => {
    try {
      const res = await api.get(`/assets/${ast.id}`);
      setSelectedAsset(res.data);
      setShowHistoryModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Open Handover (Assign Custody)
  const openHandover = async (ast: any) => {
    setSelectedAsset(ast);
    try {
      const empRes = await api.get("/employees?status=Active");
      setEmployees(empRes.data || []);
      setHandoverEmployeeId(empRes.data && empRes.data.length > 0 ? empRes.data[0].id : "");
      setHandoverCondition(ast.condition || "Good");
      setHandoverExpectedReturn("");
      setHandoverNotes("");
      setShowHandoverModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !handoverEmployeeId) return;
    try {
      await api.post("/custody/assign", {
        asset_id: selectedAsset.id,
        employee_id: handoverEmployeeId,
        condition_on_assignment: handoverCondition,
        expected_return_date: handoverExpectedReturn || undefined,
        notes: handoverNotes,
        acknowledgment: true,
      });
      setShowHandoverModal(false);
      fetchAssets();
    } catch (err: any) {
      alert(err?.message || "فشل تسليم العهدة");
    }
  };

  // Open Return Custody
  const openReturn = async (ast: any) => {
    setSelectedAsset(ast);
    try {
      const detailRes = await api.get(`/assets/${ast.id}`);
      const activeC = detailRes.data?.custody_history?.find((c: any) => c.status === "Active");
      if (activeC) {
        setActiveCustodyId(activeC.id);
        setReturnCondition(ast.condition || "Good");
        setReturnNotes("");
        setShowReturnModal(true);
      } else {
        alert("لم يتم العثور على سجل عهدة نشط لهذا الأصل");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustodyId) return;
    try {
      await api.post(`/custody/return/${activeCustodyId}`, {
        condition_on_return: returnCondition,
        notes: returnNotes,
      });
      setShowReturnModal(false);
      fetchAssets();
    } catch (err: any) {
      alert(err?.message || "فشل استرجاع العهدة");
    }
  };

  const openReceipt = async (custodyId: string) => {
    try {
      const res = await api.get(`/custody/receipt/${custodyId}`);
      setReceiptData(res.data);
      setShowReceiptModal(true);
    } catch (err: any) {
      alert(err?.message || "فشل تحميل سند التسليم");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            سجل الأصول والعهد التقنية (Technical Assets & Custody)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة وتتبع الأجهزة والمعدات، تسليم واسترجاع العهد، وطباعة ملصقات QR والسندات القانونية
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={16} />
            <span>تسجيل أصل جديد</span>
          </button>
        )}
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Icons.Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="بحث بالكود، الاسم، السيريال..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAssets()}
              className="w-full bg-slate-50 border border-slate-200 text-xs py-2 pr-9 pl-3 rounded-xl outline-none focus:border-[#187A5A]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none text-slate-700"
          >
            <option value="">جميع أنواع الأصول</option>
            <option value="Laptop">أجهزة لابتوب (Laptop)</option>
            <option value="Desktop">أجهزة مكتبية (Desktop)</option>
            <option value="Monitor">شاشات (Monitor)</option>
            <option value="Mobile Phone">هواتف ذكية (Mobile Phone)</option>
            <option value="Tablet">أجهزة لوحية (Tablet)</option>
            <option value="Printer">طابعات (Printer)</option>
            <option value="Other">أخرى (Other)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none text-slate-700"
          >
            <option value="">جميع الحالات</option>
            <option value="Available">متاح للتسليم (Available)</option>
            <option value="Assigned">مسلّم كعهدة (Assigned)</option>
            <option value="Under Maintenance">تحت الصيانة (Under Maintenance)</option>
            <option value="Damaged">تالف (Damaged)</option>
            <option value="Retired">متقاعد (Retired)</option>
          </select>
        </div>

        <button
          onClick={fetchAssets}
          className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer"
          title="تحديث البيانات"
        >
          <Icons.Refresh size={16} />
        </button>
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
              <tr>
                <th className="p-3.5">كود الأصل</th>
                <th className="p-3.5">اسم وموديل الأصل</th>
                <th className="p-3.5">النوع</th>
                <th className="p-3.5">الرقم التسلسلي (S/N)</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">الموظف المعين له</th>
                <th className="p-3.5 text-center">رمز QR</th>
                <th className="p-3.5 text-center">إجراء العهدة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((ast) => (
                <tr key={ast.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-[#187A5A]">
                    {ast.asset_code}
                  </td>
                  <td className="p-3.5 font-bold text-slate-800">
                    <div>{ast.asset_name}</div>
                    <div className="text-[11px] text-slate-400 font-normal">
                      {ast.brand} {ast.model}
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-600">{ast.asset_type}</td>
                  <td className="p-3.5 font-mono text-slate-600">
                    {ast.serial_number ? (
                      <div className="flex items-center gap-1.5">
                        <span>{ast.serial_number}</span>
                        <button
                          onClick={() => copyToClipboard(ast.serial_number)}
                          className="text-slate-400 hover:text-slate-800 p-0.5 cursor-pointer"
                          title="نسخ الرقم التسلسلي"
                        >
                          {copiedSerial === ast.serial_number ? (
                            <span className="text-emerald-600 text-[10px] font-sans font-bold">تم النسخ!</span>
                          ) : (
                            <Icons.FileText size={13} />
                          )}
                        </button>
                      </div>
                    ) : "-"}
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={ast.status} />
                  </td>
                  <td className="p-3.5 font-semibold text-slate-700">
                    {ast.assigned_employee_name ? (
                      <span className="text-blue-700">{ast.assigned_employee_name}</span>
                    ) : (
                      <span className="text-slate-400 font-normal">غير معين (في المستودع)</span>
                    )}
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => {
                        setSelectedAsset(ast);
                        setShowQRModal(true);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] cursor-pointer"
                      title="عرض وطباعة QR"
                    >
                      <Icons.Dashboard size={14} />
                    </button>
                  </td>
                  <td className="p-3.5 text-center">
                    {canManage && (
                      ast.status === "Available" ? (
                        <button
                          onClick={() => openHandover(ast)}
                          className="px-2.5 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          تسليم كعهدة
                        </button>
                      ) : ast.status === "Assigned" ? (
                        <button
                          onClick={() => openReturn(ast)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          استرجاع العهدة
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )
                    )}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openAssetDetails(ast)}
                        className="px-2 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] cursor-pointer"
                      >
                        السجل
                      </button>
                      {canManage && (
                        <>
                          <button
                            onClick={() => openEditAsset(ast)}
                            className="p-1 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                            title="تعديل بيانات الأصل"
                          >
                            <Icons.Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(ast.id, ast.asset_code)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="حذف الأصل"
                          >
                            <Icons.Trash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Asset Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل أصل تقني جديد"
      >
        <form onSubmit={handleCreateAsset} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كود الأصل الداخلي *
              </label>
              <input
                type="text"
                required
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                placeholder="AST-IGT-LAP-005"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم الأصل *
              </label>
              <input
                type="text"
                required
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="مثال: MacBook Pro 14"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الأصل *
              </label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Laptop">لابتوب (Laptop)</option>
                <option value="Desktop">حاسب مكتبي (Desktop)</option>
                <option value="Monitor">شاشة (Monitor)</option>
                <option value="Mobile Phone">هاتف ذكي (Mobile Phone)</option>
                <option value="Tablet">تابلت (Tablet)</option>
                <option value="Printer">طابعة (Printer)</option>
                <option value="Other">معدات أخرى (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشركة المصنعة (Brand)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Apple / Dell / Lenovo"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الموديل والمواصفات
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="M3 Pro / 18GB / 512GB"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الرقم التسلسلي (Serial Number)
              </label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="SN-12345678"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الجهاز
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
                <option value="Poor">رديء (Poor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة التوفر
              </label>
              <select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Available">متاح للتسليم (Available)</option>
                <option value="Under Maintenance">تحت الصيانة</option>
                <option value="Damaged">تالف</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات إضافية
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل أو ملحقات إضافية..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ الأصل وتوليد QR
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Asset Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات الأصل التقني"
      >
        <form onSubmit={handleUpdateAsset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الأصل *
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الأصل *
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Laptop">لابتوب (Laptop)</option>
                <option value="Desktop">حاسب مكتبي (Desktop)</option>
                <option value="Monitor">شاشة (Monitor)</option>
                <option value="Mobile Phone">هاتف ذكي (Mobile Phone)</option>
                <option value="Tablet">تابلت (Tablet)</option>
                <option value="Printer">طابعة (Printer)</option>
                <option value="Other">معدات أخرى (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشركة المصنعة (Brand)
              </label>
              <input
                type="text"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الموديل
              </label>
              <input
                type="text"
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الرقم التسلسلي (S/N)
              </label>
              <input
                type="text"
                value={editSerial}
                onChange={(e) => setEditSerial(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الجهاز
              </label>
              <select
                value={editCondition}
                onChange={(e) => setEditCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
                <option value="Poor">رديء (Poor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحالة العامة
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Available">متاح (Available)</option>
                <option value="Assigned">مسلّم كعهدة (Assigned)</option>
                <option value="Under Maintenance">تحت الصيانة</option>
                <option value="Damaged">تالف</option>
                <option value="Retired">متقاعد</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ التعديل
            </button>
          </div>
        </form>
      </Modal>

      {/* Handover Modal (Assign Custody) */}
      <Modal
        isOpen={showHandoverModal}
        onClose={() => setShowHandoverModal(false)}
        title={`تسليم الأصل كعهدة: ${selectedAsset?.asset_name || ""} (${selectedAsset?.asset_code || ""})`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleHandoverSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختيار الموظف المستلم للعهدة *
            </label>
            <select
              required
              value={handoverEmployeeId}
              onChange={(e) => setHandoverEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">اختر الموظف...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_number}) - {emp.job_title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الأصل عند التسليم *
              </label>
              <select
                value={handoverCondition}
                onChange={(e) => setHandoverCondition(e.target.value)}
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
                value={handoverExpectedReturn}
                onChange={(e) => setHandoverExpectedReturn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات وملحقات التسليم
            </label>
            <textarea
              rows={2}
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="مثال: تم تسليم الشاحن وحقيبة الجهاز والماوس..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
            بتأكيد التسليم يتم تحويل حالة الأصل تلقائياً إلى "مسلّم كعهدة" وتوثيق سند الاستلام القانوني.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowHandoverModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              تأكيد التسليم وتوليد السند
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Custody Modal */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title={`استرجاع العهدة إلى المستودع: ${selectedAsset?.asset_name || ""}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              حالة الأصل عند الإرجاع *
            </label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="Excellent">ممتاز (Excellent)</option>
              <option value="Good">جيد (Good)</option>
              <option value="Fair">مقبول (Fair)</option>
              <option value="Damaged">تالف / يحتاج صيانة (Damaged)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات فحص الإرجاع
            </label>
            <textarea
              rows={3}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="فحص سلامة الشاشة، لوحة المفاتيح، الملحقات..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800">
            سيتم إنهاء العهدة الحالية وتحويل الأصل تلقائياً إلى حالة "متاح" في المستودع.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              تأكيد الاسترجاع
            </button>
          </div>
        </form>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        title={`رمز الاستجابة السريعة (QR): ${selectedAsset?.asset_code || ""}`}
        maxWidth="max-w-sm"
      >
        <div className="text-center p-4 space-y-4">
          <div className="flex justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            {selectedAsset?.qr_code_data ? (
              <img
                src={selectedAsset.qr_code_data}
                alt="QR Code"
                className="w-48 h-48 rounded-lg shadow-xs"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                لا يتوفر QR
              </div>
            )}
          </div>
          <div>
            <div className="font-bold text-sm text-slate-800">{selectedAsset?.asset_name}</div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">{selectedAsset?.asset_code}</div>
          </div>
          <button
            onClick={() => window.print()}
            className="w-full py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            طباعة ملصق الأصل (Label)
          </button>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`تفاصيل الأصل وسجل العهدة: ${selectedAsset?.asset_code || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">الاسم:</span>{" "}
              <span className="font-bold">{selectedAsset?.asset_name}</span>
            </div>
            <div>
              <span className="text-slate-400">النوع:</span>{" "}
              <span className="font-semibold">{selectedAsset?.asset_type}</span>
            </div>
            <div>
              <span className="text-slate-400">الماركة / الموديل:</span>{" "}
              <span>{selectedAsset?.brand} {selectedAsset?.model}</span>
            </div>
            <div>
              <span className="text-slate-400">الرقم التسلسلي:</span>{" "}
              <span className="font-mono">{selectedAsset?.serial_number || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الحالة العامة:</span>{" "}
              <StatusBadge status={selectedAsset?.status || "Available"} />
            </div>
            <div>
              <span className="text-slate-400">حالة العتاد:</span>{" "}
              <span className="font-semibold">{selectedAsset?.condition}</span>
            </div>
          </div>

          <h4 className="text-xs font-bold text-slate-800 pt-2 flex items-center gap-2">
            <Icons.Custody size={16} className="text-[#187A5A]" />
            <span>سجل تسليم وإرجاع العهدة ({selectedAsset?.custody_history?.length || 0})</span>
          </h4>

          {selectedAsset?.custody_history?.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {selectedAsset.custody_history.map((h: any) => (
                <div
                  key={h.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800">{h.employee_name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      تاريخ التسليم: {new Date(h.assignment_date).toLocaleDateString("ar-SA")}{" "}
                      {h.actual_return_date && (
                        <span>• تاريخ الإرجاع: {new Date(h.actual_return_date).toLocaleDateString("ar-SA")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={h.status} />
                    <button
                      onClick={() => openReceipt(h.id)}
                      className="px-2 py-0.5 border border-slate-200 hover:border-[#187A5A] text-slate-700 text-[10px] rounded cursor-pointer"
                    >
                      عرض السند
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-xl">
              لم يتم تسليم هذا الأصل لأي موظف حتى الآن
            </p>
          )}
        </div>
      </Modal>

      {/* Legal Receipt Modal */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="سند تسليم واستلام عهدة تقنية (رسمي)"
        maxWidth="max-w-lg"
      >
        <div className="p-4 space-y-4 text-xs">
          <div className="text-center border-b border-slate-200 pb-3">
            <h3 className="font-black text-sm text-[#123D32]">إقرار استلام عهدة تقنية</h3>
            <p className="text-slate-400 text-[11px] mt-0.5">سند رسمي موثق إلكترونياً</p>
          </div>

          {receiptData && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الموظف المستلم:</span>
                <span className="font-bold text-slate-900">{receiptData.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم الوظيفي:</span>
                <span className="font-mono">{receiptData.employee_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الأصل:</span>
                <span className="font-bold text-slate-900">{receiptData.asset_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">كود الأصل:</span>
                <span className="font-mono font-bold text-[#187A5A]">{receiptData.asset_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم التسلسلي (S/N):</span>
                <span className="font-mono">{receiptData.serial_number || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ التسليم:</span>
                <span>{receiptData.assignment_date ? new Date(receiptData.assignment_date).toLocaleString("ar-SA") : "-"}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-slate-600 leading-relaxed text-[11px]">
                {receiptData.legal_text || "أقر أنا الموقع أعلاه باستلام الجهاز الموضح بياناته بحالة جيدة، وأتعهد بالمحافظة عليه واستخدامه في أغراض العمل وإعادته متى طُلب مني ذلك."}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              طباعة السند
            </button>
            <button
              onClick={() => setShowReceiptModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
