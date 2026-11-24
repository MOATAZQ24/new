"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, leadingIcon, trailingIcon, dir = "auto", ...props }, ref) => (
    <div className="relative flex items-center w-full">
      {leadingIcon && (
        <span className="pointer-events-none absolute start-3 text-[var(--icon-muted)] flex items-center" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        dir={dir}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full h-9 rounded-[var(--radius-6)] bg-[var(--surface)] text-[14px] text-[var(--text)]",
          "placeholder:text-[var(--text-3)] border transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          invalid
            ? "border-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-soft)]"
            : "border-[var(--border-strong)] hover:border-[var(--icon-muted)] focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:shadow-[var(--focus-ring)]",
          "disabled:bg-[var(--surface-2)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed",
          leadingIcon ? "ps-9" : "ps-3",
          trailingIcon ? "pe-9" : "pe-3",
          className
        )}
        {...props}
      />
      {trailingIcon && (
        <span className="absolute end-2.5 text-[var(--icon-muted)] flex items-center">{trailingIcon}</span>
      )}
    </div>
  )
);
Input.displayName = "Input";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, helperText, error, className, children }: FormFieldProps) {
  const autoId = useId();
  const fieldId = htmlFor || autoId;

  return (
    <div className={cn("flex flex-col gap-1.5 text-start", className)}>
      <label htmlFor={fieldId} className="text-[13px] font-medium text-[var(--text)] leading-[1.4]">
        {label}
        {required && <span className="ms-1 text-[var(--danger-text)]" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="inline-flex items-center gap-1.5 text-[12px] text-[var(--danger-text)] leading-[1.4]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-[12px] text-[var(--text-3)] leading-[1.5]">{helperText}</p>
      ) : null}
    </div>
  );
}
