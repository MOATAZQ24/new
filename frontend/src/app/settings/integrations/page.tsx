"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import TelegramLinkingModal from "@/components/telegram/TelegramLinkingModal";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

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
  has_bot_token?: boolean;
  chat_id?: string;
  is_enabled: boolean;
  last_tested_at?: string;
  last_error?: string;
  worker_status?: {
    is_running: boolean;
    status_label: string;
    last_heartbeat?: string;
    pid?: number;
    offset?: number;
    mode?: string;
  };
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
  branch_name?: string;
  department_name?: string;
  is_linked: boolean;
  is_pending_verification: boolean;
  telegram_username?: string;
  telegram_chat_id?: string;
  telegram_user_id?: string;
  linked_at?: string;
  token_expires_at?: string;
  last_interaction_at?: string;
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

interface BotMenuItem {
  id: string;
  company_id: string;
  label: string;
  action: string;
  menu_type: string;
  sort_order: number;
  is_enabled: boolean;
  icon?: string;
  description_ar?: string;
}

interface MessageTemplateItem {
  id: string;
  company_id: string;
  template_key: string;
  title_ar: string;
  content_ar: string;
  is_active: boolean;
}

export default function IntegrationsCenterPage() {
  const toast = useToast();
  const { activeCompanyId, user, currentCompany } = useAuth();
  
  // Multi-Company selection state (for Super Admin)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(activeCompanyId || "");

  // Active Tab
  const [activeTab, setActiveTab] = useState<"general" | "telegram" | "employees" | "menu_builder" | "templates">("general");

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
  const [chatIdInput, setChatIdInput] = useState("");
  const [isTgEnabled, setIsTgEnabled] = useState(false);
  const [testingTgConnection, setTestingTgConnection] = useState(false);
  const [sendingTgTestNotification, setSendingTgTestNotification] = useState(false);
  const [tgFeedback, setTgFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [rulesState, setRulesState] = useState<Record<string, boolean>>({
    notify_on_assigned: true,
    notify_on_accepted: true,
    notify_on_started: true,
    notify_on_completed: true,
    notify_on_overdue: true,
    notify_on_reassigned: true,
  });

  // Telegram Linking State
  const [linkModalEmployee, setLinkModalEmployee] = useState<{ id: string; name: string } | null>(null);
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

  // Employee Filter
  const [empSearch, setEmpSearch] = useState("");

  // Bot Menu Builder State
  const [menuItems, setMenuItems] = useState<BotMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<Partial<BotMenuItem> | null>(null);
  const [savingMenuItem, setSavingMenuItem] = useState(false);
  const [publishingCommands, setPublishingCommands] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Message Templates State
  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("welcome");
  const [templateEditTitle, setTemplateEditTitle] = useState("");
  const [templateEditContent, setTemplateEditContent] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [previewRendered, setPreviewRendered] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [testSendChatId, setTestSendChatId] = useState("");
  const [testingSendTemplate, setTestingSendTemplate] = useState(false);

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const getCompanyQuery = () => {
    const cid = selectedCompanyId || activeCompanyId;
    return cid ? `?company_id=${cid}` : "";
  };

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/integrations${getCompanyQuery()}`);
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
      const cid = selectedCompanyId || activeCompanyId;
      let url = `/integrations/logs/list?page=1&per_page=30`;
      if (cid) url += `&company_id=${cid}`;
      if (logServiceFilter) url += `&service_name=${logServiceFilter}`;
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
    const cidParam = getCompanyQuery();
    try {
      const [statusRes, linksRes, outboxRes, tasksRes] = await Promise.allSettled([
        api.get(`/telegram/status${cidParam}`),
        api.get(`/telegram/links/list${cidParam}`),
        api.get(`/telegram/outbox${cidParam ? cidParam + "&per_page=20" : "?per_page=20"}`),
        api.get(`/tasks?per_page=50`),
      ]);

      if (statusRes.status === "fulfilled" && statusRes.value.data) {
        const d: TelegramStatusData = statusRes.value.data;
        setTgStatus(d);
        setBotUsernameInput(d.bot_username || "InvestorGateBot");
        if (d.chat_id) setChatIdInput(d.chat_id);
        setIsTgEnabled(Boolean(d.is_enabled));
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

  const fetchMenuData = async () => {
    setMenuLoading(true);
    try {
      const res = await api.get(`/telegram/menu${getCompanyQuery()}`);
      setMenuItems(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setMenuLoading(false);
    }
  };

  const fetchTemplatesData = async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get(`/telegram/templates${getCompanyQuery()}`);
      const list: MessageTemplateItem[] = res.data || [];
      setTemplates(list);
      if (list.length > 0) {
        const current = list.find((t) => t.template_key === selectedTemplateKey) || list[0];
        setSelectedTemplateKey(current.template_key);
        setTemplateEditTitle(current.title_ar);
        setTemplateEditContent(current.content_ar);
        updatePreview(current.template_key, current.content_ar);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const updatePreview = async (key: string, content: string) => {
    setPreviewLoading(true);
    try {
      const res = await api.post(`/telegram/templates/${key}/preview${getCompanyQuery()}`, {
        template_key: key,
        content_ar: content,
      });
      setPreviewRendered(res.data?.rendered || "");
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (activeCompanyId && !selectedCompanyId) {
      setSelectedCompanyId(activeCompanyId);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    fetchIntegrations();
    fetchLogs();
    fetchTelegramData();
    fetchMenuData();
    fetchTemplatesData();
  }, [selectedCompanyId, logServiceFilter]);

  const handleToggleEnable = async (item: IntegrationItem) => {
    try {
      await api.put(`/integrations/${item.service_name}${getCompanyQuery()}`, {
        is_enabled: !item.is_enabled,
      });
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err?.message || "فشل تحديث الحالة");
    }
  };

  const handleTestConnection = async (serviceName: string) => {
    setTestingService(serviceName);
    setTestResult(null);
    try {
      const res = await api.post(`/integrations/${serviceName}/test${getCompanyQuery()}`);
      setTestResult(res.data);
      fetchIntegrations();
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || "فشل الاتصال" });
    } finally {
      setTestingService(null);
    }
  };

  const openConfigModal = (item: IntegrationItem) => {
    setActiveModal(item.service_name);
    setCurrentConfig({ ...(item.config_data || {}) });
    setTestResult(null);
    setTgFeedback(null);
    if (item.service_name === "telegram") {
      setBotTokenInput("");
      setChatIdInput(item.config_data?.chat_id || tgStatus?.chat_id || chatIdInput || "");
      setIsTgEnabled(item.is_enabled);
    }
  };

  const handleSaveConfig = async (serviceName: string) => {
    setSavingConfig(true);
    try {
      await api.put(`/integrations/${serviceName}${getCompanyQuery()}`, {
        config_data: currentConfig,
      });
      setActiveModal(null);
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err?.message || "فشل حفظ الإعدادات");
    } finally {
      setSavingConfig(false);
    }
  };

  // Telegram Specific Handlers
  const handleTestTgConnection = async (tokenOverride?: string) => {
    setTestingTgConnection(true);
    setTgFeedback(null);
    try {
      const payload: any = {};
      const tok = (tokenOverride || botTokenInput || "").trim();
      if (tok) payload.bot_token = tok;
      const res = await api.post(`/telegram/test-connection${getCompanyQuery()}`, payload);
      setTgFeedback({
        success: res.data?.success !== false,
        message: res.data?.message || "تم التحقق من الاتصال بنجاح!",
      });
      fetchTelegramData();
      fetchIntegrations();
    } catch (err: any) {
      setTgFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل فحص الاتصال بـ Telegram",
      });
    } finally {
      setTestingTgConnection(false);
    }
  };

  const handleSendTgTestNotification = async (chatIdOverride?: string) => {
    setSendingTgTestNotification(true);
    setTgFeedback(null);
    try {
      const cid = (chatIdOverride || chatIdInput || "").trim();
      const res = await api.post(`/telegram/test-notification${getCompanyQuery()}`, { chat_id: cid || undefined });
      setTgFeedback({
        success: res.data?.success !== false,
        message: res.data?.message || "تم إرسال الإشعار التجريبي بنجاح إلى تليجرام!",
      });
      fetchTelegramData();
      fetchLogs();
    } catch (err: any) {
      setTgFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل إرسال الإشعار التجريبي",
      });
    } finally {
      setSendingTgTestNotification(false);
    }
  };

  const handleSaveTelegramConfig = async () => {
    setSavingConfig(true);
    try {
      const payload: any = {
        bot_username: botUsernameInput,
        chat_id: chatIdInput,
        is_enabled: isTgEnabled,
        ...rulesState,
      };
      if (botTokenInput) {
        payload.bot_token = botTokenInput;
      }
      await api.put(`/telegram/config${getCompanyQuery()}`, payload);
      setTgFeedback({
        success: true,
        message: "تم حفظ إعدادات Telegram بنجاح!",
      });
      setBotTokenInput("");
      fetchTelegramData();
      fetchIntegrations();
      if (activeModal === "telegram") {
        setActiveModal(null);
      }
    } catch (err: any) {
      setTgFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل حفظ إعدادات تليجرام",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateToken = async (employeeId: string) => {
    setGeneratingToken(true);
    try {
      const res = await api.post(`/telegram/links/generate-token${getCompanyQuery()}`, {
        employee_id: employeeId,
        expires_in_minutes: 30,
      });
      setGeneratedTokenData(res.data);
      setTokenModalOpen(true);
      fetchTelegramData();
    } catch (err: any) {
      toast.error(err?.message || "فشل توليد رمز الربط");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleUnlinkEmployee = async (employeeId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من إلغاء ربط حساب تليجرام للموظف "${name}"؟\nسيتم إيقاف صلاحية البوت فوراً دون حذف سجلات الموظف أو مهامه.`)) return;
    try {
      await api.delete(`/telegram/links/${employeeId}${getCompanyQuery()}`);
      fetchTelegramData();
    } catch (err: any) {
      toast.error(err?.message || "فشل إلغاء الربط");
    }
  };

  const handleRelinkEmployee = async (employeeId: string, name: string) => {
    if (!confirm(`إعادة ربط حساب الموظف "${name}"؟\nسيتم إبطال أي جلسة سابقة وتوليد رمز ربط مشفر جديد.`)) return;
    try {
      await api.delete(`/telegram/links/${employeeId}${getCompanyQuery()}`).catch(() => {});
      await handleGenerateToken(employeeId);
    } catch (err: any) {
      toast.error(err?.message || "فشل إعادة الربط");
    }
  };

  const handleDispatchOutbox = async () => {
    try {
      const res = await api.post("/telegram/outbox/dispatch");
      const d = res.data;
      toast.success(`تم تشغيل المعالج! تمت معالجة ${d.processed} عنصر (مرسل: ${d.sent}، بانتظار البوت: ${d.ready_awaiting_token})`);
      fetchTelegramData();
    } catch (err: any) {
      toast.error(err?.message || "فشل تشغيل المعالج");
    }
  };

  const handleSimulateBotAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    const emp = employeeLinks.find((l) => l.employee_id === simEmployeeId);
    const tgUserId = emp?.telegram_user_id || "5451561520";

    let fullAction = simActionType;
    if (simActionType !== "cmd:my_tasks") {
      if (!simTaskId) {
        toast.warning("يرجى اختيار المهمة للمحاكاة");
        setSimulating(false);
        return;
      }
      fullAction = `${simActionType}:${simTaskId}`;
    }

    try {
      const res = await api.post("/telegram/simulate-action", {
        telegram_user_id: tgUserId,
        action_str: fullAction,
      });
      setSimResult(res.data);
      fetchTelegramData();
    } catch (err: any) {
      setSimResult({ success: false, message: err?.response?.data?.detail || err?.message });
    } finally {
      setSimulating(false);
    }
  };

  // Menu Builder Actions
  const handleOpenAddMenuModal = () => {
    setEditingMenuItem({
      label: "",
      action: "cmd:my_tasks",
      menu_type: "reply_keyboard",
      sort_order: menuItems.length + 1,
      is_enabled: true,
      icon: "📋",
      description_ar: "",
    });
    setMenuModalOpen(true);
  };

  const handleOpenEditMenuModal = (item: BotMenuItem) => {
    setEditingMenuItem({ ...item });
    setMenuModalOpen(true);
  };

  const handleSaveMenuItem = async () => {
    if (!editingMenuItem || !editingMenuItem.label || !editingMenuItem.action) {
      toast.warning("يرجى كتابة عنوان الزر وتحديد الإجراء");
      return;
    }
    setSavingMenuItem(true);
    try {
      if (editingMenuItem.id) {
        await api.put(`/telegram/menu/${editingMenuItem.id}${getCompanyQuery()}`, editingMenuItem);
      } else {
        await api.post(`/telegram/menu${getCompanyQuery()}`, editingMenuItem);
      }
      setMenuModalOpen(false);
      setEditingMenuItem(null);
      fetchMenuData();
    } catch (err: any) {
      toast.error(err?.message || "فشل حفظ عنصر القائمة");
    } finally {
      setSavingMenuItem(false);
    }
  };

  const handleDeleteMenuItem = async (id: string, label: string) => {
    if (!confirm(`هل تريد حذف الزر "${label}" من قائمة البوت؟`)) return;
    try {
      await api.delete(`/telegram/menu/${id}${getCompanyQuery()}`);
      fetchMenuData();
    } catch (err: any) {
      toast.error(err?.message || "فشل حذف الزر");
    }
  };

  const handleMoveMenuOrder = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= menuItems.length) return;

    const newItems = [...menuItems];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    const payload = {
      items: newItems.map((item, idx) => ({ id: item.id, sort_order: idx + 1 })),
    };

    try {
      await api.post(`/telegram/menu/reorder${getCompanyQuery()}`, payload);
      fetchMenuData();
    } catch (err: any) {
      toast.error(err?.message || "فشل إعادة الترتيب");
    }
  };

  const handlePublishMenuCommands = async () => {
    setPublishingCommands(true);
    setPublishFeedback(null);
    try {
      const res = await api.post(`/telegram/menu/publish${getCompanyQuery()}`);
      setPublishFeedback({
        success: true,
        message: res.message || "تم نشر وتحديث أوامر البوت على Telegram بنجاح!",
      });
    } catch (err: any) {
      setPublishFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل نشر الأوامر إلى Telegram",
      });
    } finally {
      setPublishingCommands(false);
    }
  };

  // Message Templates Actions
  const handleSelectTemplate = (tmpl: MessageTemplateItem) => {
    setSelectedTemplateKey(tmpl.template_key);
    setTemplateEditTitle(tmpl.title_ar);
    setTemplateEditContent(tmpl.content_ar);
    setTemplateFeedback(null);
    updatePreview(tmpl.template_key, tmpl.content_ar);
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    const updated = templateEditContent + ` {${placeholder}}`;
    setTemplateEditContent(updated);
    updatePreview(selectedTemplateKey, updated);
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    setTemplateFeedback(null);
    try {
      await api.put(`/telegram/templates/${selectedTemplateKey}${getCompanyQuery()}`, {
        title_ar: templateEditTitle,
        content_ar: templateEditContent,
      });
      setTemplateFeedback({
        success: true,
        message: "تم حفظ وتحديث القالب بنجاح!",
      });
      fetchTemplatesData();
    } catch (err: any) {
      setTemplateFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل حفظ القالب",
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleTestSendTemplate = async () => {
    setTestingSendTemplate(true);
    setTemplateFeedback(null);
    try {
      const res = await api.post(`/telegram/templates/${selectedTemplateKey}/test-send${getCompanyQuery()}`, {
        template_key: selectedTemplateKey,
        content_ar: templateEditContent,
        chat_id: testSendChatId || undefined,
      });
      setTemplateFeedback({
        success: true,
        message: res.message || "تم إرسال نموذج القالب بنجاح إلى تليجرام!",
      });
    } catch (err: any) {
      setTemplateFeedback({
        success: false,
        message: err?.response?.data?.detail || err?.message || "فشل إرسال نموذج القالب",
      });
    } finally {
      setTestingSendTemplate(false);
    }
  };

  const filteredEmployees = employeeLinks.filter((emp) => {
    if (!empSearch) return true;
    const q = empSearch.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.employee_number?.toLowerCase().includes(q) ||
      emp.job_title?.toLowerCase().includes(q) ||
      emp.telegram_username?.toLowerCase().includes(q) ||
      emp.department_name?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header & Multi-Company Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#123D32]/10 text-[#123D32] rounded-xl">
                <Icons.Settings size={20} />
              </span>
              <h1 className="text-xl font-bold text-slate-900">مركز التكاملات والربط السحابي</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              إدارة تكاملات المنظومة (Telegram Bot، Gemini AI، n8n) مع عزل صارم ومستقل لكل منشأة
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Multi-Company Selector */}
            {user?.is_superadmin && user?.companies && user.companies.length > 1 ? (
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <Icons.Building size={16} className="text-[#187A5A]" />
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">المنشأة المستهدفة:</span>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="text-xs font-bold bg-white text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1 focus:ring-[#187A5A] focus:border-[#187A5A]"
                >
                  {user.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar || c.name_en}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#123D32]/5 text-[#123D32] rounded-xl text-xs font-bold border border-[#123D32]/10">
                <Icons.Building size={14} />
                <span>{currentCompany?.name_ar || currentCompany?.name_en || "المنشأة الحالية"}</span>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => {
                fetchIntegrations();
                fetchLogs();
                fetchTelegramData();
                fetchMenuData();
                fetchTemplatesData();
              }}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="تحديث البيانات"
            >
              <Icons.Refresh size={16} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100/70 p-1.5 rounded-2xl border border-slate-200/60 max-w-full">
          <button
            onClick={() => setActiveTab("general")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "general" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            التكاملات العامة (Integrations)
          </button>
          <button
            onClick={() => setActiveTab("telegram")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "telegram" ? "bg-white text-[#187A5A] shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icons.Send size={14} className="text-[#187A5A]" />
            <span>إعدادات البوت والاتصال</span>
          </button>
          <button
            onClick={() => setActiveTab("employees")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "employees" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icons.Users size={14} className="text-blue-600" />
            <span>إدارة ربط الموظفين ({employeeLinks.filter(e => e.is_linked).length}/{employeeLinks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("menu_builder")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "menu_builder" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icons.Dashboard size={14} className="text-amber-600" />
            <span>منشئ القوائم والأزرار (No-Code Builder)</span>
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "templates" ? "bg-white text-purple-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icons.MessageSquare size={14} className="text-purple-600" />
            <span>قوالب الرسائل العربية</span>
          </button>
        </div>

        {/* TAB 1: GENERAL INTEGRATIONS */}
        {activeTab === "general" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {integrations.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
                          {item.service_name === "n8n" && <Icons.Refresh size={20} className="text-orange-500" />}
                          {item.service_name === "telegram" && <Icons.Send size={20} className="text-blue-500" />}
                          {item.service_name === "gemini" && (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
                              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                            </svg>
                          )}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{item.display_name}</h3>
                          <span className="text-[11px] text-slate-400 font-mono capitalize">{item.service_name}</span>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.is_enabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.is_enabled ? "مفعل" : "معطل"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                      {item.service_name === "n8n" && "أتمتة المهام وتوجيه الأحداث التشغيلية وسير العمل عبر Webhooks"}
                      {item.service_name === "telegram" && "إرسال الإشعارات التفاعلية للمهام الفنية وقبولها عبر البوت الفوري"}
                      {item.service_name === "gemini" && "الذكاء الاصطناعي لتصنيف التذاكر وتوليد ملخصات البنية التحتية"}
                    </p>

                    <div className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px]">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>الحالة:</span>
                        <span className="font-semibold text-slate-700">{item.status}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>آخر فحص:</span>
                        <span className="font-mono text-slate-700">
                          {item.last_tested_at ? new Date(item.last_tested_at).toLocaleString("ar-SA") : "لم يُفحص بعد"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggleEnable(item)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                        item.is_enabled ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {item.is_enabled ? "تعطيل" : "تفعيل"}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTestConnection(item.service_name)}
                        disabled={testingService === item.service_name}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        {testingService === item.service_name ? "جاري الفحص..." : "فحص الاتصال"}
                      </button>
                      <button
                        onClick={() => openConfigModal(item)}
                        className="px-3 py-1.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        تهيئة
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* External Integration Logs Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">سجل أحداث التكامل الخارجي (Integration Logs)</h3>
                  <p className="text-xs text-slate-500">متابعة جميع الأحداث المرسلة إلى Webhooks وTelegram</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={logServiceFilter}
                    onChange={(e) => setLogServiceFilter(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">جميع الخدمات</option>
                    <option value="telegram">Telegram</option>
                    <option value="n8n">n8n Webhook</option>
                    <option value="gemini">Gemini AI</option>
                  </select>
                  <button
                    onClick={fetchLogs}
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg"
                    title="تحديث السجل"
                  >
                    <Icons.Refresh size={14} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-3">الخدمة</th>
                      <th className="p-3">نوع الحدث</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">التفاصيل والأخطاء</th>
                      <th className="p-3">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          لا توجد سجلات أحداث مسجلة بعد
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold uppercase">{log.service_name}</td>
                          <td className="p-3 font-mono">{log.event_type}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.status === "Success"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 max-w-xs truncate">
                            {log.error_message || JSON.stringify(log.payload || {})}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
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

        {/* TAB 2: TELEGRAM BOT INTEGRATION & CONNECTION */}
        {activeTab === "telegram" && (
          <div className="space-y-6">
            {/* KPI Cards & Worker Status Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 bg-gradient-to-r from-[#123D32] to-[#187A5A] rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 backdrop-blur-xs">
                      {tgStatus?.is_configured ? "جاهز ومفعل" : "بانتظار التهيئة"}
                    </span>
                    <span className="text-xs text-white/80 font-mono">@{tgStatus?.bot_username || "InvestorGateBot"}</span>
                  </div>
                  <h2 className="text-lg font-bold">بنية تليجرام التفاعلية للمهام</h2>
                  <p className="text-xs text-white/80 mt-1">
                    يعمل البوت ببروتوكول Long-Polling الخارجي الآمن (No Inbound Ports) لتسليم تكليفات المهام التشغيلية وإدارتها تفاعلياً.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/90">
                  <span>حالة المعالج: <strong className="text-emerald-300">{tgStatus?.worker_status?.status_label || "يعمل بنشاط"}</strong></span>
                  <span>PID: <strong className="font-mono">{tgStatus?.worker_status?.pid || "33272"}</strong></span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold text-slate-500">الموظفون المرتبطون بالبوت</span>
                <div className="my-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {tgStatus?.stats?.linked_employees || 0}
                  </span>
                  <span className="text-xs text-slate-400 mr-1.5 font-bold">
                    / {tgStatus?.stats?.total_active_employees || 0} موظف
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab("employees")}
                  className="text-xs text-blue-600 hover:underline font-bold text-right cursor-pointer"
                >
                  إدارة الموظفين المرتبطين ←
                </button>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold text-slate-500">صندوق الإشعارات (Outbox)</span>
                <div className="my-2">
                  <span className="text-2xl font-bold text-emerald-600">
                    {tgStatus?.stats?.outbox_sent || 0}
                  </span>
                  <span className="text-xs text-slate-400 mr-2">
                    (معلق: {tgStatus?.stats?.outbox_pending || 0})
                  </span>
                </div>
                <button
                  onClick={handleDispatchOutbox}
                  className="text-xs text-[#187A5A] hover:underline font-bold text-right cursor-pointer"
                >
                  تشغيل المعالج الفوري الآن ←
                </button>
              </div>
            </div>

            {/* Telegram Configuration Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>إعدادات الاعتماد والتنبيهات المخصصة للمنشأة</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <span>تفعيل البوت لهذه المنشأة:</span>
                  <input
                    type="checkbox"
                    checked={isTgEnabled}
                    onChange={(e) => setIsTgEnabled(e.target.checked)}
                    className="rounded text-[#187A5A] focus:ring-[#187A5A] h-4 w-4"
                  />
                </label>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رمز Bot API Token:
                    </label>
                    <input
                      type="password"
                      value={botTokenInput}
                      onChange={(e) => setBotTokenInput(e.target.value)}
                      placeholder={tgStatus?.has_bot_token ? "رمز التوكن محفوظ بأمان (اتركه فارغاً للإبقاء عليه)" : "123456789:ABC..."}
                      className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-[#187A5A] focus:border-[#187A5A]"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      مخزن ومحمي على الخادم ولا يُعرض كنص صريح في المتصفح أبداً (Zero-Plaintext).
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        اسم مستخدم البوت (Username):
                      </label>
                      <input
                        type="text"
                        value={botUsernameInput}
                        onChange={(e) => setBotUsernameInput(e.target.value)}
                        placeholder="InvestorGateBot"
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        معرّف المحادثة الافتراضي (Chat ID):
                      </label>
                      <input
                        type="text"
                        value={chatIdInput}
                        onChange={(e) => setChatIdInput(e.target.value)}
                        placeholder="5451561520"
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleTestTgConnection()}
                      disabled={testingTgConnection}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Icons.Refresh size={12} />
                      <span>{testingTgConnection ? "جاري الفحص..." : "فحص الاتصال (getMe)"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendTgTestNotification()}
                      disabled={sendingTgTestNotification}
                      className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Icons.Send size={12} />
                      <span>{sendingTgTestNotification ? "جاري الإرسال..." : "إرسال إشعار تجريبي"}</span>
                    </button>
                  </div>

                  {tgFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs font-bold ${
                        tgFeedback.success
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {tgFeedback.message}
                    </div>
                  )}
                </div>

                {/* Right Column: Notification Rules */}
                <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-800 block mb-2">
                    أحداث المهام التشغيلية المرسلة للبوت (Task Event Rules):
                  </span>
                  {[
                    { key: "notify_on_assigned", label: "إسناد مهمة جديدة (task.assigned)", desc: "إشعار الفني بوجود مهمة تشغيلية مسندة إليه" },
                    { key: "notify_on_accepted", label: "قبول المهمة (task.accepted)", desc: "تأكيد استلام المهمة وبدء الالتزام بها" },
                    { key: "notify_on_started", label: "بدء العمل على المهمة (task.started)", desc: "إشعار المشرف بتحويل الحالة إلى قيد التنفيذ" },
                    { key: "notify_on_completed", label: "إكمال المهمة (task.completed)", desc: "إشعار إغلاق المهمة ورفعها للاعتماد" },
                    { key: "notify_on_overdue", label: "تجاوز الموعد المحدد (task.overdue)", desc: "تنبيه عاجل وفوري عند تأخر الإنجاز" },
                    { key: "notify_on_reassigned", label: "إعادة إسناد المهمة (task.reassigned)", desc: "إشعار الفني الجديد والقديم بنقل المسؤولية" },
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

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSimModalOpen(true)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Tasks size={14} />
                  <span>محاكي إجراءات البوت (Bot Action Simulator)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveTelegramConfig}
                  disabled={savingConfig}
                  className="px-6 py-2.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {savingConfig ? "جاري الحفظ..." : "حفظ إعدادات تليجرام"}
                </button>
              </div>
            </div>

            {/* Outbox Notifications Queue Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">صندوق إرسال الإشعارات (Transactional Outbox)</h3>
                  <p className="text-xs text-slate-500">سجل الإشعارات المجدولة مع ضمان عدم التكرار (Idempotency)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDispatchOutbox}
                    className="px-3 py-1.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    معالجة الصندوق الآن
                  </button>
                  <button
                    onClick={fetchTelegramData}
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg"
                    title="تحديث"
                  >
                    <Icons.Refresh size={14} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-3">نوع الحدث</th>
                      <th className="p-3">المستلم (Chat ID)</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">نص الرسالة</th>
                      <th className="p-3">المحاولات</th>
                      <th className="p-3">وقت الإنشاء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outboxItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          صندوق الإشعارات فارغ حالياً
                        </td>
                      </tr>
                    ) : (
                      outboxItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-slate-800">{item.event_type}</td>
                          <td className="p-3 font-mono">{item.recipient_chat_id || "—"}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.status === "Sent"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : item.status === "Pending"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 max-w-sm truncate" title={item.message_text}>
                            {item.message_text}
                          </td>
                          <td className="p-3 font-mono text-center">
                            {item.retry_count} / {item.max_retries}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
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

        {/* TAB 3: LINKED EMPLOYEES MANAGEMENT */}
        {activeTab === "employees" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">سجل ربط حسابات الموظفين (Linked Employees)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إدارة الربط الآمن والتحكم الكامل في ربط وإلغاء وإعادة ربط حسابات تليجرام للموظفين
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Icons.Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      placeholder="بحث بالاسم، القسم، الرقم..."
                      className="pr-8 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-[#187A5A] focus:border-[#187A5A]"
                    />
                  </div>
                  <button
                    onClick={fetchTelegramData}
                    className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl"
                    title="تحديث القائمة"
                  >
                    <Icons.Refresh size={14} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold">
                    <tr>
                      <th className="p-3.5">اسم الموظف والرقم</th>
                      <th className="p-3.5">الفرع والقسم</th>
                      <th className="p-3.5">المسمى الوظيفي</th>
                      <th className="p-3.5">حساب التليجرام</th>
                      <th className="p-3.5">معرّف المحادثة (Chat ID)</th>
                      <th className="p-3.5">حالة الربط</th>
                      <th className="p-3.5">آخر تفاعل</th>
                      <th className="p-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          لا يوجد موظفون مطابقون لمعايير البحث
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-[#123D32]/10 text-[#123D32] font-bold flex items-center justify-center text-xs">
                                {emp.full_name?.charAt(0) || "م"}
                              </span>
                              <div>
                                <span>{emp.full_name}</span>
                                <span className="block text-[10px] text-slate-400 font-mono">{emp.employee_number}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-700">
                            <span>{emp.branch_name || "الفرع الرئيسي"}</span>
                            <span className="block text-[10px] text-slate-400">{emp.department_name || "عام"}</span>
                          </td>
                          <td className="p-3.5 text-slate-600">{emp.job_title}</td>
                          <td className="p-3.5 font-mono">
                            {emp.telegram_username ? (
                              <span className="text-blue-600 font-bold">@{emp.telegram_username}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-slate-700">{emp.telegram_chat_id || "—"}</td>
                          <td className="p-3.5">
                            {emp.is_linked ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                مرتبط ومفعل ✓
                              </span>
                            ) : emp.is_pending_verification ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                بانتظار التحقق...
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                غير مرتبط
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-slate-400">
                            {emp.last_interaction_at ? new Date(emp.last_interaction_at).toLocaleString("ar-SA") : "—"}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {!emp.is_linked ? (
                                <button
                                  onClick={() => setLinkModalEmployee({ id: emp.employee_id, name: emp.full_name })}
                                  className="px-3 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                                >
                                  ربط Telegram
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleSendTgTestNotification(emp.telegram_chat_id)}
                                    title="إرسال إشعار تجريبي لهذا الموظف"
                                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    <Icons.Send size={12} />
                                  </button>
                                  <button
                                    onClick={() => setLinkModalEmployee({ id: emp.employee_id, name: emp.full_name })}
                                    title="إدارة وصلاحيات Telegram وسجل الأنشطة"
                                    className="px-2.5 py-1 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                                  >
                                    إدارة الصلاحيات
                                  </button>
                                  <button
                                    onClick={() => handleUnlinkEmployee(emp.employee_id, emp.full_name)}
                                    title="إلغاء الربط فوراً"
                                    className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    إلغاء الربط
                                  </button>
                                </>
                              )}
                            </div>
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

        {/* TAB 4: NO-CODE TELEGRAM MENU BUILDER */}
        {activeTab === "menu_builder" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900">منشئ القوائم والأزرار التفاعلية (Bot Menu Builder)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  تخصيص أزرار لوحة المفاتيح التفاعلية (Reply Keyboards) وأوامر البوت دون كتابة كود برمي
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePublishMenuCommands}
                  disabled={publishingCommands}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.ExternalLink size={14} />
                  <span>{publishingCommands ? "جاري النشر..." : "نشر الأوامر إلى Telegram"}</span>
                </button>
                <button
                  onClick={handleOpenAddMenuModal}
                  className="px-4 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Plus size={14} />
                  <span>إضافة زر جديد</span>
                </button>
              </div>
            </div>

            {publishFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  publishFeedback.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {publishFeedback.message}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Menu Items Table & Management */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">أزرار وقوائم البوت المهيأة ({menuItems.length})</h3>
                  <button
                    onClick={fetchMenuData}
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg"
                    title="تحديث"
                  >
                    <Icons.Refresh size={14} />
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {menuItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      لا توجد أزرار مضافة حالياً. اضغط "إضافة زر جديد" للبدء.
                    </div>
                  ) : (
                    menuItems.map((item, idx) => (
                      <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {/* Reorder Buttons */}
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleMoveMenuOrder(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 cursor-pointer"
                              title="تحريك لأعلى"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveMenuOrder(idx, "down")}
                              disabled={idx === menuItems.length - 1}
                              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 cursor-pointer"
                              title="تحريك لأسفل"
                            >
                              ▼
                            </button>
                          </div>

                          <span className="w-9 h-9 rounded-xl bg-slate-100 text-base flex items-center justify-center font-bold">
                            {item.icon || "🔘"}
                          </span>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{item.label}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.menu_type === "reply_keyboard"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : item.menu_type === "inline_button"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-purple-50 text-purple-700"
                                }`}
                              >
                                {item.menu_type === "reply_keyboard" ? "لوحة المفاتيح" : item.menu_type === "inline_button" ? "زر مدمج" : "أمر نصي"}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                              الإجراء: {item.action}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.is_enabled}
                              onChange={async (e) => {
                                await api.put(`/telegram/menu/${item.id}${getCompanyQuery()}`, { is_enabled: e.target.checked });
                                fetchMenuData();
                              }}
                              className="rounded text-[#187A5A] focus:ring-[#187A5A] h-4 w-4"
                            />
                          </label>
                          <button
                            onClick={() => handleOpenEditMenuModal(item)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                            title="تعديل"
                          >
                            <Icons.Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteMenuItem(item.id, item.label)}
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg cursor-pointer"
                            title="حذف"
                          >
                            <Icons.Trash size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Interactive Smartphone Mockup */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col items-center">
                <span className="text-xs font-bold text-slate-700 mb-3 block">
                  معاينة حية لشاشة Telegram على الهاتف الذكي (Live Preview)
                </span>

                {/* Smartphone Container */}
                <div className="w-[280px] bg-slate-900 rounded-[38px] p-3 shadow-xl border-4 border-slate-800 relative">
                  {/* Speaker Notch */}
                  <div className="w-20 h-4 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                  </div>

                  {/* Screen Content */}
                  <div className="bg-[#0e1621] text-white rounded-[24px] h-[480px] flex flex-col justify-between overflow-hidden border border-slate-800 text-right">
                    {/* Telegram Header */}
                    <div className="bg-[#17212b] p-3 border-b border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#187A5A] text-white font-bold flex items-center justify-center text-xs">
                          IG
                        </div>
                        <div>
                          <span className="text-xs font-bold block text-slate-100">{botUsernameInput || "InvestorGateBot"}</span>
                          <span className="text-[10px] text-blue-400">متصل (bot)</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">•••</span>
                    </div>

                    {/* Chat Messages Simulation */}
                    <div className="p-3 space-y-2.5 overflow-y-auto text-[11px]">
                      <div className="bg-[#182533] p-2.5 rounded-2xl rounded-tr-none text-slate-200 shadow-xs border border-slate-700/50">
                        <span className="font-bold text-blue-400 block mb-1">Investor Gate OS:</span>
                        مرحباً بك في بوت المهام التشغيلية التابع لـ {currentCompany?.name_ar || "المنشأة"}.
                        <span className="block text-[9px] text-slate-500 mt-1 text-left font-mono">10:30 ص ✓✓</span>
                      </div>

                      <div className="bg-[#2b5278] p-2.5 rounded-2xl rounded-tl-none text-white self-start shadow-xs">
                        /tasks
                        <span className="block text-[9px] text-blue-200 mt-0.5 text-left font-mono">10:31 ص ✓✓</span>
                      </div>

                      <div className="bg-[#182533] p-2.5 rounded-2xl rounded-tr-none text-slate-200 shadow-xs border border-slate-700/50">
                        <span className="font-bold text-emerald-400 block mb-0.5">📋 مهامك النشطة (2):</span>
                        1. 🔴 تحديث خادم البنية التحتية
                        2. 🟡 استبدال راوتر الفرع
                        <span className="block text-[9px] text-slate-500 mt-1 text-left font-mono">10:31 ص ✓✓</span>
                      </div>
                    </div>

                    {/* Bottom Reply Keyboard Simulation */}
                    <div className="bg-[#17212b] p-2 border-t border-slate-800">
                      <div className="grid grid-cols-2 gap-1.5">
                        {menuItems.filter(m => m.menu_type === "reply_keyboard" && m.is_enabled).map((btn) => (
                          <div
                            key={btn.id}
                            className="bg-[#2b5278]/60 hover:bg-[#2b5278] text-white p-2 rounded-xl text-center text-[10px] font-bold cursor-pointer transition-colors shadow-xs truncate"
                          >
                            {btn.icon ? `${btn.icon} ` : ""}{btn.label}
                          </div>
                        ))}
                      </div>
                      <span className="block text-[9px] text-slate-500 text-center mt-1.5 font-mono">
                        لوحة مفاتيح تفاعلية دائمة
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CONFIGURABLE MESSAGE TEMPLATES */}
        {activeTab === "templates" && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h2 className="text-base font-bold text-slate-900">قوالب الرسائل والإشعارات العربية المخصصة</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعديل نصوص الإشعارات والترحيب مع دعم المتغيرات الآمنة والترميز الغني (HTML)
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Templates Navigation Sidebar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-700 block mb-3">القوالب المتاحة:</span>
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`w-full text-right p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1 ${
                      selectedTemplateKey === tmpl.template_key
                        ? "bg-[#123D32] text-white font-bold shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                    }`}
                  >
                    <span className="text-xs font-bold">{tmpl.title_ar}</span>
                    <span className={`text-[10px] font-mono ${selectedTemplateKey === tmpl.template_key ? "text-white/80" : "text-slate-400"}`}>
                      {tmpl.template_key}
                    </span>
                  </button>
                ))}
              </div>

              {/* Template Editor & Live Preview */}
              <div className="lg:col-span-2 space-y-5">
                {/* Editor Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <input
                      type="text"
                      value={templateEditTitle}
                      onChange={(e) => setTemplateEditTitle(e.target.value)}
                      className="text-sm font-bold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                    />
                    <span className="text-xs font-mono text-slate-400">{selectedTemplateKey}</span>
                  </div>

                  {/* Variables Toolbar */}
                  <div className="mb-3">
                    <span className="text-xs font-bold text-slate-600 block mb-1.5">
                      المتغيرات المتاحة (انقر للإدراج في النص):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "employee_name",
                        "company_name",
                        "branch_name",
                        "department_name",
                        "task_title",
                        "priority",
                        "due_date",
                        "description",
                        "new_status",
                        "actor_name",
                      ].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleInsertPlaceholder(v)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-[#123D32] hover:text-white text-slate-700 rounded-lg text-[11px] font-mono transition-colors cursor-pointer"
                        >
                          +{`{${v}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Textarea */}
                  <div>
                    <textarea
                      rows={7}
                      value={templateEditContent}
                      onChange={(e) => {
                        setTemplateEditContent(e.target.value);
                        updatePreview(selectedTemplateKey, e.target.value);
                      }}
                      className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-[#187A5A] focus:border-[#187A5A] text-right"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      يدعم التنسيق الغني: &lt;b&gt;نص غامق&lt;/b&gt; و &lt;i&gt;مائل&lt;/i&gt; والرموز التعبيرية.
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={testSendChatId}
                        onChange={(e) => setTestSendChatId(e.target.value)}
                        placeholder="Chat ID للتجربة (اختياري)"
                        className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono w-48"
                      />
                      <button
                        type="button"
                        onClick={handleTestSendTemplate}
                        disabled={testingSendTemplate}
                        className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        {testingSendTemplate ? "جاري الإرسال..." : "إرسال تجربة حية"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      className="px-6 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      {savingTemplate ? "جاري الحفظ..." : "حفظ التعديلات"}
                    </button>
                  </div>

                  {templateFeedback && (
                    <div
                      className={`mt-3 p-3 rounded-xl text-xs font-bold ${
                        templateFeedback.success
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {templateFeedback.message}
                    </div>
                  )}
                </div>

                {/* Rendered Live Preview Card */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <span className="text-xs font-bold text-slate-700 block mb-3">
                    معاينة القالب كما سيظهر في Telegram:
                  </span>
                  <div className="bg-[#182533] text-slate-100 p-4 rounded-2xl max-w-lg shadow-md border border-slate-700 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                    {previewLoading ? (
                      <span className="text-slate-400">جاري توليد المعاينة...</span>
                    ) : (
                      previewRendered || "اكتب نص القالب لمعاينته هنا..."
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Menu Item Add / Edit */}
        {menuModalOpen && (
          <Modal
            isOpen={menuModalOpen}
            onClose={() => {
              setMenuModalOpen(false);
              setEditingMenuItem(null);
            }}
            title={editingMenuItem?.id ? "تعديل زر القائمة" : "إضافة زر جديد إلى قائمة البوت"}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الزر (Label):</label>
                <input
                  type="text"
                  value={editingMenuItem?.label || ""}
                  onChange={(e) => setEditingMenuItem({ ...editingMenuItem, label: e.target.value })}
                  placeholder="مثال: 📋 مهامي"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرمز / Emoji:</label>
                  <input
                    type="text"
                    value={editingMenuItem?.icon || ""}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, icon: e.target.value })}
                    placeholder="📋 أو 🎫 أو ❓"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع القائمة:</label>
                  <select
                    value={editingMenuItem?.menu_type || "reply_keyboard"}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, menu_type: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="reply_keyboard">لوحة مفاتيح الرد (Reply Keyboard)</option>
                    <option value="inline_button">زر مدمج تفاعلي (Inline Button)</option>
                    <option value="command">أمر نصي (Bot Command)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الإجراء المرتبط (Action):</label>
                <select
                  value={editingMenuItem?.action || "cmd:my_tasks"}
                  onChange={(e) => setEditingMenuItem({ ...editingMenuItem, action: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="cmd:my_tasks">عرض مهامي النشطة (cmd:my_tasks)</option>
                  <option value="cmd:tickets">عرض تذاكر الدعم الفني (cmd:tickets)</option>
                  <option value="cmd:notifications">عرض الإشعارات الحديثة (cmd:notifications)</option>
                  <option value="url:web_portal">فتح بوابة النظام في المتصفح (url:web_portal)</option>
                  <option value="cmd:help">دليل المساعدة والأوامر (cmd:help)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وصف مختصر (يظهر في تليجرام):</label>
                <input
                  type="text"
                  value={editingMenuItem?.description_ar || ""}
                  onChange={(e) => setEditingMenuItem({ ...editingMenuItem, description_ar: e.target.value })}
                  placeholder="استعراض المهام التشغيلية المسندة إليك"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuModalOpen(false);
                    setEditingMenuItem(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveMenuItem}
                  disabled={savingMenuItem}
                  className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold"
                >
                  {savingMenuItem ? "جاري الحفظ..." : "حفظ الزر"}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* MODAL: Employee Telegram Linking (Manual /start Command & Live Polling) */}
        {linkModalEmployee && (
          <TelegramLinkingModal
            isOpen={!!linkModalEmployee}
            onClose={() => setLinkModalEmployee(null)}
            employeeId={linkModalEmployee.id}
            employeeName={linkModalEmployee.name}
            companyId={selectedCompanyId || undefined}
            onVerified={() => {
              fetchTelegramData();
            }}
          />
        )}

        {/* MODAL: Bot Action Simulation */}
        {simModalOpen && (
          <Modal
            isOpen={simModalOpen}
            onClose={() => {
              setSimModalOpen(false);
              setSimResult(null);
            }}
            title="محاكي تفاعل وأوامر بوت Telegram (Bot Simulator)"
          >
            <form onSubmit={handleSimulateBotAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المحاكى:</label>
                <select
                  value={simEmployeeId}
                  onChange={(e) => setSimEmployeeId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employeeLinks.map((emp) => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.full_name} ({emp.job_title}) {emp.is_linked ? "✓ مرتبط" : "(غير مرتبط)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإجراء:</label>
                <select
                  value={simActionType}
                  onChange={(e) => setSimActionType(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="cmd:my_tasks">استعراض مهامي (cmd:my_tasks)</option>
                  <option value="act:accept">قبول المهمة (act:accept)</option>
                  <option value="act:start">بدء التنفيذ (act:start)</option>
                  <option value="act:done">إكمال المهمة (act:done)</option>
                  <option value="act:info">تفاصيل المهمة (act:info)</option>
                </select>
              </div>

              {simActionType !== "cmd:my_tasks" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المهمة المستهدفة:</label>
                  <select
                    value={simTaskId}
                    onChange={(e) => setSimTaskId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    required
                  >
                    <option value="">اختر المهمة...</option>
                    {companyTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.title} ({t.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {simResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-mono whitespace-pre-wrap ${
                    simResult.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                  }`}
                >
                  {simResult.message}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSimModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={simulating}
                  className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold"
                >
                  {simulating ? "جاري المحاكاة..." : "تنفيذ الإجراء"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* MODAL: General Config Modal */}
        {activeModal && (
          <Modal
            isOpen={Boolean(activeModal)}
            onClose={() => setActiveModal(null)}
            title={`تهيئة إعدادات ${activeModal.toUpperCase()}`}
          >
            <div className="space-y-4">
              {activeModal === "gemini" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gemini API Key:</label>
                    <input
                      type="password"
                      value={currentConfig.api_key || ""}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, api_key: e.target.value })}
                      placeholder="AIzaSy..."
                      className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">النموذج (Model):</label>
                    <select
                      value={currentConfig.model || "gemini-2.0-flash"}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, model: e.target.value })}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (مستحسن وسريع)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </select>
                  </div>
                </>
              )}

              {activeModal === "n8n" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رابط Webhook URL:</label>
                    <input
                      type="text"
                      value={currentConfig.webhook_url || ""}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, webhook_url: e.target.value })}
                      placeholder="https://n8n.your-domain.com/webhook/..."
                      className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">مفتاح السر (Webhook Secret):</label>
                    <input
                      type="password"
                      value={currentConfig.webhook_secret || ""}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, webhook_secret: e.target.value })}
                      className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveConfig(activeModal)}
                  disabled={savingConfig}
                  className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold"
                >
                  {savingConfig ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
