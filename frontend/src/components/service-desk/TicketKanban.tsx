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
  Clock,
  User,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Shield,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  ServicePriorityBadge,
  SlaCountdownPill,
  getCategoryIcon,
} from "./ServiceDeskTokens";

export interface KanbanTicket {
  id: string;
  ticket_number: string;
  issue_title: string;
  requester_name?: string;
  assigned_technician_name?: string;
  priority: string;
  status: string;
  category: string;
  sla_target_at?: string;
  sla_paused_at?: string;
  comments_count: number;
}

interface TicketKanbanProps {
  tickets: KanbanTicket[];
  onSelectTicket: (ticketId: string) => void;
  onUpdateStatus: (ticketId: string, newStatus: string) => Promise<void>;
}

const KANBAN_COLUMNS = [
  { id: "Open", label: "مفتوحة", color: "border-sky-500/50 bg-sky-500/5" },
  { id: "Assigned", label: "مسندة", color: "border-indigo-500/50 bg-indigo-500/5" },
  { id: "In Progress", label: "قيد المعالجة", color: "border-amber-500/50 bg-amber-500/5" },
  { id: "Pending Approval", label: "بانتظار الاعتماد", color: "border-purple-500/50 bg-purple-500/5" },
  { id: "Waiting for User", label: "بانتظار العميل", color: "border-orange-500/50 bg-orange-500/5" },
  { id: "Resolved", label: "تم الحل", color: "border-emerald-500/50 bg-emerald-500/5" },
];

export default function TicketKanban({
  tickets,
  onSelectTicket,
  onUpdateStatus,
}: TicketKanbanProps) {
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMove = async (ticketId: string, currentStatus: string, direction: "next" | "prev") => {
    const currentIndex = KANBAN_COLUMNS.findIndex((c) => c.id === currentStatus);
    if (currentIndex === -1) return;

    const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= KANBAN_COLUMNS.length) return;

    const targetStatus = KANBAN_COLUMNS[targetIndex].id;
    try {
      setMovingId(ticketId);
      await onUpdateStatus(ticketId, targetStatus);
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-[1200px] items-start">
        {KANBAN_COLUMNS.map((col, colIdx) => {
          const colTickets = tickets.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              className={`flex-1 min-w-[260px] max-w-[320px] rounded-2xl border ${col.color} flex flex-col max-h-[750px] shadow-2xs`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-border/50 flex items-center justify-between">
                <span className="w-6 h-6 rounded-full bg-card border border-border text-xs font-black flex items-center justify-center text-foreground">
                  {colTickets.length}
                </span>
                <h3 className="text-xs font-extrabold text-foreground">{col.label}</h3>
              </div>

              {/* Tickets Cards List */}
              <div className="p-2.5 flex-1 overflow-y-auto space-y-2.5">
                {colTickets.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground/60">
                    لا توجد تذاكر هنا
                  </div>
                ) : (
                  colTickets.map((t) => (
                    <div
                      key={t.id}
                      className="bg-card border border-border/70 rounded-xl p-3 shadow-2xs hover:shadow-md transition text-right space-y-2.5 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {t.ticket_number}
                        </span>
                        <ServicePriorityBadge priority={t.priority} />
                      </div>

                      <h4
                        onClick={() => onSelectTicket(t.id)}
                        className="text-xs font-bold text-foreground hover:text-primary transition cursor-pointer line-clamp-2"
                      >
                        {t.issue_title}
                      </h4>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-primary" /> {t.requester_name || "موظف"}
                        </span>
                        {t.comments_count > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> {t.comments_count}
                          </span>
                        )}
                      </div>

                      {/* Card Bottom Controls */}
                      <div className="flex items-center justify-between pt-1">
                        <SlaCountdownPill
                          targetAt={t.sla_target_at}
                          status={t.status}
                          isPaused={!!t.sla_paused_at}
                        />

                        {/* Quick Kanban Status Shifters */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          {colIdx > 0 && (
                            <button
                              type="button"
                              title="إرجاع للمرحلة السابقة"
                              disabled={movingId === t.id}
                              onClick={() => handleMove(t.id, t.status, "prev")}
                              className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer disabled:opacity-40"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {colIdx < KANBAN_COLUMNS.length - 1 && (
                            <button
                              type="button"
                              title="نقل للمرحلة التالية"
                              disabled={movingId === t.id}
                              onClick={() => handleMove(t.id, t.status, "next")}
                              className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer disabled:opacity-40"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
