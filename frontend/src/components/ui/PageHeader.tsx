import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  icon,
  badge,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200/90">
      <div className="flex items-start gap-3 min-w-[280px] flex-1">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 max-w-full lg:justify-end">{actions}</div>
      )}
    </div>
  );
}

export default PageHeader;
