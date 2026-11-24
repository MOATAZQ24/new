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

export type AvailabilityStatus = "available" | "busy" | "away" | "offline";

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  availability?: AvailabilityStatus;
  className?: string;
}

const SIZE_MAP = { xs: "h-6 w-6 text-[10px]", sm: "h-7 w-7 text-[11px]", md: "h-8 w-8 text-[12px]", lg: "h-10 w-10 text-[14px]" };
const DOT_COLOR: Record<AvailabilityStatus, string> = {
  available: "bg-[var(--success)]",
  busy: "bg-[var(--danger)]",
  away: "bg-[var(--warning)]",
  offline: "bg-[var(--icon-muted)]",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const isArabic = /[\u0600-\u06FF]/.test(parts[0]);
  if (parts.length === 1) return isArabic ? parts[0][0] : parts[0].slice(0, 2).toUpperCase();
  if (isArabic) return `${parts[0][0]}\u200C${parts[parts.length - 1][0]}`;
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({ name, src, size = "md", availability, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[var(--radius-full)]",
        "bg-[var(--primary-soft)] text-[var(--primary-text)] font-semibold select-none border border-[var(--border)]",
        SIZE_MAP[size],
        className
      )}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full rounded-[var(--radius-full)] object-cover" />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
      {availability && (
        <span
          className={cn("absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)]", DOT_COLOR[availability])}
          title={availability}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export function AvatarStack({ items, max = 3, size = "xs" }: { items: { name: string; src?: string | null }[]; max?: number; size?: AvatarProps["size"] }) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <div className="inline-flex items-center -space-x-2 rtl:space-x-reverse">
      {visible.map((item, idx) => (
        <Avatar key={`${item.name}-${idx}`} name={item.name} src={item.src} size={size} className="ring-2 ring-[var(--surface)]" />
      ))}
      {overflow > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)] font-medium tabular-nums ring-2 ring-[var(--surface)] border border-[var(--border)]", SIZE_MAP[size])}>
          +{overflow}
        </span>
      )}
    </div>
  );
}
