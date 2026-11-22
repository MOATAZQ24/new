"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Send,
  Calendar,
  Mail,
  Eye,
  EyeOff,
  Check,
  ShieldCheck,
  Database,
  Activity,
  Palette,
  Globe,
  Key,
  Lock,
  Sliders,
  ChevronLeft,
  User as UserLucide,
  Bell as BellLucide,
  Sparkles,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
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
import { Switch } from "@/components/ui/switch";
import { THEME_PRESETS, THEME_PRESET_MAP, ThemePresetId } from "@/lib/themes";
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

interface BackupSnapshotItem {
  filename: string;
  size_kb: number;
  created_at: string;
}

const ROLE_AR_LABELS: Record<string, string> = {
  "Super Admin": "مدير النظام العام",
  "Company Admin": "مدير الشركة",
  "IT Manager": "مدير تقنية المعلومات",
  "IT Technician": "فني تقنية المعلومات",
  Employee: "موظف",
  Auditor: "مدقق ومراجع",
};

export default function SettingsPage() {
  const { user, activeCompany, activeCompanyId } = useAuth();
  const { draft, setDraft, save, presetId, selectPreset } = useWorkspace();
  const theme = draft.appearance.theme;
  const activePreset = THEME_PRESET_MAP[presetId];
  const toast = useToast();

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [dbStatusLabel, setDbStatusLabel] = useState("متصل");
  const [lastBackupLabel, setLastBackupLabel] = useState("متاح عبر مركز الصيانة");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [mobileThemeSheetOpen, setMobileThemeSheetOpen] = useState(false);
  const [mobilePasswordSheetOpen, setMobilePasswordSheetOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

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
        .get<{ database?: { status?: string; latency_ms?: number }; backups_count?: number }>("/system/health")
        .then((res) => {
          const lat = res.data?.database?.latency_ms;
          setDbStatusLabel(typeof lat === "number" ? `متصل (${lat}ms)` : "متصل");
        })
        .catch(() => {});
      api
        .get<BackupSnapshotItem[]>("/system/backups")
        .then((res) => {
          const first = (res.data || [])[0];
          if (first?.created_at) {
            const dt = new Date(first.created_at);
            if (!Number.isNaN(dt.getTime())) {
              setLastBackupLabel(
                new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(dt)
              );
            }
          }
        })
        .catch(() => {});
    }
  }, [user, activeCompanyId, canManageIntegrations]);

  const getServiceItem = (service: string) => integrations.find((i) => i.service_name === service);

  const isServiceEnabled = (service: string) => Boolean(getServiceItem(service)?.is_enabled);

  const getServiceStateMeta = (service: string) => {
    const found = getServiceItem(service);
    if (!found) {
      return {
        label: "غير مهيأ",
        cls: "bg-slate-100 text-slate-600 border-slate-200",
      };
    }
    if (found.is_enabled && (found.status === "Connected" || found.status === "Active")) {
      return {
        label: "متصل",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
    if (found.is_enabled) {
      return {
        label: "مفعل",
        cls: "bg-sky-50 text-sky-700 border-sky-200",
      };
    }
    return {
      label: "غير مفعل",
      cls: "bg-slate-100 text-slate-600 border-slate-200",
    };
  };

  const handleToggleIntegration = async (service: string) => {
    if (!canManageIntegrations) {
      toast.info("تعديل إعدادات التكاملات متاح لمدير النظام فقط");
      return;
    }
    if (service === "email") {
      toast.info("يتم ضبط إعدادات البريد الإلكتروني عبر مركز التكاملات المتقدم");
      return;
    }
    const nextEnabled = !isServiceEnabled(service);
    try {
      await api.put(`/integrations/${service}`, { is_enabled: nextEnabled });
      setIntegrations((prev) => {
        const exists = prev.some((it) => it.service_name === service);
        if (!exists) {
          return [
            ...prev,
            {
              id: service,
              service_name: service,
              display_name: service,
              is_enabled: nextEnabled,
              status: nextEnabled ? "Active" : "Inactive",
            },
          ];
        }
        return prev.map((it) => (it.service_name === service ? { ...it, is_enabled: nextEnabled } : it));
      });
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
    toast.success("تم تحديث وضع الإضاءة");
  };

  const handleSelectPreset = (nextPresetId: ThemePresetId) => {
    void selectPreset(nextPresetId).catch(() => {});
    const chosen = THEME_PRESET_MAP[nextPresetId];
    toast.success(`تم تفعيل هوية ${chosen.nameAr}`);
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
      icon: <Icons.Sliders size={20} className="text-[#187A5A]" />,
    },
    {
      href: "/companies",
      title: "الأقسام",
      desc: "تعريف أقسام العمل وتوزيعها",
      icon: <Icons.Companies size={20} className="text-[#187A5A]" />,
    },
    {
      href: "/companies",
      title: "الشركات والفروع",
      desc: "إدارة بيانات الشركات والفروع",
      icon: <BuildingIcon className="w-5 h-5 text-[#187A5A]" />,
    },
    {
      href: "/users",
      title: "المستخدمون والصلاحيات",
      desc: "إضافة المستخدمين، تحديد الأدوار والصلاحيات",
      icon: <Icons.Users size={20} className="text-[#187A5A]" />,
    },
    {
      href: "#password-security",
      title: "سياسات النظام",
      desc: "كلمة المرور، مدة الجلسة، وتسجيل الدخول",
      icon: <ShieldCheckIcon className="w-5 h-5 text-[#187A5A]" />,
    },
    {
      href: "/settings/branding",
      title: "نماذج البيانات",
      desc: "تخصيص حقول الأصول، التذاكر، والمهام",
      icon: <Icons.Subscriptions size={20} className="text-[#187A5A]" />,
    },
    {
      href: "/audit",
      title: "القوائم المرجعية",
      desc: "إدارة الأنواع، الحالات، الأولويات، والفئات",
      icon: <Icons.Audit size={20} className="text-[#187A5A]" />,
    },
    {
      href: "/settings/integrations",
      title: "الإشعارات",
      desc: "قنوات التنبيه (Telegram) وإعداداتها",
      badge: "مفعلة",
      icon: <Icons.Notifications size={20} className="text-[#187A5A]" />,
    },
  ];

  const userDisplayName = user?.employee?.full_name || user?.full_name || user?.username || "المستخدم";
  const userJobTitle =
    user?.employee?.job_title || (user?.is_superadmin ? "مدير النظام العام" : "عضو فريق العمليات");
  const assignedRoles = user?.roles && user.roles.length > 0 ? user.roles : ["Employee"];
  const primaryRole = user?.is_superadmin ? "Super Admin" : assignedRoles[0];

  return (
    <DashboardLayout>
      {/* Mobile Settings View - Pixel-perfect reproduction of Reference Image 1 */}
      <div className="block lg:hidden min-h-screen bg-slate-50/60 dark:bg-slate-950 pb-24 px-4 pt-3 space-y-4">
        {/* Page Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              الإعدادات
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              إدارة حسابك وتخصيص تجربة النظام
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* 1. الحساب (Account) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <UserLucide size={15} className="text-primary" />
            <span>الحساب</span>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-primary/[0.12] dark:bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                {userDisplayName.charAt(0) || "ف"}
              </div>
              <div className="min-w-0 text-right">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {userDisplayName}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {userJobTitle}
                </div>
              </div>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </div>
        </div>

        {/* 2. المظهر (الثيم) (Theme) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <Palette size={15} className="text-primary" />
            <span>المظهر (الثيم)</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileThemeSheetOpen(true)}
            className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex items-center justify-between text-right hover:bg-slate-50 dark:hover:bg-slate-800/50 transition active:scale-99 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Theme Swatch Preview */}
              <div className="relative w-11 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <div className="w-8 h-6 rounded-lg bg-primary flex items-center justify-center text-white shadow-xs">
                  <Check size={12} strokeWidth={3} />
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  الثيم الحالي
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {activePreset?.nameAr || "الافتراضي"}
                </div>
              </div>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </button>
        </div>

        {/* 3. الإشعارات (Notifications) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <BellLucide size={15} className="text-primary" />
            <span>الإشعارات</span>
          </div>
          <Link
            href="/notifications"
            className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex items-center justify-between text-right hover:bg-slate-50 dark:hover:bg-slate-800/50 transition active:scale-99"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <BellLucide size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 text-right">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  إدارة الإشعارات
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  اختر ما تريد استلامه
                </div>
              </div>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </Link>
        </div>

        {/* 4. اللغة (Language) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <Globe size={15} className="text-primary" />
            <span>اللغة</span>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex items-center justify-between text-right">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                Aع
              </div>
              <div className="min-w-0 text-right">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  لغة النظام
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  العربية
                </div>
              </div>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </div>
        </div>

        {/* 5. الأمان (Security) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <ShieldCheck size={15} className="text-primary" />
            <span>الأمان</span>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-2xs divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
            {/* تغيير كلمة المرور */}
            <button
              type="button"
              onClick={() => setMobilePasswordSheetOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition active:scale-99 text-right cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Key size={18} strokeWidth={2.2} />
                </div>
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  تغيير كلمة المرور
                </span>
              </div>
              <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
            </button>

            {/* المصادقة الثنائية (2FA) */}
            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Lock size={18} strokeWidth={2.2} />
                </div>
                <div className="min-w-0 text-right">
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    المصادقة الثنائية (2FA)
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    تعزيز أمان حسابك
                  </div>
                </div>
              </div>
              <Switch
                checked={twoFactorEnabled}
                onCheckedChange={(val) => {
                  setTwoFactorEnabled(val);
                  toast.success(val ? "تم تفعيل المصادقة الثنائية لحسابك" : "تم تعطيل المصادقة الثنائية");
                }}
              />
            </div>
          </div>
        </div>

        {/* 6. التفضيلات (Preferences) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            <Sliders size={15} className="text-primary" />
            <span>التفضيلات</span>
          </div>
          <Link
            href="/settings/appearance"
            className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex items-center justify-between text-right hover:bg-slate-50 dark:hover:bg-slate-800/50 transition active:scale-99"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Sliders size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 text-right">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  تخصيص النظام
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  العرض، التاريخ، والمزيد
                </div>
              </div>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </Link>
        </div>
      </div>

      {/* Desktop Settings View: Unchanged */}
      <div className="hidden lg:block space-y-5 max-w-[1440px] mx-auto">
        {/* Header matching reference screenshot */}
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

          <div className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs self-start sm:self-center">
            <Icons.Calendar size={15} className="text-slate-500" />
            <span>{todayArabic}</span>
          </div>
        </div>

        {/* 2x4 Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {quickTiles.map((tile) => (
            <Link
              key={tile.title}
              href={tile.href}
              className="relative bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs hover:border-[#187A5A] hover:shadow-sm transition-all flex flex-col items-center text-center gap-2 group"
            >
              {tile.badge && (
                <span className="absolute top-3 inset-inline-end-3 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  {tile.badge}
                </span>
              )}
              <div className="w-10 h-10 rounded-xl bg-emerald-50/90 group-hover:bg-[#123D32]/10 flex items-center justify-center transition-colors">
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

        {/* Middle 3 Cards: معلومات النظام | التكاملات | مظهر النظام */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {/* Card 1: System Information */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
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

              <div className="divide-y divide-slate-100 text-xs mt-1">
                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>إصدار النظام</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#123D32] border border-emerald-200/70 font-mono font-bold text-[11px]">
                    v3.0.0 (Enterprise)
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-slate-400" />
                    <span>قاعدة البيانات</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50/80 border border-emerald-200/70 font-bold text-emerald-700 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{dbStatusLabel}</span>
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>آخر نسخة احتياطية</span>
                  </span>
                  <span className="font-semibold text-slate-800 text-[11px]">{lastBackupLabel}</span>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span>حالة الخدمات</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-bold text-[11px]">
                    يعمل بشكل طبيعي
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>المنشأة الحالية:</span>
              <div className="flex items-center gap-2">
                <strong className="text-slate-800">{activeCompany?.name_ar || "بوابة المستثمر"}</strong>
                <Link href="/about" className="font-bold text-[#187A5A] hover:underline">
                  حول النظام
                </Link>
              </div>
            </div>
          </section>

          {/* Card 2: Integrations */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icons.Globe size={16} className="text-[#187A5A]" />
                  <span>التكاملات</span>
                </h2>
                <Link href="/settings/integrations" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                  إدارة متقدمة ←
                </Link>
              </div>

              <div className="space-y-2.5 mt-3">
                {[
                  {
                    key: "telegram",
                    title: "Telegram",
                    sub: "إرسال التنبيهات والمهام",
                    badgeCls: "bg-emerald-50 text-[#187A5A] border border-emerald-200/80",
                    icon: <Send className="w-4 h-4" />,
                  },
                  {
                    key: "n8n",
                    title: "Google Calendar / الأتمتة",
                    sub: "مزامنة المواعيد النهائية",
                    badgeCls: "bg-[#123D32]/10 text-[#123D32] border border-[#123D32]/20",
                    icon: <Calendar className="w-4 h-4" />,
                  },
                  {
                    key: "email",
                    title: "البريد الإلكتروني",
                    sub: "إشعارات وتقارير النظام",
                    badgeCls: "bg-[#C5A46D]/15 text-[#8A6D3B] border border-[#C5A46D]/35",
                    icon: <Mail className="w-4 h-4" />,
                  },
                ].map((item) => {
                  const enabled = isServiceEnabled(item.key);
                  const stateMeta = getServiceStateMeta(item.key);
                  return (
                    <div
                      key={item.key}
                      className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${item.badgeCls}`}>
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 truncate">{item.title}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${stateMeta.cls}`}>
                              {stateMeta.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.sub}</div>
                        </div>
                      </div>

                      <Switch
                        checked={enabled}
                        aria-label={`تبديل تكامل ${item.title}`}
                        onCheckedChange={() => void handleToggleIntegration(item.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Card 3: System Appearance */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between space-y-4 md:col-span-2 xl:col-span-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icons.Monitor size={16} className="text-[#187A5A]" />
                  <span>مظهر النظام</span>
                </h2>
                <Link href="/settings/appearance" className="text-[11px] font-bold text-[#187A5A] hover:underline">
                  تخصيص كامل ←
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: "light" as const, label: "فاتح", icon: <Icons.Sun size={17} /> },
                  { id: "dark" as const, label: "داكن", icon: <Icons.Moon size={17} /> },
                  { id: "system" as const, label: "تلقائي", icon: <Icons.Monitor size={17} /> },
                ].map((opt) => {
                  const active = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectTheme(opt.id)}
                      className={`relative h-[72px] rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        active
                          ? "border-[#187A5A] bg-emerald-50/70 text-[#123D32] ring-1 ring-[#187A5A]/30"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {active && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#187A5A] text-white flex items-center justify-center shadow-2xs">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">معرض الهويات البصرية</span>
                <span className="text-[11px] font-semibold text-[#187A5A] truncate">
                  {activePreset.nameAr}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEME_PRESETS.map((preset) => {
                  const active = preset.id === presetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-theme-preset={preset.id}
                      aria-label={preset.nameAr}
                      aria-pressed={active}
                      title={`${preset.nameAr} — ${preset.nameEn}`}
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`relative rounded-xl border p-2 text-right transition-all cursor-pointer flex flex-col gap-1.5 ${
                        active
                          ? "border-[var(--primary)] bg-[var(--selected)] ring-1 ring-[var(--ring)]"
                          : "border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--hover)]"
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-2xs"
                          style={{
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                          }}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {/* Mini Dual Light + Dark Palette Preview */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1" aria-hidden="true">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.light.primary }}
                            title={preset.lightName}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.dark.background }}
                            title={preset.darkName}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.dark.accent }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 truncate" dir="ltr">
                          {preset.nameEn.split(" ")[0]}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-900 truncate leading-tight">
                        {preset.nameAr}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Bottom 2 Panels: Account Profile & Password Change */}
        <div id="password-security" className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
          {/* Card 4: Authenticated Account Profile */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{userDisplayName}</h2>
                    <p className="text-xs text-slate-500 truncate" dir="ltr">
                      {user?.email || `@${user?.username || "user"}`}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#123D32] text-white text-[11px] font-bold shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#C5A46D]" />
                  <span>{ROLE_AR_LABELS[primaryRole] || primaryRole}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">اسم المستخدم</span>
                  <strong className="text-slate-900 font-mono" dir="ltr">
                    @{user?.username || "—"}
                  </strong>
                </div>

                <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">المسمى الوظيفي</span>
                  <strong className="text-slate-800 truncate">{userJobTitle}</strong>
                </div>

                <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">البريد الإلكتروني</span>
                  <span className="text-slate-800 font-mono truncate" dir="ltr">
                    {user?.email || "—"}
                  </span>
                </div>

                <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">حالة الحساب</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>نشط ومفعل</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">الأدوار والصلاحيات المسندة ({assignedRoles.length})</span>
                <span className="text-[11px] text-slate-500">نطاق الصلاحيات المعتمد</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {assignedRoles.map((r) => {
                  const isPrimary = r === primaryRole;
                  return (
                    <span
                      key={r}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                        isPrimary
                          ? "bg-emerald-50 text-[#123D32] border-emerald-200 font-bold"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {ROLE_AR_LABELS[r] ? `${ROLE_AR_LABELS[r]} (${r})` : r}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Card 5: Password Change Form */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0">
                    <LockIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">تغيير كلمة المرور</h2>
                    <p className="text-xs text-slate-500">تحديث كلمة المرور المشفرة بتقنية Argon2id</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono">
                  8+ خانات
                </span>
              </div>

              {passSuccess && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 mb-4 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2"
                >
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              {passError && (
                <div
                  role="alert"
                  className="p-3 mb-4 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2"
                >
                  <AlertCircleIcon className="w-4 h-4 shrink-0" />
                  <span>{passError}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-3.5">
                <div>
                  <label htmlFor="current-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    كلمة المرور الحالية <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showOldPass ? "text" : "password"}
                      id="current-password"
                      autoComplete="current-password"
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور الحالية"
                      className="w-full h-10 ps-3.5 pe-10 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#187A5A] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPass((v) => !v)}
                      aria-label={showOldPass ? "إخفاء كلمة المرور الحالية" : "إظهار كلمة المرور الحالية"}
                      className="absolute inset-y-0 end-0 px-3 text-slate-400 hover:text-slate-700 flex items-center cursor-pointer"
                    >
                      {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      كلمة المرور الجديدة <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPass ? "text" : "password"}
                        id="new-password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="8 خانات على الأقل"
                        className="w-full h-10 ps-3.5 pe-10 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#187A5A] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass((v) => !v)}
                        aria-label={showNewPass ? "إخفاء كلمة المرور الجديدة" : "إظهار كلمة المرور الجديدة"}
                        className="absolute inset-y-0 end-0 px-3 text-slate-400 hover:text-slate-700 flex items-center cursor-pointer"
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-new-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      تأكيد كلمة المرور <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? "text" : "password"}
                        id="confirm-new-password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="أعد كتابة كلمة المرور الجديدة"
                        className="w-full h-10 ps-3.5 pe-10 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#187A5A] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass((v) => !v)}
                        aria-label={showConfirmPass ? "إخفاء تأكيد كلمة المرور" : "إظهار تأكيد كلمة المرور"}
                        className="absolute inset-y-0 end-0 px-3 text-slate-400 hover:text-slate-700 flex items-center cursor-pointer"
                      >
                        {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500">
                    يتم حفظ كلمة المرور المشفرة فوراً دون إنهاء الجلسة الحالية
                  </span>
                  <button
                    type="submit"
                    disabled={passLoading}
                    className="h-10 px-5 text-xs font-bold text-white bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
                  >
                    {passLoading ? "جاري الحفظ..." : "تحديث كلمة المرور"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* Mobile Theme Selection Bottom Sheet */}
      <MobileBottomSheet
        isOpen={mobileThemeSheetOpen}
        onClose={() => setMobileThemeSheetOpen(false)}
        title="اختيار ثيم ومظهر النظام"
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500 mb-2">
            اختر الثيم المفضل لك لتطبيقه فورياً وديناميكياً على كافة الشاشات:
          </p>
          <div className="space-y-2">
            {THEME_PRESETS.map((p) => {
              const isSelected = presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={async () => {
                    await selectPreset(p.id);
                    toast.success(`تم تفعيل ثيم ${p.nameAr}`);
                    setMobileThemeSheetOpen(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-right transition active:scale-99 ${
                    isSelected
                      ? "border-primary bg-primary/[0.06] shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Swatch */}
                    <div
                      className="w-10 h-8 rounded-xl shadow-xs flex items-center justify-center text-white"
                      style={{ backgroundColor: p.signature.primary }}
                    >
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        {p.nameAr}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        {p.descriptionAr}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                      مفعل
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </MobileBottomSheet>

      {/* Mobile Password Change Bottom Sheet */}
      <MobileBottomSheet
        isOpen={mobilePasswordSheetOpen}
        onClose={() => setMobilePasswordSheetOpen(false)}
        title="تغيير كلمة المرور"
      >
        <form onSubmit={handleChangePassword} className="p-4 space-y-3.5">
          {passSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold">
              {passSuccess}
            </div>
          )}
          {passError && (
            <div className="p-3 bg-rose-50 text-rose-800 rounded-xl text-xs font-semibold">
              {passError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              كلمة المرور الحالية
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              كلمة المرور الجديدة
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={passLoading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:opacity-95 transition disabled:opacity-50"
          >
            {passLoading ? "جاري الحفظ..." : "حفظ وتحديث كلمة المرور"}
          </button>
        </form>
      </MobileBottomSheet>
    </DashboardLayout>
  );
}
