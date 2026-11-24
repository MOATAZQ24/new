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

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex items-center rounded-[var(--radius-6)] bg-[var(--surface-2)] p-0.5 border border-[var(--border)]", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap cursor-pointer",
              "transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
              active ? "bg-[var(--surface)] text-[var(--primary-text)] shadow-[var(--shadow-e1)]" : "text-[var(--text-2)] hover:text-[var(--text)]"
            )}
          >
            {opt.icon && <span className="shrink-0 flex items-center" aria-hidden="true">{opt.icon}</span>}
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span className={cn("rounded-full px-1.5 py-0.25 text-[11px] tabular-nums", active ? "bg-[var(--primary-soft)] text-[var(--primary-text)]" : "bg-[var(--surface-3)] text-[var(--text-2)]")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
