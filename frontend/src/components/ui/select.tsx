"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  invalid?: boolean;
  sizeVariant?: "sm" | "md";
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, children, invalid, sizeVariant = "md", ...props }, ref) => (
    <div className="relative inline-flex items-center w-full">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full appearance-none rounded-[var(--radius-6)] bg-[var(--surface)] text-[var(--text)]",
          "ps-3 pe-8 border cursor-pointer transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          sizeVariant === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]",
          invalid
            ? "border-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-soft)]"
            : "border-[var(--border-strong)] hover:border-[var(--icon-muted)] focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:shadow-[var(--focus-ring)]",
          "disabled:bg-[var(--surface-2)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-[var(--icon-muted)]" strokeWidth={1.5} aria-hidden="true" />
    </div>
  )
);
Select.displayName = "Select";
