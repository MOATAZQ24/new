"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import {
  FileText,
  FileSpreadsheet,
  Building2,
  Laptop,
  LifeBuoy,
  CheckSquare,
  Download,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface CompanyMetric {
  company_id: string;
  company_name_ar: string;
  assets_count: number;
  tickets_count: number;
  tasks_count: number;
}

interface MobileReportSummaryProps {
  companies: CompanyMetric[];
  onExport: (docKey: string, format: "html" | "excel") => void;
  exportingKey?: string | null;
}

export function MobileReportSummary({
  companies,
  onExport,
  exportingKey,
}: MobileReportSummaryProps) {
  const exportDocs = [
    {
      key: "assets",
      title: "تقرير الأصول والعهد التقنية",
      fmt: "html" as const,
      formatLabel: "PDF",
      icon: FileText,
      color: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    },
    {
      key: "helpdesk",
      title: "تقرير تذاكر الدعم ومعدل الحل",
      fmt: "html" as const,
      formatLabel: "PDF",
      icon: FileText,
      color: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-900",
    },
    {
      key: "tasks",
      title: "تقرير إنجاز المهام وفرق العمل",
      fmt: "excel" as const,
      formatLabel: "XLSX",
      icon: FileSpreadsheet,
      color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    },
    {
      key: "employees",
      title: "تقرير الموظفين والعهدة والاشتراكات",
      fmt: "excel" as const,
      formatLabel: "XLSX",
      icon: FileSpreadsheet,
      color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900",
    },
  ];

  return (
    <div className="space-y-4 lg:hidden">
      {/* 1. Instant Export Cards */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          تصدير التقارير الميدانية فوراً
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {exportDocs.map((doc) => {
            const Icon = doc.icon;
            const isGenerating = exportingKey === doc.key;
            return (
              <button
                key={doc.key}
                type="button"
                onClick={() => onExport(doc.key, doc.fmt)}
                disabled={Boolean(exportingKey)}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-3.5 shadow-2xs hover:border-[#2563EB] transition active:scale-98 text-start flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${doc.color}`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {doc.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      صيغة {doc.formatLabel} المعتمدة
                    </span>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center shrink-0">
                  {isGenerating ? (
                    <Loader2 size={15} className="animate-spin text-primary" />
                  ) : (
                    <Download size={15} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Company Breakdown Mobile Cards (Replaces Desktop Table) */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          توزيع المؤشرات حسب المنشأة والشركة
        </h3>

        {companies.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
            لا توجد بيانات شركات مسجلة
          </div>
        ) : (
          <div className="space-y-2.5">
            {companies.map((c) => (
              <div
                key={c.company_id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-3.5 shadow-2xs space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-[#1D4ED8] dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Building2 size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {c.company_name_ar}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                      <Laptop size={11} />
                      <span>الأصول</span>
                    </div>
                    <div className="font-mono font-black text-xs text-slate-800 dark:text-slate-100 mt-0.5">
                      {c.assets_count}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                      <LifeBuoy size={11} />
                      <span>التذاكر</span>
                    </div>
                    <div className="font-mono font-black text-xs text-sky-700 dark:text-sky-400 mt-0.5">
                      {c.tickets_count}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                      <CheckSquare size={11} />
                      <span>المهام</span>
                    </div>
                    <div className="font-mono font-black text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {c.tasks_count}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
