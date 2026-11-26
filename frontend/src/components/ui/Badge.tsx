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
import { AlertCircle, AlertTriangle, CheckCircle2, Circle, Clock, Info, PauseCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-full)] border px-2.5 py-0.5 text-[12px] font-medium leading-[1.35] select-none",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)]",
        primary: "bg-[var(--primary-soft)] text-[var(--primary-text)] border-transparent",
        success: "bg-[var(--success-soft)] text-[var(--success-text)] border-[var(--success-border)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning-text)] border-[var(--warning-border)]",
        danger: "bg-[var(--danger-soft)] text-[var(--danger-text)] border-[var(--danger-border)]",
        info: "bg-[var(--info-soft)] text-[var(--info-text)] border-[var(--info-border)]",
        internal: "bg-[var(--internal-bg)] text-[var(--internal-text)] border-[var(--internal-border)]",
      },
      size: { sm: "px-2 py-0.5 text-[12px]", md: "px-2.5 py-1 text-[12px]" },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

export function Badge({ className, tone, size, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {icon && <span className="shrink-0 flex items-center" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export interface ChipProps extends BadgeProps {
  onRemove?: () => void;
  removeLabel?: string;
}

export function Chip({ onRemove, removeLabel = "إزالة", children, className, ...props }: ChipProps) {
  return (
    <Badge className={cn("pe-1.5", !onRemove && "pe-2.5", className)} {...props}>
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="ms-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-[var(--surface)]/10 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer"
        >
          <X className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </Badge>
  );
}

const STATUS_META: Record<string, { tone: NonNullable<BadgeProps["tone"]>; labelAr: string; icon: React.ReactNode }> = {
  Available: { tone: "success", labelAr: "متاح", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Active: { tone: "success", labelAr: "نشط", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Completed: { tone: "success", labelAr: "مكتملة", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Done: { tone: "success", labelAr: "مكتملة", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Approved / Completed": { tone: "success", labelAr: "معتمدة ومكتملة", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Resolved: { tone: "success", labelAr: "تم الحل", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Approved: { tone: "success", labelAr: "معتمد", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "In Progress": { tone: "info", labelAr: "قيد التنفيذ", icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Assigned: { tone: "info", labelAr: "معيّنة", icon: <Info className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "To Do": { tone: "info", labelAr: "للتنفيذ", icon: <Circle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Pending Acceptance": { tone: "info", labelAr: "بانتظار القبول", icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Accepted: { tone: "primary", labelAr: "مقبولة", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Submitted for Review": { tone: "primary", labelAr: "قيد المراجعة", icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Open: { tone: "warning", labelAr: "مفتوحة", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Pending: { tone: "warning", labelAr: "معلّق", icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Under Maintenance": { tone: "warning", labelAr: "تحت الصيانة", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Maintenance: { tone: "warning", labelAr: "صيانة", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Waiting for Response": { tone: "warning", labelAr: "بانتظار الرد", icon: <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Waiting for Clarification": { tone: "warning", labelAr: "بانتظار التوضيح", icon: <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Waiting for User": { tone: "warning", labelAr: "بانتظار المستفيد", icon: <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Rework Required": { tone: "warning", labelAr: "يتطلب تعديل", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Expiring Soon": { tone: "warning", labelAr: "ينتهي قريباً", icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Blocked: { tone: "danger", labelAr: "متوقفة", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "On Hold": { tone: "warning", labelAr: "مؤجّلة", icon: <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Damaged: { tone: "danger", labelAr: "تالف", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Lost: { tone: "danger", labelAr: "مفقود", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Expired: { tone: "danger", labelAr: "منتهي", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Rejected: { tone: "danger", labelAr: "مرفوض", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Draft: { tone: "neutral", labelAr: "مسودة", icon: <Circle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Closed: { tone: "neutral", labelAr: "مغلقة", icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Retired: { tone: "neutral", labelAr: "متقاعد", icon: <Circle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Cancelled: { tone: "neutral", labelAr: "ملغاة", icon: <Circle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
};

export function StatusBadge({ status, lang = "ar" }: { status: string; lang?: "ar" | "en" }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta?.tone || "neutral"} icon={meta?.icon || <Circle className="h-3 w-3" strokeWidth={1.5} />}>
      {lang === "ar" && meta ? meta.labelAr : status}
    </Badge>
  );
}

const PRIORITY_META: Record<string, { tone: NonNullable<BadgeProps["tone"]>; labelAr: string; icon: React.ReactNode }> = {
  Low: { tone: "neutral", labelAr: "منخفضة", icon: <Circle className="h-3 w-3" strokeWidth={1.5} /> },
  Medium: { tone: "info", labelAr: "متوسطة", icon: <Info className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  High: { tone: "warning", labelAr: "مرتفعة", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Urgent: { tone: "danger", labelAr: "عاجلة", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  Critical: { tone: "danger", labelAr: "حرجة", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  "Urgent / Critical": { tone: "danger", labelAr: "عاجلة / حرجة", icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
};

export function PriorityBadge({ priority, lang = "ar" }: { priority: string; lang?: "ar" | "en" }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge tone={meta?.tone || "neutral"} icon={meta?.icon || <Circle className="h-3 w-3" strokeWidth={1.5} />}>
      {lang === "ar" && meta ? meta.labelAr : priority}
    </Badge>
  );
}
