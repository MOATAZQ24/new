"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import {
  Printer,
  Laptop,
  Monitor,
  Wrench,
  HelpCircle,
  Calendar,
  User,
  ChevronLeft,
  Check,
} from "lucide-react";

interface MobileTicketCardProps {
  ticket: {
    id: string;
    ticket_number: string;
    issue_title: string;
    issue_description?: string;
    priority: string;
    status: string;
    category: string;
    related_asset_name?: string;
    requester_name?: string;
    assigned_technician_name?: string;
    comments_count?: number;
    created_at?: string;
  };
  onClick: () => void;
}

function getCategoryIcon(ticket: { issue_title: string; category?: string }) {
  const text = (ticket.issue_title + " " + (ticket.category || "")).toLowerCase();
  if (text.includes("طابع") || text.includes("print")) return Printer;
  if (text.includes("برنامج") || text.includes("شاش") || text.includes("monitor") || text.includes("محاسب"))
    return Monitor;
  if (text.includes("جهاز") || text.includes("حاسب") || text.includes("لابتوب") || text.includes("laptop"))
    return Laptop;
  if (text.includes("صيان") || text.includes("maint")) return Wrench;
  return HelpCircle;
}

export function MobileTicketCard({ ticket, onClick }: MobileTicketCardProps) {
  // Status pill matching Reference Image 6 (قيد المعالجة, مفتوحة, مغلقة)
  const getStatusMeta = () => {
    const s = (ticket.status || "").toLowerCase();
    if (s.includes("clos") || s.includes("مغلق") || s.includes("حل") || s.includes("resolv")) {
      return {
        label: "مغلقة",
        pillClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
        dotClass: "bg-emerald-500",
        isComplete: true,
      };
    }
    if (s.includes("open") || s.includes("مفتوح") || s.includes("جديد") || s.includes("new")) {
      return {
        label: "مفتوحة",
        pillClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
        dotClass: "bg-amber-500",
        isComplete: false,
      };
    }
    return {
      label: "قيد المعالجة",
      pillClass: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
      dotClass: "bg-sky-500",
      isComplete: false,
    };
  };

  const statusMeta = getStatusMeta();

  // Format friendly date (اليوم, أمس, or date)
  const formatFriendlyDate = (dateStr?: string) => {
    if (!dateStr) return "اليوم";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return "اليوم";
    if (diffDays === -1) return "أمس";
    return d.toLocaleDateString("ar-SA", { day: "numeric", month: "long" });
  };

  const friendlyDate = formatFriendlyDate(ticket.created_at);
  const deviceName = ticket.related_asset_name || "ThinkPad P16";

  return (
    <div
      onClick={onClick}
      className="bg-[var(--surface)] dark:bg-slate-900 rounded-2xl border border-[var(--border)] dark:border-slate-800 shadow-2xs p-4 hover:border-primary/40 transition active:scale-[0.99] cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Right side (RTL): Category Icon + Title + Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
            {React.createElement(getCategoryIcon(ticket), { size: 20, strokeWidth: 2.2 })}
          </div>

          <div className="min-w-0 text-right">
            <h3 className="font-bold text-sm text-[var(--text)] dark:text-white truncate">
              {ticket.issue_title}
            </h3>

            {/* Device & Requester Rows */}
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-3)] dark:text-slate-400">
              <span className="flex items-center gap-1 truncate font-medium">
                <Laptop size={12} className="text-[var(--text-3)] shrink-0" />
                <span>{deviceName}</span>
              </span>
            </div>

            {ticket.requester_name && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-[var(--text-3)] dark:text-slate-400 font-medium">
                <User size={12} className="text-[var(--text-3)] shrink-0" />
                <span className="truncate">{ticket.requester_name}</span>
              </div>
            )}

            {/* Ticket Code & Date */}
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--text-3)] dark:text-slate-500 font-medium flex-wrap">
              <span dir="ltr" className="font-mono text-[var(--text-3)] dark:text-slate-400 font-bold shrink-0 whitespace-nowrap">
                #{ticket.ticket_number}
              </span>
              <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Calendar size={12} className="text-[var(--text-3)] shrink-0" />
                <span>{friendlyDate}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Left side (RTL): Status pill with colored dot + Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusMeta.pillClass}`}
          >
            {statusMeta.isComplete ? (
              <Check size={12} strokeWidth={3} className="shrink-0" />
            ) : (
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dotClass}`} />
            )}
            <span>{statusMeta.label}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>
    </div>
  );
}
