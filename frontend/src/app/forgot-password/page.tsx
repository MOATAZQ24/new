"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) return;

    setLoading(true);
    try {
      const res = await api.post<{ message?: string }>("/auth/forgot-password", {
        identifier: identifier.trim(),
      });
      setMessage(
        res.data?.message ||
          "إذا كان الحساب مسجلاً في النظام، فسيتم إرسال رابط استعادة كلمة المرور إلى البريد الإلكتروني المسجل خلال لحظات."
      );
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("تم تجاوز الحد المسموح به من الطلبات مؤقتاً. يرجى الانتظار 15 دقيقة قبل المحاولة مرة أخرى.");
      } else {
        const detail = err instanceof ApiError ? (err.data as { detail?: string } | null)?.detail : undefined;
        setError(typeof detail === "string" ? detail : "حدث خطأ أثناء معالجة الطلب. يرجى المحاولة لاحقاً.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 space-y-6">
        
        {/* Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#123D32] text-white shadow-lg mb-2">
            <span className="text-2xl font-bold tracking-wider">IG</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">استعادة كلمة المرور</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            أدخل اسم المستخدم أو البريد الإلكتروني المسجل لإرسال رابط إعادة تعيين كلمة المرور
          </p>
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-5 py-2">
            <div role="status" aria-live="polite" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تم إرسال تعليمات الاستعادة</span>
              </div>
              <p>{message}</p>
              <p className="text-[11px] text-emerald-700 pt-1 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>الرابط المرسل صالح للاستخدام <strong>لمرة واحدة فقط</strong> وينتهي تلقائياً بعد <strong>15 دقيقة</strong>. يُرجى مراجعة صندوق الوارد والبريد غير الهام (Spam).</span>
              </p>
            </div>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow transition-colors"
              >
                العودة إلى شاشة تسجيل الدخول
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="account-identifier" className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم المستخدم أو البريد الإلكتروني
              </label>
              <input
                id="account-identifier"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثال: admin أو user@investorgate.sa"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="w-full py-3 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-50 cursor-pointer"
            >
              {loading ? "جاري المعالجة والإرسال..." : "إرسال رابط استعادة كلمة المرور"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-semibold text-[#187A5A] hover:text-[#123D32] transition-colors"
              >
                ← العودة إلى تسجيل الدخول
              </Link>
            </div>
          </form>
        )}

      </div>
    </main>
  );
}
