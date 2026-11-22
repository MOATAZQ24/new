"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { MobileHeader } from "./MobileHeader";
import { MobileTabBar } from "./MobileTabBar";
import { MustChangePasswordModal } from "@/components/auth/MustChangePasswordModal";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { GlobalAIComposer } from "@/components/ai/GlobalAIComposer";
import { useWorkspace } from "@/context/WorkspaceContext";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { draft, setDraft, save } = useWorkspace();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const next = { ...draft, collapsed: !draft.collapsed };
        setDraft(next);
        void save(next).catch(() => setDraft(draft));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, setDraft, save]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-200 overflow-x-hidden">
      <a href="#main-content" className="skip-to-content">
        التخطي إلى المحتوى الرئيسي
      </a>

      {/* Mandatory password change modal on first login */}
      <MustChangePasswordModal />
      <CommandPalette />
      <GlobalAIComposer />

      {/* ─── DESKTOP SHELL (hidden on mobile, visible on lg and up) ─── */}
      <div className="hidden lg:block">
        {/* Desktop Sidebar */}
        <Sidebar
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        {/* Desktop Top Navbar */}
        <TopNav
          mobileMenuOpen={mobileNavOpen}
          onOpenMobileMenu={() => setMobileNavOpen(true)}
        />
      </div>

      {/* ─── MOBILE SHELL (visible on mobile, hidden on lg and up) ─── */}
      <div className="block lg:hidden">
        {/* Native-like Mobile Header with Company Switcher & Notifications */}
        <MobileHeader />

        {/* Fixed Ergonomic Mobile Tab Bar (5 core destinations) */}
        <MobileTabBar />
      </div>

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="workspace-main pt-16 lg:pt-16 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-8 min-h-screen px-3 sm:px-4 lg:p-6 transition-all duration-200 focus:outline-none max-w-full"
      >
        <div className="w-full max-w-[1680px] mx-auto space-y-4 lg:space-y-6">{children}</div>
      </main>
    </div>
  );
}

export default DashboardLayout;
