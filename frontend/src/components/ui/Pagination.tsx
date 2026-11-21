/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { Icons } from "@/components/ui/Icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  className = "",
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <nav
      aria-label="التنقل بين الصفحات"
      className={`flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-xs ${className}`}
    >
      <div className="text-xs text-slate-600 flex items-center gap-2">
        <span>
          صفحة <strong className="text-slate-900 font-bold"><bdi>{page}</bdi></strong> من{" "}
          <strong className="text-slate-900 font-bold"><bdi>{safeTotalPages}</bdi></strong>
        </span>
        {typeof totalItems === "number" && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
            إجمالي السجلات: <bdi>{totalItems}</bdi>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="motion-control inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-45"
        >
          <Icons.ChevronRight size={14} />
          <span>السابق / Previous</span>
        </button>

        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          className="motion-control inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-45"
        >
          <span>التالي / Next</span>
          <Icons.ChevronLeft size={14} />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
