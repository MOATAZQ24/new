"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import {
  workApi,
  type AssignmentRuleItem,
  type AssignmentStrategy,
  type DryRunResult,
  type MacroItem,
  type SlaPolicyItem,
  type TeamItem,
  type TeamMemberItem,
  type TicketCategoryItem,
  type WorkflowTransitionItem,
} from "@/lib/workApi";
import { useToast } from "@/context/ToastContext";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  GitBranch,
  MessageSquare,
  Play,
  Plus,
  Shield,
  Sliders,
  Tag,
  Trash2,
  Users,
} from "lucide-react";

type TabId = "teams" | "rules" | "sla" | "workflows" | "categories" | "macros";

interface UserOpt {
  id: string;
  username: string;
  full_name?: string;
}

export default function WorkManagementSettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("teams");
  const [users, setUsers] = useState<UserOpt[]>([]);

  // Teams & Members
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [teamName, setTeamName] = useState("");
  const [teamStrategy, setTeamStrategy] = useState<AssignmentStrategy>("least_loaded");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberSkills, setMemberSkills] = useState("");
  const [memberMaxOpen, setMemberMaxOpen] = useState(10);
  const [memberWeight, setMemberWeight] = useState(1);

  // Rules & Dry-Run
  const [ruleEntity, setRuleEntity] = useState<"ticket" | "task">("ticket");
  const [rules, setRules] = useState<AssignmentRuleItem[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleTeamId, setRuleTeamId] = useState("");
  const [ruleStrategy, setRuleStrategy] = useState<string>("");
  const [ruleCat, setRuleCat] = useState("");
  const [rulePrio, setRulePrio] = useState("");
  const [ruleKeywords, setRuleKeywords] = useState("");
  const [ruleStopOnMatch, setRuleStopOnMatch] = useState(true);
  const [dryCat, setDryCat] = useState("Network");
  const [dryPrio, setDryPrio] = useState("High");
  const [dryTitle, setDryTitle] = useState("");
  const [drySkills, setDrySkills] = useState("");
  const [dryResult, setDryResult] = useState<DryRunResult | null>(null);

  // SLA Policies
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicyItem[]>([]);
  const [slaName, setSlaName] = useState("");
  const [slaPrio, setSlaPrio] = useState("High");
  const [slaFirstResp, setSlaFirstResp] = useState(60);
  const [slaResMins, setSlaResMins] = useState(480);
  const [slaEscalate, setSlaEscalate] = useState(true);
  const [slaBump, setSlaBump] = useState(false);

  // Workflows
  const [wfEntity, setWfEntity] = useState<"ticket" | "task">("ticket");
  const [transitions, setTransitions] = useState<WorkflowTransitionItem[]>([]);
  const [wfFrom, setWfFrom] = useState("");
  const [wfTo, setWfTo] = useState("");
  const [wfReqComment, setWfReqComment] = useState(false);

  // Categories
  const [categories, setCategories] = useState<TicketCategoryItem[]>([]);
  const [catName, setCatName] = useState("");
  const [catNameAr, setCatNameAr] = useState("");
  const [catTeamId, setCatTeamId] = useState("");
  const [catSkills, setCatSkills] = useState("");

  // Macros
  const [macros, setMacros] = useState<MacroItem[]>([]);
  const [macroTitle, setMacroTitle] = useState("");
  const [macroBody, setMacroBody] = useState("");
  const [macroVis, setMacroVis] = useState<"public" | "internal">("public");

  const loadAll = useCallback(async () => {
    const [uRes, tRes, rRes, sRes, wRes, cRes, mRes] = await Promise.allSettled([
      api.get<UserOpt[]>("/users?per_page=100"),
      workApi.listTeams(true),
      workApi.listRules(),
      workApi.listSlaPolicies(true),
      workApi.listWorkflowTransitions(),
      workApi.listCategories(),
      workApi.listMacros(),
    ]);
    if (uRes.status === "fulfilled" && Array.isArray(uRes.value.data)) setUsers(uRes.value.data);
    if (tRes.status === "fulfilled" && Array.isArray(tRes.value.data)) {
      setTeams(tRes.value.data);
      if (!selectedTeamId && tRes.value.data.length > 0) setSelectedTeamId(tRes.value.data[0].id);
    }
    if (rRes.status === "fulfilled" && Array.isArray(rRes.value.data)) setRules(rRes.value.data);
    if (sRes.status === "fulfilled" && Array.isArray(sRes.value.data)) setSlaPolicies(sRes.value.data);
    if (wRes.status === "fulfilled" && Array.isArray(wRes.value.data)) setTransitions(wRes.value.data);
    if (cRes.status === "fulfilled" && Array.isArray(cRes.value.data)) setCategories(cRes.value.data);
    if (mRes.status === "fulfilled" && Array.isArray(mRes.value.data)) setMacros(mRes.value.data);
  }, [selectedTeamId]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(t);
  }, [loadAll]);

  const loadMembers = useCallback(async (tid: string) => {
    if (!tid) return setMembers([]);
    try {
      const res = await workApi.listTeamMembers(tid);
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    const t = window.setTimeout(() => void loadMembers(selectedTeamId), 0);
    return () => window.clearTimeout(t);
  }, [selectedTeamId, loadMembers]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await workApi.createTeam({
        name: teamName.trim(),
        default_strategy: teamStrategy,
        lead_user_id: teamLeadId || null,
      });
      toast.success("تم إنشاء الفريق بنجاح");
      setTeamName("");
      setSelectedTeamId(res.data.id);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء الفريق");
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || !memberUserId) return;
    try {
      await workApi.upsertTeamMember(selectedTeamId, {
        user_id: memberUserId,
        skills: memberSkills.split(",").map((s) => s.trim()).filter(Boolean),
        max_open_items: Number(memberMaxOpen) || 10,
        is_available: true,
        weight: Number(memberWeight) || 1,
      });
      toast.success("تمت إضافة/تحديث عضو الفريق");
      setMemberUserId("");
      setMemberSkills("");
      await loadMembers(selectedTeamId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ عضو الفريق");
    }
  };

  const handleToggleMemberAvail = async (m: TeamMemberItem) => {
    try {
      await workApi.updateTeamMember(m.team_id, m.id, { is_available: !m.is_available });
      await loadMembers(m.team_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر التحديث");
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTeamId) return toast.error("اختر الفريق المستهدف");
    const conditions: Record<string, unknown> = {};
    if (ruleCat.trim()) conditions.category = ruleCat.split(",").map((s) => s.trim()).filter(Boolean);
    if (rulePrio.trim()) conditions.priority = rulePrio.split(",").map((s) => s.trim()).filter(Boolean);
    if (ruleKeywords.trim()) conditions.keywords = ruleKeywords.split(",").map((s) => s.trim()).filter(Boolean);
    const sameType = rules.filter((r) => r.entity_type === ruleEntity);
    try {
      await workApi.createRule({
        entity_type: ruleEntity,
        position: sameType.length + 1,
        name: ruleName.trim(),
        conditions,
        team_id: ruleTeamId,
        strategy: ruleStrategy || null,
        stop_on_match: ruleStopOnMatch,
      });
      toast.success("تم إنشاء قاعدة التوزيع");
      setRuleName("");
      setRuleCat("");
      setRulePrio("");
      setRuleKeywords("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء القاعدة");
    }
  };

  const handleMoveRule = async (ruleId: string, dir: -1 | 1) => {
    const scoped = rules.filter((r) => r.entity_type === ruleEntity).sort((a, b) => a.position - b.position);
    const idx = scoped.findIndex((r) => r.id === ruleId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= scoped.length) return;
    const reordered = [...scoped];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, moved);
    try {
      await workApi.reorderRules(ruleEntity, reordered.map((r) => r.id));
      toast.success("تم تحديث ترتيب القواعد");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إعادة الترتيب");
    }
  };

  const handleDryRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await workApi.dryRunRules({
        entity_type: ruleEntity,
        category: dryCat || null,
        priority: dryPrio || null,
        title: dryTitle,
        required_skills: drySkills.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setDryResult(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تشغيل المحاكاة");
    }
  };

  const handleCreateSla = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workApi.createSlaPolicy({
        name: slaName.trim(),
        priority: slaPrio,
        first_response_minutes: Number(slaFirstResp),
        resolution_minutes: Number(slaResMins),
        escalate_on_breach: slaEscalate,
        bump_priority_on_breach: slaBump,
        business_hours_only: true,
      });
      toast.success("تم إنشاء سياسة SLA");
      setSlaName("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء سياسة SLA");
    }
  };

  const handleRunSlaCheck = async () => {
    try {
      const res = await workApi.runSlaEscalationNow();
      const d = res.data as Record<string, number>;
      toast.success(
        `تم فحص ${d.checked_tickets ?? 0} تذكرة: ${d.warnings_sent ?? 0} تنبيه، ${d.breaches_escalated ?? 0} تصعيد`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تشغيل فحص SLA");
    }
  };

  const handleAddTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workApi.createWorkflowTransition({
        entity_type: wfEntity,
        from_status: wfFrom.trim(),
        to_status: wfTo.trim(),
        requires_comment: wfReqComment,
      });
      toast.success("تم إضافة الانتقال");
      setWfFrom("");
      setWfTo("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الإضافة");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workApi.createCategory({
        name: catName.trim(),
        name_ar: catNameAr.trim() || null,
        default_team_id: catTeamId || null,
        required_skills: catSkills.split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast.success("تم إنشاء التصنيف");
      setCatName("");
      setCatNameAr("");
      setCatSkills("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء التصنيف");
    }
  };

  const handleCreateMacro = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workApi.createMacro({
        title: macroTitle.trim(),
        body: macroBody.trim(),
        visibility: macroVis,
        is_shared: true,
      });
      toast.success("تم حفظ الرد الجاهز");
      setMacroTitle("");
      setMacroBody("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الرد الجاهز");
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "teams", label: "الفرق والأعضاء", icon: Users },
    { id: "rules", label: "قواعد التوزيع", icon: Sliders },
    { id: "sla", label: "سياسات SLA", icon: Clock },
    { id: "workflows", label: "مصفوفة الحالات", icon: GitBranch },
    { id: "categories", label: "التصنيفات", icon: Tag },
    { id: "macros", label: "الردود الجاهزة", icon: MessageSquare },
  ];

  const scopedRules = rules.filter((r) => r.entity_type === ruleEntity).sort((a, b) => a.position - b.position);
  const scopedTransitions = transitions.filter((tr) => tr.entity_type === wfEntity);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">إعدادات إدارة العمل والتوزيع و SLA</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              إدارة الفرق والمهارات، قواعد التوزيع الآلي، سياسات SLA بساعات العمل، ومصفوفة انتقال الحالات
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--muted)]/60 border border-[var(--border)]">
            <Shield className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>معزول بالكامل على مستوى الشركة النشطة</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-2">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tb.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: TEAMS & MEMBERS */}
        {tab === "teams" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-4">
              <form onSubmit={handleCreateTeam} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-bold">إنشاء فريق جديد</h2>
                <input
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="اسم الفريق (مثال: فريق الشبكات والبنية)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={teamStrategy}
                    onChange={(e) => setTeamStrategy(e.target.value as AssignmentStrategy)}
                    className="px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  >
                    <option value="least_loaded">أقل حمل (least_loaded)</option>
                    <option value="round_robin">دوري (round_robin)</option>
                    <option value="skill_based">حسب المهارات (skill_based)</option>
                    <option value="manual">يدوي (manual)</option>
                  </select>
                  <select
                    value={teamLeadId}
                    onChange={(e) => setTeamLeadId(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  >
                    <option value="">قائد الفريق (اختياري)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة الفريق</span>
                </button>
              </form>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
                {teams.map((tm) => (
                  <div
                    key={tm.id}
                    onClick={() => setSelectedTeamId(tm.id)}
                    className={`p-3.5 cursor-pointer flex items-center justify-between gap-2 ${
                      selectedTeamId === tm.id ? "bg-[var(--primary)]/8 border-s-2 border-s-[var(--primary)]" : "hover:bg-[var(--muted)]/40"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{tm.name}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        {tm.default_strategy} • {tm.member_count} عضو {tm.lead_user_name ? `• القائد: ${tm.lead_user_name}` : ""}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${tm.is_active ? "bg-emerald-500/15 text-emerald-700" : "bg-slate-500/15 text-slate-600"}`}>
                      {tm.is_active ? "نشط" : "معطل"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              {selectedTeamId && (
                <>
                  <form onSubmit={handleAddMember} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                    <h2 className="text-sm font-bold">إضافة / تعديل عضو بالفريق المحدد</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        required
                        value={memberUserId}
                        onChange={(e) => setMemberUserId(e.target.value)}
                        className="px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                      >
                        <option value="">اختر مستخدماً...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.username}
                          </option>
                        ))}
                      </select>
                      <input
                        value={memberSkills}
                        onChange={(e) => setMemberSkills(e.target.value)}
                        placeholder="المهارات مفصولة بفاصلة (network, vpn, m365)"
                        className="px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[11px] space-y-1">
                        <span>الحد الأقصى للمفتوح</span>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={memberMaxOpen}
                          onChange={(e) => setMemberMaxOpen(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                        />
                      </label>
                      <label className="text-[11px] space-y-1">
                        <span>الوزن (Weight)</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={memberWeight}
                          onChange={(e) => setMemberWeight(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                        />
                      </label>
                      <div className="flex items-end">
                        <button type="submit" className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                          حفظ العضو
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[var(--border)] text-xs font-bold">
                      أعضاء الفريق ({members.length})
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {members.map((m) => (
                        <div key={m.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="space-y-1">
                            <div className="font-semibold">
                              {m.full_name || m.username}{" "}
                              <span className="text-[11px] text-[var(--muted-foreground)] font-normal">
                                ({m.open_count}/{m.max_open_items} • وزن {m.weight})
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {m.skills.map((sk) => (
                                <span key={sk} className="px-1.5 py-0.5 rounded bg-[var(--muted)] text-[10px]">
                                  {sk}
                                </span>
                              ))}
                              {!m.is_eligible && m.ineligible_reason && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 text-[10px]">
                                  غير مؤهل: {m.ineligible_reason}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleToggleMemberAvail(m)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                                m.is_available
                                  ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-700"
                                  : "bg-slate-500/12 border-slate-500/30 text-slate-600"
                              }`}
                            >
                              {m.is_available ? "متاح" : "غير متاح"}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await workApi.removeTeamMember(m.team_id, m.id);
                                await loadMembers(m.team_id);
                              }}
                              className="p-1.5 rounded hover:bg-red-500/10 text-red-600 cursor-pointer"
                              aria-label="إزالة العضو"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ASSIGNMENT RULES + DRY-RUN */}
        {tab === "rules" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center gap-2">
                {(["ticket", "task"] as const).map((et) => (
                  <button
                    key={et}
                    type="button"
                    onClick={() => setRuleEntity(et)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      ruleEntity === et ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] border border-[var(--border)]"
                    }`}
                  >
                    {et === "ticket" ? "قواعد التذاكر" : "قواعد المهام"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleCreateRule} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-bold">إضافة قاعدة توزيع جديدة</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="اسم القاعدة"
                    className="px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  />
                  <select
                    required
                    value={ruleTeamId}
                    onChange={(e) => setRuleTeamId(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  >
                    <option value="">اختر الفريق المستهدف...</option>
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={ruleCat}
                    onChange={(e) => setRuleCat(e.target.value)}
                    placeholder="التصنيف (Network, Server)"
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  />
                  <input
                    value={rulePrio}
                    onChange={(e) => setRulePrio(e.target.value)}
                    placeholder="الأولوية (High, Critical)"
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  />
                  <input
                    value={ruleKeywords}
                    onChange={(e) => setRuleKeywords(e.target.value)}
                    placeholder="كلمات مفتاحية (vpn, firewall)"
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <select
                      value={ruleStrategy}
                      onChange={(e) => setRuleStrategy(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
                    >
                      <option value="">استراتيجية الفريق الافتراضية</option>
                      <option value="round_robin">round_robin</option>
                      <option value="least_loaded">least_loaded</option>
                      <option value="skill_based">skill_based</option>
                      <option value="manual">manual</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={ruleStopOnMatch} onChange={(e) => setRuleStopOnMatch(e.target.checked)} />
                      <span>التوقف عند المطابقة</span>
                    </label>
                  </div>
                  <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                    حفظ القاعدة
                  </button>
                </div>
              </form>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
                {scopedRules.map((r, idx) => (
                  <div key={r.id} className="p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-[var(--muted)]">#{r.position}</span>
                        <span className="font-bold">{r.name}</span>
                        <span className="text-[11px] text-[var(--muted-foreground)]">← {r.team_name}</span>
                        {r.strategy && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]">{r.strategy}</span>}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] font-mono truncate">
                        {JSON.stringify(r.conditions)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => void handleMoveRule(r.id, -1)}
                        className="p-1.5 rounded border border-[var(--border)] disabled:opacity-30 cursor-pointer"
                        aria-label="تحريك لأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === scopedRules.length - 1}
                        onClick={() => void handleMoveRule(r.id, 1)}
                        className="p-1.5 rounded border border-[var(--border)] disabled:opacity-30 cursor-pointer"
                        aria-label="تحريك لأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await workApi.deleteRule(r.id);
                          await loadAll();
                        }}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-600 cursor-pointer"
                        aria-label="حذف القاعدة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Dry-Run Simulator */}
            <div className="lg:col-span-5 space-y-3">
              <form onSubmit={handleDryRun} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-bold flex items-center gap-1.5">
                  <Play className="w-4 h-4 text-[var(--primary)]" />
                  <span>محاكي اختبار القواعد (Dry-Run)</span>
                </h2>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  اختبر أي تذكرة افتراضية لمعرفة القاعدة المطابقة والفني الذي سيُختار دون تعديل أي بيانات.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={dryCat} onChange={(e) => setDryCat(e.target.value)} placeholder="التصنيف" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
                  <input value={dryPrio} onChange={(e) => setDryPrio(e.target.value)} placeholder="الأولوية" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
                </div>
                <input value={dryTitle} onChange={(e) => setDryTitle(e.target.value)} placeholder="عنوان افتراضي (مثال: انقطاع VPN بالفرع)" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
                <input value={drySkills} onChange={(e) => setDrySkills(e.target.value)} placeholder="مهارات مطلوبة (اختياري: network, firewall)" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
                <button type="submit" className="w-full py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                  تشغيل الاختبار الآن
                </button>

                {dryResult && (
                  <div className="mt-3 p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-2 text-xs">
                    <div>
                      <strong>القاعدة المطابقة:</strong> {dryResult.matched_rule_name || "لا يوجد (تم استخدام افتراضي التصنيف)"}
                    </div>
                    <div>
                      <strong>الفريق:</strong> {dryResult.team_name || "—"} | <strong>الاستراتيجية:</strong>{" "}
                      <span className="font-mono">{dryResult.strategy_used}</span>
                    </div>
                    <div>
                      <strong>المكلف المختار:</strong>{" "}
                      <span className="font-bold text-[var(--primary)]">
                        {dryResult.assignee_name || `غير معين (${dryResult.reason})`}
                      </span>
                    </div>
                    {dryResult.candidates.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border)] space-y-1">
                        <div className="font-semibold text-[11px]">المرشحون ({dryResult.candidates.length}):</div>
                        {dryResult.candidates.map((c) => (
                          <div key={c.user_id} className="flex items-center justify-between text-[11px]">
                            <span>{c.username} ({c.open_count}/{c.max_open_items})</span>
                            <span className={c.is_eligible ? "text-emerald-600" : "text-amber-600"}>
                              {c.is_eligible ? "مؤهل" : c.ineligible_reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: SLA POLICIES */}
        {tab === "sla" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                ساعات العمل الافتراضية: الأحد – الخميس، 08:00 – 17:00 بتوقيت الرياض (Asia/Riyadh)
              </p>
              <button
                type="button"
                onClick={() => void handleRunSlaCheck()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>تشغيل فحص وتصعيد SLA الآن</span>
              </button>
            </div>

            <form onSubmit={handleCreateSla} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
              <input required value={slaName} onChange={(e) => setSlaName(e.target.value)} placeholder="اسم السياسة" className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <select value={slaPrio} onChange={(e) => setSlaPrio(e.target.value)} className="px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]">
                <option value="Critical">Critical</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <label className="text-[11px]">
                <span>أول استجابة (دقيقة)</span>
                <input type="number" min={1} value={slaFirstResp} onChange={(e) => setSlaFirstResp(Number(e.target.value))} className="w-full mt-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              </label>
              <label className="text-[11px]">
                <span>الحل (دقيقة)</span>
                <input type="number" min={1} value={slaResMins} onChange={(e) => setSlaResMins(Number(e.target.value))} className="w-full mt-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              </label>
              <button type="submit" className="py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                إضافة السياسة
              </button>
              <div className="sm:col-span-6 flex flex-wrap gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={slaEscalate} onChange={(e) => setSlaEscalate(e.target.checked)} />
                  <span>تصعيد وإعادة إسناد لقائد الفريق عند التجاوز</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={slaBump} onChange={(e) => setSlaBump(e.target.checked)} />
                  <span>رفع الأولوية درجة تلقائياً عند التجاوز</span>
                </label>
              </div>
            </form>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-xs text-start">
                <thead className="bg-[var(--muted)]/50 text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2.5 px-3 text-start">السياسة</th>
                    <th className="py-2.5 px-3 text-start">الأولوية</th>
                    <th className="py-2.5 px-3 text-start">أول استجابة</th>
                    <th className="py-2.5 px-3 text-start">مهلة الحل</th>
                    <th className="py-2.5 px-3 text-start">التصعيد عند التجاوز</th>
                    <th className="py-2.5 px-3 text-start">ساعات العمل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {slaPolicies.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-3 font-semibold">{p.name} {p.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--primary)]/12 text-[var(--primary)]">افتراضي</span>}</td>
                      <td className="py-2.5 px-3">{p.priority}</td>
                      <td className="py-2.5 px-3">{p.first_response_minutes} د</td>
                      <td className="py-2.5 px-3">{p.resolution_minutes} د</td>
                      <td className="py-2.5 px-3">{p.escalate_on_breach ? "نعم (قائد الفريق)" : "إشعار فقط"} {p.bump_priority_on_breach ? "+ رفع الأولوية" : ""}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">{p.business_hours?.timezone || "Asia/Riyadh"} ({p.business_hours?.start || "08:00"}-{p.business_hours?.end || "17:00"})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: WORKFLOW TRANSITIONS */}
        {tab === "workflows" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(["ticket", "task"] as const).map((et) => (
                <button
                  key={et}
                  type="button"
                  onClick={() => setWfEntity(et)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    wfEntity === et ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] border border-[var(--border)]"
                  }`}
                >
                  {et === "ticket" ? "مصفوفة التذاكر" : "مصفوفة المهام"}
                </button>
              ))}
            </div>

            <form onSubmit={handleAddTransition} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap items-center gap-2">
              <input required value={wfFrom} onChange={(e) => setWfFrom(e.target.value)} placeholder="من حالة (مثال: Open)" className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <span className="text-xs">←</span>
              <input required value={wfTo} onChange={(e) => setWfTo(e.target.value)} placeholder="إلى حالة (مثال: In Progress)" className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={wfReqComment} onChange={(e) => setWfReqComment(e.target.checked)} />
                <span>يتطلب تعليقاً</span>
              </label>
              <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">
                إضافة انتقال
              </button>
            </form>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-[var(--muted)]/50 text-[var(--muted-foreground)] sticky top-0">
                  <tr>
                    <th className="py-2 px-3 text-start">من حالة</th>
                    <th className="py-2 px-3 text-start">إلى حالة</th>
                    <th className="py-2 px-3 text-start">الصلاحية</th>
                    <th className="py-2 px-3 text-start">تعليق إلزامي</th>
                    <th className="py-2 px-3 text-start">نشط</th>
                    <th className="py-2 px-3 text-end">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {scopedTransitions.map((tr) => (
                    <tr key={tr.id}>
                      <td className="py-2 px-3 font-medium">{tr.from_status}</td>
                      <td className="py-2 px-3 font-semibold text-[var(--primary)]">{tr.to_status}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{tr.required_permission || "—"}</td>
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={tr.requires_comment}
                          onChange={async () => {
                            await workApi.updateWorkflowTransition(tr.id, { requires_comment: !tr.requires_comment });
                            await loadAll();
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={tr.is_active}
                          onChange={async () => {
                            await workApi.updateWorkflowTransition(tr.id, { is_active: !tr.is_active });
                            await loadAll();
                          }}
                        />
                      </td>
                      <td className="py-2 px-3 text-end">
                        <button
                          type="button"
                          onClick={async () => {
                            await workApi.deleteWorkflowTransition(tr.id);
                            await loadAll();
                          }}
                          className="p-1 text-red-600 hover:bg-red-500/10 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CATEGORIES */}
        {tab === "categories" && (
          <div className="space-y-4">
            <form onSubmit={handleCreateCategory} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
              <input required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="الاسم (EN)" className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <input value={catNameAr} onChange={(e) => setCatNameAr(e.target.value)} placeholder="الاسم بالعربية" className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <select value={catTeamId} onChange={(e) => setCatTeamId(e.target.value)} className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]">
                <option value="">الفريق الافتراضي...</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>{tm.name}</option>
                ))}
              </select>
              <input value={catSkills} onChange={(e) => setCatSkills(e.target.value)} placeholder="مهارات (network, email)" className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <button type="submit" className="py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">إضافة تصنيف</button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categories.map((c) => (
                <div key={c.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold">{c.name_ar || c.name} <span className="font-mono text-[11px] text-[var(--muted-foreground)]">({c.name})</span></div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      الأولوية الافتراضية: {c.default_priority} {c.default_team_name ? `• الفريق: ${c.default_team_name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.required_skills.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 rounded bg-[var(--muted)] text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: MACROS */}
        {tab === "macros" && (
          <div className="space-y-4">
            <form onSubmit={handleCreateMacro} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input required value={macroTitle} onChange={(e) => setMacroTitle(e.target.value)} placeholder="عنوان الرد الجاهز" className="sm:col-span-2 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
                <select value={macroVis} onChange={(e) => setMacroVis(e.target.value as "public" | "internal")} className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]">
                  <option value="public">رد عام (Public)</option>
                  <option value="internal">ملاحظة داخلية (Internal)</option>
                </select>
              </div>
              <textarea required rows={3} value={macroBody} onChange={(e) => setMacroBody(e.target.value)} placeholder="نص الرد الجاهز..." className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]" />
              <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white cursor-pointer">حفظ الرد الجاهز</button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {macros.map((m) => (
                <div key={m.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{m.title}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${m.visibility === "internal" ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>
                        {m.visibility === "internal" ? "داخلي" : "عام"}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await workApi.deleteMacro(m.id);
                          await loadAll();
                        }}
                        className="p-1 text-red-600 hover:bg-red-500/10 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
