"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


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
        className="fixed top-0 inset-x-0 z-30 lg:hidden h-16 bg-gradient-to-b from-primary/[0.08] via-white/95 to-white/90 dark:via-slate-900/95 dark:to-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 px-4 flex items-center justify-between gap-2 shadow-2xs select-none"
        aria-label="شريط الجوال العلوي"
      >
        {/* Right side (RTL): Brand name and logo badge */}
        <button
          type="button"
          onClick={() => setCompanySheetOpen(true)}
          className="flex items-center gap-2.5 text-start -m-1.5 p-1.5 rounded-2xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition active:scale-98 cursor-pointer"
          title="تبديل المنشأة أو الشركة"
        >
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
            {activeCompany?.company_logo?.startsWith("/workspace/") ? (
              <img
                src={mediaUrl(activeCompany.company_logo)}
                alt=""
                className="w-9 h-9 object-contain rounded-xl"
              />
            ) : (
              <BrandMark size={30} variant="gold-badge" />
            )}
          </div>

          <div className="min-w-0 flex items-center gap-1.5">
            <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
              Investor Gate OS
            </span>
            {companiesList.length > 1 && (
              <ChevronDown size={14} className="text-slate-400 shrink-0" />
            )}
          </div>
        </button>

        {/* Left side (RTL): Search & Notifications round floating buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Universal Search Trigger */}
          <button
            type="button"
            onClick={handleOpenSearch}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-2xs border border-slate-100 dark:border-slate-800/80 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition active:scale-95 cursor-pointer"
            aria-label="البحث السريع (Ctrl+K)"
          >
            <Search size={18} strokeWidth={2.2} />
          </button>

          {/* Notifications Link */}
          <Link
            href="/notifications"
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-2xs border border-slate-100 dark:border-slate-800/80 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 relative transition active:scale-95"
            aria-label="مركز الإشعارات"
          >
            <Bell size={18} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-800" />
            )}
          </Link>
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
