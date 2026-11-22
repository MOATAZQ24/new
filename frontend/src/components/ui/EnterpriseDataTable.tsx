/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  X,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  AlertCircle,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export interface ColumnDef<T> {
  id: string;
  header: React.ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
}

export interface BatchActionItem<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (selectedItems: T[], selectedIds: (string | number)[]) => void;
  variant?: "primary" | "danger" | "secondary";
}

export interface EnterpriseDataTableProps<T extends { id: string | number }> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  keyExtractor?: (item: T) => string | number;

  // Search & Filter
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filterControls?: React.ReactNode;
  extraHeaderActions?: React.ReactNode;

  // Selection & Batch Actions
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
  batchActions?: BatchActionItem<T>[];

  // Sorting
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  onSortChange?: (sortKey: string, sortDir: "asc" | "desc") => void;

  // Row Interactions
  onRowClick?: (item: T) => void;
  selectedRowId?: string | number;

  // View Mode
  allowViewModeToggle?: boolean;
  defaultViewMode?: "table" | "cards";

  // Card Rendering Fallback for Mobile / Card View
  renderMobileCard?: (item: T, isSelected: boolean, toggleSelect: () => void) => React.ReactNode;

  // Pagination
  pageSize?: number;
  showPagination?: boolean;

  // Empty State
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: React.ReactNode;

  className?: string;
}

export function EnterpriseDataTable<T extends { id: string | number }>({
  data,
  columns,
  loading = false,
  keyExtractor = (item) => item.id,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "بحث...",
  filterControls,
  extraHeaderActions,
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  batchActions = [],
  defaultSortKey,
  defaultSortDir = "asc",
  onSortChange,
  onRowClick,
  selectedRowId,
  allowViewModeToggle = true,
  defaultViewMode = "table",
  renderMobileCard,
  pageSize = 15,
  showPagination = true,
  emptyTitle = "لا توجد سجلات",
  emptyDescription = "لم يتم العثور على أي نتائج تطابق البحث أو الفلاتر المحددة",
  emptyAction,
  emptyIcon,
  className = "",
}: EnterpriseDataTableProps<T>) {
  // Local selection state if uncontrolled
  const [internalSelectedIds, setInternalSelectedIds] = useState<(string | number)[]>([]);
  const isControlledSelection = controlledSelectedIds !== undefined;
  const selectedIds = isControlledSelection ? controlledSelectedIds : internalSelectedIds;

  const updateSelection = (newIds: (string | number)[]) => {
    if (!isControlledSelection) {
      setInternalSelectedIds(newIds);
    }
    onSelectionChange?.(newIds);
  };

  // View mode
  const [viewMode, setViewMode] = useState<"table" | "cards">(defaultViewMode);

  // Sorting state
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Local search if query is internal
  const [internalSearch, setInternalSearch] = useState<string>("");
  const activeSearch = searchQuery !== undefined ? searchQuery : internalSearch;
  const handleSearch = (val: string) => {
    if (searchQuery !== undefined) {
      onSearchChange?.(val);
    } else {
      setInternalSearch(val);
    }
    setCurrentPage(1);
  };

  // Process data (Local sort if external handler not provided)
  const processedData = useMemo(() => {
    let result = [...data];

    // Local filtering if no external search controller
    if (searchQuery === undefined && internalSearch.trim()) {
      const q = internalSearch.trim().toLowerCase();
      result = result.filter((item) => {
        return Object.values(item).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Local sorting
    if (sortKey && !onSortChange) {
      const col = columns.find((c) => c.id === sortKey);
      const accessor = col?.accessorKey;
      if (accessor) {
        result.sort((a, b) => {
          const valA = a[accessor];
          const valB = b[accessor];
          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          const cmp = valA > valB ? 1 : -1;
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, searchQuery, internalSearch, sortKey, sortDir, columns, onSortChange]);

  // Pagination calculation
  const totalItems = processedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedData = useMemo(() => {
    if (!showPagination) return processedData;
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize, showPagination]);

  // Selection handlers
  const allCurrentPageSelected =
    paginatedData.length > 0 &&
    paginatedData.every((item) => selectedIds.includes(keyExtractor(item)));

  const toggleSelectAll = () => {
    if (allCurrentPageSelected) {
      const pageIds = paginatedData.map(keyExtractor);
      updateSelection(selectedIds.filter((id) => !pageIds.includes(id)));
    } else {
      const pageIds = paginatedData.map(keyExtractor);
      const newSelection = Array.from(new Set([...selectedIds, ...pageIds]));
      updateSelection(newSelection);
    }
  };

  const toggleSelectItem = (id: string | number) => {
    if (selectedIds.includes(id)) {
      updateSelection(selectedIds.filter((i) => i !== id));
    } else {
      updateSelection([...selectedIds, id]);
    }
  };

  const handleSort = (colId: string, sortable?: boolean) => {
    if (!sortable) return;
    let nextDir: "asc" | "desc" = "asc";
    if (sortKey === colId) {
      nextDir = sortDir === "asc" ? "desc" : "asc";
    }
    setSortKey(colId);
    setSortDir(nextDir);
    onSortChange?.(colId, nextDir);
  };

  const selectedItems = useMemo(() => {
    return data.filter((item) => selectedIds.includes(keyExtractor(item)));
  }, [data, selectedIds, keyExtractor]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-2.5 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={activeSearch}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full ps-9 pe-8 py-2 text-xs bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#078363]/25 focus:border-[#078363] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 transition"
            />
            {activeSearch && (
              <button
                type="button"
                onClick={() => handleSearch("")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                aria-label="مسح البحث"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Optional Filter Controls Slot */}
          {filterControls && <div className="flex items-center gap-2">{filterControls}</div>}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          {extraHeaderActions}

          {/* View Mode Toggle */}
          {allowViewModeToggle && (
            <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 bg-slate-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-700 text-[#078363] dark:text-emerald-400 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                title="عرض جدولي"
                aria-label="عرض جدولي"
              >
                <List size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-slate-700 text-[#078363] dark:text-emerald-400 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                title="عرض بطاقات"
                aria-label="عرض بطاقات"
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Batch Action Bar (Appears when items are selected) */}
      {selectable && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#078363] text-white text-[11px] font-bold">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              عناصر محددة
            </span>
            <button
              type="button"
              onClick={() => updateSelection([])}
              className="text-[11px] text-emerald-700 dark:text-emerald-300 underline hover:no-underline ms-2 font-medium"
            >
              إلغاء التحديد
            </button>
          </div>

          <div className="flex items-center gap-2">
            {batchActions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => action.onClick(selectedItems, selectedIds)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  action.variant === "danger"
                    ? "bg-rose-600 text-white hover:bg-rose-700 shadow-xs"
                    : action.variant === "secondary"
                    ? "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                    : "bg-[#078363] text-white hover:bg-[#066e53] shadow-xs"
                }`}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-8 shadow-xs">
          <div className="space-y-3">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-1/4 animate-pulse"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-11 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse"
              ></div>
            ))}
          </div>
        </div>
      ) : paginatedData.length === 0 ? (
        /* Empty State */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
            {emptyIcon || <Inbox size={24} />}
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{emptyTitle}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
            {emptyDescription}
          </p>
          {emptyAction && <div className="flex justify-center">{emptyAction}</div>}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div
            className={`overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs ${
              viewMode === "cards" ? "hidden" : "block"
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    {selectable && (
                      <th className="p-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="text-slate-400 hover:text-[#078363] transition"
                          aria-label="تحديد الكل"
                        >
                          {allCurrentPageSelected ? (
                            <CheckSquare size={16} className="text-[#078363]" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                    )}
                    {columns.map((col) => {
                      const isSorted = sortKey === col.id;
                      return (
                        <th
                          key={col.id}
                          onClick={() => handleSort(col.id, col.sortable)}
                          className={`p-3 font-bold text-start select-none ${
                            col.sortable
                              ? "cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800 transition"
                              : ""
                          } ${col.headerClassName || ""} ${
                            col.hideOnMobile ? "hidden md:table-cell" : ""
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{col.header}</span>
                            {col.sortable && (
                              <span className="text-slate-400">
                                {isSorted ? (
                                  sortDir === "asc" ? (
                                    <ChevronUp size={14} className="text-[#078363]" />
                                  ) : (
                                    <ChevronDown size={14} className="text-[#078363]" />
                                  )
                                ) : (
                                  <ChevronsUpDown size={13} className="opacity-40" />
                                )}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {paginatedData.map((item, idx) => {
                    const id = keyExtractor(item);
                    const isSelected = selectedIds.includes(id);
                    const isRowActive = selectedRowId !== undefined && selectedRowId === id;

                    return (
                      <tr
                        key={String(id)}
                        onClick={() => onRowClick?.(item)}
                        className={`transition group ${
                          onRowClick ? "cursor-pointer" : ""
                        } ${
                          isRowActive
                            ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                            : isSelected
                            ? "bg-slate-50/90 dark:bg-slate-800/40"
                            : "hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        }`}
                      >
                        {selectable && (
                          <td
                            className="p-3 w-10 text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectItem(id);
                            }}
                          >
                            <button
                              type="button"
                              className="text-slate-400 hover:text-[#078363] transition"
                              aria-label="تحديد السطر"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-[#078363]" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          </td>
                        )}

                        {columns.map((col) => (
                          <td
                            key={col.id}
                            className={`p-3 text-slate-700 dark:text-slate-200 align-middle ${
                              col.className || ""
                            } ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}
                          >
                            {col.cell
                              ? col.cell(item, idx)
                              : col.accessorKey
                              ? String(item[col.accessorKey] ?? "-")
                              : null}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards View (Rendered when viewMode is cards OR on Mobile if custom render is passed) */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${
              viewMode === "cards" ? "grid" : "hidden"
            }`}
          >
            {paginatedData.map((item) => {
              const id = keyExtractor(item);
              const isSelected = selectedIds.includes(id);

              if (renderMobileCard) {
                return (
                  <div key={String(id)}>
                    {renderMobileCard(item, isSelected, () => toggleSelectItem(id))}
                  </div>
                );
              }

              // Default fallback card
              return (
                <div
                  key={String(id)}
                  onClick={() => onRowClick?.(item)}
                  className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border transition cursor-pointer ${
                    isSelected
                      ? "border-[#078363] bg-emerald-50/30 dark:bg-emerald-950/20"
                      : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="space-y-2">
                    {columns.slice(0, 4).map((col) => (
                      <div key={col.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">
                          {col.header}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold text-end">
                          {col.cell
                            ? col.cell(item, 0)
                            : col.accessorKey
                            ? String(item[col.accessorKey] ?? "-")
                            : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          {showPagination && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs text-xs">
              <div className="text-slate-500 dark:text-slate-400">
                عرض {(currentPage - 1) * pageSize + 1} إلى{" "}
                {Math.min(currentPage * pageSize, totalItems)} من أصل {totalItems} سجل
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition"
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight size={15} />
                </button>

                <div className="px-2 font-bold text-slate-800 dark:text-slate-200">
                  {currentPage} / {totalPages}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition"
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
