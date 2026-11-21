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
  ShieldCheck,
  User,
  Calendar,
  Check,
  X,
  ChevronLeft,
  Coins,
} from "lucide-react";

interface MobileApprovalCardProps {
  item: {
    id: string;
    title: string;
    workflow_type: string;
    initiator_name?: string;
    amount_sar?: number | null;
    priority: string;
    current_state: string;
    created_at?: string;
    decision_notes?: string | null;
  };
  canApprove?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onClick: () => void;
}

export function MobileApprovalCard({
  item,
  canApprove,
  onApprove,
  onReject,
  onClick,
}: MobileApprovalCardProps) {
  const formattedDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString("ar-SA", {
        month: "short",
        day: "numeric",
      })
    : "";

  const isPending = item.current_state === "Pending" || item.current_state === "قيد الانتظار";
  const isApproved = item.current_state === "Approved" || item.current_state === "معتمد";

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xs p-4 hover:border-primary/40 transition active:scale-[0.99] cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Header: Icon + Title + Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 text-right">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {item.title}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
              {item.workflow_type}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isApproved
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : isPending
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
            }`}
          >
            {isApproved ? (
              <Check size={12} strokeWidth={3} className="shrink-0" />
            ) : isPending ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            ) : (
              <X size={12} strokeWidth={3} className="shrink-0" />
            )}
            <span>{isApproved ? "معتمد" : isPending ? "بانتظار الاعتماد" : "مرفوض"}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>

      {/* Amount & Initiator */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {typeof item.amount_sar === "number" && item.amount_sar > 0 ? (
            <div className="flex items-center gap-1 font-mono font-bold text-primary bg-primary/[0.08] dark:bg-primary/15 px-2.5 py-0.5 rounded-lg text-xs">
              <Coins size={13} />
              <span>{item.amount_sar.toLocaleString()} ر.س</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">طلب تشغيلي عام</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          <span className="flex items-center gap-1">
            <User size={12} className="text-slate-400" />
            <span>{item.initiator_name || "مقدم الطلب"}</span>
          </span>
          {formattedDate && <span>• {formattedDate}</span>}
        </div>
      </div>

      {/* Direct Action Buttons for Pending Approvals */}
      {isPending && canApprove && (onApprove || onReject) && (
        <div
          className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
            >
              <X size={15} />
              <span>رفض الطلب</span>
            </button>
          )}

          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="py-2.5 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition shadow-xs cursor-pointer"
            >
              <Check size={15} />
              <span>اعتماد الطلب</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
