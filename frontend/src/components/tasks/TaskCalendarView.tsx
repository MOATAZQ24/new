/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { type KanbanTaskItem } from "./TaskKanbanView";

interface TaskCalendarViewProps {
  tasks: KanbanTaskItem[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  className?: string;
}

export function TaskCalendarView({
  tasks,
  selectedTaskId,
  onSelectTask,
  className = "",
}: TaskCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month title in Arabic
  const monthNamesArabic = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayHeadersArabic = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  // Group tasks by day (YYYY-MM-DD)
  const tasksByDate: Record<string, KanbanTaskItem[]> = {};
  tasks.forEach((t) => {
    if (t.due_date) {
      const dateKey = t.due_date.slice(0, 10);
      if (!tasksByDate[dateKey]) tasksByDate[dateKey] = [];
      tasksByDate[dateKey].push(t);
    }
  });

  return (
    <div className={`bg-card border border-border/80 rounded-2xl p-4 shadow-2xs space-y-4 text-right ${className}`}>
      {/* Calendar Navigation Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-border hover:bg-muted text-foreground transition cursor-pointer"
          >
            اليوم
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={nextMonth}
              title="الشهر القادم"
              className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={prevMonth}
              title="الشهر السابق"
              className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h3 className="text-sm font-black text-foreground flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-primary" />
          <span>{monthNamesArabic[month]} {year}</span>
        </h3>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {/* Day of Week Headers */}
        {dayHeadersArabic.map((day) => (
          <div key={day} className="py-2 text-center text-[11px] font-bold text-muted-foreground bg-muted/30 rounded-lg">
            {day}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[85px] rounded-xl bg-muted/10 border border-transparent" />
        ))}

        {/* Days of Month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const padMonth = String(month + 1).padStart(2, "0");
          const padDay = String(dayNum).padStart(2, "0");
          const dateStr = `${year}-${padMonth}-${padDay}`;
          const dayTasks = tasksByDate[dateStr] || [];

          const isToday =
            new Date().getFullYear() === year &&
            new Date().getMonth() === month &&
            new Date().getDate() === dayNum;

          return (
            <div
              key={dateStr}
              className={`min-h-[95px] p-2 rounded-xl border text-right flex flex-col justify-between transition ${
                isToday
                  ? "border-primary bg-primary/5"
                  : "border-border/60 bg-card hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${
                    isToday ? "bg-primary text-white" : "text-foreground font-mono"
                  }`}
                >
                  {dayNum}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-bold">
                    {dayTasks.length} مهام
                  </span>
                )}
              </div>

              {/* Tasks Pills inside Day */}
              <div className="space-y-1 flex-1 overflow-y-auto max-h-[65px]">
                {dayTasks.map((t) => {
                  const isSelected = selectedTaskId === t.id;
                  const isDone = t.status === "Completed" || t.status === "Approved / Completed";

                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTask(t.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold truncate transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-primary text-white"
                          : isDone
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-muted text-foreground hover:bg-muted/80 border border-border/50"
                      }`}
                    >
                      <span className="truncate">{t.title}</span>
                      {isDone && <CheckCircle2 className="w-2.5 h-2.5 shrink-0 ml-1 text-emerald-600" />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TaskCalendarView;
