"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/ui/Icons";
import { useAuth } from "@/context/AuthContext";
import { mediaUrl, useWorkspace } from "@/context/WorkspaceContext";

interface NavItem {
  name: string;
  href: string;
  icon: keyof typeof Icons;
}

const navItems: NavItem[] = [
  { name: "لوحة التحكم", href: "/", icon: "Dashboard" },
  { name: "الشركات والفروع", href: "/companies", icon: "Companies" },
  { name: "الموظفون", href: "/employees", icon: "Users" },
  { name: "المستخدمون والوصول", href: "/users", icon: "User" },
  { name: "الأصول التقنية", href: "/assets", icon: "Assets" },
  { name: "الأصول الرقمية والخزنة", href: "/digital-assets", icon: "Lock" },
  { name: "عهدة الأصول", href: "/custody", icon: "Custody" },
  { name: "البنية التحتية", href: "/infrastructure", icon: "Infrastructure" },
  { name: "الاشتراكات الخارجية", href: "/subscriptions", icon: "Subscriptions" },
  { name: "الصيانة والتغييرات", href: "/maintenance", icon: "Maintenance" },
  { name: "إدارة المهام", href: "/tasks", icon: "Tasks" },
  { name: "مكتب المساعدة", href: "/tickets", icon: "HelpDesk" },
  { name: "الإشعارات", href: "/notifications", icon: "Notifications" },
  { name: "التقارير والتصدير", href: "/reports", icon: "Reports" },
  { name: "سجل المراجعة", href: "/audit", icon: "Audit" },
  { name: "الإعدادات", href: "/settings", icon: "Settings" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { activeCompany } = useAuth();
  const { draft, setDraft, save } = useWorkspace();

  const configured = draft.navigation.length
    ? draft.navigation.flatMap((pref) => {
        const item = navItems.find((nav) => nav.href === pref.href);
        return item && (!pref.hidden || pref.href === "/settings")
          ? [
              {
                ...item,
                icon: pref.icon === "default" ? item.icon : pref.icon,
                pinned: pref.pinned,
              },
            ]
          : [];
      })
    : navItems.map((item) => ({ ...item, pinned: false }));
  const orderedItems = [
    ...configured.filter((i) => i.pinned),
    ...configured.filter((i) => !i.pinned),
  ];

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const handleToggleCollapse = () => {
    const next = { ...draft, collapsed: !draft.collapsed };
    setDraft(next);
    void save(next).catch(() => setDraft(draft));
  };

  return (
    <aside
      data-collapsed={draft.collapsed}
      data-mobile-open={mobileOpen}
      aria-label="القائمة الرئيسية للنظام"
      className="workspace-sidebar w-64 bg-[#123D32] text-white flex flex-col h-screen fixed inset-y-0 start-0 z-40 border-e border-[#187A5A]/30 select-none shadow-xl"
    >
      {/* Brand & Collapse Header */}
      <div className="workspace-sidebar-header p-4 border-b border-white/10 flex items-center justify-between gap-2">
        <Link
          href="/"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-3 min-w-0"
          title="Investor Gate - الرئيسية"
        >
          <div className="w-10 h-10 rounded-lg bg-[#C5A46D] flex items-center justify-center text-[#123D32] font-black text-xl shadow-md shrink-0">
            {activeCompany?.company_logo?.startsWith("/workspace/") ? (
              <img
                src={mediaUrl(activeCompany.company_logo)}
                alt=""
                className="w-10 h-10 object-contain rounded-lg"
              />
            ) : (
              "IG"
            )}
          </div>
          <div className="workspace-brand-text min-w-0">
            <span className="font-bold text-sm tracking-tight text-white leading-tight truncate">
              Investor Gate
            </span>
            <span className="text-[11px] text-[#C5A46D] font-medium truncate">
              إدارة عمليات تقنية المعلومات
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="hidden md:inline-flex items-center justify-center p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="طي أو توسيع القائمة / Toggle sidebar"
            aria-expanded={!draft.collapsed}
            aria-controls="primary-navigation"
            title={draft.collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            onClick={handleToggleCollapse}
          >
            {draft.collapsed ? <Icons.ChevronLeft size={17} /> : <Icons.ChevronRight size={17} />}
          </button>

          {mobileOpen && (
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="إغلاق قائمة التنقل"
              onClick={() => onCloseMobile?.()}
            >
              <Icons.X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Active Company Badge */}
      <div className="workspace-company-pill px-3.5 py-2.5 bg-black/20 mx-3 my-2.5 rounded-lg border border-white/10 flex items-center justify-between gap-2">
        <div className="truncate">
          <div className="text-[10px] text-white/70">الشركة النشطة</div>
          <div className="text-xs font-semibold text-white truncate">
            {activeCompany ? activeCompany.name_ar : "بوابة المستثمر"}
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#187A5A] text-white font-mono shrink-0">
          <bdi>{activeCompany?.code || "IGT"}</bdi>
        </span>
      </div>

      {/* Navigation Links */}
      <nav id="primary-navigation" className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {orderedItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const IconComp = Icons[item.icon as keyof typeof Icons];

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.name}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onCloseMobile?.()}
              className={`motion-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[#187A5A] text-white font-bold shadow-sm"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`shrink-0 ${
                  isActive ? "text-[#C5A46D]" : "text-white/75"
                }`}
              >
                {IconComp && <IconComp size={18} />}
              </span>
              <span className="workspace-nav-label flex-1 truncate">
                {item.pinned ? "★ " : ""}
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* System Footer info */}
      <div className="workspace-footer-text p-3 border-t border-white/10 text-[10px] text-white/65 text-center">
        الإصدار 1.0.0 Enterprise • نظام ذاتي الاستضافة
      </div>
    </aside>
  );
}
