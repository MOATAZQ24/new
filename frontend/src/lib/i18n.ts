/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import { useEffect, useState } from "react";

export type AppLocale = "ar" | "en";

const DICT: Record<string, { ar: string; en: string }> = {
  my_work: { ar: "أعمالي", en: "My Work" },
  my_work_subtitle: {
    ar: "عرض موحد للتذاكر والمهام والموافقات المسندة إليك أو التي تتابعها",
    en: "Unified feed of tickets, tasks, and approvals assigned to or watched by you",
  },
  overdue: { ar: "متأخرة", en: "Overdue" },
  today: { ar: "اليوم", en: "Today" },
  this_week: { ar: "هذا الأسبوع", en: "This Week" },
  later: { ar: "لاحقاً", en: "Later" },
  all: { ar: "الكل", en: "All" },
  tickets: { ar: "التذاكر", en: "Tickets" },
  tasks: { ar: "المهام", en: "Tasks" },
  approvals: { ar: "الموافقات", en: "Approvals" },
  sla_ok: { ar: "ضمن SLA", en: "On Track" },
  sla_at_risk: { ar: "قريب من الانتهاء", en: "At Risk" },
  sla_breached: { ar: "متجاوز SLA", en: "Breached" },
  sla_paused: { ar: "SLA متوقف مؤقتاً", en: "SLA Paused" },
  inbox_view: { ar: "صندوق التذاكر الموحد", en: "Split Inbox" },
  workload_view: { ar: "أحمال العمل والسعة", en: "Workload" },
  work_mgmt_settings: { ar: "إدارة التوزيع و SLA", en: "Work Management" },
  teams: { ar: "الفرق والأعضاء", en: "Teams & Members" },
  rules: { ar: "قواعد التوزيع", en: "Assignment Rules" },
  sla_policies: { ar: "سياسات SLA", en: "SLA Policies" },
  workflows: { ar: "مصفوفة الحالات", en: "Workflow Matrix" },
  categories: { ar: "تصنيفات التذاكر", en: "Categories" },
  macros: { ar: "الردود الجاهزة", en: "Macros" },
  auto_assign: { ar: "توزيع تلقائي", en: "Auto-Assign" },
  unassigned: { ar: "غير معين", en: "Unassigned" },
  assigned_to_me: { ar: "مسند لي", en: "Assigned to me" },
  public_reply: { ar: "رد عام للموظف", en: "Public Reply" },
  internal_note: { ar: "ملاحظة داخلية للفريق", en: "Internal Note" },
  shortcuts: { ar: "اختصارات لوحة المفاتيح", en: "Keyboard Shortcuts" },
  bulk_selected: { ar: "تم تحديد", en: "Selected" },
  merge_ticket: { ar: "دمج تذكرة مكررة", en: "Merge Duplicate" },
  create_linked_task: { ar: "إنشاء مهمة مرتبطة", en: "Create Linked Task" },
  dry_run_test: { ar: "تجربة قواعد التوزيع (Dry-Run)", en: "Test Rules (Dry-Run)" },
  retry: { ar: "إعادة المحاولة", en: "Retry" },
};

export function tLabel(key: string, locale: AppLocale = "ar"): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[locale] || entry.ar;
}

export function useLocale(): { locale: AppLocale; setLocale: (loc: AppLocale) => void; t: (key: string) => string } {
  const [locale, setLocaleState] = useState<AppLocale>("ar");

  useEffect(() => {
    const t = window.setTimeout(() => {
      const saved = localStorage.getItem("igos_locale");
      if (saved === "en" || saved === "ar") {
        setLocaleState(saved);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const setLocale = (loc: AppLocale) => {
    setLocaleState(loc);
    if (typeof window !== "undefined") {
      localStorage.setItem("igos_locale", loc);
    }
  };

  return {
    locale,
    setLocale,
    t: (key: string) => tLabel(key, locale),
  };
}
