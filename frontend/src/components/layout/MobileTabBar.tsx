"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, CheckSquare, Headphones, Laptop, Grid } from "lucide-react";
import { MobileMoreMenuSheet } from "./MobileMoreMenuSheet";

export function MobileTabBar() {
  const pathname = usePathname();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const navItems = [
    {
      name: "اليوم",
      sub: "My Day",
      href: "/",
      icon: Compass,
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
      icon: Laptop,
      isActive: pathname.startsWith("/assets"),
    },
  ];

  const isMoreActive =
    !navItems.some((item) => item.isActive) && pathname !== "/";

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-lg select-none pb-[max(env(safe-area-inset-bottom),8px)]"
        aria-label="شريط التنقل السفلي للجوال"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.isActive;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center h-full transition-all duration-150 active:scale-92 ${
                  active
                    ? "text-[#123D32] dark:text-emerald-400 font-bold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                title={item.sub}
              >
                <div className="relative">
                  <Icon
                    size={21}
                    strokeWidth={active ? 2.5 : 2}
                    className={`transition-transform duration-150 ${active ? "scale-105" : ""}`}
                  />
                  {active && (
                    <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-1 h-1 bg-[#187A5A] dark:bg-emerald-400 rounded-full" />
                  )}
                </div>
                <span className="text-[10px] mt-1 tracking-tight truncate max-w-[56px]">
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* 5th Tab: "المزيد" (More) */}
          <button
            type="button"
            onClick={() => setMoreMenuOpen(true)}
            className={`flex flex-col items-center justify-center h-full transition-all duration-150 active:scale-92 cursor-pointer ${
              isMoreActive || moreMenuOpen
                ? "text-[#123D32] dark:text-emerald-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
            title="المزيد من القوائم والوحدات"
            aria-label="المزيد من الوحدات"
          >
            <div className="relative">
              <Grid
                size={21}
                strokeWidth={isMoreActive || moreMenuOpen ? 2.5 : 2}
                className={`transition-transform duration-150 ${
                  isMoreActive || moreMenuOpen ? "scale-105" : ""
                }`}
              />
              {(isMoreActive || moreMenuOpen) && (
                <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-1 h-1 bg-[#187A5A] dark:bg-emerald-400 rounded-full" />
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight">المزيد</span>
          </button>
        </div>
      </nav>

      {/* More Menu Bottom Sheet */}
      <MobileMoreMenuSheet
        isOpen={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
      />
    </>
  );
}
