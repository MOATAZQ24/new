"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxHeight?: string;
  showCloseButton?: boolean;
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxHeight = "max-h-[85vh]",
  showCloseButton = true,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "mobile-sheet-title" : undefined}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content */}
      <div
        ref={sheetRef}
        className={`relative z-10 w-full bg-[var(--surface)] dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-[var(--border)] dark:border-slate-800 flex flex-col ${maxHeight} animate-in slide-in-from-bottom duration-250 ease-out pb-[max(env(safe-area-inset-bottom),16px)]`}
      >
        {/* Drag Handle Bar */}
        <div className="pt-3 pb-2 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="px-5 py-2.5 flex items-center justify-between border-b border-[var(--border)] dark:border-slate-800 shrink-0">
            <div className="min-w-0 pr-1">
              {title && (
                <h3
                  id="mobile-sheet-title"
                  className="text-base font-bold text-[var(--text)] dark:text-white truncate"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs text-[var(--text-3)] dark:text-slate-400 mt-0.5 truncate">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-3)] dark:text-slate-400 flex items-center justify-center hover:bg-[var(--surface-2)] dark:hover:bg-slate-700 transition cursor-pointer"
                aria-label="إغلاق النافذة"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="px-5 py-4 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
