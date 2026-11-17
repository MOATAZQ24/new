"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Icons } from "@/components/ui/Icons";

export interface CanonicalBranchItem {
  id: string;
  company_id: string;
  branch_name: string;
  location: string | null;
  status: string;
}

export function BranchIntelligenceFilterBar({
  selectedBranchIds,
  onChangeBranchIds,
  label = "تصفية ومقارنة الفروع المعتمدة (Company → Branch Intelligence)",
}: {
  selectedBranchIds: string[];
  onChangeBranchIds: (nextIds: string[]) => void;
  label?: string;
}) {
  const { activeCompanyId, activeCompany } = useAuth();
  const [branches, setBranches] = useState<CanonicalBranchItem[]>([]);

  useEffect(() => {
    if (!activeCompanyId) return;
    let mounted = true;
    api
      .get<CanonicalBranchItem[]>(`/companies/${activeCompanyId}/branches`)
      .then((res) => {
        if (mounted) {
          setBranches(res.data || []);
        }
      })
      .catch(() => {
        // Ignore transient network errors
      });
    return () => {
      mounted = false;
    };
  }, [activeCompanyId]);

  const toggleBranch = (branchId: string) => {
    if (selectedBranchIds.includes(branchId)) {
      onChangeBranchIds(selectedBranchIds.filter((id) => id !== branchId));
    } else {
      onChangeBranchIds([...selectedBranchIds, branchId]);
    }
  };

  return (
    <section
      aria-label={label}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-3.5 shadow-xs space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
          <Icons.Companies size={15} className="text-[#187A5A]" />
          <span>{label}</span>
          {activeCompany && (
            <span className="text-[11px] font-normal text-slate-500">
              • المنشأة: <strong className="text-slate-800 dark:text-white">{activeCompany.name_ar}</strong>
            </span>
          )}
        </div>
        {selectedBranchIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChangeBranchIds([])}
            className="text-[11px] font-bold text-[#187A5A] hover:underline cursor-pointer"
          >
            إعادة تعيين (جميع الفروع الخمسة)
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="اختيار الفروع">
        <button
          type="button"
          onClick={() => onChangeBranchIds([])}
          aria-pressed={selectedBranchIds.length === 0}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedBranchIds.length === 0
              ? "bg-[#123D32] text-white shadow-xs"
              : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
          }`}
        >
          جميع الفروع المعتمدة ({branches.length || 5})
        </button>

        {branches.map((br) => {
          const active = selectedBranchIds.includes(br.id);
          return (
            <button
              key={br.id}
              type="button"
              onClick={() => toggleBranch(br.id)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                active
                  ? "bg-[#187A5A] text-white border-[#187A5A] font-bold shadow-xs"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#187A5A]"
              }`}
            >
              {br.branch_name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
