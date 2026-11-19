"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Bell, ChevronDown, Check, Building2, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { mediaUrl } from "@/context/WorkspaceContext";
import { BrandMark } from "@/components/ui/BrandMark";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { api } from "@/lib/api";

export function MobileHeader() {
  const { user, activeCompany, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Fetch unread notifications count
  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const res = await api.get<{ unread_count?: number; total?: number }>("/notifications?unread_only=true&per_page=1");
        if (isMounted && typeof res.data?.unread_count === "number") {
          setUnreadCount(res.data.unread_count);
        } else if (isMounted && typeof res.data?.total === "number") {
          setUnreadCount(res.data.total);
        }
      } catch {
        // Non-blocking fallback
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCompanyId]);

  const handleOpenSearch = () => {
    // Trigger global Ctrl+K / Cmd+K event for CommandPalette
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true }));
  };

  const companiesList = user?.companies || [];

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-30 lg:hidden h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3.5 flex items-center justify-between gap-2 shadow-2xs select-none"
        aria-label="شريط الجوال العلوي"
      >
        {/* Active Company & Switcher Trigger */}
        <button
          type="button"
          onClick={() => setCompanySheetOpen(true)}
          className="flex items-center gap-2 max-w-[55%] text-start p-1 -m-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-98 cursor-pointer"
          title="تبديل المنشأة أو الشركة"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[var(--accent-foreground)] font-bold text-sm shadow-xs shrink-0 overflow-hidden">
            {activeCompany?.company_logo?.startsWith("/workspace/") ? (
              <img
                src={mediaUrl(activeCompany.company_logo)}
                alt=""
                className="w-8 h-8 object-contain rounded-lg"
              />
            ) : (
              <BrandMark size={28} variant="gold-badge" />
            )}
          </div>

          <div className="min-w-0 flex items-center gap-1">
            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
              {activeCompany?.name_ar || activeCompany?.name_en || "بوابة المستثمر"}
            </span>
            {companiesList.length > 1 && (
              <ChevronDown size={14} className="text-slate-400 shrink-0" />
            )}
          </div>
        </button>

        {/* Action Buttons: Search, Notifications, Profile */}
        <div className="flex items-center gap-1">
          {/* Quick Universal Search Trigger */}
          <button
            type="button"
            onClick={handleOpenSearch}
            className="w-9 h-9 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="البحث السريع (Ctrl+K)"
          >
            <Search size={18} />
          </button>

          {/* Notifications Link */}
          <Link
            href="/notifications"
            className="w-9 h-9 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center relative transition active:scale-95"
            aria-label="مركز الإشعارات"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            )}
          </Link>

          {/* User Profile Avatar / Sheet Trigger */}
          <button
            type="button"
            onClick={() => setProfileSheetOpen(true)}
            className="w-8 h-8 rounded-full bg-[#123D32] text-[#C5A46D] font-bold text-xs flex items-center justify-center ms-1 ring-1 ring-slate-200 dark:ring-slate-700 shadow-2xs cursor-pointer active:scale-95"
            aria-label="قائمة الحساب والمستخدم"
          >
            {user?.full_name ? user.full_name.slice(0, 1).toUpperCase() : <User size={14} />}
          </button>
        </div>
      </header>

      {/* Company Switcher Bottom Sheet */}
      <MobileBottomSheet
        isOpen={companySheetOpen}
        onClose={() => setCompanySheetOpen(false)}
        title="المنشآت والشركات"
        description="اختر الشركة التي تود استعراض بياناتها وعملياتها"
      >
        <div className="space-y-2 py-1">
          {companiesList.map((comp) => {
            const isSelected = comp.id === activeCompanyId;
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => {
                  setActiveCompanyId(comp.id);
                  setCompanySheetOpen(false);
                }}
                className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-start transition cursor-pointer border ${
                  isSelected
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-[#123D32] dark:text-emerald-300 font-bold"
                    : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-[#123D32] text-white"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">
                      {comp.name_ar || comp.name_en}
                    </div>
                    {comp.code && (
                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                        #{comp.code}
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </MobileBottomSheet>

      {/* User Profile & Account Bottom Sheet */}
      <MobileBottomSheet
        isOpen={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        title="حساب المستخدم"
        description="الملف الشخصي وإعدادات الجلسة"
      >
        <div className="space-y-4 py-2">
          {/* User Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#123D32] text-[#C5A46D] font-bold text-lg flex items-center justify-center shadow-xs">
              {user?.full_name?.slice(0, 1).toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {user?.full_name || "مستخدم النظام"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                {user?.email}
              </div>
              <div className="inline-block mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                {user?.roles?.[0] || (user?.is_superadmin ? "مدير النظام العام" : "مستخدم معتمد")}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-1">
            <Link
              href="/settings"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition"
            >
              <span>إعدادات النظام والحساب</span>
              <span className="text-slate-400">←</span>
            </Link>
            <Link
              href="/settings/appearance"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition"
            >
              <span>تخصيص المظهر والألوان</span>
              <span className="text-slate-400">←</span>
            </Link>
            <Link
              href="/notifications"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition"
            >
              <span>مركز التنبيهات والإشعارات</span>
              <span className="text-slate-400">←</span>
            </Link>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              setProfileSheetOpen(false);
              logout();
            }}
            className="w-full mt-2 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-bold text-sm border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 transition cursor-pointer"
          >
            تسجيل الخروج من المنظومة
          </button>
        </div>
      </MobileBottomSheet>
    </>
  );
}
