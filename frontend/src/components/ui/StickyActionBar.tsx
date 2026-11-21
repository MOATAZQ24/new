/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React from "react";
import { Check, X } from "lucide-react";

interface StickyActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onClear: () => void;
  actions: React.ReactNode;
  className?: string;
}

export function StickyActionBar({
  selectedCount,
  totalCount,
  onClear,
  actions,
  className = "",
}: StickyActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#202124] dark:bg-[#1E293B] text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-4 text-xs font-bold animate-in slide-in-from-bottom-4 duration-200 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-white">
          <Check className="w-3 h-3 stroke-[3]" />
        </span>
        <span>
          تم تحديد {selectedCount} {totalCount ? `من أصل ${totalCount}` : "عناصر"}
        </span>
      </div>

      <div className="h-4 w-px bg-white/20 mx-1" />

      {/* Action Buttons */}
      <div className="flex items-center gap-2">{actions}</div>

      <div className="h-4 w-px bg-white/20 mx-1" />

      <button
        type="button"
        onClick={onClear}
        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
        title="إلغاء التحديد"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default StickyActionBar;
