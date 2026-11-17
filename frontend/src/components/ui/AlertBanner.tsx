import React from "react";
import { Icons } from "@/components/ui/Icons";

interface AlertBannerProps {
  variant?: "error" | "warning" | "success" | "info";
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const STYLES = {
  error: {
    box: "bg-rose-50 border-rose-200 text-rose-900",
    icon: <Icons.AlertCircle size={18} className="text-rose-700 shrink-0" />,
    btn: "bg-rose-700 hover:bg-rose-800 text-white",
  },
  warning: {
    box: "bg-amber-50 border-amber-200 text-amber-900",
    icon: <Icons.AlertTriangle size={18} className="text-amber-700 shrink-0" />,
    btn: "bg-amber-700 hover:bg-amber-800 text-white",
  },
  success: {
    box: "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon: <Icons.CheckCircle size={18} className="text-emerald-700 shrink-0" />,
    btn: "bg-emerald-700 hover:bg-emerald-800 text-white",
  },
  info: {
    box: "bg-sky-50 border-sky-200 text-sky-900",
    icon: <Icons.Info size={18} className="text-sky-700 shrink-0" />,
    btn: "bg-sky-700 hover:bg-sky-800 text-white",
  },
};

export function AlertBanner({
  variant = "error",
  title,
  message,
  onRetry,
  onDismiss,
}: AlertBannerProps) {
  const s = STYLES[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`motion-toast flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border ${s.box}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5">{s.icon}</div>
        <div className="text-xs leading-relaxed">
          {title && <div className="font-bold mb-0.5">{title}</div>}
          <p>{message}</p>
        </div>
      </div>

      {(onRetry || onDismiss) && (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`motion-control px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${s.btn}`}
            >
              إعادة المحاولة
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="إغلاق الرسالة"
              className="p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
            >
              <Icons.X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertBanner;
