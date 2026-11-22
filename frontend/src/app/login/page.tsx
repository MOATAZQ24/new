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
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 relative overflow-hidden select-none"
    >
      {/* Ambient background glow */}
      <div className="absolute top-1/4 -start-24 w-96 h-96 bg-[#7C3AED]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -end-24 w-96 h-96 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[420px] bg-card text-card-foreground rounded-3xl shadow-2xl border border-border/80 p-8 sm:p-10 relative z-10 backdrop-blur-xl space-y-6">
        
        {/* Brand Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#9333EA] text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-purple-600/30 mx-auto mb-4 ring-4 ring-purple-500/10">
            <span>IG</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Investor Gate OS
          </h1>
          <p className="text-xs text-muted-foreground font-medium mt-1.5">
            منظومة إدارة عمليات تقنية المعلومات الموحدة
          </p>
        </div>

        {/* Status & Alerts */}
        {setupBanner && (
          <div
            role="status"
            className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>تم إنشاء حساب مدير النظام الأول بنجاح. يمكنك تسجيل الدخول الآن.</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-username" className="block text-xs font-bold text-foreground">
              اسم المستخدم
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-muted-foreground">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full ps-10 pe-3.5 py-2.5 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground/50 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 text-xs outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-xs font-bold text-foreground">
              كلمة المرور
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-muted-foreground">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full ps-10 pe-10 py-2.5 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground/50 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 text-xs outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 end-0 pe-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-purple-600/20 hover:shadow-purple-600/30 transition-all duration-150 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 pt-3"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              <span>تسجيل الدخول</span>
            )}
          </button>
        </form>

        {/* Quick Credentials Info */}
        <div className="pt-2 text-center border-t border-border/50">
          <p className="text-[11px] text-muted-foreground font-mono">
            الحساب الافتراضي: <span className="font-bold text-foreground">admin</span> / <span className="font-bold text-foreground">Admin@12345</span>
          </p>
        </div>

      </div>
    </main>
  );
}
