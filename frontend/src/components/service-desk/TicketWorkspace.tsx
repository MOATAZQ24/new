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
  MessageSquare,
  Lock,
  Cpu,
  Shield,
  CheckSquare,
  Send,
  Clock,
  User,
  AlertTriangle,
  FileText,
  Volume2,
  Calendar,
  Building,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  ServicePriorityBadge,
  ServiceStatusBadge,
  ApprovalStatusBadge,
  SlaCountdownPill,
  getCategoryIcon,
} from "./ServiceDeskTokens";

interface CommentItem {
  id: string;
  user_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

interface ApprovalItem {
  id: string;
  stage_name: string;
  stage_order: number;
  status: string;
  approver_name?: string;
  decided_by_name?: string;
  decision_notes?: string;
  created_at?: string;
  decided_at?: string;
}

interface AssetHistoryTicket {
  id: string;
  ticket_number: string;
  issue_title: string;
  status: string;
  created_at: string;
}

interface TicketWorkspaceDetail {
  id: string;
  company_id: string;
  ticket_number: string;
  issue_title: string;
  issue_description: string;
  requester_name?: string;
  requester_email?: string;
  assigned_technician_name?: string;
  priority: string;
  status: string;
  category: string;
  catalog_item_name?: string;
  sla_target_at?: string;
  sla_paused_at?: string;
  first_response_at?: string;
  voice_note_url?: string;
  custom_fields_data?: Record<string, any>;
  comments: CommentItem[];
  approvals_data?: ApprovalItem[];
  related_asset_info?: {
    id: string;
    asset_name: string;
    asset_code: string;
    serial_number?: string;
    model?: string;
    status?: string;
    past_tickets?: AssetHistoryTicket[];
  } | null;
  linked_task_id?: string | null;
  linked_task_title?: string | null;
  linked_task_status?: string | null;
  notes?: string;
  created_at: string;
}

interface TicketWorkspaceProps {
  ticket: TicketWorkspaceDetail;
  onClose: () => void;
  onRefresh: () => void;
  onConvertToTask: () => void;
}

export default function TicketWorkspace({
  ticket,
  onClose,
  onRefresh,
  onConvertToTask,
}: TicketWorkspaceProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"conversation" | "asset" | "approvals" | "tasks">("conversation");
  const [commentText, setCommentText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    try {
      setUpdatingStatus(true);
      await api.post(`/tickets/${ticket.id}/status?new_status=${encodeURIComponent(newStatus)}`);
      toast.success(`تم تحديث حالة التذكرة إلى: ${newStatus}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث حالة التذكرة");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setSubmittingComment(true);
      await api.post(`/tickets/${ticket.id}/comments`, {
        content: commentText.trim(),
        is_internal: isInternalNote,
      });
      setCommentText("");
      setIsInternalNote(false);
      toast.success(isInternalNote ? "تم تسجيل الملاحظة الفنية الداخلية بنجاح" : "تم إرسال الرد للمستخدم بنجاح");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إرسال الرد");
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-3xl shadow-2xl flex flex-col h-full max-h-[90vh] overflow-hidden">
      {/* Workspace Top Header Bar */}
      <div className="bg-muted/40 border-b border-border/60 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground transition"
            title="رجوع للقائمة"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                {ticket.ticket_number}
              </span>
              <ServicePriorityBadge priority={ticket.priority} />
              <ServiceStatusBadge status={ticket.status} />
              <SlaCountdownPill
                targetAt={ticket.sla_target_at}
                status={ticket.status}
                isPaused={!!ticket.sla_paused_at}
              />
            </div>
            <h2 className="text-base sm:text-lg font-black text-foreground mt-1 text-right">
              {ticket.issue_title}
            </h2>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          {!ticket.linked_task_id && (
            <button
              type="button"
              onClick={onConvertToTask}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition"
            >
              <CheckSquare className="w-3.5 h-3.5 text-primary" /> تحويل لمهمة
            </button>
          )}

          {/* Status Quick Dropdown */}
          <select
            value={ticket.status}
            disabled={updatingStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="Open">مفتوحة (Open)</option>
            <option value="Assigned">مسندة (Assigned)</option>
            <option value="In Progress">قيد المعالجة (In Progress)</option>
            <option value="Waiting for User">بانتظار العميل (Waiting for User)</option>
            <option value="Pending Approval">بانتظار الاعتماد (Pending Approval)</option>
            <option value="Resolved">تم الحل (Resolved)</option>
            <option value="Closed">مغلقة (Closed)</option>
          </select>
        </div>
      </div>

      {/* Workspace Split Layout: Main Content (Tabs) + Meta Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden">
        {/* Main 2-Cols: Tabbed Details & Interaction */}
        <div className="lg:col-span-2 flex flex-col border-b lg:border-b-0 lg:border-l border-border/60 overflow-hidden">
          {/* Tabs Header */}
          <div className="flex items-center border-b border-border/60 bg-muted/20 px-4 pt-2 gap-1 overflow-x-auto">
            {[
              { id: "conversation", label: "المحادثة والردود", icon: MessageSquare, count: ticket.comments?.length || 0 },
              { id: "asset", label: "سجل الأصل التقني", icon: Cpu, count: ticket.related_asset_info?.past_tickets?.length },
              { id: "approvals", label: "الاعتمادات الإدارية", icon: Shield, count: ticket.approvals_data?.length },
              { id: "tasks", label: "المهام المرتبطة", icon: CheckSquare, active: !!ticket.linked_task_id },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "border-primary text-primary bg-background rounded-t-lg"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  {typeof t.count === "number" && t.count > 0 && (
                    <span className="w-4 h-4 rounded-full bg-muted text-[10px] flex items-center justify-center font-bold">
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: CONVERSATION & INTERNAL NOTES */}
          {activeTab === "conversation" && (
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              {/* Ticket Original Description Box */}
              <div className="bg-muted/30 border border-border/60 rounded-2xl p-3.5 mb-3 text-right">
                <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> صاحب البلاغ: {ticket.requester_name || "موظف"}
                  </span>
                  <span>{new Date(ticket.created_at).toLocaleDateString("ar-EG")}</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                  {ticket.issue_description}
                </p>

                {ticket.voice_note_url && (
                  <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-2 text-xs text-primary font-bold">
                    <Volume2 className="w-4 h-4" />
                    <span>ملاحظة صوتية مرفقة:</span>
                    <audio controls className="h-8 w-60">
                      <source src={ticket.voice_note_url} type="audio/webm" />
                    </audio>
                  </div>
                )}
              </div>

              {/* Comments Feed */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {ticket.comments?.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    لا توجد ردود بعد. يمكنك إضافة أول رد أو ملاحظة فنية أدناه.
                  </div>
                ) : (
                  ticket.comments.map((comm) => (
                    <div
                      key={comm.id}
                      className={`p-3 rounded-2xl border text-right transition ${
                        comm.is_internal
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
                          : "bg-card border-border/70 text-card-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-bold flex items-center gap-1">
                          {comm.is_internal && (
                            <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded font-black flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> ملاحظة فنية سرية
                            </span>
                          )}
                          {comm.user_name}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(comm.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">{comm.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Composer */}
              <form onSubmit={handleAddComment} className="pt-3 border-t border-border/60 mt-2">
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        !isInternalNote
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      رد عام للمستخدم
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                        isInternalNote
                          ? "bg-amber-500 text-white shadow-2xs"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <Lock className="w-3 h-3" /> ملاحظة فنية داخلية
                    </button>
                  </div>
                  {isInternalNote && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                      لن يظهر هذا الرد للموظف، متاح فقط للفريق التقني
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    placeholder={
                      isInternalNote
                        ? "اكتب تفاصيل التشخيص الفني، نتائج الفحص، أو تعليمات للفني المناوب..."
                        : "اكتب رداً موجهاً للمستخدم لمساعدته أو طلب معلومات إضافية..."
                    }
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className={`flex-1 p-2 text-xs rounded-xl border outline-none focus:ring-2 ${
                      isInternalNote
                        ? "bg-amber-500/5 border-amber-500/40 focus:ring-amber-500/20"
                        : "bg-background border-border focus:ring-primary/20"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 ${
                      isInternalNote
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-primary text-primary-foreground hover:opacity-95"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: ASSET HISTORY & SPECS */}
          {activeTab === "asset" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-right">
              {ticket.related_asset_info ? (
                <>
                  <div className="bg-muted/30 border border-border/70 rounded-2xl p-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <div>
                        <h4 className="text-sm font-black text-foreground">
                          {ticket.related_asset_info.asset_name}
                        </h4>
                        <span className="font-mono text-xs text-muted-foreground">
                          كود الأصل: {ticket.related_asset_info.asset_code}
                        </span>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold">
                        {ticket.related_asset_info.status || "نشط"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">الرقم التسلسلي:</span>
                        <span className="font-mono font-bold text-foreground">
                          {ticket.related_asset_info.serial_number || "غير محدد"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">الموديل / المواصفات:</span>
                        <span className="font-bold text-foreground">
                          {ticket.related_asset_info.model || "قياسي"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Past Tickets History */}
                  <div>
                    <h4 className="text-xs font-black text-foreground mb-2 flex items-center gap-1.5 justify-end">
                      <Clock className="w-3.5 h-3.5 text-primary" /> سجل الأعطال والصيانة السابقة لهذا الأصل
                    </h4>

                    {ticket.related_asset_info.past_tickets &&
                    ticket.related_asset_info.past_tickets.length > 0 ? (
                      <div className="space-y-2">
                        {ticket.related_asset_info.past_tickets.map((pt) => (
                          <div
                            key={pt.id}
                            className="p-3 rounded-xl border border-border/70 bg-card flex items-center justify-between text-xs"
                          >
                            <ServiceStatusBadge status={pt.status} />
                            <div className="text-right">
                              <span className="font-bold text-foreground block">{pt.issue_title}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {pt.ticket_number} • {new Date(pt.created_at).toLocaleDateString("ar-EG")}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                        لا توجد تذاكر أو أعطال مسجلة مسبقاً لهذا الجهاز.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  لم يتم ربط أصل تقني محدد بهذه التذكرة.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: APPROVALS & GOVERNANCE */}
          {activeTab === "approvals" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-right">
              {ticket.approvals_data && ticket.approvals_data.length > 0 ? (
                ticket.approvals_data.map((appr) => (
                  <div
                    key={appr.id}
                    className="p-4 rounded-2xl border border-border/80 bg-card space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <ApprovalStatusBadge status={appr.status} />
                      <span className="text-xs font-black text-foreground">
                        مرحلة: {appr.stage_name} (المرحلة {appr.stage_order})
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center justify-between pt-1">
                      <span>المسؤول المعتمد: {appr.decided_by_name || appr.approver_name || "المدير المباشر"}</span>
                      {appr.decided_at && (
                        <span>{new Date(appr.decided_at).toLocaleDateString("ar-EG")}</span>
                      )}
                    </div>

                    {appr.decision_notes && (
                      <div className="text-xs bg-muted/40 p-2.5 rounded-xl border border-border/50 text-foreground mt-2">
                        <span className="font-bold text-muted-foreground block text-[10px] mb-0.5">
                          ملاحظات الاعتماد:
                        </span>
                        {appr.decision_notes}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  هذه التذكرة تتبع مسار الدعم المباشر ولا تتطلب اعتمادات إدارية.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LINKED TASKS */}
          {activeTab === "tasks" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-right">
              {ticket.linked_task_id ? (
                <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {ticket.linked_task_status || "قيد التنفيذ"}
                    </span>
                    <span className="text-xs font-black text-foreground">
                      مهمة تشغيلية مرتبطة
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground">
                    {ticket.linked_task_title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    تم إنشاء هذه المهمة تلقائياً لمتابعة العمل الميداني أو التوريد.
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground space-y-3">
                  <p>لا توجد مهمة تشغيلية مرتبطة بهذه التذكرة حالياً.</p>
                  <button
                    type="button"
                    onClick={onConvertToTask}
                    className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs"
                  >
                    إنشاء مهمة تشغيلية من هذه التذكرة
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar 1-Col: Ticket Metadata & ITIL Context */}
        <div className="p-4 sm:p-5 bg-muted/20 space-y-4 text-right overflow-y-auto">
          <div>
            <span className="text-xs font-bold text-muted-foreground block mb-1">
              خدمة الدليل المرتبطة:
            </span>
            <div className="text-xs font-black text-foreground flex items-center gap-1.5 justify-end">
              <span>{ticket.catalog_item_name || "بلاغ عطل قياسي"}</span>
              {getCategoryIcon(ticket.category, "w-4 h-4 text-primary")}
            </div>
          </div>

          <div className="pt-3 border-t border-border/60">
            <span className="text-xs font-bold text-muted-foreground block mb-1">
              الفني المعين للمتابعة:
            </span>
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5 justify-end">
              <span>{ticket.assigned_technician_name || "غير مسندة (في قائمة الانتظار)"}</span>
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>

          <div className="pt-3 border-t border-border/60">
            <span className="text-xs font-bold text-muted-foreground block mb-1">
              مؤشرات مستوى الخدمة (SLA):
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-bold text-foreground">
                  {ticket.first_response_at
                    ? new Date(ticket.first_response_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
                    : "بانتظار أول استجابة"}
                </span>
                <span>أول استجابة فنية:</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-bold text-foreground">
                  {ticket.sla_target_at
                    ? new Date(ticket.sla_target_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
                    : "غير محدد"}
                </span>
                <span>الموعد النهائي للحل:</span>
              </div>
            </div>
          </div>

          {/* Dynamic Schema Fields Preview */}
          {ticket.custom_fields_data && Object.keys(ticket.custom_fields_data).length > 0 && (
            <div className="pt-3 border-t border-border/60">
              <span className="text-xs font-black text-foreground block mb-2">
                بيانات النموذج المخصص:
              </span>
              <div className="space-y-1.5 text-xs bg-card p-3 rounded-xl border border-border/60">
                {Object.entries(ticket.custom_fields_data).map(([key, val]) => (
                  <div key={key} className="flex flex-col text-right">
                    <span className="text-[10px] text-muted-foreground font-mono">{key}:</span>
                    <span className="font-bold text-foreground text-[11px]">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ticket.notes && (
            <div className="pt-3 border-t border-border/60">
              <span className="text-xs font-bold text-muted-foreground block mb-1">ملاحظات النظام:</span>
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{ticket.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
