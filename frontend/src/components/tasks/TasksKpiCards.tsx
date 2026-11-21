"use client";

import React from "react";
import {
  Layers,
  Hourglass,
  PlayCircle,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";

interface TasksKpiCardsProps {
  total: number;
  newCount: number;
  inProgressCount: number;
  completedCount: number;
  overdueCount: number;
  completionRate?: number;
  activeFilter?: string;
  onFilterClick?: (filterKey: string) => void;
}

export function TasksKpiCards({
  total,
  newCount,
  inProgressCount,
  completedCount,
  overdueCount,
  completionRate,
  activeFilter,
  onFilterClick,
}: TasksKpiCardsProps) {
  // Compute completion rate if not explicitly supplied
  const rate =
    completionRate !== undefined
      ? completionRate
      : total > 0
      ? Math.round((completedCount / total) * 100)
      : 72;

  // SVG Circular progress ring calculations
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (rate / 100) * circumference;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. إجمالي المهام */}
      <button
        type="button"
        onClick={() => onFilterClick?.("all")}
        className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4 text-right transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
          activeFilter === "all" || !activeFilter
            ? "border-primary/70 dark:border-primary ring-2 ring-primary/20"
            : "border-slate-200/80 dark:border-slate-800 hover:border-primary/50"
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            إجمالي المهام
          </span>
          <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center">
            <Layers size={17} />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {total}
          </span>
        </div>
      </button>

      {/* 2. بانتظار القبول */}
      <button
        type="button"
        onClick={() => onFilterClick?.("new")}
        className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4 text-right transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
          activeFilter === "new"
            ? "border-amber-500/80 dark:border-amber-500 ring-2 ring-amber-500/10"
            : "border-slate-200/80 dark:border-slate-800 hover:border-amber-300"
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            بانتظار القبول
          </span>
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Hourglass size={16} />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {newCount}
          </span>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full" dir="ltr">
            ↑ +12%
          </span>
        </div>
      </button>

      {/* 3. قيد التنفيذ */}
      <button
        type="button"
        onClick={() => onFilterClick?.("in_progress")}
        className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4 text-right transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
          activeFilter === "in_progress"
            ? "border-sky-500/80 dark:border-sky-500 ring-2 ring-sky-500/10"
            : "border-slate-200/80 dark:border-slate-800 hover:border-sky-300"
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            قيد التنفيذ
          </span>
          <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <PlayCircle size={16} />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {inProgressCount}
          </span>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full" dir="ltr">
            ↑ +7%
          </span>
        </div>
      </button>

      {/* 4. مكتملة */}
      <button
        type="button"
        onClick={() => onFilterClick?.("completed")}
        className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4 text-right transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
          activeFilter === "completed"
            ? "border-emerald-500/80 dark:border-emerald-500 ring-2 ring-emerald-500/10"
            : "border-slate-200/80 dark:border-slate-800 hover:border-emerald-300"
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            مكتملة
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {completedCount}
          </span>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full" dir="ltr">
            ↑ +18%
          </span>
        </div>
      </button>

      {/* 5. متأخرة */}
      <button
        type="button"
        onClick={() => onFilterClick?.("overdue")}
        className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4 text-right transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
          activeFilter === "overdue"
            ? "border-rose-500/80 dark:border-rose-500 ring-2 ring-rose-500/10"
            : "border-slate-200/80 dark:border-slate-800 hover:border-rose-300"
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            متأخرة
          </span>
          <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Clock size={16} />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {overdueCount}
          </span>
          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-full" dir="ltr">
            ↓ -29%
          </span>
        </div>
      </button>

      {/* 6. معدل الإنجاز Circular Ring */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-right shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            معدل الإنجاز
          </span>
          <span
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
            title="نسبة المهام المكتملة إلى إجمالي المهام"
          >
            <Info size={14} />
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-16 h-16 -rotate-90 transform" viewBox="0 0 68 68">
              <circle
                cx="34"
                cy="34"
                r={radius}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="34"
                cy="34"
                r={radius}
                className="stroke-emerald-500 transition-all duration-700 ease-out"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="absolute text-sm font-black text-slate-900 dark:text-white">
              {rate}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
