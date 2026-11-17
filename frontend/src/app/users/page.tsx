"use client";

import React, { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { StatsCard } from "@/components/ui/StatsCard";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface UserCompanyLink {
  company_id: string;
  company_name_ar: string;
  role: string;
  is_default?: boolean;
  branch_name?: string | null;
}

interface UserItem {
  id: string;
  username: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  job_title?: string | null;
  account_status: string;
  is_deleted?: boolean;
  is_locked?: boolean;
  is_superadmin?: boolean;
  must_change_password?: boolean;
  last_login?: string | null;
  roles?: string[];
  companies?: UserCompanyLink[];
  employee?: {
    branch_id?: string | null;
    department_id?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

interface UserCompanyOption {
  id: string;
  company_name_ar: string;
  name_ar?: string;
}

interface UserBranchOption {
  id: string;
  branch_id?: string;
  branch_name: string;
}

interface UserDeptOption {
  id: string;
  department_name: string;
}

interface UserActivityLogItem {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  timestamp: string;
}

interface BulkImportResult {
  imported_count: number;
  errors?: string[];
}

export default function UsersManagementPage() {
  const toast = useToast();
  const { user: currentUser, activeCompanyId } = useAuth();

  // State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Auxiliary data
  const [companies, setCompanies] = useState<UserCompanyOption[]>([]);
  const [branches, setBranches] = useState<UserBranchOption[]>([]);
  const [departments, setDepartments] = useState<UserDeptOption[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<Record<string, Record<string, string[]>> | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showTempPassModal, setShowTempPassModal] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivityLogItem[]>([]);
  const [userCompanies, setUserCompanies] = useState<UserCompanyLink[]>([]);

  // Action status
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [tempPasswordGenerated, setTempPasswordGenerated] = useState("");
  const [copied, setCopied] = useState(false);

  // Add User Form State
  const [formFullName, setFormFullName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompanyId, setFormCompanyId] = useState("");
  const [formBranchId, setFormBranchId] = useState("");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formRole, setFormRole] = useState("Employee");
  const [formAccountStatus, setFormAccountStatus] = useState("Active");
  const [formCustomPassword, setFormCustomPassword] = useState("");
  const [formUseAutoPassword, setFormUseAutoPassword] = useState(true);
  const [formMustChangePassword, setFormMustChangePassword] = useState(true);

  // Edit User Form State
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editRole, setEditRole] = useState("Employee");
  const [editAccountStatus, setEditAccountStatus] = useState("Active");

  // Reset Password State
  const [adminReauthPassword, setAdminReauthPassword] = useState("");
  const [resetCustomPassword, setResetCustomPassword] = useState("");
  const [resetUseAutoPassword, setResetUseAutoPassword] = useState(true);
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);

  // Company Access Form State
  const [accessCompanyId, setAccessCompanyId] = useState("");
  const [accessBranchId, setAccessBranchId] = useState("");
  const [accessRole, setAccessRole] = useState("Employee");

  // Bulk Import State
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);

  const rolesList = [
    "Super Admin",
    "Company Admin",
    "IT Manager",
    "IT Technician",
    "Employee",
    "Auditor",
  ];

  // Fetch Users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = `/users?include_deleted=${includeDeleted}`;
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (roleFilter) query += `&role=${encodeURIComponent(roleFilter)}`;
      if (statusFilter) query += `&status=${encodeURIComponent(statusFilter)}`;

      const res = await api.get<UserItem[]>(query);
      setUsers(res.data || []);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Auxiliary Data
  const fetchAuxData = async () => {
    try {
      const [compRes, matRes] = await Promise.allSettled([
        api.get<UserCompanyOption[]>("/companies"),
        api.get<Record<string, Record<string, string[]>>>("/users/permissions/matrix"),
      ]);

      if (compRes.status === "fulfilled") {
        setCompanies(compRes.value.data || []);
        if (compRes.value.data?.length > 0 && !formCompanyId) {
          setFormCompanyId(compRes.value.data[0].id);
        }
      }
      if (matRes.status === "fulfilled") {
        setPermissionMatrix(matRes.value.data || null);
      }

      if (activeCompanyId) {
        try {
          const [brRes, depRes] = await Promise.all([
            api.get<UserBranchOption[]>(`/companies/${activeCompanyId}/branches`),
            api.get<UserDeptOption[]>(`/companies/${activeCompanyId}/departments`),
          ]);
          setBranches(brRes.data || []);
          setDepartments(depRes.data || []);
        } catch {}
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchUsers();
    }, 0);
    return () => window.clearTimeout(t);
  }, [search, roleFilter, statusFilter, includeDeleted, activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchAuxData();
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When formCompanyId changes, load branches for that company
  useEffect(() => {
    if (formCompanyId) {
      api.get<UserBranchOption[]>(`/companies/${formCompanyId}/branches`).then((res) => {
        setBranches(res.data || []);
      }).catch(() => setBranches([]));
    }
  }, [formCompanyId]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.account_status === "Active" && !u.is_deleted).length;
    const admins = users.filter((u) => u.is_superadmin || u.roles?.includes("Company Admin") || u.roles?.includes("Super Admin")).length;
    const lockedOrMustChange = users.filter((u) => u.is_locked || u.must_change_password).length;
    return { total, active, admins, lockedOrMustChange };
  }, [users]);

  // Handle Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<{ temporary_password?: string }>("/users", {
        full_name: formFullName.trim(),
        username: formUsername.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim() || null,
        company_id: formCompanyId || activeCompanyId,
        branch_id: formBranchId || null,
        department_id: formDepartmentId || null,
        role: formRole,
        account_status: formAccountStatus,
        password: formUseAutoPassword ? null : formCustomPassword || null,
        must_change_password: formMustChangePassword,
        send_invitation: true,
      });

      setShowAddModal(false);
      // Reset form
      setFormFullName("");
      setFormUsername("");
      setFormEmail("");
      setFormPhone("");
      setFormCustomPassword("");
      setFormRole("Employee");

      fetchUsers();

      // Show temporary password modal if generated
      if (res.data?.temporary_password) {
        setTempPasswordGenerated(res.data.temporary_password);
        setShowTempPassModal(true);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل إنشاء حساب المستخدم");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (user: UserItem) => {
    setSelectedUser(user);
    setEditFullName(user.full_name || "");
    setEditEmail(user.email || "");
    setEditPhone(user.phone || "");
    setEditJobTitle(user.job_title || "");
    setEditRole(user.roles?.[0] || "Employee");
    setEditAccountStatus(user.account_status || "Active");
    setEditBranchId(user.employee?.branch_id || "");
    setEditDepartmentId(user.employee?.department_id || "");
    setActionError("");
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.put(`/users/${selectedUser.id}`, {
        full_name: editFullName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
        job_title: editJobTitle.trim() || null,
        branch_id: editBranchId || null,
        department_id: editDepartmentId || null,
        role: editRole,
        account_status: editAccountStatus,
      });

      setShowEditModal(false);
      fetchUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تحديث بيانات المستخدم");
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle User Status (Activate / Suspend)
  const handleToggleStatus = async (user: UserItem) => {
    const newStatus = user.account_status === "Active" ? "Suspended" : "Active";
    const confirmMsg = newStatus === "Suspended"
      ? `هل أنت متأكد من تعليق حساب "${user.username}"؟ سيتم إلغاء جميع جلسات دخوله فوراً.`
      : `هل تريد تفعيل حساب "${user.username}" الآن؟`;

    if (!confirm(confirmMsg)) return;

    try {
      await api.post(`/users/${user.id}/status`, { account_status: newStatus });
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تغيير حالة الحساب");
    }
  };

  // Soft Delete User
  const handleDeleteUser = async (user: UserItem) => {
    if (!confirm(`هل أنت متأكد من حذف حساب "${user.username}"؟ سيتم إيقاف دخوله مع الحفاظ على سجل التدقيق والبيانات التاريخية.`)) {
      return;
    }
    try {
      await api.delete(`/users/${user.id}`);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف حساب المستخدم");
    }
  };

  // Restore User
  const handleRestoreUser = async (user: UserItem) => {
    try {
      await api.post(`/users/${user.id}/restore`);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل استعادة حساب المستخدم");
    }
  };

  // Unlock Account
  const handleUnlockUser = async (user: UserItem) => {
    try {
      await api.post(`/users/${user.id}/unlock`);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل إلغاء قفل الحساب");
    }
  };

  // Reset Password Modal
  const handleOpenReset = (user: UserItem) => {
    setSelectedUser(user);
    setAdminReauthPassword("");
    setResetCustomPassword("");
    setResetUseAutoPassword(true);
    setResetMustChangePassword(true);
    setActionError("");
    setShowResetModal(true);
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<{ temporary_password?: string }>(`/users/${selectedUser.id}/reset-password`, {
        new_password: resetUseAutoPassword ? null : resetCustomPassword || null,
        must_change_password: resetMustChangePassword,
        reauth_password: adminReauthPassword,
      });

      setShowResetModal(false);
      fetchUsers();

      if (res.data?.temporary_password) {
        setTempPasswordGenerated(res.data.temporary_password);
        setShowTempPassModal(true);
      } else {
        toast.success("تمت إعادة تعيين كلمة المرور بنجاح");
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل إعادة تعيين كلمة المرور");
    } finally {
      setActionLoading(false);
    }
  };

  // Manage Multi-Company Access
  const handleOpenCompanyAccess = async (user: UserItem) => {
    setSelectedUser(user);
    setAccessCompanyId(companies[0]?.id || "");
    setAccessBranchId("");
    setAccessRole("Employee");
    setActionError("");
    try {
      const res = await api.get<UserCompanyLink[]>(`/users/${user.id}/companies`);
      setUserCompanies(res.data || []);
      setShowCompanyModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل عضويات الشركات للمستخدم");
    }
  };

  const handleAssignCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !accessCompanyId) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.post(`/users/${selectedUser.id}/companies`, {
        company_id: accessCompanyId,
        branch_id: accessBranchId || null,
        role: accessRole,
        is_default: false,
      });

      const res = await api.get<UserCompanyLink[]>(`/users/${selectedUser.id}/companies`);
      setUserCompanies(res.data || []);
      fetchUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تعيين وصول الشركة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveCompanyAccess = async (companyId: string) => {
    if (!selectedUser) return;
    if (!confirm("هل أنت متأكد من إزالة وصول المستخدم لهذه الشركة؟")) return;
    try {
      await api.delete(`/users/${selectedUser.id}/companies/${companyId}`);
      const res = await api.get<UserCompanyLink[]>(`/users/${selectedUser.id}/companies`);
      setUserCompanies(res.data || []);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل إزالة صلاحية الشركة");
    }
  };

  // View User Activity
  const handleOpenActivity = async (user: UserItem) => {
    setSelectedUser(user);
    try {
      const res = await api.get<UserActivityLogItem[]>(`/users/${user.id}/activity?limit=30`);
      setUserActivity(res.data || []);
      setShowActivityModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل سجل النشاط للمستخدم");
    }
  };

  // Bulk Import Submit
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    setActionLoading(true);
    setActionError("");
    try {
      // Parse CSV/TSV or lines
      // Format: FullName, Username, Email, Phone, Role
      const lines = bulkText.trim().split("\n");
      const parsedUsers: Array<{ full_name: string; username: string; email: string; phone: string | null; role: string }> = [];

      for (const line of lines) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        if (parts.length >= 3) {
          parsedUsers.push({
            full_name: parts[0],
            username: parts[1],
            email: parts[2],
            phone: parts[3] || null,
            role: parts[4] || "Employee",
          });
        }
      }

      if (parsedUsers.length === 0) {
        throw new Error("لم يتم العثور على أسطر صالحة. تأكد من إدخال: الاسم، اسم المستخدم، البريد");
      }

      const res = await api.post<BulkImportResult>("/users/bulk-import", { users: parsedUsers });
      setBulkResult(res.data);
      fetchUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل استيراد المستخدمين");
    } finally {
      setActionLoading(false);
    }
  };

  // Copy temporary password
  const handleCopyTempPassword = () => {
    navigator.clipboard.writeText(tempPasswordGenerated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icons.Users size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  إدارة المستخدمين والتحكم في الوصول
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  إدارة الحسابات، صلاحيات الشركات المتعددة (Multi-Company)، وضوابط الصلاحيات RBAC
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowMatrixModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 transition"
            >
              <Icons.ShieldCheck size={16} className="text-primary" />
              <span>مصفوفة الصلاحيات</span>
            </button>

            <button
              onClick={() => {
                setBulkText("");
                setBulkResult(null);
                setActionError("");
                setShowBulkModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 transition"
            >
              <Icons.Download size={16} />
              <span>استيراد جماعي (Excel)</span>
            </button>

            <button
              onClick={() => {
                setActionError("");
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-sm"
            >
              <Icons.Plus size={18} />
              <span>إضافة مستخدم جديد</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="إجمالي حسابات المستخدمين"
            value={stats.total}
            icon={<Icons.Users size={18} />}
            accentColor="border-[#123D32]"
          />
          <StatsCard
            title="حسابات نشطة"
            value={stats.active}
            icon={<Icons.CheckCircle size={18} />}
            accentColor="border-emerald-500"
          />
          <StatsCard
            title="مسؤولو النظام والشركات"
            value={stats.admins}
            icon={<Icons.ShieldCheck size={18} />}
            accentColor="border-[#C5A46D]"
          />
          <StatsCard
            title="حسابات مقفلة أو مؤقتة"
            value={stats.lockedOrMustChange}
            icon={<Icons.Lock size={18} />}
            accentColor="border-amber-500"
          />
        </div>

        {/* Filters Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Icons.Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="البحث بالاسم، اسم المستخدم، البريد، أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">جميع الأدوار</option>
              {rolesList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">جميع الحالات</option>
              <option value="Active">نشط (Active)</option>
              <option value="Inactive">معطل (Inactive)</option>
              <option value="Suspended">معلق (Suspended)</option>
            </select>

            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <input
                type="checkbox"
                id="includeDeletedToggle"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
              <label htmlFor="includeDeletedToggle" className="text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                المحذوفات
              </label>
            </div>

            {(search || roleFilter || statusFilter || includeDeleted) && (
              <button
                onClick={() => {
                  setSearch("");
                  setRoleFilter("");
                  setStatusFilter("");
                  setIncludeDeleted(false);
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-red-600 transition"
              >
                إلغاء الفلاتر
              </button>
            )}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">اسم المستخدم</th>
                  <th className="px-6 py-4">الموظف والاتصال</th>
                  <th className="px-6 py-4">الصلاحية (الدور)</th>
                  <th className="px-6 py-4">عضويات الشركات</th>
                  <th className="px-6 py-4">حالة الحساب</th>
                  <th className="px-6 py-4">آخر تسجيل دخول</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <TableSkeleton variant="table" rows={5} cols={6} />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={<Icons.Users size={26} />}
                        title="لا يوجد مستخدمون مطابقون"
                        description="جرّب تغيير معايير البحث أو الدور الوظيفي"
                      />
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        u.is_deleted ? "bg-red-50/30 dark:bg-red-950/10 opacity-75" : ""
                      }`}
                    >
                      {/* Username */}
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{u.username}</span>
                          {u.is_superadmin && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                              Super Admin
                            </span>
                          )}
                          {u.is_locked && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 flex items-center gap-1">
                              <Icons.Lock size={10} />
                              مقفول
                            </span>
                          )}
                          {u.must_change_password && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              تغيير إلزامي
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{u.email}</div>
                      </td>

                      {/* Employee & Contact */}
                      <td className="px-6 py-4 text-xs">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {u.full_name || "—"}
                        </div>
                        {u.phone && (
                          <div className="text-slate-400 font-mono mt-0.5" dir="ltr">
                            {u.phone}
                          </div>
                        )}
                      </td>

                      {/* Role in Company */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((r: string) => (
                            <span
                              key={r}
                              className={`px-2 py-0.5 text-xs rounded-md font-semibold ${
                                r === "Super Admin" || r === "Company Admin"
                                  ? "bg-primary/10 text-primary border border-primary/20"
                                  : r === "IT Manager"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                  : r === "IT Technician"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Companies Memberships */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleOpenCompanyAccess(u)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                        >
                          <Icons.Building size={14} className="text-primary" />
                          <span>{u.companies?.length || 0} شركات</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <StatusBadge status={u.is_deleted ? "Archived" : u.account_status} />
                      </td>

                      {/* Last Login */}
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {u.last_login ? new Date(u.last_login).toLocaleString("ar-SA") : "لم يسجل بعد"}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Manage Companies */}
                          <button
                            onClick={() => handleOpenCompanyAccess(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="إدارة صلاحيات الشركات"
                          >
                            <Icons.Building size={16} />
                          </button>

                          {/* Edit User */}
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="تعديل المستخدم"
                          >
                            <Icons.Edit size={16} />
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => handleOpenReset(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="إعادة تعيين كلمة المرور"
                          >
                            <Icons.Key size={16} />
                          </button>

                          {/* Unlock if locked */}
                          {u.is_locked && (
                            <button
                              onClick={() => handleUnlockUser(u)}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                              title="إلغاء قفل الحساب"
                            >
                              <Icons.Lock size={16} />
                            </button>
                          )}

                          {/* Activate/Deactivate */}
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded-lg transition ${
                              u.account_status === "Active"
                                ? "text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            }`}
                            title={u.account_status === "Active" ? "تعطيل الحساب" : "تفعيل الحساب"}
                          >
                            {u.account_status === "Active" ? <Icons.X size={16} /> : <Icons.Check size={16} />}
                          </button>

                          {/* Activity History */}
                          <button
                            onClick={() => handleOpenActivity(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="سجل النشاط والدخول"
                          >
                            <Icons.Clock size={16} />
                          </button>

                          {/* Soft Delete or Restore */}
                          {u.is_deleted ? (
                            <button
                              onClick={() => handleRestoreUser(u)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                              title="استعادة الحساب"
                            >
                              <Icons.Refresh size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="حذف الحساب (حذف آمن)"
                            >
                              <Icons.Trash size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add User Wizard */}
        {showAddModal && (
          <Modal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            title="إضافة مستخدم جديد وتحديد الصلاحيات"
          >
            <form onSubmit={handleCreateUser} className="space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل للموظف *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: فيصل بن خالد الدوسري"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    اسم المستخدم للدخول (Username) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: faisal_ops"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    البريد الإلكتروني *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="faisal@investorgate.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف
                  </label>
                  <input
                    type="text"
                    placeholder="+9665..."
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الشركة الأساسية *
                  </label>
                  <select
                    required
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name_ar || c.name_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الدور والصلاحية (Role) *
                  </label>
                  <select
                    required
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-semibold text-primary"
                  >
                    {rolesList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الفرع (اختياري)
                  </label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">بدون تخصيص فرع</option>
                    {branches.map((b) => (
                      <option key={b.id || b.branch_id} value={b.id || b.branch_id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حالة الحساب
                  </label>
                  <select
                    value={formAccountStatus}
                    onChange={(e) => setFormAccountStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Active">نشط (Active)</option>
                    <option value="Inactive">معطل (Inactive)</option>
                  </select>
                </div>
              </div>

              {/* Password Option */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoPassToggle"
                    checked={formUseAutoPassword}
                    onChange={(e) => setFormUseAutoPassword(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4"
                  />
                  <label htmlFor="autoPassToggle" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    توليد كلمة مرور مؤقتة عشوائية آمنة تلقائياً (موصى به)
                  </label>
                </div>

                {!formUseAutoPassword && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة المرور المخصصة *
                    </label>
                    <input
                      type="password"
                      required={!formUseAutoPassword}
                      placeholder="أدخل كلمة مرور أولية..."
                      value={formCustomPassword}
                      onChange={(e) => setFormCustomPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="mustChangeToggle"
                    checked={formMustChangePassword}
                    onChange={(e) => setFormMustChangePassword(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4"
                  />
                  <label htmlFor="mustChangeToggle" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    إلزام المستخدم بتغيير كلمة المرور فور تسجيل الدخول الأول
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري الإنشاء..." : "إنشاء المستخدم وحفظ الصلاحيات"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Display Temporary Password */}
        {showTempPassModal && (
          <Modal
            isOpen={showTempPassModal}
            onClose={() => setShowTempPassModal(false)}
            title="بيانات الاعتماد المؤقتة للمستخدم"
          >
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 flex items-start gap-3">
                <Icons.CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>تم إنشاء كلمة المرور المؤقتة بنجاح:</strong>
                  <br />
                  يرجى تزويد الموظف بكلمة المرور المؤقتة التالية. سيُطلب منه تغييرها مباشرة عند تسجيل الدخول الأول. لن يتم عرض كلمة المرور مجدداً لأسباب أمنية.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  كلمة المرور المؤقتة:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={tempPasswordGenerated}
                    className="w-full px-4 py-3 text-base font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white select-all"
                  />
                  <button
                    onClick={handleCopyTempPassword}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90 transition"
                  >
                    {copied ? (
                      <>
                        <Icons.Check size={14} />
                        <span>تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Icons.Copy size={14} />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowTempPassModal(false)}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white transition"
                >
                  تم وحفظ
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Edit User */}
        {showEditModal && selectedUser && (
          <Modal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            title={`تعديل بيانات المستخدم (${selectedUser.username})`}
          >
            <form onSubmit={handleUpdateUser} className="space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    المسمى الوظيفي
                  </label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الصلاحية في الشركة الحالية
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-semibold text-primary"
                  >
                    {rolesList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حالة الحساب
                  </label>
                  <select
                    value={editAccountStatus}
                    onChange={(e) => setEditAccountStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Active">نشط (Active)</option>
                    <option value="Inactive">معطل (Inactive)</option>
                    <option value="Suspended">معلق (Suspended)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري التحديث..." : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Reset Password with Reauthentication */}
        {showResetModal && selectedUser && (
          <Modal
            isOpen={showResetModal}
            onClose={() => setShowResetModal(false)}
            title={`إعادة تعيين كلمة مرور (${selectedUser.username})`}
          >
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Icons.Lock size={16} />
                  <span>إعادة المصادقة الأمنية مطلوبة (Re-authentication)</span>
                </div>
                <div>
                  لتنفيذ هذا الإجراء الأمني الحساس، يرجى إدخال كلمة مرور حسابك لتأكيد الهوية. سيتم إلغاء جميع جلسات المستخدم النشطة فوراً.
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة مرور حسابك أنت (المسؤول) لتأكيد الإجراء *
                </label>
                <input
                  type="password"
                  required
                  placeholder="أدخل كلمة مرور دخولك الحالية..."
                  value={adminReauthPassword}
                  onChange={(e) => setAdminReauthPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="resetAutoPassToggle"
                    checked={resetUseAutoPassword}
                    onChange={(e) => setResetUseAutoPassword(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4"
                  />
                  <label htmlFor="resetAutoPassToggle" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    توليد كلمة مرور مؤقتة عشوائية آمنة (موصى به)
                  </label>
                </div>

                {!resetUseAutoPassword && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة المرور الجديدة المخصصة *
                    </label>
                    <input
                      type="password"
                      required={!resetUseAutoPassword}
                      placeholder="أدخل كلمة مرور جديدة..."
                      value={resetCustomPassword}
                      onChange={(e) => setResetCustomPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="resetMustChangeToggle"
                    checked={resetMustChangePassword}
                    onChange={(e) => setResetMustChangePassword(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4"
                  />
                  <label htmlFor="resetMustChangeToggle" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    إلزام المستخدم بتغيير كلمة المرور فور الدخول القادم
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري إعادة التعيين..." : "تأكيد وإعادة تعيين كلمة المرور"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Multi-Company Access Management */}
        {showCompanyModal && selectedUser && (
          <Modal
            isOpen={showCompanyModal}
            onClose={() => setShowCompanyModal(false)}
            title={`صلاحيات الشركات المتعددة (Multi-Company): ${selectedUser.username}`}
          >
            <div className="space-y-6">
              {/* Existing Companies List */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  الشركات المصرح للمستخدم بالوصول إليها:
                </h3>

                {userCompanies.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    لا توجد شركات مخصصة لهذا المستخدم حالياً
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {userCompanies.map((mc) => (
                      <div
                        key={mc.company_id}
                        className="p-3.5 flex items-center justify-between bg-white dark:bg-slate-900"
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{mc.company_name_ar}</span>
                            <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                              {mc.role}
                            </span>
                            {mc.is_default && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                الافتراضية
                              </span>
                            )}
                          </div>
                          {mc.branch_name && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              الفرع: {mc.branch_name}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoveCompanyAccess(mc.company_id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                        >
                          إزالة الوصول
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Company Access Form */}
              <form onSubmit={handleAssignCompany} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  منح وصول لشركة إضافية مع دور محدد:
                </h4>

                {actionError && (
                  <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                    {actionError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      الشركة *
                    </label>
                    <select
                      required
                      value={accessCompanyId}
                      onChange={(e) => setAccessCompanyId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company_name_ar || c.name_ar}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      الدور في هذه الشركة *
                    </label>
                    <select
                      required
                      value={accessRole}
                      onChange={(e) => setAccessRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-primary focus:outline-none"
                    >
                      {rolesList.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 transition"
                  >
                    {actionLoading ? "جاري التعيين..." : "تعيين صلاحية الشركة"}
                  </button>
                </div>
              </form>
            </div>
          </Modal>
        )}

        {/* Modal: Activity & Login History */}
        {showActivityModal && selectedUser && (
          <Modal
            isOpen={showActivityModal}
            onClose={() => setShowActivityModal(false)}
            title={`سجل النشاط والدخول: ${selectedUser.username}`}
          >
            <div className="space-y-4">
              {userActivity.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  لا يوجد نشاط مسجل لهذا المستخدم حتى الآن
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2.5">
                  {userActivity.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {log.action}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          النوع: {log.resource_type} • المعرف: {log.resource_id?.substring(0, 8)}...
                        </span>
                      </div>
                      <div className="text-left font-mono text-slate-400">
                        <div>{new Date(log.timestamp).toLocaleTimeString("ar-SA")}</div>
                        <div className="text-[10px]">{new Date(log.timestamp).toLocaleDateString("ar-SA")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* Modal: Bulk User Import */}
        {showBulkModal && (
          <Modal
            isOpen={showBulkModal}
            onClose={() => setShowBulkModal(false)}
            title="استيراد جماعي للمستخدمين (بدون كلمات مرور)"
          >
            <form onSubmit={handleBulkImport} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  صيغة البيانات المطلوبة (سطر لكل مستخدم مفصول بفواصل أو Tab):
                </div>
                <code className="block bg-slate-200/60 dark:bg-slate-700/60 p-2 rounded text-[11px] font-mono select-all">
                  الاسم الكامل, اسم المستخدم, البريد الإلكتروني, رقم الهاتف, الصلاحية
                </code>
                <div className="text-slate-500">
                  مثال: سعد العلي, saad_ops, saad@investorgate.com, +966500000001, IT Technician
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              {bulkResult && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                  <div className="font-bold">
                    تم استيراد {bulkResult.imported_count} مستخدم بنجاح!
                  </div>
                  {bulkResult.errors && bulkResult.errors.length > 0 && (
                    <div className="text-amber-700">
                      تنبيهات: {bulkResult.errors.join(" • ")}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  لصق أسطر البيانات هنا *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="الصق أسطر المستخدمين من ملف Excel أو CSV هنا..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري الاستيراد..." : "بدء الاستيراد الجماعي"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: RBAC Permissions Matrix Reference */}
        {showMatrixModal && (
          <Modal
            isOpen={showMatrixModal}
            onClose={() => setShowMatrixModal(false)}
            title="مصفوفة الصلاحيات والأدوار (RBAC Permission Matrix)"
          >
            <div className="space-y-4 max-h-[75vh] overflow-y-auto">
              <p className="text-xs text-slate-500">
                توضح هذه المصفوفة الصلاحيات الممنوحة لكل دور داخل المنظومة وفق متطلبات الأمان وعزل الشركات المتعددة.
              </p>

              {permissionMatrix ? (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-3">الدور (Role)</th>
                        <th className="p-3">الأقسام والصلاحيات الممنوحة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {Object.entries(permissionMatrix).map(([roleName, modulesMap]) => (
                        <tr key={roleName} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold text-primary align-top whitespace-nowrap">
                            {roleName}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(modulesMap).map(([mod, actions]) => (
                                actions.length > 0 && (
                                  <div
                                    key={mod}
                                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px]"
                                  >
                                    <strong className="text-slate-800 dark:text-slate-200">{mod}:</strong>{" "}
                                    <span className="text-slate-500">{actions.join(", ")}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-6 text-slate-400">جاري تحميل المصفوفة...</p>
              )}
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
