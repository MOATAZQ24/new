"use client";

import React, { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Icons } from "@/components/ui/Icons";

function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err?.message || "فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Brand Banner */}
        <div className="bg-[#123D32] p-8 text-center text-white relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-[#C5A46D] text-[#123D32] font-black text-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            IG
          </div>
          <h1 className="text-xl font-bold tracking-tight">Investor Gate</h1>
          <p className="text-xs text-[#C5A46D] mt-1 font-medium">
            نظام إدارة عمليات تقنية المعلومات والأصول
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المستخدم
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: admin"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#187A5A] focus:ring-2 focus:ring-[#187A5A]/10 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              كلمة المرور
            </label>
            <input
              type="password"
              required
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

          <div className="text-center pt-2">
            <span className="text-[11px] text-slate-400">
              بيانات الدخول الافتراضية: admin / Admin@12345
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
