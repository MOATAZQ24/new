"use client";

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { MustChangePasswordModal } from "@/components/auth/MustChangePasswordModal";

export function DashboardLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-200">
      {/* Mandatory password change modal on first login */}
      <MustChangePasswordModal />

      {/* Sidebar fixed right */}
      <Sidebar />

      {/* Top Navbar */}
      <TopNav />

      {/* Main Content Area */}
      <main
        className="workspace-main pt-16 min-h-screen p-6 transition-all duration-200"
      >
        <div className="max-w-7xl mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

export default DashboardLayout;
