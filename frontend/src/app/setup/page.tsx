"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { BrandMark } from "@/components/ui/BrandMark";

export default function FirstRunSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [requiresSetup, setRequiresSetup] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptLicense, setAcceptLicense] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<{ requires_setup: boolean }>("/auth/bootstrap-status");
        if (!active) return;
        if (!res.data?.requires_setup) {
          router.replace("/login");
          return;
        }
        setRequiresSetup(true);
      } catch {
        if (active) setRequiresSetup(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptLicense) {
      setError("يرجى قراءة شروط الترخيص وإشعار الحقوق والموافقة عليها للمتابعة.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (password.length < 12) {
      setError("يجب أن تتكون كلمة المرور من 12 خانة على الأقل.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/bootstrap", {
        full_name: fullName.trim(),
        username: username.trim(),
        email: email.trim() || null,
        password,
        confirm_password: confirmPassword,
        accept_license: acceptLicense,
      });
      router.replace("/login?setup=complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إكمال تهيئة مدير النظام الأول");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <main dir="rtl" className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-xs font-semibold text-[var(--muted-foreground)]">
          جاري التحقق من حالة التهيئة الأولية للنظام...
        </div>
      </main>
    );
  }

  if (!requiresSetup) {
    return null;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-2xl bg-[var(--card)] rounded-3xl shadow-xl border border-[var(--border)] overflow-hidden">
        {/* Header Banner */}
        <div className="bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)] p-6 sm:p-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl shadow-md overflow-hidden shrink-0">
              <BrandMark size={56} variant="gold-badge" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                التهيئة الآمنة للتشغيل الأول — Investor Gate OS
              </h1>
              <p className="text-xs text-[var(--accent)] mt-1 font-medium">
                إعداد حساب مدير النظام الأول وقبول شروط الترخيص (Zero Default Credentials)
              </p>
            </div>
          </div>
          <ShieldCheck className="w-8 h-8 text-[var(--accent)] shrink-0 hidden sm:block" />
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {error && (
            <div role="alert" aria-live="assertive" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
              {error}
            </div>
          )}

          {/* License & Copyright Acceptance Box */}
          <section className="rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                <span>اتفاقية الترخيص وإشعار حقوق النشر والمكونات مفتوحة المصدر</span>
              </div>
              <Link href="/about#notices" className="text-[11px] font-bold text-[var(--primary)] hover:underline">
                إشعارات الطرف الثالث
              </Link>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] leading-relaxed space-y-1">
              <p>
                <strong>Investor Gate OS</strong> — نظام إدارة عمليات تقنية المعلومات والأصول (الإصدار المرجعي).
                © 2026. التطوير والهندسة الأمنية: <strong>Moataz Qasem / معتز قاسم</strong> (Cybersecurity &amp; Networks Specialist).
              </p>
              <p>
                تخضع المكونات مفتوحة المصدر المدمجة (FastAPI, Next.js, React, PostgreSQL, Radix UI, Lucide) لتراخيصها المعتمدة (MIT / BSD / Apache-2.0 / PostgreSQL License). يتم تشغيل هذا النظام ذاتياً داخل بيئة المنشأة دون إرسال بيانات لجهات خارجية غير مهيأة.
              </p>
            </div>
            <label className="flex items-start gap-2.5 pt-1 cursor-pointer text-xs font-semibold text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={acceptLicense}
                onChange={(e) => setAcceptLicense(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] accent-[var(--primary)]"
                required
              />
              <span>أوافق على شروط الاستخدام والترخيص وإشعار حقوق النشر للمتابعة</span>
            </label>
          </section>

          {/* First Administrator Form */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] border-b border-[var(--border)] pb-2">
              <Lock className="w-4 h-4 text-[var(--primary)]" />
              <span>بيانات مدير النظام العام الأول (Super Admin)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="setup-fullname" className="block text-xs font-bold mb-1.5">
                  الاسم الكامل <span className="text-rose-500">*</span>
                </label>
                <input
                  id="setup-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="الاسم الكامل للمسؤول"
                  className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs outline-none focus:border-[var(--ring)]"
                />
              </div>

              <div>
                <label htmlFor="setup-username" className="block text-xs font-bold mb-1.5">
                  اسم المستخدم <span className="text-rose-500">*</span>
                </label>
                <input
                  id="setup-username"
                  type="text"
                  required
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="sysadmin"
                  className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs outline-none focus:border-[var(--ring)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-email" className="block text-xs font-bold mb-1.5">
                البريد الإلكتروني للاسترداد (اختياري)
              </label>
              <input
                id="setup-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.example"
                className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs outline-none focus:border-[var(--ring)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="setup-password" className="block text-xs font-bold mb-1.5">
                  كلمة المرور (12 خانة فأكثر) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="setup-password"
                    type={showPass ? "text" : "password"}
                    required
                    minLength={12}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="حرف كبير وصغير ورقم ورمز خاص"
                    className="w-full h-10 px-3 pe-10 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs outline-none focus:border-[var(--ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label="إظهار أو إخفاء كلمة المرور"
                    className="absolute inset-y-0 end-0 px-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="setup-confirm" className="block text-xs font-bold mb-1.5">
                  تأكيد كلمة المرور <span className="text-rose-500">*</span>
                </label>
                <input
                  id="setup-confirm"
                  type={showPass ? "text" : "password"}
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور"
                  className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs outline-none focus:border-[var(--ring)]"
                />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            <span className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--primary)] shrink-0" />
              <span>يتم إغلاق شاشة التهيئة تلقائياً بعد إنشاء المسؤول الأول</span>
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-6 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold text-xs shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shrink-0"
            >
              {submitting ? "جاري التهيئة..." : "إنشاء حساب المدير والبدء"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
