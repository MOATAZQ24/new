"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, UserCheck, Users } from "lucide-react";
import { workApi, type TeamItem, type WorkloadResponse } from "@/lib/workApi";

export function TaskWorkloadView() {
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wlRes, tmRes] = await Promise.all([
        workApi.getWorkload(teamFilter || undefined),
        workApi.listTeams(),
      ]);
      setData(wlRes.data);
      setTeams(Array.isArray(tmRes.data) ? tmRes.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل بيانات أحمال العمل");
    } finally {
      setLoading(false);
    }
  }, [teamFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-[var(--muted)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-1.5 rounded-lg text-xs bg-[var(--primary)] text-white cursor-pointer"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Controls & KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--primary)]" />
          <h3 className="text-sm font-bold text-[var(--foreground)]">توزيع أحمال العمل والسعة التشغيلية</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="">كل الفرق</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Queue Totals */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
            <div className="text-xs text-[var(--muted-foreground)]">تذاكر غير معينة</div>
            <div className="text-2xl font-bold mt-1">{data.unassigned_tickets_total}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
            <div className="text-xs text-[var(--muted-foreground)]">مهام غير معينة</div>
            <div className="text-2xl font-bold mt-1">{data.unassigned_tasks_total}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
            <div className="text-xs text-[var(--muted-foreground)]">إجمالي الفنيين بالفرق</div>
            <div className="text-2xl font-bold mt-1">{data.technicians.length}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
            <div className="text-xs text-[var(--muted-foreground)]">فنيون بسعة ≥ 85%</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {data.technicians.filter((t) => t.utilization_pct >= 85).length}
            </div>
          </div>
        </div>
      )}

      {/* Teams Summary */}
      {data && data.teams.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] text-xs font-bold">ملخص قوائم الفرق</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[var(--muted)]/50 text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2.5 px-3 text-start">الفريق</th>
                  <th className="py-2.5 px-3 text-start">الاستراتيجية</th>
                  <th className="py-2.5 px-3 text-start">تذاكر مفتوحة</th>
                  <th className="py-2.5 px-3 text-start">غير معينة</th>
                  <th className="py-2.5 px-3 text-start">مهام مفتوحة</th>
                  <th className="py-2.5 px-3 text-start">متجاوزة SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.teams.map((tm) => (
                  <tr key={tm.team_id} className="hover:bg-[var(--muted)]/30">
                    <td className="py-2.5 px-3 font-semibold">{tm.name}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">{tm.default_strategy}</td>
                    <td className="py-2.5 px-3">{tm.open_tickets}</td>
                    <td className="py-2.5 px-3">{tm.unassigned_tickets}</td>
                    <td className="py-2.5 px-3">{tm.open_tasks}</td>
                    <td className="py-2.5 px-3">
                      <span className={tm.breached_tickets > 0 ? "text-red-600 font-bold" : ""}>
                        {tm.breached_tickets}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Technician Capacity Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(data?.technicians || []).length === 0 ? (
          <div className="col-span-full bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center text-xs text-[var(--muted-foreground)]">
            لم يتم إضافة أعضاء في فرق العمل بعد. يمكنك إدارة الفرق من صفحة إعدادات التوزيع و SLA.
          </div>
        ) : (
          (data?.technicians || []).map((tech) => {
            const pct = Math.min(100, Math.round(tech.utilization_pct));
            const barColor =
              tech.utilization_pct >= 90
                ? "bg-red-500"
                : tech.utilization_pct >= 70
                ? "bg-amber-500"
                : "bg-emerald-600";
            return (
              <div
                key={tech.user_id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[var(--foreground)]">{tech.full_name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)] font-mono">@{tech.username}</div>
                  </div>
                  {tech.on_leave ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                      <Clock className="w-3 h-3" />
                      في إجازة
                    </span>
                  ) : tech.is_available ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      متاح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-300">
                      <UserCheck className="w-3 h-3" />
                      غير متاح
                    </span>
                  )}
                </div>

                {/* Capacity Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--muted-foreground)]">استخدام السعة</span>
                    <span className="font-semibold">
                      {tech.total_open} / {tech.max_open_items} ({tech.utilization_pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-1.5 rounded-lg bg-[var(--muted)]/50">
                    <div className="text-[var(--muted-foreground)]">تذاكر</div>
                    <div className="font-bold text-sm">{tech.open_tickets}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[var(--muted)]/50">
                    <div className="text-[var(--muted-foreground)]">مهام</div>
                    <div className="font-bold text-sm">{tech.open_tasks}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[var(--muted)]/50">
                    <div className="text-[var(--muted-foreground)]">متأخرة</div>
                    <div className={`font-bold text-sm ${tech.overdue_count > 0 ? "text-red-600" : ""}`}>
                      {tech.overdue_count}
                    </div>
                  </div>
                </div>

                {tech.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tech.skills.map((sk) => (
                      <span key={sk} className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--muted)] text-[var(--foreground)]">
                        {sk}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)]/60">
                  <span>متوسط الحل (30 يوم):</span>
                  <span className="font-semibold text-[var(--foreground)]">
                    {tech.avg_resolution_hours_30d != null ? `${tech.avg_resolution_hours_30d} ساعة` : "—"}
                  </span>
                </div>
                {tech.sla_breached_count > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{tech.sla_breached_count} تذكرة متجاوزة لـ SLA</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
