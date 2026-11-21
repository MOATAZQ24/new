/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { Icons } from "@/components/ui/Icons";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`text-center flex flex-col items-center justify-center ${
        compact ? "py-8 px-4" : "py-14 px-6"
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3.5 ring-1 ring-slate-200/80">
        {icon || <Icons.Inbox size={26} />}
      </div>
      <h3 className="text-sm sm:text-base font-bold text-slate-800">{title}</h3>
      {description && (
        <p className="text-xs text-slate-600 mt-1.5 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
