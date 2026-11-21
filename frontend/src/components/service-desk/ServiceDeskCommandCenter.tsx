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
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Flame,
  Users,
  Inbox,
  Filter,
} from "lucide-react";

interface ServiceDeskMetrics {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  critical: number;
}

interface ServiceDeskCommandCenterProps {
  summary: ServiceDeskMetrics | null;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  unassignedCount?: number;
  pendingApprovalCount?: number;
}

export default function ServiceDeskCommandCenter({
  summary,
  activeFilter,
  onFilterChange,
  unassignedCount = 0,
  pendingApprovalCount = 0,
}: ServiceDeskCommandCenterProps) {
  const total = summary?.total || 0;
  const open = summary?.open || 0;
  const inProgress = summary?.in_progress || 0;
  const resolved = summary?.resolved || 0;
  const critical = summary?.critical || 0;

  const queues = [
    { id: "all", label: "كافة التذاكر", count: total, icon: Inbox },
    { id: "open", label: "غير مسندة / جديدة", count: open, icon: Users, alert: open > 5 },
    { id: "in_progress", label: "قيد المعالجة", count: inProgress, icon: Clock },
    { id: "critical", label: "تذاكر حرجة (P1)", count: critical, icon: Flame, alert: critical > 0 },
    { id: "pending_approval", label: "بانتظار الاعتماد", count: pendingApprovalCount, icon: ShieldAlert },
    { id: "resolved", label: "تم الحل / مغلقة", count: resolved, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-3">
      {/* Command Center Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {queues.map((q) => {
          const Icon = q.icon;
          const isActive = activeFilter === q.id;

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onFilterChange(q.id)}
              className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between cursor-pointer relative overflow-hidden ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md ring-2 ring-primary/20 scale-[1.02]"
                  : "bg-card border-border/70 hover:border-border text-card-foreground hover:shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? "text-primary-foreground"
                      : q.alert
                      ? "text-rose-500 animate-pulse"
                      : "text-muted-foreground"
                  }`}
                />
                {q.alert && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </div>

              <div>
                <div
                  className={`text-xl sm:text-2xl font-black tracking-tight ${
                    isActive ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {q.count}
                </div>
                <div
                  className={`text-[11px] font-bold truncate mt-0.5 ${
                    isActive ? "text-primary-foreground/90" : "text-muted-foreground"
                  }`}
                >
                  {q.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
