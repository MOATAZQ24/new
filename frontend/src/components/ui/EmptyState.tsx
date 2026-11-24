"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8 px-4" : "py-14 px-6", className)}>
      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--icon-muted)]" aria-hidden="true">
        {icon || <Inbox className="h-5 w-5" strokeWidth={1.5} />}
      </div>
      <h3 className="text-[15px] font-semibold leading-[1.4] text-[var(--text)]">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[13px] leading-[1.6] text-[var(--text-2)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export default EmptyState;
