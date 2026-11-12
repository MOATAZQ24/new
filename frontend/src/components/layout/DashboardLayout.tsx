"use client";

import React from "react";
import { AuthProvider } from "@/context/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#F5F7F8]">
        {/* Sidebar fixed right */}
        <Sidebar />

        {/* Top Navbar */}
        <TopNav />

        {/* Main Content Area */}
        <main className="mr-64 pt-16 min-h-screen p-6 transition-all duration-200">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
}

export default DashboardLayout;
