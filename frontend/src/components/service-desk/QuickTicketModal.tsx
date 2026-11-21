/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Zap, AlertTriangle, Send, Mic } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import VoiceTaskRecorder, { type VoiceRecordingResult } from "@/components/tasks/VoiceTaskRecorder";

interface QuickTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuickTicketModal({
  isOpen,
  onClose,
  onSuccess,
}: QuickTicketModalProps) {
  const { currentCompany } = useAuth();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Hardware");
  const [priority, setPriority] = useState("High");
  const [voiceResult, setVoiceResult] = useState<VoiceRecordingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("يرجى إدخال عنوان للبلاغ السريع");
      return;
    }

    try {
      setSubmitting(true);
      let voiceUrl: string | null = null;
      if (voiceResult?.blob) {
        const voiceFormData = new FormData();
        voiceFormData.append("file", voiceResult.blob, "quick_ticket_voice.webm");
        const uploadRes = await fetch("/api/v1/tickets/voice/upload", {
          method: "POST",
          body: voiceFormData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          voiceUrl = upJson.data?.voice_note_url || null;
        }
      }

      await api.post("/tickets", {
        company_id: currentCompany?.id,
        issue_title: title.trim(),
        issue_description: description.trim() || title.trim(),
        category,
        priority,
        ticket_type: "Incident",
        tier: "L1",
        voice_note_url: voiceUrl,
      });

      toast.success("تم إرسال البلاغ الفوري للفريق التقني بنجاح!");
      setTitle("");
      setDescription("");
      setVoiceResult(null);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تقديم البلاغ السريع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="بلاغ فني سريع (30 ثانية)"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-right">
        <p className="text-xs text-muted-foreground">
          إبلاغ مباشر عن عطل طارئ دون الحاجة لملء نماذج مطولة
        </p>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-2.5">
          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            يتم توجيه هذا البلاغ فوراً لأقرب فني متاح وفق خوارزمية التوزيع المتوازن.
          </span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-foreground">
            ما المشكلة التي تواجهها باختصار؟ <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="مثال: انقطاع الإنترنت عن الطابق الثاني / الطابعة لا تستجيب"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground">القسم / التصنيف</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="Hardware">أجهزة وعتاد (Hardware)</option>
              <option value="Network">شبكة واتصال (Network)</option>
              <option value="Software">أنظمة وبرامج (Software)</option>
              <option value="Access">صلاحيات وأمان (Access)</option>
              <option value="Email">البريد الإلكتروني (Email)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground">مستوى الإلحاح</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none font-bold"
            >
              <option value="Critical">حرج جداً (P1 - توقف العمل)</option>
              <option value="High">عاجل (P2 - أثر كبير)</option>
              <option value="Medium">متوسط (P3 - مشكلة عادية)</option>
              <option value="Low">منخفض (P4 - غير ملح)</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-foreground">ملاحظات إضافية</label>
          <textarea
            rows={2}
            placeholder="رقم الغرفة أو رقم الخطأ إن وجد..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-foreground mb-1 block">
            أو سجل صوتك مباشرة:
          </label>
          <VoiceTaskRecorder onRecordingComplete={(r) => setVoiceResult(r)} />
        </div>

        <div className="pt-3 border-t border-border/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted text-muted-foreground transition"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-black bg-primary text-primary-foreground hover:opacity-95 rounded-xl shadow-md transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? "جاري الإرسال..." : "إرسال البلاغ الآن"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
