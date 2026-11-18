"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface CompanyRow {
  id: string;
  company_name_ar: string;
  company_name_en: string;
  company_code: string;
  company_type?: string | null;
  parent_company_id?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status: string;
  branches_count?: number;
  employees_count?: number;
  logo_url?: string | null;
  [key: string]: unknown;
}

interface BranchSummaryItem {
  branch_id: string;
  branch_name: string;
  location?: string | null;
  employees_count: number;
  assets_count: number;
  open_tasks_count: number;
  open_tickets_count: number;
}

interface CompanyBranchRow {
  id: string;
  branch_name: string;
  location?: string | null;
  contact_details?: string | null;
  status: string;
  physical_branch_id?: string | null;
}

interface CompanyDeptRow {
  id: string;
  department_name: string;
  branch_id?: string | null;
  branch_name?: string | null;
  status: string;
}

export default function CompaniesPage() {
  const toast = useToast();
  const { user, activeCompanyId } = useAuth();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [branchSummaries, setBranchSummaries] = useState<BranchSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(null);

  // Branch & Dept state for details
  const [branches, setBranches] = useState<CompanyBranchRow[]>([]);
  const [departments, setDepartments] = useState<CompanyDeptRow[]>([]);

  // Branch CRUD modals
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<CompanyBranchRow | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [branchContact, setBranchContact] = useState("");
  const [branchStatus, setBranchStatus] = useState("Active");

  // Department CRUD modals
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<CompanyDeptRow | null>(null);
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
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      if (statusFilter) params.append("status", statusFilter);
      const q = params.toString();
      if (q) url += `?${q}`;

      const [res, brSumRes] = await Promise.all([
        api.get<CompanyRow[]>(url),
        activeCompanyId
          ? api.get<BranchSummaryItem[]>(`/companies/branches-summary?company_id=${activeCompanyId}`)
          : Promise.resolve({ data: [] as BranchSummaryItem[] }),
      ]);
      setCompanies(res.data || []);
      setBranchSummaries(brSumRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل قائمة الشركات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchCompanies();
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeCompanyId, statusFilter, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل إنشاء الشركة");
    }
  };

  const openEditCompany = (c: CompanyRow) => {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل تحديث بيانات الشركة");
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف شركة "${companyName}" وجميع بياناتها؟`)) return;
    try {
      await api.delete(`/companies/${companyId}`);
      fetchCompanies();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الشركة");
    }
  };

  const refreshBranchesAndDepts = async (cid: string) => {
    try {
      const [bRes, dRes] = await Promise.all([
        api.get<CompanyBranchRow[]>(`/companies/${cid}/branches`),
        api.get<CompanyDeptRow[]>(`/companies/${cid}/departments`),
      ]);
      setBranches(bRes.data || []);
      setDepartments(dRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openCompanyDetails = async (c: CompanyRow) => {
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

  const openEditBranch = (b: CompanyBranchRow) => {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ بيانات الفرع");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الفرع");
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

  const openEditDept = (d: CompanyDeptRow) => {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ بيانات القسم");
    }
  };

  const handleDeleteDept = async (deptId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف قسم "${name}"؟`)) return;
    try {
      await api.delete(`/companies/departments/${deptId}`);
      if (selectedCompany) {
        await refreshBranchesAndDepts(selectedCompany.id);
      }
      toast.success("تم حذف القسم");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف القسم");
    }
  };

  const companyFilterCount = [search.trim(), statusFilter].filter(Boolean).length;

  return (
    <DashboardLayout>
      {/* Header */}
      <PageHeader
        title="إدارة الشركات والفروع"
        description="هيكل المنظمة المتعدد للشركات وفروعها وأقسامها الإدارية"
        icon={<Icons.Companies size={20} />}
        actions={
          isSuperAdmin ? (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Icons.Plus size={16} />
              <span>إضافة شركة جديدة</span>
            </button>
          ) : undefined
        }
      />

      {/* Canonical 5-Branch Operational Summary Strip */}
      {branchSummaries.length > 0 && (
        <section aria-label="ملخص الفروع المعتمدة الخمسة" className="mb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Icons.Companies size={15} className="text-[#187A5A]" />
              <span>ملخص الفروع المعتمدة للشركة النشطة ({branchSummaries.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {branchSummaries.map((bs) => (
              <div
                key={bs.branch_id}
                className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-xs space-y-2"
              >
                <div className="font-bold text-xs text-[#123D32] truncate" title={bs.branch_name}>
                  {bs.branch_name}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                  <div className="bg-slate-50 px-2 py-1 rounded-lg">
                    <span className="font-mono font-bold text-slate-900">{bs.employees_count}</span> موظف
                  </div>
                  <div className="bg-slate-50 px-2 py-1 rounded-lg">
                    <span className="font-mono font-bold text-slate-900">{bs.assets_count}</span> أصل
                  </div>
                  <div className="bg-slate-50 px-2 py-1 rounded-lg">
                    <span className="font-mono font-bold text-slate-900">{bs.open_tasks_count}</span> مهمة
                  </div>
                  <div className="bg-slate-50 px-2 py-1 rounded-lg">
                    <span className="font-mono font-bold text-slate-900">{bs.open_tickets_count}</span> تذكرة
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters and Search Bar */}
      <DataToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="بحث بالاسم أو الكود..."
        searchLabel="بحث في الشركات"
        onSearchSubmit={fetchCompanies}
        activeFilterCount={companyFilterCount}
        onResetFilters={() => { setSearch(""); setStatusFilter(""); }}
        onRefresh={() => void fetchCompanies()}
        refreshing={loading}
        filters={
          <select
            aria-label="تصفية حسب حالة الشركة"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
          >
            <option value="">جميع الحالات</option>
            <option value="Active">نشطة (Active)</option>
            <option value="Inactive">غير نشطة (Inactive)</option>
            <option value="Suspended">موقوفة (Suspended)</option>
          </select>
        }
      />

      {/* Companies Grid */}
      {loading ? (
        <TableSkeleton variant="cards" rows={3} />
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState
            icon={<Icons.Companies size={26} />}
            title="لا توجد شركات مطابقة لمعايير البحث"
            description="يمكنك تعديل البحث أو إضافة شركة جديدة ضمن هيكل المنظمة"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {companies.map((c) => (
            <div
              key={c.id}
              className="motion-card bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="min-w-12 h-12 px-2.5 rounded-xl bg-[#123D32] text-[#C5A46D] font-black text-sm flex items-center justify-center shadow-xs shrink-0 whitespace-nowrap">
                    <bdi dir="ltr">{c.company_code}</bdi>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCompany(c.id, c.company_name_ar)}
                        aria-label={`حذف شركة ${c.company_name_ar}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="حذف الشركة"
                      >
                        <Icons.Trash size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-base font-bold text-slate-900 leading-tight">
                      {c.company_name_ar}
                    </h2>
                    {c.company_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#123D32] font-bold border border-emerald-200">
                        {c.company_type === "Group" ? "الشركة الرئيسية (المجموعة)" : c.company_type === "Subsidiary" ? "علامة / شركة تابعة" : "تشغيلية"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {c.company_name_en}
                  </p>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">كود الشركة:</span>
                    <span className="font-mono font-bold text-[#187A5A]">
                      <bdi dir="ltr">{c.company_code}</bdi>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">البريد الإلكتروني:</span>
                    <span className="font-mono"><bdi dir="ltr">{c.contact_email || "-"}</bdi></span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">الهاتف:</span>
                    <span className="font-mono"><bdi dir="ltr">{c.contact_phone || "-"}</bdi></span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">عدد الفروع / الموظفين:</span>
                    <span className="font-bold text-slate-900">
                      {c.branches_count} فروع • {c.employees_count} موظف
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between">
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => openEditCompany(c)}
                    className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Icons.Edit size={14} />
                    <span>تعديل</span>
                  </button>
                ) : <span />}

                <button
                  type="button"
                  onClick={() => openCompanyDetails(c)}
                  className="motion-control flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
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
                {branches.map((b) => {
                  const isCanonical = [
                    "الرياض – السلي (مخرج 17)",
                    "الرياض – الفيصلية (مخرج 18)",
                    "الرياض – العليا",
                    "الدمام",
                    "جدة",
                  ].includes(b.branch_name);
                  return (
                  <div
                    key={b.id}
                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{b.branch_name}</span>
                        {isCanonical && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            فرع تشغيلي معتمد
                          </span>
                        )}
                      </div>
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
                          {!isCanonical && (
                            <button
                              onClick={() => handleDeleteBranch(b.id, b.branch_name)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="حذف الفرع"
                            >
                              <Icons.Trash size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
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
