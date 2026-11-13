"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function EmployeesPage() {
  const { activeCompanyId, user } = useAuth();
  const [tab, setTab] = useState<"employees" | "users">("employees");
  const [employees, setEmployees] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showEditEmpModal, setShowEditEmpModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [empDetailsModal, setEmpDetailsModal] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"custody" | "tasks">("custody");
  const [empTasks, setEmpTasks] = useState<any[]>([]);
  const [showAssignTaskModal, setShowAssignTaskModal] = useState(false);

  // New employee form
  const [empNumber, setEmpNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Edit employee form
  const [editEmpId, setEditEmpId] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("Active");

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
      let url = `/employees?search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await api.get(url);
      setEmployees(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/employees/users/list?search=${encodeURIComponent(search)}`);
      setUsers(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "employees") fetchEmployees();
    else fetchUsers();
  }, [tab, activeCompanyId, statusFilter]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/employees", {
        company_id: activeCompanyId,
        employee_number: empNumber,
        full_name: fullName,
        job_title: jobTitle,
        email: email,
        phone: phone,
        employment_status: "Active",
      });
      setShowAddEmpModal(false);
      setEmpNumber("");
      setFullName("");
      setJobTitle("");
      setEmail("");
      setPhone("");
      fetchEmployees();
    } catch (err: any) {
      alert(err?.message || "فشل إضافة الموظف");
    }
  };

  const openEditEmployee = (emp: any) => {
    setEditEmpId(emp.id);
    setEditFullName(emp.full_name);
    setEditJobTitle(emp.job_title || "");
    setEditEmail(emp.email || "");
    setEditPhone(emp.phone || "");
    setEditStatus(emp.employment_status || "Active");
    setShowEditEmpModal(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/employees/${editEmpId}`, {
        full_name: editFullName,
        job_title: editJobTitle,
        email: editEmail,
        phone: editPhone,
        employment_status: editStatus,
      });
      setShowEditEmpModal(false);
      fetchEmployees();
    } catch (err: any) {
      alert(err?.message || "فشل تحديث بيانات الموظف");
    }
  };

  const handleDeleteEmployee = async (empId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف الموظف "${name}"؟`)) return;
    try {
      await api.delete(`/employees/${empId}`);
      fetchEmployees();
    } catch (err: any) {
      alert(err?.message || "فشل حذف الموظف");
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
    } catch (err: any) {
      alert(err?.message || "فشل إنشاء حساب المستخدم");
    }
  };

  const openEmployeeDetails = async (emp: any) => {
    try {
      const [empRes, taskRes] = await Promise.all([
        api.get(`/employees/${emp.id}`),
        api.get(`/tasks?assigned_to_id=${emp.id}`),
      ]);
      setSelectedEmp(empRes.data);
      setEmpTasks(taskRes.data || []);
      setDetailsTab("custody");
      setEmpDetailsModal(true);
    } catch (e) {
      console.error(e);
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
      const taskRes = await api.get(`/tasks?assigned_to_id=${selectedEmp.id}`);
      setEmpTasks(taskRes.data || []);
    } catch (err: any) {
      alert(err?.message || "فشل إسناد المهمة");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            موظفو IT وإدارة المستخدمين (IT Staff & Service Desk)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل الموظفين والتقنيين والعهد المسلمة والمهام التشغيلية وصلاحيات النظام (RBAC)
          </p>
        </div>

        {/* Tab switch & Add buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-200/60 p-1 rounded-xl">
            <button
              onClick={() => setTab("employees")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tab === "employees"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              سجل الموظفين والتقنيين
            </button>
            <button
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

          <Link
            href="/users"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
            title="الانتقال إلى وحدة إدارة المستخدمين والصلاحيات المتقدمة والشركات المتعددة"
          >
            <Icons.Users size={16} />
            <span>بوابة المستخدمين والصلاحيات المتقدمة</span>
          </Link>

          {canManage && (
            tab === "employees" ? (
              <button
                onClick={() => setShowAddEmpModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Icons.Plus size={16} />
                <span>إضافة موظف</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Icons.Plus size={16} />
                <span>إنشاء حساب مستخدم</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Icons.Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="بحث بالاسم، الرقم الوظيفي، البريد..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (tab === "employees" ? fetchEmployees() : fetchUsers())}
                className="w-full bg-slate-50 border border-slate-200 text-xs py-2 pr-9 pl-3 rounded-xl outline-none focus:border-[#187A5A]"
              />
            </div>

            {tab === "employees" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none text-slate-700"
              >
                <option value="">جميع الحالات</option>
                <option value="Active">على رأس العمل (Active)</option>
                <option value="On Leave">في إجازة (On Leave)</option>
                <option value="Suspended">موقوف (Suspended)</option>
                <option value="Terminated">منتهي الخدمة (Terminated)</option>
              </select>
            )}
          </div>

          <button
            onClick={() => (tab === "employees" ? fetchEmployees() : fetchUsers())}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer"
            title="تحديث البيانات"
          >
            <Icons.Refresh size={16} />
          </button>
        </div>

        {tab === "employees" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
                <tr>
                  <th className="p-3.5">الرقم الوظيفي</th>
                  <th className="p-3.5">اسم الموظف</th>
                  <th className="p-3.5">المسمى الوظيفي</th>
                  <th className="p-3.5">القسم</th>
                  <th className="p-3.5">البريد الإلكتروني</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#187A5A]">
                      {emp.employee_number}
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">
                      {emp.full_name}
                    </td>
                    <td className="p-3.5 text-slate-600">{emp.job_title || "-"}</td>
                    <td className="p-3.5 text-slate-600">{emp.department_name || "-"}</td>
                    <td className="p-3.5 font-mono text-slate-500">{emp.email || "-"}</td>
                    <td className="p-3.5">
                      <StatusBadge status={emp.employment_status} />
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEmployeeDetails(emp)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          الملف والمهام والعهد
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEditEmployee(emp)}
                              className="p-1 text-slate-400 hover:text-slate-800 transition-colors"
                              title="تعديل الموظف"
                            >
                              <Icons.Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id, emp.full_name)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="حذف الموظف"
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
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
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-800">
                      {u.username}
                      {u.is_superadmin && (
                        <span className="mr-2 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px]">
                          Super Admin
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-700 font-semibold">
                      {u.full_name || "بدون ارتباط"}
                    </td>
                    <td className="p-3.5 font-mono text-slate-500">{u.email}</td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: string) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={u.account_status} />
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono">
                      {u.last_login ? new Date(u.last_login).toLocaleString("ar-SA") : "لم يسجل بعد"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddEmpModal}
        onClose={() => setShowAddEmpModal(false)}
        title="إضافة موظف أو فني جديد"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الرقم الوظيفي *
              </label>
              <input
                type="text"
                required
                value={empNumber}
                onChange={(e) => setEmpNumber(e.target.value)}
                placeholder="EMP-001"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الاسم الكامل *
              </label>
              <input
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
            <label className="block text-xs font-bold text-slate-700 mb-1">
              المسمى الوظيفي
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="مثال: مهندس شبكات / فني دعم فني"
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.sa"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
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
                placeholder="+966 50 000 0000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
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
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ الموظف
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={showEditEmpModal}
        onClose={() => setShowEditEmpModal(false)}
        title="تعديل بيانات الموظف"
      >
        <form onSubmit={handleUpdateEmployee} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الاسم الكامل *
            </label>
            <input
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
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

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
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ التعديلات
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
              <StatusBadge status={selectedEmp?.employment_status} />
            </div>
          </div>

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
              {selectedEmp?.assigned_assets?.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {selectedEmp.assigned_assets.map((a: any) => (
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
                  {empTasks.map((t: any) => (
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
    </DashboardLayout>
  );
}
