"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Headphones,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Moon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { BrandLogo, BrandSymbol } from "@/components/ui/brand-logo";
import { AssetIcon, CustodyIcon, SwitchIcon, VaultIcon } from "@/components/ui/domain-icons";
import { useAuth } from "@/context/AuthContext";
import { mediaUrl, useWorkspace } from "@/context/WorkspaceContext";
import { useCustomization } from "@/context/CustomizationContext";

interface NavItem {
  name: string;
  href: string;
  section: "work" | "ops" | "admin";
  icon: React.ReactNode;
  managerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { name: "أعمالي", href: "/my-work", section: "work", icon: <Inbox className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "لوحة التحكم", href: "/", section: "work", icon: <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "مكتب المساعدة", href: "/tickets", section: "work", icon: <Headphones className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "المهام", href: "/tasks", section: "work", icon: <CheckSquare className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "الموافقات والتغييرات", href: "/approvals", section: "work", icon: <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.5} /> },

  { name: "الأصول التقنية", href: "/assets", section: "ops", icon: <AssetIcon size={18} /> },
  { name: "العهدة والتسليم", href: "/custody", section: "ops", icon: <CustodyIcon size={18} /> },
  { name: "البنية التحتية", href: "/infrastructure", section: "ops", icon: <SwitchIcon size={18} /> },
  { name: "الاشتراكات والتراخيص", href: "/subscriptions", section: "ops", icon: <CreditCard className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "خزنة الأصول الرقمية", href: "/digital-assets", section: "ops", icon: <VaultIcon size={18} /> },

  { name: "الموظفون", href: "/employees", section: "admin", icon: <Users className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "الهيكل التنظيمي", href: "/companies", section: "admin", icon: <Building2 className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "التقارير والتحليلات", href: "/reports", section: "admin", icon: <BarChart3 className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "قاعدة المعرفة", href: "/help", section: "admin", icon: <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { name: "التوزيع و SLA", href: "/settings/work-management", section: "admin", icon: <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.5} />, managerOnly: true },
  { name: "الإعدادات", href: "/settings", section: "admin", icon: <Settings className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname() || "/";
  const { activeCompany, user } = useAuth();
  const { draft, setDraft, save } = useWorkspace();
  const { setTheme, resolvedTheme } = useCustomization();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const isManagerOrAdmin = Boolean(
    user?.is_superadmin ||
      user?.roles?.some((r) => ["Super Admin", "Company Admin", "IT Manager"].includes(r))
  );

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.managerOnly || isManagerOrAdmin),
    [isManagerOrAdmin]
  );

  // Longest-prefix matching prevents highlighting both /settings and /settings/work-management
  const activeHref = useMemo(() => {
    const matches = visibleItems.filter((item) =>
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
    if (matches.length === 0) return "";
    return matches.sort((a, b) => b.href.length - a.href.length)[0].href;
  }, [visibleItems, pathname]);

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

  const renderSection = (section: NavItem["section"]) => {
    const group = visibleItems.filter((i) => i.section === section);
    return (
      <div className="space-y-0.5">
        {group.map((item) => {
          const isActive = item.href === activeHref;
          const linkEl = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onCloseMobile?.()}
              className={`relative flex items-center gap-2.5 rounded-[var(--radius-6)] px-2.5 h-9 text-[13px] transition-colors duration-[var(--dur-fast)] ${
                isActive
                  ? "bg-[var(--primary-soft)] text-[var(--primary-text)] font-semibold"
                  : "text-[var(--text-2)] font-medium hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 start-0 w-[2px] rounded-full bg-[var(--primary)]"
                />
              )}
              <span className={`shrink-0 ${isActive ? "text-[var(--primary-text)]" : "text-[var(--icon-muted)]"}`}>
                {item.icon}
              </span>
              <span className="workspace-nav-label flex-1 truncate">{item.name}</span>
            </Link>
          );

          if (draft.collapsed) {
            return (
              <Tooltip key={item.href} content={item.name} position="left" delayMs={120}>
                {linkEl}
              </Tooltip>
            );
          }
          return linkEl;
        })}
      </div>
    );
  };

  return (
    <aside
      data-collapsed={draft.collapsed}
      data-mobile-open={mobileOpen}
      aria-label="القائمة الرئيسية للنظام"
      className="workspace-sidebar bg-[var(--surface)] text-[var(--text)] flex flex-col h-screen fixed inset-y-0 start-0 z-40 border-e border-[var(--border)] select-none"
    >
      {/* Brand Header (52px aligned with TopNav) */}
      <div className="workspace-sidebar-header h-[52px] px-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2 shrink-0">
        <Link
          href="/my-work"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-2.5 min-w-0"
          title="بوابة المستثمر — Investor Gate OS"
        >
          {activeCompany?.company_logo?.startsWith("/workspace/") ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(activeCompany.company_logo)} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
              <div className="workspace-brand-text flex flex-col min-w-0 leading-tight">
                <span className="text-[14px] font-semibold text-[var(--text)] truncate">بوابة المستثمر</span>
                <span className="text-[10px] text-[var(--text-3)] uppercase tracking-[0.08em] truncate" dir="ltr">INVESTOR GATE</span>
              </div>
            </>
          ) : draft.collapsed ? (
            <BrandSymbol size={28} />
          ) : (
            <BrandLogo variant="horizontal" size={28} />
          )}
        </Link>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label={draft.collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            aria-expanded={!draft.collapsed}
            aria-controls="primary-navigation"
            onClick={handleToggleCollapse}
          >
            {draft.collapsed ? <ChevronLeft className="h-4 w-4" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.5} />}
          </button>

          {mobileOpen && (
            <button
              type="button"
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] cursor-pointer"
              aria-label="إغلاق قائمة التنقل"
              onClick={() => onCloseMobile?.()}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sections */}
      <nav id="primary-navigation" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
        {renderSection("work")}
        <div className="border-t border-[var(--border)] pt-3">{renderSection("ops")}</div>
        <div className="border-t border-[var(--border)] pt-3">{renderSection("admin")}</div>
      </nav>

      {/* Quiet Footer */}
      <div className="workspace-sidebar-footer px-2.5 py-2.5 border-t border-[var(--border)] flex items-center justify-between gap-1 shrink-0">
        <Link
          href="/help"
          onClick={() => onCloseMobile?.()}
          className="inline-flex items-center gap-2 h-8 px-2 rounded-[var(--radius-6)] text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
        >
          <HelpCircle className="h-4 w-4 text-[var(--icon-muted)] shrink-0" strokeWidth={1.5} />
          <span className="workspace-nav-label">المساعدة</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={mounted && resolvedTheme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
          title={mounted && resolvedTheme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </aside>
  );
}
