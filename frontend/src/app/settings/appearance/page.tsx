"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Icons } from "@/components/ui/Icons";
import { useCustomization } from "@/context/CustomizationContext";

const ARABIC_FONTS = [
  "IBM Plex Sans Arabic",
  "Cairo",
  "Tajawal",
  "Noto Sans Arabic",
  "Almarai",
];

const ENGLISH_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "DM Sans",
  "Nunito",
];

const DENSITY_OPTIONS = [
  { value: "compact", label: "مضغوط (Compact)", desc: "أقصى استخدام للمساحة، مناسب للشاشات الصغيرة" },
  { value: "comfortable", label: "مريح (Comfortable)", desc: "الافتراضي — توازن بين الوضوح والكثافة" },
  { value: "spacious", label: "مريح (Spacious)", desc: "مسافات أكبر، مناسب لشاشات العرض الكبيرة" },
] as const;

const BORDER_RADIUS_OPTIONS = [
  { value: "none", label: "بدون تقريب", preview: "0px" },
  { value: "sm", label: "تقريب خفيف", preview: "6px" },
  { value: "rounded", label: "تقريب معتدل (افتراضي)", preview: "12px" },
  { value: "lg", label: "تقريب كامل", preview: "16px" },
] as const;

export default function AppearancePage() {
  const {
    theme, colors, typography, density, borderRadius, sidebarWidth,
    setTheme, setColors, setTypography, setDensity, setBorderRadius, setSidebarWidth,
    savePreferences, resetPreferences,
  } = useCustomization();

  // Local draft state (apply only on Save)
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftColors, setDraftColors] = useState(colors);
  const [draftTypography, setDraftTypography] = useState(typography);
  const [draftDensity, setDraftDensity] = useState(density);
  const [draftRadius, setDraftRadius] = useState(borderRadius);
  const [draftSidebarWidth, setDraftSidebarWidth] = useState(sidebarWidth);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [resetting, setResetting] = useState(false);

  // Sync drafts when context loads/changes from server
  useEffect(() => { setDraftTheme(theme); }, [theme]);
  useEffect(() => { setDraftColors(colors); }, [colors]);
  useEffect(() => { setDraftTypography(typography); }, [typography]);
  useEffect(() => { setDraftDensity(density); }, [density]);
  useEffect(() => { setDraftRadius(borderRadius); }, [borderRadius]);
  useEffect(() => { setDraftSidebarWidth(sidebarWidth); }, [sidebarWidth]);

  // Live preview: apply drafts to context immediately as user changes them
  const handleColorChange = (key: keyof typeof colors, value: string) => {
    const updated = { ...draftColors, [key]: value };
    setDraftColors(updated);
    setColors(updated); // live preview
  };

  const handleThemeChange = (t: "light" | "dark" | "system") => {
    setDraftTheme(t);
    setTheme(t);
  };

  const handleDensityChange = (d: typeof density) => {
    setDraftDensity(d);
    setDensity(d);
  };

  const handleRadiusChange = (r: typeof borderRadius) => {
    setDraftRadius(r);
    setBorderRadius(r);
  };

  const handleSidebarWidthChange = (w: number) => {
    setDraftSidebarWidth(w);
    setSidebarWidth(w);
  };

  const handleTypographyChange = (key: keyof typeof typography, value: string) => {
    const updated = { ...draftTypography, [key]: value } as typeof typography;
    setDraftTypography(updated);
    setTypography(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      await savePreferences();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "فشل حفظ إعدادات المظهر");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Revert context back to what it was before drafts
    setTheme(theme);
    setColors(colors);
    setTypography(typography);
    setDensity(density);
    setBorderRadius(borderRadius);
    setSidebarWidth(sidebarWidth);
    setDraftTheme(theme);
    setDraftColors(colors);
    setDraftTypography(typography);
    setDraftDensity(density);
    setDraftRadius(borderRadius);
    setDraftSidebarWidth(sidebarWidth);
  };

  const handleReset = async () => {
    if (!confirm("هل أنت متأكد من استعادة الإعدادات الافتراضية؟ سيتم حذف جميع تخصيصاتك الحالية.")) return;
    setResetting(true);
    try {
      await resetPreferences();
    } catch (err: any) {
      alert(err?.message || "فشل استعادة الإعدادات الافتراضية");
    } finally {
      setResetting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icons.Settings size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">إعدادات المظهر والواجهة</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تخصيص السمة، الألوان، الخطوط، الكثافة البصرية، وعرض الشريط الجانبي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              إلغاء
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl transition"
            >
              {resetting ? "جاري الاستعادة..." : "استعادة الافتراضي"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-white hover:bg-primary/90 rounded-xl transition shadow-sm"
            >
              {saved ? (
                <>
                  <Icons.Check size={16} />
                  <span>تم الحفظ!</span>
                </>
              ) : (
                <>
                  <Icons.Download size={16} />
                  <span>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {saveError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm font-semibold flex items-center gap-2 border border-red-200 dark:border-red-800">
            <Icons.AlertCircle size={16} />
            {saveError}
          </div>
        )}

        {/* Theme Mode */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Eye size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">سمة العرض (Theme)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`p-4 rounded-xl border-2 text-right transition flex flex-col gap-2 ${
                  draftTheme === t
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="text-2xl mb-1">
                  {t === "light" ? "☀️" : t === "dark" ? "🌙" : "🌓"}
                </div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  {t === "light" ? "فاتح (Light)" : t === "dark" ? "داكن (Dark)" : "تلقائي (System)"}
                </div>
                <div className="text-xs text-slate-400">
                  {t === "light"
                    ? "خلفية بيضاء فاتحة دائماً"
                    : t === "dark"
                    ? "خلفية داكنة للحماية من الوهج"
                    : "يتبع إعداد نظام التشغيل"}
                </div>
                {draftTheme === t && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-primary font-semibold">
                    <Icons.Check size={14} />
                    <span>محدد</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-primary to-[#C5A46D]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">لوحة الألوان (Color Palette)</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { key: "primary" as const, label: "اللون الرئيسي", hint: "شريط التنقل والأزرار" },
              { key: "secondary" as const, label: "اللون الثانوي", hint: "العناصر التفاعلية والشارات" },
              { key: "background" as const, label: "لون الخلفية", hint: "خلفية الصفحات الرئيسية" },
              { key: "surface" as const, label: "سطح البطاقات", hint: "خلفية البطاقات والأجزاء" },
              { key: "accent" as const, label: "لون التأكيد (Accent)", hint: "الذهبي للعناصر المميزة" },
            ].map(({ key, label, hint }) => (
              <div key={key} className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draftColors[key]}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={draftColors[key]}
                      onChange={(e) => {
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                          handleColorChange(key, e.target.value);
                        }
                      }}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:outline-none"
                      maxLength={7}
                      placeholder="#123456"
                    />
                  </div>
                </div>
                <div className="h-8 rounded-lg border border-slate-200 dark:border-slate-700" style={{ backgroundColor: draftColors[key] }} />
                <p className="text-[11px] text-slate-400 leading-relaxed">{hint}</p>
              </div>
            ))}

            {/* Reset to Investor Gate defaults */}
            <div className="flex flex-col justify-end">
              <button
                onClick={() => {
                  const defaults = {
                    primary: "#123D32",
                    secondary: "#187A5A",
                    background: "#F5F7F8",
                    surface: "#FFFFFF",
                    accent: "#C5A46D",
                  };
                  setDraftColors(defaults);
                  setColors(defaults);
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-center"
              >
                استعادة ألوان Investor Gate
              </button>
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.FileText size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">إعدادات الخطوط (Typography)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Arabic Font */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                خط العربية
              </label>
              <select
                value={draftTypography.arabicFont}
                onChange={(e) => handleTypographyChange("arabicFont", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {ARABIC_FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <div
                className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300"
                style={{ fontFamily: `'${draftTypography.arabicFont}', sans-serif` }}
              >
                مثال: مرحباً بكم في نظام Investor Gate للعمليات التقنية المتكاملة.
              </div>
            </div>

            {/* English Font */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                خط الإنجليزية والأرقام
              </label>
              <select
                value={draftTypography.englishFont}
                onChange={(e) => handleTypographyChange("englishFont", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {ENGLISH_FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <div
                className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300"
                style={{ fontFamily: `'${draftTypography.englishFont}', sans-serif` }}
              >
                Example: Investor Gate IT Operations System 2026.
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                حجم الخط الأساسي
              </label>
              <div className="flex gap-2">
                {(["small", "medium", "large"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleTypographyChange("fontSize", s)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition ${
                      draftTypography.fontSize === s
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {s === "small" ? "صغير" : s === "medium" ? "متوسط (افتراضي)" : "كبير"}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                وزن / سُمك الخط
              </label>
              <div className="flex gap-2">
                {(["normal", "medium", "bold"] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => handleTypographyChange("fontWeight", w)}
                    className={`flex-1 py-2 text-xs rounded-lg border-2 transition ${
                      draftTypography.fontWeight === w
                        ? "border-primary bg-primary/5 text-primary font-bold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                    style={{ fontWeight: w === "normal" ? 400 : w === "medium" ? 500 : 700 }}
                  >
                    {w === "normal" ? "عادي" : w === "medium" ? "متوسط" : "سميك"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* UI Density */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Filter size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">كثافة الواجهة (UI Density)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DENSITY_OPTIONS.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => handleDensityChange(value)}
                className={`p-4 rounded-xl border-2 text-right transition ${
                  draftDensity === value
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">{label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</div>
                {draftDensity === value && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary font-semibold">
                    <Icons.Check size={14} />
                    <span>محدد</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.CheckSquare size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">تقريب زوايا المكونات (Border Radius)</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BORDER_RADIUS_OPTIONS.map(({ value, label, preview }) => (
              <button
                key={value}
                onClick={() => handleRadiusChange(value)}
                className={`p-4 border-2 transition flex flex-col items-center gap-3 ${
                  draftRadius === value
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                }`}
                style={{ borderRadius: preview }}
              >
                <div
                  className="w-12 h-12 bg-primary/20 dark:bg-primary/30"
                  style={{ borderRadius: preview }}
                />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">{label}</div>
                <code className="text-[10px] text-slate-400">{preview}</code>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar Width */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Infrastructure size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">عرض الشريط الجانبي</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-700 dark:text-slate-300">عرض الشريط الجانبي الموسّع</label>
              <span className="text-sm font-bold text-primary">{draftSidebarWidth} px</span>
            </div>
            <input
              type="range"
              min={200}
              max={320}
              step={8}
              value={draftSidebarWidth}
              onChange={(e) => handleSidebarWidthChange(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>ضيق (200px)</span>
              <span>افتراضي (256px)</span>
              <span>واسع (320px)</span>
            </div>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Eye size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">معاينة حية للتغييرات</h2>
          </div>

          <div
            className="p-5 rounded-xl border-2 space-y-3"
            style={{
              backgroundColor: draftColors.background,
              borderColor: draftColors.secondary,
              borderRadius: draftRadius === "none" ? "0" : draftRadius === "sm" ? "6px" : draftRadius === "lg" ? "16px" : "12px",
            }}
          >
            <div
              className="text-base font-bold"
              style={{
                color: draftColors.primary,
                fontFamily: `'${draftTypography.arabicFont}', sans-serif`,
              }}
            >
              عنوان النموذج — Investor Gate IT Operations
            </div>
            <p
              className="text-sm"
              style={{
                color: "#334155",
                fontFamily: `'${draftTypography.arabicFont}', sans-serif`,
                fontSize: draftTypography.fontSize === "small" ? "12px" : draftTypography.fontSize === "large" ? "16px" : "14px",
              }}
            >
              هذا نص تجريبي لمعاينة شكل الخطوط والألوان في الواجهة العربية الكاملة.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-4 py-2 text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor: draftColors.primary, borderRadius: draftRadius === "none" ? "0" : "8px" }}
              >
                زر رئيسي
              </button>
              <button
                className="px-4 py-2 text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor: draftColors.secondary, borderRadius: draftRadius === "none" ? "0" : "8px" }}
              >
                زر ثانوي
              </button>
              <span
                className="px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: draftColors.accent, borderRadius: draftRadius === "none" ? "0" : "20px" }}
              >
                شارة ذهبية
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="sticky bottom-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {saved
              ? "✅ تم حفظ جميع إعدادات المظهر بنجاح وتطبيقها على حسابك"
              : "التغييرات محفوظة مؤقتاً — اضغط «حفظ الإعدادات» لتثبيتها على الخادم"}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary text-white hover:bg-primary/90 rounded-xl transition shadow-sm disabled:opacity-50 shrink-0"
          >
            <Icons.Download size={16} />
            <span>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</span>
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
