"use client";

import { mediaUrl } from "@/context/WorkspaceContext";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCustomization } from "@/context/CustomizationContext";
import { Icons } from "@/components/ui/Icons";

export function TopNav() {
  const { user, activeCompany, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const { 
    theme, 
    setTheme, 
    resolvedTheme, 
    companyBranding 
  } = useCustomization();
  
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const effectiveLogo = companyBranding?.company_logo || (activeCompany as any)?.company_logo;

  const toggleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <header
      className="workspace-topnav h-16 bg-[var(--surface)] border-b border-[var(--border-color)] fixed top-0 left-0 z-30 flex items-center justify-between px-6 shadow-xs select-none transition-all duration-200"
    >
      {/* Right Side (Company Switcher & Search) */}
      <div className="flex items-center gap-4">
        {/* Company Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowCompanyMenu(!showCompanyMenu)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#187A5A] text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50/70 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {effectiveLogo ? (
              <img
                src={effectiveLogo.startsWith("/workspace/") ? mediaUrl(effectiveLogo) : effectiveLogo}
                alt="Logo"
                className="w-5 h-5 object-contain rounded shrink-0"
              />
            ) : (
              <Icons.Companies size={16} className="text-[#187A5A]" />
            )}
            <span className="truncate max-w-[180px]">
              {companyBranding?.brand_name_ar || (activeCompany ? activeCompany.name_ar : "اختر الشركة")}
            </span>
            <Icons.ChevronDown size={14} className="text-slate-400" />
          </button>

          {showCompanyMenu && user && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-100 dark:border-slate-700">
                الشركات المصرح بها
              </div>
              {user.companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCompanyId(c.id);
                    setShowCompanyMenu(false);
                  }}
                  className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer ${
                    c.id === activeCompanyId
                      ? "text-[#187A5A] font-bold bg-[#187A5A]/5"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <div className="truncate flex items-center gap-2">
                    {(c as any).company_logo ? (
                      <img src={(c as any).company_logo} alt="" className="w-4 h-4 object-contain rounded" />
                    ) : null}
                    <div>
                      <div>{c.name_ar}</div>
                      <div className="text-[10px] text-slate-400">{c.name_en}</div>
                    </div>
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
            className="w-72 bg-slate-100/80 dark:bg-slate-800 border border-transparent focus:border-[#187A5A] focus:bg-white dark:focus:bg-slate-900 text-xs py-1.5 pr-9 pl-3 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Left Side (Theme Toggle, Notifications & User Profile) */}
      <div className="flex items-center gap-3">
        {/* Quick Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-[#187A5A] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={`المظهر الحالي: ${theme === "light" ? "فاتح" : theme === "dark" ? "داكن" : "تلقائي حسب النظام"}`}
        >
          {resolvedTheme === "dark" ? (
            <Icons.LifeBuoy size={18} className="text-amber-400" />
          ) : (
            <Icons.Clock size={18} className="text-slate-600" />
          )}
        </button>

        {/* Notification Bell */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-[#187A5A] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="الإشعارات"
        >
          <Icons.Notifications size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"></span>
        </Link>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#123D32] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#C5A46D]/30">
              {user?.full_name ? user.full_name[0] : "A"}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {user?.full_name || user?.username || "مدير النظام"}
              </div>
              <div className="text-[10px] text-[#187A5A] font-semibold">
                {user?.roles?.[0] || (user?.is_superadmin ? "مدير النظام العام" : "موظف")}
              </div>
            </div>
            <Icons.ChevronDown size={14} className="text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 z-50">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-[11px] text-slate-400">{user?.email}</div>
              </div>

              <Link
                href="/settings"
                onClick={() => setShowUserMenu(false)}
                className="block px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                إعدادات الحساب وكلمة المرور
              </Link>

              <Link
                href="/settings/appearance"
                onClick={() => setShowUserMenu(false)}
                className="block px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                المظهر وتخصيص الواجهة
              </Link>

              <Link
                href="/settings/branding"
                onClick={() => setShowUserMenu(false)}
                className="block px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                شعار وهوية الشركة (Branding)
              </Link>

              <button
                onClick={logout}
                className="w-full text-right px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-between transition-colors border-t border-slate-100 dark:border-slate-700 cursor-pointer"
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
