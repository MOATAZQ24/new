"use client";

import React, { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Icons } from "@/components/ui/Icons";
import { useCustomization } from "@/context/CustomizationContext";
import { useAuth } from "@/context/AuthContext";

export default function BrandingPage() {
  const { companyBranding, updateBranding, removeLogo } = useCustomization();
  const { activeCompany, activeCompanyId } = useAuth();

  // Form state
  const [brandNameAr, setBrandNameAr] = useState("");
  const [brandNameEn, setBrandNameEn] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#123D32");
  const [secondaryColor, setSecondaryColor] = useState("#187A5A");
  const [accentColor, setAccentColor] = useState("#C5A46D");
  const [enforceTheme, setEnforceTheme] = useState(false);

  // Logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  // Populate form from existing branding
  useEffect(() => {
    if (companyBranding) {
      setBrandNameAr(companyBranding.brand_name_ar || (activeCompany as any)?.company_name_ar || "");
      setBrandNameEn(companyBranding.brand_name_en || (activeCompany as any)?.company_name_en || "");
      setPrimaryColor(companyBranding.primary_color || "#123D32");
      setSecondaryColor(companyBranding.secondary_color || "#187A5A");
      setAccentColor(companyBranding.accent_color || "#C5A46D");
      setEnforceTheme(Boolean(companyBranding.enforce_company_theme));
    }
  }, [companyBranding, activeCompany]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate: image only, max 2MB
    if (!file.type.startsWith("image/")) {
      alert("يُسمح فقط برفع صور (PNG، JPG، SVG، WebP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("الحد الأقصى لحجم الملف هو 2 ميغابايت");
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("يُسمح فقط برفع صور");
      return;
    }
    if (file.size > 512 * 1024) {
      alert("الحد الأقصى لحجم الـ Favicon هو 512 كيلوبايت");
      return;
    }

    setFaviconFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFaviconPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    setUploadingLogo(true);
    setSaveError("");
    try {
      // Convert file to base64 data URL and store via branding PUT endpoint
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const base64DataUrl = ev.target?.result as string;
          await updateBranding({ company_logo: base64DataUrl });
          setLogoFile(null);
          setLogoPreview(null);
        } catch (err: any) {
          setSaveError(err?.message || "فشل رفع الشعار");
        } finally {
          setUploadingLogo(false);
        }
      };
      reader.onerror = () => {
        setSaveError("فشل قراءة ملف الشعار");
        setUploadingLogo(false);
      };
      reader.readAsDataURL(logoFile);
    } catch (err: any) {
      setSaveError(err?.message || "فشل رفع الشعار");
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm("هل أنت متأكد من إزالة شعار الشركة؟")) return;
    setRemovingLogo(true);
    try {
      await removeLogo();
    } catch (err: any) {
      alert(err?.message || "فشل إزالة الشعار");
    } finally {
      setRemovingLogo(false);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      await updateBranding({
        brand_name_ar: brandNameAr.trim() || null,
        brand_name_en: brandNameEn.trim() || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        enforce_company_theme: enforceTheme,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "فشل حفظ إعدادات العلامة التجارية");
    } finally {
      setSaving(false);
    }
  };

  const currentLogoUrl = logoPreview || companyBranding?.company_logo;
  const currentFaviconUrl = faviconPreview || companyBranding?.favicon_url;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icons.Building size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                علامة الشركة التجارية (Company Branding)
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تخصيص شعار الشركة، الألوان والهوية البصرية — معزولة بالكامل عن باقي الشركات
              </p>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm font-semibold flex items-center gap-2 border border-red-200 dark:border-red-800">
            <Icons.AlertCircle size={16} />
            {saveError}
          </div>
        )}

        {saved && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
            <Icons.CheckCircle size={16} />
            تم حفظ إعدادات العلامة التجارية بنجاح
          </div>
        )}

        {/* Logo Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Building size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">شعار الشركة (Company Logo)</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Current Logo Preview */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden">
                {currentLogoUrl ? (
                  <img
                    src={currentLogoUrl}
                    alt="شعار الشركة"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center space-y-1">
                    <Icons.Building size={36} className="mx-auto text-slate-300" />
                    <p className="text-xs text-slate-400">لا يوجد شعار</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition"
                >
                  {companyBranding?.company_logo ? "استبدال الشعار" : "رفع شعار"}
                </button>
                {companyBranding?.company_logo && (
                  <button
                    onClick={handleRemoveLogo}
                    disabled={removingLogo}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg transition"
                  >
                    {removingLogo ? "جاري الإزالة..." : "إزالة"}
                  </button>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            {/* Upload Info */}
            <div className="flex-1 space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">متطلبات الشعار المثالي:</div>
                <div className="flex items-center gap-2">
                  <Icons.Check size={14} className="text-emerald-600 shrink-0" />
                  <span>الصيغ المدعومة: PNG، SVG، WebP، JPEG</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check size={14} className="text-emerald-600 shrink-0" />
                  <span>الحجم الأقصى: 2 ميغابايت</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check size={14} className="text-emerald-600 shrink-0" />
                  <span>الأبعاد المثالية: 400 × 200 بكسل أو نسبة 2:1</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check size={14} className="text-emerald-600 shrink-0" />
                  <span>يوصى باستخدام SVG للمرونة والوضوح على جميع الشاشات</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check size={14} className="text-emerald-600 shrink-0" />
                  <span>الخلفية الشفافة (PNG/SVG) للعرض الأفضل في الأوضاع الداكنة والفاتحة</span>
                </div>
              </div>

              {logoFile && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
                  <div className="text-xs text-amber-900 dark:text-amber-300">
                    <div className="font-bold">ملف جاهز للرفع:</div>
                    <div>{logoFile.name} ({(logoFile.size / 1024).toFixed(1)} KB)</div>
                  </div>
                  <button
                    onClick={handleUploadLogo}
                    disabled={uploadingLogo}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
                  >
                    {uploadingLogo ? "جاري الرفع..." : "رفع الآن"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Favicon Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Icons.Globe size={20} className="text-primary" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">أيقونة المتصفح (Favicon)</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden">
                {currentFaviconUrl ? (
                  <img
                    src={currentFaviconUrl}
                    alt="Favicon"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="text-center space-y-1">
                    <Icons.Globe size={28} className="mx-auto text-slate-300" />
                    <p className="text-[10px] text-slate-400">لا يوجد</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => faviconInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
              >
                رفع Favicon
              </button>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/x-icon,image/svg+xml"
                className="hidden"
                onChange={handleFaviconChange}
              />
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-700 dark:text-slate-300">متطلبات Favicon:</div>
              <div>• الصيغ: ICO، PNG، SVG</div>
              <div>• الأبعاد: 32×32 أو 64×64 بكسل (مربع)</div>
              <div>• الحجم الأقصى: 512 كيلوبايت</div>
              <div className="text-amber-600 dark:text-amber-400 font-medium mt-2">
                ملاحظة: تطبيق Favicon يتطلب إعادة تشغيل الخادم (يتم تحديثه عند النشر التالي).
              </div>
            </div>
          </div>
        </div>

        {/* Branding Colors & Names */}
        <form onSubmit={handleSaveBranding} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <Icons.Building size={20} className="text-primary" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">معلومات العلامة التجارية</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم الشركة بالعربية (Brand Name AR)
                </label>
                <input
                  type="text"
                  value={brandNameAr}
                  onChange={(e) => setBrandNameAr(e.target.value)}
                  placeholder="Investor Gate للاستثمار"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم الشركة بالإنجليزية (Brand Name EN)
                </label>
                <input
                  type="text"
                  value={brandNameEn}
                  onChange={(e) => setBrandNameEn(e.target.value)}
                  placeholder="Investor Gate Investment"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Company Brand Colors */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">ألوان العلامة التجارية</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: "primary" as const, label: "اللون الرئيسي", value: primaryColor, setter: setPrimaryColor },
                  { key: "secondary" as const, label: "اللون الثانوي", value: secondaryColor, setter: setSecondaryColor },
                  { key: "accent" as const, label: "لون التأكيد", value: accentColor, setter: setAccentColor },
                ].map(({ key, label, value, setter }) => (
                  <div key={key} className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700 p-0.5"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setter(e.target.value);
                        }}
                        maxLength={7}
                        className="flex-1 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div className="h-6 rounded-md border border-slate-200 dark:border-slate-700" style={{ backgroundColor: value }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Enforce company theme */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <input
                type="checkbox"
                id="enforceTheme"
                checked={enforceTheme}
                onChange={(e) => setEnforceTheme(e.target.checked)}
                className="rounded text-primary focus:ring-primary w-4 h-4"
              />
              <label htmlFor="enforceTheme" className="flex flex-col cursor-pointer">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  تطبيق ألوان الشركة بشكل إلزامي على جميع مستخدميها
                </span>
                <span className="text-xs text-slate-400 mt-0.5">
                  عند التفعيل لن يتمكن الموظفون من تغيير ألوان النظام بشكل شخصي
                </span>
              </label>
            </div>
          </div>

          {/* Branding Preview */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <Icons.Eye size={20} className="text-primary" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">معاينة العلامة التجارية</h2>
            </div>

            {/* Simulated topnav with branding */}
            <div
              className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
              style={{ backgroundColor: primaryColor }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {currentLogoUrl ? (
                    <img
                      src={currentLogoUrl}
                      alt="Logo Preview"
                      className="h-8 w-auto object-contain"
                    />
                  ) : (
                    <div
                      className="h-8 w-24 rounded-lg flex items-center justify-center text-xs font-bold text-white/80"
                      style={{ backgroundColor: `${primaryColor}80` }}
                    >
                      {brandNameAr || brandNameEn || "الشعار"}
                    </div>
                  )}
                  <div className="text-white font-bold text-sm">
                    {brandNameAr || brandNameEn || "اسم الشركة"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: secondaryColor }}
                  />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                </div>
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: secondaryColor }}
                >
                  لوحة التحكم
                </div>
                <div className="px-3 py-1.5 rounded-lg text-xs text-white/70">الأصول</div>
                <div className="px-3 py-1.5 rounded-lg text-xs text-white/70">المهام</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                زر رئيسي
              </div>
              <div
                className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: secondaryColor }}
              >
                زر ثانوي
              </div>
              <div
                className="px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              >
                شارة ذهبية
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setBrandNameAr(companyBranding?.brand_name_ar || "");
                setBrandNameEn(companyBranding?.brand_name_en || "");
                setPrimaryColor(companyBranding?.primary_color || "#123D32");
                setSecondaryColor(companyBranding?.secondary_color || "#187A5A");
                setAccentColor(companyBranding?.accent_color || "#C5A46D");
                setEnforceTheme(Boolean(companyBranding?.enforce_company_theme));
              }}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              إلغاء التغييرات
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary text-white hover:bg-primary/90 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              {saved ? (
                <>
                  <Icons.Check size={16} />
                  <span>تم الحفظ!</span>
                </>
              ) : (
                <>
                  <Icons.Download size={16} />
                  <span>{saving ? "جاري الحفظ..." : "حفظ إعدادات العلامة التجارية"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
