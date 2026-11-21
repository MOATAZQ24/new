"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState } from "react";
import Link from "next/link";
import {
  Mic,
  PlusCircle,
  QrCode,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Headphones,
  Laptop,
  CheckSquare,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface MobileMyDayProps {
  data: {
    open_tasks: number;
    overdue_tasks: number;
    open_tickets: number;
    critical_tickets: number;
    total_assets: number;
    assigned_assets: number;
    recent_tasks: {
      id: string;
      title: string;
      status: string;
      due_date?: string | null;
    }[];
    recent_tickets?: {
      id: string;
      ticket_number: string;
      issue_title: string;
      priority: string;
      status: string;
    }[];
  };
  onSwitchToFullDashboard: () => void;
}

export function MobileMyDay({ data, onSwitchToFullDashboard }: MobileMyDayProps) {
  const { user, activeCompany } = useAuth();

  // Current Arabic Date
  const arabicDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "زميلنا";

  return (
    <div className="space-y-5 lg:hidden animate-in fade-in duration-200">
      {/* 1. Warm Greeting & Focus Header */}
      <div className="bg-gradient-to-br from-[#123D32] to-[#187A5A] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden">
        <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
        <div className="relative z-10">
          <div className="text-xs text-[var(--accent)] font-bold tracking-wide">
            {arabicDate}
          </div>
          <h1 className="text-xl font-black mt-1 leading-tight">
            مرحباً، {firstName} 👋
          </h1>
          <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
            {activeCompany?.name_ar || activeCompany?.name_en || "بوابة المستثمر للتقنية"} — إليك أهم مهامك وأولوياتك اليوم.
          </p>
        </div>
      </div>

      {/* 2. Contextual Quick Actions (1-Tap Primary Actions) */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          إجراءات سريعة وفورية
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {/* Quick Voice Task Button */}
          <Link
            href="/tasks?mode=voice"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 shadow-2xs hover:border-[#187A5A] transition active:scale-98 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[#187A5A] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Mic size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white">
                مهمة صوتية
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                تسجيل وإرسال سريع
              </div>
            </div>
          </Link>

          {/* Quick Ticket Button */}
          <Link
            href="/tickets?action=new"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 shadow-2xs hover:border-[#187A5A] transition active:scale-98 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <PlusCircle size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white">
                تذكرة دعم
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                طلب أو بلاغ فني
              </div>
            </div>
          </Link>

          {/* Scan Asset QR */}
          <Link
            href="/assets?action=scan"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 shadow-2xs hover:border-[#187A5A] transition active:scale-98 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <QrCode size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white">
                مسح أصل QR
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                فحص عهدة وجرد
              </div>
            </div>
          </Link>

          {/* AI Operations Assistant */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true })
              );
            }}
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 shadow-2xs hover:border-[#187A5A] transition active:scale-98 flex items-center gap-3 text-start cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white">
                المساعد الذكي
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                أوامر وبحث فوري
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Essential 4 Focus Metrics */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          ملخص أولوياتك
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/tasks"
            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                مهام نشطة
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#187A5A] flex items-center justify-center">
                <CheckSquare size={16} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
              {data.open_tasks}
            </div>
          </Link>

          <Link
            href="/tasks"
            className={`p-4 rounded-2xl border shadow-2xs flex flex-col justify-between ${
              data.overdue_tasks > 0
                ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300"
                : "bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">مهام متأخرة</span>
              <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono mt-2">
              {data.overdue_tasks}
            </div>
          </Link>

          <Link
            href="/tickets"
            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                تذاكر الدعم
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <Headphones size={16} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
              {data.open_tickets}
            </div>
          </Link>

          <Link
            href="/assets"
            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                أصول وعهد
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                <Laptop size={16} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
              {data.total_assets}
            </div>
          </Link>
        </div>
      </div>

      {/* 4. Urgent Action Items (المهام والتذاكر العاجلة لليوم) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            مهام تحتاج انتباهك
          </h2>
          <Link
            href="/tasks"
            className="text-xs font-bold text-[#187A5A] dark:text-emerald-400 flex items-center gap-1"
          >
            <span>عرض الكل</span>
            <ChevronLeft size={14} />
          </Link>
        </div>

        {data.recent_tasks && data.recent_tasks.length > 0 ? (
          <div className="space-y-2">
            {data.recent_tasks.slice(0, 3).map((task) => (
              <Link
                key={task.id}
                href="/tasks"
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between gap-3 transition hover:border-[#187A5A]"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {task.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-semibold">
                      {task.status}
                    </span>
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-[10px]">
                        <Clock size={12} />
                        {task.due_date.slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft size={16} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-center space-y-1.5">
            <CheckCircle2 size={24} className="mx-auto text-emerald-600" />
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              لا توجد مهام متأخرة اليوم
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
              جميع أعمالك ومسؤولياتك التشغيلية تسير وفق الجدول الزمني المحدد.
            </div>
          </div>
        )}
      </div>

      {/* 5. Switch to Full Dashboard Toggle */}
      <div className="pt-2 pb-6 text-center">
        <button
          type="button"
          onClick={onSwitchToFullDashboard}
          className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-[#187A5A] transition py-2 px-4 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 cursor-pointer shadow-2xs"
        >
          📊 عرض لوحة المؤشرات البيانية الكاملة
        </button>
      </div>
    </div>
  );
}
