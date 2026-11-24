"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import { Search, SlidersHorizontal, RotateCcw, X } from "lucide-react";

export interface QuickChip {
  id: string;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}

interface MobileToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  onResetFilters?: () => void;
  quickChips?: QuickChip[];
  actionButton?: React.ReactNode;
}

export function MobileToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "بحث...",
  activeFilterCount = 0,
  onOpenFilters,
  onResetFilters,
  quickChips,
  actionButton,
}: MobileToolbarProps) {
  return (
    <div className="space-y-2.5 lg:hidden">
      {/* Search Input Row + Filter Sheet Button + Optional Action */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-2xl pr-9 pl-8 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#2563EB] dark:focus:border-emerald-500 shadow-2xs transition"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[11px] cursor-pointer"
              aria-label="مسح نص البحث"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Sheet Trigger */}
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className={`relative flex items-center justify-center w-10 h-10 rounded-2xl border transition cursor-pointer shrink-0 ${
              activeFilterCount > 0
                ? "bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            }`}
            aria-label={`تصفية النتائج (${activeFilterCount} نشط)`}
          >
            <SlidersHorizontal size={17} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--accent)] text-slate-950 font-black text-[10px] rounded-full flex items-center justify-center shadow-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* Optional Action Button (e.g. + New) */}
        {actionButton && <div className="shrink-0">{actionButton}</div>}
      </div>

      {/* Quick Filter Horizontal Scroll Chips */}
      {quickChips && quickChips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
          {quickChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onClick}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer ${
                chip.active
                  ? "bg-[#1D4ED8] text-white shadow-2xs dark:bg-emerald-600"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <span>{chip.label}</span>
              {typeof chip.count === "number" && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    chip.active
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {chip.count}
                </span>
              )}
            </button>
          ))}

          {/* Quick Reset if filters are active */}
          {activeFilterCount > 0 && onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
