"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isVerifying = Boolean(token) && verifying;
  const isTokenValid = Boolean(token) && tokenValid;
  const displayedTokenError = token
    ? tokenError
    : "رابط استعادة كلمة المرور مفقود أو غير مكتمل.";

  useEffect(() => {
    if (!token) return;

    let active = true;
    const verifyToken = async () => {
      try {
        setVerifying(true);
        await api.post("/auth/verify-reset-token", { token });
        if (!active) return;
        setTokenValid(true);
        setTokenError(null);
      } catch (err) {
        if (!active) return;
        const detail = err instanceof ApiError ? err.data?.detail : undefined;
        setTokenValid(false);
        setTokenError(
          (typeof detail === "string" ? detail : null) ||
            "انتهت صلاحية رابط الاستعادة أو تم استخدامه مسبقاً. يرجى طلب رابط جديد."
        );
      } finally {
        if (active) setVerifying(false);
      }
    };

    void verifyToken();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (newPassword.length < 6) {
      setSubmitError("يجب أن تتكون كلمة المرور الجديدة من 6 خانات على الأقل.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });
      setSubmitSuccess(true);
    } catch (err) {
      const detail = err instanceof ApiError ? err.data?.detail : undefined;
      setSubmitError(
        (typeof detail === "string" ? detail : null) ||
          "فشل إعادة تعيين كلمة المرور. يرجى المحاولة مرة أخرى."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#123D32] text-white shadow-lg mb-2">
            <span className="text-2xl font-bold tracking-wider">IG</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">تعيين كلمة المرور الجديدة</h1>
          <p className="text-xs text-slate-500">
            أدخل كلمة مرور قوية لتأمين حسابك على المنظومة
          </p>
        </div>

        {/* Verification Loader */}
        {isVerifying && (
          <div className="p-8 text-center text-xs text-slate-500 space-y-2">
            <div className="inline-block w-6 h-6 border-2 border-[#187A5A] border-t-transparent rounded-full animate-spin"></div>
            <p>جاري التحقق من صلاحية رابط الاستعادة...</p>
          </div>
        )}

        {/* Invalid or Expired Token State */}
        {!isVerifying && !isTokenValid && (
          <div className="space-y-4 py-2">
            <div role="alert" aria-live="assertive" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-red-900">
                <span>⚠️</span>
                <span>الرابط غير صالح أو منتهي الصلاحية</span>
              </div>
              <p>{displayedTokenError}</p>
              <p className="text-[11px] text-red-700">
                روابط الاستعادة صالحة لمدة 15 دقيقة فقط وتستخدم لمرة واحدة حرصاً على أمان النظام.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow transition-colors"
              >
                طلب رابط استعادة جديد
              </Link>
              <Link
                href="/login"
                className="text-center text-xs text-slate-500 hover:text-slate-700 py-1"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          </div>
        )}

        {/* Success State */}
        {!isVerifying && isTokenValid && submitSuccess && (
          <div className="space-y-5 py-2">
            <div role="status" aria-live="polite" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <span>✓</span>
                <span>تم تغيير كلمة المرور بنجاح!</span>
              </div>
              <p>
                تم تحديث كلمة المرور وتأمين حسابك، وتم إنهاء كافة الجلسات النشطة القديمة حرصاً على الأمان.
              </p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full py-3 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow-md transition-colors"
            >
              تسجيل الدخول بكلمة المرور الجديدة
            </Link>
          </div>
        )}

        {/* Password Reset Form */}
        {!isVerifying && isTokenValid && !submitSuccess && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {submitError && (
              <div role="alert" aria-live="assertive" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            <div>
              <label htmlFor="new-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                كلمة المرور الجديدة <span className="text-red-500">*</span>
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                aria-describedby="new-password-help"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
              />
              <span id="new-password-help" className="text-[10px] text-slate-400 mt-1 block">
                يجب ألا تقل عن 6 خانات (يفضل استخدام أحرف وأرقام ورموز)
              </span>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                تأكيد كلمة المرور الجديدة <span className="text-red-500">*</span>
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !newPassword || !confirmPassword}
              className="w-full py-3 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "جاري الحفظ والتأمين..." : "حفظ كلمة المرور وتأمين الحساب"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                إلغاء والعودة لشاشة الدخول
              </Link>
            </div>
          </form>
        )}

      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4">
          <p className="text-xs text-slate-500">جاري التحميل...</p>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
