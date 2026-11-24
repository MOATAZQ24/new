"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
export { ToastProvider, useToast, type ToastVariant } from "@/context/ToastContext";

export interface ToastBannerProps {
  variant?: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const BANNER_TONES = {
  success: { iconWrap: "bg-[var(--success-soft)] text-[var(--success-text)]", border: "border-[var(--success-border)]", icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> },
  error: { iconWrap: "bg-[var(--danger-soft)] text-[var(--danger-text)]", border: "border-[var(--danger-border)]", icon: <AlertCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> },
  warning: { iconWrap: "bg-[var(--warning-soft)] text-[var(--warning-text)]", border: "border-[var(--warning-border)]", icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> },
  info: { iconWrap: "bg-[var(--info-soft)] text-[var(--info-text)]", border: "border-[var(--info-border)]", icon: <Info className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> },
};

export function ToastBanner({ variant = "info", title, message, actionLabel, onAction, onDismiss, className }: ToastBannerProps) {
  const tone = BANNER_TONES[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-[var(--radius-10)] border bg-[var(--surface)] p-3.5 text-start shadow-[var(--shadow-e2)]", tone.border, className)}>
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-6)]", tone.iconWrap)}>{tone.icon}</div>
      <div className="min-w-0 flex-1 pt-0.5">
        {title && <div className="text-[13px] font-semibold text-[var(--text)]">{title}</div>}
        <p className="text-[13px] leading-[1.5] text-[var(--text-2)] break-words">{message}</p>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className="mt-1.5 text-[12px] font-semibold text-[var(--primary-text)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] rounded cursor-pointer">
            {actionLabel}
          </button>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="إغلاق التنبيه" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] cursor-pointer">
          <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
