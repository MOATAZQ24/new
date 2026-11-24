"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Columns3, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { EmptyState } from "./EmptyState";
import { TableRowsSkeleton } from "./skeleton";
import { PopoverRoot, PopoverTrigger, PopoverContent } from "./Popover";
import { SegmentedControl } from "./segmented-control";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: "start" | "center" | "end";
  defaultHidden?: boolean;
  numeric?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  defaultDensity?: "comfortable" | "compact";
  enableColumnChooser?: boolean;
  enableDensityToggle?: boolean;
  onRowClick?: (row: T) => void;
  renderRowActions?: (row: T) => React.ReactNode;
  virtualizeThreshold?: number;
  maxHeightPx?: number;
  caption?: string;
  className?: string;
}

export function DataTable<T>({
  data, columns, rowKey, loading = false, error = null, onRetry,
  emptyTitle = "لا توجد سجلات", emptyDescription = "جرّب تعديل عوامل التصفية أو إنشاء سجل جديد.",
  emptyAction, defaultDensity = "comfortable", enableColumnChooser = true, enableDensityToggle = true,
  onRowClick, renderRowActions, virtualizeThreshold = 200, maxHeightPx = 520, caption, className,
}: DataTableProps<T>) {
  const [density, setDensity] = useState<"comfortable" | "compact">(defaultDensity);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)));
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenCols.has(c.id)), [columns, hiddenCols]);
  const sortedData = useMemo(() => {
    if (!sortCol) return data;
    const col = columns.find((c) => c.id === sortCol);
    if (!col?.sortValue) return data;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
  }, [data, columns, sortCol, sortDir]);

  const toggleSort = (colId: string) => {
    if (sortCol === colId) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortCol(colId); setSortDir("asc"); }
  };

  const toggleCol = (colId: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else if (visibleColumns.length > 1) next.add(colId);
      return next;
    });
  };

  const rowHeight = density === "compact" ? 36 : 44;
  const shouldVirtualize = sortedData.length > virtualizeThreshold;
  const { startIdx, endIdx, padTop, padBottom } = useMemo(() => {
    if (!shouldVirtualize) return { startIdx: 0, endIdx: sortedData.length, padTop: 0, padBottom: 0 };
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 8);
    const end = Math.min(sortedData.length, start + Math.ceil(maxHeightPx / rowHeight) + 16);
    return { startIdx: start, endIdx: end, padTop: start * rowHeight, padBottom: Math.max(0, (sortedData.length - end) * rowHeight) };
  }, [shouldVirtualize, scrollTop, rowHeight, maxHeightPx, sortedData.length]);

  const renderRows = sortedData.slice(startIdx, endIdx);

  return (
    <div className={cn("rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden", className)}>
      {(enableDensityToggle || enableColumnChooser) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 bg-[var(--surface)]">
          <div className="text-[12px] text-[var(--text-3)] tabular-nums">
            {sortedData.length} عنصر{shouldVirtualize ? " · عرض افتراضي نشط" : ""}
          </div>
          <div className="flex items-center gap-2">
            {enableDensityToggle && (
              <SegmentedControl size="sm" ariaLabel="كثافة صفوف الجدول" value={density} onChange={setDensity} options={[{ value: "comfortable", label: "مريح" }, { value: "compact", label: "مكثف" }]} />
            )}
            {enableColumnChooser && (
              <PopoverRoot>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" leadingIcon={<Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />}>الأعمدة</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-3)]">إظهار وإخفاء الأعمدة</div>
                  {columns.map((col) => (
                    <label key={col.id} className="flex items-center gap-2 rounded-[var(--radius-6)] px-2 py-1.5 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] cursor-pointer">
                      <input type="checkbox" checked={!hiddenCols.has(col.id)} onChange={() => toggleCol(col.id)} className="accent-[var(--primary)] h-3.5 w-3.5 rounded" />
                      <span className="truncate">{col.header}</span>
                    </label>
                  ))}
                </PopoverContent>
              </PopoverRoot>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <TableRowsSkeleton rows={5} columns={Math.min(5, visibleColumns.length)} />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-10)] bg-[var(--danger-soft)] text-[var(--danger-text)]">
            <AlertCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--text)]">تعذّر تحميل البيانات</p>
          <p className="mt-1 max-w-md text-[13px] text-[var(--text-2)]">{error}</p>
          {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} leadingIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}>إعادة المحاولة</Button>}
        </div>
      ) : sortedData.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} compact />
      ) : (
        <div ref={scrollContainerRef} onScroll={shouldVirtualize ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined} style={shouldVirtualize ? { maxHeight: `${maxHeightPx}px` } : undefined} className="w-full overflow-auto">
          <table className="w-full border-collapse text-start">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="sticky top-0 z-10 bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.id} scope="col" style={col.width ? { width: col.width } : undefined} className={cn("px-3 text-[12px] font-semibold text-[var(--text-2)] whitespace-nowrap", density === "compact" ? "h-9" : "h-10", col.align === "center" && "text-center", col.align === "end" && "text-end")}>
                    {col.sortValue ? (
                      <button type="button" onClick={() => toggleSort(col.id)} className="inline-flex items-center gap-1 hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] rounded cursor-pointer">
                        <span>{col.header}</span>
                        {sortCol === col.id && (sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-[var(--primary-text)]" strokeWidth={1.5} /> : <ArrowDown className="h-3.5 w-3.5 text-[var(--primary-text)]" strokeWidth={1.5} />)}
                      </button>
                    ) : col.header}
                  </th>
                ))}
                {renderRowActions && <th scope="col" className="w-20 px-3 text-end text-[12px] font-semibold text-[var(--text-2)]"><span className="sr-only">إجراءات</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {padTop > 0 && <tr aria-hidden="true"><td colSpan={visibleColumns.length + (renderRowActions ? 1 : 0)} style={{ height: `${padTop}px`, padding: 0 }} /></tr>}
              {renderRows.map((row) => (
                <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ height: `${rowHeight}px` }} className={cn("group transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-2)]", onRowClick && "cursor-pointer")}>
                  {visibleColumns.map((col) => (
                    <td key={col.id} className={cn("px-3 text-[13px] text-[var(--text)] align-middle", density === "compact" ? "py-1.5" : "py-2.5", col.numeric && "tabular-nums", col.align === "center" && "text-center", col.align === "end" && "text-end")}>
                      {col.accessor(row)}
                    </td>
                  ))}
                  {renderRowActions && <td className="px-3 text-end align-middle" onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center justify-end gap-1">{renderRowActions(row)}</div></td>}
                </tr>
              ))}
              {padBottom > 0 && <tr aria-hidden="true"><td colSpan={visibleColumns.length + (renderRowActions ? 1 : 0)} style={{ height: `${padBottom}px`, padding: 0 }} /></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
