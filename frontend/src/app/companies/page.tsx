"use client";

import { mediaUrl } from "@/context/WorkspaceContext";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);

  // Branch & Dept state for details
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Branch CRUD modals
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [branchContact, setBranchContact] = useState("");
  const [branchStatus, setBranchStatus] = useState("Active");

  // Department CRUD modals
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [deptName, setDeptName] = useState("");
  const [deptBranchId, setDeptBranchId] = useState("");
  const [deptStatus, setDeptStatus] = useState("Active");

  // New company form state
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [initialBranchesStr, setInitialBranchesStr] = useState("");
  const [initialDeptsStr, setInitialDeptsStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edit company form state
  const [editId, setEditId] = useState("");
  const [editNameAr, setEditNameAr] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("Active");

  const isSuperAdmin = user?.is_superadmin;
  const canManage = isSuperAdmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      let url = "/companies";
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (statusFilter) params.append("status", statusFilter);
      const q = params.toString();
      if (q) url += `?${q}`;

      const res = await api.get(url);
      setCompanies(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [statusFilter]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const initBranches = initialBranchesStr
        ? initialBranchesStr.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const initDepts = initialDeptsStr
        ? initialDeptsStr.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      await api.post("/companies", {
        company_name_ar: nameAr,
        company_name_en: nameEn,
        company_code: code,
        contact_email: email || undefined,
        contact_phone: phone || undefined,
        status: "Active",
        initial_branches: initBranches,
        initial_departments: initDepts,
      });
      setShowAddModal(false);
      setNameAr("");
      setNameEn("");
      setCode("");
      setEmail("");
      setPhone("");
      setInitialBranchesStr("");
      setInitialDeptsStr("");
      fetchCompanies();
    } catch (err: any) {
      setError(err?.message || "فشل إنشاء الشركة");
    }
  };

  const openEditCompany = (c: any) => {
    setEditId(c.id);
    setEditNameAr(c.company_name_ar);
    setEditNameEn(c.company_name_en);
    setEditCode(c.company_code);
    setEditEmail(c.contact_email || "");
    setEditPhone(c.contact_phone || "");
    setEditStatus(c.status || "Active");
    setShowEditModal(true);
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.put(`/companies/${editId}`, {
        company_name_ar: editNameAr,
        company_name_en: editNameEn,
        company_code: editCode,
        contact_email: editEmail || null,
        contact_phone: editPhone || null,
        status: editStatus,
      });
      setShowEditModal(false);
      fetchCompanies();
    } catch (err: any) {
      setError(err?.message || "فشل تحديث بيانات الشركة");
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف شركة "${companyName}" وجميع بياناتها؟`)) return;
    try {
      await api.delete(`/companies/${companyId}`);
      fetchCompanies();
    } catch (err: any) {
      alert(err?.message || "فشل حذف الشركة");
    }
  };

  const refreshBranchesAndDepts = async (cid: string) => {
    try {
      const [bRes, dRes] = await Promise.all([
        api.get(`/companies/${cid}/branches`),
        api.get(`/companies/${cid}/departments`),
      ]);
      setBranches(bRes.data || []);
      setDepartments(dRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openCompanyDetails = async (c: any) => {
    setSelectedCompany(c);
    await refreshBranchesAndDepts(c.id);
    setShowDetailsModal(true);
  };

  // Branch CRUD
  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchName("");
    setBranchLocation("");
    setBranchContact("");
    setBranchStatus("Active");
    setShowBranchModal(true);
  };

  const openEditBranch = (b: any) => {
    setEditingBranch(b);
    setBranchName(b.branch_name);
    setBranchLocation(b.location || "");
    setBranchContact(b.contact_details || "");
    setBranchStatus(b.status || "Active");
    setShowBranchModal(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      if (editingBranch) {
        await api.put(`/companies/branches/${editingBranch.id}`, {
          branch_name: branchName,
          location: branchLocation || null,
          contact_details: branchContact || null,
          status: branchStatus,
        });
      } else {
        await api.post(`/companies/${selectedCompany.id}/branches`, {
          branch_name: branchName,
          location: branchLocation || null,
          contact_details: branchContact || null,
          status: branchStatus,
        });
      }
      setShowBranchModal(false);
      await refreshBranchesAndDepts(selectedCompany.id);
      fetchCompanies();
    } catch (err: any) {
      alert(err?.message || "فشل حفظ بيانات الفرع");
    }
  };

  const handleDeleteBranch = async (branchId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف فرع "${name}"؟`)) return;
    try {
      await api.delete(`/companies/branches/${branchId}`);
      if (selectedCompany) {
        await refreshBranchesAndDepts(selectedCompany.id);
        fetchCompanies();
      }
    } catch (err: any) {
      alert(err?.message || "فشل حذف الفرع");
    }
  };

  // Dept CRUD
  const openAddDept = () => {
    setEditingDept(null);
    setDeptName("");
    setDeptBranchId(branches.length > 0 ? branches[0].id : "");
    setDeptStatus("Active");
    setShowDeptModal(true);
  };

  const openEditDept = (d: any) => {
    setEditingDept(d);
    setDeptName(d.department_name);
    setDeptBranchId(d.branch_id || "");
    setDeptStatus(d.status || "Active");
    setShowDeptModal(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      if (editingDept) {
        await api.put(`/companies/departments/${editingDept.id}`, {
          department_name: deptName,
          branch_id: deptBranchId || null,
          status: deptStatus,
        });
      } else {
        await api.post(`/companies/${selectedCompany.id}/departments`, {
          department_name: deptName,
          branch_id: deptBranchId || null,
          status: deptStatus,
        });
      }
      setShowDeptModal(false);
      await refreshBranchesAndDepts(selectedCompany.id);
    } catch (err: any) {
      alert(err?.message || "فشل حفظ بيانات القسم");
    }
  };

  const handleDeleteDept = async (deptId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف قسم "${name}"؟`)) return;
    try {
      await api.delete(`/companies/departments/${deptId}`);
      if (selectedCompany) {
        await refreshBranchesAndDepts(selectedCompany.id);
      }
    } catch (err: any) {
      alert(err?.message || "فشل حذف القسم");
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

        {isSuperAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={16} />
            <span>إضافة شركة جديدة</span>
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
              placeholder="بحث بالاسم أو الكود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchCompanies()}
              className="w-full bg-slate-50 border border-slate-200 text-xs py-2 pr-9 pl-3 rounded-xl outline-none focus:border-[#187A5A]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none text-slate-700"
          >
            <option value="">جميع الحالات</option>
            <option value="Active">نشطة (Active)</option>
            <option value="Inactive">غير نشطة (Inactive)</option>
            <option value="Suspended">موقوفة (Suspended)</option>
          </select>
        </div>

        <button
          onClick={fetchCompanies}
          className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl"
          title="تحديث البيانات"
        >
          <Icons.Refresh size={16} />
        </button>
      </div>

      {/* Companies Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">جاري تحميل الشركات...</div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
          لا توجد شركات مطابقة لمعايير البحث
        </div>
      ) : (
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
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteCompany(c.id, c.company_name_ar)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        title="حذف الشركة"
                      >
                        <Icons.Trash size={15} />
                      </button>
                    )}
                  </div>
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

              <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between">
                {canManage ? (
                  <button
                    onClick={() => openEditCompany(c)}
                    className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors"
                  >
                    <Icons.Edit size={14} />
                    <span>تعديل</span>
                  </button>
                ) : <span />}

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
      )}

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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              فروع أولية (اختياري - مفصولة بفواصل)
            </label>
            <input
              type="text"
              value={initialBranchesStr}
              onChange={(e) => setInitialBranchesStr(e.target.value)}
              placeholder="مثال: الفرع الرئيسي, فرع جدة, فرع الدمام"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              أقسام أولية (اختياري - مفصولة بفواصل)
            </label>
            <input
              type="text"
              value={initialDeptsStr}
              onChange={(e) => setInitialDeptsStr(e.target.value)}
              placeholder="مثال: تقنية المعلومات, الموارد البشرية, المالية"
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
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ الشركة
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Company Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات الشركة"
      >
        <form onSubmit={handleUpdateCompany} className="space-y-4">
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
              value={editNameAr}
              onChange={(e) => setEditNameAr(e.target.value)}
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
              value={editNameEn}
              onChange={(e) => setEditNameEn(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كود الشركة *
              </label>
              <input
                type="text"
                required
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحالة *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Active">نشطة (Active)</option>
                <option value="Inactive">غير نشطة (Inactive)</option>
                <option value="Suspended">موقوفة (Suspended)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف
              </label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`فروع وأقسام: ${selectedCompany?.company_name_ar || ""}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6">
          {/* Branches Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Icons.Companies size={16} className="text-[#187A5A]" />
                <span>فروع الشركة ({branches.length})</span>
              </h4>
              {canManage && (
                <button
                  onClick={openAddBranch}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Icons.Plus size={13} />
                  <span>إضافة فرع جديد</span>
                </button>
              )}
            </div>

            {branches.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                لا توجد فروع مسجلة لهذه الشركة
              </p>
            ) : (
              <div className="space-y-2">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{b.branch_name}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        الموقع: {b.location || "غير محدد"} • تواصل: {b.contact_details || "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} />
                      {canManage && (
                        <>
                          <button
                            onClick={() => openEditBranch(b)}
                            className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                            title="تعديل الفرع"
                          >
                            <Icons.Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteBranch(b.id, b.branch_name)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="حذف الفرع"
                          >
                            <Icons.Trash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Departments Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Icons.Users size={16} className="text-[#187A5A]" />
                <span>الأقسام الإدارية ({departments.length})</span>
              </h4>
              {canManage && (
                <button
                  onClick={openAddDept}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Icons.Plus size={13} />
                  <span>إضافة قسم جديد</span>
                </button>
              )}
            </div>

            {departments.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                لا توجد أقسام مسجلة لهذه الشركة
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {departments.map((d) => {
                  const linkedBranch = branches.find((b) => b.id === d.branch_id);
                  return (
                    <div
                      key={d.id}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{d.department_name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          الفرع: {linkedBranch ? linkedBranch.branch_name : "عام"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={d.status} />
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEditDept(d)}
                              className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                              title="تعديل القسم"
                            >
                              <Icons.Edit size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteDept(d.id, d.department_name)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="حذف القسم"
                            >
                              <Icons.Trash size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Branch Create / Edit Modal */}
      <Modal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        title={editingBranch ? "تعديل بيانات الفرع" : "إضافة فرع جديد للشركة"}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveBranch} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الفرع *
            </label>
            <input
              type="text"
              required
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="مثال: فرع الرياض - الملز"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              موقع الفرع
            </label>
            <input
              type="text"
              value={branchLocation}
              onChange={(e) => setBranchLocation(e.target.value)}
              placeholder="مثال: طريق مكة، الدور الثالث"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              بيانات الاتصال
            </label>
            <input
              type="text"
              value={branchContact}
              onChange={(e) => setBranchContact(e.target.value)}
              placeholder="هاتف أو تحويلة الفرع"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الحالة *
            </label>
            <select
              value={branchStatus}
              onChange={(e) => setBranchStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="Active">نشط (Active)</option>
              <option value="Inactive">غير نشط (Inactive)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBranchModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {editingBranch ? "حفظ التعديل" : "إضافة الفرع"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Department Create / Edit Modal */}
      <Modal
        isOpen={showDeptModal}
        onClose={() => setShowDeptModal(false)}
        title={editingDept ? "تعديل بيانات القسم" : "إضافة قسم جديد"}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveDept} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم القسم *
            </label>
            <input
              type="text"
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="مثال: إدارة الخدمات والمشتريات"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الفرع التابع له
            </label>
            <select
              value={deptBranchId}
              onChange={(e) => setDeptBranchId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">بدون فرع محدد (عام)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الحالة *
            </label>
            <select
              value={deptStatus}
              onChange={(e) => setDeptStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="Active">نشط (Active)</option>
              <option value="Inactive">غير نشط (Inactive)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeptModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {editingDept ? "حفظ التعديل" : "إضافة القسم"}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
