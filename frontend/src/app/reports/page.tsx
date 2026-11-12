"use client";

import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { 
  FileTextIcon, DownloadIcon, PrinterIcon, LaptopIcon, 
  ShieldCheckIcon, ServerIcon, CreditCardIcon, WrenchIcon, 
  CheckSquareIcon, LifeBuoyIcon, ShieldAlertIcon 
} from "@/components/ui/Icons";
import { useAuth } from "@/context/AuthContext";

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
  const { currentCompany } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleExport = (reportType: string, format: "excel" | "html") => {
    setDownloading(`${reportType}-${format}`);
    const token = localStorage.getItem("auth_token");
    const companyParam = currentCompany ? `&company_id=${currentCompany.id}` : "";
    const url = `http://localhost:8000/api/v1/reports/export?report_type=${reportType}&format_type=${format}${companyParam}`;

    if (format === "html") {
      window.open(url, "_blank");
      setDownloading(null);
    } else {
      // Trigger download
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${reportType}_report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => setDownloading(null), 1000);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مركز التقارير والتصدير</h1>
          <p className="text-sm text-gray-500 mt-1">
            تصدير كشوفات وتقارير تشغيلية بصيغة Excel (CSV مع ترميز العربية) أو نماذج HTML للطباعة كـ PDF
          </p>
        </div>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reportsList.map((rep) => {
            const Icon = rep.icon;
            const isExcelLoading = downloading === `${rep.type}-excel`;
            const isHtmlLoading = downloading === `${rep.type}-html`;

            return (
              <div
                key={rep.type}
                className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-lg bg-[#187A5A]/10 text-[#187A5A]">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{rep.title}</h3>
                      <span className="text-xs text-gray-400 font-mono">Module: {rep.type}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    {rep.description}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleExport(rep.type, "excel")}
                    disabled={isExcelLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    {isExcelLoading ? "جاري التجهيز..." : "تصدير إلى Excel"}
                  </button>

                  <button
                    onClick={() => handleExport(rep.type, "html")}
                    disabled={isHtmlLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                  >
                    <PrinterIcon className="w-4 h-4" />
                    {isHtmlLoading ? "جاري الفتح..." : "طباعة / حفظ PDF"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
