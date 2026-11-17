"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/StatsCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

type ProfileTab =
  | "overview"
  | "performance"
  | "attendance"
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

  // Quick Modals
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState("Annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const [showObjectiveModal, setShowObjectiveModal] = useState(false);
  const [objTitle, setObjTitle] = useState("");
  const [objTarget, setObjTarget] = useState("100");
  const [objCurrent, setObjCurrent] = useState("50");

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

  const handleAttendanceAction = async (eventType: "check_in" | "check_out" | "remote") => {
    if (!employeeId) return;
    try {
      await api.post("/hrm/attendance", {
        employee_id: employeeId,
        event_type: eventType,
      });
      toast.success("تم تسجيل حركة الحضور والانصراف بنجاح");
      await loadProfile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تسجيل الحضور");
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    try {
      await api.post("/hrm/leaves", {
        employee_id: employeeId,
        leave_type: leaveType,
        start_date: leaveStart,
        end_date: leaveEnd,
        reason: leaveReason,
      });
      toast.success("تم تقديم طلب الإجازة وإرساله للاعتماد");
      setShowLeaveModal(false);
      setLeaveReason("");
      await loadProfile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تقديم طلب الإجازة");
    }
  };

  const handleCreateObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    try {
      await api.post("/hrm/objectives", {
        employee_id: employeeId,
        title: objTitle,
        target_value: Number(objTarget) || 100,
        current_value: Number(objCurrent) || 0,
      });
      toast.success("تمت إضافة الهدف الوظيفي بنجاح");
      setShowObjectiveModal(false);
      setObjTitle("");
      await loadProfile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حفظ الهدف الوظيفي");
    }
  };

  const ov = profile?.overview;
  const perf = profile?.performance;
  const att = profile?.attendance;

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "overview", label: "نظرة عامة (Overview)" },
    { id: "performance", label: "الأداء والأهداف (Performance)" },
    { id: "attendance", label: "الحضور والإجازات (Attendance)" },
    { id: "tasks", label: "المهام والمشاريع (Tasks & Projects)" },
    { id: "assets", label: "الأصول والعهد (Assets & Custody)" },
    { id: "tickets", label: "التذاكر والنشاط التقني (Tickets)" },
    { id: "documents", label: "الوثائق والسجل الوظيفي (History)" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title={ov ? `ملف الموظف الشامل 360° — ${ov.full_name}` : "ملف الموظف الشامل 360°"}
          description={
            ov
              ? `${ov.job_title || "موظف"} • الرقم الوظيفي: #${ov.employee_number} • ${ov.department_name || "بدون قسم"} • ${ov.branch_names?.length ? ov.branch_names.join(" • ") : (ov.branch_name || "المركز الرئيسي")}`
              : "جاري تحميل الهوية الموحدة للموظف..."
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
              {profile?.permissions.can_record_attendance && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleAttendanceAction("check_in")}
                    className="px-3 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-semibold cursor-pointer"
                  >
                    تسجيل حضور (Check-In)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAttendanceAction("check_out")}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    تسجيل انصراف (Check-Out)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(true)}
                    className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold cursor-pointer"
                  >
                    + طلب إجازة
                  </button>
                </>
              )}
            </div>
          }
        />

        {/* Top KPI Summary Strip */}
        {profile && perf && att && (
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
              title="سجل الحضور الفعلي (30 يوم)"
              value={`${att.summary_30d.present_days} يوم`}
              subtitle={`ساعات العمل: ${att.summary_30d.total_worked_hours} ساعة • تأخير: ${att.summary_30d.late_days}`}
              icon={<Icons.Users size={20} />}
              accentColor="border-[#C5A46D]"
            />
            <StatsCard
              title="العهد والأصول المسلمة"
              value={profile.assets_and_custody.active_custody.length}
              subtitle={`مشاريع مشارك بها: ${perf.operational_metrics.projects_contributed}`}
              icon={<Icons.Custody size={20} />}
              accentColor="border-[#123D32]"
            />
          </div>
        )}

        {/* Section Tabs */}
        <div
          role="tablist"
          aria-label="أقسام ملف الموظف 360"
          className="flex items-center gap-1.5 overflow-x-auto bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs"
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

            {/* TAB B: PERFORMANCE & OBJECTIVES */}
            {activeTab === "performance" && perf && (
              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-3">
                  <span>{perf.methodology_note}</span>
                  {profile.permissions.can_edit_employee && (
                    <button
                      type="button"
                      onClick={() => setShowObjectiveModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-[#123D32] text-white font-bold shrink-0 cursor-pointer"
                    >
                      + إضافة هدف وظيفي (OKR)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <EnterpriseBarChart
                    title="مؤشرات الإنجاز والأداء التشغيلي"
                    subtitle="نسب مئوية موثقة وفق المقام الفعلي للمهام المسندة"
                    unit="%"
                    items={[
                      { label: "معدل إتمام المهام", value: perf.operational_metrics.completion_rate_percent, color: "#187A5A" },
                      { label: "الالتزام بالمواعيد النهائية", value: perf.operational_metrics.deadline_adherence_percent, color: "#123D32" },
                    ]}
                  />

                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">الأهداف الوظيفية المعتمدة (Objectives / OKRs)</h3>
                    {perf.objectives.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">لم يتم تسجيل أهداف ربع سنوية بعد</p>
                    ) : (
                      <div className="space-y-2.5">
                        {perf.objectives.map((obj) => (
                          <div key={obj.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{obj.title}</span>
                              <span className="font-mono font-bold text-[#187A5A]">{obj.progress_percent}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-[#187A5A]" style={{ width: `${Math.min(100, obj.progress_percent)}%` }} />
                            </div>
                            <div className="text-[11px] text-slate-500 flex justify-between">
                              <span>الفترة: {obj.period_label} • الوزن: {obj.weight}%</span>
                              <span>الحالة: {obj.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {profile.permissions.can_view_confidential_hr && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">التقييمات الوظيفية الرسمية (سري — للموارد البشرية والإدارة)</h3>
                    {perf.formal_evaluations.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">لا توجد تقييمات رسمية مسجلة لهذه الفترة</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {perf.formal_evaluations.map((ev) => (
                          <div key={ev.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">فترة التقييم: {ev.period_label}</span>
                              <span className="px-2 py-0.5 rounded-full bg-[#123D32] text-white font-mono font-bold">
                                {ev.overall_score} / 5.0 ({ev.rating_band})
                              </span>
                            </div>
                            <div className="text-slate-600">
                              الجودة: {ev.quality_score} • الاعتمادية: {ev.reliability_score} • التعاون: {ev.collaboration_score}
                            </div>
                            {ev.strengths && <div className="text-slate-700">نقاط القوة: {ev.strengths}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB C: ATTENDANCE & LEAVE */}
            {activeTab === "attendance" && att && (
              <div className="space-y-5">
                <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
                  {att.policy_note}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">سجل الحضور والانصراف الفعلي</h3>
                    {att.records.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        لا توجد حركات حضور مسجلة بعد — استخدم أزرار تسجيل الحضور أعلاه لتوثيق الحركات الفعلية
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-right">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="py-2 px-2">التاريخ</th>
                              <th className="py-2 px-2">دخول</th>
                              <th className="py-2 px-2">خروج</th>
                              <th className="py-2 px-2">الحالة</th>
                              <th className="py-2 px-2">التأخير (د)</th>
                              <th className="py-2 px-2">العمل (د)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {att.records.map((r) => (
                              <tr key={r.id}>
                                <td className="py-2 px-2 font-mono">{r.attendance_date}</td>
                                <td className="py-2 px-2 font-mono">{r.check_in_at || "—"}</td>
                                <td className="py-2 px-2 font-mono">{r.check_out_at || "—"}</td>
                                <td className="py-2 px-2"><StatusBadge status={r.status} /></td>
                                <td className="py-2 px-2 font-mono">{r.late_minutes}</td>
                                <td className="py-2 px-2 font-mono">{r.worked_minutes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">طلبات الإجازات والاستئذان</h3>
                    {att.leave_requests.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">لا توجد طلبات إجازة مسجلة</p>
                    ) : (
                      <div className="space-y-2">
                        {att.leave_requests.map((lr) => (
                          <div key={lr.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
                            <div>
                              <div className="font-bold text-slate-900">{lr.leave_type} ({lr.days_count} أيام)</div>
                              <div className="font-mono text-slate-500">{lr.start_date} → {lr.end_date}</div>
                            </div>
                            <StatusBadge status={lr.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB D: TASKS & PROJECTS */}
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

        {/* Leave Request Modal */}
        <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="تقديم طلب إجازة معتمد">
          <form onSubmit={handleSubmitLeave} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">نوع الإجازة</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              >
                <option value="Annual">إجازة سنوية (Annual)</option>
                <option value="Sick">إجازة مرضية (Sick)</option>
                <option value="Emergency">إجازة اضطرارية (Emergency)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">من تاريخ</label>
                <input
                  type="date"
                  required
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  required
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">السبب / الملاحظات</label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                إرسال للاعتماد
              </button>
            </div>
          </form>
        </Modal>

        {/* Objective Modal */}
        <Modal isOpen={showObjectiveModal} onClose={() => setShowObjectiveModal(false)} title="إضافة هدف وظيفي (OKR)">
          <form onSubmit={handleCreateObjective} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">عنوان الهدف</label>
              <input
                type="text"
                required
                value={objTitle}
                onChange={(e) => setObjTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5"
                placeholder="مثال: رفع نسبة الالتزام بـ SLA التذاكر إلى 95%"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">القيمة المستهدفة</label>
                <input
                  type="number"
                  value={objTarget}
                  onChange={(e) => setObjTarget(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">الإنجاز الحالي</label>
                <input
                  type="number"
                  value={objCurrent}
                  onChange={(e) => setObjCurrent(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#123D32] text-white font-bold cursor-pointer">
                حفظ الهدف
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
