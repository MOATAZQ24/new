"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CheckSquare, Headphones, Layers, LayoutGrid } from "lucide-react";
import { MobileMoreMenuSheet } from "./MobileMoreMenuSheet";

export function MobileTabBar() {
  const pathname = usePathname();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const navItems = [
    {
      name: "الرئيسية",
      sub: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      name: "المهام",
      sub: "Tasks",
      href: "/tasks",
      icon: CheckSquare,
      isActive: pathname.startsWith("/tasks"),
    },
    {
      name: "الدعم",
      sub: "Help Desk",
      href: "/tickets",
      icon: Headphones,
      isActive: pathname.startsWith("/tickets"),
    },
    {
      name: "الأصول",
      sub: "Assets",
      href: "/assets",
      icon: Layers,
      isActive: pathname.startsWith("/assets"),
    },
  ];

  const isMoreActive =
    pathname === "/more" ||
    (!navItems.some((item) => item.isActive) && pathname !== "/");

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 shadow-lg select-none pb-[max(env(safe-area-inset-bottom),8px)]"
        aria-label="شريط التنقل السفلي للجوال"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.isActive;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-center h-full active:scale-95 transition-transform"
                title={item.sub}
              >
                <div
                  className={`w-14 h-12 rounded-2xl flex flex-col items-center justify-center transition-all duration-150 ${
                    active
                      ? "bg-primary/[0.12] dark:bg-primary/20 text-primary font-bold shadow-2xs"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.4 : 2}
                    className="shrink-0"
                  />
                  <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[50px] leading-tight">
                    {item.name}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* 5th Tab: "المزيد" (More) */}
          <Link
            href="/more"
            className="flex items-center justify-center h-full active:scale-95 transition-transform"
            title="المزيد من القوائم والوحدات"
            aria-label="المزيد من الوحدات"
          >
            <div
              className={`w-14 h-12 rounded-2xl flex flex-col items-center justify-center transition-all duration-150 ${
                isMoreActive
                  ? "bg-primary/[0.12] dark:bg-primary/20 text-primary font-bold shadow-2xs"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium"
              }`}
            >
              <LayoutGrid
                size={20}
                strokeWidth={isMoreActive ? 2.4 : 2}
                className="shrink-0"
              />
              <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[50px] leading-tight">
                المزيد
              </span>
            </div>
          </Link>
        </div>
      </nav>

      {/* More Menu Bottom Sheet retained for backward compatibility / fallback */}
      <MobileMoreMenuSheet
        isOpen={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
      />
    </>
  );
}
