"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { cn } from "@/lib/cn";

export interface ProgressProps {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
  label?: string;
  showValue?: boolean;
  className?: string;
}

const TONE_BG = {
  primary: "bg-[var(--primary)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
  info: "bg-[var(--info)]",
};

export function Progress({ value, max = 100, tone = "primary", label, showValue = false, className }: ProgressProps) {
  const safeMax = max <= 0 ? 100 : max;
  const pct = Math.min(100, Math.max(0, Math.round((value / safeMax) * 100)));
  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 text-[12px]">
          {label && <span className="text-[var(--text-2)]">{label}</span>}
          {showValue && <span className="font-medium tabular-nums text-[var(--text)]" dir="ltr">{pct}%</span>}
        </div>
      )}
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={safeMax} aria-label={label || "Progress"} className="h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-3)]">
        <div className={cn("h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--dur-mid)] ease-[var(--ease-out)]", TONE_BG[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CapacityBar({ current, max, label, compact = false, className }: { current: number; max: number; label?: string; compact?: boolean; className?: string }) {
  const safeMax = Math.max(1, max);
  const ratio = current / safeMax;
  const pct = Math.min(100, Math.round(ratio * 100));
  const barTone = ratio >= 1 ? "bg-[var(--danger)]" : ratio >= 0.8 ? "bg-[var(--warning)]" : "bg-[var(--primary)]";
  const textTone = ratio >= 1 ? "text-[var(--danger-text)]" : ratio >= 0.8 ? "text-[var(--warning-text)]" : "text-[var(--text-2)]";
  return (
    <div className={cn("flex items-center gap-2", compact ? "w-24" : "w-full", className)}>
      <div role="meter" aria-valuenow={current} aria-valuemin={0} aria-valuemax={safeMax} aria-label={label || `${current} of ${safeMax}`} className="h-1 flex-1 overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-3)]">
        <div className={cn("h-full rounded-[var(--radius-full)]", barTone)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[12px] font-medium tabular-nums shrink-0", textTone)} dir="ltr">{current}/{safeMax}</span>
    </div>
  );
}
