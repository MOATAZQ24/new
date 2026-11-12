"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icons } from "@/components/ui/Icons";

export function TopNav() {
  const { user, activeCompany, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-slate-200 fixed top-0 left-0 right-64 z-30 flex items-center justify-between px-6 shadow-xs select-none">
      {/* Right Side (Company Switcher & Search) */}
      <div className="flex items-center gap-4">
        {/* Company Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowCompanyMenu(!showCompanyMenu)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#187A5A] text-xs font-semibold text-slate-700 bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
          >
            <Icons.Companies size={16} className="text-[#187A5A]" />
            <span className="truncate max-w-[180px]">
              {activeCompany ? activeCompany.name_ar : "اختر الشركة"}
            </span>
            <Icons.ChevronDown size={14} className="text-slate-400" />
          </button>

          {showCompanyMenu && user && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-100">
                الشركات المصرح بها
              </div>
              {user.companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCompanyId(c.id);
                    setShowCompanyMenu(false);
                  }}
                  className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    c.id === activeCompanyId
                      ? "text-[#187A5A] font-bold bg-[#187A5A]/5"
                      : "text-slate-700"
                  }`}
                >
                  <div className="truncate">
                    <div>{c.name_ar}</div>
                    <div className="text-[10px] text-slate-400">{c.name_en}</div>
                  </div>
                  {c.id === activeCompanyId && (
                    <Icons.Check size={14} className="text-[#187A5A] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global Search */}
        <div className="relative hidden md:block">
          <Icons.Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="بحث في الأصول، التذاكر، الموظفين..."
            className="w-72 bg-slate-100/80 border border-transparent focus:border-[#187A5A] focus:bg-white text-xs py-1.5 pr-9 pl-3 rounded-lg outline-none transition-all placeholder:text-slate-400 text-slate-800"
          />
        </div>
      </div>

      {/* Left Side (Notifications & User Profile) */}
      <div className="flex items-center gap-3">
        {/* Notification Bell */}
        <a
          href="/notifications"
          className="relative p-2 rounded-lg text-slate-600 hover:text-[#187A5A] hover:bg-slate-100 transition-colors"
          title="الإشعارات"
        >
          <Icons.Notifications size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
        </a>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#123D32] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#C5A46D]/30">
              {user?.full_name ? user.full_name[0] : "A"}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-slate-800 leading-tight">
                {user?.full_name || user?.username || "مدير النظام"}
              </div>
              <div className="text-[10px] text-[#187A5A] font-semibold">
                {user?.roles?.[0] || (user?.is_superadmin ? "مدير النظام العام" : "موظف")}
              </div>
            </div>
            <Icons.ChevronDown size={14} className="text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-800">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-[11px] text-slate-400">{user?.email}</div>
              </div>

              <a
                href="/settings"
                className="block px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                إعدادات الحساب وكلمة المرور
              </a>

              <button
                onClick={logout}
                className="w-full text-right px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center justify-between transition-colors border-t border-slate-100"
              >
                <span>تسجيل الخروج</span>
                <Icons.LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
