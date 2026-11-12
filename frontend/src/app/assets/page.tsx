"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AssetsPage() {
  const { activeCompanyId } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  const fetchAssets = async () => {
    setLoading(true);
    try {
      let url = `/assets?search=${search}`;
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

  const openAssetDetails = async (ast: any) => {
    try {
      const res = await api.get(`/assets/${ast.id}`);
      setSelectedAsset(res.data);
      setShowHistoryModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            سجل الأصول التقنية (Technical Assets)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة وتتبع الأجهزة والمعدات، وتوليد رموز QR وسجل الصيانة والعهدة
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Icons.Plus size={16} />
          <span>تسجيل أصل جديد</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
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

          {/* Type Filter */}
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none text-slate-700"
          >
            <option value="">جميع الحالات</option>
            <option value="Available">متاح (Available)</option>
            <option value="Assigned">مسلّم كعهدة (Assigned)</option>
            <option value="Under Maintenance">تحت الصيانة (Under Maintenance)</option>
            <option value="Damaged">تالف (Damaged)</option>
            <option value="Retired">متقاعد (Retired)</option>
            <option value="Lost">مفقود (Lost)</option>
          </select>
        </div>

        <button
          onClick={fetchAssets}
          className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl"
          title="تحديث"
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
                  <td className="p-3.5 font-mono text-slate-500">
                    {ast.serial_number || "-"}
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
                      className="p-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A]"
                      title="عرض وطباعة QR"
                    >
                      <Icons.Dashboard size={14} />
                    </button>
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => openAssetDetails(ast)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px]"
                    >
                      تفاصيل وسجل العهدة
                    </button>
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
                placeholder="i7 / 16GB / 512GB"
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
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              حفظ الأصل وتوليد QR
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
            className="w-full py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold"
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
            <div className="space-y-2">
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
                  <div className="text-left">
                    <StatusBadge status={h.status} />
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
    </DashboardLayout>
  );
}
