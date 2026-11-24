"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Users,
  CreditCard,
  ShieldCheck,
  KeyRound,
  PackageCheck,
  Server,
  Wrench,
  FileBarChart2,
  ClipboardList,
  Search,
  Settings,
  Palette,
} from "lucide-react";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";

interface MobileMoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMoreMenuSheet({
  isOpen,
  onClose,
}: MobileMoreMenuSheetProps) {
  const pathname = usePathname();

  const sections = [
    {
      title: "العمليات والموارد",
      items: [
        {
          name: "الشركات والفروع",
          sub: "Companies & Branches",
          href: "/companies",
          icon: Building2,
          color: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
        },
        {
          name: "الموظفون و360°",
          sub: "Employees & Staff",
          href: "/employees",
          icon: Users,
          color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
        },
        {
          name: "الاشتراكات والتراخيص",
          sub: "Subscriptions & SaaS",
          href: "/subscriptions",
          icon: CreditCard,
          color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        },
        {
          name: "مركز الاعتمادات",
          sub: "Approvals & Workflow",
          href: "/approvals",
          icon: ShieldCheck,
          color: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        },
      ],
    },
    {
      title: "التقنية والأمان",
      items: [
        {
          name: "خزنة الأصول الرقمية",
          sub: "Digital Vault & Secrets",
          href: "/digital-assets",
          icon: KeyRound,
          color: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
        },
        {
          name: "عهدة الأصول التقنية",
          sub: "Asset Custody",
          href: "/custody",
          icon: PackageCheck,
          color: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
        },
        {
          name: "البنية التحتية والشبكات",
          sub: "IT Infrastructure",
          href: "/infrastructure",
          icon: Server,
          color: "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
        },
        {
          name: "الصيانة والتغييرات",
          sub: "Maintenance & Changes",
          href: "/maintenance",
          icon: Wrench,
          color: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        },
      ],
    },
    {
      title: "التقارير والأوامر",
      items: [
        {
          name: "البحث السريع والأوامر",
          sub: "Quick Search & Commands",
          href: "/#quick-search",
          icon: Search,
          color: "bg-[var(--primary-soft)] text-[var(--primary-text)]",
          onClick: () => {
            onClose();
            // Trigger Command bar
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true })
            );
          },
        },
        {
          name: "التقارير والتصدير",
          sub: "Reports & CSV Export",
          href: "/reports",
          icon: FileBarChart2,
          color: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
        },
        {
          name: "سجل التدقيق والمراجعة",
          sub: "Security Audit Log",
          href: "/audit",
          icon: ClipboardList,
          color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        },
      ],
    },
    {
      title: "الإعدادات والتخصيص",
      items: [
        {
          name: "تكاملات Telegram والأنظمة",
          sub: "Integrations & Bot",
          href: "/settings/integrations",
          icon: Settings,
          color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        },
        {
          name: "المظهر والسمات",
          sub: "Themes & Appearance",
          href: "/settings/appearance",
          icon: Palette,
          color: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
        },
      ],
    },
  ];

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="كافة وحدات النظام"
      description="الوصول السريع إلى جميع أقسام ووحدات المنظومة"
      maxHeight="max-h-[88vh]"
    >
      <div className="space-y-5 pb-6">
        {sections.map((sec, idx) => (
          <div key={idx} className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
              {sec.title}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick();
                      } else {
                        onClose();
                      }
                    }}
                    className={`p-3 rounded-2xl flex items-center gap-3 transition-colors active:scale-98 border ${
                      isActive
                        ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-[#123D32] dark:text-emerald-300 font-bold"
                        : "bg-slate-50/60 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {item.sub}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </MobileBottomSheet>
  );
}
