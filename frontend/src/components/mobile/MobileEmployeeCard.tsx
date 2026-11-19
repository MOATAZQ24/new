"use client";

import React from "react";
import Link from "next/link";
import {
  User,
  Building2,
  MapPin,
  Laptop,
  CreditCard,
  ChevronLeft,
  Briefcase,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";

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

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-4 shadow-2xs hover:border-[#187A5A] transition active:scale-[0.99] cursor-pointer space-y-3"
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
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#123D32]/10 dark:bg-emerald-950/60 text-[#123D32] dark:text-emerald-400 font-bold text-sm flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-800">
            {initial}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {employee.full_name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                dir="ltr"
                className="font-mono font-bold text-[11px] text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded"
              >
                #{employee.employee_number}
              </span>
              {employee.job_title && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {employee.job_title}
                </span>
              )}
            </div>
          </div>
        </div>

        <StatusBadge status={employee.status} />
      </div>

      {/* Organization: Company & Branch */}
      {(employee.company_name || employee.branch_name) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2">
          {employee.company_name && (
            <div className="flex items-center gap-1 min-w-0">
              <Building2 size={12} className="text-slate-400 shrink-0" />
              <span className="truncate">{employee.company_name}</span>
            </div>
          )}

          {employee.company_name && employee.branch_name && (
            <span className="text-slate-300 dark:text-slate-700">•</span>
          )}

          {employee.branch_name && (
            <div className="flex items-center gap-1 min-w-0">
              <MapPin size={12} className="text-slate-400 shrink-0" />
              <span className="truncate">{employee.branch_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Metric Counters & Footer Link */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Custody Assets count */}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg">
            <Laptop size={11} className="text-slate-400" />
            <span>{employee.assets_count ?? 0} أصول عهدة</span>
          </span>

          {/* Subscriptions count */}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg">
            <CreditCard size={11} className="text-slate-400" />
            <span>{employee.subscriptions_count ?? 0} اشتراكات</span>
          </span>
        </div>

        <Link
          href={`/employees/${employee.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-bold text-[#187A5A] dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
        >
          <span>ملف 360°</span>
          <ChevronLeft size={14} />
        </Link>
      </div>
    </div>
  );
}
