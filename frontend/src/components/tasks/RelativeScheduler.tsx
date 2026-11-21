/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React from "react";
import { Clock, Calendar, Zap } from "lucide-react";

interface RelativeSchedulerProps {
  value?: string; // ISO or YYYY-MM-DDTHH:mm
  onChange: (newIsoString: string) => void;
  className?: string;
}

export function RelativeScheduler({
  value,
  onChange,
  className = "",
}: RelativeSchedulerProps) {
  const formatForInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const applyRelativeOffset = (minutesToAdd: number) => {
    const now = new Date();
    const target = new Date(now.getTime() + minutesToAdd * 60 * 1000);
    onChange(formatForInput(target));
  };

  const applyEndOfDay = () => {
    const now = new Date();
    now.setHours(17, 0, 0, 0); // 5:00 PM today
    if (now.getTime() <= Date.now()) {
      now.setDate(now.getDate() + 1); // 5:00 PM tomorrow if already past 5pm
    }
    onChange(formatForInput(now));
  };

  const applyTomorrowMorning = () => {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0); // 9:00 AM tomorrow
    onChange(formatForInput(now));
  };

  const applyNextWeek = () => {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    now.setHours(10, 0, 0, 0);
    onChange(formatForInput(now));
  };

  const presets = [
    { label: "+30 دقيقة", action: () => applyRelativeOffset(30) },
    { label: "+ساعة", action: () => applyRelativeOffset(60) },
    { label: "+ ساعتين", action: () => applyRelativeOffset(120) },
    { label: "+ 4 ساعات", action: () => applyRelativeOffset(240) },
    { label: "نهاية اليوم", action: applyEndOfDay },
    { label: "صباح الغد", action: applyTomorrowMorning },
    { label: "بعد أسبوع", action: applyNextWeek },
  ];

  return (
    <div className={`space-y-2 text-right ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-primary" /> موعد الاستحقاق والجدولة الزمنية
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" /> اختصارات سريعة
        </span>
      </div>

      {/* Quick Relative Presets Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={preset.action}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-border bg-card hover:bg-primary hover:text-white hover:border-primary transition cursor-pointer text-muted-foreground shadow-2xs"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Standard Date-Time Picker Input */}
      <div className="relative">
        <input
          type="datetime-local"
          value={value ? value.slice(0, 16) : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 text-xs rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 font-mono"
        />
      </div>
    </div>
  );
}

export default RelativeScheduler;
