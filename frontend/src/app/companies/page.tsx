"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function CompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // New company form state
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get("/companies");
      setCompanies(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/companies", {
        company_name_ar: nameAr,
        company_name_en: nameEn,
        company_code: code,
        contact_email: email,
        contact_phone: phone,
        status: "Active",
      });
      setShowAddModal(false);
      setNameAr("");
      setNameEn("");
      setCode("");
      setEmail("");
      setPhone("");
      fetchCompanies();
    } catch (err: any) {
      setError(err?.message || "فشل إنشاء الشركة");
    }
  };

  const openCompanyDetails = async (c: any) => {
    setSelectedCompany(c);
    try {
      const [bRes, dRes] = await Promise.all([
        api.get(`/companies/${c.id}/branches`),
        api.get(`/companies/${c.id}/departments`),
      ]);
      setBranches(bRes.data || []);
      setDepartments(dRes.data || []);
      setShowDetailsModal(true);
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
            إدارة الشركات والفروع
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            هيكل المنظمة المتعدد للشركات وفروعها وأقسامها الإدارية
          </p>
        </div>

        {user?.is_superadmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={16} />
            <span>إضافة شركة جديدة</span>
          </button>
        )}
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {companies.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#123D32] text-[#C5A46D] font-black text-lg flex items-center justify-center shadow-xs">
                  {c.company_code}
                </div>
                <StatusBadge status={c.status} />
              </div>

              <div className="mt-4">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {c.company_name_ar}
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {c.company_name_en}
                </p>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">كود الشركة:</span>
                  <span className="font-mono font-bold text-[#187A5A]">
                    {c.company_code}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">البريد الإلكتروني:</span>
                  <span className="font-mono">{c.contact_email || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">الهاتف:</span>
                  <span className="font-mono">{c.contact_phone || "-"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">عدد الفروع / الموظفين:</span>
                  <span className="font-bold">
                    {c.branches_count} فروع • {c.employees_count} موظف
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => openCompanyDetails(c)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Icons.Eye size={14} />
                <span>عرض الفروع والأقسام</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Company Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة شركة جديدة إلى المجموعة"
      >
        <form onSubmit={handleCreateCompany} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الشركة بالعربية *
            </label>
            <input
              type="text"
              required
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="مثال: شركة التطوير المتقدم"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الشركة بالإنجليزية *
            </label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Advanced Development Co."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كود الشركة (Unique Code) *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ADC"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 11 000 0000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              البريد الإلكتروني للاتصال
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@company.sa"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              حفظ الشركة
            </button>
          </div>
        </form>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`فروع وأقسام: ${selectedCompany?.company_name_ar || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          {/* Branches */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-2">
              <Icons.Companies size={16} className="text-[#187A5A]" />
              <span>فروع الشركة ({branches.length})</span>
            </h4>
            <div className="space-y-2">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800">{b.branch_name}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{b.location}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Departments */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-2">
              <Icons.Users size={16} className="text-[#187A5A]" />
              <span>الأقسام الإدارية ({departments.length})</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {departments.map((d) => (
                <div
                  key={d.id}
                  className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700"
                >
                  {d.department_name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
