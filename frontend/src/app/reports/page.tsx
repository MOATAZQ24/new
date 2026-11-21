"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Modal from "@/components/ui/Modal";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { 
  DownloadIcon, PrinterIcon, LaptopIcon, 
  ShieldCheckIcon, ServerIcon, CreditCardIcon, WrenchIcon, 
  CheckSquareIcon, LifeBuoyIcon, ShieldAlertIcon, PlusIcon, Icons
} from "@/components/ui/Icons";
import { api, exportReportDownload } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MobileReportSummary } from "@/components/mobile/MobileReportSummary";

interface ReportsOverviewData {
  kpis: {
    total_assets: number;
    total_tickets: number;
    open_tickets: number;
    overdue_tasks: number;
    active_subscriptions: number;
  };
  asset_status_distribution: Record<string, number>;
  company_breakdown: {
    company_id: string;
    company_code: string;
    company_name_ar: string;
    assets_count: number;
    tickets_count: number;
    tasks_count: number;
    employees_count: number;
  }[];
}

interface ReportItem {
  type: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const reportsList: ReportItem[] = [
  {
    type: "assets",
    title: "تقرير الأصول التقنية (Assets)",
    description: "حصر شامل لجميع أجهزة الكمبيوتر المحمولة والمكتبية، الشاشات، الطابعات، وأرقامها التسلسلية والضمان.",
    icon: LaptopIcon,
    color: "blue",
  },
  {
    type: "custody",
    title: "تقرير عهد الموظفين والتسليم (Custody)",
    description: "بيان بجميع الأصول المسلمة للموظفين حالياً وسوابق العهد، وحالة كل جهاز وتاريخ استحقاق الإرجاع.",
    icon: ShieldCheckIcon,
    color: "green",
  },
  {
    type: "infrastructure",
    title: "تقرير البنية التحتية والشبكات (Infrastructure)",
    description: "بيانات خوادم الشركة، الموجهات، المبدلات، جدران الحماية، أرقام IP الإدارة ومواقع التركيب.",
    icon: ServerIcon,
    color: "purple",
  },
  {
    type: "subscriptions",
    title: "تقرير الاشتراكات السنوية والشهرية (Subscriptions)",
    description: "بيان تكاليف الاستضافات، النطاقات، تراخيص البرمجيات، مواعيد التجديد القادمة والتكلفة المترتبة.",
    icon: CreditCardIcon,
    color: "amber",
  },
  {
    type: "maintenance",
    title: "تقرير الصيانة وتعديلات الإعدادات (Maintenance & Changes)",
    description: "سجل أعمال الصيانة المنفذة، استبدال القطع والأجهزة، وتعديلات إعدادات الشبكة مع تقييم المخاطر.",
    icon: WrenchIcon,
    color: "indigo",
  },
  {
    type: "tasks",
    title: "تقرير المهام الفنية والتشغيلية (Tasks)",
    description: "متابعة إنجاز المهام المسندة للفنيين، المهام المكتملة، وتلك المتأخرة عن مواعيد التسليم المحددة.",
    icon: CheckSquareIcon,
    color: "teal",
  },
  {
    type: "helpdesk",
    title: "تقرير مكتب المساعدة والدعم الفني (Help Desk)",
    description: "إحصائيات تذاكر الدعم المفتوحة والمغلقة، سرعة الاستجابة والحل، وتصنيف الأعطال الأكثر تكراراً.",
    icon: LifeBuoyIcon,
    color: "rose",
  },
  {
    type: "audit",
    title: "تقرير سجل الرقابة والعمليات (Audit Logs)",
    description: "سجل كامل للعمليات والتغييرات المنفذة في النظام، هوية المستخدمين، عناوين IP، والتوقيت الزمني.",
    icon: ShieldAlertIcon,
    color: "gray",
  },
];

export default function ReportsPage() {
  const { currentCompany, activeCompanyId, user } = useAuth();
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [overview, setOverview] = useState<ReportsOverviewData | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .get<ReportsOverviewData>("/reports/overview")
      .then((res) => {
        if (mounted) setOverview(res.data || null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [activeCompanyId]);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModule, setImportModule] = useState<"assets" | "employees" | "infrastructure">("assets");
  const [importFileContent, setImportFileContent] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    dry_run?: boolean;
    message?: string;
    total_rows?: number;
    valid_count?: number;
    error_count?: number;
    created_count?: number;
    imported_count?: number;
    skipped_count?: number;
    errors?: Array<{ row?: number; error?: string } | string>;
  } | null>(null);

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const handleExport = async (reportType: string, format: "excel" | "html") => {
    setDownloading(`${reportType}-${format}`);
    try {
      await exportReportDownload(reportType, format, currentCompany?.id || activeCompanyId, `${reportType}_report.csv`);
      toast.success(format === "html" ? "تم فتح معاينة التقرير للطباعة" : "تم تصدير التقرير بنجاح");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تصدير التقرير");
    } finally {
      setDownloading(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportFileContent(text);
      setImportResult(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const parseCsvToObjects = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
    const objects: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, index) => {
        obj[h] = values[index] || "";
      });
      objects.push(obj);
    }
    return objects;
  };

  const handleExecuteImport = async (dryRun: boolean) => {
    if (!importFileContent.trim()) {
      toast.warning("يرجى اختيار ملف CSV أو لصق بيانات الجدول");
      return;
    }

    const rows = parseCsvToObjects(importFileContent);
    if (rows.length === 0) {
      toast.warning("لم يتم العثور على صفوف بيانات صالحة في الملف");
      return;
    }

    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await api.post<{
        dry_run?: boolean;
        message?: string;
        total_rows?: number;
        valid_count?: number;
        error_count?: number;
        created_count?: number;
        imported_count?: number;
        skipped_count?: number;
        errors?: Array<{ row?: number; error?: string } | string>;
      }>("/reports/import", {
        module: importModule,
        rows,
        dry_run: dryRun,
      });
      setImportResult(res.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل استيراد البيانات");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header matching Images 11 & 12 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0 mt-0.5">
              <Icons.Reports size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                التقارير
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                تقارير تشغيلية شاملة للأصول، الدعم الفني، المهام، والموظفين
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs">
              <Icons.Calendar size={14} className="text-slate-500" />
              <span>
                {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </span>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(true);
                  setImportResult(null);
                  setImportFileContent("");
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                <span>استيراد بيانات (Excel / CSV)</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 1: 4 Pastel KPIs matching Images 11 & 12 */}
        {overview && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
                  <LaptopIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-slate-900">
                    {overview.kpis.total_assets}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1">إجمالي الأصول</div>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0">
                  <LifeBuoyIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-slate-900">
                    {overview.kpis.total_tickets}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1">تذكرة (Help Desk)</div>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Icons.Clock size={22} />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-amber-700">
                    {overview.kpis.overdue_tasks}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1">مهام متأخرة</div>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Icons.HelpDesk size={22} />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-rose-700">
                    {overview.kpis.open_tickets}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1">تذاكر مفتوحة</div>
                </div>
              </div>
            </div>

            {/* Row 2: 3 Middle Cards (Asset Distribution Donut, Resource Comparison Bar, Ready Reports) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <EnterpriseDonutChart
                title="توزيع الأصول حسب الحالة"
                totalLabel="أصل"
                items={Object.entries(overview.asset_status_distribution || {}).map(([label, value]) => ({
                  label: label.replace(/\s*\([^)]*\)/g, ""),
                  value,
                }))}
              />

              <EnterpriseBarChart
                title="مقارنة الموارد حسب الشركة"
                subtitle="توزيع الأصول والموظفين عبر الشركات المعتمدة"
                unit="أصل"
                items={(overview.company_breakdown || []).map((c) => ({
                  label: c.company_name_ar,
                  value: c.assets_count,
                  badge: `${c.employees_count} موظف`,
                }))}
              />

              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Icons.FileText size={17} className="text-[#123D32]" />
                  <h2 className="text-sm font-bold text-slate-900">تقارير جاهزة</h2>
                </div>
                <div className="space-y-2">
                  {[
                    { key: "assets", label: "تقرير الأصول والعهد" },
                    { key: "helpdesk", label: "تقرير التذاكر (Help Desk)" },
                    { key: "tasks", label: "تقرير المهام" },
                    { key: "employees", label: "تقرير الموظفين" },
                    { key: "companies", label: "تقرير الشركات والفروع" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void handleExport(item.key, "excel")}
                      className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                    >
                      <span>{item.label}</span>
                      <span className="text-slate-400">←</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Mobile Purpose-Built Report Summary & Instant Field Exports */}
            <div className="block lg:hidden">
              <MobileReportSummary
                companies={overview.company_breakdown}
                onExport={(docKey, fmt) => void handleExport(docKey, fmt)}
                exportingKey={downloading}
              />
            </div>

            {/* Row 3: 3 Bottom Cards (Quick Actions 2x2, Summary by Company Table, Latest Reports) (Desktop Only) */}
            <div className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Icons.Sparkles size={17} className="text-[#C5A46D]" />
                  <h2 className="text-sm font-bold text-slate-900">إجراءات سريعة</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("reports-catalog");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    <PlusIcon className="w-4 h-4 text-[#187A5A]" />
                    <span>إنشاء تقرير مخصص</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport("assets", "excel")}
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    <DownloadIcon className="w-4 h-4 text-[#123D32]" />
                    <span>تصدير تقرير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport("assets", "html")}
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    <PrinterIcon className="w-4 h-4 text-[#8A6D3B]" />
                    <span>طباعة التقرير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(true);
                      setImportResult(null);
                      setImportFileContent("");
                    }}
                    className="rounded-xl bg-slate-50/90 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-[#187A5A]/40 p-3 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    <Icons.FileText size={15} className="text-[#187A5A]" />
                    <span>استيراد Excel</span>
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Icons.Building size={17} className="text-[#123D32]" />
                  <h2 className="text-sm font-bold text-slate-900">ملخص حسب الشركة</h2>
                </div>
                {overview.company_breakdown.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">لا توجد بيانات شركات متاحة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 px-1.5">الشركة</th>
                          <th className="py-2 px-1.5 text-center">الأصول</th>
                          <th className="py-2 px-1.5 text-center">التذاكر</th>
                          <th className="py-2 px-1.5 text-center">المهام</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overview.company_breakdown.map((c) => (
                          <tr key={c.company_id}>
                            <td className="py-2.5 px-1.5 font-bold text-slate-900">{c.company_name_ar}</td>
                            <td className="py-2.5 px-1.5 text-center font-mono font-bold text-slate-900">{c.assets_count}</td>
                            <td className="py-2.5 px-1.5 text-center font-mono text-sky-700">{c.tickets_count}</td>
                            <td className="py-2.5 px-1.5 text-center font-mono text-amber-800">{c.tasks_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Icons.Clock size={17} className="text-[#123D32]" />
                  <h2 className="text-sm font-bold text-slate-900">أحدث التقارير</h2>
                </div>
                <div className="space-y-2">
                  {[
                    { key: "assets", title: "تقرير الأصول والعهد", fmt: "html" as const, tag: "PDF", cls: "bg-rose-600 text-white" },
                    { key: "helpdesk", title: "تقرير التذاكر والطلبات", fmt: "html" as const, tag: "PDF", cls: "bg-rose-600 text-white" },
                    { key: "tasks", title: "تقرير المهام والإنجاز", fmt: "excel" as const, tag: "XLSX", cls: "bg-emerald-600 text-white" },
                    { key: "employees", title: "تقرير الموظفين والفروع", fmt: "excel" as const, tag: "XLSX", cls: "bg-emerald-600 text-white" },
                  ].map((doc) => (
                    <button
                      key={doc.key}
                      type="button"
                      onClick={() => void handleExport(doc.key, doc.fmt)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2 font-bold text-slate-800 truncate">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${doc.cls}`}>
                          {doc.tag}
                        </span>
                        <span className="truncate">{doc.title}</span>
                      </span>
                      <DownloadIcon className="w-4 h-4 text-sky-700 shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Full Exportable Reports Catalog */}
        <div id="reports-catalog" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reportsList.map((rep) => {
            const Icon = rep.icon;
            const isExcelLoading = downloading === `${rep.type}-excel`;
            const isHtmlLoading = downloading === `${rep.type}-html`;

            return (
              <div
                key={rep.type}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-[#187A5A]/10 text-[#187A5A]">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{rep.title}</h3>
                      <span className="text-[11px] text-slate-400 font-mono">Module: {rep.type}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {rep.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleExport(rep.type, "excel")}
                    disabled={isExcelLoading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    {isExcelLoading ? "جاري التجهيز..." : "تصدير إلى Excel"}
                  </button>

                  <button
                    onClick={() => handleExport(rep.type, "html")}
                    disabled={isHtmlLoading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <PrinterIcon className="w-4 h-4" />
                    {isHtmlLoading ? "جاري الفتح..." : "معاينة وطباعة PDF"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="استيراد البيانات مجمّعة من ملف Excel أو CSV"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الوحدة المستهدفة للاستيراد *
              </label>
              <select
                value={importModule}
                onChange={(e) => setImportModule(e.target.value as "assets" | "employees" | "infrastructure")}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="assets">الأصول التقنية (Technical Assets)</option>
                <option value="employees">الموظفون والتقنيون (Employees)</option>
                <option value="infrastructure">أجهزة البنية التحتية (Infrastructure)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اختيار ملف CSV
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#123D32] file:text-white hover:file:bg-[#187A5A] cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700">
                أو الصق بيانات CSV مباشرةً:
              </label>
              <span className="text-[10px] text-slate-400">
                {importModule === "assets" && "الأعمدة: كود الأصل, اسم الأصل, النوع, الماركة, الموديل, الرقم التسلسلي"}
                {importModule === "employees" && "الأعمدة: الرقم الوظيفي, اسم الموظف, المسمى الوظيفي, البريد الإلكتروني, الهاتف"}
                {importModule === "infrastructure" && "الأعمدة: اسم الجهاز, نوع الجهاز, الشركة المصنعة, الموديل, IP الإدارة, الموقع"}
              </span>
            </div>
            <textarea
              rows={5}
              value={importFileContent}
              onChange={(e) => setImportFileContent(e.target.value)}
              placeholder={
                importModule === "assets"
                  ? "كود الأصل,اسم الأصل,النوع,الماركة,الموديل,الرقم التسلسلي\nAST-001,MacBook Pro,Laptop,Apple,M3,C02XYZ123"
                  : importModule === "employees"
                  ? "الرقم الوظيفي,اسم الموظف,المسمى الوظيفي,البريد الإلكتروني,الهاتف\nEMP-101,أحمد المنصور,فني شبكات,ahmad@company.sa,0501112222"
                  : "اسم الجهاز,نوع الجهاز,الشركة المصنعة,الموديل,IP الإدارة,الموقع\nCore-SW-01,Switch,Cisco,Catalyst 9300,10.0.0.1,غرفة الخوادم الرئيسية"
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono text-left"
              dir="ltr"
            />
          </div>

          {importResult && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  نتيجة العملية: {importResult.dry_run ? "(معاينة تجريبية)" : "(استيراد فعلي)"}
                </span>
                <span className="text-emerald-700 font-bold">
                  تم بنجاح: {importResult.imported_count} سجل
                </span>
              </div>
              {(importResult.skipped_count ?? 0) > 0 && (
                <div className="text-rose-600 text-[11px]">
                  تم تخطي {importResult.skipped_count} سجل لوجود تكرار أو نقص في البيانات الأساسية.
                </div>
              )}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-slate-500 font-mono bg-white p-2 rounded border border-slate-100">
                  {importResult.errors.map((err, i) => (
                    <div key={i}>
                      {typeof err === "string" ? err : `صف ${err.row ?? i + 1}: ${err.error ?? ""}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-between items-center">
            <button
              type="button"
              onClick={() => handleExecuteImport(true)}
              disabled={importLoading || !importFileContent.trim()}
              className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {importLoading ? "جاري الفحص..." : "فحص ومعاينة (Dry-Run)"}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => handleExecuteImport(false)}
                disabled={importLoading || !importFileContent.trim()}
                className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {importLoading ? "جاري الاستيراد..." : "تنفيذ الاستيراد الفعلي"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
