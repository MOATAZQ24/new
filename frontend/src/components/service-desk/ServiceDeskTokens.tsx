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
  Laptop,
  Wifi,
  Shield,
  Layers,
  Mail,
  HelpCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  UserCheck,
  RefreshCw,
} from "lucide-react";

export function getCategoryIcon(category: string, className = "w-4 h-4") {
  switch (category?.toLowerCase()) {
    case "hardware":
      return <Laptop className={className} />;
    case "network":
      return <Wifi className={className} />;
    case "access":
    case "security":
      return <Shield className={className} />;
    case "software":
      return <Layers className={className} />;
    case "email":
      return <Mail className={className} />;
    case "replacement":
      return <RefreshCw className={className} />;
    default:
      return <HelpCircle className={className} />;
  }
}

export function ServicePriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    Critical: {
      label: "حرج جداً (P1)",
      bg: "bg-rose-500/10 border-rose-500/30",
      text: "text-rose-700 dark:text-rose-400 font-bold",
      dot: "bg-rose-500 animate-pulse",
    },
    Urgent: {
      label: "عاجل (P2)",
      bg: "bg-orange-500/10 border-orange-500/30",
      text: "text-orange-700 dark:text-orange-400 font-bold",
      dot: "bg-orange-500",
    },
    High: {
      label: "مرتفع (P3)",
      bg: "bg-amber-500/10 border-amber-500/30",
      text: "text-amber-700 dark:text-amber-400 font-bold",
      dot: "bg-amber-500",
    },
    Medium: {
      label: "متوسط (P4)",
      bg: "bg-blue-500/10 border-blue-500/30",
      text: "text-blue-700 dark:text-blue-400 font-medium",
      dot: "bg-blue-500",
    },
    Low: {
      label: "منخفض (P5)",
      bg: "bg-slate-500/10 border-slate-500/30",
      text: "text-slate-700 dark:text-slate-400 font-medium",
      dot: "bg-slate-400",
    },
  };

  const current = map[priority] || map.Medium;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${current.bg} ${current.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
}

export function ServiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    Open: {
      label: "مفتوحة",
      bg: "bg-sky-500/10 border-sky-500/30",
      text: "text-sky-700 dark:text-sky-400",
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    Assigned: {
      label: "مسندة لفني",
      bg: "bg-indigo-500/10 border-indigo-500/30",
      text: "text-indigo-700 dark:text-indigo-400",
      icon: <UserCheck className="w-3.5 h-3.5" />,
    },
    "In Progress": {
      label: "قيد المعالجة",
      bg: "bg-amber-500/10 border-amber-500/30",
      text: "text-amber-700 dark:text-amber-400",
      icon: <Clock className="w-3.5 h-3.5 animate-spin" />,
    },
    "Pending Approval": {
      label: "بانتظار الاعتماد",
      bg: "bg-purple-500/10 border-purple-500/30",
      text: "text-purple-700 dark:text-purple-400",
      icon: <Shield className="w-3.5 h-3.5" />,
    },
    "Waiting for User": {
      label: "بانتظار المستخدم",
      bg: "bg-orange-500/10 border-orange-500/30",
      text: "text-orange-700 dark:text-orange-400",
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    Resolved: {
      label: "تم الحل",
      bg: "bg-emerald-500/10 border-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-400",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    Closed: {
      label: "مغلقة نهائياً",
      bg: "bg-slate-500/10 border-slate-500/30",
      text: "text-slate-600 dark:text-slate-400",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    Cancelled: {
      label: "ملغية / مرفوضة",
      bg: "bg-rose-500/10 border-rose-500/30",
      text: "text-rose-700 dark:text-rose-400",
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };

  const current = map[status] || {
    label: status,
    bg: "bg-slate-500/10 border-slate-500/30",
    text: "text-slate-700 dark:text-slate-400",
    icon: <FileText className="w-3.5 h-3.5" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${current.bg} ${current.text}`}
    >
      {current.icon}
      {current.label}
    </span>
  );
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Approved":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> معتمد
        </span>
      );
    case "Rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400">
          <XCircle className="w-3.5 h-3.5" /> مرفوض
        </span>
      );
    case "Pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5" /> قيد المراجعة
        </span>
      );
  }
}

export function SlaCountdownPill({
  targetAt,
  status,
  isPaused = false,
}: {
  targetAt?: string | null;
  status?: string;
  isPaused?: boolean;
}) {
  if (!targetAt) return null;
  if (status === "Resolved" || status === "Closed" || status === "Cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> مكتمل
      </span>
    );
  }

  if (isPaused) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
        <Clock className="w-3 h-3" /> مؤقت (انتظار العميل)
      </span>
    );
  }

  const now = new Date().getTime();
  const target = new Date(targetAt).getTime();
  const diffMs = target - now;
  const isBreached = diffMs <= 0;
  const absMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;

  if (isBreached) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
        <AlertTriangle className="w-3 h-3" /> متأخر {hours > 0 ? `${hours}س ` : ""}{minutes}د
      </span>
    );
  }

  // Warning when less than 2 hours left
  const isUrgent = diffMs < 2 * 60 * 60 * 1000;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
        isUrgent
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      }`}
    >
      <Clock className="w-3 h-3" /> متبقي {hours > 0 ? `${hours}س ` : ""}{minutes}د
    </span>
  );
}
