"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { Check, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type { BranchOption, DepartmentOption, EmployeeRow } from "./page";

interface CompanyItem {
  id: string;
  name_ar?: string;
  name_en?: string;
  code?: string;
  company_name_ar?: string;
  company_code?: string;
}

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCompanyId: string | null;
  userCompanies?: CompanyItem[];
  existingEmployees: EmployeeRow[];
  onEmployeeCreated: (result: {
    employee: EmployeeRow;
    temporaryPassword?: { username: string; password: string };
  }) => void;
}

export function AddEmployeeModal({
  isOpen,
  onClose,
  activeCompanyId,
  userCompanies = [],
  existingEmployees = [],
  onEmployeeCreated,
}: AddEmployeeModalProps) {
  const toast = useToast();

  // ── Form State ─────────────────────────────────────────────────────────────
  const [companyId, setCompanyId] = useState(activeCompanyId || "");
  const [empNumber, setEmpNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [empStatus, setEmpStatus] = useState("Active");

  // Multi-Branch Assignment (Primary + Additional)
  const [primaryBranchId, setPrimaryBranchId] = useState("");
  const [supportingBranchIds, setSupportingBranchIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [extraCompanyIds, setExtraCompanyIds] = useState<string[]>([]);

  // RBAC & User Account Creation
  const [createUserAccount, setCreateUserAccount] = useState(false);
  const [username, setUsername] = useState("");
  const [passwordMode, setPasswordMode] = useState<"auto" | "custom">("auto");
  const [customPassword, setCustomPassword] = useState("");
  const [roleName, setRoleName] = useState("Employee");

  // Dynamic Options
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(false);

  // Manager Combobox State
  const [managerSearch, setManagerSearch] = useState("");
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const managerDropdownRef = useRef<HTMLDivElement>(null);

  // Submission & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string;
    password: string;
    employeeName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync activeCompanyId when modal opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCompanyId(activeCompanyId || "");
      setFormError(null);
      setCreatedCredentials(null);
      setCopied(false);
    }
  }

  // Load branches & departments dynamically when selected company changes
  useEffect(() => {
    if (!companyId || !isOpen) return;

    let isCancelled = false;
    const animId = requestAnimationFrame(() => {
      if (!isCancelled) setLoadingStructure(true);
    });

    Promise.all([
      api.get<BranchOption[]>(`/companies/${companyId}/branches`),
      api.get<DepartmentOption[]>(`/companies/${companyId}/departments`),
    ])
      .then(([bRes, dRes]) => {
        if (isCancelled) return;
        const fetchedBranches = bRes.data || [];
        const fetchedDepts = dRes.data || [];
        setBranches(fetchedBranches);
        setDepartments(fetchedDepts);

        // Auto-select primary branch if not set
        if (fetchedBranches.length > 0) {
          setPrimaryBranchId((prev) => {
            const exists = fetchedBranches.some((b) => b.id === prev);
            return exists ? prev : fetchedBranches[0].id;
          });
        } else {
          setPrimaryBranchId("");
        }

        // Validate department belongs to company
        setDepartmentId((prev) => {
          const exists = fetchedDepts.some((d) => d.id === prev);
          return exists ? prev : "";
        });
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load company structure:", err);
          toast.error("تعذر تحميل فروع وأقسام المنشأة المحددة");
        }
      })
      .finally(() => {
        if (!isCancelled) setLoadingStructure(false);
      });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [companyId, isOpen, toast]);

  // Close manager dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        managerDropdownRef.current &&
        !managerDropdownRef.current.contains(e.target as Node)
      ) {
        setIsManagerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter departments based on primary branch
  const filteredDepartments = useMemo(() => {
    if (!primaryBranchId) return departments;
    return departments.filter(
      (d) => !d.branch_id || d.branch_id === primaryBranchId
    );
  }, [departments, primaryBranchId]);

  // Filter eligible managers (same company, active employees)
  const filteredManagers = useMemo(() => {
    const list = existingEmployees.filter((e) => {
      // Prioritize active employees
      if (e.employment_status && e.employment_status !== "Active") return false;
      return true;
    });

    if (!managerSearch.trim()) return list;
    const q = managerSearch.trim().toLowerCase();
    return list.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(q) ||
        e.employee_number?.toLowerCase().includes(q) ||
        e.job_title?.toLowerCase().includes(q) ||
        e.department_name?.toLowerCase().includes(q)
    );
  }, [existingEmployees, managerSearch]);

  const selectedManager = useMemo(() => {
    if (!managerId) return null;
    return existingEmployees.find((e) => e.id === managerId) || null;
  }, [existingEmployees, managerId]);

  // Live duplicate validation checks
  const isDuplicateNumber = useMemo(() => {
    const clean = empNumber.trim().toLowerCase();
    if (!clean) return false;
    return existingEmployees.some(
      (e) => e.employee_number?.toLowerCase() === clean
    );
  }, [empNumber, existingEmployees]);

  const isDuplicateEmail = useMemo(() => {
    const clean = email.trim().toLowerCase();
    if (!clean) return false;
    return existingEmployees.some(
      (e) => e.email && e.email.toLowerCase() === clean
    );
  }, [email, existingEmployees]);

  // Auto-generate employee number suggestion
  const handleAutoSuggestEmpNumber = () => {
    const prefix = "EMP-";
    const existingNums = existingEmployees
      .map((e) => {
        const match = e.employee_number?.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1001;
    setEmpNumber(`${prefix}${nextNum.toString().padStart(4, "0")}`);
  };

  // Auto-suggest username from full name or email
  const handleAutoSuggestUsername = () => {
    if (email.trim()) {
      const prefix = email.split("@")[0].trim().toLowerCase();
      if (prefix) {
        setUsername(prefix.replace(/[^a-z0-9._-]/g, ""));
        return;
      }
    }
    if (fullName.trim()) {
      // Simple arabic transliteration or clean fallback
      const clean = fullName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ".")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      setUsername(clean || `user.${Math.floor(1000 + Math.random() * 9000)}`);
    } else if (empNumber.trim()) {
      setUsername(empNumber.trim().toLowerCase());
    }
  };

  // Copy credentials helper
  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `بيانات الدخول لنظام Investor Gate OS:
اسم المستخدم: ${createdCredentials.username}
كلمة المرور المؤقتة: ${createdCredentials.password}
رابط النظام: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("تم نسخ بيانات الدخول إلى الحافظة بنجاح");
    setTimeout(() => setCopied(false), 3000);
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    // Validation
    const cleanNum = empNumber.trim();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanNum) {
      setFormError("الرقم الوظيفي حقل إجباري");
      toast.error("يرجى إدخال الرقم الوظيفي");
      return;
    }

    if (isDuplicateNumber) {
      setFormError("الرقم الوظيفي مسجل مسبقاً لموظف آخر في المنظومة");
      toast.error("الرقم الوظيفي مسجل مسبقاً");
      return;
    }

    if (!cleanName || cleanName.split(/\s+/).length < 2) {
      setFormError("يرجى إدخال الاسم الكامل للموظف (الاسم الثنائي على الأقل)");
      toast.error("الاسم الكامل يجب أن يحتوي على اسمين على الأقل");
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError("صيغة البريد الإلكتروني غير صحيحة");
      toast.error("يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    if (isDuplicateEmail) {
      setFormError("البريد الإلكتروني مسجل بالفعل لموظف آخر");
      toast.error("البريد الإلكتروني مكرر");
      return;
    }

    if (!primaryBranchId) {
      setFormError("يجب تحديد الفرع الرئيسي لمقر عمل الموظف");
      toast.error("يرجى اختيار الفرع الرئيسي");
      return;
    }

    if (createUserAccount) {
      const cleanUser = username.trim();
      if (!cleanUser) {
        setFormError("اسم المستخدم مطلوب لإنشاء حساب دخول النظام");
        toast.error("يرجى إدخال اسم المستخدم");
        return;
      }
      if (!cleanEmail) {
        setFormError("البريد الإلكتروني مطلوب لربطه بحساب المستخدم وإرسال الإشعارات");
        toast.error("البريد الإلكتروني مطلوب لإنشاء حساب");
        return;
      }
      if (passwordMode === "custom" && (!customPassword || customPassword.length < 6)) {
        setFormError("كلمة المرور المخصصة يجب أن لا تقل عن 6 خانات");
        toast.error("كلمة المرور قصيرة جداً");
        return;
      }
    }

    // Build branch IDs (Primary first, then unique supporting branches)
    const effectiveBranchIds = [
      primaryBranchId,
      ...supportingBranchIds.filter((b) => b !== primaryBranchId),
    ];

    const targetCompanies =
      extraCompanyIds.length > 0 && companyId
        ? [companyId, ...extraCompanyIds.filter((c) => c !== companyId)]
        : undefined;

    setSubmitting(true);

    try {
      const payload = {
        company_id: companyId,
        employee_number: cleanNum,
        full_name: cleanName,
        job_title: jobTitle.trim() || undefined,
        email: cleanEmail || undefined,
        phone: phone.trim() || undefined,
        employment_status: empStatus,
        branch_id: primaryBranchId,
        branch_ids: effectiveBranchIds,
        department_id: departmentId || undefined,
        manager_id: managerId || undefined,
        role_name: roleName,
        company_ids: targetCompanies,
        create_user_account: createUserAccount,
        username: createUserAccount ? username.trim() : undefined,
        password:
          createUserAccount && passwordMode === "custom" && customPassword
            ? customPassword
            : undefined,
      };

      const res = await api.post<{
        temporary_password?: string;
        user_id?: string;
        employee?: EmployeeRow;
      }>("/employees", payload);

      toast.success(`تم إضافة الموظف "${cleanName}" بنجاح وربطه بالفروع`);

      const tempPass = res.data?.temporary_password;
      if (tempPass && createUserAccount) {
        // Show credentials view so user can copy them securely
        setCreatedCredentials({
          username: username.trim(),
          password: tempPass,
          employeeName: cleanName,
        });
      }

      onEmployeeCreated({
        employee: {
          id: (res.data as unknown as { id?: string })?.id || `temp-${Date.now()}`,
          employee_number: cleanNum,
          full_name: cleanName,
          job_title: jobTitle.trim(),
          department_name:
            departments.find((d) => d.id === departmentId)?.department_name || null,
          branch_name:
            branches.find((b) => b.id === primaryBranchId)?.branch_name || null,
          email: cleanEmail,
          phone: phone.trim(),
          employment_status: empStatus,
          company_id: companyId,
        },
        temporaryPassword:
          tempPass && createUserAccount
            ? { username: username.trim(), password: tempPass }
            : undefined,
      });

      if (!tempPass) {
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "فشل إضافة الموظف");
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="إضافة موظف جديد"
      maxWidth="max-w-3xl"
    >
      {/* If credentials generated, show prominent copyable credential banner */}
      {createdCredentials ? (
        <div className="space-y-4 py-2" dir="rtl">
          <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-emerald-200/80 space-y-3">
            <div className="flex items-center gap-2 text-[#1D4ED8]">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Icons.Check size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#1D4ED8]">
                  تم إنشاء الموظف وحساب الدخول بنجاح!
                </h3>
                <p className="text-xs text-emerald-800">
                  تم إنشاء حساب الدخول وتوليد كلمة مرور مؤقتة للموظف{" "}
                  <strong>{createdCredentials.employeeName}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-emerald-200 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-semibold">اسم المستخدم:</span>
                <span className="font-mono font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
                  {createdCredentials.username}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 font-semibold">كلمة المرور المؤقتة:</span>
                <span className="font-mono font-bold text-[#2563EB] px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                  {createdCredentials.password}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {copied ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
                <span>{copied ? "تم النسخ بنجاح!" : "نسخ بيانات الدخول"}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                إغلاق والعودة للقائمة
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4" dir="rtl">
          {formError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-xs font-semibold text-amber-900 flex items-start gap-2"
            >
              <Icons.AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* ── Section 1: البيانات الشخصية والمهنية ─────────────────────────────────── */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1D4ED8]">
                <Icons.User size={15} className="text-[#2563EB]" />
                <span>البيانات الشخصية والمهنية</span>
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">* حقول مطلوبة</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="add-emp-number" className="text-xs font-bold text-slate-700">
                    الرقم الوظيفي *
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoSuggestEmpNumber}
                    className="text-[10px] text-[#2563EB] hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
                  >
                    <Icons.Sparkles size={11} />
                    <span>اقتراح تلقائي</span>
                  </button>
                </div>
                <input
                  id="add-emp-number"
                  type="text"
                  required
                  value={empNumber}
                  onChange={(e) => setEmpNumber(e.target.value)}
                  placeholder="مثال: EMP-1048"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all font-mono ${
                    isDuplicateNumber
                      ? "border-amber-400 bg-amber-50/50 focus:border-amber-500"
                      : "border-slate-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                  }`}
                />
                {isDuplicateNumber && (
                  <p className="text-[10px] text-amber-700 mt-1 font-semibold flex items-center gap-1">
                    <Icons.AlertCircle size={11} />
                    <span>الرقم الوظيفي مستخدم مسبقاً في النظام</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="add-emp-fullname" className="block text-xs font-bold text-slate-700 mb-1">
                  الاسم الكامل *
                </label>
                <input
                  id="add-emp-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="الاسم الثلاثي أو الرباعي"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="add-emp-jobtitle" className="block text-xs font-bold text-slate-700 mb-1">
                  المسمى الوظيفي
                </label>
                <input
                  id="add-emp-jobtitle"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="مثال: مهندس شبكات / أخصائي دعم"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                />
              </div>

              <div>
                <label htmlFor="add-emp-email" className="block text-xs font-bold text-slate-700 mb-1">
                  البريد الإلكتروني
                </label>
                <input
                  id="add-emp-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.sa"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all text-left font-mono ${
                    isDuplicateEmail
                      ? "border-amber-400 bg-amber-50/50 focus:border-amber-500"
                      : "border-slate-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                  }`}
                />
                {isDuplicateEmail && (
                  <p className="text-[10px] text-amber-700 mt-1 font-semibold flex items-center gap-1">
                    <Icons.AlertCircle size={11} />
                    <span>البريد الإلكتروني مسجل لموظف آخر</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="add-emp-phone" className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الهاتف
                </label>
                <input
                  id="add-emp-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+966 50 000 0000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-left font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-emp-status" className="block text-xs font-bold text-slate-700 mb-1">
                  الحالة الوظيفية
                </label>
                <select
                  id="add-emp-status"
                  value={empStatus}
                  onChange={(e) => setEmpStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-slate-800"
                >
                  <option value="Active">على رأس العمل (Active)</option>
                  <option value="On Leave">في إجازة رسمية (On Leave)</option>
                  <option value="Suspended">موقوف مؤقتاً (Suspended)</option>
                </select>
              </div>

              {/* Dynamic Company Selection */}
              {userCompanies.length > 1 && (
                <div>
                  <label htmlFor="add-emp-company" className="block text-xs font-bold text-slate-700 mb-1">
                    الشركة / المنشأة التابع لها الموظف *
                  </label>
                  <select
                    id="add-emp-company"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-slate-900"
                  >
                    {userCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ar || c.company_name_ar || c.name_en || c.id} (
                        {c.code || c.company_code || "CORP"})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: التعيين الإداري والفروع ───────────────────────────────────── */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1D4ED8]">
                <Icons.Building size={15} className="text-[#2563EB]" />
                <span>التعيين الإداري وتوزيع الفروع</span>
              </div>
              {loadingStructure && (
                <span className="text-[11px] text-[#2563EB] animate-pulse font-semibold">
                  جارٍ تحميل الفروع والأقسام...
                </span>
              )}
            </div>

            {/* Primary Branch Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  الفرع الرئيسي (مقر العمل الأساسي) *
                </label>
                <span className="text-[10px] text-slate-500 font-semibold">
                  اختر فرعاً واحداً كفرع رئيسي للموظف
                </span>
              </div>
              {branches.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                  لا توجد فروع مسجلة لهذه المنشأة حالياً
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {branches.map((b) => {
                    const isSelected = primaryBranchId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setPrimaryBranchId(b.id);
                          // Remove from supporting if was selected there
                          setSupportingBranchIds((prev) => prev.filter((x) => x !== b.id));
                        }}
                        className={`p-2 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                          isSelected
                            ? "bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs"
                            : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">{b.branch_name}</div>
                          {b.location && (
                            <div
                              className={`text-[10px] truncate ${
                                isSelected ? "text-emerald-200" : "text-slate-500"
                              }`}
                            >
                              {b.location}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#3B82F6] text-white shrink-0">
                            أساسي
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Additional Supporting Branches */}
            {branches.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  فروع إضافية مساندة (اختياري)
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50/80 border border-slate-200">
                  {branches
                    .filter((b) => b.id !== primaryBranchId)
                    .map((b) => {
                      const isChecked = supportingBranchIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setSupportingBranchIds((prev) =>
                              isChecked ? prev.filter((x) => x !== b.id) : [...prev, b.id]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                            isChecked
                              ? "bg-[#2563EB] text-white border-[#2563EB]"
                              : "bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]"
                          }`}
                        >
                          <span className="text-[10px]">{isChecked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}</span>
                          <span>{b.branch_name}</span>
                          <span
                            className={`text-[9px] px-1 rounded ${
                              isChecked ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            مساند
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Department & Manager Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-emp-dept" className="block text-xs font-bold text-slate-700 mb-1">
                  القسم الإداري
                </label>
                <select
                  id="add-emp-dept"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-slate-800"
                >
                  <option value="">اختر القسم الإداري...</option>
                  {filteredDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
                {filteredDepartments.length === 0 && primaryBranchId && (
                  <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                    لا توجد أقسام مخصصة لهذا الفرع، يمكنك تركه فارغاً أو إضافة قسم.
                  </p>
                )}
              </div>

              {/* Searchable Combobox for Direct Manager */}
              <div className="relative" ref={managerDropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="add-emp-manager-input" className="text-xs font-bold text-slate-700">
                    المدير المباشر
                  </label>
                  {managerId && (
                    <button
                      type="button"
                      onClick={() => {
                        setManagerId("");
                        setManagerSearch("");
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 cursor-pointer font-semibold"
                    >
                      إلغاء التعيين
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="add-emp-manager-input"
                    type="text"
                    value={
                      isManagerDropdownOpen
                        ? managerSearch
                        : selectedManager
                        ? `${selectedManager.full_name} (${selectedManager.employee_number})`
                        : ""
                    }
                    onChange={(e) => {
                      setManagerSearch(e.target.value);
                      if (!isManagerDropdownOpen) setIsManagerDropdownOpen(true);
                    }}
                    onFocus={() => setIsManagerDropdownOpen(true)}
                    placeholder="ابحث بالاسم أو الرقم الوظيفي..."
                    className="w-full ps-3 pe-8 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-slate-800"
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 pointer-events-none">
                    <Icons.Search size={13} />
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isManagerDropdownOpen && (
                  <div className="absolute z-30 start-0 end-0 mt-1 max-h-52 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-lg p-1 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setManagerId("");
                        setManagerSearch("");
                        setIsManagerDropdownOpen(false);
                      }}
                      className="w-full text-right px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                    >
                      <span>بدون مدير مباشر / الإدارة العليا</span>
                      {!managerId && <Icons.Check size={13} className="text-[#2563EB]" />}
                    </button>

                    {filteredManagers.slice(0, 30).map((m) => {
                      const isPicked = managerId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setManagerId(m.id);
                            setManagerSearch(m.full_name);
                            setIsManagerDropdownOpen(false);
                          }}
                          className={`w-full text-right px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            isPicked
                              ? "bg-[#1D4ED8] text-white"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-bold">{m.full_name}</span>
                            <span
                              className={`ms-1.5 font-mono text-[11px] ${
                                isPicked ? "text-emerald-200" : "text-slate-500"
                              }`}
                            >
                              #{m.employee_number}
                            </span>
                            {m.job_title && (
                              <span
                                className={`ms-1.5 text-[10px] ${
                                  isPicked ? "text-slate-300" : "text-slate-400"
                                }`}
                              >
                                • {m.job_title}
                              </span>
                            )}
                          </div>
                          {isPicked && <Icons.Check size={13} />}
                        </button>
                      );
                    })}

                    {filteredManagers.length === 0 && (
                      <div className="py-3 text-center text-xs text-slate-500">
                        لا يوجد موظف مطابق للبحث
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Optional Multi-Company Staffing */}
            {userCompanies.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  منشآت إضافية تابعة لنفس الموظف (اختياري)
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50/80 border border-slate-200">
                  {userCompanies
                    .filter((c) => c.id !== companyId)
                    .map((c) => {
                      const isPicked = extraCompanyIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setExtraCompanyIds((prev) =>
                              isPicked ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                            isPicked
                              ? "bg-[#2563EB] text-white border-[#2563EB]"
                              : "bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]"
                          }`}
                        >
                          <span>{isPicked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}</span>
                          <span>{c.name_ar || c.company_name_ar || c.name_en || c.id}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: حساب الدخول والصلاحيات (RBAC) ───────────────────────────── */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <label
                htmlFor="toggle-user-account"
                className="flex items-center gap-2 text-xs font-bold text-[#1D4ED8] cursor-pointer"
              >
                <input
                  id="toggle-user-account"
                  type="checkbox"
                  checked={createUserAccount}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCreateUserAccount(checked);
                    if (checked && !username) {
                      handleAutoSuggestUsername();
                    }
                  }}
                  className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#2563EB] w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <Icons.Key size={15} className="text-[#2563EB]" />
                  <span>إنشاء حساب دخول للنظام لهذا الموظف</span>
                </span>
              </label>

              <span className="text-[11px] text-slate-500 font-semibold">
                {createUserAccount ? "مفعل" : "معطل"}
              </span>
            </div>

            {createUserAccount && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="add-emp-username" className="text-xs font-bold text-slate-700">
                        اسم المستخدم *
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoSuggestUsername}
                        className="text-[10px] text-[#2563EB] hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
                      >
                        <Icons.Sparkles size={11} />
                        <span>اقتراح من الاسم</span>
                      </button>
                    </div>
                    <input
                      id="add-emp-username"
                      type="text"
                      dir="ltr"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                      placeholder="e.g. mohammed.ali"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-left"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">كلمة المرور</label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPasswordMode("auto")}
                          className={`font-semibold cursor-pointer ${
                            passwordMode === "auto"
                              ? "text-[#2563EB] underline font-bold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          توليد تلقائي
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setPasswordMode("custom")}
                          className={`font-semibold cursor-pointer ${
                            passwordMode === "custom"
                              ? "text-[#2563EB] underline font-bold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تعيين يدوي
                        </button>
                      </div>
                    </div>

                    {passwordMode === "auto" ? (
                      <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between font-mono">
                        <span>سيتم توليد كلمة مرور مؤقتة قوية تلقائياً</span>
                        <Icons.Lock size={13} className="text-[#2563EB]" />
                      </div>
                    ) : (
                      <input
                        type="password"
                        dir="ltr"
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="كلمة مرور قوية (6 خانات على الأقل)..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all text-left"
                      />
                    )}
                  </div>
                </div>

                {/* RBAC Role Cards */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الدور والصلاحيات في المنظومة (RBAC) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        name: "Employee",
                        label: "موظف (Employee)",
                        desc: "وصول قياسي للخدمة الذاتية، تذاكر الدعم والعهد الشخصية",
                        badge: "خدمة ذاتية",
                      },
                      {
                        name: "IT Technician",
                        label: "فني دعم تقني (IT Technician)",
                        desc: "معالجة التذاكر الفنية، فحص الأصول وتحديث المهام",
                        badge: "تشغيل فني",
                      },
                      {
                        name: "IT Manager",
                        label: "مدير تقنية معلومات (IT Manager)",
                        desc: "إشراف كامل على أصول IT، مسارات الاعتماد والتراخيص",
                        badge: "إدارة القسم",
                      },
                      {
                        name: "Company Admin",
                        label: "مدير منشأة (Company Admin)",
                        desc: "إدارة كاملة لبيانات الشركة والفروع والموظفين",
                        badge: "إدارة المنشأة",
                      },
                    ].map((role) => {
                      const isPicked = roleName === role.name;
                      return (
                        <button
                          key={role.name}
                          type="button"
                          onClick={() => setRoleName(role.name)}
                          className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-start justify-between gap-2 ${
                            isPicked
                              ? "bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs"
                              : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold flex items-center gap-1.5">
                              <span>{role.label}</span>
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 leading-relaxed ${
                                isPicked ? "text-slate-200" : "text-slate-500"
                              }`}
                            >
                              {role.desc}
                            </div>
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                              isPicked
                                ? "bg-[#3B82F6] text-white"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {role.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer Actions ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || isDuplicateNumber || isDuplicateEmail}
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جارٍ حفظ بيانات الموظف...</span>
                </>
              ) : (
                <>
                  <Icons.Plus size={14} />
                  <span>حفظ وإضافة الموظف</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
