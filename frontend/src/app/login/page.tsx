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
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { BrandLogo, Button, FormField, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupBanner, setSetupBanner] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .get<{ requires_setup: boolean }>("/auth/bootstrap-status")
      .then((res) => {
        if (!active) return;
        if (res.data?.requires_setup) {
          router.replace("/setup");
          return;
        }
        if (typeof window !== "undefined" && window.location.search.includes("setup=complete")) {
          setSetupBanner(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[var(--bg)] text-[var(--text)] grid grid-cols-1 lg:grid-cols-2"
    >
      {/* Brand Panel — Quiet, Architectural, Typographic (Zero blobs/gradients/stock imagery) */}
      <section
        aria-label="هوية بوابة المستثمر"
        className="hidden lg:flex flex-col justify-between bg-[var(--brand-petrol-deep)] text-white p-12 border-e border-[var(--border)]"
      >
        <BrandLogo variant="horizontal" tone="reversed" size={36} />

        <div className="max-w-md space-y-5">
          <p className="text-[12px] font-medium tracking-[0.06em] text-white/80">
            منظومة عمليات تقنية المعلومات للشركات المتعددة
          </p>
          <h1 className="text-[32px] font-semibold leading-[1.35] text-white">
            حوكمة دقيقة للأصول والتذاكر والعمليات التقنية من بوابة واحدة.
          </h1>
          <p className="text-[14px] leading-[1.7] text-white/85">
            بيئة ذاتية الاستضافة مصممة لفرق تقنية المعلومات وإدارات العمليات — مع عزل كامل لبيانات الشركات، تتبّع اتفاقيات مستوى الخدمة، وسجل تدقيق غير قابل للتعديل.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/15 pt-5 text-[12px] text-white/75">
          <span>بوابة المستثمر · Investor Gate OS</span>
          <span dir="ltr">Self-Hosted Enterprise IT Ops</span>
        </div>
      </section>

      {/* Form Panel — Calm, Focused, Password-Manager Friendly */}
      <section className="flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[380px] space-y-6">
          <div className="lg:hidden pb-2">
            <BrandLogo variant="horizontal" size={32} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[24px] font-semibold leading-[1.35] text-[var(--text)]">
              تسجيل الدخول
            </h2>
            <p className="text-[14px] text-[var(--text-2)]">
              أدخل بيانات حسابك المؤسسي للمتابعة إلى مساحة العمل.
            </p>
          </div>

          {setupBanner && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[var(--radius-10)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3.5 py-3 text-[13px] text-[var(--success-text)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <span>تم إنشاء حساب مدير النظام الأول بنجاح. يمكنك تسجيل الدخول الآن.</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2.5 rounded-[var(--radius-10)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-3 text-[13px] text-[var(--danger-text)]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="اسم المستخدم" htmlFor="login-username" required>
              <Input
                id="login-username"
                name="username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                leadingIcon={<User className="h-4 w-4" strokeWidth={1.5} />}
              />
            </FormField>

            <FormField label="كلمة المرور" htmlFor="login-password" required>
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                leadingIcon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
                trailingIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                }
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>

          <p className="pt-4 border-t border-[var(--border)] text-[12px] text-[var(--text-3)] leading-[1.6]">
            في حال نسيان كلمة المرور أو تعذّر الوصول، يرجى التواصل مع مدير تقنية المعلومات في شركتك.
          </p>
        </div>
      </section>
    </main>
  );
}
