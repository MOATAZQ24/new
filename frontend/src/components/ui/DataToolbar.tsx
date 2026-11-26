"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import { Icons } from "@/components/ui/Icons";

interface DataToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  onSearchSubmit?: () => void;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  activeFilterCount?: number;
  onResetFilters?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
  className?: string;
}

export function DataToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "بحث...",
  searchLabel = "بحث",
  onSearchSubmit,
  filters,
  actions,
  activeFilterCount = 0,
  onResetFilters,
  onRefresh,
  refreshing = false,
  topSlot,
  bottomSlot,
  className = "",
}: DataToolbarProps) {
  return (
    <div
      className={`bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 shadow-xs space-y-3 ${className}`}
    >
      {topSlot}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Search Field */}
          <div className="relative flex-1 min-w-[220px] sm:max-w-xs">
            <Icons.Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none"
            />
            <input
              type="text"
              value={searchValue}
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && onSearchSubmit) {
                  e.preventDefault();
                  onSearchSubmit();
                }
              }}
              className="w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] focus:border-[#2563EB] focus:bg-[var(--surface)] text-xs sm:text-sm pr-9 pl-8 rounded-xl outline-none text-[var(--text)] placeholder:text-slate-500 transition-colors"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="مسح البحث"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-[var(--text-3)] hover:text-slate-800 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <Icons.X size={14} />
              </button>
            )}
          </div>

          {/* Custom Filter Dropdowns / Pills */}
          {filters}

          {/* Reset Filters */}
          {activeFilterCount > 0 && onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="motion-control inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-colors cursor-pointer"
            >
              <Icons.X size={13} />
              <span>مسح الفلاتر ({activeFilterCount})</span>
            </button>
          )}
        </div>

        {/* Right/End Toolbar Actions */}
        {(actions || onRefresh) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="تحديث البيانات"
                title="تحديث البيانات"
                className="motion-control p-2 border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-[var(--text-2)] rounded-xl transition-colors cursor-pointer"
              >
                <Icons.Refresh size={16} className={refreshing ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        )}
      </div>

      {bottomSlot}
    </div>
  );
}

export default DataToolbar;
