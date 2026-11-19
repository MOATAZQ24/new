"use client";

import React from "react";
import {
  CreditCard,
  Users,
  Calendar,
  Building2,
  ChevronLeft,
  AlertTriangle,
  Edit2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";

interface MobileSubscriptionCardProps {
  subscription: {
    id: string;
    service_name: string;
    provider?: string;
    account_email?: string;
    subscription_type: string;
    branch_name?: string;
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

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-4 shadow-2xs hover:border-[#187A5A] transition active:scale-[0.99] cursor-pointer space-y-3"
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
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {subscription.service_name}
            </h3>
            <span className="text-[11px] font-semibold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.2 rounded-lg">
              {subscription.subscription_type}
            </span>
          </div>

          {(subscription.provider || subscription.account_email) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {subscription.provider || subscription.account_email}
            </p>
          )}
        </div>

        <StatusBadge status={subscription.status} />
      </div>

      {/* Seat Utilization Bar */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
            <Users size={13} className="text-slate-400" />
            <span>المقاعد والمستخدمون:</span>
          </span>
          <span
            dir="ltr"
            className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs"
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
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <Building2 size={12} className="text-slate-400" />
          <span>{subscription.branch_name || "جميع الفروع"}</span>
        </div>

        {subscription.renewal_date && (
          <div className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300">
            <Calendar size={12} className="text-slate-400" />
            <span dir="ltr">{subscription.renewal_date}</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
          >
            <Edit2 size={12} />
            <span>تعديل</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onClick}
          className="text-xs font-bold text-[#187A5A] dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
        >
          <span>التفاصيل والمستخدمون</span>
          <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  );
}
