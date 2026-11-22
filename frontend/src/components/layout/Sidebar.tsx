"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/ui/Icons";
import { Star } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { BrandMark } from "@/components/ui/BrandMark";
import { useAuth } from "@/context/AuthContext";
import { mediaUrl, useWorkspace } from "@/context/WorkspaceContext";
import { useCustomization } from "@/context/CustomizationContext";

interface NavItem {
  name: string;
  href: string;
  icon: keyof typeof Icons;
}

const navItems: NavItem[] = [
  { name: "لوحة التحكم", href: "/", icon: "Dashboard" },
  { name: "إدارة المهام", href: "/tasks", icon: "Tasks" },
  { name: "مركز الخدمات", href: "/tickets", icon: "HelpDesk" },
  { name: "الموافقات", href: "/approvals", icon: "ShieldCheck" },
  { name: "الأصول التقنية", href: "/assets", icon: "Assets" },
  { name: "الموظفون", href: "/employees", icon: "Users" },
  { name: "الهيكل التنظيمي", href: "/companies", icon: "Companies" },
  { name: "التقارير والتحليلات", href: "/reports", icon: "Reports" },
  { name: "قاعدة المعرفة", href: "/help", icon: "Audit" },
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
  const { theme, setTheme, resolvedTheme } = useCustomization();

  const toggleTheme = () => {
    const nextMode = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextMode);
    const nextConfig = {
      ...draft,
      appearance: { ...draft.appearance, theme: nextMode },
    };
    setDraft(nextConfig);
    void save(nextConfig);
  };

  // Strictly enforce the 9 canonical screenshot navigation items; never allow old saved preferences
  // to hide core screenshot items or inject removed routes.
  const configured = navItems.map((item) => {
    const pref = draft.navigation.find((p) => p.href === item.href);
    return {
      ...item,
      icon: pref && pref.icon && pref.icon !== "default" ? pref.icon : item.icon,
      pinned: Boolean(pref?.pinned),
    };
  });
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
      className="workspace-sidebar bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)] flex flex-col h-screen fixed inset-y-0 start-0 z-40 border-e border-white/10 select-none shadow-xl transition-all duration-200"
    >
      {/* Brand & Collapse Header */}
      <div className="workspace-sidebar-header p-4 border-b border-white/10 flex items-center justify-between gap-2">
        <Link
          href="/"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-3 min-w-0"
          title="Investor Gate - الرئيسية"
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[var(--accent-foreground)] font-black text-xl shadow-md shrink-0 overflow-hidden">
            {activeCompany?.company_logo?.startsWith("/workspace/") ? (
              <img
                src={mediaUrl(activeCompany.company_logo)}
                alt=""
                className="w-10 h-10 object-contain rounded-lg"
              />
            ) : (
              <BrandMark size={40} variant="gold-badge" />
            )}
          </div>
          <div className="workspace-brand-text flex flex-col min-w-0 flex-1 overflow-hidden">
            <span className="block font-bold text-sm tracking-tight text-white leading-tight truncate">
              بوابة المستثمر
            </span>
            <span className="block text-[11px] text-[var(--accent)] font-medium truncate">
              Investor Gate OS
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="hidden lg:inline-flex items-center justify-center p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
              className="lg:hidden inline-flex items-center justify-center p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--sidebar-active)] text-white font-mono shrink-0">
          <bdi>{activeCompany?.code || "IGT"}</bdi>
        </span>
      </div>

      {/* Navigation Links */}
      <nav id="primary-navigation" className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {orderedItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const IconComp = Icons[item.icon as keyof typeof Icons];

          const linkEl = (
            <Link
              key={item.href}
              href={item.href}
              title={draft.collapsed ? undefined : item.name}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onCloseMobile?.()}
              className={`motion-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[var(--sidebar-active)] text-white font-bold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`shrink-0 ${
                  isActive ? "text-[var(--accent)]" : "text-white/75"
                }`}
              >
                {IconComp && <IconComp size={18} />}
              </span>
              <span className="workspace-nav-label flex-1 truncate">
                {item.pinned && <Star size={11} className="inline ml-1 text-amber-400 fill-amber-400" />}
                {item.name}
              </span>
            </Link>
          );

          if (draft.collapsed) {
            return (
              <Tooltip key={item.href} content={item.name} position="left" delayMs={100}>
                {linkEl}
              </Tooltip>
            );
          }

          return linkEl;
        })}
      </nav>

      {/* System Footer & Quick Actions (Reference 1 & 2) */}
      <div className="workspace-sidebar-footer p-3 border-t border-white/10 space-y-2">
        <div className="flex items-center justify-between gap-1 text-white/80">
          <Link
            href="/help"
            title="المساعدة"
            onClick={() => onCloseMobile?.()}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/10 text-white/85 hover:text-white transition-colors"
          >
            <span className="w-5 h-5 rounded-full border border-white/40 flex items-center justify-center text-[11px] font-bold">?</span>
            <span className="workspace-nav-label font-medium">المساعدة</span>
          </Link>

          <div className="flex items-center gap-1">
            {/* Quick theme pill toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="تبديل المظهر"
              title={resolvedTheme === "dark" ? "التحويل للوضع الفاتح" : "التحويل للوضع الداكن"}
              className="p-1.5 rounded-lg bg-black/30 hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              {resolvedTheme === "dark" ? <Icons.Sun size={15} className="text-amber-300" /> : <Icons.Moon size={15} />}
            </button>

            {/* Collapse button */}
            <button
              type="button"
              onClick={handleToggleCollapse}
              aria-label="طي القائمة"
              title={draft.collapsed ? "توسيع" : "طي"}
              className="hidden lg:inline-flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <Icons.ChevronRight size={15} className={`transition-transform ${draft.collapsed ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
