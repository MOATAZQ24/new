"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import { RotateCcw, Check } from "lucide-react";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  activeCount?: number;
  onReset: () => void;
  onApply?: () => void;
  children: React.ReactNode;
}

export function MobileFilterSheet({
  isOpen,
  onClose,
  title = "تصفية النتائج",
  activeCount = 0,
  onReset,
  onApply,
  children,
}: MobileFilterSheetProps) {
  const handleApply = () => {
    if (onApply) onApply();
    onClose();
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={activeCount > 0 ? `${activeCount} فلتر مفعل حالياً` : "اختر معايير التصفية المطلوبة"}
      maxHeight="max-h-[85vh]"
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Scrollable Filter Form Controls */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        {/* Sticky Bottom Actions */}
        <div className="px-5 py-3 border-t border-[var(--border)] dark:border-slate-800 bg-[var(--surface-2)] dark:bg-slate-900/80 flex items-center gap-2.5">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex-1 py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>إعادة تعيين</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleApply}
            className="flex-2 py-2.5 px-4 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition shadow-xs cursor-pointer"
          >
            <Check size={15} />
            <span>تطبيق الفلاتر</span>
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
