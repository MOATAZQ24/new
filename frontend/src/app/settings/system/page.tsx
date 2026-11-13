"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/ui/StatsCard";
import { 
  ShieldCheckIcon, RefreshCwIcon, AlertCircleIcon, 
  CheckSquareIcon, ClockIcon, UserIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface SystemHealthData {
  status: string;
  timestamp: string;
  database: {
    engine: string;
    status: string;
    latency_ms: number;
    file_size_mb: number;
    table_records: Record<string, number>;
  };
  storage: {
    total_gb?: number;
    used_gb?: number;
    free_gb?: number;
    used_percent?: number;
  };
  backups_count: number;
  environment: string;
}

interface BackupFile {
  filename: string;
  size_kb: number;
  created_at: string;
}

interface LogEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_name: string;
  ip_address?: string;
  created_at: string;
}

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.is_superadmin;

  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      setLoading(true);
      setError(null);
      const [hRes, bRes, lRes] = await Promise.all([
        api.get<SystemHealthData>("/system/health"),
        api.get<BackupFile[]>("/system/backups"),
        api.get<LogEntry[]>("/system/logs?limit=30"),
      ]);
      setHealth(hRes.data);
      setBackups(bRes.data || []);
      setLogs(lRes.data || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || "فشل تحميل بيانات صيانة النظام");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupSuccess(null);
    setError(null);
    try {
      const res = await api.post("/system/backup");
      setBackupSuccess(res.data?.message || "تم إنشاء النسخة الاحتياطية بنجاح والتحقق من سلامتها");
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "فشل إنشاء النسخة الاحتياطية");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadBackup = (filename: string) => {
    const token = localStorage.getItem("token");
    const downloadUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/system/backups/${filename}/download`;
    // Open download in new tab / initiate download
    window.open(downloadUrl, "_blank");
  };

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-bold text-gray-900">صلاحية وصول مقيدة</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            قسم صيانة النظام والتعافي من الكوارث مخصص حصراً لمدير النظام الرئيسي (Super Admin). ليس لديك الصلاحيات الكافية للوصول إلى هذه الشاشة.
          </p>
          <Link
            href="/settings"
            className="inline-block mt-4 px-4 py-2 bg-[#123D32] text-white text-xs font-bold rounded-lg"
          >
            العودة إلى الإعدادات العامة
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
          <Link
            href="/settings"
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            الإعدادات العامة
          </Link>
          <Link
            href="/settings/branding"
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            الهوية والمظهر
          </Link>
          <Link
            href="/settings/integrations"
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            التكامل الخارجي (Telegram & n8n)
          </Link>
          <Link
            href="/settings/system"
            className="px-4 py-2 text-xs font-bold text-white bg-[#123D32] rounded-lg shadow-sm"
          >
            صيانة النظام والنسخ الاحتياطي
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">مركز صيانة النظام والتعافي من الكوارث (DR)</h1>
            <p className="text-sm text-gray-500 mt-1">
              مراقبة صحة الخوادم، تخزين قاعدة البيانات، النسخ الاحتياطي الذري، وتشخيص السجلات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCwIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#187A5A] hover:bg-[#123D32] text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <span>💾</span>
              <span>{backupLoading ? "جاري إنشاء النسخة والتحقق..." : "إنشاء نسخة احتياطية فورية"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {backupSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
            <span>{backupSuccess}</span>
          </div>
        )}

        {/* System Health KPIs */}
        {health && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="زمن استجابة قاعدة البيانات"
              value={`${health.database.latency_ms} ms`}
              icon={<ClockIcon className="w-5 h-5 text-emerald-600" />}
              accentColor="border-emerald-500"
            />
            <StatsCard
              title="حجم قاعدة البيانات"
              value={`${health.database.file_size_mb} MB`}
              icon={<CheckSquareIcon className="w-5 h-5 text-blue-600" />}
              accentColor="border-blue-500"
            />
            <StatsCard
              title="الجلسات النشطة حالياً"
              value={health.database.table_records.active_sessions || 0}
              icon={<UserIcon className="w-5 h-5 text-purple-600" />}
              accentColor="border-purple-500"
            />
            <StatsCard
              title="النسخ الاحتياطية المحفوظة"
              value={health.backups_count}
              icon={<ShieldCheckIcon className="w-5 h-5 text-amber-600" />}
              accentColor="border-amber-500"
            />
          </div>
        )}

        {/* Database & Storage Details */}
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Database Engine Card */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>🗄️</span> محرك قاعدة البيانات وسجلات الجداول
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <span className="text-gray-400 block mb-1">المحرك المستخدم:</span>
                  <strong className="text-gray-800 text-sm">{health.database.engine.toUpperCase()}</strong>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <span className="text-gray-400 block mb-1">حالة الاتصال:</span>
                  <strong className="text-emerald-700 text-sm flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    {health.database.status}
                  </strong>
                </div>
              </div>

              <div className="border-t pt-3">
                <span className="text-xs font-semibold text-gray-600 block mb-2">إحصائيات السجلات:</span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">المنشآت</span>
                    <strong className="text-gray-800">{health.database.table_records.companies || 0}</strong>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">المستخدمين</span>
                    <strong className="text-gray-800">{health.database.table_records.users || 0}</strong>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">الأصول التقنية</span>
                    <strong className="text-gray-800">{health.database.table_records.assets || 0}</strong>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">المهام التشغيلية</span>
                    <strong className="text-gray-800">{health.database.table_records.tasks || 0}</strong>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">تذاكر الدعم</span>
                    <strong className="text-gray-800">{health.database.table_records.tickets || 0}</strong>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-400 block text-[10px]">سجلات التدقيق</span>
                    <strong className="text-gray-800">{health.database.table_records.audit_logs || 0}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Storage & Environment Card */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>💽</span> مساحة القرص والبيئة التشغيلية
              </h3>
              
              {health.storage.used_percent !== undefined && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>استهلاك القرص الصلب:</span>
                    <strong className="text-gray-900">{health.storage.used_percent}%</strong>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-[#187A5A] h-2.5 rounded-full transition-all" 
                      style={{ width: `${health.storage.used_percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 pt-1">
                    <span>المستخدم: {health.storage.used_gb} GB</span>
                    <span>المتبقي: {health.storage.free_gb} GB</span>
                    <span>الإجمالي: {health.storage.total_gb} GB</span>
                  </div>
                </div>
              )}

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-1 text-blue-900">
                <span className="font-bold block">🛡️ نمط الاستضافة الشبكية:</span>
                <p className="text-blue-800 leading-relaxed">
                  النظام يعمل بنمط <strong>{health.environment}</strong> داخل شبكة المنشأة المحلية (LAN)، دون فتح أي منافذ استقبال عامة، مع الاعتماد التام على الاتصالات الصادرة المشفرة عبر TLS.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Backups List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>💾</span> النسخ الاحتياطية المتوفرة للتعافي ({backups.length})
            </h3>
            <span className="text-xs text-gray-500">مخزنة في دليل النسخ المؤمّن على الخادم</span>
          </div>

          {backups.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">لا توجد نسخ احتياطية مسجلة حالياً</p>
          ) : (
            <div className="divide-y divide-gray-100 overflow-x-auto">
              {backups.map((b) => (
                <div key={b.filename} className="py-3 flex items-center justify-between text-xs gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📦</span>
                    <div>
                      <strong className="text-gray-800 font-mono text-xs">{b.filename}</strong>
                      <span className="text-gray-400 block text-[10px] mt-0.5">
                        التاريخ: {b.created_at.slice(0, 16).replace("T", " ")} | الحجم: {b.size_kb} KB
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadBackup(b.filename)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#187A5A] hover:bg-[#187A5A]/10 border border-[#187A5A]/30 rounded-lg transition-colors whitespace-nowrap"
                  >
                    تنزيل النسخة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operational Diagnostics & Audit Logs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>📜</span> سجل العمليات التشغيلية والأمان الحديثة
          </h3>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b">
                <tr>
                  <th className="py-2.5 px-3">الإجراء</th>
                  <th className="py-2.5 px-3">نوع الكيان</th>
                  <th className="py-2.5 px-3">المستخدم</th>
                  <th className="py-2.5 px-3">عنوان IP</th>
                  <th className="py-2.5 px-3">الوقت والتاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/60">
                    <td className="py-2.5 px-3 font-semibold text-gray-800">{log.action}</td>
                    <td className="py-2.5 px-3 text-gray-600">{log.resource_type}</td>
                    <td className="py-2.5 px-3 text-gray-700">{log.user_name}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-500" dir="ltr">{log.ip_address || "127.0.0.1"}</td>
                    <td className="py-2.5 px-3 text-gray-400" dir="ltr">{log.created_at?.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
