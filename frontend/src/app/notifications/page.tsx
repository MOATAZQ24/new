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
    if (eventType.includes("task")) return <CheckSquareIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    if (eventType.includes("ticket")) return <LifeBuoyIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    if (eventType.includes("custody")) return <ShieldCheckIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />;
    if (eventType.includes("subscription")) return <ClockIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
    return <BellIcon className="w-5 h-5 text-[var(--icon-muted)]" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">مركز الإشعارات والتنبيهات الذكي</h1>
            <p className="text-sm text-[var(--text-2)] mt-1">
              متابعة تنبيهات المهام، تذاكر الدعم، وتجديد الاشتراكات بتوجيه فوري متعدد القنوات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadNotifications}
              className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] bg-[var(--surface)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
              title="تحديث"
              aria-label="تحديث الإشعارات"
            >
              <RefreshCwIcon className="w-4 h-4" />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-soft)] border border-[var(--primary)]/30 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircleIcon className="w-4 h-4" />
                تحديد الكل كمقروء
              </button>
            )}
            <button
              onClick={() => setUnreadOnly(!unreadOnly)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                unreadOnly
                  ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-xs"
                  : "bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {unreadOnly ? "عرض جميع الإشعارات" : `غير المقروء فقط (${unreadCount})`}
            </button>
          </div>
        </div>

        {/* Priority Filter Tabs */}
        <div className="flex items-center gap-2 bg-[var(--surface)] p-2 rounded-xl border border-[var(--border)] shadow-xs overflow-x-auto">
          <span className="text-xs text-[var(--text-3)] px-2 font-medium shrink-0">مستوى الأولوية:</span>
          {[
            { id: "", label: "الكل" },
            { id: "Urgent", label: "عاجل جداً" },
            { id: "High", label: "مرتفع" },
            { id: "Normal", label: "عادي" },
            { id: "Low", label: "منخفض" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPriorityFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                priorityFilter === tab.id
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications Feed */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-[var(--surface-2)] animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-3)]">
              <BellIcon className="w-12 h-12 text-[var(--icon-muted)] mx-auto mb-3" />
              <p className="text-base font-semibold text-[var(--text)]">لا توجد إشعارات تطابق المعايير</p>
              <p className="text-xs text-[var(--text-3)] mt-1">ستصلك التنبيهات هنا فور حدوث أي إجراء يتعلق بك</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {notifications.map((n) => {
                const isRead = !!n.read_at;
                const isUrgent = n.priority === "Urgent" || n.priority === "Critical";
                return (
                  <div
                    key={n.id}
                    className={`motion-notification p-4 transition-colors flex items-start justify-between gap-4 ${
                      isUrgent && !isRead
                        ? "bg-rose-50/60 dark:bg-rose-950/25 border-r-4 border-rose-500 font-medium"
                        : isRead
                        ? "bg-[var(--surface)] opacity-75 hover:opacity-100 hover:bg-[var(--surface-2)]/50"
                        : "bg-[var(--primary-soft)]/50 dark:bg-blue-950/20 font-medium border-r-2 border-[var(--primary)] hover:bg-[var(--primary-soft)]/70"
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] shadow-2xs mt-0.5 shrink-0">
                        {getEventIcon(n.event_type)}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {n.priority && n.priority !== "Normal" && (
                            <PriorityBadge priority={n.priority} />
                          )}
                          <h4 className="text-sm font-bold text-[var(--text)] truncate">{n.title}</h4>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-2)] leading-relaxed break-words">{n.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-3)] pt-1">
                          <span dir="ltr">{n.created_at?.slice(0, 16).replace("T", " ")}</span>
                          <span className="bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--text-2)] font-mono text-[10px]">
                            القناة: {n.channel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isRead && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-xs font-semibold text-[var(--primary-text)] hover:underline whitespace-nowrap self-center cursor-pointer shrink-0"
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
