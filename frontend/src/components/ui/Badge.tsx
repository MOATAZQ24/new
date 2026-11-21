/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Under Maintenance": "bg-amber-50 text-amber-700 border-amber-200",
    Maintenance: "bg-amber-50 text-amber-700 border-amber-200",
    Damaged: "bg-rose-50 text-rose-700 border-rose-200",
    Retired: "bg-slate-100 text-slate-700 border-slate-300",
    Lost: "bg-purple-50 text-purple-700 border-purple-200",
    // Task 9-state & legacy collaboration badges
    Draft: "bg-slate-100 text-slate-700 border-slate-300",
    Assigned: "bg-blue-50 text-blue-700 border-blue-200",
    "To Do": "bg-blue-50 text-blue-700 border-blue-200",
    "Pending Acceptance": "bg-blue-50 text-blue-700 border-blue-200",
    Accepted: "bg-cyan-50 text-cyan-700 border-cyan-200",
    "In Progress": "bg-emerald-50 text-emerald-700 border-emerald-200",
    Blocked: "bg-rose-100 text-rose-800 border-rose-300 font-bold",
    "On Hold": "bg-rose-100 text-rose-800 border-rose-300 font-bold",
    "Waiting for Response": "bg-amber-50 text-amber-800 border-amber-300",
    "Waiting for Clarification": "bg-amber-50 text-amber-800 border-amber-300",
    "Submitted for Review": "bg-purple-50 text-purple-700 border-purple-200 font-semibold",
    "Rework Required": "bg-orange-50 text-orange-800 border-orange-300 font-semibold",
    Completed: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
    Done: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
    "Approved / Completed": "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
    Cancelled: "bg-gray-100 text-gray-500 border-gray-300",
    Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Closed: "bg-slate-100 text-slate-700 border-slate-200",
    Open: "bg-amber-50 text-amber-700 border-amber-200",
    "Expiring Soon": "bg-amber-50 text-amber-700 border-amber-200",
    Expired: "bg-rose-50 text-rose-700 border-rose-200",
    Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };

  const style = map[status] || "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={`motion-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${style}`}
    >
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700 border-slate-200",
    Medium: "bg-blue-50 text-blue-700 border-blue-200",
    High: "bg-amber-50 text-amber-700 border-amber-200",
    Urgent: "bg-rose-50 text-rose-700 border-rose-200",
    "Urgent / Critical": "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  };

  const style = map[priority] || "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={`motion-badge inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${style}`}
    >
      {priority}
    </span>
  );
}
