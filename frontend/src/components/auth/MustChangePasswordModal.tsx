"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Icons } from "@/components/ui/Icons";
import { useDialogAccessibility } from "@/components/ui/useDialogAccessibility";

export function MustChangePasswordModal() {
  const { user, refreshUser, logout } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useDialogAccessibility(Boolean(user?.must_change_password), dialogRef);

  // If user does not require password change or isn't logged in, don't show
  if (!user || !user.must_change_password) {
    return null;
  }

  // Password strength check
  const hasMinLength = newPassword.length >= 8;
  const hasNumber = /\d/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isStrong = hasMinLength && hasNumber && (hasUpper || hasSpecial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!oldPassword) {
      setError("يرجى إدخال كلمة المرور الحالية (المؤقتة)");
      return;
    }
    if (!hasMinLength) {
      setError("يجب أن تتكون كلمة المرور الجديدة من 8 خانات على الأقل");
      return;
    }
    if (newPassword === oldPassword) {
      setError("لا يمكن استخدام نفس كلمة المرور القديمة أو المؤقتة");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(async () => {
        await refreshUser();
      }, 1000);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      setError(
        errObj?.response?.data?.detail ||
          errObj?.response?.data?.message ||
          errObj?.message ||
          "حدث خطأ أثناء تغيير كلمة المرور. تأكد من صحة كلمة المرور الحالية."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="motion-backdrop-enter fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="must-change-password-title"
        className="motion-popover bg-[var(--surface)] dark:bg-slate-900 border border-[var(--border)] dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-right"
        tabIndex={-1}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] p-6 text-white text-center relative">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Icons.ShieldAlert size={32} className="text-[#3B82F6]" />
          </div>
          <h2 id="must-change-password-title" className="text-xl font-bold">تغيير كلمة المرور الإلزامي</h2>
          <p className="text-xs text-white/80 mt-1">
            مرحباً {user.full_name || user.username}، حسابك مسجل بكلمة مرور مؤقتة تتطلب التعيين الفوري قبل المتابعة.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
              <Icons.AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-8 text-center space-y-3">
              <Icons.CheckCircle size={48} className="text-emerald-500 mx-auto" />
              <h3 className="font-bold text-[var(--text)] dark:text-slate-100">
                تم تغيير كلمة المرور بنجاح!
              </h3>
              <p className="text-xs text-[var(--text-3)]">
                يتم الآن تحديث جلستك ونقلك إلى لوحة التحكم...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Old / Temporary Password */}
              <div>
                <label className="block font-medium text-[var(--text-2)] dark:text-slate-300 mb-1">
                  كلمة المرور الحالية (المؤقتة) *
                </label>
                <div className="relative">
                  <input
                    type={showOld ? "text" : "password"}
                    autoFocus
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    placeholder="أدخل كلمة المرور الحالية أو المؤقتة"
                    className="w-full px-3 py-2.5 pl-10 border border-[var(--border)] dark:border-slate-700 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(!showOld)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-slate-600"
                  >
                    <Icons.Eye size={16} />
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block font-medium text-[var(--text-2)] dark:text-slate-300 mb-1">
                  كلمة المرور الجديدة *
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="8 خانات على الأقل تشمل أرقام ورموز"
                    className="w-full px-3 py-2.5 pl-10 border border-[var(--border)] dark:border-slate-700 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-slate-600"
                  >
                    <Icons.Eye size={16} />
                  </button>
                </div>

                {/* Password Strength Indicators */}
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--text-3)]">
                  <span className={hasMinLength ? "text-emerald-600 flex items-center gap-1 font-semibold" : "flex items-center gap-1"}>
                    <Icons.Lock size={12} /> 8 أحرف على الأقل
                  </span>
                  <span className={hasNumber ? "text-emerald-600 flex items-center gap-1 font-semibold" : "flex items-center gap-1"}>
                    <Icons.Lock size={12} /> أرقام (0-9)
                  </span>
                  <span className={hasUpper ? "text-emerald-600 flex items-center gap-1 font-semibold" : "flex items-center gap-1"}>
                    <Icons.Lock size={12} /> حرف كبير (A-Z)
                  </span>
                  <span className={hasSpecial ? "text-emerald-600 flex items-center gap-1 font-semibold" : "flex items-center gap-1"}>
                    <Icons.Lock size={12} /> رمز خاص (!@#$)
                  </span>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block font-medium text-[var(--text-2)] dark:text-slate-300 mb-1">
                  تأكيد كلمة المرور الجديدة *
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="أعد إدخال كلمة المرور الجديدة"
                    className="w-full px-3 py-2.5 pl-10 border border-[var(--border)] dark:border-slate-700 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-slate-600"
                  >
                    <Icons.Eye size={16} />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !isStrong || newPassword !== confirmPassword}
                  className="flex-1 py-2.5 px-4 bg-[#1D4ED8] hover:bg-[#2563EB] disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Icons.Key size={16} />
                  <span>{isSubmitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور والمتابعة"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="py-2.5 px-4 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-2)] dark:text-slate-300 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  title="تسجيل الخروج"
                >
                  <Icons.LogOut size={16} />
                  <span>خروج</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
