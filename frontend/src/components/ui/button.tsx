"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[var(--radius-6)] font-medium",
    "transition-[background-color,border-color,color,transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "active:scale-[0.98] disabled:active:scale-100",
    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
    "disabled:opacity-60 disabled:pointer-events-none select-none cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--on-primary)] border border-transparent hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-disabled)] disabled:opacity-100",
        secondary:
          "bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)]",
        soft:
          "bg-[var(--primary-soft)] text-[var(--primary-text)] border border-transparent hover:opacity-90",
        ghost:
          "bg-transparent text-[var(--text-2)] border border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        danger:
          "bg-[var(--danger-solid)] text-white border border-transparent hover:opacity-90",
        "danger-ghost":
          "bg-transparent text-[var(--danger-text)] border border-transparent hover:bg-[var(--danger-soft)]",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-[14px]",
        lg: "h-11 px-4 text-[14px]",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
        "icon-touch": "h-11 w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, leadingIcon, trailingIcon, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" strokeWidth={1.5} aria-hidden="true" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  )
);
Button.displayName = "Button";
