import React from "react";
import Link from "next/link";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: string;
  accentColor?: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  actionLabel?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = "border-[#187A5A]",
  href,
  onClick,
  active = false,
  loading = false,
  actionLabel,
}: StatsCardProps) {
  const isInteractive = Boolean(href || onClick);

  const cardBody = (
    <div
      onClick={onClick}
      className={`motion-card bg-white rounded-xl border p-4 sm:p-5 shadow-xs relative overflow-hidden border-t-4 ${accentColor} transition-all ${
        active
          ? "border-slate-300 ring-2 ring-[#187A5A]/30 shadow-sm bg-[#187A5A]/[0.03]"
          : "border-slate-200/90 hover:shadow-md hover:border-slate-300"
      } ${isInteractive ? "cursor-pointer group" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">
          {title}
        </span>
        {icon && (
          <div
            className={`p-2 rounded-lg transition-colors shrink-0 ${
              active
                ? "bg-[#187A5A] text-white"
                : "bg-slate-100/80 text-[#187A5A] group-hover:bg-[#187A5A] group-hover:text-white"
            }`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {loading ? (
            <span className="inline-block h-7 w-16 rounded-md bg-slate-200/80 animate-pulse" />
          ) : (
            <span className="motion-counter text-2xl font-black text-slate-900 tracking-tight">
              {value}
            </span>
          )}
          {trend && !loading && (
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.5 rounded">
              {trend}
            </span>
          )}
        </div>

        {onClick && (
          <button
            type="button"
            aria-pressed={active}
            aria-label={actionLabel || "تصفية القائمة"}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
              active
                ? "bg-[#187A5A] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            {active ? "مفعل" : "تصفية"}
          </button>
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-[11px] text-slate-600 leading-snug">{subtitle}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none rounded-xl">
        {cardBody}
      </Link>
    );
  }

  return cardBody;
}

export default StatsCard;
