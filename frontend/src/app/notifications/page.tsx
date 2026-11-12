"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { 
  BellIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon, 
  CheckSquareIcon, LifeBuoyIcon, RefreshCwIcon, ShieldCheckIcon
} from "@/components/ui/Icons";
import { api } from "@/lib/api";

interface NotificationItem {
  id: string;
  event_type: string;
  title: string;
  message: string;
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

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = unreadOnly ? { unread_only: "true" } : {};
      const res = await api.get<NotificationItem[]>("/notifications", { params });
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: now })));
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
            <h1 className="text-2xl font-bold text-gray-900">مركز الإشعارات والتنبيهات</h1>
            <p className="text-sm text-gray-500 mt-1">
              متابعة تنبيهات العهد، المهام، تذاكر الدعم، وتجديد الاشتراكات
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Notifications Feed */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">جاري تحميل الإشعارات...</div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <BellIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium">لا توجد إشعارات جديدة</p>
              <p className="text-xs text-gray-400 mt-1">ستصلك التنبيهات هنا فور حدوث أي إجراء يتعلق بك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => {
                const isRead = !!n.read_at;
                return (
                  <div
                    key={n.id}
                    className={`p-4 transition-colors flex items-start justify-between gap-4 ${
                      isRead ? "bg-white opacity-80" : "bg-[#187A5A]/5 font-medium"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-white border border-gray-100 shadow-xs mt-0.5">
                        {getEventIcon(n.event_type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{n.title}</h4>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#187A5A]" />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1">
                          <span dir="ltr">{n.created_at?.slice(0, 16).replace("T", " ")}</span>
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                            {n.channel}
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
