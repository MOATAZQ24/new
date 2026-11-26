"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Modal from "@/components/ui/Modal";
import { 
  ShieldAlertIcon, RefreshCwIcon, 
  UserIcon, EyeIcon 
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AuditLogItem {
  id: string;
  user_id?: string;
  user_name: string;
  company_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export default function AuditPage() {
  const { currentCompany } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, per_page: 25 };
      if (actionFilter) params.action = actionFilter;
      if (resourceFilter) params.resource_type = resourceFilter;

      const res = await api.get<AuditLogItem[]>("/audit", { params });
      setLogs(res.data || []);
      if (res.pagination) {
        setTotalPages(res.pagination.total_pages);
        setTotalItems(res.pagination.total);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resourceFilter, page]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadLogs, currentCompany]);

  const getActionBadge = (action: string) => {
    switch (action.toUpperCase()) {
      case "CREATE":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800">إضافة</span>;
      case "UPDATE":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">تعديل</span>;
      case "DELETE":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800">حذف</span>;
      case "LOGIN":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">تسجيل دخول</span>;
      case "STATUS_CHANGE":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">تغيير حالة</span>;
      case "ASSIGN_CUSTODY":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800">تسليم عهدة</span>;
      case "RETURN_CUSTODY":
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">إرجاع عهدة</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">{action}</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">سجل العمليات والرقابة الأمنية</h1>
            <p className="text-sm text-[var(--text-3)] mt-1">
              تتبع غير قابل للتعديل لجميع العمليات، التعديلات، وعمليات تسجيل الدخول لضمان النزاهة والأمان
            </p>
          </div>
          <button
            onClick={() => loadLogs()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--text-2)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors"
          >
            <RefreshCwIcon className="w-4 h-4" />
            تحديث السجل
          </button>
        </div>

        {/* Filters */}
        <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] shadow-sm flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="">جميع أنواع العمليات</option>
                <option value="CREATE">إضافة (CREATE)</option>
                <option value="UPDATE">تعديل (UPDATE)</option>
                <option value="DELETE">حذف (DELETE)</option>
                <option value="LOGIN">تسجيل دخول (LOGIN)</option>
                <option value="STATUS_CHANGE">تغيير حالة (STATUS_CHANGE)</option>
                <option value="ASSIGN_CUSTODY">تسليم عهدة (ASSIGN_CUSTODY)</option>
                <option value="RETURN_CUSTODY">إرجاع عهدة (RETURN_CUSTODY)</option>
                <option value="CONFIG_APPROVE">اعتماد إعداد (CONFIG_APPROVE)</option>
              </select>
            </div>

            <div>
              <select
                value={resourceFilter}
                onChange={(e) => {
                  setResourceFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="">جميع الكيانات والموديلات</option>
                <option value="TechnicalAsset">الأصول التقنية (TechnicalAsset)</option>
                <option value="AssetCustody">عهد الموظفين (AssetCustody)</option>
                <option value="ITInfrastructure">البنية التحتية (ITInfrastructure)</option>
                <option value="ThirdPartySubscription">الاشتراكات (ThirdPartySubscription)</option>
                <option value="MaintenanceRecord">الصيانة والتغييرات (MaintenanceRecord)</option>
                <option value="Task">المهام</option>
                <option value="HelpDeskTicket">تذاكر الدعم</option>
                <option value="Employee">الموظفين</option>
                <option value="User">حسابات المستخدمين</option>
                <option value="Company">الشركات والفروع</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-[var(--text-3)]">
            إجمالي السجلات: <strong className="text-[var(--text)]">{totalItems}</strong> عملية
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-[var(--surface-2)] animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-3)]">
              <ShieldAlertIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium">لا توجد عمليات مسجلة بالمعايير الحالية</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-[var(--surface-2)] text-[var(--text-2)] font-medium text-xs border-b">
                  <tr>
                    <th className="py-3 px-4">المستخدم</th>
                    <th className="py-3 px-4">نوع الإجراء</th>
                    <th className="py-3 px-4">الكيان / الموديل</th>
                    <th className="py-3 px-4">معرف السجل</th>
                    <th className="py-3 px-4">عنوان IP</th>
                    <th className="py-3 px-4">التاريخ والوقت</th>
                    <th className="py-3 px-4 text-center">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[var(--text)] inline-flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-[var(--text-3)]" />
                          {log.user_name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-2)]">
                        {log.resource_type}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-3)]" title={log.resource_id}>
                        {log.resource_id ? `${log.resource_id.slice(0, 8)}...` : "-"}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-3)]" dir="ltr">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-3)]" dir="ltr">
                        {log.created_at?.slice(0, 19).replace("T", " ")}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-[var(--text-3)] hover:text-[#2563EB] hover:bg-[var(--surface-2)] rounded-lg transition-colors"
                          title="عرض التفاصيل والبيانات"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-[var(--border)] bg-[var(--surface-2)] text-xs">
              <span className="text-[var(--text-3)]">
                الصفحة {page} من {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] disabled:opacity-50 hover:bg-[var(--surface-2)]"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] disabled:opacity-50 hover:bg-[var(--surface-2)]"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Log Detail */}
        {selectedLog && (
          <Modal
            isOpen={!!selectedLog}
            onClose={() => setSelectedLog(null)}
            title="تفاصيل سجل المراجعة والتدقيق"
            maxWidth="max-w-2xl"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs bg-[var(--surface-2)] p-3 rounded-lg border">
                <div>
                  <span className="text-[var(--text-2)] block">المستخدم:</span>
                  <strong className="text-[var(--text)]">{selectedLog.user_name}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-2)] block">نوع الإجراء:</span>
                  <span>{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-[var(--text-2)] block">المورد / الكيان:</span>
                  <span className="font-mono"><bdi dir="ltr">{selectedLog.resource_type}</bdi></span>
                </div>
                <div>
                  <span className="text-[var(--text-2)] block">معرف المورد (UUID):</span>
                  <span className="font-mono"><bdi dir="ltr">{selectedLog.resource_id || "-"}</bdi></span>
                </div>
                <div>
                  <span className="text-[var(--text-2)] block">عنوان IP:</span>
                  <span className="font-mono"><bdi dir="ltr">{selectedLog.ip_address || "127.0.0.1"}</bdi></span>
                </div>
                <div>
                  <span className="text-[var(--text-2)] block">التوقيت:</span>
                  <bdi dir="ltr">{selectedLog.created_at}</bdi>
                </div>
              </div>

              {selectedLog.old_values && (
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-2)] mb-1">القيم السابقة (Old Values):</h4>
                  <pre className="bg-red-50 text-red-900 p-3 rounded-lg text-xs font-mono overflow-x-auto border border-red-200">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-2)] mb-1">القيم الجديدة (New Values):</h4>
                  <pre className="bg-green-50 text-green-900 p-3 rounded-lg text-xs font-mono overflow-x-auto border border-green-200">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-2)]"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
