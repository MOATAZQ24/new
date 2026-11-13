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
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = "border-[#187A5A]",
  href,
}: StatsCardProps) {
  const cardContent = (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all relative overflow-hidden border-t-4 ${accentColor} ${
        href ? "cursor-pointer group hover:-translate-y-0.5" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-800 transition-colors">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-lg bg-slate-50 text-[#187A5A] group-hover:bg-[#187A5A] group-hover:text-white transition-colors">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 tracking-tight">{value}</span>
        {trend && (
          <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
            {trend}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{cardContent}</Link>;
  }

  return cardContent;
}

export default StatsCard;
