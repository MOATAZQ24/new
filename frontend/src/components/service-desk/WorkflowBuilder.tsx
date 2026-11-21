/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  GitMerge,
  Play,
  CheckCircle2,
  Save,
  RotateCcw,
  Plus,
  ArrowRight,
  Shield,
  Layers,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  position?: { x: number; y: number };
}

interface WorkflowTransition {
  from: string;
  to: string;
  action: string;
  permission?: string;
}

interface WorkflowData {
  id?: string;
  workflow_key: string;
  name_ar: string;
  name_en?: string;
  description?: string;
  version: number;
  status: string;
  nodes_json: WorkflowNode[];
  transitions_json: WorkflowTransition[];
}

export default function WorkflowBuilder() {
  const { currentCompany } = useAuth();
  const toast = useToast();

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Simulation Mode State
  const [simulatorActive, setSimulatorActive] = useState(false);
  const [simCurrentStatus, setSimCurrentStatus] = useState<string>("Open");
  const [simHistory, setSimHistory] = useState<string[]>(["Open"]);

  const loadWorkflow = async () => {
    try {
      setLoading(true);
      const res = await api.get<WorkflowData[]>("/tickets/workflows");
      if (res.data && res.data.length > 0) {
        setWorkflow(res.data[0]);
      }
    } catch (err) {
      console.error("Failed to load workflows", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflow();
  }, [currentCompany]);

  const handleSave = async () => {
    if (!workflow) return;
    try {
      setSaving(true);
      await api.post("/tickets/workflows", {
        company_id: currentCompany?.id,
        workflow_key: workflow.workflow_key,
        name_ar: workflow.name_ar,
        description: workflow.description,
        status: "Published",
        nodes_json: workflow.nodes_json,
        transitions_json: workflow.transitions_json,
      });
      toast.success("تم حفظ ونشر مسار العمل بنجاح!");
      loadWorkflow();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ مسار العمل");
    } finally {
      setSaving(false);
    }
  };

  // Simulator helper: get possible transitions from current status
  const availableTransitions =
    workflow?.transitions_json.filter((t) => t.from === simCurrentStatus) || [];

  const handleSimulateAction = (trans: WorkflowTransition) => {
    setSimCurrentStatus(trans.to);
    setSimHistory((prev) => [...prev, trans.to]);
  };

  const handleResetSimulator = () => {
    setSimCurrentStatus("Open");
    setSimHistory(["Open"]);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground">
        جاري تحميل محرك مسارات العمل التفاعلي...
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground">
        لم يتم العثور على مسارات عمل منشورة.
      </div>
    );
  }

  return (
    <div className="space-y-4 text-right">
      {/* Workflow Builder Header */}
      <div className="bg-card border border-border/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              الإصدار v{workflow.version} ({workflow.status})
            </span>
            <h3 className="text-sm font-black text-foreground">{workflow.name_ar}</h3>
            <GitMerge className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">{workflow.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSimulatorActive(!simulatorActive)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              simulatorActive
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{simulatorActive ? "إيقاف المحاكي" : "محاكاة المسار"}</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl text-xs font-extrabold bg-primary text-primary-foreground hover:opacity-95 flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "جاري الحفظ..." : "حفظ ونشر"}</span>
          </button>
        </div>
      </div>

      {/* Simulator Control Banner if active */}
      {simulatorActive && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetSimulator}
              className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> إعادة ضبط للمرحلة الأولى
            </button>
            <span className="text-xs font-black text-amber-900 dark:text-amber-200">
              الحالة الحالية في المحاكاة: ({simCurrentStatus})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-xs font-bold text-muted-foreground ml-2">الإجراءات المتاحة:</span>
            {availableTransitions.length === 0 ? (
              <span className="text-xs text-muted-foreground font-medium">
                وصلت المحاكاة لمحطة نهائية ({simCurrentStatus})
              </span>
            ) : (
              availableTransitions.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSimulateAction(t)}
                  className="px-3 py-1 text-xs font-bold rounded-xl bg-card border border-amber-500/40 text-foreground hover:bg-amber-500 hover:text-white transition cursor-pointer shadow-2xs"
                >
                  {t.action} ➔ {t.to}
                </button>
              ))
            )}
          </div>

          {/* History sequence */}
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end flex-wrap pt-1 border-t border-amber-500/20">
            <span>تسلسل الحالات:</span>
            {simHistory.map((st, i) => (
              <span key={i} className="font-bold text-foreground">
                {st} {i < simHistory.length - 1 && "➔"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Visual Node State Canvas */}
      <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-2xs space-y-6">
        <div>
          <h4 className="text-xs font-black text-foreground mb-3 flex items-center gap-1.5 justify-end">
            <Layers className="w-4 h-4 text-primary" /> العقد والمحطات التشغيلية للمسار (Workflow States)
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {workflow.nodes_json.map((node) => {
              const isSimNode = simulatorActive && simCurrentStatus === node.label.split(" ")[0];

              return (
                <div
                  key={node.id}
                  className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col justify-between ${
                    isSimNode
                      ? "bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/30 scale-105"
                      : "bg-muted/20 border-border/70 hover:border-border"
                  }`}
                >
                  <div className="w-7 h-7 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mb-2">
                    {node.type === "start" ? (
                      "1"
                    ) : node.type === "resolved" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      "•"
                    )}
                  </div>
                  <h5 className="text-xs font-extrabold text-foreground">{node.label}</h5>
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    النوع: {node.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transitions Table */}
        <div className="pt-4 border-t border-border/60">
          <h4 className="text-xs font-black text-foreground mb-3 flex items-center gap-1.5 justify-end">
            <Settings className="w-4 h-4 text-primary" /> مصفوفة الانتقالات وقواعد التحويل (Transitions & Triggers)
          </h4>

          <div className="border border-border/70 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-right">
              <thead className="bg-muted/50 border-b border-border/60 text-muted-foreground">
                <tr>
                  <th className="p-2.5 font-bold">من الحالة (From)</th>
                  <th className="p-2.5 font-bold">الإجراء المحفز (Action)</th>
                  <th className="p-2.5 font-bold">إلى الحالة (To)</th>
                  <th className="p-2.5 font-bold">نوع التحويل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {workflow.transitions_json.map((trans, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="p-2.5 font-bold text-foreground">{trans.from}</td>
                    <td className="p-2.5 font-mono text-[11px] text-primary">{trans.action}</td>
                    <td className="p-2.5 font-bold text-foreground">{trans.to}</td>
                    <td className="p-2.5 text-muted-foreground">
                      {trans.to === "Pending Approval"
                        ? "اعتماد مشروط"
                        : trans.to === "Resolved"
                        ? "إغلاق ناجح"
                        : "مرحلي قياسي"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
