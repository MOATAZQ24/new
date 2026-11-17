"use client";

import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Modal from "@/components/ui/Modal";
import { 
  FileTextIcon, DownloadIcon, PrinterIcon, LaptopIcon, 
  ShieldCheckIcon, ServerIcon, CreditCardIcon, WrenchIcon, 
  CheckSquareIcon, LifeBuoyIcon, ShieldAlertIcon, PlusIcon,
  RefreshIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

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
  const { currentCompany, user } = useAuth();
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModule, setImportModule] = useState<"assets" | "employees" | "infrastructure">("assets");
  const [importFileContent, setImportFileContent] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const handleExport = (reportType: string, format: "excel" | "html") => {
    setDownloading(`${reportType}-${format}`);
    const companyParam = currentCompany ? `&company_id=${currentCompany.id}` : "";
    const url = `/api/v1/reports/export?report_type=${reportType}&format_type=${format}${companyParam}`;

    if (format === "html") {
      window.open(url, "_blank");
      setDownloading(null);
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${reportType}_report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => setDownloading(null), 1000);
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
      const res = await api.post("/reports/import", {
        module: importModule,
        rows,
        dry_run: dryRun,
      });
      setImportResult(res.data);
    } catch (err: any) {
      toast.error(err?.message || "فشل استيراد البيانات");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">مركز التقارير والتصدير والاستيراد</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              تصدير كشوفات وتقارير تشغيلية بصيغة Excel (CSV مع ترميز UTF-8 BOM) أو نماذج HTML للطباعة كـ PDF واستيراد كتل البيانات
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => {
                setShowImportModal(true);
                setImportResult(null);
                setImportFileContent("");
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>استيراد بيانات (Excel / CSV)</span>
            </button>
          )}
        </div>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                onChange={(e) => setImportModule(e.target.value as any)}
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
              {importResult.skipped_count > 0 && (
                <div className="text-rose-600 text-[11px]">
                  تم تخطي {importResult.skipped_count} سجل لوجود تكرار أو نقص في البيانات الأساسية.
                </div>
              )}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-slate-500 font-mono bg-white p-2 rounded border border-slate-100">
                  {importResult.errors.map((err: string, i: number) => (
                    <div key={i}>{err}</div>
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
