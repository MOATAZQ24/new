"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from "lucide-react";
import type { SlaState } from "@/lib/workApi";

interface SlaBadgeProps {
  state?: SlaState | string | null;
  dueAt?: string | null;
  compact?: boolean;
}

function formatRelativeDue(dueAt?: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt.endsWith("Z") ? dueAt : `${dueAt}Z`);
  if (Number.isNaN(due.getTime())) return null;
  const diffMin = Math.round((due.getTime() - Date.now()) / 60000);
  if (diffMin < 0) {
    const abs = Math.abs(diffMin);
    if (abs >= 1440) return `متأخر ${Math.floor(abs / 1440)}ي`;
    if (abs >= 60) return `متأخر ${Math.floor(abs / 60)}س`;
    return `متأخر ${abs}د`;
  }
  if (diffMin >= 1440) return `متبقي ${Math.floor(diffMin / 1440)}ي`;
  if (diffMin >= 60) return `متبقي ${Math.floor(diffMin / 60)}س`;
  return `متبقي ${diffMin}د`;
}

export function SlaBadge({ state, dueAt, compact = false }: SlaBadgeProps) {
  const norm = (state || "ok") as SlaState;
  const rel = formatRelativeDue(dueAt);

  if (norm === "breached") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/12 text-red-700 dark:text-red-300 border border-red-500/25 whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>متجاوز SLA</span>
        {!compact && rel && <span className="opacity-80">({rel})</span>}
      </span>
    );
  }
  if (norm === "at_risk") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap">
        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>قريب الانتهاء</span>
        {!compact && rel && <span className="opacity-80">({rel})</span>}
      </span>
    );
  }
  if (norm === "paused") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/25 whitespace-nowrap">
        <PauseCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>متوقف مؤقتاً</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>ضمن SLA</span>
      {!compact && rel && <span className="opacity-80">({rel})</span>}
    </span>
  );
}
