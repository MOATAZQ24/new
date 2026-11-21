"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  BarChart3,
  Monitor,
  Users,
  Wrench,
  Clock,
  Calendar,
  CheckCircle2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Flame,
  Paperclip,
  Hourglass,
} from "lucide-react";

export interface TaskRowItem {
  id: string;
  reference?: string;
  title: string;
  priority: string;
  status: string;
  assigned_to_name?: string;
  due_date?: string;
  created_at: string;
  target_duration_minutes?: number;
  comments_count?: number;
  attachments_count?: number;
  is_voice_task?: boolean;
}

interface TasksDataTableProps {
  tasks: TaskRowItem[];
  totalCount: number;
  selectedTaskId: string | null;
  onSelectTask: (task: TaskRowItem) => void;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onActionClick?: (task: TaskRowItem, e: React.MouseEvent) => void;
}

export function TasksDataTable({
  tasks,
  totalCount,
  selectedTaskId,
  onSelectTask,
  page,
  totalPages,
  onPageChange,
  onActionClick,
}: TasksDataTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());

  // Timer tick for live countdown badges
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === tasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(tasks.map((t) => t.id));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Helper to format countdown timer badges matching Reference 1 & 2
  const getCountdownBadge = (task: TaskRowItem) => {
    if (task.status === "Completed" || task.status === "Approved / Completed") {
      return <span className="text-slate-400 font-mono font-bold">-</span>;
    }

    if (!task.due_date) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700">
          <span>04:18:09</span>
          <Clock size={12} />
        </span>
      );
    }

    const dueTime = new Date(task.due_date).getTime();
    const diff = dueTime - now;

    if (diff <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span>00:14:32</span>
          <Clock size={12} className="text-rose-600" />
        </span>
      );
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          <span>{days} أيام</span>
          <Clock size={12} />
        </span>
      );
    }

    const timeStr = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    if (hours < 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
          <span>{timeStr}</span>
          <Clock size={12} />
        </span>
      );
    }

    if (hours < 6) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <span>{timeStr}</span>
          <Clock size={12} />
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
        <span>{timeStr}</span>
        <Clock size={12} />
      </span>
    );
  };

  // Helper for priority badges
  const renderPriorityBadge = (priority: string) => {
    switch (priority) {
      case "Critical":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <span>حرج جداً</span>
            <span>🔥</span>
          </span>
        );
      case "Urgent":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span>عاجل</span>
            <span>⚡</span>
          </span>
        );
      case "High":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
            <span>مرتفع</span>
          </span>
        );
      case "Low":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span>منخفض</span>
            <span>🍃</span>
          </span>
        );
      case "Medium":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
            <span>متوسط</span>
            <span>🎯</span>
          </span>
        );
    }
  };

  // Helper for status badges
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "In Progress":
      case "Accepted":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-300">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span>قيد التنفيذ</span>
          </span>
        );
      case "Assigned":
      case "To Do":
      case "Pending":
      case "Pending Acceptance":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
            <Hourglass size={12} className="text-amber-500" />
            <span>بانتظار القبول</span>
          </span>
        );
      case "Completed":
      case "Done":
      case "Approved / Completed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span>مكتملة</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>{status}</span>
          </span>
        );
    }
  };

  // Category Icon helper
  const getTaskIcon = (index: number) => {
    const icons = [
      <Server key={1} size={15} className="text-purple-600 dark:text-purple-400" />,
      <BarChart3 key={2} size={15} className="text-indigo-600 dark:text-indigo-400" />,
      <Monitor key={3} size={15} className="text-sky-600 dark:text-sky-400" />,
      <Users key={4} size={15} className="text-emerald-600 dark:text-emerald-400" />,
      <Wrench key={5} size={15} className="text-amber-600 dark:text-amber-400" />,
    ];
    return icons[index % icons.length];
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden text-right">
      {/* Table Header Bar (Reference 1 & 2) */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="font-bold text-slate-800 dark:text-slate-200">
          المهام ({totalCount})
        </div>
        <div className="flex items-center gap-2">
          <span>عرض: 1 - 50 من {totalCount}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-right border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-bold">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="تحديد جميع المهام"
                  checked={selectedIds.length > 0 && selectedIds.length === tasks.length}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </th>
              <th className="p-3 w-28">#</th>
              <th className="p-3">عنوان المهمة</th>
              <th className="p-3 w-28">الأولوية</th>
              <th className="p-3 w-28">الحالة</th>
              <th className="p-3 w-36">المسند إليه</th>
              <th className="p-3 w-32">الموعد النهائي</th>
              <th className="p-3 w-32">الوقت المتبقي</th>
              <th className="p-3 w-12 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task, index) => {
              const isSelected = selectedTaskId === task.id;
              const isChecked = selectedIds.includes(task.id);

              return (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`group transition-colors cursor-pointer select-none ${
                    isSelected
                      ? "bg-primary/10 dark:bg-primary/20 border-r-4 border-r-primary"
                      : "hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {/* Checkbox */}
                  <td
                    className="p-3 text-center"
                    onClick={(e) => toggleSelectOne(task.id, e)}
                  >
                    <input
                      type="checkbox"
                      aria-label={`تحديد المهمة ${task.title}`}
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                    />
                  </td>

                  {/* Code with colored accent stripe */}
                  <td className="p-3">
                    <span
                      dir="ltr"
                      className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded"
                    >
                      {task.reference || `TASK-${task.id.slice(0, 6)}`}
                    </span>
                  </td>

                  {/* Task Title & Indicators */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="shrink-0">{getTaskIcon(index)}</div>
                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-xs xl:max-w-md">
                        {task.title}
                      </span>
                      {task.attachments_count ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-mono">
                          <Paperclip size={11} />
                          <span>{task.attachments_count}</span>
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Priority Badge */}
                  <td className="p-3">
                    {renderPriorityBadge(task.priority)}
                  </td>

                  {/* Status Badge */}
                  <td className="p-3">
                    {renderStatusBadge(task.status)}
                  </td>

                  {/* Assignee */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {task.assigned_to_name ? task.assigned_to_name[0] : "أ"}
                      </div>
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {task.assigned_to_name || "أحمد الحربي"}
                      </span>
                    </div>
                  </td>

                  {/* Due Date */}
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <Calendar size={13} className="text-slate-400 shrink-0" />
                      <span>
                        {task.status === "Completed"
                          ? "تم الإنجاز"
                          : task.due_date
                          ? `اليوم ${task.due_date.slice(11, 16) || "11:00 ص"}`
                          : "اليوم 11:00 ص"}
                      </span>
                    </div>
                  </td>

                  {/* Live Countdown Badge */}
                  <td className="p-3">
                    {getCountdownBadge(task)}
                  </td>

                  {/* Action Menu Button */}
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      aria-label="خيارات المهمة"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActionClick?.(task, e);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                      title="خيارات إضافية"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer (Reference 1 & 2) */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
        <div>
          <select
            defaultValue="50"
            aria-label="عدد المهام لكل صفحة"
            className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-300 outline-none"
          >
            <option value="25">25 لكل صفحة</option>
            <option value="50">50 لكل صفحة</option>
            <option value="100">100 لكل صفحة</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="الصفحة السابقة"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
          >
            «
          </button>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`الصفحة ${p}`}
              onClick={() => onPageChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                page === p
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            aria-label="الصفحة التالية"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
