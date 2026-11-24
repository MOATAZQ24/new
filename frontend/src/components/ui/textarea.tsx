"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  autoGrow?: boolean;
  maxRows?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoGrow = false, maxRows = 8, dir = "auto", onChange, value, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    useEffect(() => {
      if (!autoGrow || !innerRef.current) return;
      const el = innerRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, maxRows * 22 + 16)}px`;
    }, [autoGrow, maxRows, value]);

    return (
      <textarea
        ref={setRefs}
        dir={dir}
        value={value}
        onChange={onChange}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-[var(--radius-6)] bg-[var(--surface)] px-3 py-2 text-[14px] leading-[1.6] text-[var(--text)]",
          "placeholder:text-[var(--text-3)] resize-y border transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          invalid
            ? "border-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-soft)]"
            : "border-[var(--border-strong)] hover:border-[var(--icon-muted)] focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:shadow-[var(--focus-ring)]",
          "disabled:bg-[var(--surface-2)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed",
          autoGrow && "resize-none overflow-y-auto",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
