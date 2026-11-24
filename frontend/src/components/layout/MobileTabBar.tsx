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
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[var(--surface)] border-t border-[var(--border)] select-none pb-[max(env(safe-area-inset-bottom),6px)]"
        aria-label="شريط التنقل السفلي للجوال"
      >
        <div className="grid grid-cols-5 h-15 items-center px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.isActive;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-center h-full"
                title={item.sub}
              >
                <div
                  className={`w-14 h-11 rounded-[var(--radius-10)] flex flex-col items-center justify-center transition-colors duration-[var(--dur-fast)] ${
                    active
                      ? "bg-[var(--primary-soft)] text-[var(--primary-text)] font-semibold"
                      : "text-[var(--text-2)] hover:text-[var(--text)] font-medium"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} className="shrink-0" />
                  <span className="text-[10.5px] mt-0.5 truncate max-w-[52px] leading-tight">
                    {item.name}
                  </span>
                </div>
              </Link>
            );
          })}

          <Link
            href="/more"
            className="flex items-center justify-center h-full"
            title="المزيد من القوائم والوحدات"
            aria-label="المزيد من الوحدات"
          >
            <div
              className={`w-14 h-11 rounded-[var(--radius-10)] flex flex-col items-center justify-center transition-colors duration-[var(--dur-fast)] ${
                isMoreActive
                  ? "bg-[var(--primary-soft)] text-[var(--primary-text)] font-semibold"
                  : "text-[var(--text-2)] hover:text-[var(--text)] font-medium"
              }`}
            >
              <LayoutGrid size={18} strokeWidth={1.5} className="shrink-0" />
              <span className="text-[10.5px] mt-0.5 truncate max-w-[52px] leading-tight">
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
