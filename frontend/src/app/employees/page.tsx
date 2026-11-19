"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import TelegramLinkingModal from "@/components/telegram/TelegramLinkingModal";
import { api, exportReportDownload } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface BranchOption {
  id: string;
  branch_name: string;
}

interface DepartmentOption {
  id: string;
  department_name: string;
  branch_id?: string | null;
}

interface EmployeeTaskItem {
  id: string;
  title: string;
  priority: string;
  due_date?: string | null;
  status: string;
}

interface EmployeeAssignedAsset {
  custody_id: string;
  asset_name: string;
  asset_code: string;
  asset_type: string;
  condition: string;
}

interface EmployeeRow {
  id: string;
  employee_number: string;
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  employment_status: string;
  company_name?: string | null;
  branch_id?: string | null;
  branch_ids?: string[];
  branch_names?: string[];
  department_id?: string | null;
  department_name?: string | null;
  manager_id?: string | null;
  telegram_username?: string | null;
  is_telegram_linked?: boolean;
  assets_count?: number;
  subscriptions_count?: number;
  assigned_assets?: EmployeeAssignedAsset[];
  is_deleted?: boolean;
}

interface EmployeeSummaryStats {
  total: number;
  active: number;
  suspended: number;
  left: number;
  with_assets: number;
  with_subscriptions: number;
  archived?: number;
}

interface EmployeeUserAccount {
  id: string;
  username: string;
  email?: string | null;
  full_name?: string | null;
  account_status?: string | null;
  is_superadmin?: boolean;
  last_login?: string | null;
  roles?: string[];
}

function getErrMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string } | null;
  return e?.response?.data?.detail || e?.message || fallback;
}

export default function EmployeesPage() {
  const { activeCompanyId, activeCompany, setActiveCompanyId, user } = useAuth();
  const companies = user?.companies || [];
  const toast = useToast();
  const [tab, setTab] = useState<"employees" | "users">("employees");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [summary, setSummary] = useState<EmployeeSummaryStats>({
    total: 0,
    active: 0,
    suspended: 0,
    left: 0,
    with_assets: 0,
    with_subscriptions: 0,
  });
  const [inspectedEmp, setInspectedEmp] = useState<EmployeeRow | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [users, setUsers] = useState<EmployeeUserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [empToArchive, setEmpToArchive] = useState<EmployeeRow | null>(null);
  const [archivingEmp, setArchivingEmp] = useState(false);

  // Modals
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showEditEmpModal, setShowEditEmpModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeRow | null>(null);
  const [empDetailsModal, setEmpDetailsModal] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"custody" | "tasks">("custody");
  const [empTasks, setEmpTasks] = useState<EmployeeTaskItem[]>([]);
  const [showAssignTaskModal, setShowAssignTaskModal] = useState(false);
  const [showTelegramLinkModal, setShowTelegramLinkModal] = useState(false);
  const [sendingEmpTest, setSendingEmpTest] = useState(false);
  const [empTestMessage, setEmpTestMessage] = useState<string | null>(null);

  // New employee form
  const [empNumber, setEmpNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [empStatus, setEmpStatus] = useState("Active");
  const [empRoleName, setEmpRoleName] = useState("Employee");
  const [empBranchIds, setEmpBranchIds] = useState<string[]>([]);
  const [empDeptId, setEmpDeptId] = useState("");
  const [empManagerId, setEmpManagerId] = useState("");
  const [empExtraCompanyIds, setEmpExtraCompanyIds] = useState<string[]>([]);
  const [createUserAccount, setCreateUserAccount] = useState(false);
  const [empUsername, setEmpUsername] = useState("");
  const [empAccountPassword, setEmpAccountPassword] = useState("");
  const [submittingEmp, setSubmittingEmp] = useState(false);
  const [empFormError, setEmpFormError] = useState<string | null>(null);
  const [tempPasswordBanner, setTempPasswordBanner] = useState<{ username: string; password: string } | null>(null);

  // Canonical Branches, Departments & Filter state
  const [selectedFilterBranchIds, setSelectedFilterBranchIds] = useState<string[]>([]);
  const [companyBranches, setCompanyBranches] = useState<BranchOption[]>([]);
  const [companyDepartments, setCompanyDepartments] = useState<DepartmentOption[]>([]);

  // Edit employee form
  const [editEmpId, setEditEmpId] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("Active");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [editDeptId, setEditDeptId] = useState("");
  const [editManagerId, setEditManagerId] = useState("");
  const [editChangeReason, setEditChangeReason] = useState("");
  const [submittingEditEmp, setSubmittingEditEmp] = useState(false);
  const [editEmpError, setEditEmpError] = useState<string | null>(null);

  // New user form
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("Employee");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");

  // Quick Task Assign form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskDueDate, setTaskDueDate] = useState("");

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      let url = `/employees?search=${encodeURIComponent(debouncedSearch)}`;
      if (showArchived) {
        url += `&include_archived=true`;
      } else if (statusFilter) {
        url += `&status=${statusFilter}`;
      }
      if (selectedFilterBranchIds.length > 0) {
        url += `&branch_ids=${encodeURIComponent(selectedFilterBranchIds.join(","))}`;
      }
      const [res, sumRes] = await Promise.all([
        api.get<EmployeeRow[]>(url),
        api.get<EmployeeSummaryStats>("/employees/summary").catch(() => null),
      ]);
      const list = res.data || [];
      setEmployees(list);
      setInspectedEmp((prev) => {
        if (prev) {
          const match = list.find((item) => item.id === prev.id);
          if (match) return match;
        }
        return list[0] || null;
      });
      if (sumRes?.data) {
        setSummary(sumRes.data);
      } else {
        setSummary({
          total: list.length,
          active: list.filter((e) => e.employment_status === "Active").length,
          suspended: list.filter((e) => e.employment_status === "Suspended" || e.employment_status === "On Leave").length,
          left: list.filter((e) => e.employment_status === "Terminated" || e.employment_status === "Left").length,
          with_assets: list.filter((e) => (e.assets_count ?? e.assigned_assets?.length ?? 0) > 0).length,
          with_subscriptions: list.filter((e) => (e.subscriptions_count ?? 0) > 0).length,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل قائمة الموظفين");
    } finally {
      setLoading(false);
    }
  };

  const handleExportEmployees = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      await exportReportDownload("employees", "csv", activeCompanyId, "employees_report.csv");
      toast.success("تم تصدير سجل الموظفين بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تصدير سجل الموظفين");
    } finally {
      setExportingCsv(false);
    }
  };

  useEffect(() => {
    if (!activeCompanyId) return;
    Promise.all([
      api.get<BranchOption[]>(`/companies/${activeCompanyId}/branches`),
      api.get<DepartmentOption[]>(`/companies/${activeCompanyId}/departments`),
    ])
      .then(([bRes, dRes]) => {
        const brs = bRes.data || [];
        setCompanyBranches(brs);
        setCompanyDepartments(dRes.data || []);
        if (brs.length > 0 && empBranchIds.length === 0) {
          setEmpBranchIds([brs[0].id]);
        }
      })
      .catch(() => {});
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get<EmployeeUserAccount[]>(`/employees/users/list?search=${encodeURIComponent(debouncedSearch)}`);
      setUsers(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل حسابات المستخدمين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (tab === "employees") void fetchEmployees();
      else void fetchUsers();
    }, 0);
    return () => window.clearTimeout(t);
  }, [tab, activeCompanyId, statusFilter, showArchived, debouncedSearch, selectedFilterBranchIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingEmp) return;
    setEmpFormError(null);

    const cleanNum = empNumber.trim();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    if (!cleanNum || !cleanName) {
      const msg = "الرقم الوظيفي والاسم الكامل مطلوبان";
      setEmpFormError(msg);
      toast.error(msg);
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const msg = "يرجى إدخال بريد إلكتروني صحيح";
      setEmpFormError(msg);
      toast.error(msg);
      return;
    }
    if (createUserAccount && (!empUsername.trim() || !cleanEmail)) {
      const msg = "اسم المستخدم والبريد الإلكتروني مطلوبان لإنشاء حساب الدخول";
      setEmpFormError(msg);
      toast.error(msg);
      return;
    }
    const primaryBid = empBranchIds[0];
    const pickedDept = companyDepartments.find((d) => d.id === empDeptId);
    if (pickedDept?.branch_id && primaryBid && pickedDept.branch_id !== primaryBid) {
      const msg = "القسم الإداري المختار مرتبط بفرع آخر غير الفرع الرئيسي المحدد";
      setEmpFormError(msg);
      toast.error(msg);
      return;
    }

    setSubmittingEmp(true);
    try {
      const targetCompanies =
        empExtraCompanyIds.length > 0 && activeCompanyId
          ? [activeCompanyId, ...empExtraCompanyIds.filter((c) => c !== activeCompanyId)]
          : undefined;
      const createRes = await api.post<{ temporary_password?: string }>("/employees", {
        company_id: activeCompanyId,
        employee_number: cleanNum,
        full_name: cleanName,
        job_title: jobTitle.trim() || undefined,
        email: cleanEmail || undefined,
        phone: phone.trim() || undefined,
        employment_status: empStatus,
        branch_ids: empBranchIds.length > 0 ? empBranchIds : undefined,
        branch_id: empBranchIds[0] || undefined,
        department_id: empDeptId || undefined,
        manager_id: empManagerId || undefined,
        role_name: empRoleName,
        company_ids: targetCompanies,
        create_user_account: createUserAccount,
        username: createUserAccount ? empUsername.trim() : undefined,
        password: createUserAccount && empAccountPassword ? empAccountPassword : undefined,
      });
      if (createRes.data?.temporary_password) {
        setTempPasswordBanner({ username: empUsername.trim(), password: createRes.data.temporary_password });
      }
      setShowAddEmpModal(false);
      setEmpFormError(null);
      setEmpNumber("");
      setFullName("");
      setJobTitle("");
      setEmail("");
      setPhone("");
      setEmpDeptId("");
      setEmpManagerId("");
      setEmpExtraCompanyIds([]);
      setCreateUserAccount(false);
      setEmpUsername("");
      setEmpAccountPassword("");
      toast.success("تم إضافة الموظف بنجاح وربطه بالفروع المعتمدة");
      fetchEmployees();
    } catch (err: unknown) {
      const msg = getErrMsg(err, "فشل إضافة الموظف");
      setEmpFormError(msg);
      toast.error(msg);
    } finally {
      setSubmittingEmp(false);
    }
  };

  const openEditEmployee = (emp: EmployeeRow) => {
    setEditEmpId(emp.id);
    setEditFullName(emp.full_name);
    setEditJobTitle(emp.job_title || "");
    setEditEmail(emp.email || "");
    setEditPhone(emp.phone || "");
    setEditStatus(emp.employment_status || "Active");
    const initBranches =
      Array.isArray(emp.branch_ids) && emp.branch_ids.length > 0
        ? emp.branch_ids
        : emp.branch_id
          ? [emp.branch_id]
          : [];
    setEditBranchIds(initBranches);
    setEditDeptId(emp.department_id || "");
    setEditManagerId(emp.manager_id || "");
    setEditChangeReason("");
    setEditEmpError(null);
    setShowEditEmpModal(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingEditEmp) return;
    setEditEmpError(null);

    const cleanName = editFullName.trim();
    const cleanEmail = editEmail.trim();
    if (!cleanName) {
      const msg = "الاسم الكامل مطلوب";
      setEditEmpError(msg);
      toast.error(msg);
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const msg = "يرجى إدخال بريد إلكتروني صحيح";
      setEditEmpError(msg);
      toast.error(msg);
      return;
    }

    setSubmittingEditEmp(true);
    try {
      await api.put(`/employees/${editEmpId}`, {
        full_name: cleanName,
        job_title: editJobTitle.trim() || undefined,
        email: cleanEmail || undefined,
        phone: editPhone.trim() || undefined,
        employment_status: editStatus,
        branch_ids: editBranchIds.length > 0 ? editBranchIds : undefined,
        branch_id: editBranchIds[0] || undefined,
        department_id: editDeptId || undefined,
        manager_id: editManagerId || undefined,
        change_reason: editChangeReason.trim() || undefined,
      });
      setShowEditEmpModal(false);
      setEditEmpError(null);
      toast.success("تم تحديث بيانات الموظف وسجل التسكين بنجاح");
      fetchEmployees();
    } catch (err: unknown) {
      const msg = getErrMsg(err, "فشل تحديث بيانات الموظف");
      setEditEmpError(msg);
      toast.error(msg);
    } finally {
      setSubmittingEditEmp(false);
    }
  };

  const handleOpenArchiveModal = (emp: EmployeeRow) => {
    setEmpToArchive(emp);
    setShowArchiveModal(true);
  };

  const handleConfirmArchive = async () => {
    if (!empToArchive) return;
    setArchivingEmp(true);
    try {
      await api.delete(`/employees/${empToArchive.id}`);
      toast.success(`تمت أرشفة الموظف "${empToArchive.full_name}" بنجاح وحفظ كافة سجلاته التاريخية بأمان`);
      setShowArchiveModal(false);
      setEmpToArchive(null);
      void fetchEmployees();
    } catch (err: unknown) {
      toast.error(getErrMsg(err, "فشل أرشفة الموظف"));
    } finally {
      setArchivingEmp(false);
    }
  };

  const handleRestoreEmployee = async (empId: string, name: string) => {
    try {
      await api.post(`/employees/${empId}/restore`);
      toast.success(`تمت استعادة الموظف "${name}" بنجاح وتفعيل حالته إلى نشط`);
      void fetchEmployees();
    } catch (err: unknown) {
      toast.error(getErrMsg(err, "فشل استعادة الموظف"));
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/employees/users/create", {
        username,
        email: userEmail,
        password: userPassword,
        account_status: "Active",
        employee_id: targetEmployeeId || undefined,
        role_names: [selectedRole],
      });
      setShowAddUserModal(false);
      setUsername("");
      setUserEmail("");
      setUserPassword("");
      fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrMsg(err, "فشل إنشاء حساب المستخدم"));
    }
  };

  const openEmployeeDetails = async (emp: EmployeeRow) => {
    try {
      const [empRes, taskRes] = await Promise.all([
        api.get<EmployeeRow>(`/employees/${emp.id}`),
        api.get<EmployeeTaskItem[]>(`/tasks?assigned_to_id=${emp.id}`),
      ]);
      setSelectedEmp(empRes.data);
      setEmpTasks(taskRes.data || []);
      setDetailsTab("custody");
      setEmpTestMessage(null);
      setEmpDetailsModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendDirectEmpTest = async (empId: string) => {
    setSendingEmpTest(true);
    setEmpTestMessage(null);
    try {
      const res = await api.post(`/telegram/test-notification`, {
        employee_id: empId,
        custom_message: `🔔 مرحباً ${selectedEmp?.full_name}، رسالة اختبار مباشرة للتحقق من الاتصال عبر منصة Investor Gate OS.`,
      });
      setEmpTestMessage(res.message || "تم إرسال رسالة الاختبار لحساب تليجرام بنجاح!");
    } catch (err: unknown) {
      setEmpTestMessage(getErrMsg(err, "فشل إرسال رسالة الاختبار"));
    } finally {
      setSendingEmpTest(false);
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    try {
      await api.post("/tasks", {
        company_id: activeCompanyId,
        title: taskTitle,
        description: taskDesc,
        priority: taskPriority,
        assigned_to_id: selectedEmp.id,
        due_date: taskDueDate || null,
        status: "Pending",
      });
      setShowAssignTaskModal(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskDueDate("");

      // Refresh employee tasks
      const taskRes = await api.get<EmployeeTaskItem[]>(`/tasks?assigned_to_id=${selectedEmp.id}`);
      setEmpTasks(taskRes.data || []);
    } catch (err: unknown) {
      toast.error(getErrMsg(err, "فشل إسناد المهمة"));
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <PageHeader
        title="الموظفون"
        description="إدارة بيانات الموظفين وربطهم بالشركات والفروع والأصول والاشتراكات."
        icon={<Icons.Users size={20} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-200/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTab("employees")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  tab === "employees"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                سجل الموظفين
              </button>
              <button
                type="button"
                onClick={() => setTab("users")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  tab === "users"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                حسابات المستخدمين
              </button>
            </div>

            {canManage && tab === "users" && (
              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Icons.Plus size={16} />
                <span>إنشاء حساب مستخدم</span>
              </button>
            )}
          </div>
        }
      />

      {tempPasswordBanner && (
        <div role="status" className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-bold text-emerald-900">تم إنشاء حساب الدخول المؤقت للمستخدم: </span>
            <code className="px-2 py-0.5 rounded bg-white border border-emerald-200 font-mono font-bold text-[#123D32]">{tempPasswordBanner.username}</code>
            <span className="mx-1.5 text-emerald-700">كلمة المرور المؤقتة:</span>
            <code className="px-2 py-0.5 rounded bg-white border border-emerald-200 font-mono font-bold text-rose-700">{tempPasswordBanner.password}</code>
          </div>
          <button
            type="button"
            onClick={() => setTempPasswordBanner(null)}
            className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-semibold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* 6 Top Harmonized KPIs */}
      {tab === "employees" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">{summary.total}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">إجمالي الموظفين</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0">
              <Icons.Users size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#187A5A]">{summary.active}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">موظف نشط</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
              <Icons.CheckCircle size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-amber-700">{summary.suspended}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">موقوف</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Icons.Clock size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-rose-700">{summary.left}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">مغادر</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Icons.User size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#123D32]">{summary.with_assets}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">لهم أصول</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
              <Icons.Assets size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">{summary.with_subscriptions}</div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">لهم اشتراكات</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#C5A46D]/15 text-[#8A6D3B] flex items-center justify-center shrink-0">
              <Icons.Subscriptions size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Unified Inline Search & Filter Toolbar matching Image 4 */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Icons.Search size={15} className="text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="بحث في الموظفين والمستخدمين"
            placeholder="بحث في الموظفين ..."
            className="w-full ps-9 pe-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm outline-none focus:border-[#187A5A] focus:bg-white"
          />
        </div>

        {tab === "employees" && (
          <>
            <select
              aria-label="الشركة"
              value={activeCompanyId || ""}
              onChange={(e) => {
                if (e.target.value && setActiveCompanyId) setActiveCompanyId(e.target.value);
              }}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </select>

            <select
              aria-label="تصفية حسب حالة التوظيف"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">الحالة: الكل</option>
              <option value="Active">نشط (Active)</option>
              <option value="On Leave">في إجازة (On Leave)</option>
              <option value="Suspended">موقوف (Suspended)</option>
              <option value="Terminated">مغادر (Terminated)</option>
              <option value="Archived">مؤرشف (Archived)</option>
            </select>

            <select
              aria-label="تصفية حسب الفرع"
              value={selectedFilterBranchIds[0] || ""}
              onChange={(e) => setSelectedFilterBranchIds(e.target.value ? [e.target.value] : [])}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">الفرع: الكل</option>
              {companyBranches.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.branch_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={`motion-control inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                showArchived
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
              title="عرض الموظفين المؤرشفين واستعادتهم"
            >
              <Icons.Archive size={14} />
              <span>{showArchived ? "سجل النشطين" : "عرض الأرشيف"}</span>
              {typeof summary.archived === "number" && summary.archived > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                  {summary.archived}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleExportEmployees()}
              disabled={exportingCsv}
              className="motion-control inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <Icons.Download size={14} />
              <span>{exportingCsv ? "جاري التصدير..." : "تصدير"}</span>
            </button>

            <Link
              href="/reports"
              className="motion-control inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <Icons.FileText size={14} />
              <span>استيراد Excel</span>
            </Link>

            {canManage && (
              <button
                type="button"
                onClick={() => { setEmpFormError(null); setShowAddEmpModal(true); }}
                className="motion-control inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Icons.Plus size={15} />
                <span>إضافة موظف</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={tab === "employees" ? 10 : 6} />
        ) : tab === "employees" ? (
          employees.length === 0 ? (
            <EmptyState
              icon={<Icons.Users size={26} />}
              title="لا يوجد موظفون مطابقون"
              description="يمكنك تعديل معايير البحث أو إضافة موظف جديد للربط مع النظام و Telegram"
              action={
                (search || statusFilter || selectedFilterBranchIds.length > 0) ? (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setStatusFilter(""); setSelectedFilterBranchIds([]); }}
                    className="motion-control px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    عرض جميع الموظفين
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">الموظف</th>
                    <th className="p-3">الرقم الوظيفي</th>
                    <th className="p-3">الشركة</th>
                    <th className="p-3">الفرع</th>
                    <th className="p-3">المسمى الوظيفي</th>
                    <th className="p-3 text-center">الأصول</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3 text-center">الاشتراكات</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((emp, idx) => {
                    const isSelectedRow = inspectedEmp?.id === emp.id;
                    const assetsCnt = emp.assets_count ?? emp.assigned_assets?.length ?? 0;
                    const subsCnt = emp.subscriptions_count ?? 0;
                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setInspectedEmp(emp)}
                        className={`hover:bg-emerald-50/40 transition-colors cursor-pointer ${
                          isSelectedRow ? "bg-emerald-50/50" : ""
                        }`}
                      >
                        <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-[#123D32]/10 text-[#123D32] flex items-center justify-center text-[11px] font-bold shrink-0">
                              {(emp.full_name || "م")[0]}
                            </span>
                            <Link
                              href={`/employees/${emp.id}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="hover:text-[#187A5A] hover:underline truncate"
                            >
                              {emp.full_name}
                            </Link>
                          </div>
                        </td>
                        <td className="p-3 font-mono font-bold text-[#187A5A]">
                          <bdi dir="ltr">{emp.employee_number}</bdi>
                        </td>
                        <td className="p-3 text-slate-700 font-semibold">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-[#123D32] text-[11px]">
                            <Icons.Building size={12} className="text-[#187A5A]" />
                            <span>{emp.company_name || activeCompany?.name_ar || "بوابة المستثمر"}</span>
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">
                          {Array.isArray(emp.branch_names) && emp.branch_names.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Icons.MapPin size={12} className="text-[#187A5A] shrink-0" />
                              <span className="text-[11px] font-medium">{emp.branch_names.join("، ")}</span>
                            </div>
                          ) : (
                            emp.department_name || "—"
                          )}
                        </td>
                        <td className="p-3 text-slate-700">{emp.job_title || "—"}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700">
                            <Icons.Laptop size={13} />
                            <span>{assetsCnt}</span>
                          </span>
                        </td>
                        <td className="p-3">
                          {emp.employment_status === "Archived" || emp.is_deleted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <Icons.Archive size={11} />
                              <span>مؤرشف</span>
                            </span>
                          ) : (
                            <StatusBadge status={emp.employment_status} />
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-sky-700">
                            <Icons.Subscriptions size={13} />
                            <span>{subsCnt}</span>
                          </span>
                        </td>
                        <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={`/employees/${emp.id}`}
                              className="motion-control px-2 py-1 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white font-semibold text-[11px] transition-colors"
                              title="ملف الموظف 360°"
                            >
                              ملف 360°
                            </Link>
                            <button
                              type="button"
                              onClick={() => openEmployeeDetails(emp)}
                              aria-label={`عرض تفاصيل وعهد ${emp.full_name}`}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-[#187A5A] hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="العهد والمهام و Telegram"
                            >
                              <Icons.Eye size={14} />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditEmployee(emp)}
                                  aria-label={`تعديل الموظف ${emp.full_name}`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="تعديل الموظف"
                                >
                                  <Icons.Edit size={14} />
                                </button>
                                {emp.employment_status === "Archived" || emp.is_deleted ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreEmployee(emp.id, emp.full_name)}
                                    aria-label={`استعادة الموظف ${emp.full_name}`}
                                    className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                                    title="استعادة الموظف وتفعيل حالته"
                                  >
                                    <Icons.RotateCcw size={14} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenArchiveModal(emp)}
                                    aria-label={`أرشفة وحفظ الموظف ${emp.full_name}`}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                                    title="أرشفة / حذف الموظف"
                                  >
                                    <Icons.Trash size={14} />
                                  </button>
                                )}
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
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Icons.User size={26} />}
            title="لا توجد حسابات مستخدمين مطابقة"
            description="تأكد من كلمات البحث أو أنشئ حساباً جديداً"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3.5">اسم المستخدم</th>
                  <th className="p-3.5">الموظف المرتبط</th>
                  <th className="p-3.5">البريد الإلكتروني</th>
                  <th className="p-3.5">الأدوار والصلاحيات</th>
                  <th className="p-3.5">حالة الحساب</th>
                  <th className="p-3.5">آخر تسجيل دخول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-900">
                      <bdi dir="ltr">{u.username}</bdi>
                      {u.is_superadmin && (
                        <span className="ms-2 px-1.5 py-0.5 bg-purple-50 text-purple-800 rounded text-[10px]">
                          Super Admin
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-800 font-semibold">
                      {u.full_name || "بدون ارتباط"}
                    </td>
                    <td className="p-3.5 font-mono text-slate-600"><bdi dir="ltr">{u.email}</bdi></td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: string) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-semibold"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={u.account_status || "Active"} />
                    </td>
                    <td className="p-3.5 text-slate-600 font-mono">
                      <bdi dir="ltr">{u.last_login ? new Date(u.last_login).toLocaleString("ar-SA") : "لم يسجل بعد"}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom 3 Cards matching Image 4 (Employee Inspector, Linking Rules, ERD Linkage Diagram) */}
      {tab === "employees" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
          {/* Card 1: بيانات الموظف (Live Inspector) */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icons.User size={16} className="text-[#187A5A]" />
                <span>بيانات الموظف</span>
              </h2>
              {inspectedEmp && (
                <Link
                  href={`/employees/${inspectedEmp.id}`}
                  className="text-[11px] font-bold text-[#187A5A] hover:underline"
                >
                  فتح ملف 360° ←
                </Link>
              )}
            </div>

            {inspectedEmp ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-semibold">الشركة *</span>
                  <span className="font-bold text-slate-900">
                    {inspectedEmp.company_name || activeCompany?.name_ar || "بوابة المستثمر"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-semibold">الاسم والرقم</span>
                  <span className="font-bold text-slate-900">
                    {inspectedEmp.full_name} ({inspectedEmp.employee_number})
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-semibold">الفرع *</span>
                  <span className="font-bold text-[#123D32]">
                    {inspectedEmp.branch_names?.length
                      ? inspectedEmp.branch_names.join("، ")
                      : "غير محدد"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-semibold">القسم والمسمى</span>
                  <span className="font-semibold text-slate-800">
                    {inspectedEmp.department_name || "—"} • {inspectedEmp.job_title || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => openEmployeeDetails(inspectedEmp)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] cursor-pointer"
                  >
                    العهد والمهام و Telegram
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openEditEmployee(inspectedEmp)}
                      className="px-3 py-1.5 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white font-semibold text-[11px] cursor-pointer"
                    >
                      تعديل الربط
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">
                اختر موظفاً من الجدول لعرض بيانات الربط الخاصة به
              </p>
            )}
          </section>

          {/* Card 2: قواعد ربط الموظف */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Icons.ShieldCheck size={16} className="text-[#187A5A]" />
              <h2 className="text-sm font-bold text-slate-900">قواعد ربط الموظف</h2>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-700 bg-slate-50/70 rounded-xl p-3.5 border border-slate-100">
              <li className="flex items-start gap-2">
                <Icons.CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-900">إلزامي:</strong> ربط الموظف بشركة واحدة معتمدة.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icons.CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-900">اختياري:</strong> ربط الموظف بفرع واحد أو أكثر والقسم التابع.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icons.CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-900">الربط التلقائي:</strong> تتبع الأصول والعهد والاشتراكات حسب الشركة والفرع.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icons.CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  إمكانية تعديل الفرع أو القسم مع الاحتفاظ بسجل التاريخ التنظيمي.
                </span>
              </li>
            </ul>
          </section>

          {/* Card 3: نمذجة الربط */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Icons.Info size={16} className="text-[#187A5A]" />
              <h2 className="text-sm font-bold text-slate-900">نمذجة الربط</h2>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 py-2">
              <div className="px-6 py-2 rounded-xl bg-[#123D32] text-white text-xs font-bold shadow-xs">
                الموظف
              </div>

              <div className="w-full h-px bg-emerald-200 relative">
                <span className="w-px h-4 bg-emerald-300 absolute left-1/2 -top-4" />
              </div>

              <div className="grid grid-cols-3 gap-2 w-full">
                <Link
                  href="/companies"
                  className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-center hover:border-[#187A5A] transition-colors"
                >
                  <Icons.Building size={16} className="mx-auto text-[#123D32] mb-1" />
                  <div className="text-[11px] font-bold text-slate-900">شركة</div>
                  <div className="text-[10px] text-slate-500">(أساسية)</div>
                </Link>

                <Link
                  href="/subscriptions"
                  className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-center hover:border-[#187A5A] transition-colors"
                >
                  <Icons.Subscriptions size={16} className="mx-auto text-[#8A6D3B] mb-1" />
                  <div className="text-[11px] font-bold text-slate-900">اشتراكات</div>
                  <div className="text-[10px] text-slate-500">(برامج وخدمات)</div>
                </Link>

                <Link
                  href="/assets"
                  className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-center hover:border-[#187A5A] transition-colors"
                >
                  <Icons.Laptop size={16} className="mx-auto text-[#187A5A] mb-1" />
                  <div className="text-[11px] font-bold text-slate-900">أصول</div>
                  <div className="text-[10px] text-slate-500">(أجهزة وعهد)</div>
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddEmpModal}
        onClose={() => setShowAddEmpModal(false)}
        title="إضافة موظف أو فني جديد"
      >
        <form onSubmit={handleCreateEmployee} noValidate className="space-y-4">
          {empFormError && (
            <div role="alert" aria-live="assertive" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
              {empFormError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-emp-number" className="block text-xs font-bold text-slate-700 mb-1">
                الرقم الوظيفي *
              </label>
              <input
                id="add-emp-number"
                type="text"
                required
                value={empNumber}
                onChange={(e) => setEmpNumber(e.target.value)}
                placeholder="EMP-001"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-emp-name" className="block text-xs font-bold text-slate-700 mb-1">
                الاسم الكامل *
              </label>
              <input
                id="add-emp-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="الاسم الثلاثي"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="add-emp-title" className="block text-xs font-bold text-slate-700 mb-1">
              المسمى الوظيفي
            </label>
            <input
              id="add-emp-title"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="مثال: مهندس شبكات / فني دعم فني"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-emp-email" className="block text-xs font-bold text-slate-700 mb-1">
                البريد الإلكتروني
              </label>
              <input
                id="add-emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.sa"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
            <div>
              <label htmlFor="add-emp-phone" className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف
              </label>
              <input
                id="add-emp-phone"
                type="text"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 50 000 0000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] text-left font-mono"
              />
            </div>
          </div>

          {/* Multi-Branch Selection (Canonical 5 Branches) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الفروع المعتمدة (الأول المختار هو الفرع الرئيسي) *
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              {companyBranches.map((br) => {
                const idx = empBranchIds.indexOf(br.id);
                const checked = idx !== -1;
                return (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => {
                      if (checked && empBranchIds.length > 1) {
                        setEmpBranchIds(empBranchIds.filter((x) => x !== br.id));
                      } else if (!checked) {
                        setEmpBranchIds([...empBranchIds, br.id]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      checked
                        ? "bg-[#123D32] text-white border-[#123D32]"
                        : "bg-white text-slate-700 border-slate-200 hover:border-[#187A5A]"
                    }`}
                  >
                    {idx === 0 ? "★ أساسي: " : checked ? "✓ مساند: " : ""}{br.branch_name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Secondary Companies (Multi-Company Staffing) */}
          {(user?.companies || []).length > 1 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                منشآت إضافية تابعة لنفس الشخص (اختياري)
              </label>
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {(user?.companies || [])
                  .filter((c) => c.id !== activeCompanyId)
                  .map((c) => {
                    const picked = empExtraCompanyIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setEmpExtraCompanyIds((prev) =>
                            picked ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          picked
                            ? "bg-[#187A5A] text-white border-[#187A5A]"
                            : "bg-white text-slate-700 border-slate-200 hover:border-[#187A5A]"
                        }`}
                      >
                        {picked ? "✓ " : ""}{c.name_ar}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-emp-dept" className="block text-xs font-bold text-slate-700 mb-1">
                القسم الإداري
              </label>
              <select
                id="add-emp-dept"
                value={empDeptId}
                onChange={(e) => setEmpDeptId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">اختر القسم...</option>
                {companyDepartments
                  .filter((d) => !d.branch_id || !empBranchIds[0] || d.branch_id === empBranchIds[0])
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.department_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="add-emp-manager" className="block text-xs font-bold text-slate-700 mb-1">
                المدير المباشر
              </label>
              <select
                id="add-emp-manager"
                value={empManagerId}
                onChange={(e) => setEmpManagerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">بدون مدير مباشر / الإدارة التنفيذية</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} (#{e.employee_number})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحالة الوظيفية
              </label>
              <select
                value={empStatus}
                onChange={(e) => setEmpStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Active">على رأس العمل (Active)</option>
                <option value="On Leave">في إجازة (On Leave)</option>
                <option value="Suspended">موقوف (Suspended)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الدور الوظيفي في المنشأة
              </label>
              <select
                value={empRoleName}
                onChange={(e) => setEmpRoleName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Employee">موظف (Employee)</option>
                <option value="IT Technician">فني تقنية معلومات (IT Technician)</option>
                <option value="IT Manager">مدير تقنية معلومات (IT Manager)</option>
                <option value="Company Admin">مدير شركة (Company Admin)</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={createUserAccount}
                onChange={(e) => setCreateUserAccount(e.target.checked)}
                className="rounded border-slate-300 text-[#123D32]"
              />
              إنشاء حساب دخول للنظام لهذا الموظف تلقائياً
            </label>
            {createUserAccount && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="add-emp-username" className="block text-[11px] font-bold text-slate-700 mb-1">اسم المستخدم *</label>
                  <input
                    id="add-emp-username"
                    type="text"
                    required={createUserAccount}
                    value={empUsername}
                    onChange={(e) => setEmpUsername(e.target.value)}
                    placeholder="emp.username"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#187A5A] font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="add-emp-password" className="block text-[11px] font-bold text-slate-700 mb-1">كلمة المرور (توليد مؤقت إن تركت فارغة)</label>
                  <input
                    id="add-emp-password"
                    type="password"
                    value={empAccountPassword}
                    onChange={(e) => setEmpAccountPassword(e.target.value)}
                    placeholder="كلمة مرور قوية..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#187A5A]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddEmpModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submittingEmp}
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {submittingEmp ? "جارٍ الحفظ..." : "حفظ الموظف"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={showEditEmpModal}
        onClose={() => setShowEditEmpModal(false)}
        title="تعديل بيانات الموظف والتسكين"
      >
        <form onSubmit={handleUpdateEmployee} noValidate className="space-y-4">
          {editEmpError && (
            <div role="alert" aria-live="assertive" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
              {editEmpError}
            </div>
          )}
          <div>
            <label htmlFor="edit-emp-name" className="block text-xs font-bold text-slate-700 mb-1">
              الاسم الكامل *
            </label>
            <input
              id="edit-emp-name"
              type="text"
              required
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              المسمى الوظيفي
            </label>
            <input
              type="text"
              value={editJobTitle}
              onChange={(e) => setEditJobTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
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
                dir="ltr"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] text-left font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الفروع المعتمدة للموظف
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              {companyBranches.map((br) => {
                const idx = editBranchIds.indexOf(br.id);
                const checked = idx !== -1;
                return (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => {
                      if (checked && editBranchIds.length > 1) {
                        setEditBranchIds(editBranchIds.filter((x) => x !== br.id));
                      } else if (!checked) {
                        setEditBranchIds([...editBranchIds, br.id]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      checked
                        ? "bg-[#123D32] text-white border-[#123D32]"
                        : "bg-white text-slate-700 border-slate-200 hover:border-[#187A5A]"
                    }`}
                  >
                    {idx === 0 ? "★ أساسي: " : checked ? "✓ مساند: " : ""}{br.branch_name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">القسم الإداري</label>
              <select
                value={editDeptId}
                onChange={(e) => setEditDeptId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">اختر القسم...</option>
                {companyDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المدير المباشر</label>
              <select
                value={editManagerId}
                onChange={(e) => setEditManagerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">بدون مدير مباشر / الإدارة التنفيذية</option>
                {employees
                  .filter((e) => e.id !== editEmpId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} (#{e.employee_number})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحالة الوظيفية *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Active">على رأس العمل (Active)</option>
                <option value="On Leave">في إجازة (On Leave)</option>
                <option value="Suspended">موقوف (Suspended)</option>
                <option value="Terminated">منتهي الخدمة (Terminated)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">سبب التعديل / النقل (اختياري)</label>
              <input
                type="text"
                value={editChangeReason}
                onChange={(e) => setEditChangeReason(e.target.value)}
                placeholder="مثال: نقل إلى فرع الدمام"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditEmpModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submittingEditEmp}
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {submittingEditEmp ? "جارٍ التحديث..." : "حفظ التعديلات"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="إنشاء حساب مستخدم جديد"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم المستخدم (Login Username) *
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: ahmad_it"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              البريد الإلكتروني *
            </label>
            <input
              type="email"
              required
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@company.sa"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كلمة المرور *
            </label>
            <input
              type="password"
              required
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ربط بموظف (اختياري)
            </label>
            <select
              value={targetEmployeeId}
              onChange={(e) => setTargetEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">بدون ربط بموظف محدد</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الدور والصلاحيات *
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="Employee">موظف (Employee)</option>
              <option value="IT Technician">فني تقنية معلومات (IT Technician)</option>
              <option value="IT Manager">مدير تقنية معلومات (IT Manager)</option>
              <option value="Company Admin">مدير شركة (Company Admin)</option>
              <option value="Auditor">مدقق ومراجع (Auditor)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddUserModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              إنشاء الحساب
            </button>
          </div>
        </form>
      </Modal>

      {/* Employee Details Modal (Custody & Assigned Tasks) */}
      <Modal
        isOpen={empDetailsModal}
        onClose={() => setEmpDetailsModal(false)}
        title={`الملف الوظيفي والعمليات: ${selectedEmp?.full_name || ""}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">الرقم الوظيفي:</span>
              <span className="font-mono font-bold text-[#187A5A]">{selectedEmp?.employee_number}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">المسمى:</span>
              <span className="font-semibold">{selectedEmp?.job_title || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">القسم:</span>
              <span>{selectedEmp?.department_name || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">الحالة:</span>
              <StatusBadge status={selectedEmp?.employment_status || "Active"} />
            </div>
          </div>

          {/* Telegram Account Integration Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">✈️</span>
              <div>
                <span className="font-bold text-slate-800 block">ربط إشعارات Telegram:</span>
                {selectedEmp?.is_telegram_linked ? (
                  <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                    🟢 مرتبط ومفعل ({selectedEmp.telegram_username ? `@${selectedEmp.telegram_username}` : "حساب مؤكد"})
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">
                    ⚪ غير مرتبط — اربط حساب الموظف لتصل إليه تكليفات المهام والإشعارات التشغيلية فوراً
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!selectedEmp?.is_telegram_linked ? (
                <button
                  type="button"
                  onClick={() => setShowTelegramLinkModal(true)}
                  className="px-3.5 py-1.5 bg-[#187A5A] hover:bg-[#123D32] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  ربط Telegram
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTelegramLinkModal(true)}
                    className="px-3 py-1.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <span>⚙️ إدارة وصلاحيات Telegram</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendDirectEmpTest(selectedEmp.id)}
                    disabled={sendingEmpTest}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-blue-200 disabled:opacity-50"
                  >
                    {sendingEmpTest ? "جاري الإرسال..." : "🔔 إرسال رسالة اختبار"}
                  </button>
                </>
              )}
            </div>
          </div>

          {empTestMessage && (
            <div className="p-2.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs">
              {empTestMessage}
            </div>
          )}

          {/* Sub tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetailsTab("custody")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === "custody"
                    ? "bg-[#123D32] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                الأصول والعهد المسلمة ({selectedEmp?.assigned_assets?.length || 0})
              </button>
              <button
                onClick={() => setDetailsTab("tasks")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  detailsTab === "tasks"
                    ? "bg-[#123D32] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                المهام والعمليات المسندة ({empTasks.length})
              </button>
            </div>

            {detailsTab === "tasks" && canManage && (
              <button
                onClick={() => setShowAssignTaskModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#187A5A] hover:bg-[#123D32] text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <Icons.Plus size={13} />
                <span>إسناد مهمة جديدة</span>
              </button>
            )}
          </div>

          {detailsTab === "custody" ? (
            <div>
              {selectedEmp?.assigned_assets && selectedEmp.assigned_assets.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {selectedEmp.assigned_assets.map((a) => (
                    <div
                      key={a.custody_id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{a.asset_name}</div>
                        <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                          كود: {a.asset_code} • النوع: {a.asset_type}
                        </div>
                      </div>
                      <div className="text-left">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold border border-blue-200">
                          حالة الأصل: {a.condition}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                  لا توجد عهد نشطة مسلمة لهذا الموظف حالياً
                </p>
              )}
            </div>
          ) : (
            <div>
              {empTasks.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {empTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{t.title}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          الأولوية: {t.priority} {t.due_date && `• موعد الاستحقاق: ${t.due_date}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                  لا توجد مهام مسندة لهذا الموظف حالياً
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Quick Task Assign Modal */}
      <Modal
        isOpen={showAssignTaskModal}
        onClose={() => setShowAssignTaskModal(false)}
        title={`إسناد مهمة تشغيلية إلى: ${selectedEmp?.full_name || ""}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAssignTask} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان المهمة *
            </label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="مثال: ترقية نظام التشغيل وفحص الأمان"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              تفاصيل المهمة
            </label>
            <textarea
              rows={3}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="الخطوات والملاحظات الفنية للمهمة..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الأولوية *
              </label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Low">منخفضة (Low)</option>
                <option value="Medium">متوسطة (Medium)</option>
                <option value="High">مرتفعة (High)</option>
                <option value="Urgent">حرجة / عاجلة (Urgent)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاريخ الاستحقاق
              </label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAssignTaskModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              تأكيد وإسناد المهمة
            </button>
          </div>
        </form>
      </Modal>

      {/* Manual Telegram Linking Modal */}
      {showTelegramLinkModal && selectedEmp && (
        <TelegramLinkingModal
          isOpen={showTelegramLinkModal}
          onClose={() => setShowTelegramLinkModal(false)}
          employeeId={selectedEmp.id}
          employeeName={selectedEmp.full_name}
          companyId={activeCompanyId || undefined}
          onVerified={async () => {
            const empRes = await api.get<EmployeeRow>(`/employees/${selectedEmp.id}`);
            setSelectedEmp(empRes.data);
            fetchEmployees();
          }}
        />
      )}

      {/* Archive / Soft Delete Confirmation Modal */}
      <Modal
        isOpen={showArchiveModal}
        onClose={() => {
          if (!archivingEmp) {
            setShowArchiveModal(false);
            setEmpToArchive(null);
          }
        }}
        title="أرشفة الموظف وحفظ السجلات"
        maxWidth="max-w-md"
      >
        {empToArchive && (
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Icons.AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <div className="font-bold text-amber-900 text-sm">
                  أرشفة الموظف: {empToArchive.full_name} ({empToArchive.employee_number})
                </div>
                <p className="text-amber-800 leading-relaxed">
                  تتيح الأرشفة إخفاء الموظف من القوائم النشطة مع الحفاظ الكامل على كافة العمليات التاريخية والعهد وتذاكر الدعم والمهام، ويمكنك استعادة الموظف لاحقاً في أي وقت بنقرة واحدة.
                </p>
              </div>
            </div>

            {(empToArchive.assets_count ?? 0) > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 font-medium">
                <Icons.AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>تنبيه: مسجل باسم الموظف ({empToArchive.assets_count}) عهد نشطة. يفضل استرداد العهد أولاً عبر قسم العهد والأصول.</span>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">المسمى الوظيفي:</span>
                <span className="font-semibold text-slate-900">{empToArchive.job_title || "غير محدد"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الفرع / الإدارة:</span>
                <span className="font-semibold text-slate-900">{empToArchive.branch_names?.join("، ") || "الفرع الرئيسي"}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={archivingEmp}
                onClick={() => {
                  setShowArchiveModal(false);
                  setEmpToArchive(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={archivingEmp}
                onClick={() => void handleConfirmArchive()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Icons.Archive size={14} />
                <span>{archivingEmp ? "جاري الأرشفة..." : "تأكيد أرشفة الموظف"}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
