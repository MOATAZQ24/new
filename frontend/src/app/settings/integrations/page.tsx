"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface IntegrationItem {
  id: string;
  service_name: string;
  display_name: string;
  is_enabled: boolean;
  status: string;
  config_data: Record<string, any>;
  last_tested_at?: string;
  last_error?: string;
}

interface LogItem {
  id: string;
  service_name: string;
  event_type: string;
  status: string;
  payload: any;
  response_data: any;
  error_message?: string;
  created_at: string;
}

interface TelegramStatusData {
  is_configured: boolean;
  status: string;
  readiness_summary: string;
  bot_username: string;
  bot_token_masked?: string;
  is_enabled: boolean;
  webhook_endpoint: string;
  notification_rules: Record<string, boolean>;
  stats: {
    linked_employees: number;
    total_active_employees: number;
    outbox_pending: number;
    outbox_sent: number;
    outbox_failed: number;
  };
}

interface EmployeeLinkItem {
  employee_id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  is_linked: boolean;
  is_pending_verification: boolean;
  telegram_username?: string;
  telegram_chat_id?: string;
  telegram_user_id?: string;
  linked_at?: string;
  token_expires_at?: string;
  bot_username: string;
}

interface OutboxItem {
  id: string;
  event_type: string;
  recipient_chat_id?: string;
  message_text: string;
  status: string;
  retry_count: number;
  max_retries: number;
  idempotency_key: string;
  last_error?: string;
  scheduled_at: string;
  sent_at?: string;
  created_at: string;
}

export default function IntegrationsCenterPage() {
  const { activeCompanyId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"general" | "telegram">("general");

  // General Integrations State
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logServiceFilter, setLogServiceFilter] = useState("");

  // Config Modal State
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<any>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingService, setTestingService] = useState<string | null>(null);

  // Telegram Readiness & Linking State
  const [tgStatus, setTgStatus] = useState<TelegramStatusData | null>(null);
  const [employeeLinks, setEmployeeLinks] = useState<EmployeeLinkItem[]>([]);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [tgLoading, setTgLoading] = useState(false);

  // Bot Config Form State
  const [botTokenInput, setBotTokenInput] = useState("");
  const [botUsernameInput, setBotUsernameInput] = useState("InvestorGateBot");
  const [rulesState, setRulesState] = useState<Record<string, boolean>>({
    notify_on_assigned: true,
    notify_on_accepted: true,
    notify_on_started: true,
    notify_on_completed: true,
    notify_on_overdue: true,
    notify_on_reassigned: true,
  });

  // Token Generation Modal
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [generatedTokenData, setGeneratedTokenData] = useState<any>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  // Bot Action Simulation Modal
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simEmployeeId, setSimEmployeeId] = useState("");
  const [simTaskId, setSimTaskId] = useState("");
  const [simActionType, setSimActionType] = useState("act:accept");
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);
  const [companyTasks, setCompanyTasks] = useState<any[]>([]);

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await api.get("/integrations");
      setIntegrations(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      let url = "/integrations/logs/list";
      if (logServiceFilter) url += `?service_name=${logServiceFilter}`;
      const res = await api.get(url);
      setLogs(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchTelegramData = async () => {
    setTgLoading(true);
    try {
      const [statusRes, linksRes, outboxRes, tasksRes] = await Promise.allSettled([
        api.get("/telegram/status"),
        api.get("/telegram/links/list"),
        api.get("/telegram/outbox?per_page=20"),
        api.get("/tasks?per_page=50"),
      ]);

      if (statusRes.status === "fulfilled" && statusRes.value.data) {
        const d: TelegramStatusData = statusRes.value.data;
        setTgStatus(d);
        setBotUsernameInput(d.bot_username || "InvestorGateBot");
        if (d.notification_rules) {
          setRulesState(d.notification_rules);
        }
      }

      if (linksRes.status === "fulfilled") {
        setEmployeeLinks(linksRes.value.data || []);
      }

      if (outboxRes.status === "fulfilled") {
        setOutboxItems(outboxRes.value.data || []);
      }

      if (tasksRes.status === "fulfilled") {
        setCompanyTasks(tasksRes.value.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTgLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    fetchLogs();
    fetchTelegramData();
  }, [activeCompanyId, logServiceFilter]);

  const handleToggleEnable = async (item: IntegrationItem) => {
    try {
      await api.put(`/integrations/${item.service_name}`, {
        is_enabled: !item.is_enabled,
      });
      fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "فشل تحديث الحالة");
    }
  };

  const handleTestConnection = async (serviceName: string) => {
    setTestingService(serviceName);
    setTestResult(null);
    try {
      const res = await api.post(`/integrations/${serviceName}/test`);
      setTestResult(res.data);
      fetchIntegrations();
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || "فشل الاتصال" });
    } finally {
      setTestingService(null);
    }
  };

  const openConfigModal = (item: IntegrationItem) => {
    if (item.service_name === "telegram") {
      setActiveTab("telegram");
      return;
    }
    setActiveModal(item.service_name);
    setCurrentConfig({ ...(item.config_data || {}) });
    setTestResult(null);
  };

  const handleSaveConfig = async (serviceName: string) => {
    setSavingConfig(true);
    try {
      await api.put(`/integrations/${serviceName}`, {
        config_data: currentConfig,
      });
      setActiveModal(null);
      fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "فشل حفظ الإعدادات");
    } finally {
      setSavingConfig(false);
    }
  };

  // Telegram Specific Handlers
  const handleSaveTelegramConfig = async () => {
    setSavingConfig(true);
    try {
      const payload: any = {
        bot_username: botUsernameInput,
        ...rulesState,
      };
      if (botTokenInput) {
        payload.bot_token = botTokenInput;
      }
      await api.put("/telegram/config", payload);
      alert("تم حفظ إعدادات Telegram بنجاح!");
      setBotTokenInput("");
      fetchTelegramData();
    } catch (err: any) {
      alert(err?.message || "فشل حفظ إعدادات تليجرام");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateToken = async (employeeId: string) => {
    setGeneratingToken(true);
    try {
      const res = await api.post("/telegram/links/generate-token", {
        employee_id: employeeId,
        expires_in_minutes: 30,
      });
      setGeneratedTokenData(res.data);
      setTokenModalOpen(true);
      fetchTelegramData();
    } catch (err: any) {
      alert(err?.message || "فشل توليد رمز الربط");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleUnlinkEmployee = async (employeeId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من إلغاء ربط حساب تليجرام للموظف "${name}"؟`)) return;
    try {
      await api.delete(`/telegram/links/${employeeId}`);
      fetchTelegramData();
    } catch (err: any) {
      alert(err?.message || "فشل إلغاء الربط");
    }
  };

  const handleDispatchOutbox = async () => {
    try {
      const res = await api.post("/telegram/outbox/dispatch");
      const d = res.data;
      alert(`تم تشغيل المعالج! تمت معالجة ${d.processed} عنصر (مرسل: ${d.sent}، بانتظار البوت: ${d.ready_awaiting_token})`);
      fetchTelegramData();
    } catch (err: any) {
      alert(err?.message || "فشل تشغيل المعالج");
    }
  };

  const handleSimulateBotAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    const emp = employeeLinks.find((l) => l.employee_id === simEmployeeId);
    const tgUserId = emp?.telegram_user_id || "987654321";

    let actionStr = simActionType;
    if (simActionType !== "cmd:my_tasks") {
      actionStr = `${simActionType}:${simTaskId}`;
    }

    try {
      const res = await api.post("/telegram/simulate-action", {
        telegram_user_id: tgUserId,
        action_str: actionStr,
      });
      setSimResult(res.data);
      fetchTelegramData();
    } catch (err: any) {
      setSimResult({
        success: false,
        status: "Error",
        message: err?.response?.data?.detail || err?.message || "فشلت المحاكاة",
      });
    } finally {
      setSimulating(false);
    }
  };

  const getServiceIcon = (name: string) => {
    switch (name) {
      case "n8n":
        return <Icons.Tasks size={24} className="text-rose-600" />;
      case "telegram":
        return <Icons.Send size={24} className="text-blue-500" />;
      case "gemini":
        return <Icons.ShieldCheck size={24} className="text-[#187A5A]" />;
      default:
        return <Icons.Settings size={24} className="text-slate-500" />;
    }
  };

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              الإعدادات
            </Link>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs text-[#187A5A] font-bold">مركز التكامل والربط الذكي</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
            مركز التكامل والربط الذكي (Integrations & Automations)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة جاهزية بوت تليجرام، معالج الإشعارات (Transactional Outbox)، وأتمتة العمليات عبر n8n و Gemini
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-200/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("general")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "general" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            التكاملات العامة
          </button>
          <button
            onClick={() => setActiveTab("telegram")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "telegram" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icons.Send size={14} className="text-blue-500" />
            <span>بوت تليجرام وإدارة المهام (Telegram Bot)</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GENERAL INTEGRATIONS */}
      {activeTab === "general" && (
        <div className="space-y-6">
          {/* Integration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {integrations.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                      {getServiceIcon(item.service_name)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === "Connected"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : item.status === "Error"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {item.service_name === "telegram"
                          ? "جاهز للربط (Ready)"
                          : item.status === "Connected"
                          ? "متصل (Connected)"
                          : "غير مهيأ"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h2 className="text-base font-bold text-slate-900">{item.display_name}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.service_name === "n8n"
                        ? "إرسال أحداث التذاكر والأصول إلى سير عمل n8n لتنفيذ مهام تلقائية مخصصة."
                        : item.service_name === "telegram"
                        ? "جاهزية كاملة لربط الموظفين والمهام عبر تليجرام مع دعم معالج الإرسال والأزرار التفاعلية."
                        : "تحليل تذاكر الدعم وتصنيفها واقتراح حلول فورية باستخدام Gemini AI."}
                    </p>
                  </div>

                  {item.last_tested_at && (
                    <div className="mt-4 text-[10px] text-slate-400 font-mono">
                      آخر فحص: {new Date(item.last_tested_at).toLocaleString("ar-SA")}
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  {canManage && (
                    <button
                      onClick={() => handleToggleEnable(item)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        item.is_enabled
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.is_enabled ? "مفعّل (Active)" : "معطّل (Disabled)"}
                    </button>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openConfigModal(item)}
                      className="px-3 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      {item.service_name === "telegram" ? "إدارة الجاهزية" : "تهيئة"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Logs Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">سجل أحداث التكامل والربط (Integration Events Log)</h3>
              <button
                onClick={fetchLogs}
                className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg cursor-pointer"
              >
                <Icons.Refresh size={14} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3.5">المنصة</th>
                    <th className="p-3.5">نوع الحدث</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">التفاصيل</th>
                    <th className="p-3.5">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        لا توجد أحداث مسجلة حتى الآن
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 font-bold font-mono text-slate-800">{log.service_name.toUpperCase()}</td>
                        <td className="p-3.5 font-mono text-[#187A5A]">{log.event_type}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === "Success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {log.status === "Success" ? "ناجح" : "فشل"}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500 text-[11px] max-w-xs truncate">
                          {log.error_message || JSON.stringify(log.payload || {})}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400">
                          {new Date(log.created_at).toLocaleString("ar-SA")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TELEGRAM BOT INTEGRATION READINESS */}
      {activeTab === "telegram" && (
        <div className="space-y-6">
          {/* Readiness Banner & KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 bg-gradient-to-r from-[#123D32] to-[#187A5A] rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icons.Send size={20} className="text-[#C5A46D]" />
                    <span className="font-bold text-sm">جاهزية تكامل Telegram Bot</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-xs">
                    {tgStatus?.is_configured ? "متصل حي (Live Bot)" : "جاهز للربط (Prepared)"}
                  </span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">
                  {tgStatus?.readiness_summary ||
                    "تم تجهيز البنية بالكامل: معالج الإرسال الموثوق، رموز التحقق المؤقتة، وأزرار المهام التفاعلية. النظام يعمل باستقلالية تامة ولا يتأثر بغياب البوت."}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span>اسم البوت المعتمد: @{tgStatus?.bot_username || "InvestorGateBot"}</span>
                <button
                  onClick={handleDispatchOutbox}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Icons.Refresh size={12} />
                  <span>معالجة صندوق الإرسال</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
              <span className="text-xs text-slate-500 font-medium">الموظفون المرتبطون بالتليجرام</span>
              <div className="text-2xl font-bold text-slate-900 my-1">
                {tgStatus?.stats.linked_employees || 0}
                <span className="text-xs text-slate-400 font-normal mr-1">
                  / {tgStatus?.stats.total_active_employees || 0}
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 font-medium">جاهزون لتلقي إشعارات المهام</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
              <span className="text-xs text-slate-500 font-medium">صندوق الإرسال (Outbox Queue)</span>
              <div className="text-2xl font-bold text-slate-900 my-1">
                {tgStatus?.stats.outbox_pending || 0}
                <span className="text-xs text-slate-400 font-normal mr-1">قيد الانتظار</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span className="text-emerald-600">تم إرسال: {tgStatus?.stats.outbox_sent || 0}</span>
                <span>•</span>
                <span className="text-rose-600">فشل: {tgStatus?.stats.outbox_failed || 0}</span>
              </div>
            </div>
          </div>

          {/* Bot Configuration & Notification Rules Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-1">إعدادات البوت وقواعد الإشعارات للمهام</h3>
            <p className="text-xs text-slate-500 mb-4">
              يمكنك ضبط رمز Bot Token وتحديد الأحداث التشغيلية التي يتم تحويلها تلقائياً إلى إشعارات في تليجرام.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Credentials & Webhook */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رمز البوت (Bot Token) — يتم حفظه مشفراً ولا يظهر بالنص الصريح
                  </label>
                  <input
                    type="password"
                    placeholder={tgStatus?.bot_token_masked || "أدخل رمز البوت من BotFather (اختياري حالياً)..."}
                    value={botTokenInput}
                    onChange={(e) => setBotTokenInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-[#187A5A]"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    يمكنك ترك الرمز فارغاً أثناء مرحلة التطوير والجاهزية.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم مستخدم البوت (Bot Username)
                  </label>
                  <input
                    type="text"
                    value={botUsernameInput}
                    onChange={(e) => setBotUsernameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-[#187A5A]"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رابط الاستقبال الحي (Webhook Endpoint)
                  </label>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 select-all">
                    {typeof window !== "undefined" ? window.location.origin : "http://localhost:8000"}
                    /api/v1/telegram/webhook
                  </div>
                </div>
              </div>

              {/* Right Column: Notification Rules */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-800 block mb-2">
                  الأحداث التشغيلية للمهام (Task Events):
                </span>

                {[
                  { key: "notify_on_assigned", label: "إسناد مهمة جديدة (task.assigned)", desc: "إشعار الفني فور إسناد مهمة جديدة مع أزرار القبول والبدء" },
                  { key: "notify_on_accepted", label: "قبول المهمة (task.accepted)", desc: "تأكيد استلام المهمة والانتقال إلى قيد التنفيذ" },
                  { key: "notify_on_started", label: "بدء العمل على المهمة (task.started)", desc: "إشعار ببدء التنفيذ الفعلي" },
                  { key: "notify_on_completed", label: "إكمال المهمة (task.completed)", desc: "إشعار بإغلاق المهمة وإنجازها" },
                  { key: "notify_on_overdue", label: "تجاوز الموعد المحدد (task.overdue)", desc: "تنبيه أمني في حال تأخر المهمة عن تاريخ الاستحقاق" },
                  { key: "notify_on_reassigned", label: "إعادة إسناد المهمة (task.reassigned)", desc: "إشعار عند تغيير الفني المسؤول عن المهمة" },
                ].map((rule) => (
                  <label key={rule.key} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rulesState[rule.key] !== false}
                      onChange={(e) => setRulesState({ ...rulesState, [rule.key]: e.target.checked })}
                      className="mt-0.5 rounded text-[#187A5A] focus:ring-[#187A5A]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{rule.label}</span>
                      <span className="text-[11px] text-slate-500">{rule.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSimModalOpen(true)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Icons.Tasks size={14} />
                <span>محاكي إجراءات البوت (Bot Action Simulator)</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTelegramConfig}
                disabled={savingConfig}
                className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? "جاري الحفظ..." : "حفظ إعدادات تليجرام"}
              </button>
            </div>
          </div>

          {/* Employee Linking Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">سجل ربط حسابات الموظفين (Employee Telegram Links)</h3>
                <p className="text-xs text-slate-500">
                  ربط ملفات الموظفين التقنيين بحسابات تليجرام عبر رموز تحقق مشفرة وأحادية الاستخدام
                </p>
              </div>

              <button
                onClick={fetchTelegramData}
                className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg cursor-pointer"
                title="تحديث القائمة"
              >
                <Icons.Refresh size={14} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3.5">اسم الموظف</th>
                    <th className="p-3.5">المسمى الوظيفي</th>
                    <th className="p-3.5">حساب التليجرام</th>
                    <th className="p-3.5">حالة الربط</th>
                    <th className="p-3.5">تاريخ الربط</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employeeLinks.map((emp) => (
                    <tr key={emp.employee_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3.5 font-bold text-slate-800">
                        {emp.full_name}
                        <span className="block text-[10px] text-slate-400 font-mono">{emp.employee_number}</span>
                      </td>
                      <td className="p-3.5 text-slate-600">{emp.job_title}</td>
                      <td className="p-3.5 font-mono">
                        {emp.telegram_username ? (
                          <span className="text-blue-600 font-semibold">@{emp.telegram_username}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {emp.is_linked ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            مرتبط ومفعل
                          </span>
                        ) : emp.is_pending_verification ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            بانتظار التحقق
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                            غير مرتبط
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-400">
                        {emp.linked_at ? new Date(emp.linked_at).toLocaleString("ar-SA") : "—"}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!emp.is_linked ? (
                            <button
                              onClick={() => handleGenerateToken(emp.employee_id)}
                              disabled={generatingToken}
                              className="px-2.5 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              توليد رمز ربط
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnlinkEmployee(emp.employee_id, emp.full_name)}
                              className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              إلغاء الربط
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outbox Notifications Queue Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">صندوق إرسال الإشعارات (Transactional Outbox)</h3>
                <p className="text-xs text-slate-500">
                  سجل الإشعارات المجدولة والمرسلة للمهام مع ضمان عدم التكرار (Idempotency) وحفظ المحاولات
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDispatchOutbox}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Icons.Refresh size={14} />
                  <span>معالجة الآن</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3.5">نوع الحدث</th>
                    <th className="p-3.5">معرف المحادثة</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">نص الإشعار</th>
                    <th className="p-3.5">المحاولات</th>
                    <th className="p-3.5">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outboxItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        لا توجد إشعارات في صندوق الإرسال حتى الآن
                      </td>
                    </tr>
                  ) : (
                    outboxItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 font-bold font-mono text-[#187A5A]">{item.event_type}</td>
                        <td className="p-3.5 font-mono text-slate-600">{item.recipient_chat_id || "غير متوفر"}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.status === "Sent"
                                ? "bg-emerald-50 text-emerald-700"
                                : item.status === "Failed"
                                ? "bg-rose-50 text-rose-700"
                                : item.status === "Pending"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-700 max-w-sm truncate" title={item.message_text}>
                          {item.message_text.replace(/<[^>]+>/g, " ")}
                        </td>
                        <td className="p-3.5 font-mono text-slate-500">
                          {item.retry_count} / {item.max_retries}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400">
                          {new Date(item.created_at).toLocaleString("ar-SA")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Token Generated Modal */}
      <Modal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        title="رمز ربط حساب تليجرام للموظف"
        maxWidth="max-w-md"
      >
        {generatedTokenData && (
          <div className="space-y-4 text-right">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-xs text-slate-500 block mb-1">رمز التحقق السريع (PIN):</span>
              <span className="text-3xl font-bold font-mono text-[#187A5A] tracking-widest block">
                {generatedTokenData.pin_code}
              </span>
              <span className="text-[11px] text-amber-700 font-semibold mt-1 block">
                صالح لمدة 30 دقيقة للاستخدام لمرة واحدة فقط
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">طريقة الربط للموظف:</span>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. فتح تطبيق Telegram والبحث عن البوت: <b>@{generatedTokenData.bot_username}</b>
                <br />
                2. إرسال الأمر: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-blue-700">/start {generatedTokenData.token}</code>
                <br />
                أو النقر مباشرة على الرابط السريع أدناه:
              </p>
              <a
                href={generatedTokenData.deep_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Icons.Send size={14} />
                <span>فتح المحادثة في Telegram وبدء الربط</span>
              </a>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setTokenModalOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bot Action Simulation Modal */}
      <Modal
        isOpen={simModalOpen}
        onClose={() => {
          setSimModalOpen(false);
          setSimResult(null);
        }}
        title="محاكي إجراءات Telegram Bot (Live Action Simulator)"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSimulateBotAction} className="space-y-4 text-right">
          <p className="text-xs text-slate-500">
            يمكنك محاكاة نقرات الأزرار التفاعلية التي يرسلها الفني في Telegram للتحقق من انتقال حالات المهام والصلاحيات دون الحاجة لبوت حقيقي.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختر الموظف (المحاكي):
            </label>
            <select
              value={simEmployeeId}
              onChange={(e) => setSimEmployeeId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="">-- اختر موظفاً --</option>
              {employeeLinks.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.full_name} ({emp.job_title}) {emp.is_linked ? "— [مرتبط]" : "— [غير مرتبط]"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              نوع الإجراء التفاعلي:
            </label>
            <select
              value={simActionType}
              onChange={(e) => setSimActionType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="act:accept">قبول المهمة (Accept Task)</option>
              <option value="act:start">بدء التنفيذ (Start Task)</option>
              <option value="act:done">إكمال المهمة (Complete Task)</option>
              <option value="act:info">استعراض التفاصيل (Task Details)</option>
              <option value="cmd:my_tasks">عرض مهامي النشطة (My Tasks)</option>
            </select>
          </div>

          {simActionType !== "cmd:my_tasks" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اختر المهمة المستهدفة:
              </label>
              <select
                value={simTaskId}
                onChange={(e) => setSimTaskId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">-- اختر مهمة --</option>
                {companyTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} [الحالة: {t.status}]
                  </option>
                ))}
              </select>
            </div>
          )}

          {simResult && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                simResult.success
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}
            >
              <span className="font-bold block mb-1">
                {simResult.success ? "استجابة البوت الناجحة:" : "تم رفض الإجراء:"}
              </span>
              <p className="whitespace-pre-wrap font-sans text-xs">{simResult.message}</p>
            </div>
          )}

          <div className="pt-2 flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                setSimModalOpen(false);
                setSimResult(null);
              }}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="submit"
              disabled={simulating}
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {simulating ? "جاري المعالجة..." : "تنفيذ الإجراء"}
            </button>
          </div>
        </form>
      </Modal>

      {/* n8n Modal */}
      <Modal
        isOpen={activeModal === "n8n"}
        onClose={() => setActiveModal(null)}
        title="تهيئة تكامل n8n Webhook"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رابط الـ Webhook (n8n Production URL) *
            </label>
            <input
              type="url"
              placeholder="https://n8n.example.com/webhook/..."
              value={currentConfig.webhook_url || ""}
              onChange={(e) => setCurrentConfig({ ...currentConfig, webhook_url: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono text-left"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ترويسة المصادقة (Header Authorization)
            </label>
            <input
              type="text"
              placeholder="Bearer secret_token_xyz"
              value={currentConfig.auth_header || ""}
              onChange={(e) => setCurrentConfig({ ...currentConfig, auth_header: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono text-left"
              dir="ltr"
            />
          </div>

          <div className="pt-2 flex justify-between items-center">
            <button
              type="button"
              onClick={() => handleTestConnection("n8n")}
              disabled={testingService === "n8n"}
              className="px-3 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {testingService === "n8n" ? "جاري الاختبار..." : "اختبار الاتصال"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig("n8n")}
                disabled={savingConfig}
                className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Gemini Modal */}
      <Modal
        isOpen={activeModal === "gemini"}
        onClose={() => setActiveModal(null)}
        title="تهيئة تكامل Google Gemini AI"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مفتاح API الخاص بـ Google Gemini *
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={currentConfig.api_key || ""}
              onChange={(e) => setCurrentConfig({ ...currentConfig, api_key: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono text-left"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">النموذج (Model)</label>
            <select
              value={currentConfig.model || "gemini-2.0-flash"}
              onChange={(e) => setCurrentConfig({ ...currentConfig, model: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            >
              <option value="gemini-2.0-flash">Gemini 2.0 Flash (سريع ودقيق)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (تحليلي متقدم)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-between items-center">
            <button
              type="button"
              onClick={() => handleTestConnection("gemini")}
              disabled={testingService === "gemini"}
              className="px-3 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {testingService === "gemini" ? "جاري الاختبار..." : "اختبار الاتصال"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig("gemini")}
                disabled={savingConfig}
                className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
