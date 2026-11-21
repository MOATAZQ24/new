/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useEffect, useRef } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

interface MasterDetailLayoutProps {
  masterContent: React.ReactNode;
  detailContent: React.ReactNode | null;
  hasSelection: boolean;
  onCloseDetail: () => void;
  masterWidthPercentage?: number; // e.g. 55% or 60%
  headerControls?: React.ReactNode;
  emptyDetailPlaceholder?: React.ReactNode;
  className?: string;
}

export function MasterDetailLayout({
  masterContent,
  detailContent,
  hasSelection,
  onCloseDetail,
  masterWidthPercentage = 58,
  headerControls,
  emptyDetailPlaceholder,
  className = "",
}: MasterDetailLayoutProps) {
  const masterContainerRef = useRef<HTMLDivElement>(null);
  const detailContainerRef = useRef<HTMLDivElement>(null);

  // Close detail on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasSelection) {
        onCloseDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasSelection, onCloseDetail]);

  return (
    <div className={`w-full flex flex-col space-y-3 ${className}`}>
      {/* Optional Top Context Controls / Filter Ribbon */}
      {headerControls && <div>{headerControls}</div>}

      {/* Main Split Architecture Container */}
      <div className="relative w-full flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)] min-h-[580px] overflow-hidden">
        {/* 1. MASTER LIST CONTAINER (Independent Scrollable) */}
        <div
          ref={masterContainerRef}
          className={`h-full overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-card shadow-xs transition-all duration-200 ${
            hasSelection
              ? `w-full lg:w-[${masterWidthPercentage}%]`
              : "w-full"
          }`}
          style={{
            width: hasSelection && typeof window !== "undefined" && window.innerWidth >= 1024
              ? `${masterWidthPercentage}%`
              : "100%",
          }}
        >
          {masterContent}
        </div>

        {/* 2. DETAIL PANEL CONTAINER (Independent Scrollable) - DESKTOP */}
        <div
          className={`hidden lg:flex flex-col h-full overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs transition-all duration-200 ${
            hasSelection
              ? "flex-1 opacity-100"
              : "hidden opacity-0"
          }`}
        >
          {hasSelection && detailContent ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Detail Header Toolbar */}
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={onCloseDetail}
                  title="إغلاق لوحة التفاصيل (Esc)"
                  className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-muted-foreground">تفاصيل العنصر المحدد</span>
              </div>

              {/* Independent Scroll Container for Detail Content */}
              <div
                ref={detailContainerRef}
                className="flex-1 overflow-y-auto overscroll-contain p-4 text-right"
              >
                {detailContent}
              </div>
            </div>
          ) : (
            emptyDetailPlaceholder || null
          )}
        </div>

        {/* 3. DETAIL PANEL CONTAINER - MOBILE OVERLAY / SLIDE-OVER (< lg) */}
        {hasSelection && detailContent && (
          <div className="block lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200">
            <div className="bg-card w-full max-h-[88vh] rounded-t-3xl border-t border-border flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-250">
              {/* Mobile Drawer Grabber & Header */}
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={onCloseDetail}
                  className="p-1.5 rounded-xl border border-border text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto" />
                <span className="text-xs font-bold text-foreground">التفاصيل الكاملة</span>
              </div>

              {/* Mobile Scrollable Detail Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 text-right">
                {detailContent}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MasterDetailLayout;
