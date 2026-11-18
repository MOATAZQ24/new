"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/ui/BrandMark";

function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <main dir="rtl" className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Brand Banner */}
        <div className="bg-[#123D32] p-8 text-center text-white relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg overflow-hidden">
            <BrandMark size={64} variant="gold-badge" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Investor Gate</h1>
          <p className="text-xs text-[#C5A46D] mt-1 font-medium">
            نظام إدارة عمليات تقنية المعلومات والأصول
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div role="alert" aria-live="assertive" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المستخدم
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-700">
                كلمة المرور
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-semibold text-[#187A5A] hover:text-[#123D32] transition-colors"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>

        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
