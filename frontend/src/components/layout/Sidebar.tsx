"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/ui/Icons";
import { useWorkspace, mediaUrl } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string;
  icon: keyof typeof Icons;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: "لوحة التحكم", href: "/", icon: "Dashboard" },
  { name: "الشركات والفروع", href: "/companies", icon: "Companies" },
  { name: "الموظفون", href: "/employees", icon: "Users" },
  { name: "المستخدمون والوصول", href: "/users", icon: "User" },
  { name: "الأصول التقنية", href: "/assets", icon: "Assets" },
  { name: "الأصول الرقمية والخزنة", href: "/digital-assets", icon: "Lock" },
  { name: "عهدة الأصول", href: "/custody", icon: "Custody" },
  { name: "البنية التحتية", href: "/infrastructure", icon: "Infrastructure" },
  { name: "الاشتراكات الخارجية", href: "/subscriptions", icon: "Subscriptions" },
  { name: "الصيانة والتغييرات", href: "/maintenance", icon: "Maintenance" },
  { name: "إدارة المهام", href: "/tasks", icon: "Tasks" },
  { name: "مكتب المساعدة", href: "/tickets", icon: "HelpDesk" },
  { name: "الإشعارات", href: "/notifications", icon: "Notifications" },
  { name: "التقارير والتصدير", href: "/reports", icon: "Reports" },
  { name: "سجل المراجعة", href: "/audit", icon: "Audit" },
  { name: "الإعدادات", href: "/settings", icon: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeCompany } = useAuth();
  const { draft, setDraft, save } = useWorkspace();
  const configured = draft.navigation.length ? draft.navigation.flatMap(pref => {
    const item = navItems.find(item => item.href === pref.href);
    return item && (!pref.hidden || pref.href === "/settings") ? [{ ...item, icon: pref.icon === "default" ? item.icon : pref.icon, pinned: pref.pinned }] : [];
  }) : navItems.map(item => ({ ...item, pinned: false }));
  const orderedItems = [...configured.filter(i => i.pinned), ...configured.filter(i => !i.pinned)];

  return (
    <aside data-collapsed={draft.collapsed} className="workspace-sidebar w-64 bg-[#123D32] text-white flex flex-col h-screen fixed right-0 top-0 z-40 border-l border-[#187A5A]/30 select-none shadow-xl">
      <button type="button" className="p-2 text-sm" aria-label="طي أو توسيع القائمة / Toggle sidebar" onClick={() => { const next = { ...draft, collapsed: !draft.collapsed }; setDraft(next); void save(next).catch(() => setDraft(draft)); }}>☰</button>
      {/* Brand & Logo Header */}
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#C5A46D] flex items-center justify-center text-[#123D32] font-black text-xl shadow-md">
            {activeCompany?.company_logo?.startsWith("/workspace/") ? <img src={mediaUrl(activeCompany.company_logo)} alt="" className="w-10 h-10 object-contain" /> : "IG"}
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white leading-tight">
              Investor Gate
            </h1>
            <p className="text-[11px] text-[#C5A46D] font-medium">
              إدارة عمليات تقنية المعلومات
            </p>
          </div>
        </div>
      </div>

      {/* Active Company Badge */}
      <div className="px-4 py-2.5 bg-black/20 mx-3 my-2 rounded-lg border border-white/5 flex items-center justify-between">
        <div className="truncate">
          <div className="text-[10px] text-white/50">الشركة النشطة</div>
          <div className="text-xs font-semibold text-white truncate">
            {activeCompany ? activeCompany.name_ar : "بوابة المستثمر"}
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#187A5A] text-white font-mono">
          {activeCompany?.code || "IGT"}
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {orderedItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const IconComp = Icons[item.icon as keyof typeof Icons];

          return (
            <Link
              key={item.href}
              href={item.href} title={item.name}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[#187A5A] text-white font-bold shadow-sm"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`${
                  isActive ? "text-[#C5A46D]" : "text-white/60"
                }`}
              >
                {IconComp && <IconComp size={18} />}
              </span>
              <span className="workspace-nav-label flex-1">{item.pinned ? "★ " : ""}{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* System Footer info */}
      <div className="p-3 border-t border-white/10 text-[10px] text-white/40 text-center">
        الإصدار 1.0.0 Enterprise • نظام ذاتي الاستضافة
      </div>
    </aside>
  );
}
