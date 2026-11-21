"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icons } from "@/components/ui/Icons";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  title?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  showToast: (
    message: string,
    variant?: ToastVariant,
    title?: string,
    durationMs?: number,
    action?: { label: string; onClick: () => void }
  ) => void;
  success: (message: string, title?: string, action?: { label: string; onClick: () => void }) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { container: string; iconBg: string; icon: React.ReactNode }> = {
  success: {
    container: "bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-slate-100",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
    icon: <Icons.CheckCircle size={18} />,
  },
  error: {
    container: "bg-white dark:bg-slate-800 border-rose-200 dark:border-rose-800 text-slate-900 dark:text-slate-100",
    iconBg: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
    icon: <Icons.AlertCircle size={18} />,
  },
  warning: {
    container: "bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-800 text-slate-900 dark:text-slate-100",
    iconBg: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
    icon: <Icons.AlertTriangle size={18} />,
  },
  info: {
    container: "bg-white dark:bg-slate-800 border-sky-200 dark:border-sky-800 text-slate-900 dark:text-slate-100",
    iconBg: "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300",
    icon: <Icons.Info size={18} />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      variant: ToastVariant = "info",
      title?: string,
      durationMs = 5000,
      action?: { label: string; onClick: () => void }
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant, title, action }]);
      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, durationMs);
      }
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      dismissToast,
      success: (message, title, action) => showToast(message, "success", title, 5000, action),
      error: (message, title) => showToast(message, "error", title, 7000),
      warning: (message, title) => showToast(message, "warning", title, 6000),
      info: (message, title) => showToast(message, "info", title),
    }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 inset-inline-end-4 z-[90] flex flex-col gap-2.5 w-[min(92vw,380px)] pointer-events-none"
      >
        {toasts.map((item) => {
          const style = VARIANT_STYLES[item.variant];
          return (
            <div
              key={item.id}
              role={item.variant === "error" ? "alert" : "status"}
              className={`motion-toast pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg ${style.container}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.iconBg}`}>
                {style.icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                {item.title && (
                  <div className="text-xs font-bold mb-0.5">{item.title}</div>
                )}
                <p className="text-xs leading-relaxed break-words">{item.message}</p>
                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick();
                      dismissToast(item.id);
                    }}
                    className="mt-2 text-xs font-black text-primary hover:underline cursor-pointer"
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                aria-label="إغلاق التنبيه"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <Icons.X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}
