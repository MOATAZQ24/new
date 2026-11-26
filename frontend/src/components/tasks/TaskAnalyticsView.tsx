/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  Zap,
  TrendingUp,
  Users,
} from "lucide-react";
import { type KanbanTaskItem } from "./TaskKanbanView";

interface TaskAnalyticsViewProps {
  tasks: KanbanTaskItem[];
  totalCount: number;
  className?: string;
}

export function TaskAnalyticsView({
  tasks,
  totalCount,
  className = "",
}: TaskAnalyticsViewProps) {
  const total = totalCount || tasks.length || 1;
  const completed = tasks.filter((t) => t.status === "Completed" || t.status === "Approved / Completed").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const assigned = tasks.filter((t) => t.status === "Assigned" || t.status === "Draft").length;
  const blocked = tasks.filter((t) => t.status === "Blocked").length;

  const critical = tasks.filter((t) => t.priority === "Critical").length;
  const urgent = tasks.filter((t) => t.priority === "Urgent").length;
  const high = tasks.filter((t) => t.priority === "High").length;
  const medium = tasks.filter((t) => t.priority === "Medium").length;
  const low = tasks.filter((t) => t.priority === "Low").length;

  const completionRate = Math.round((completed / total) * 100);

  return (
    <div className={`space-y-4 text-right ${className}`}>
      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold">نسبة الإنجاز التشغيلي</span>
          </div>
          <div className="text-2xl font-black text-foreground">{completionRate}%</div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <Clock className="w-4 h-4 text-sky-500" />
            <span className="text-xs font-bold">مهام قيد التنفيذ</span>
          </div>
          <div className="text-2xl font-black text-foreground">{inProgress}</div>
          <span className="text-[10px] text-muted-foreground block">
            {Math.round((inProgress / total) * 100)}% من إجمالي المهام
          </span>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <Flame className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-bold">مهام حرجة</span>
          </div>
          <div className="text-2xl font-black text-foreground">{critical}</div>
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block">
            أولوية قصوى للمتابعة الفورية
          </span>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold">مهام معلّقة</span>
          </div>
          <div className="text-2xl font-black text-foreground">{blocked}</div>
          <span className="text-[10px] text-muted-foreground block">
            تتطلب إزالة عوائق تشغيلية
          </span>
        </div>
      </div>

      {/* Breakdown Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-2xs space-y-3">
          <h4 className="text-xs font-black text-foreground flex items-center gap-2 justify-end">
            <BarChart3 className="w-4 h-4 text-primary" /> توزيع المهام حسب مرحلة التنفيذ
          </h4>

          <div className="space-y-2.5 pt-2">
            {[
              { label: "مكتملة ومغلقة", count: completed, color: "bg-emerald-500" },
              { label: "قيد التنفيذ النشط", count: inProgress, color: "bg-sky-500" },
              { label: "بانتظار قبول الفني", count: assigned, color: "bg-amber-500" },
              { label: "معلّقة لوجود عائق", count: blocked, color: "bg-rose-500" },
            ].map((st) => (
              <div key={st.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-foreground">{st.count}</span>
                  <span className="text-muted-foreground font-medium">{st.label}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${st.color} rounded-full transition-all`}
                    style={{ width: `${Math.round((st.count / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Breakdown */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-2xs space-y-3">
          <h4 className="text-xs font-black text-foreground flex items-center gap-2 justify-end">
            <Zap className="w-4 h-4 text-amber-500" /> تصنيف المهام حسب درجة الأهمية والأثر
          </h4>

          <div className="space-y-2.5 pt-2">
            {[
              { label: "حرج جداً (P1)", count: critical, color: "bg-rose-500" },
              { label: "عاجل (P2)", count: urgent, color: "bg-amber-500" },
              { label: "مرتفع (P3)", count: high, color: "bg-orange-500" },
              { label: "متوسط (P4)", count: medium, color: "bg-blue-500" },
              { label: "منخفض (P5)", count: low, color: "bg-slate-400" },
            ].map((p) => (
              <div key={p.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-foreground">{p.count}</span>
                  <span className="text-muted-foreground font-medium">{p.label}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${p.color} rounded-full transition-all`}
                    style={{ width: `${Math.round((p.count / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskAnalyticsView;
