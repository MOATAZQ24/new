"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Laptop,
  CreditCard,
  ChevronLeft,
  Check,
} from "lucide-react";

interface MobileEmployeeCardProps {
  employee: {
    id: string;
    full_name: string;
    employee_number: string;
    company_name?: string;
    branch_name?: string;
    job_title?: string;
    status: string;
    assets_count?: number;
    subscriptions_count?: number;
  };
  onClick: () => void;
}

export function MobileEmployeeCard({
  employee,
  onClick,
}: MobileEmployeeCardProps) {
  const initial = employee.full_name ? employee.full_name.trim().charAt(0) : "م";
  const isActive = (employee.status || "").toLowerCase() === "active" || employee.status === "نشط";

  return (
    <div
      onClick={onClick}
      className="bg-[var(--surface)] dark:bg-slate-900 rounded-2xl border border-[var(--border)] dark:border-slate-800 shadow-2xs p-4 hover:border-primary/40 transition active:scale-[0.99] cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Header: Avatar + Full Name + Status Badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-primary/[0.12] dark:bg-primary/20 text-primary font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
            {initial}
          </div>

          <div className="min-w-0 text-right">
            <h3 className="text-sm font-bold text-[var(--text)] dark:text-white truncate">
              {employee.full_name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                dir="ltr"
                className="font-mono font-bold text-[11px] text-primary bg-primary/[0.08] dark:bg-primary/15 px-1.5 py-0.2 rounded-lg"
              >
                #{employee.employee_number}
              </span>
              {employee.job_title && (
                <span className="text-[11px] text-[var(--text-3)] dark:text-slate-500 font-medium truncate">
                  {employee.job_title}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isActive
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-2)] dark:text-slate-400"
            }`}
          >
            {isActive ? (
              <Check size={12} strokeWidth={3} className="shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            )}
            <span>{isActive ? "نشط" : "معطل"}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>

      {/* Organization: Company & Branch */}
      {(employee.company_name || employee.branch_name) && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] dark:text-slate-400 bg-[var(--surface-2)] dark:bg-slate-800/60 rounded-xl px-3 py-2 font-medium">
          {employee.company_name && (
            <div className="flex items-center gap-1 min-w-0">
              <Building2 size={12} className="text-[var(--text-3)] shrink-0" />
              <span className="truncate">{employee.company_name}</span>
            </div>
          )}

          {employee.company_name && employee.branch_name && (
            <span className="text-slate-300 dark:text-slate-600">•</span>
          )}

          {employee.branch_name && (
            <div className="flex items-center gap-1 min-w-0">
              <MapPin size={12} className="text-[var(--text-3)] shrink-0" />
              <span className="truncate">{employee.branch_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Metric Counters & Footer Link */}
      <div className="pt-2 border-t border-[var(--border)] dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Custody Assets count */}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-2)] dark:text-slate-400 bg-[var(--surface-2)] dark:bg-slate-800 px-2.5 py-0.5 rounded-lg">
            <Laptop size={11} className="text-[var(--text-3)]" />
            <span>{employee.assets_count ?? 0} أصول عهدة</span>
          </span>

          {/* Subscriptions count */}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-2)] dark:text-slate-400 bg-[var(--surface-2)] dark:bg-slate-800 px-2.5 py-0.5 rounded-lg">
            <CreditCard size={11} className="text-[var(--text-3)]" />
            <span>{employee.subscriptions_count ?? 0} اشتراكات</span>
          </span>
        </div>

        <Link
          href={`/employees/${employee.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-bold text-primary flex items-center gap-1 hover:underline cursor-pointer"
        >
          <span>ملف 360°</span>
          <ChevronLeft size={14} />
        </Link>
      </div>
    </div>
  );
}
