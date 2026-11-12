"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function EmployeesPage() {
  const { activeCompanyId } = useAuth();
  const [tab, setTab] = useState<"employees" | "users">("employees");
  const [employees, setEmployees] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [empDetailsModal, setEmpDetailsModal] = useState(false);

  // New employee form
  const [empNumber, setEmpNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // New user form
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("Employee");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/employees?search=${search}`);
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
      const res = await api.get(`/employees/users/list?search=${search}`);
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
  }, [tab, activeCompanyId]);

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
      const res = await api.get(`/employees/${emp.id}`);
      setSelectedEmp(res.data);
      setEmpDetailsModal(true);
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
            الموظفون وإدارة المستخدمين
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل الموظفين والعهد المسلمة وحسابات الدخول وصلاحيات النظام (RBAC)
          </p>
        </div>

        {/* Tab switch & Add buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-200/60 p-1 rounded-xl">
            <button
              onClick={() => setTab("employees")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === "employees"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              سجل الموظفين
            </button>
            <button
              onClick={() => setTab("users")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === "users"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              حسابات المستخدمين
            </button>
          </div>

          {tab === "employees" ? (
            <button
              onClick={() => setShowAddEmpModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Icons.Plus size={16} />
              <span>إضافة موظف</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Icons.Plus size={16} />
              <span>إنشاء حساب مستخدم</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
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
          <button
            onClick={() => (tab === "employees" ? fetchEmployees() : fetchUsers())}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl"
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
                      <button
                        onClick={() => openEmployeeDetails(emp)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] transition-colors"
                      >
                        عرض العهد
                      </button>
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
        title="إضافة موظف جديد"
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
              placeholder="مثال: مهندس شبكات"
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
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              حفظ الموظف
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
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              إنشاء الحساب
            </button>
          </div>
        </form>
      </Modal>

      {/* Employee Details Modal */}
      <Modal
        isOpen={empDetailsModal}
        onClose={() => setEmpDetailsModal(false)}
        title={`ملف العهد للموظف: ${selectedEmp?.full_name || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">الرقم الوظيفي:</span>{" "}
              <span className="font-mono font-bold">{selectedEmp?.employee_number}</span>
            </div>
            <div>
              <span className="text-slate-400">المسمى:</span>{" "}
              <span className="font-semibold">{selectedEmp?.job_title}</span>
            </div>
            <div>
              <span className="text-slate-400">القسم:</span>{" "}
              <span>{selectedEmp?.department_name || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الفرع:</span>{" "}
              <span>{selectedEmp?.branch_name || "-"}</span>
            </div>
          </div>

          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 pt-2">
            <Icons.Assets size={16} className="text-[#187A5A]" />
            <span>الأصول المسلمة كعهدة حالية ({selectedEmp?.assigned_assets?.length || 0})</span>
          </h4>

          {selectedEmp?.assigned_assets?.length > 0 ? (
            <div className="space-y-2">
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
                      حالة التسليم: {a.condition}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-xl">
              لا توجد عهد نشطة مسلمة لهذا الموظف حالياً
            </p>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
}
