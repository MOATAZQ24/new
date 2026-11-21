"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { designTokens } from "@/lib/designTokens";
import { useFeatureFlags } from "@/lib/featureFlags";
import {
  Sparkles,
  Layers,
  Palette,
  Type,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  RotateCcw,
  Activity,
  Sliders,
  Eye,
  ShieldAlert,
  ArrowRight,
  Terminal,
  ExternalLink,
} from "lucide-react";

export default function SandboxPage() {
  const { flags, toggleFlag } = useFeatureFlags();
  const [activeTab, setActiveTab] = useState<"components" | "tokens" | "flags" | "observability">("components");
  const [direction, setDirection] = useState<"rtl" | "ltr">("rtl");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [btnLoading, setBtnLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "observability") {
      fetchMetrics();
    }
  }, [activeTab]);

  const fetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch("/api/v1/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetricsData(data);
      } else {
        setMetricsData({ status: "mock_fallback", error: "Endpoint returned status " + res.status });
      }
    } catch (err: any) {
      setMetricsData({ status: "offline", error: err.message });
    } finally {
      setMetricsLoading(false);
    }
  };

  return (
    <div dir={direction} className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6 lg:p-10 font-sans">
      {/* Sandbox Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Investor Gate Developer Toolkit & Sandbox</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                سجل المكونات الموحدة، رموز التصميم (Tokens)، وإدارة بيئة التطوير والتحقق
              </p>
            </div>
          </div>
        </div>

        {/* Global Control Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setDirection(direction === "rtl" ? "ltr" : "rtl")}
            className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
          >
            الاتجاه: {direction.toUpperCase()}
          </button>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs">
            {(["compact", "comfortable", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  density === d
                    ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm font-semibold"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {d === "compact" ? "مكثف" : d === "comfortable" ? "مريح" : "موسع"}
              </button>
            ))}
          </div>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-lg font-medium shadow-sm transition-colors"
          >
            <span>العودة للنظام</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {[
            { id: "components", label: "سجل المكونات (Components)", icon: Layers },
            { id: "tokens", label: "رموز التصميم (Design Tokens)", icon: Palette },
            { id: "flags", label: "أعلام الميزات (Feature Flags)", icon: Sliders },
            { id: "observability", label: "المراقبة والقياسات (Telemetry)", icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isCurrent
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: COMPONENTS SHOWCASE */}
        {activeTab === "components" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Section: Buttons */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">1. الأزرار والحالات التفاعلية (Buttons & States)</h2>
                <span className="text-xs text-slate-500 font-mono">density: {density}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={`bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors shadow-sm ${
                    designTokens.density[density].buttonPadding
                  }`}
                >
                  زر أساسي (Primary)
                </button>

                <button
                  type="button"
                  className={`bg-[#123D32] hover:bg-[#0E2F26] text-white rounded-xl font-medium transition-colors shadow-sm ${
                    designTokens.density[density].buttonPadding
                  }`}
                >
                  زمردي (Brand Emerald)
                </button>

                <button
                  type="button"
                  className={`bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-medium transition-colors border border-slate-200 dark:border-slate-700 ${
                    designTokens.density[density].buttonPadding
                  }`}
                >
                  ثانوي (Secondary)
                </button>

                <button
                  type="button"
                  className={`border border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl font-medium transition-colors ${
                    designTokens.density[density].buttonPadding
                  }`}
                >
                  محدد (Outline)
                </button>

                <button
                  type="button"
                  className={`bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40 rounded-xl font-medium transition-colors ${
                    designTokens.density[density].buttonPadding
                  }`}
                >
                  تحذيري (Destructive)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBtnLoading(true);
                    setTimeout(() => setBtnLoading(false), 2000);
                  }}
                  disabled={btnLoading}
                  className={`bg-purple-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all ${
                    designTokens.density[density].buttonPadding
                  } ${btnLoading ? "opacity-75 cursor-wait" : ""}`}
                >
                  {btnLoading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{btnLoading ? "جار المعالجة..." : "انقر لتجربة التحميل"}</span>
                </button>
              </div>
            </div>

            {/* Section: Semantic Badges */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">2. شارات الحالة والأولويات (Semantic Badges & Indicators)</h2>
              <div className="flex flex-wrap items-center gap-3">
                {Object.entries(designTokens.semantic).map(([key, item]) => (
                  <div
                    key={key}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${item.badge}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                    <span>{item.label}</span>
                    <span className="text-[10px] opacity-60 font-mono">({item.enLabel})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section: KPI Stats Cards */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">3. بطاقات المؤشرات التشغيلية (KPI Stat Cards)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "إجمالي المهام", value: "192", delta: "+12%", deltaType: "up", note: "هذا الشهر" },
                  { title: "قيد التنفيذ", value: "28", delta: "+7%", deltaType: "up", note: "موزعة على 4 فرق" },
                  { title: "مكتملة", value: "66", delta: "+18%", deltaType: "up", note: "ضمن المدة المحددة" },
                  { title: "متأخرة", value: "22", delta: "-29%", deltaType: "down", note: "انخفاض التأخير" },
                ].map((kpi, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span>{kpi.title}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          kpi.deltaType === "up"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                        }`}
                      >
                        {kpi.delta}
                      </span>
                    </div>
                    <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {kpi.value}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">{kpi.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section: Form Inputs */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">4. حقول الإدخال والبحث (Inputs & Selectors)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                    عنوان الإجراء / التذكرة
                  </label>
                  <input
                    type="text"
                    defaultValue="مراجعة الخادم والشبكة"
                    className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${
                      designTokens.density[density].inputPadding
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                    القسم المعني
                  </label>
                  <select
                    className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${
                      designTokens.density[density].inputPadding
                    }`}
                  >
                    <option>تقنية المعلومات (IT Operations)</option>
                    <option>الأمن السيبراني (Cybersecurity)</option>
                    <option>إدارة البنية التحتية</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                    الأولوية المعتمدة
                  </label>
                  <select
                    className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${
                      designTokens.density[density].inputPadding
                    }`}
                  >
                    <option>حرج جداً (Critical - P1)</option>
                    <option>عاجل (Urgent - P2)</option>
                    <option>متوسط (Medium - P3)</option>
                    <option>منخفض (Low - P4)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DESIGN TOKENS */}
        {activeTab === "tokens" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Color Palette */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">لوحة ألوان العلامة التجارية (Brand & Palette Tokens)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {Object.entries(designTokens.brand).map(([name, hex]) => (
                  <div key={name} className="flex flex-col gap-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="w-full h-14 rounded-lg shadow-inner" style={{ backgroundColor: hex }} />
                    <span className="text-xs font-semibold capitalize text-slate-800 dark:text-slate-200">{name}</span>
                    <span className="text-[11px] font-mono text-slate-400">{hex}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Typography Scale */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">مقياس الخطوط (Typography Hierarchy)</h2>
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">خط الواجهة العربية:</div>
                  <div className="font-semibold text-lg" style={{ fontFamily: designTokens.typography.fonts.arabic }}>
                    أبجد هوز حطي كلمن — نظام إدارة عمليات تقنية المعلومات الموحد
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  {Object.entries(designTokens.typography.sizes).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <span className="text-purple-600 dark:text-purple-400 font-bold">{key}</span>
                      <span className="text-slate-500">fontSize: {val.fontSize} / line: {val.lineHeight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Spacing & Radii */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold mb-4">أنصاف الأقطار والشبكة (Corner Radii & Grid)</h2>
              <div className="flex flex-wrap items-center gap-4">
                {Object.entries(designTokens.radii).map(([name, r]) => (
                  <div
                    key={name}
                    className="w-20 h-20 border-2 border-purple-500/40 bg-purple-50 dark:bg-purple-950/20 flex flex-col items-center justify-center text-[10px] text-slate-600 dark:text-slate-300 font-mono"
                    style={{ borderRadius: r }}
                  >
                    <span>{name}</span>
                    <span className="text-purple-500">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FEATURE FLAGS */}
        {activeTab === "flags" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">إدارة أعلام الميزات (Developer Feature Flags)</h2>
                  <p className="text-xs text-slate-500">
                    التحكم في أدوات التطوير المباشرة محلياً بدون إعادة تشغيل السيرفر
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  {
                    key: "visualEditing" as const,
                    title: "مفتش الواجهة والتعديل المرئي (React Grab)",
                    desc: "يتيح فحص أي عنصر بالصفحة وتعديل فئات Tailwind ومحتوى النصوص في المتصفح ونسخ كود الـ JSX مباشرة (اختصار: Ctrl+Shift+E).",
                  },
                  {
                    key: "reactScan" as const,
                    title: "مراقبة إعادة التصيير (React Scan)",
                    desc: "يسلط الضوء على المكونات التي تعيد رسم نفسها بشكل غير ضروري لتتبع الأداء المباشر.",
                  },
                  {
                    key: "mswMocking" as const,
                    title: "خادم المحاكاة المحلي (Mock Service Worker)",
                    desc: "يحاكي استجابات الـ API محلياً لاختبار الواجهة في سيناريوهات عدم الاتصال أو فك الارتباط.",
                  },
                  {
                    key: "perfMonitor" as const,
                    title: "شريط قياس الأداء الفوري (Web Vitals / Latency Pill)",
                    desc: "يعرض معدل الإطارات (FPS)، سرعة استجابة السيرفر، وحجم الذاكرة المستهلكة في زاوية الشاشة.",
                  },
                  {
                    key: "densitySelector" as const,
                    title: "محدد كثافة البيانات (UI Density Selector)",
                    desc: "تفعيل التحكم في الكثافة (مكثف، مريح، متسع) عبر الجداول والبطاقات.",
                  },
                ].map((item) => (
                  <div key={item.key} className="py-4 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFlag(item.key)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        flags[item.key] ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          flags[item.key] ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: OBSERVABILITY & TELEMETRY */}
        {activeTab === "observability" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">حالة المراقبة وقياسات المنصة (OpenTelemetry & Metrics)</h2>
                  <p className="text-xs text-slate-500">
                    بيانات حية مباشرة من واجهة القياسات المحلية <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/api/v1/metrics</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchMetrics}
                  className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${metricsLoading ? "animate-spin" : ""}`} />
                  <span>تحديث القياسات</span>
                </button>
              </div>

              {metricsData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                      <div className="text-xs text-slate-500">الحالة التشغيلية</div>
                      <div className="text-xl font-bold text-emerald-600 mt-1 capitalize">
                        {metricsData.status || "healthy"}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                      <div className="text-xs text-slate-500">إجمالي الطلبات (Total Requests)</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        {metricsData.requests_total ?? metricsData.metrics?.requests_total ?? "—"}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                      <div className="text-xs text-slate-500">متوسط زمن الاستجابة</div>
                      <div className="text-xl font-bold text-purple-600 mt-1">
                        {metricsData.avg_latency_ms ? `${metricsData.avg_latency_ms} ms` : "—"}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                      <div className="text-xs text-slate-500">استهلاك الذاكرة</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        {metricsData.memory_usage_mb ? `${metricsData.memory_usage_mb} MB` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-500 mb-1">حمولة الـ JSON الخام المسترجعة:</div>
                    <pre dir="ltr" className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-60 border border-slate-800">
                      {JSON.stringify(metricsData, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">
                  اضغط على "تحديث القياسات" لقراءة المؤشرات المباشرة.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
