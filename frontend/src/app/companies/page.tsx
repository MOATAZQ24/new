"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
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
  is_deleted?: boolean;
  deleted_at?: string | null;
  branches_count?: number;
  employees_count?: number;
  logo_url?: string | null;
  [key: string]: unknown;
}

interface CompanyImpact {
  company_id: string;
  company_name_ar: string;
  company_code: string;
  is_deleted: boolean;
  status: string;
  branches_count: number;
  departments_count: number;
  employees_count: number;
  assets_count: number;
  tickets_count: number;
  tasks_count: number;
  subscriptions_count: number;
  memberships_count: number;
  can_delete: boolean;
  can_archive: boolean;
  reasons: string[];
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
  const userSelectedCompanyRef = useRef(false);
  const [detailTab, setDetailTab] = useState<"branches" | "info" | "departments" | "subsidiaries">("branches");

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
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [companyImpact, setCompanyImpact] = useState<CompanyImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [archivingCompany, setArchivingCompany] = useState(false);
  const [restoringCompany, setRestoringCompany] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { isSuperAdmin, canConfigureSystem } = useUserRole();
  const canManage = canConfigureSystem;

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

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      let url = "/companies";
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      if (statusFilter) params.append("status", statusFilter);
      if (showArchived) params.append("include_archived", "true");
      const q = params.toString();
      if (q) url += `?${q}`;

      const res = await api.get<CompanyRow[]>(url);
      const list = res.data || [];
      setCompanies(list);

      if (list.length > 0) {
        const chosen =
          (userSelectedCompanyRef.current &&
            selectedCompany &&
            list.find((item) => item.id === selectedCompany.id)) ||
          list.find((item) => item.id === activeCompanyId) ||
          list.find((item) => item.company_type === "Group") ||
          list[0];
        setSelectedCompany(chosen);
        const [, brSumRes] = await Promise.all([
          refreshBranchesAndDepts(chosen.id),
          api
            .get<BranchSummaryItem[]>(`/companies/branches-summary?company_id=${chosen.id}`)
            .catch(() => ({ data: [] as BranchSummaryItem[] })),
        ]);
        setBranchSummaries(brSumRes.data || []);
      } else {
        setSelectedCompany(null);
        setBranches([]);
        setDepartments([]);
        setBranchSummaries([]);
      }
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
  }, [activeCompanyId, statusFilter, showArchived, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const openDeleteOrArchiveModal = async (company: CompanyRow) => {
    setDeleteTarget(company);
    setLoadingImpact(true);
    setCompanyImpact(null);
    try {
      const res = await api.get<CompanyImpact>(`/companies/${company.id}/impact`);
      if (res.data) {
        setCompanyImpact(res.data);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل تقييم أثر حذف الشركة");
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleConfirmDeleteCompany = async () => {
    if (!deleteTarget || deletingCompany) return;
    setDeletingCompany(true);
    try {
      await api.delete(`/companies/${deleteTarget.id}`);
      toast.success(`تم حذف شركة "${deleteTarget.company_name_ar}" نهائياً بنجاح`);
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      setCompanyImpact(null);
      if (selectedCompany?.id === deletedId) {
        setSelectedCompany(null);
      }
      await fetchCompanies();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الشركة");
    } finally {
      setDeletingCompany(false);
    }
  };

  const handleArchiveCompany = async () => {
    if (!deleteTarget || archivingCompany) return;
    setArchivingCompany(true);
    try {
      await api.post(`/companies/${deleteTarget.id}/archive`);
      toast.success(`تم أرشفة شركة "${deleteTarget.company_name_ar}" بنجاح وحفظ كافة سجلاتها`);
      const targetId = deleteTarget.id;
      setDeleteTarget(null);
      setCompanyImpact(null);
      await fetchCompanies();
      if (selectedCompany?.id === targetId) {
        setSelectedCompany(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل أرشفة الشركة");
    } finally {
      setArchivingCompany(false);
    }
  };

  const handleRestoreCompany = async (company: CompanyRow) => {
    if (restoringCompany) return;
    setRestoringCompany(true);
    try {
      await api.post(`/companies/${company.id}/restore`);
      toast.success(`تم استعادة شركة "${company.company_name_ar}" إلى الحالة النشطة بنجاح`);
      await fetchCompanies();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل استعادة الشركة");
    } finally {
      setRestoringCompany(false);
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

  const selectCompanyNode = async (c: CompanyRow) => {
    userSelectedCompanyRef.current = true;
    setSelectedCompany(c);
    await refreshBranchesAndDepts(c.id);
    try {
      const sumRes = await api.get<BranchSummaryItem[]>(`/companies/branches-summary?company_id=${c.id}`);
      setBranchSummaries(sumRes.data || []);
    } catch {
      // keep existing summary on fallback
    }
  };

  const groupCompany =
    companies.find((c) => c.company_type === "Group") ||
    companies.find((c) => c.company_code === "IGT") ||
    companies[0] ||
    null;
  const subsidiariesList = companies.filter(
    (c) =>
      c.id !== groupCompany?.id &&
      (c.company_type === "Subsidiary" ||
        (groupCompany && c.parent_company_id === groupCompany.id))
  );
  const standaloneList = companies.filter(
    (c) => c.id !== groupCompany?.id && !subsidiariesList.some((s) => s.id === c.id)
  );
  const totalBranchesKpi =
    companies.reduce((acc, c) => acc + (c.branches_count || 0), 0) || branchSummaries.length;
  const totalEmployeesKpi =
    companies.reduce((acc, c) => acc + (c.employees_count || 0), 0) ||
    branchSummaries.reduce((acc, b) => acc + (b.employees_count || 0), 0);
  const totalAssetsKpi = branchSummaries.reduce((acc, b) => acc + (b.assets_count || 0), 0);
  const selectedSubsCount = selectedCompany
    ? selectedCompany.id === groupCompany?.id
      ? subsidiariesList.length
      : companies.filter((c) => c.parent_company_id === selectedCompany.id).length
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header matching Image 7 */}
        <PageHeader
          title="الشركات والفروع"
          description="إدارة هيكل الشركات، التابعة، الفروع، والبيانات التنظيمية"
          icon={<Icons.Companies size={20} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Icons.Search
                  size={14}
                  className="text-[var(--text-3)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="بحث عن شركة أو فرع"
                  placeholder="بحث عن شركة، فرع..."
                  className="ps-8 pe-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs outline-none focus:border-[#2563EB] w-48 sm:w-56"
                />
              </div>
              <select
                aria-label="تصفية حسب حالة الشركة"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] text-xs py-2 px-3 rounded-xl outline-none focus:border-[#2563EB] text-[var(--text)]"
              >
                <option value="">كل الحالات</option>
                <option value="Active">نشطة</option>
                <option value="Inactive">غير نشطة</option>
                <option value="Archived">المؤرشفة</option>
                <option value="Suspended">موقوفة</option>
              </select>
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className={`motion-control flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  showArchived
                    ? "bg-amber-50 border-amber-300 text-amber-800 font-bold"
                    : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                }`}
                title="عرض الشركات المؤرشفة أو المستبعدة"
              >
                <Icons.Refresh size={13} className={showArchived ? "text-amber-700" : "text-[var(--text-3)]"} />
                <span>{showArchived ? "إخفاء الأرشيف" : "عرض الأرشيف"}</span>
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Icons.Plus size={16} />
                  <span>إضافة شركة جديدة</span>
                </button>
              )}
            </div>
          }
        />

        {/* Row 1: 5 Harmonized KPIs (أصل مرتبط، موظف، علامات تجارية تابعة، شركات، فروع نشطة) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[var(--text)]">{totalAssetsKpi}</div>
              <div className="text-[11px] font-bold text-[var(--text-2)] mt-0.5">أصل مرتبط</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <Icons.Assets size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#2563EB]">{totalEmployeesKpi}</div>
              <div className="text-[11px] font-bold text-[var(--text-2)] mt-0.5">موظفو المجموعة (كافة الشركات)</div>
              {selectedCompany && (
                <div className="text-[10px] text-[var(--text-3)] font-medium">{selectedCompany.employees_count || 0} في الشركة المحددة</div>
              )}
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <Icons.Users size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[var(--text)]">{subsidiariesList.length}</div>
              <div className="text-[11px] font-bold text-[var(--text-2)] mt-0.5">علامات تجارية تابعة</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#3B82F6]/15 text-[#8A6D3B] flex items-center justify-center shrink-0">
              <Icons.Subscriptions size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#1D4ED8]">{companies.length}</div>
              <div className="text-[11px] font-bold text-[var(--text-2)] mt-0.5">شركات</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Icons.Building size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#2563EB]">{totalBranchesKpi}</div>
              <div className="text-[11px] font-bold text-[var(--text-2)] mt-0.5">فروع نشطة</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <Icons.MapPin size={20} />
            </div>
          </div>
        </div>

        {/* Middle Split Layout: Right Company Tree + Left Selected Company Panel */}
        {loading ? (
          <TableSkeleton variant="cards" rows={3} />
        ) : companies.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)]">
            <EmptyState
              icon={<Icons.Companies size={26} />}
              title="لا توجد شركات مطابقة لمعايير البحث"
              description="يمكنك تعديل البحث أو إضافة شركة جديدة ضمن هيكل المنظمة"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Right Card: هيكل الشركات */}
            <aside className="lg:col-span-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)]">
                <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <Icons.Companies size={16} className="text-[#1D4ED8]" />
                  <span>هيكل الشركات</span>
                </h2>
                <span className="text-[11px] font-mono text-[var(--text-3)]">{companies.length}</span>
              </div>

              <div className="space-y-1.5">
                {groupCompany && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => void selectCompanyNode(groupCompany)}
                      className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-bold transition-colors cursor-pointer ${
                        selectedCompany?.id === groupCompany.id
                          ? "bg-[#1D4ED8] text-white"
                          : "bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-[var(--text)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icons.Building size={15} />
                        <span className="truncate">{groupCompany.company_name_ar} (المجموعة)</span>
                      </span>
                      <span className="text-[10px] font-mono opacity-80">{groupCompany.company_code}</span>
                    </button>

                    {subsidiariesList.length > 0 && (
                      <div className="ps-4 border-s-2 border-emerald-200 space-y-1 ms-3">
                        {subsidiariesList.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => void selectCompanyNode(sub)}
                            className={`w-full text-right px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                              selectedCompany?.id === sub.id
                                ? "bg-[#2563EB] text-white"
                                : "hover:bg-[var(--surface-2)] text-[var(--text-2)]"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <Icons.Subscriptions size={13} />
                              <span className="truncate">{sub.company_name_ar}</span>
                            </span>
                            <span className="text-[10px] font-mono opacity-80">{sub.company_code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {standaloneList.map((c) => {
                  const isArchived = Boolean(c.is_deleted || c.status === "Archived");
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void selectCompanyNode(c)}
                      className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-bold transition-colors cursor-pointer ${
                        selectedCompany?.id === c.id
                          ? "bg-[#1D4ED8] text-white"
                          : isArchived
                          ? "bg-amber-50/70 border border-amber-200/80 text-amber-900 hover:bg-amber-100/60"
                          : "bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-[var(--text)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icons.Building size={15} />
                        <span className="truncate">{c.company_name_ar}</span>
                        {isArchived && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-200 text-amber-800 font-normal">
                            مؤرشفة
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono opacity-80">{c.company_code}</span>
                    </button>
                  );
                })}
              </div>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="w-full py-2 px-3 rounded-xl border border-[#1D4ED8]/30 text-[#1D4ED8] hover:bg-[#1D4ED8] hover:text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-2"
                >
                  <Icons.Plus size={14} />
                  <span>إضافة شركة / علامة تابعة</span>
                </button>
              )}
            </aside>

            {/* Left Panel: Selected Company Details, Tabs, Branches Table */}
            <section className="lg:col-span-8 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 shadow-xs space-y-4">
              {selectedCompany ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icons.Building size={19} className="text-[#1D4ED8]" />
                      <h2 className="text-base font-bold text-[var(--text)]">
                        {selectedCompany.company_name_ar}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#2563EB] text-white">
                        {selectedCompany.company_type === "Group"
                          ? "الشركة الرئيسية (المجموعة)"
                          : selectedCompany.company_type === "Subsidiary"
                          ? "علامة / شركة تابعة"
                          : "شركة تشغيلية"}
                      </span>
                      <StatusBadge status={selectedCompany.status} />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openEditCompany(selectedCompany)}
                          className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] hover:border-[#2563EB] text-xs font-semibold text-[var(--text-2)] cursor-pointer flex items-center gap-1"
                        >
                          <Icons.Edit size={13} />
                          <span>تعديل</span>
                        </button>
                      )}
                      {isSuperAdmin && (
                        Boolean(selectedCompany.is_deleted || selectedCompany.status === "Archived") ? (
                          <button
                            type="button"
                            onClick={() => void handleRestoreCompany(selectedCompany)}
                            disabled={restoringCompany}
                            className="px-2.5 py-1.5 rounded-xl border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                            title="استعادة الشركة وتفعيلها"
                          >
                            <Icons.Refresh size={13} />
                            <span>{restoringCompany ? "جاري الاستعادة..." : "استعادة الشركة"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void openDeleteOrArchiveModal(selectedCompany)}
                            aria-label={`إدارة حذف أو أرشفة شركة ${selectedCompany.company_name_ar}`}
                            className="px-2.5 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                            title="حذف أو أرشفة الشركة"
                          >
                            <Icons.Trash size={13} />
                            <span>حذف / أرشفة</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Detail Tabs + Action CTA matching Image 7 */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailTab("branches")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          detailTab === "branches"
                            ? "bg-[#1D4ED8] text-white"
                            : "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <Icons.MapPin size={13} />
                        <span>الفروع ({branches.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDetailTab("info")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          detailTab === "info"
                            ? "bg-[#1D4ED8] text-white"
                            : "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <Icons.Info size={13} />
                        <span>معلومات الشركة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDetailTab("departments")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          detailTab === "departments"
                            ? "bg-[#1D4ED8] text-white"
                            : "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <Icons.Users size={13} />
                        <span>الأقسام ({departments.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDetailTab("subsidiaries")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          detailTab === "subsidiaries"
                            ? "bg-[#1D4ED8] text-white"
                            : "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <Icons.Subscriptions size={13} />
                        <span>الشركات التابعة ({selectedSubsCount})</span>
                      </button>
                    </div>

                    {canManage && (
                      detailTab === "departments" ? (
                        <button
                          type="button"
                          onClick={openAddDept}
                          className="px-3 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Icons.Plus size={14} />
                          <span>إضافة قسم</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openAddBranch}
                          className="px-3 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Icons.Plus size={14} />
                          <span>إضافة فرع</span>
                        </button>
                      )
                    )}
                  </div>

                  {/* Active Detail Tab Body */}
                  {detailTab === "branches" && (
                    branches.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[var(--text-3)]">
                        لا توجد فروع مسجلة لهذه الشركة حالياً
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] text-[var(--text-2)] font-semibold">
                            <tr>
                              <th className="p-3">#</th>
                              <th className="p-3">اسم الفرع</th>
                              <th className="p-3">الكود</th>
                              <th className="p-3">المدينة / العنوان</th>
                              <th className="p-3 text-center">الموظفون</th>
                              <th className="p-3 text-center">الأصول</th>
                              <th className="p-3">الحالة</th>
                              <th className="p-3 text-center">الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {branches.map((br, idx) => {
                              const sumMatch = branchSummaries.find((s) => s.branch_id === br.id);
                              return (
                                <tr key={br.id} className="hover:bg-[var(--surface-2)]">
                                  <td className="p-3 font-mono text-[var(--text-3)]">{idx + 1}</td>
                                  <td className="p-3 font-bold text-[var(--text)]">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Icons.MapPin size={13} className="text-[#2563EB]" />
                                      <span>{br.branch_name}</span>
                                    </span>
                                  </td>
                                  <td className="p-3 font-mono text-[var(--text-2)]">
                                    BR-{idx + 1}
                                  </td>
                                  <td className="p-3 text-[var(--text-2)]">{br.location || "الرياض"}</td>
                                  <td className="p-3 text-center font-mono font-bold text-amber-800">
                                    {sumMatch?.employees_count ?? 0}
                                  </td>
                                  <td className="p-3 text-center font-mono font-bold text-emerald-700">
                                    {sumMatch?.assets_count ?? 0}
                                  </td>
                                  <td className="p-3">
                                    <StatusBadge status={br.status} />
                                  </td>
                                  <td className="p-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openCompanyDetails(selectedCompany)}
                                        className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[#2563EB] hover:bg-emerald-50 cursor-pointer"
                                        title="عرض تفاصيل الفرع والقسم"
                                      >
                                        <Icons.Eye size={14} />
                                      </button>
                                      {canManage && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openEditBranch(br)}
                                            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-slate-900 hover:bg-[var(--surface-2)] cursor-pointer"
                                            title="تعديل الفرع"
                                          >
                                            <Icons.Edit size={14} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteBranch(br.id, br.branch_name)}
                                            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                            title="حذف الفرع"
                                          >
                                            <Icons.Trash size={14} />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {detailTab === "info" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                        <div className="text-[var(--text-3)] font-semibold">الاسم العربي</div>
                        <div className="font-bold text-[var(--text)] mt-1">{selectedCompany.company_name_ar}</div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                        <div className="text-[var(--text-3)] font-semibold">الاسم الإنجليزي</div>
                        <div className="font-bold text-[var(--text)] mt-1" dir="ltr">{selectedCompany.company_name_en}</div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                        <div className="text-[var(--text-3)] font-semibold">الكود والنوع</div>
                        <div className="font-mono font-bold text-[#2563EB] mt-1">
                          {selectedCompany.company_code} • {selectedCompany.company_type || "Internal"}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                        <div className="text-[var(--text-3)] font-semibold">بيانات الاتصال</div>
                        <div className="font-mono text-[var(--text)] mt-1" dir="ltr">
                          {selectedCompany.contact_email || "—"} • {selectedCompany.contact_phone || "—"}
                        </div>
                      </div>
                    </div>
                  )}

                  {detailTab === "departments" && (
                    departments.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[var(--text-3)]">
                        لا توجد أقسام مسجلة لهذه الشركة حالياً
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {departments.map((d) => (
                          <div
                            key={d.id}
                            className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-[var(--text)]">{d.department_name}</div>
                              <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                                {d.branch_name || "على مستوى الشركة"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <StatusBadge status={d.status} />
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditDept(d)}
                                    className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-slate-900 hover:bg-[var(--surface)] cursor-pointer"
                                    title="تعديل القسم"
                                  >
                                    <Icons.Edit size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDept(d.id, d.department_name)}
                                    className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                    title="حذف القسم"
                                  >
                                    <Icons.Trash size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {detailTab === "subsidiaries" && (
                    subsidiariesList.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[var(--text-3)]">
                        لا توجد علامات تجارية تابعة مرتبطة حالياً
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {subsidiariesList.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => void selectCompanyNode(sub)}
                            className="text-right p-3.5 rounded-xl bg-[var(--surface-2)] hover:bg-emerald-50/60 border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-xs text-[var(--text)]">{sub.company_name_ar}</div>
                              <div className="text-[11px] font-mono text-[var(--text-3)]">{sub.company_code}</div>
                            </div>
                            <span className="text-xs font-bold text-[#2563EB]">
                              {sub.branches_count || 0} فروع ←
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </>
              ) : null}
            </section>
          </div>
        )}

        {/* Bottom Split Row: Canonical Branch Summary (5 Cards) + Group Org Diagram (Image 7) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <section
            aria-label="ملخص الفروع المعتمدة الخمسة"
            className="lg:col-span-8 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 shadow-xs space-y-3"
          >
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Icons.Reports size={16} className="text-[#2563EB]" />
              <span>ملخص الفروع ({branchSummaries.length})</span>
            </h2>

            {branchSummaries.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] py-4 text-center">
                اختر شركة لعرض ملخص الفروع الخاص بها
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {branchSummaries.map((bs) => (
                  <div
                    key={bs.branch_id}
                    className="rounded-xl bg-[#ECFDF5]/60 border border-emerald-200/60 p-3 space-y-2"
                  >
                    <div
                      className="font-bold text-xs text-[#1D4ED8] flex items-center gap-1 truncate"
                      title={bs.branch_name}
                    >
                      <Icons.MapPin size={13} className="shrink-0 text-[#2563EB]" />
                      <span className="truncate">{bs.branch_name}</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-[var(--text-2)]">
                      <div className="flex items-center justify-between">
                        <span>موظف</span>
                        <span className="font-mono font-bold text-amber-800">{bs.employees_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>أصل</span>
                        <span className="font-mono font-bold text-emerald-700">{bs.assets_count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 shadow-xs flex flex-col justify-between space-y-3">
            <h2 className="text-sm font-bold text-[var(--text)]">الهيكل التنظيمي للمجموعة</h2>
            <div className="flex flex-col items-center gap-3 py-1">
              <div className="px-4 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-bold text-center">
                {groupCompany ? `${groupCompany.company_name_ar} (المجموعة)` : "بوابة المستثمر (المجموعة)"}
              </div>
              <div className="w-4/5 h-px bg-emerald-200" />
              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {(subsidiariesList.length > 0 ? subsidiariesList : companies.slice(0, 3)).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => void selectCompanyNode(child)}
                    className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-emerald-50 border border-[var(--border)] text-[11px] font-bold text-[var(--text)] cursor-pointer"
                  >
                    {child.company_name_ar}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
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
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم الشركة بالعربية *
            </label>
            <input
              type="text"
              required
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="مثال: شركة التطوير المتقدم"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم الشركة بالإنجليزية *
            </label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Advanced Development Co."
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                كود الشركة (Unique Code) *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ADC"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                رقم الهاتف
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 11 000 0000"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              البريد الإلكتروني للاتصال
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@company.sa"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              فروع أولية (اختياري - مفصولة بفواصل)
            </label>
            <input
              type="text"
              value={initialBranchesStr}
              onChange={(e) => setInitialBranchesStr(e.target.value)}
              placeholder="مثال: الفرع الرئيسي, فرع جدة, فرع الدمام"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              أقسام أولية (اختياري - مفصولة بفواصل)
            </label>
            <input
              type="text"
              value={initialDeptsStr}
              onChange={(e) => setInitialDeptsStr(e.target.value)}
              placeholder="مثال: تقنية المعلومات, الموارد البشرية, المالية"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-2)] rounded-xl text-xs font-semibold hover:bg-[var(--surface-2)]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
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
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم الشركة بالعربية *
            </label>
            <input
              type="text"
              required
              value={editNameAr}
              onChange={(e) => setEditNameAr(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم الشركة بالإنجليزية *
            </label>
            <input
              type="text"
              required
              value={editNameEn}
              onChange={(e) => setEditNameEn(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                كود الشركة *
              </label>
              <input
                type="text"
                required
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                الحالة *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="Active">نشطة (Active)</option>
                <option value="Inactive">غير نشطة (Inactive)</option>
                <option value="Suspended">موقوفة (Suspended)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
                رقم الهاتف
              </label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-2)] rounded-xl text-xs font-semibold hover:bg-[var(--surface-2)]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
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
              <h4 className="text-xs font-bold text-[var(--text)] flex items-center gap-2">
                <Icons.Companies size={16} className="text-[#2563EB]" />
                <span>فروع الشركة ({branches.length})</span>
              </h4>
              {canManage && (
                <button
                  onClick={openAddBranch}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Icons.Plus size={13} />
                  <span>إضافة فرع جديد</span>
                </button>
              )}
            </div>

            {branches.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] p-3 bg-[var(--surface-2)] rounded-xl text-center">
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
                    className="p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)]">{b.branch_name}</span>
                        {isCanonical && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            فرع تشغيلي معتمد
                          </span>
                        )}
                      </div>
                      <div className="text-[var(--text-3)] text-[11px] mt-0.5">
                        الموقع: {b.location || "غير محدد"} • تواصل: {b.contact_details || "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} />
                      {canManage && (
                        <>
                          <button
                            onClick={() => openEditBranch(b)}
                            className="p-1 text-[var(--text-3)] hover:text-slate-800 transition-colors"
                            title="تعديل الفرع"
                          >
                            <Icons.Edit size={14} />
                          </button>
                          {!isCanonical && (
                            <button
                              onClick={() => handleDeleteBranch(b.id, b.branch_name)}
                              className="p-1 text-[var(--text-3)] hover:text-rose-600 transition-colors"
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
              <h4 className="text-xs font-bold text-[var(--text)] flex items-center gap-2">
                <Icons.Users size={16} className="text-[#2563EB]" />
                <span>الأقسام الإدارية ({departments.length})</span>
              </h4>
              {canManage && (
                <button
                  onClick={openAddDept}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Icons.Plus size={13} />
                  <span>إضافة قسم جديد</span>
                </button>
              )}
            </div>

            {departments.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] p-3 bg-[var(--surface-2)] rounded-xl text-center">
                لا توجد أقسام مسجلة لهذه الشركة
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {departments.map((d) => {
                  const linkedBranch = branches.find((b) => b.id === d.branch_id);
                  return (
                    <div
                      key={d.id}
                      className="p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[var(--text)]">{d.department_name}</div>
                        <div className="text-[10px] text-[var(--text-3)] mt-0.5">
                          الفرع: {linkedBranch ? linkedBranch.branch_name : "عام"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={d.status} />
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEditDept(d)}
                              className="p-1 text-[var(--text-3)] hover:text-slate-800 transition-colors"
                              title="تعديل القسم"
                            >
                              <Icons.Edit size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteDept(d.id, d.department_name)}
                              className="p-1 text-[var(--text-3)] hover:text-rose-600 transition-colors"
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
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم الفرع *
            </label>
            <input
              type="text"
              required
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="مثال: فرع الرياض - الملز"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              موقع الفرع
            </label>
            <input
              type="text"
              value={branchLocation}
              onChange={(e) => setBranchLocation(e.target.value)}
              placeholder="مثال: طريق مكة، الدور الثالث"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              بيانات الاتصال
            </label>
            <input
              type="text"
              value={branchContact}
              onChange={(e) => setBranchContact(e.target.value)}
              placeholder="هاتف أو تحويلة الفرع"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              الحالة *
            </label>
            <select
              value={branchStatus}
              onChange={(e) => setBranchStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            >
              <option value="Active">نشط (Active)</option>
              <option value="Inactive">غير نشط (Inactive)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBranchModal(false)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-2)] rounded-xl text-xs font-semibold hover:bg-[var(--surface-2)]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
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
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              اسم القسم *
            </label>
            <input
              type="text"
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="مثال: إدارة الخدمات والمشتريات"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              الفرع التابع له
            </label>
            <select
              value={deptBranchId}
              onChange={(e) => setDeptBranchId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
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
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1">
              الحالة *
            </label>
            <select
              value={deptStatus}
              onChange={(e) => setDeptStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            >
              <option value="Active">نشط (Active)</option>
              <option value="Inactive">غير نشط (Inactive)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeptModal(false)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-2)] rounded-xl text-xs font-semibold hover:bg-[var(--surface-2)]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {editingDept ? "حفظ التعديل" : "إضافة القسم"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete / Archive Company Modal with Live Impact Analysis */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletingCompany && !archivingCompany) {
            setDeleteTarget(null);
            setCompanyImpact(null);
          }
        }}
        title="إدارة حذف أو أرشفة الشركة"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[var(--text)]">{deleteTarget?.company_name_ar}</h3>
                <div className="text-xs text-[var(--text-3)] font-mono mt-0.5">
                  {deleteTarget?.company_code} • {deleteTarget?.company_name_en}
                </div>
              </div>
              <StatusBadge status={deleteTarget?.status || "Active"} />
            </div>
          </div>

          {loadingImpact ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)] space-y-2">
              <div className="w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mx-auto" />
              <div>جاري فحص الارتباطات التشغيلية وتقييم أثر الحذف...</div>
            </div>
          ) : companyImpact ? (
            <div className="space-y-3">
              <div className="text-xs font-bold text-[var(--text-2)]">تقييم الأثر التشغيلي والارتباطات:</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-center">
                  <div className="text-[11px] text-[var(--text-3)]">الفروع والأقسام</div>
                  <div className="font-bold text-[var(--text)] mt-1 font-mono">
                    {companyImpact.branches_count} فرع / {companyImpact.departments_count} قسم
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                  <div className="text-[11px] text-amber-700">الموظفون</div>
                  <div className="font-bold text-amber-900 mt-1 font-mono">
                    {companyImpact.employees_count} موظف
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <div className="text-[11px] text-emerald-700">الأصول التقنية</div>
                  <div className="font-bold text-emerald-900 mt-1 font-mono">
                    {companyImpact.assets_count} أصل
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-center">
                  <div className="text-[11px] text-blue-700">تذاكر الدعم</div>
                  <div className="font-bold text-blue-900 mt-1 font-mono">
                    {companyImpact.tickets_count} تذكرة
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-center">
                  <div className="text-[11px] text-purple-700">المهام التشغيلية</div>
                  <div className="font-bold text-purple-900 mt-1 font-mono">
                    {companyImpact.tasks_count} مهمة
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                  <div className="text-[11px] text-rose-700">الاشتراكات</div>
                  <div className="font-bold text-rose-900 mt-1 font-mono">
                    {companyImpact.subscriptions_count} اشتراك
                  </div>
                </div>
              </div>

              {!companyImpact.can_delete ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <Icons.ShieldAlert size={15} className="text-amber-700" />
                    <span>حماية البيانات التشغيلية: الحذف النهائي المباشر غير متاح</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    تحتوي هذه الشركة على سجلات فعلية (موظفين، أصول، تذاكر، أو اشتراكات). لمنع فقدان البيانات والعهد وتلف العلاقات المحاسبية، يرجى اختيار <strong>أرشفة وتعطيل الشركة</strong>. ستبقى كافة السجلات التاريخية محفوظة ومتاحة للاطلاع والتقارير.
                  </p>
                  {companyImpact.reasons.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                      {companyImpact.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                    <Icons.ShieldCheck size={15} className="text-emerald-700" />
                    <span>جاهزة للحذف النهائي أو الأرشفة</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    هذه الشركة لا ترتبط بأي سجلات تشغيلية نشطة (موظفون، أصول، تذاكر، اشتراكات). يمكنك حذفها نهائياً أو أرشفتها.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              disabled={deletingCompany || archivingCompany}
              onClick={() => {
                setDeleteTarget(null);
                setCompanyImpact(null);
              }}
              className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
            >
              إلغاء
            </button>

            {companyImpact?.can_archive && (
              <button
                type="button"
                disabled={deletingCompany || archivingCompany}
                onClick={() => void handleArchiveCompany()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Icons.Refresh size={13} />
                <span>{archivingCompany ? "جاري الأرشفة..." : "أرشفة وتعطيل الشركة (موصى به)"}</span>
              </button>
            )}

            {companyImpact?.can_delete && (
              <button
                type="button"
                disabled={deletingCompany || archivingCompany}
                onClick={() => void handleConfirmDeleteCompany()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Icons.Trash size={13} />
                <span>{deletingCompany ? "جاري الحذف النهائي..." : "حذف نهائي للشركة"}</span>
              </button>
            )}
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
