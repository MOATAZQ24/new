"use client";

import React from "react";
import Link from "next/link";

export interface ChartSeriesItem {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  href?: string;
  badge?: string;
}

const DEFAULT_PALETTE = [
  "#123D32",
  "#187A5A",
  "#C5A46D",
  "#0284C7",
  "#D97706",
  "#E11D48",
  "#64748B",
];

/**
 * Accessible, RTL-safe Donut Chart with legend, percentage breakdown, and total reconciliation.
 */
export function EnterpriseDonutChart({
  title,
  subtitle,
  items,
  unit = "",
  totalLabel = "الإجمالي",
}: {
  title: string;
  subtitle?: string;
  items: ChartSeriesItem[];
  unit?: string;
  totalLabel?: string;
}) {
  const total = items.reduce((acc, it) => acc + Math.max(0, it.value), 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  return (
    <section
      aria-label={title}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between gap-4"
    >
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {total === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          لا توجد سجلات مسجلة حالياً ضمن هذا التصنيف
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          <div className="sm:col-span-5 flex items-center justify-center">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg
                viewBox="0 0 110 110"
                className="w-32 h-32 -rotate-90"
                role="img"
                aria-label={`${title}: ${total} ${unit}`}
              >
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="transparent"
                  stroke="#E2E8F0"
                  strokeWidth="12"
                />
                {items.reduce<{
                  offset: number;
                  nodes: React.ReactNode[];
                }>(
                  (acc, item, idx) => {
                    const val = Math.max(0, item.value);
                    const pct = total > 0 ? val / total : 0;
                    const dash = pct * circumference;
                    const strokeColor =
                      item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
                    const node = (
                      <circle
                        key={item.label}
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="transparent"
                        stroke={strokeColor}
                        strokeWidth="12"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-acc.offset}
                      />
                    );
                    return {
                      offset: acc.offset + dash,
                      nodes: [...acc.nodes, node],
                    };
                  },
                  { offset: 0, nodes: [] }
                ).nodes}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                  {total.toLocaleString("en-US")}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {totalLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="sm:col-span-7 space-y-2">
            {items.map((item, idx) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              const dotColor =
                item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 text-xs p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {item.label}
                    </span>
                  </div>
                  <div className="font-mono text-slate-900 dark:text-white font-bold shrink-0">
                    {item.value.toLocaleString("en-US")} {unit}{" "}
                    <span className="text-[10px] text-slate-500 font-normal">
                      ({pct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Accessible Horizontal Bar Chart for category / department / stage comparisons.
 */
export function EnterpriseBarChart({
  title,
  subtitle,
  items,
  unit = "",
}: {
  title: string;
  subtitle?: string;
  items: ChartSeriesItem[];
  unit?: string;
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((acc, i) => acc + i.value, 0);

  return (
    <section
      aria-label={title}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          الإجمالي: {total.toLocaleString("en-US")} {unit}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          لا توجد بيانات متاحة للعرض
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const widthPct = Math.max(4, Math.round((item.value / maxVal) * 100));
            const barColor =
              item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
            const inner = (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.label}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {item.value.toLocaleString("en-US")} {unit}
                    {item.badge ? ` • ${item.badge}` : ""}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${item.value === 0 ? 0 : widthPct}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
            );
            return item.href ? (
              <Link key={item.label} href={item.href} className="block hover:opacity-90">
                {inner}
              </Link>
            ) : (
              <div key={item.label}>{inner}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
