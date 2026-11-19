"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/StatsCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/Icons";
import { EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

type ProfileTab =
  | "overview"
  | "tasks"
  | "assets"
  | "tickets"
  | "documents";

interface Profile360Data {
  overview: {
    id: string;
    employee_number: string;
    full_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    employment_status: string;
    employment_type: string;
    hire_date: string | null;
    work_location: string | null;
    branch_name: string | null;
    branch_names?: string[];
    department_name: string | null;
    company_name: string | null;
    manager_name: string | null;
    has_user_account: boolean;
    username: string | null;
    is_telegram_linked: boolean;
    telegram_username: string | null;
    direct_reports: { id: string; full_name: string; job_title: string | null; employee_number: string }[];
  };
  permissions: {
    can_view_confidential_hr: boolean;
    can_edit_employee: boolean;
    can_record_attendance: boolean;
  };
  performance: {
    methodology_note: string;
    operational_metrics: {
      total_assigned_tasks: number;
      completed_tasks: number;
      active_tasks: number;
      overdue_tasks: number;
      valid_denominator: number;
      completion_rate_percent: number;
      deadline_adherence_percent: number;
      tickets_assigned_as_tech: number;
      tickets_resolved_as_tech: number;
      projects_contributed: number;
    };
    objectives: {
      id: string;
      title: string;
      period_label: string;
      target_value: number;
      current_value: number;
      progress_percent: number;
      weight: number;
      status: string;
      due_date: string | null;
    }[];
    formal_evaluations: {
      id: string;
      period_label: string;
      quality_score: number;
      reliability_score: number;
      collaboration_score: number;
      overall_score: number;
      rating_band: string;
      strengths: string | null;
      improvement_plan: string | null;
      status: string;
    }[];
  };
  attendance: {
    policy_note: string;
    month_start: string;
    summary_30d: {
      recorded_days: number;
      present_days: number;
      late_days: number;
      absent_days: number;
      on_leave_days: number;
      total_worked_hours: number;
    };
    records: {
      id: string;
      attendance_date: string;
      check_in_at: string | null;
      check_out_at: string | null;
      status: string;
      late_minutes: number;
      worked_minutes: number;
      source: string;
      notes: string | null;
    }[];
    leave_requests: {
      id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      days_count: number;
      status: string;
      reason: string | null;
    }[];
  };
  tasks_and_projects: {
    tasks: {
      id: string;
      reference: string;
      title: string;
      priority: string;
      status: string;
      due_date: string | null;
      is_overdue: boolean;
      is_voice_task?: boolean;
      voice_note_duration?: number;
    }[];
    projects: {
      id: string;
      project_code: string;
      name: string;
      status: string;
      priority: string;
      progress_percent: number;
      target_end_date: string | null;
      is_manager: boolean;
    }[];
  };
  assets_and_custody: {
    active_custody: {
      custody_id: string;
      asset_code: string;
      asset_name: string;
      asset_type: string;
      serial_number: string | null;
      assignment_date: string | null;
      condition_on_assignment: string;
      status: string;
    }[];
    custody_history: {
      custody_id: string;
      asset_code: string;
      asset_name: string;
      asset_type: string;
      assignment_date: string | null;
      actual_return_date: string | null;
      status: string;
    }[];
  };
  tickets_and_activities: {
    requested_tickets: {
      id: string;
      ticket_number: string;
      issue_title: string;
      priority: string;
      status: string;
      category: string;
    }[];
    assigned_tech_tickets: {
      id: string;
      ticket_number: string;
      issue_title: string;
      priority: string;
      status: string;
      category: string;
    }[];
  };
  documents_and_history: {
    documents: {
      id: string;
      title: string;
      document_type: string;
      reference_number: string | null;
      issue_date: string | null;
      expiry_date: string | null;
      is_confidential: boolean;
    }[];
    assignment_history: {
      id: string;
      change_type: string;
      job_title: string | null;
      department_name: string | null;
      branch_name: string | null;
      employment_status: string;
      effective_from: string | null;
      effective_to: string | null;
      notes: string | null;
    }[];
  };
}

export default function Employee360ProfilePage() {
  const params = useParams<{ id: string }>();
  const employeeId = params?.id;
  const toast = useToast();

  const [profile, setProfile] = useState<Profile360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  const loadProfile = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const res = await api.get<Profile360Data>(`/employees/${employeeId}/profile360`);
      setProfile(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل ملف الموظف 360°");
    } finally {
      setLoading(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  const ov = profile?.overview;
  const perf = profile?.performance;

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "overview", label: "نظرة عامة (Overview)" },
    { id: "tasks", label: "المهام (Tasks)" },
    { id: "assets", label: "الأصول والعهد (Assets & Custody)" },
    { id: "tickets", label: "التذاكر والنشاط التقني (Tickets)" },
    { id: "documents", label: "الوثائق والسجل الوظيفي (History)" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title={ov ? `ملف الموظف 360° — ${ov.full_name}` : "ملف الموظف 360°"}
          description={
            ov
              ? `${ov.job_title || "موظف"} • الرقم الوظيفي: #${ov.employee_number} • ${ov.department_name || "بدون قسم"} • ${ov.branch_names?.length ? ov.branch_names.join(" • ") : (ov.branch_name || "المركز الرئيسي")}`
              : "جاري تحميل بيانات الموظف..."
          }
          icon={<Icons.User size={20} />}
          badge={ov ? <StatusBadge status={ov.employment_status} /> : undefined}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/employees"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                العودة لدليل الموظفين
              </Link>
            </div>
          }
        />

        {/* Top KPI Summary Strip */}
        {profile && perf && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="نسبة إنجاز المهام المعتمدة"
              value={`${perf.operational_metrics.completion_rate_percent}%`}
              subtitle={`مكتمل: ${perf.operational_metrics.completed_tasks} من أصل ${perf.operational_metrics.valid_denominator}`}
              icon={<Icons.CheckCircle size={20} />}
              accentColor="border-[#187A5A]"
            />
            <StatsCard
              title="الالتزام بالمواعيد النهائية"
              value={`${perf.operational_metrics.deadline_adherence_percent}%`}
              subtitle={`مهام متأخرة حالياً: ${perf.operational_metrics.overdue_tasks}`}
              icon={<Icons.Clock size={20} />}
              accentColor="border-blue-600"
            />
            <StatsCard
              title="تذاكر الدعم الفني"
              value={
                profile.tickets_and_activities.requested_tickets.length +
                profile.tickets_and_activities.assigned_tech_tickets.length
              }
              subtitle={`طلبات: ${profile.tickets_and_activities.requested_tickets.length} • مسندة: ${profile.tickets_and_activities.assigned_tech_tickets.length}`}
              icon={<Icons.HelpDesk size={20} />}
              accentColor="border-[#C5A46D]"
            />
            <StatsCard
              title="العهد والأصول المسلمة"
              value={profile.assets_and_custody.active_custody.length}
              subtitle={`الأرشيف السابق: ${profile.assets_and_custody.custody_history.length}`}
              icon={<Icons.Custody size={20} />}
              accentColor="border-[#123D32]"
            />
          </div>
        )}

        {/* Section Tabs */}
        <div
          role="tablist"
          aria-label="أقسام ملف الموظف 360"
          className="flex flex-wrap items-center gap-1.5 bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === t.id
                  ? "bg-[#123D32] text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading || !profile || !ov ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            جاري تحميل البيانات المتكاملة للموظف...
          </div>
        ) : (
          <>
            {/* TAB A: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-14 h-14 rounded-2xl bg-[#123D32] text-[#C5A46D] font-black text-xl flex items-center justify-center shrink-0">
                      {ov.full_name.slice(0, 2)}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{ov.full_name}</h2>
                      <p className="text-xs text-slate-600">
                        {ov.job_title || "موظف"} • <span className="font-mono">#{ov.employee_number}</span>
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">الشركة</dt>
                      <dd className="font-bold text-slate-900 mt-0.5">{ov.company_name || "—"}</dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">الفروع المعتمدة</dt>
                      <dd className="font-bold text-slate-900 mt-0.5">
                        {ov.branch_names && ov.branch_names.length > 0
                          ? ov.branch_names.join(" • ")
                          : ov.branch_name || "المركز الرئيسي"}
                      </dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">القسم</dt>
                      <dd className="font-bold text-slate-900 mt-0.5">{ov.department_name || "غير محدد"}</dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">المدير المباشر</dt>
                      <dd className="font-bold text-slate-900 mt-0.5">{ov.manager_name || "الإدارة التنفيذية"}</dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">البريد الإلكتروني</dt>
                      <dd className="font-mono text-slate-900 mt-0.5 truncate"><bdi>{ov.email || "—"}</bdi></dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">الهاتف</dt>
                      <dd className="font-mono text-slate-900 mt-0.5"><bdi>{ov.phone || "—"}</bdi></dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">حساب النظام</dt>
                      <dd className="font-bold text-slate-900 mt-0.5">
                        {ov.has_user_account ? `مفعل (@${ov.username})` : "بدون حساب دخول"}
                      </dd>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50">
                      <dt className="text-slate-500">ربط Telegram</dt>
                      <dd className="font-bold text-emerald-700 mt-0.5">
                        {ov.is_telegram_linked ? `مرتبط (@${ov.telegram_username || "موثق"})` : "غير مرتبط"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="lg:col-span-7 space-y-5">
                  <EnterpriseDonutChart
                    title="توزيع المهام التشغيلية للموظف"
                    subtitle="مقارنة المهام المكتملة والنشطة والمتأخرة من قاعدة البيانات الموحدة"
                    totalLabel="مهمة"
                    items={[
                      { label: "مكتملة (Completed)", value: perf?.operational_metrics.completed_tasks || 0, color: "#187A5A" },
                      { label: "قيد التنفيذ (Active)", value: perf?.operational_metrics.active_tasks || 0, color: "#0284C7" },
                      { label: "متأخرة (Overdue)", value: perf?.operational_metrics.overdue_tasks || 0, color: "#E11D48" },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* TAB D: TASKS */}
            {activeTab === "tasks" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      المهام المسندة للموظف ({profile.tasks_and_projects.tasks.length})
                    </h3>
                    <Link href="/tasks" className="text-xs font-bold text-[#187A5A] hover:underline">
                      فتح لوحة المهام
                    </Link>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {profile.tasks_and_projects.tasks.map((t) => (
                      <div key={t.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-[#187A5A] me-2">{t.reference}</span>
                          <span className="font-semibold text-slate-900">{t.title}</span>
                          {t.is_voice_task && (
                            <span className="inline-flex items-center gap-1 ms-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              🎙️ مهمة صوتية {t.voice_note_duration ? `(${t.voice_note_duration} ث)` : ""}
                            </span>
                          )}
                          {t.due_date && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              الاستحقاق: <span className="font-mono">{t.due_date}</span>
                            </div>
                          )}
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    المشاريع المرتبطة ({profile.tasks_and_projects.projects.length})
                  </h3>
                  {profile.tasks_and_projects.projects.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">لا توجد مشاريع مرتبطة حالياً</p>
                  ) : (
                    <div className="space-y-2.5">
                      {profile.tasks_and_projects.projects.map((p) => (
                        <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{p.name}</span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div className="text-slate-500">كود المشروع: {p.project_code} • الإنجاز: {p.progress_percent}%</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB E: ASSETS & CUSTODY */}
            {activeTab === "assets" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  العهد التقنية النشطة ({profile.assets_and_custody.active_custody.length})
                </h3>
                {profile.assets_and_custody.active_custody.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">لا توجد عهد نشطة مسجلة على هذا الموظف</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {profile.assets_and_custody.active_custody.map((c) => (
                      <div key={c.custody_id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#187A5A]">{c.asset_code}</span>
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="font-bold text-slate-900">{c.asset_name} ({c.asset_type})</div>
                        {c.serial_number && <div className="font-mono text-slate-500">S/N: {c.serial_number}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB F: TICKETS */}
            {activeTab === "tickets" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    التذاكر المقدمة من الموظف ({profile.tickets_and_activities.requested_tickets.length})
                  </h3>
                  {profile.tickets_and_activities.requested_tickets.map((tk) => (
                    <div key={tk.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex justify-between">
                      <span><strong className="font-mono text-[#187A5A]">{tk.ticket_number}</strong>: {tk.issue_title}</span>
                      <StatusBadge status={tk.status} />
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    التذاكر المسندة كفني دعم ({profile.tickets_and_activities.assigned_tech_tickets.length})
                  </h3>
                  {profile.tickets_and_activities.assigned_tech_tickets.map((tk) => (
                    <div key={tk.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex justify-between">
                      <span><strong className="font-mono text-[#187A5A]">{tk.ticket_number}</strong>: {tk.issue_title}</span>
                      <StatusBadge status={tk.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB G: DOCUMENTS & HISTORY */}
            {activeTab === "documents" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  سجل التسكين والتنقلات الوظيفية غير القابل للتلاعب ({profile.documents_and_history.assignment_history.length})
                </h3>
                {profile.documents_and_history.assignment_history.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">لا توجد حركات تنقل مسجلة</p>
                ) : (
                  <div className="space-y-2">
                    {profile.documents_and_history.assignment_history.map((h) => (
                      <div key={h.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">
                            {h.change_type} — {h.job_title || "موظف"} ({h.department_name || "عام"} • {h.branch_name || "المركز الرئيسي"})
                          </div>
                          {h.notes && <div className="text-slate-500 mt-0.5">{h.notes}</div>}
                        </div>
                        <div className="font-mono text-slate-600">
                          {h.effective_from} → {h.effective_to || "الحالي"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </DashboardLayout>
  );
}
