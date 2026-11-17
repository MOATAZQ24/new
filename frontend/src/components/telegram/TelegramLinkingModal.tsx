"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { CopyIcon } from "@/components/ui/Icons";
import { api } from "@/lib/api";
import TelegramActionPermissions from "./TelegramActionPermissions";

interface TelegramActivityLog {
  id: string;
  created_at?: string;
  action: string;
  status: string;
  details?: Record<string, unknown> | string;
  error_message?: string;
  ip_address?: string;
}

interface TelegramLinkDetails {
  is_verified?: boolean;
  bot_username?: string;
  employee?: {
    full_name?: string;
    job_title?: string;
  };
  user?: {
    username?: string;
    roles?: string[];
  };
  link?: {
    is_verified?: boolean;
    allowed_modules?: string[];
    notification_preferences?: Record<string, boolean>;
    notifications_enabled?: boolean;
    data_scope?: string;
    telegram_username?: string;
    telegram_user_id?: string;
    telegram_chat_id?: string;
    linked_at?: string;
    permission_policy?: { actions?: Record<string, string[]>; scope?: string };
  };
  permissions_matrix?: {
    max_permitted_modules?: string[];
    effective_actions?: Record<string, string[]>;
    maximum_actions?: Record<string, string[]>;
    can_manage?: boolean;
    maximum_scope?: string;
  };
  activity_logs?: TelegramActivityLog[];
}

interface TelegramLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onVerified?: (data: TelegramLinkDetails) => void;
  companyId?: string;
  initialTab?: "overview" | "permissions" | "activity";
}

export default function TelegramLinkingModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  onVerified,
  companyId,
  initialTab = "overview",
}: TelegramLinkingModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "permissions" | "activity" | "link_command">("overview");
  const [loading, setLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Connection & Details Data
  const [details, setDetails] = useState<TelegramLinkDetails | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  // Linking token state (for unlinked or re-linking)
  const [tokenData, setTokenData] = useState<{
    token: string;
    command: string;
    bot_username: string;
    expires_at: string;
    pin_code?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  // Permissions state
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [dataScope, setDataScope] = useState<string>("Self");
  const [notifPrefs, setNotifPrefs] = useState<{ [key: string]: boolean }>({
    task_assigned: true,
    task_status_changed: true,
    ticket_created: true,
    overdue_alerts: true,
  });
  const [notifsEnabled, setNotifsEnabled] = useState(true);

  // Test Notification State
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const generationRef = useRef(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Fetch full details and link status
  const fetchDetails = async () => {
    if (!employeeId) return;
    const generation = generationRef.current;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const q = companyId ? `?company_id=${companyId}` : "";
      const res = await api.get<TelegramLinkDetails>(`/telegram/links/${employeeId}/details${q}`);
      if (generation !== generationRef.current) return;
      const d = res.data;
      setDetails(d);

      if (d?.link?.is_verified) {
        setIsVerified(true);
        setActiveTab(initialTab || "overview");
        const initialAllowed = d.link.allowed_modules || d.permissions_matrix?.max_permitted_modules || [];
        setAllowedModules(initialAllowed);
        setDataScope(d.link.data_scope || "Self");
        if (d.link.notification_preferences) {
          setNotifPrefs(d.link.notification_preferences);
        }
        setNotifsEnabled(d.link.notifications_enabled ?? true);
      } else {
        setIsVerified(false);
        setActiveTab("link_command");
        startLinkingWorkflow();
      }
    } catch (err: unknown) {
      if (generation !== generationRef.current) return;
      console.warn("Could not fetch link details directly, starting linking flow", err);
      setIsVerified(false);
      setActiveTab("link_command");
      startLinkingWorkflow();
    } finally {
      setLoading(false);
    }
  };

  // Start manual /start linking workflow
  const startLinkingWorkflow = async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    setTestResult(null);
    setCopied(false);
    setLinkNotice(null);
    setTokenData(null);
    stopPolling();
    const generation = ++generationRef.current;

    try {
      const q = companyId ? `?company_id=${companyId}` : "";
      const res = await api.post<{
        token: string;
        command?: string;
        bot_username?: string;
        expires_at: string;
        pin_code?: string;
      }>(`/telegram/links/generate-token${q}`, {
        employee_id: employeeId,
        expires_in_minutes: 30,
      });

      const data = res.data;
      if (generation !== generationRef.current) return;
      setTokenData({
        token: data.token,
        command: data.command || `/start ${data.token}`,
        bot_username: data.bot_username || "InvestorGateBot",
        expires_at: data.expires_at,
        pin_code: data.pin_code,
      });

      // Poll every 2.5 seconds for live status
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await api.get<{
            is_verified?: boolean;
            is_pending?: boolean;
            last_error?: string;
            worker_status?: { is_running?: boolean; last_error?: string };
          }>(`/telegram/links/${employeeId}/status${q}`);
          const s = statusRes.data;
          if (generation !== generationRef.current) return;
          if (s && s.is_verified) {
            stopPolling();
            setIsVerified(true);
            if (onVerified) onVerified(s as unknown as TelegramLinkDetails);
            // Refresh full details to populate permissions and tabs
            const detRes = await api.get<TelegramLinkDetails>(`/telegram/links/${employeeId}/details${q}`);
            setDetails(detRes.data);
            setActiveTab("overview");
          } else if (s) {
            if (!s.is_pending) {
              stopPolling();
              setLinkNotice(s.last_error || "انتهت صلاحية أمر الربط أو تم إلغاؤه. اطلب أمراً جديداً من المسؤول");
            } else if (s.last_error) {
              setLinkNotice(s.last_error);
            } else if (!s.worker_status?.is_running) {
              setLinkNotice("معالج Telegram متوقف حالياً في السيرفر");
            } else if (s.worker_status?.last_error) {
              setLinkNotice(`تعذر معالجة رسائل Telegram: ${s.worker_status.last_error}`);
            } else {
              setLinkNotice(null);
            }
          }
        } catch (pollErr: unknown) {
          if (generation === generationRef.current) {
            setLinkNotice(pollErr instanceof Error ? pollErr.message : "تعذر تحديث حالة الربط. تحقق من اتصال النظام");
          }
        }
      }, 2500);
    } catch (err: unknown) {
      console.error("Failed to generate token", err);
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(errObj?.response?.data?.detail || errObj?.message || "فشل توليد رمز الربط");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let t: number | undefined;
    if (isOpen && employeeId) {
      t = window.setTimeout(() => {
        void fetchDetails();
      }, 0);
    } else {
      stopPolling();
    }
    return () => {
      if (t !== undefined) window.clearTimeout(t);
      generationRef.current += 1;
      stopPolling();
    };
  }, [isOpen, employeeId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyCommand = async () => {
    if (!tokenData) return;
    try {
      await navigator.clipboard.writeText(tokenData.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert("يرجى تحديد النص ونسخه يدوياً");
    }
  };

  const handleSendTestMessage = async () => {
    if (!employeeId) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const q = companyId ? `?company_id=${companyId}` : "";
      const res = await api.post(`/telegram/test-notification${q}`, {
        employee_id: employeeId,
        custom_message: `🔔 مرحباً يا ${employeeName}، هذه رسالة تأكيد الاتصال المباشر من مركز عمليات Investor Gate OS. تم تأكيد تفعيل الحساب والصلاحيات بنجاح!`,
      });
      setTestResult({
        success: true,
        message: res.message || "تم إرسال رسالة الاختبار بنجاح!",
      });
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      setTestResult({
        success: false,
        message: errObj?.response?.data?.detail || errObj?.message || "فشل إرسال رسالة الاختبار",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!employeeId) return;
    setSavingPermissions(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const q = companyId ? `?company_id=${companyId}` : "";
      await api.put(`/telegram/links/${employeeId}/permissions${q}`, {
        allowed_modules: allowedModules,
        notification_preferences: notifPrefs,
        notifications_enabled: notifsEnabled,
        data_scope: dataScope,
      });
      setSuccessMessage("تم حفظ صلاحيات وتفضيلات Telegram بنجاح!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(errObj?.response?.data?.detail || errObj?.message || "فشل حفظ الصلاحيات");
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleResetPermissions = () => {
    if (!details) return;
    const initialAllowed = details.link?.allowed_modules || details.permissions_matrix?.max_permitted_modules || [];
    setAllowedModules(initialAllowed);
    setDataScope(details.link?.data_scope || "Self");
    if (details.link?.notification_preferences) {
      setNotifPrefs(details.link.notification_preferences);
    }
    setNotifsEnabled(details.link?.notifications_enabled ?? true);
    setSuccessMessage("تمت استعادة الإعدادات المحفوظة");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const applyTemplate = (template: { name: string; modules?: string[]; data_scope?: string }) => {
    const maxPermitted = details?.permissions_matrix?.max_permitted_modules || [];
    const validModules = (template.modules || []).filter((m: string) => maxPermitted.includes(m));
    setAllowedModules(validModules);
    setDataScope(template.data_scope || "Self");
    setSuccessMessage(`تم تطبيق ${template.name}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleUnlink = async () => {
    if (!confirm(`هل أنت متأكد من رغبتك في إلغاء ربط Telegram للموظف ${employeeName}؟ لن يتمكن من تنفيذ أي إجراءات عبر البوت حتى يتم إعادة الربط.`)) {
      return;
    }
    setLoading(true);
    try {
      const q = companyId ? `?company_id=${companyId}` : "";
      await api.delete(`/telegram/links/${employeeId}${q}`);
      setIsVerified(false);
      setDetails(null);
      if (onVerified) onVerified({ is_verified: false });
      setActiveTab("link_command");
      startLinkingWorkflow();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(errObj?.response?.data?.detail || errObj?.message || "فشل إلغاء الربط");
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = (modId: string) => {
    const maxPermitted = details?.permissions_matrix?.max_permitted_modules || [];
    if (!maxPermitted.includes(modId)) return; // Disallowed by CRM

    setAllowedModules((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopPolling();
        onClose();
      }}
      title={`مركز عمليات وإدارة Telegram — ${employeeName}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 text-right font-sans">
        {/* Navigation Tabs (Only when verified or switching) */}
        {isVerified && (
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "border-[#187A5A] text-[#123D32]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              ℹ️ نظرة عامة والاتصال
            </button>
            <button
              onClick={() => setActiveTab("permissions")}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "permissions"
                  ? "border-[#187A5A] text-[#123D32]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              🛡️ صلاحيات Telegram والبيانات
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "activity"
                  ? "border-[#187A5A] text-[#123D32]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              📋 سجل الأنشطة والتدقيق
            </button>
            <button
              onClick={() => {
                setActiveTab("link_command");
                startLinkingWorkflow();
              }}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "link_command"
                  ? "border-amber-600 text-amber-800"
                  : "border-transparent text-slate-500 hover:text-amber-800"
              }`}
            >
              🔄 إعادة الربط
            </button>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <div className="w-8 h-8 border-3 border-[#187A5A] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">جاري تحميل بيانات الاتصال والصلاحيات المعتمدة...</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="font-bold text-rose-600 hover:underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* ── TAB 1: OVERVIEW ────────────────────────────────────────── */}
        {!loading && isVerified && activeTab === "overview" && details && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center text-xl font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">الحساب مرتبط ونشط في مركز العمليات</h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    بوت تيليجرام المعتمد: <strong className="font-mono">@{details.bot_username || "InvestorGateBot"}</strong>
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-200 text-emerald-900 rounded-full text-[11px] font-bold">
                متصل ومصرح
              </span>
            </div>

            {/* Profile & Security Context */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 block">الموظف:</span>
                <strong className="text-slate-800">{details.employee?.full_name}</strong>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">المسمى الوظيفي:</span>
                <span className="text-slate-800 font-medium">{details.employee?.job_title || "موظف"}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">حساب المستخدم المرتبط:</span>
                <strong className="text-[#187A5A] font-mono">{details.user?.username || "تم تعيينه تلقائياً"}</strong>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">رتبة النظام (CRM Role):</span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-bold text-[11px]">
                  {details.user?.roles?.join("، ") || "Employee"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">معرف تيليجرام (Telegram User ID):</span>
                <span className="font-mono text-slate-800 font-bold">{details.link?.telegram_user_id || "—"}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">اسم المستخدم في تيليجرام:</span>
                <span className="font-mono text-blue-700 font-bold">
                  {details.link?.telegram_username ? `@${details.link.telegram_username}` : "غير محدد"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">معرف المحادثة (Chat ID):</span>
                <span className="font-mono text-slate-800">{details.link?.telegram_chat_id || "—"}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 block">تاريخ التوثيق والربط:</span>
                <span className="text-slate-600">
                  {details.link?.linked_at ? details.link.linked_at.slice(0, 16).replace("T", " ") : "—"}
                </span>
              </div>
            </div>

            {/* Test Notification Action */}
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <h5 className="text-xs font-bold text-slate-800">اختبار وصول الرسائل المباشرة</h5>
              <div className="flex gap-2">
                <button
                  onClick={handleSendTestMessage}
                  disabled={sendingTest}
                  className="px-4 py-2 bg-[#187A5A] hover:bg-[#123D32] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{sendingTest ? "جاري الإرسال..." : "🔔 إرسال رسالة اختبار لحساب الموظف"}</span>
                </button>
              </div>
              {testResult && (
                <div
                  className={`p-2 rounded-lg text-xs font-medium border ${
                    testResult.success
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>

            {/* Unlink Action */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <button
                onClick={handleUnlink}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                🚫 إلغاء ربط حساب Telegram
              </button>
              <button
                onClick={onClose}
                className="px-5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 2: PERMISSIONS & SCOPE ──────────────────────────────── */}
        {!loading && isVerified && activeTab === "permissions" && details && (
          <TelegramActionPermissions employeeId={employeeId} companyId={companyId} details={details} />
        )}

        {/* ── TAB 3: ACTIVITY & AUDIT LOGS ────────────────────────────── */}
        {!loading && isVerified && activeTab === "activity" && details && (
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-slate-800">أحدث الأنشطة والعمليات المنفذة عبر البوت (Audit Log):</h5>
            {(!details.activity_logs || details.activity_logs.length === 0) ? (
              <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                لا توجد سجلات تفاعل سابقة مسجلة لهذا الحساب حتى الآن.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">الوقت</th>
                      <th className="p-2.5">الإجراء</th>
                      <th className="p-2.5">الحالة</th>
                      <th className="p-2.5">المصدر / التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {details.activity_logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">
                          {log.created_at ? log.created_at.slice(0, 16).replace("T", " ") : "—"}
                        </td>
                        <td className="p-2.5 font-medium text-slate-800">
                          {log.action}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === "Success"
                                ? "bg-emerald-100 text-emerald-800"
                                : log.status === "Unauthorized"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 text-[11px]">
                          {log.error_message ? (
                            <span className="text-rose-600 font-semibold">{log.error_message}</span>
                          ) : log.details ? (
                            <span className="font-mono text-[10px]">{JSON.stringify(log.details)}</span>
                          ) : (
                            log.ip_address || "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 4: MANUAL /START COMMAND LINKING WORKFLOW ────────────── */}
        {!loading && (!isVerified || activeTab === "link_command") && tokenData && (
          <div className="space-y-4">
            {/* Bot Info Banner */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">بوت مركز العمليات المعتمد:</span>
                <strong className="text-blue-900 font-mono text-sm">
                  @{tokenData.bot_username}
                </strong>
              </div>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded text-[10px]">
                صالح لمدة 30 دقيقة
              </span>
            </div>

            {/* Command Box with Prominent Copy Button */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                أمر الربط المخصص (انسخ الأمر بالكامل وأرسله للبوت):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={tokenData.command}
                  className="w-full text-xs font-mono font-bold p-3 bg-slate-900 text-emerald-400 rounded-xl text-left select-all border border-slate-700 shadow-inner"
                />
                <button
                  onClick={handleCopyCommand}
                  className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-[#187A5A] hover:bg-[#123D32] text-white"
                  }`}
                >
                  {copied ? (
                    <span>تم النسخ ✓</span>
                  ) : (
                    <>
                      <CopyIcon size={15} />
                      <span>نسخ الأمر</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step by Step Arabic Instructions */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-700">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>📋</span>
                <span>خطوات إتمام الربط السريع للموظف:</span>
              </h5>
              <ol className="list-decimal list-inside space-y-1.5 leading-relaxed text-slate-600 pr-1">
                <li>
                  افتح تطبيق Telegram وابحث عن البوت:{" "}
                  <strong className="text-[#187A5A] font-mono">@{tokenData.bot_username}</strong>
                </li>
                <li>
                  الصق الأمر المنسوخ أعلاه بالكامل واضغط <strong>إرسال</strong> في المحادثة.
                </li>
                <li>
                  انتظر رسالة ترحيبية من البوت تؤكد اكتمال عملية الربط وتفعيل لوحة العمليات.
                </li>
              </ol>
            </div>

            {/* Live Polling Status Indicator */}
            <div role="status" aria-live="polite" className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <div className="text-xs text-amber-900">
                <span className="font-bold">{linkNotice || "بانتظار إرسال الأمر من الموظف في Telegram..."}</span>
                <span className="block text-[11px] text-amber-700 mt-0.5">
                  يتم فحص حالة التحقق تلقائياً كل ثانيتين وتحديث النظام فورياً فور الإرسال.
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                onClick={startLinkingWorkflow}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                🔄 توليد أمر ربط جديد
              </button>
              <button
                onClick={() => {
                  stopPolling();
                  if (isVerified) {
                    setActiveTab("overview");
                  } else {
                    onClose();
                  }
                }}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                {isVerified ? "رجوع للنظرة العامة" : "إلغاء"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
