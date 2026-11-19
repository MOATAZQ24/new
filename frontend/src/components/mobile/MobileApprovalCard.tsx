"use client";

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
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";

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

  const isPending = item.current_state === "Pending";

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
      {/* Header: Workflow Type + Badges */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 rounded-lg">
          {item.workflow_type}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={item.current_state} />
        </div>
      </div>

      {/* Title & Notes */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
          {item.title}
        </h3>
        {item.decision_notes && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
            ملاحظات: {item.decision_notes}
          </p>
        )}
      </div>

      {/* Amount & Initiator & Date */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {typeof item.amount_sar === "number" && item.amount_sar > 0 ? (
            <div className="flex items-center gap-1 font-mono font-bold text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md text-xs">
              <Coins size={13} />
              <span>{item.amount_sar.toLocaleString()} ر.س</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">بدون مبالغ مالية</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <User size={12} className="text-slate-400" />
            <span>{item.initiator_name || "مقدم الطلب"}</span>
          </span>
          {formattedDate && (
            <span>• {formattedDate}</span>
          )}
        </div>
      </div>

      {/* Direct One-Handed Action Buttons for Pending Approvals */}
      {isPending && canApprove && (onApprove || onReject) ? (
        <div
          className="pt-2 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 gap-2"
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
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition shadow-xs cursor-pointer"
            >
              <Check size={15} />
              <span>اعتماد الطلب ✓</span>
            </button>
          )}
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end text-xs font-bold text-[#187A5A] dark:text-emerald-400">
          <span className="flex items-center gap-1">
            <span>عرض تفاصيل ومسار الاعتماد</span>
            <ChevronLeft size={14} />
          </span>
        </div>
      )}
    </div>
  );
}
