/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  variant?: "table" | "cards" | "list";
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
  variant = "table",
}: TableSkeletonProps) {
  if (variant === "cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" aria-busy="true" aria-label="جاري التحميل">
        {Array.from({ length: Math.min(rows, 6) }).map((_, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-xl bg-slate-200" />
              <div className="w-16 h-5 rounded-full bg-slate-200" />
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="h-3 bg-slate-100 rounded w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="divide-y divide-slate-100" aria-busy="true" aria-label="جاري التحميل">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="p-4 sm:p-5 flex items-center justify-between gap-4 animate-pulse">
            <div className="space-y-2 flex-1">
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-slate-200" />
                <div className="h-5 w-24 rounded-full bg-slate-100" />
              </div>
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
            <div className="h-8 w-28 rounded-lg bg-slate-200 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 animate-pulse" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-3 py-2 border-b border-slate-100 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((__, colIdx) => (
            <div
              key={colIdx}
              className={`h-4 rounded bg-slate-200/80 ${
                colIdx === 0 ? "w-3/4" : colIdx === cols - 1 ? "w-1/2 ms-auto" : "w-5/6"
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default TableSkeleton;
