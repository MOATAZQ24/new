"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Icons } from "@/components/ui/Icons";

type Grants = Record<string, string[]>;
interface Props {
  employeeId: string;
  companyId?: string;
  details: {
    link?: {
      allowed_modules?: string[];
      data_scope?: string;
      notifications_enabled?: boolean;
      notification_preferences?: Record<string, unknown>;
      permission_policy?: { actions?: Grants; scope?: string };
    };
    permissions_matrix?: {
      effective_actions?: Grants;
      maximum_actions?: Grants;
      max_permitted_modules?: string[];
      can_manage?: boolean;
      maximum_scope?: string;
    };
  };
}

const labels: Record<string, string> = {
  tasks: "المهام",
  tickets: "التذاكر",
  custody: "العهدة",
  assets: "الأصول",
  subscriptions: "الاشتراكات",
  reports: "التقارير",
  notifications: "الإشعارات",
  search: "البحث",
};

const actions: Record<string, string> = {
  view: "عرض",
  create: "إنشاء",
  update: "تحديث",
  manage: "إدارة",
};

export default function TelegramActionPermissions({ employeeId, companyId, details }: Props) {
  const maximum = details.permissions_matrix?.maximum_actions || {};
  const canManage = !!details.permissions_matrix?.can_manage;
  const [grants, setGrants] = useState<Grants>({});
  const [scope, setScope] = useState("Self");
  const [template, setTemplate] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; variant: "success" | "error" } | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState<Props["details"] | null>(null);

  const reset = () => {
    const source = saved || details;
    const policy = source.link?.permission_policy;
    setGrants(
      Object.fromEntries(
        Object.entries(maximum).map(([m, allowed]) => [
          m,
          source.link?.allowed_modules == null || source.link.allowed_modules.includes(m)
            ? (policy?.actions?.[m] || allowed).filter((a) => allowed.includes(a))
            : [],
        ])
      )
    );
    setScope(policy?.scope || source.link?.data_scope || "Self");
    setNotifications(source.link?.notifications_enabled ?? true);
    setPreferences(source.link?.notification_preferences || {});
    setTemplate("custom");
    setMessage(null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reset();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [details]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.put(
        `/telegram/links/${employeeId}/permissions${companyId ? `?company_id=${companyId}` : ""}`,
        {
          allowed_modules: Object.keys(grants).filter((m) => grants[m].includes("view")),
          actions: grants,
          data_scope: scope,
          role_template: template,
          notifications_enabled: notifications,
          notification_preferences: preferences,
        }
      );
      const response = await api.get<Props["details"]>(
        `/telegram/links/${employeeId}/details${companyId ? `?company_id=${companyId}` : ""}`
      );
      if (response.data?.permissions_matrix?.effective_actions) {
        setGrants(response.data.permissions_matrix.effective_actions);
      }
      setSaved(response.data);
      setMessage({ text: "تم حفظ الصلاحيات والتحقق منها من الخادم بنجاح.", variant: "success" });
    } catch (error: unknown) {
      setMessage({
        text: error instanceof Error ? error.message : "تعذر حفظ الصلاحيات.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      dir="rtl"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#123D32]/10 text-[#123D32] flex items-center justify-center">
            <Icons.ShieldCheck size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#123D32]">صلاحيات الإجراءات الفعلية</h3>
            <p className="text-[11px] text-slate-600">
              التحكم الدقيق في وحدات النظام وإشعارات الموظف عبر البوت
            </p>
          </div>
        </div>
        {!canManage && (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
            عرض فقط
          </span>
        )}
      </div>

      <fieldset disabled={!canManage || busy} className="space-y-4 disabled:opacity-70">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">قالب الصلاحيات</span>
            <select
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                if (e.target.value !== "custom") {
                  setGrants(
                    Object.fromEntries(
                      Object.entries(maximum).map(([m, allowed]) => [
                        m,
                        e.target.value === "read_only"
                          ? allowed.filter((a) => a === "view")
                          : [...allowed],
                      ])
                    )
                  );
                }
              }}
              className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#187A5A] focus:bg-white"
            >
              <option value="custom">مخصص</option>
              <option value="read_only">للقراءة فقط</option>
              <option value="crm">صلاحيات CRM المسموحة</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">نطاق البيانات</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#187A5A] focus:bg-white"
            >
              <option value="Self">سجلات الموظف فقط</option>
              {details.permissions_matrix?.maximum_scope === "Company" && (
                <option value="Company">المنشأة الحالية</option>
              )}
            </select>
          </label>
        </div>

        {/* Module Action Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {Object.entries(maximum).map(([module, allowed]) => (
            <div
              key={module}
              className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-slate-900">
                {labels[module] || module}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(actions).map(([action, label]) => {
                  const isAllowed = allowed.includes(action);
                  const checked = grants[module]?.includes(action) || false;
                  return (
                    <label
                      key={action}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                        !isAllowed
                          ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed opacity-60"
                          : checked
                          ? "border-[#187A5A]/40 bg-emerald-50 text-[#123D32] font-semibold cursor-pointer"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!isAllowed}
                        checked={checked}
                        onChange={(e) =>
                          setGrants((current) => ({
                            ...current,
                            [module]: e.target.checked
                              ? [...(current[module] || []), action]
                              : (current[module] || []).filter((a) => a !== action),
                          }))
                        }
                        className="rounded border-slate-300 text-[#187A5A] focus:ring-[#187A5A]"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Notification Event Subscriptions */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              className="rounded border-slate-300 text-[#187A5A] focus:ring-[#187A5A]"
            />
            <span>استلام الإشعارات الفورية عبر البوت</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {Object.entries({
              task_assigned: "إسناد مهمة",
              task_status_changed: "تحديث مهمة",
              ticket_created: "تحديث تذكرة",
              overdue_alerts: "تنبيه التأخير",
            }).map(([event, label]) => (
              <label
                key={event}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={preferences[event] !== false}
                  onChange={(e) =>
                    setPreferences((p) => ({ ...p, [event]: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-[#187A5A] focus:ring-[#187A5A]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={save}
            className="motion-control inline-flex items-center gap-1.5 rounded-xl bg-[#123D32] hover:bg-[#187A5A] px-4 py-2 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <Icons.Check size={14} />
            <span>{busy ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}</span>
          </button>
          <button
            type="button"
            onClick={reset}
            className="motion-control inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <Icons.Refresh size={13} />
            <span>إعادة ضبط</span>
          </button>
        </div>
      </fieldset>

      {message && (
        <div aria-live="polite">
          <AlertBanner
            variant={message.variant}
            message={message.text}
            onDismiss={() => setMessage(null)}
          />
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs">
        <summary className="cursor-pointer font-bold text-slate-700 select-none">
          معاينة الصلاحيات الفعلية المعتمدة
        </summary>
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
          {Object.entries(grants).map(([m, values]) => (
            <div
              key={m}
              className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-100"
            >
              <span className="font-semibold text-slate-800">{labels[m] || m}</span>
              <span className="text-slate-600">
                {values.includes("view")
                  ? values.map((a) => actions[a] || a).join("، ")
                  : "غير مسموح"}
              </span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
