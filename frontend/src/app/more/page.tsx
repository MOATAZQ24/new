"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Laptop,
  Users,
  Layers,
  ShieldCheck,
  BarChart3,
  FilePlus,
  Mic,
  Camera,
  QrCode,
  Settings,
  Headphones,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";

export default function MorePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const mainModules = [
    {
      title: "الأصول والمعدات",
      subtitle: "إدارة الأصول والأجهزة",
      href: "/assets",
      icon: Laptop,
    },
    {
      title: "الموظفون",
      subtitle: "بيانات الموظفين والفرق",
      href: "/employees",
      icon: Users,
    },
    {
      title: "الاشتراكات",
      subtitle: "إدارة الاشتراكات والخدمات",
      href: "/subscriptions",
      icon: Layers,
    },
    {
      title: "الموافقات",
      subtitle: "طلبات وموافقات العمل",
      href: "/approvals",
      icon: ShieldCheck,
    },
    {
      title: "التقارير",
      subtitle: "تقارير الأداء والإحصاءات",
      href: "/reports",
      icon: BarChart3,
    },
  ];

  const handleQuickAction = (action: string) => {
    if (action === "create_ticket") {
      router.push("/tickets?create=true");
    } else if (action === "voice_task") {
      router.push("/tasks?voice=true");
    } else if (action === "upload_file") {
      toast.info("إمكانية رفع الملفات متاحة داخل تفاصيل المهام والتذاكر");
    } else if (action === "scan_qr") {
      setQrModalOpen(true);
    }
  };

  const handleLogout = async () => {
    if (confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) {
      await logout();
      router.push("/login");
    }
  };

  return (
    <DashboardLayout>
      {/* Mobile Presentation - Pixel-perfect reproduction of Reference Image 3 */}
      <div className="block lg:hidden min-h-screen bg-slate-50/60 dark:bg-slate-950 pb-24 px-4 pt-3 space-y-4">
        {/* Page Title & Subtitle Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              المزيد
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              الوصول إلى جميع الوحدات والخدمات
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
            <LayoutGrid size={24} strokeWidth={2.2} className="text-white" />
          </div>
        </div>

        {/* Section 1: الوحدات الرئيسية (Main Modules) */}
        <div>
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            الوحدات الرئيسية
          </h2>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-2xs divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
            {mainModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Icon size={20} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Section 2: أدوات سريعة (Quick Tools) */}
        <div>
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 px-1">
            أدوات سريعة
          </h2>
          <div className="grid grid-cols-4 gap-2.5">
            {/* إنشاء طلب */}
            <button
              type="button"
              onClick={() => handleQuickAction("create_ticket")}
              className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center">
                <FilePlus size={20} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 text-center leading-tight">
                إنشاء طلب
              </span>
            </button>

            {/* تسجيل صوتي */}
            <button
              type="button"
              onClick={() => handleQuickAction("voice_task")}
              className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center">
                <Mic size={20} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 text-center leading-tight">
                تسجيل صوتي
              </span>
            </button>

            {/* رفع ملف */}
            <button
              type="button"
              onClick={() => handleQuickAction("upload_file")}
              className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center">
                <Camera size={20} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 text-center leading-tight">
                رفع ملف
              </span>
            </button>

            {/* مسح QR */}
            <button
              type="button"
              onClick={() => handleQuickAction("scan_qr")}
              className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80 shadow-2xs flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/15 text-primary flex items-center justify-center">
                <QrCode size={20} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 text-center leading-tight">
                مسح QR
              </span>
            </button>
          </div>
        </div>

        {/* Section 3: Bottom System Links */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-2xs divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
          <Link
            href="/settings"
            className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <Settings size={18} strokeWidth={2.2} />
              </div>
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                الإعدادات
              </span>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </Link>

          <Link
            href="/tickets"
            className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <Headphones size={18} strokeWidth={2.2} />
              </div>
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                مساعدة ودعم
              </span>
            </div>
            <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-between p-3.5 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 active:bg-rose-100/50 transition cursor-pointer text-right"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <LogOut size={18} strokeWidth={2.2} />
              </div>
              <span className="font-bold text-sm text-rose-600 dark:text-rose-400">
                تسجيل الخروج
              </span>
            </div>
            <ChevronLeft size={16} className="text-rose-300 dark:text-rose-700 shrink-0" />
          </button>
        </div>
      </div>

      {/* Desktop Fallback Presentation */}
      <div className="hidden lg:block space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            جميع وحدات النظام والخدمات
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            الوصول السريع إلى كافة الأقسام الإدارية والتشغيلية
          </p>
          <div className="grid grid-cols-3 gap-4 mt-6">
            {mainModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary transition group"
                >
                  <Icon className="text-primary mb-2" size={24} />
                  <div className="font-bold text-slate-800 dark:text-white group-hover:text-primary">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{item.subtitle}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* QR Scanner Sheet */}
      <MobileBottomSheet
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="ماسح الرمز السريع (QR)"
      >
        <div className="p-4 text-center space-y-4">
          <div className="w-48 h-48 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-dashed border-primary">
            <QrCode size={64} className="text-primary animate-pulse" />
          </div>
          <p className="text-xs text-slate-500">
            وجه كاميرا الهاتف نحو ملصق كود الأصل أو التذكرة للمسح الفوري
          </p>
          <button
            type="button"
            onClick={() => setQrModalOpen(false)}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>
      </MobileBottomSheet>
    </DashboardLayout>
  );
}
