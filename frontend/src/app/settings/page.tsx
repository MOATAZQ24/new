"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  SettingsIcon,
  LockIcon,
  UserIcon,
  BuildingIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  Icons,
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/context/ToastContext";

interface IntegrationItem {
  id: string;
  service_name: string;
  display_name: string;
  is_enabled: boolean;
  status: string;
}

const ACCENT_SWATCHES = [
  { color: "#187A5A", label: "الأخضر المؤسسي" },
  { color: "#D97706", label: "العنبر الذهبي" },
  { color: "#2563EB", label: "الأزرق القياسي" },
  { color: "#E11D48", label: "الأحمر" },
  { color: "#7C3AED", label: "البنفسجي" },
];

export default function SettingsPage() {
  const { user, activeCompanyId } = useAuth();
  const { draft, setDraft, save } = useWorkspace();
  const theme = draft.appearance.theme;
  const colors = draft.appearance;
  const toast = useToast();

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [dbStatusLabel, setDbStatusLabel] = useState("متصل");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  const canManageIntegrations = Boolean(
    user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager")
  );

  useEffect(() => {
    if (!user) return;
    if (canManageIntegrations) {
      api
        .get<IntegrationItem[]>("/integrations")
        .then((res) => setIntegrations(res.data || []))
        .catch(() => {});
    }
    if (user.is_superadmin) {
      api
        .get<{ database?: { status?: string; latency_ms?: number } }>("/system/health")
        .then((res) => {
          const lat = res.data?.database?.latency_ms;
          setDbStatusLabel(typeof lat === "number" ? `متصل (${lat}ms)` : "متصل");
        })
        .catch(() => {});
    }
  }, [user, activeCompanyId, canManageIntegrations]);

  const isServiceEnabled = (service: string) => {
    const found = integrations.find((i) => i.service_name === service);
    return Boolean(found?.is_enabled);
  };

  const handleToggleIntegration = async (service: string) => {
    if (!canManageIntegrations) {
      toast.info("تعديل إعدادات التكاملات متاح لمدير النظام فقط");
      return;
    }
    const nextEnabled = !isServiceEnabled(service);
    try {
      await api.put(`/integrations/${service}`, { is_enabled: nextEnabled });
      setIntegrations((prev) =>
        prev.map((it) => (it.service_name === service ? { ...it, is_enabled: nextEnabled } : it))
      );
      toast.success(`تم ${nextEnabled ? "تفعيل" : "إيقاف"} التكامل بنجاح`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث حالة التكامل");
    }
  };

  const handleSelectTheme = (nextTheme: "light" | "dark" | "system") => {
    const nextConfig = {
      ...draft,
      appearance: { ...draft.appearance, theme: nextTheme },
    };
    setDraft(nextConfig);
    void save(nextConfig).catch(() => {});
    toast.success("تم تحديث مظهر النظام");
  };

  const handleSelectSwatch = (hex: string) => {
    const nextConfig = {
      ...draft,
      appearance: { ...draft.appearance, secondary: hex },
    };
    setDraft(nextConfig);
    void save(nextConfig).catch(() => {});
    toast.success("تم تحديث اللون الرئيسي للواجهة");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccess(null);
    setPassError(null);

    if (newPassword !== confirmPassword) {
      setPassError("كلمتا المرور الجديدتان غير متطابقتين");
      return;
    }

    if (newPassword.length < 8) {
      setPassError("يجب أن تكون كلمة المرور 8 خانات على الأقل");
      return;
    }

    try {
      setPassLoading(true);
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPassSuccess("تم تغيير كلمة المرور بنجاح!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء تغيير كلمة المرور";
      setPassError(errorMsg);
    } finally {
      setPassLoading(false);
    }
  };

  const todayArabic = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const quickTiles = [
    {
      href: "/settings/branding",
      title: "إعدادات عامة",
      desc: "بيانات النظام، الشعار، والمظهر",
      icon: <Icons.Sliders size={22} className="text-[#187A5A]" />,
    },
    {
      href: "/companies",
      title: "الأقسام",
      desc: "تعريف أقسام العمل وتوزيعها",
      icon: <Icons.Companies size={22} className="text-[#187A5A]" />,
    },
    {
      href: "/companies",
      title: "الشركات والفروع",
      desc: "إدارة بيانات الشركات والفروع",
      icon: <BuildingIcon className="w-6 h-6 text-[#187A5A]" />,
    },
    {
      href: "/users",
      title: "المستخدمون والصلاحيات",
      desc: "إضافة المستخدمين، تحديد الأدوار والصلاحيات",
      icon: <Icons.Users size={22} className="text-[#187A5A]" />,
    },
    {
      href: "#password-security",
      title: "سياسات النظام",
      desc: "كلمة المرور، مدة الجلسة، وتسجيل الدخول",
      icon: <ShieldCheckIcon className="w-6 h-6 text-[#187A5A]" />,
    },
    {
      href: "/settings/branding",
      title: "نماذج البيانات",
      desc: "تخصيص حقول الأصول، التذاكر، والمهام",
      icon: <Icons.Subscriptions size={22} className="text-[#187A5A]" />,
    },
    {
      href: "/audit",
      title: "سجل المراجعة والرقابة",
      desc: "إدارة السجلات، الأنواع، الحالات، والأولويات",
      icon: <Icons.Audit size={22} className="text-[#187A5A]" />,
    },
    {
      href: "/settings/integrations",
      title: "الإشعارات",
      desc: "قنوات التنبيه (Telegram) وإعداداتها",
      badge: "مفعلة",
      icon: <Icons.Notifications size={22} className="text-[#187A5A]" />,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1440px] mx-auto">
        {/* Header matching Image 6 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0 mt-0.5">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">الإعدادات</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                إدارة النظام، المستخدمين، الصلاحيات، البيانات الأساسية، والتكاملات
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs self-start sm:self-center">
            <Icons.Calendar size={14} className="text-slate-500" />
            <span>{todayArabic}</span>
          </div>
        </div>

        {/* 2x4 Quick Tiles Grid matching Image 6 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {quickTiles.map((tile) => (
            <Link
              key={tile.title}
              href={tile.href}
              className="relative bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-[#187A5A] hover:shadow-md transition-all flex flex-col items-center text-center gap-2.5 group"
            >
              {tile.badge && (
                <span className="absolute top-3 inset-inline-end-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                  {tile.badge}
                </span>
              )}
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 group-hover:bg-[#123D32]/10 flex items-center justify-center transition-colors">
                {tile.icon}
              </div>
              <div className="text-sm font-bold text-slate-900 group-hover:text-[#123D32]">
                {tile.title}
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                {tile.desc}
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom 3 Panels matching Image 6: معلومات النظام | التكاملات | مظهر النظام */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Card 1: System Info */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icons.Info size={16} className="text-[#187A5A]" />
                <span>معلومات النظام</span>
              </h2>
              {user?.is_superadmin && (
                <Link href="/settings/system" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                  صيانة DR ←
                </Link>
              )}
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">إصدار النظام</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#123D32] font-mono font-bold">
                  v2.0 (MVP)
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">قاعدة البيانات</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{dbStatusLabel}</span>
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">حالة الخدمات</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold">
                  يعمل بشكل طبيعي
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">الحساب النشط</span>
                <span className="font-bold text-slate-900">{user?.employee?.full_name || user?.username}</span>
              </div>
            </div>
          </section>

          {/* Card 2: Integrations */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icons.Globe size={16} className="text-[#187A5A]" />
                <span>التكاملات</span>
              </h2>
              <Link href="/settings/integrations" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                إدارة متقدمة ←
              </Link>
            </div>

            <div className="space-y-3">
              {[
                { key: "telegram", title: "Telegram", sub: "إرسال التنبيهات والمهام", badgeCls: "bg-sky-500 text-white" },
                { key: "n8n", title: "Google Calendar / الأتمتة", sub: "مزامنة المواعيد النهائية", badgeCls: "bg-blue-600 text-white" },
                { key: "email", title: "البريد الإلكتروني", sub: "إشعارات وتقارير النظام", badgeCls: "bg-amber-500 text-white" },
              ].map((item) => {
                const enabled = isServiceEnabled(item.key);
                return (
                  <div
                    key={item.key}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.badgeCls}`}>
                        <Icons.Send size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">{item.sub}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`تبديل تكامل ${item.title}`}
                      onClick={() => void handleToggleIntegration(item.key)}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                        enabled ? "bg-[#187A5A]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                          enabled ? "-translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Card 3: System Appearance (Live Wired to CustomizationContext) */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icons.Monitor size={16} className="text-[#187A5A]" />
                <span>مظهر النظام</span>
              </h2>
              <Link href="/settings/appearance" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                تخصيص كامل ←
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light" as const, label: "فاتح", icon: <Icons.Sun size={16} /> },
                { id: "dark" as const, label: "داكن", icon: <Icons.Moon size={16} /> },
                { id: "system" as const, label: "تلقائي", icon: <Icons.Monitor size={16} /> },
              ].map((opt) => {
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectTheme(opt.id)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      active
                        ? "border-[#187A5A] bg-emerald-50/70 text-[#123D32]"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-xs font-bold text-slate-700">اللون الرئيسي</div>
              <div className="flex items-center gap-2.5">
                {ACCENT_SWATCHES.map((swatch) => {
                  const active = colors.secondary.toLowerCase() === swatch.color.toLowerCase();
                  return (
                    <button
                      key={swatch.color}
                      type="button"
                      aria-label={swatch.label}
                      title={swatch.label}
                      onClick={() => handleSelectSwatch(swatch.color)}
                      style={{ backgroundColor: swatch.color }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform cursor-pointer ${
                        active ? "ring-2 ring-offset-2 ring-[#123D32] scale-110" : "opacity-85 hover:opacity-100"
                      }`}
                    >
                      {active && <Icons.Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Password & User Security Section */}
        <div id="password-security" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-[#187A5A]">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">{user?.username || "المستخدم"}</h2>
                <p className="text-xs text-slate-500">{user?.email || "لا يوجد بريد مسجل"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 block mb-1">اسم الموظف</span>
                <strong className="text-slate-900">{user?.employee?.full_name || "—"}</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 block mb-1">المسمى الوظيفي</span>
                <span className="text-slate-800">{user?.employee?.job_title || "—"}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {user?.roles?.map((r) => (
                <span key={r} className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#187A5A] text-white">
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
                <LockIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">تغيير كلمة المرور</h2>
                <p className="text-xs text-slate-500">تحديث كلمة المرور المشفرة بتقنية Argon2id</p>
              </div>
            </div>

            {passSuccess && (
              <div role="status" aria-live="polite" className="p-3 mb-4 text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4" />
                {passSuccess}
              </div>
            )}

            {passError && (
              <div role="alert" className="p-3 mb-4 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4" />
                {passError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-slate-700 mb-1">
                  كلمة المرور الحالية <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="current-password"
                  autoComplete="current-password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#187A5A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-password" className="block text-xs font-medium text-slate-700 mb-1">
                    كلمة المرور الجديدة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="new-password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#187A5A]"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-new-password" className="block text-xs font-medium text-slate-700 mb-1">
                    تأكيد كلمة المرور <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="confirm-new-password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#187A5A]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={passLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {passLoading ? "جاري الحفظ..." : "تحديث كلمة المرور"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
