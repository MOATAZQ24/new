"use client";

import React from "react";
import { MessageSquare, User, Wrench, Calendar, ChevronLeft } from "lucide-react";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";

interface MobileTicketCardProps {
  ticket: {
    id: string;
    ticket_number: string;
    issue_title: string;
    issue_description: string;
    priority: string;
    status: string;
    category: string;
    requester_name?: string;
    assigned_technician_name?: string;
    comments_count: number;
    created_at: string;
  };
  onClick: () => void;
}

export function MobileTicketCard({ ticket, onClick }: MobileTicketCardProps) {
  const categoryLabels: Record<string, string> = {
    Hardware: "أجهزة وعتاد",
    Software: "برمجيات وأنظمة",
    Network: "شبكات واتصالات",
    Access: "صلاحيات ووصول",
    Email: "بريد إلكتروني",
    Other: "أخرى",
  };

  const formattedDate = ticket.created_at
    ? new Date(ticket.created_at).toLocaleDateString("ar-SA", {
        month: "short",
        day: "numeric",
      })
    : "";

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
      {/* Header: Ticket # + Category + Badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            dir="ltr"
            className="font-mono font-bold text-xs text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800 px-2 py-0.5 rounded-lg"
          >
            #{ticket.ticket_number}
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg">
            {categoryLabels[ticket.category] || ticket.category}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {/* Title & Description preview */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
          {ticket.issue_title}
        </h3>
        {ticket.issue_description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {ticket.issue_description}
          </p>
        )}
      </div>

      {/* Requester & Technician metadata */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
        {/* Requester */}
        <div className="flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-300">
          <User size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">
            {ticket.requester_name || "مستخدم غير محدد"}
          </span>
        </div>

        {/* Assigned Technician */}
        <div className="flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-300">
          <Wrench size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">
            {ticket.assigned_technician_name || "غير مسند بعد"}
          </span>
        </div>
      </div>

      {/* Footer: Date & Comments & Action Arrow */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          {formattedDate && (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{formattedDate}</span>
            </span>
          )}
          {ticket.comments_count > 0 && (
            <span className="flex items-center gap-1 text-[#187A5A] dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
              <MessageSquare size={11} />
              <span>{ticket.comments_count}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[#187A5A] dark:text-emerald-400 font-bold">
          <span>التفاصيل ومتابعة الطلب</span>
          <ChevronLeft size={14} />
        </div>
      </div>
    </div>
  );
}
