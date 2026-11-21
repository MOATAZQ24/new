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
import { PriorityBadge } from "@/components/ui/Badge";
import { 
  BellIcon, CheckCircleIcon, ClockIcon, 
  CheckSquareIcon, LifeBuoyIcon, RefreshCwIcon, ShieldCheckIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";

interface NotificationItem {
  id: string;
  event_type: string;
  title: string;
  message: string;
  priority?: string;
  related_record_type?: string;
  related_record_id?: string;
  channel: string;
  delivery_status: string;
  read_at?: string;
  created_at: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (unreadOnly) params.unread_only = "true";
      if (priorityFilter) params.priority = priorityFilter;

      const res = await api.get<NotificationItem[]>("/notifications", { params });
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, priorityFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: now })));
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const getEventIcon = (eventType: string) => {
    if (eventType.includes("task")) return <CheckSquareIcon className="w-5 h-5 text-blue-600" />;
    if (eventType.includes("ticket")) return <LifeBuoyIcon className="w-5 h-5 text-amber-600" />;
    if (eventType.includes("custody")) return <ShieldCheckIcon className="w-5 h-5 text-green-600" />;
    if (eventType.includes("subscription")) return <ClockIcon className="w-5 h-5 text-purple-600" />;
    return <BellIcon className="w-5 h-5 text-gray-500" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">مركز الإشعارات والتنبيهات الذكي</h1>
            <p className="text-sm text-gray-500 mt-1">
              متابعة تنبيهات المهام، تذاكر الدعم، وتجديد الاشتراكات بتوجيه فوري متعدد القنوات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadNotifications}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              title="تحديث"
            >
              <RefreshCwIcon className="w-4 h-4" />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#187A5A] hover:bg-[#187A5A]/10 border border-[#187A5A]/30 rounded-lg transition-colors"
              >
                <CheckCircleIcon className="w-4 h-4" />
                تحديد الكل كمقروء
              </button>
            )}
            <button
              onClick={() => setUnreadOnly(!unreadOnly)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                unreadOnly
                  ? "bg-[#187A5A] text-white border-[#187A5A]"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {unreadOnly ? "عرض جميع الإشعارات" : `غير المقروء فقط (${unreadCount})`}
            </button>
          </div>
        </div>

        {/* Priority Filter Tabs */}
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-xs overflow-x-auto">
          <span className="text-xs text-gray-500 px-2 font-medium">مستوى الأولوية:</span>
          {[
            { id: "", label: "الكل" },
            { id: "Urgent", label: "🚨 عاجل جداً (Urgent)" },
            { id: "High", label: "⚡ مرتفع (High)" },
            { id: "Normal", label: "عادي (Normal)" },
            { id: "Low", label: "منخفض (Low)" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPriorityFilter(tab.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                priorityFilter === tab.id
                  ? "bg-[#123D32] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications Feed */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">جاري تحميل الإشعارات...</div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <BellIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium">لا توجد إشعارات تطابق المعايير</p>
              <p className="text-xs text-gray-400 mt-1">ستصلك التنبيهات هنا فور حدوث أي إجراء يتعلق بك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => {
                const isRead = !!n.read_at;
                const isUrgent = n.priority === "Urgent";
                return (
                  <div
                    key={n.id}
                    className={`motion-notification p-4 transition-colors flex items-start justify-between gap-4 ${
                      isUrgent && !isRead
                        ? "bg-rose-50/60 border-r-4 border-rose-500 font-medium"
                        : isRead
                        ? "bg-white opacity-80"
                        : "bg-[#187A5A]/5 font-medium"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-white border border-gray-100 shadow-xs mt-0.5">
                        {getEventIcon(n.event_type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {n.priority && n.priority !== "Normal" && (
                            <PriorityBadge priority={n.priority} />
                          )}
                          <h4 className="text-sm font-bold text-gray-900">{n.title}</h4>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#187A5A]" />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1">
                          <span dir="ltr">{n.created_at?.slice(0, 16).replace("T", " ")}</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-mono text-[10px]">
                            القناة: {n.channel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isRead && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-xs text-[#187A5A] hover:underline whitespace-nowrap self-center"
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
