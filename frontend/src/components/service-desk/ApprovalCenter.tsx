/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertTriangle,
  FileText,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import Modal from "@/components/ui/Modal";
import { ServicePriorityBadge, ApprovalStatusBadge } from "./ServiceDeskTokens";

interface ApprovalRecord {
  id: string;
  ticket_id: string;
  ticket_number?: string;
  ticket_title?: string;
  ticket_priority?: string;
  ticket_creator_name?: string;
  stage_name: string;
  stage_order: number;
  status: string;
  approver_id?: string;
  approver_name?: string;
  decided_by_name?: string;
  decision_notes?: string;
  created_at: string;
  decided_at?: string;
}

interface ApprovalCenterProps {
  onRefreshParent?: () => void;
}

export default function ApprovalCenter({ onRefreshParent }: ApprovalCenterProps) {
  const { currentCompany } = useAuth();
  const toast = useToast();

  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"Pending" | "Decided">("Pending");

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRecord | null>(null);
  const [decisionType, setDecisionType] = useState<"Approved" | "Rejected">("Approved");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await api.get<ApprovalRecord[]>("/tickets/approvals");
      setApprovals(res.data || []);
    } catch (err) {
      console.error("Failed to load approvals", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) void loadApprovals();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadApprovals, currentCompany]);

  const handleOpenDecision = (appr: ApprovalRecord, type: "Approved" | "Rejected") => {
    setSelectedApproval(appr);
    setDecisionType(type);
    setDecisionNotes("");
    setDecisionModal(true);
  };

  const handleConfirmDecision = async () => {
    if (!selectedApproval) return;
    try {
      setSubmitting(true);
      await api.post(`/tickets/approvals/${selectedApproval.id}/decision`, {
        decision: decisionType,
        notes: decisionNotes.trim() || null,
      });

      toast.success(
        decisionType === "Approved"
          ? "تم اعتماد الطلب بنجاح وتوجيهه إلى فني التنفيذ"
          : "تم رفض الطلب وتسجيل الملاحظات"
      );
      setDecisionModal(false);
      loadApprovals();
      onRefreshParent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل قرار الاعتماد");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredApprovals = approvals.filter((a) =>
    activeTab === "Pending" ? a.status === "Pending" : a.status !== "Pending"
  );

  return (
    <div className="space-y-4">
      {/* Top Controls & Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("Pending")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "Pending"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>بانتظار الاعتماد ({approvals.filter((a) => a.status === "Pending").length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("Decided")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "Decided"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>السجلات المعتمدة والمرفوضة</span>
          </button>
        </div>

        <button
          type="button"
          onClick={loadApprovals}
          className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground transition"
          title="تحديث قائمة الاعتمادات"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          جاري استعلام طلبات الاعتماد...
        </div>
      ) : filteredApprovals.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground bg-card border border-border/60 rounded-2xl">
          لا توجد طلبات اعتماد مطابقة في هذا التصنيف.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredApprovals.map((appr) => (
            <div
              key={appr.id}
              className="bg-card border border-border/80 rounded-2xl p-4 shadow-2xs text-right space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <ApprovalStatusBadge status={appr.status} />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {appr.ticket_number || "تذكرة"}
                  </span>
                  {appr.ticket_priority && (
                    <ServicePriorityBadge priority={appr.ticket_priority} />
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold text-foreground mb-1">
                  {appr.ticket_title || "طلب خدمة يتطلب اعتماد"}
                </h4>
                <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>صاحب الطلب: {appr.ticket_creator_name || "موظف"}</span>
                  <span>المرحلة: {appr.stage_name}</span>
                </div>
              </div>

              {appr.decision_notes && (
                <div className="bg-muted/40 p-2.5 rounded-xl text-xs text-foreground border border-border/40">
                  <span className="font-bold text-muted-foreground block text-[10px] mb-0.5">
                    ملاحظات القرار:
                  </span>
                  {appr.decision_notes}
                </div>
              )}

              {/* Action Buttons for Pending */}
              {appr.status === "Pending" && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => handleOpenDecision(appr, "Approved")}
                    className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> اعتماد الطلب
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDecision(appr, "Rejected")}
                    className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1 transition cursor-pointer shadow-xs"
                  >
                    <XCircle className="w-3.5 h-3.5" /> رفض
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Decision Dialog Modal */}
      <Modal
        isOpen={decisionModal}
        onClose={() => setDecisionModal(false)}
        title={decisionType === "Approved" ? "تأكيد اعتماد طلب الخدمة" : "تأكيد رفض طلب الخدمة"}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 text-right">
          <p className="text-xs text-muted-foreground">
            التذكرة: {selectedApproval?.ticket_number} - {selectedApproval?.ticket_title}
          </p>
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium ${
              decisionType === "Approved"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
            }`}
          >
            {decisionType === "Approved" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>
              {decisionType === "Approved"
                ? "باعتمادك هذا الطلب، سيتم نقله آلياً لمرحلة التنفيذ الفني وتكليف الفريق المختص."
                : "برفضك هذا الطلب، سيتم إشعار الموظف وإلغاء استكمال الإجراء مع توثيق الأسباب."}
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground">
              ملاحظات أو مبررات القرار {decisionType === "Rejected" && <span className="text-rose-500">*</span>}
            </label>
            <textarea
              rows={3}
              required={decisionType === "Rejected"}
              placeholder="اكتب التوجيهات الفنية أو سبب الرفض هنا ليتم إدراجها في السجل..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setDecisionModal(false)}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted text-muted-foreground transition"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={submitting || (decisionType === "Rejected" && !decisionNotes.trim())}
              onClick={handleConfirmDecision}
              className={`px-5 py-2 text-xs font-extrabold text-white rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer ${
                decisionType === "Approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {submitting ? "جاري التسجيل..." : "تأكيد القرار"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
