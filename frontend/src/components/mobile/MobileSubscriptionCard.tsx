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
  Layers,
  Users,
  Calendar,
  Building2,
  ChevronLeft,
  Check,
  Edit2,
} from "lucide-react";

interface MobileSubscriptionCardProps {
  subscription: {
    id: string;
    service_name: string;
    provider?: string;
    account_email?: string;
    subscription_type: string;
    branch_name?: string | null;
    allocated_seats?: number;
    seat_limit?: number;
    renewal_date?: string;
    status: string;
  };
  onClick: () => void;
  onEdit?: () => void;
}

export function MobileSubscriptionCard({
  subscription,
  onClick,
  onEdit,
}: MobileSubscriptionCardProps) {
  const allocated = subscription.allocated_seats ?? 0;
  const limit = subscription.seat_limit ?? 1;
  const seatPercentage = Math.min(100, Math.round((allocated / limit) * 100));
  const isActive = (subscription.status || "").toLowerCase() === "active" || subscription.status === "نشط";

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
      {/* Header: Service Name + Provider + Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Layers size={20} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 text-right">
            <h3 className="text-sm font-bold text-[var(--text)] dark:text-white truncate">
              {subscription.service_name}
            </h3>
            <p className="text-xs text-[var(--text-3)] dark:text-slate-500 font-medium truncate mt-0.5">
              {subscription.provider || subscription.account_email || subscription.subscription_type}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isActive
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
            }`}
          >
            {isActive ? (
              <Check size={12} strokeWidth={3} className="shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            )}
            <span>{isActive ? "نشط" : "معلق"}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>

      {/* Seat Utilization Bar */}
      <div className="bg-[var(--surface-2)] dark:bg-slate-800/60 rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[var(--text-3)] dark:text-slate-400 text-[11px] font-medium">
            <Users size={13} className="text-[var(--text-3)]" />
            <span>المقاعد والمستخدمون:</span>
          </span>
          <span
            dir="ltr"
            className="font-mono font-bold text-[var(--text)] dark:text-slate-200 text-xs"
          >
            {allocated} / {limit} ({seatPercentage}%)
          </span>
        </div>

        {/* Mini progress bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              seatPercentage >= 95
                ? "bg-rose-500"
                : seatPercentage >= 80
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${seatPercentage}%` }}
          />
        </div>
      </div>

      {/* Branch & Renewal Date */}
      <div className="pt-2 border-t border-[var(--border)] dark:border-slate-800 flex items-center justify-between text-[11px] text-[var(--text-3)] dark:text-slate-500 font-medium">
        <div className="flex items-center gap-1.5">
          <Building2 size={12} className="text-[var(--text-3)]" />
          <span>{subscription.branch_name || "جميع الفروع"}</span>
        </div>

        {subscription.renewal_date && (
          <div className="flex items-center gap-1 font-mono text-[var(--text-3)] dark:text-slate-400">
            <Calendar size={12} className="text-[var(--text-3)]" />
            <span dir="ltr">{subscription.renewal_date}</span>
          </div>
        )}
      </div>
    </div>
  );
}
