"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { MustChangePasswordModal } from "@/components/auth/MustChangePasswordModal";
import { AiAgentSidePanel } from "@/components/ai/AiAgentSidePanel";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAiPanelOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-200">
      <a href="#main-content" className="skip-to-content">
        التخطي إلى المحتوى الرئيسي
      </a>

      {/* Mandatory password change modal on first login */}
      <MustChangePasswordModal />

      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] lg:hidden motion-backdrop-enter"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Top Navbar */}
      <TopNav
        mobileMenuOpen={mobileNavOpen}
        onOpenMobileMenu={() => setMobileNavOpen(true)}
        aiPanelOpen={aiPanelOpen}
        onToggleAiPanel={() => setAiPanelOpen((v) => !v)}
      />

      {/* AI Action Agent Side Panel */}
      <AiAgentSidePanel isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="workspace-main pt-16 min-h-screen p-4 sm:p-6 transition-all duration-200 focus:outline-none"
      >
        <div className="max-w-7xl mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

export default DashboardLayout;
