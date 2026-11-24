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

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("ig-skeleton rounded-[var(--radius-6)]", className)} {...props} />;
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="جارٍ التحميل" className={cn("rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton key={idx} className={cn("h-3", idx === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
      <span className="sr-only">جارٍ التحميل...</span>
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="جارٍ تحميل البيانات" className="divide-y divide-[var(--border)]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[110px]", c === columns - 1 && "max-w-[72px]")} />
          ))}
        </div>
      ))}
      <span className="sr-only">جارٍ تحميل البيانات...</span>
    </div>
  );
}
