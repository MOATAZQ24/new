"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api, exportReportDownload } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MobileToolbar } from "@/components/mobile/MobileToolbar";
import { MobileFilterSheet } from "@/components/mobile/MobileFilterSheet";
import { MobileSubscriptionCard } from "@/components/mobile/MobileSubscriptionCard";

interface SubscriptionItem {
  id: string;
  branch_id?: string | null;
  branch_name?: string | null;
  service_name: string;
  provider?: string;
  subscription_type: string;
  package_type?: string;
  seat_limit?: number;
  allocated_seats?: number;
  account_email?: string;
  price: number;
  currency: string;
  billing_cycle: string;
  start_date?: string | null;
  renewal_date?: string;
  days_to_renewal?: number | null;
  auto_renewal?: boolean;
  status: string;
}

interface SubscriptionSummary {
  total_subscriptions_count?: number;
  total_monthly_cost?: number;
  total_annual_cost?: number;
  expiring_soon_count?: number;
  active_subscriptions_count?: number;
  expired_count?: number;
  total_allocated_seats?: number;
  by_type?: Record<string, number>;
  upcoming_by_month?: Record<string, number>;
}

interface SubSeatEmployee {
  id: string;
  employee_id: string;
  employee_number: string;
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  allocated_at?: string | null;
  notes?: string | null;
}

interface EmpPickOption {
  id: string;
  full_name: string;
  employee_number: string;
}

interface BranchPickOption {
  id: string;
  branch_name: string;
}

export default function SubscriptionsPage() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [cycleFilter] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [companyBranches, setCompanyBranches] = useState<BranchPickOption[]>([]);
  const [inspectedSub, setInspectedSub] = useState<SubscriptionItem | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Seat Allocation Modal state
  const [activeSub, setActiveSub] = useState<SubscriptionItem | null>(null);
  const [showSeatsModal, setShowSeatsModal] = useState(false);
  const [seatEmployees, setSeatEmployees] = useState<SubSeatEmployee[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmpPickOption[]>([]);
  const [pickEmployeeId, setPickEmployeeId] = useState("");
  const [seatNotes, setSeatNotes] = useState("");
  const [seatsLoading, setSeatsLoading] = useState(false);

  // New Subscription Form
  const [serviceName, setServiceName] = useState("");
  const [provider, setProvider] = useState("");
  const [subType, setSubType] = useState("SaaS");
  const [pkgType, setPkgType] = useState("Business");
  const [subBranchId, setSubBranchId] = useState("");
  const [seatLimit, setSeatLimit] = useState("10");
  const [accountEmail, setAccountEmail] = useState("");
  const [price, setPrice] = useState("100");
  const [currency, setCurrency] = useState("SAR");
  const [billingCycle, setBillingCycle] = useState("Annual");
  const [renewalDate, setRenewalDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [autoRenewal, setAutoRenewal] = useState(true);
  const [notes, setNotes] = useState("");

  const canManage = user?.is_superadmin || user?.roles?.includes("Company Admin") || user?.roles?.includes("IT Manager");

  const fetchData = async () => {
    setLoading(true);
    try {
      const bq = selectedBranchIds.length > 0 ? `&branch_ids=${encodeURIComponent(selectedBranchIds.join(","))}` : "";
      let url = `/subscriptions?search=${encodeURIComponent(debouncedSearch)}${bq}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (cycleFilter) url += `&billing_cycle=${cycleFilter}`;

      const [listRes, sumRes] = await Promise.all([
        api.get<SubscriptionItem[]>(url),
        api.get<SubscriptionSummary>(`/subscriptions/summary?${bq.replace(/^&/, "")}`),
      ]);
      const list = listRes.data || [];
      setSubscriptions(list);
      setInspectedSub((prev) => {
        if (prev) {
          const match = list.find((s) => s.id === prev.id);
          if (match) return match;
        }
        return list[0] || null;
      });
      setSummary(sumRes.data || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل الاشتراكات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeCompanyId) return;
    api
      .get<BranchPickOption[]>(`/companies/${activeCompanyId}/branches`)
      .then((res) => setCompanyBranches(res.data || []))
      .catch(() => {});
  }, [activeCompanyId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(t);
  }, [statusFilter, cycleFilter, selectedBranchIds, activeCompanyId, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSeatsManager = async (sub: SubscriptionItem) => {
    setActiveSub(sub);
    setShowSeatsModal(true);
    setSeatsLoading(true);
    try {
      const [seatRes, empRes] = await Promise.all([
        api.get<{ employees: SubSeatEmployee[]; seat_limit: number; allocated_seats: number }>(
          `/subscriptions/${sub.id}/employees`
        ),
        api.get<EmpPickOption[]>("/employees?status=Active&per_page=100"),
      ]);
      setSeatEmployees(seatRes.data?.employees || []);
      setAllEmployees(empRes.data || []);
      if ((empRes.data || []).length > 0) {
        setPickEmployeeId(empRes.data[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل مستخدمي الاشتراك");
    } finally {
      setSeatsLoading(false);
    }
  };

  const handleAssignSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSub || !pickEmployeeId) return;
    try {
      await api.post(`/subscriptions/${activeSub.id}/employees`, {
        employee_id: pickEmployeeId,
        notes: seatNotes.trim() || undefined,
      });
      toast.success("تم تخصيص مقعد الاشتراك للموظف بنجاح");
      setSeatNotes("");
      await openSeatsManager(activeSub);
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تخصيص المقعد");
    }
  };

  const handleRevokeSeat = async (employeeId: string) => {
    if (!activeSub) return;
    try {
      await api.delete(`/subscriptions/${activeSub.id}/employees/${employeeId}`);
      toast.success("تم سحب مقعد الاشتراك");
      await openSeatsManager(activeSub);
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر سحب المقعد");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/subscriptions", {
        company_id: activeCompanyId,
        branch_id: subBranchId || undefined,
        service_name: serviceName,
        provider,
        subscription_type: subType,
        package_type: pkgType,
        seat_limit: Math.max(1, parseInt(seatLimit, 10) || 1),
        account_email: accountEmail,
        price: parseFloat(price) || 0,
        currency,
        billing_cycle: billingCycle,
        renewal_date: renewalDate || undefined,
        expiry_date: expiryDate || undefined,
        auto_renewal: autoRenewal,
        status: "Active",
        notes,
      });
      setShowAddModal(false);
      setServiceName("");
      setProvider("");
      setSubBranchId("");
      setSeatLimit("10");
      setPrice("100");
      setRenewalDate("");
      setExpiryDate("");
      setNotes("");
      toast.success("تم إضافة الاشتراك بنجاح");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة الاشتراك");
    }
  };

  const handleExportSubscriptions = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      await exportReportDownload("subscriptions", "csv", activeCompanyId, "subscriptions_report.csv");
      toast.success("تم تصدير سجل الاشتراكات بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تصدير الاشتراكات");
    } finally {
      setExportingCsv(false);
    }
  };

  const filteredSubscriptions = typeFilter
    ? subscriptions.filter((s) => (s.subscription_type || "").toLowerCase() === typeFilter.toLowerCase())
    : subscriptions;

  const alertSubscriptions = subscriptions
    .filter(
      (s) =>
        s.status === "Expired" ||
        s.status === "Expiring Soon" ||
        (typeof s.days_to_renewal === "number" && s.days_to_renewal <= 30)
    )
    .slice(0, 4);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header matching Image 10 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0 mt-0.5">
              <Icons.Subscriptions size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                الاشتراكات والتراخيص
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                إدارة جميع الاشتراكات والتراخيص، وربطها بالموظفين والفروع
              </p>
            </div>
          </div>
        </div>

        {/* Row 1: 6 Harmonized KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">
                {summary?.total_subscriptions_count ?? subscriptions.length}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">إجمالي الاشتراكات</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#123D32]/10 text-[#123D32] flex items-center justify-center shrink-0">
              <Icons.Subscriptions size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-[#187A5A]">
                {summary?.active_subscriptions_count ?? 0}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">اشتراك نشط</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
              <Icons.CheckCircle size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-slate-900">
                {summary?.total_allocated_seats ?? 0}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">مستخدم مرتبط</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#187A5A] flex items-center justify-center shrink-0">
              <Icons.Users size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-rose-700">
                {summary?.expired_count ?? 0}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">منتهية</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Icons.AlertCircle size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-black font-mono text-amber-700">
                {summary?.expiring_soon_count ?? 0}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">تقترب من الانتهاء</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Icons.Calendar size={20} />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-lg font-black font-mono text-[#123D32]">
                {(summary?.total_monthly_cost ?? 0).toLocaleString("en-US")} ر.س
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-0.5">التكلفة الشهرية</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#C5A46D]/15 text-[#8A6D3B] flex items-center justify-center shrink-0">
              <Icons.Subscriptions size={20} />
            </div>
          </div>
        </div>

        {/* Row 2: 3 Middle Cards (Top Alerts, Upcoming Renewals Bar, Type Distribution Donut) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Icons.Notifications size={17} className="text-[#123D32]" />
              <h2 className="text-sm font-bold text-slate-900">أهم التنبيهات</h2>
            </div>

            {alertSubscriptions.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                جميع الاشتراكات النشطة بحالة سليمة حالياً
              </p>
            ) : (
              <div className="space-y-2">
                {alertSubscriptions.map((al) => {
                  const days = al.days_to_renewal;
                  const urgent = al.status === "Expired" || (typeof days === "number" && days < 0);
                  return (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => setInspectedSub(al)}
                      className="w-full text-right p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-100 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            urgent ? "bg-rose-500" : "bg-amber-500"
                          }`}
                        />
                        <span className="truncate">{al.service_name}</span>
                      </span>
                      <span className={`text-[11px] font-semibold shrink-0 ${urgent ? "text-rose-700" : "text-amber-700"}`}>
                        {urgent
                          ? `منتهي منذ ${Math.abs(days || 0)} يوم`
                          : `ينتهي خلال ${days ?? 0} يوم`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <EnterpriseBarChart
            title="تجديد الاشتراكات القادمة"
            subtitle="التجديدات المستحقة خلال الأشهر المقبلة"
            unit="اشتراك"
            items={Object.entries(summary?.upcoming_by_month || {}).map(([label, value]) => ({ label, value }))}
          />

          <EnterpriseDonutChart
            title="توزيع الاشتراكات حسب النوع"
            totalLabel="اشتراك"
            items={Object.entries(summary?.by_type || {}).map(([label, value]) => ({ label, value }))}
          />
        </div>

        {/* Row 3: Split Sidebar Inspector (Right) + Inline Filter Toolbar & Subscriptions Table (Left) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Right Inspector: تفاصيل الاشتراك (Desktop Only) */}
          <aside className="hidden lg:block lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icons.Info size={16} className="text-[#123D32]" />
                <span>تفاصيل الاشتراك</span>
              </h2>
              {inspectedSub && <StatusBadge status={inspectedSub.status} />}
            </div>

            {inspectedSub ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{inspectedSub.service_name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {inspectedSub.provider || inspectedSub.subscription_type}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-[#123D32]/10 text-[#123D32] font-bold text-[11px]">
                    {inspectedSub.subscription_type}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">الشركة</span>
                    <span className="font-bold text-slate-900">{activeCompany?.name_ar || "بوابة المستثمر"}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">الفرع</span>
                    <span className="font-bold text-slate-800">{inspectedSub.branch_name || "جميع الفروع"}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">عدد المستخدمين</span>
                    <span className="font-mono font-bold text-[#187A5A]" dir="ltr">
                      {inspectedSub.allocated_seats ?? 0} / {inspectedSub.seat_limit ?? 1}
                    </span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">تاريخ البداية</span>
                    <span className="font-mono text-slate-700" dir="ltr">{inspectedSub.start_date || "—"}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">تاريخ التجديد / الانتهاء</span>
                    <span className="font-mono font-bold text-slate-900" dir="ltr">{inspectedSub.renewal_date || "—"}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">التكلفة والدورة</span>
                    <span className="font-mono font-bold text-slate-900" dir="ltr">
                      {inspectedSub.price.toLocaleString("en-US")} {inspectedSub.currency} / {inspectedSub.billing_cycle}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void openSeatsManager(inspectedSub)}
                  className="w-full py-2.5 px-3 rounded-xl border border-[#123D32] text-[#123D32] hover:bg-[#123D32] hover:text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Icons.Users size={15} />
                  <span>إدارة المستخدمين</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">
                اختر اشتراكاً من الجدول لعرض تفاصيله ومقاعد الموظفين
              </p>
            )}
          </aside>

          {/* Left Main Area: Inline Toolbar + Subscriptions Table */}
          <div className="lg:col-span-8 space-y-3 min-w-0">
            {/* Mobile Toolbar & Filter Sheet */}
            <MobileToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="بحث في الاشتراكات والمزودين..."
              activeFilterCount={(typeFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (selectedBranchIds.length > 0 ? 1 : 0)}
              onOpenFilters={() => setMobileFilterOpen(true)}
              onResetFilters={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setSelectedBranchIds([]); }}
              quickChips={[
                {
                  id: "all",
                  label: "الكل",
                  count: summary?.total_subscriptions_count,
                  active: !statusFilter && !typeFilter,
                  onClick: () => { setStatusFilter(""); setTypeFilter(""); setSelectedBranchIds([]); },
                },
                {
                  id: "active",
                  label: "نشط",
                  count: summary?.active_subscriptions_count,
                  active: statusFilter === "Active",
                  onClick: () => setStatusFilter(statusFilter === "Active" ? "" : "Active"),
                },
                {
                  id: "expiring",
                  label: "تجديد قريب",
                  count: summary?.expiring_soon_count,
                  active: statusFilter === "Expiring Soon",
                  onClick: () => setStatusFilter(statusFilter === "Expiring Soon" ? "" : "Expiring Soon"),
                },
                {
                  id: "saas",
                  label: "SaaS",
                  active: typeFilter === "SaaS",
                  onClick: () => setTypeFilter(typeFilter === "SaaS" ? "" : "SaaS"),
                },
              ]}
              actionButton={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="h-10 px-3.5 rounded-2xl bg-[#123D32] hover:bg-[#187A5A] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Icons.Plus size={15} />
                    <span>اشتراك جديد</span>
                  </button>
                ) : undefined
              }
            />

            {/* Mobile Filter Sheet */}
            <MobileFilterSheet
              isOpen={mobileFilterOpen}
              onClose={() => setMobileFilterOpen(false)}
              title="تصفية الاشتراكات والتراخيص"
              activeCount={(typeFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (selectedBranchIds.length > 0 ? 1 : 0)}
              onReset={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setSelectedBranchIds([]); }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    نوع الاشتراك
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
                  >
                    <option value="">جميع الأنواع</option>
                    <option value="SaaS">SaaS</option>
                    <option value="Hosting">Hosting</option>
                    <option value="Domain">Domain</option>
                    <option value="Security">Security</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    الفرع
                  </label>
                  <select
                    value={selectedBranchIds[0] || ""}
                    onChange={(e) => setSelectedBranchIds(e.target.value ? [e.target.value] : [])}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
                  >
                    <option value="">جميع الفروع</option>
                    {companyBranches.map((br) => (
                      <option key={br.id} value={br.id}>
                        {br.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    حالة الاشتراك
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#187A5A] text-slate-800 dark:text-slate-100"
                  >
                    <option value="">جميع الحالات</option>
                    <option value="Active">نشط</option>
                    <option value="Expiring Soon">تجديد قريب</option>
                    <option value="Expired">منتهي</option>
                    <option value="Suspended">معلق</option>
                  </select>
                </div>
              </div>
            </MobileFilterSheet>

            {/* Desktop Toolbar (Hidden on Mobile) */}
            <div className="hidden lg:flex bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Icons.Search size={14} className="text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="بحث في الاشتراكات"
                  placeholder="بحث في الاشتراكات ..."
                  className="w-full ps-8 pe-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs outline-none focus:border-[#187A5A] focus:bg-white"
                />
              </div>

              <select
                aria-label="تصفية حسب النوع"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs py-2 px-2.5 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="">كل الأنواع</option>
                <option value="SaaS">SaaS</option>
                <option value="Hosting">Hosting</option>
                <option value="Domain">Domain</option>
                <option value="Security">Security</option>
                <option value="Other">Other</option>
              </select>

              <select
                aria-label="تصفية حسب الفرع"
                value={selectedBranchIds[0] || ""}
                onChange={(e) => setSelectedBranchIds(e.target.value ? [e.target.value] : [])}
                className="bg-slate-50 border border-slate-200 text-xs py-2 px-2.5 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="">كل الفروع</option>
                {companyBranches.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.branch_name}
                  </option>
                ))}
              </select>

              <select
                aria-label="تصفية حسب حالة الاشتراك"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs py-2 px-2.5 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
              >
                <option value="">كل الحالات</option>
                <option value="Active">نشط</option>
                <option value="Expiring Soon">تجديد قريب</option>
                <option value="Expired">منتهي</option>
                <option value="Suspended">معلق</option>
              </select>

              <button
                type="button"
                onClick={() => void handleExportSubscriptions()}
                disabled={exportingCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Icons.Download size={14} />
                <span>{exportingCsv ? "جاري التصدير..." : "تصدير"}</span>
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Icons.Plus size={14} />
                  <span>إضافة اشتراك</span>
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              {loading ? (
                <TableSkeleton variant="table" rows={5} cols={8} />
              ) : filteredSubscriptions.length === 0 ? (
                <EmptyState
                  icon={<Icons.Subscriptions size={26} />}
                  title="لا توجد اشتراكات مطابقة"
                  description="يمكنك تعديل الفلاتر أو إضافة اشتراك أو ترخيص تقني جديد"
                />
              ) : (
                <>
                  {/* Mobile Subscription Cards (Purpose-built for mobile, zero clipped columns) */}
                  <div className="block lg:hidden p-3 space-y-3">
                    {filteredSubscriptions.map((s) => (
                      <MobileSubscriptionCard
                        key={s.id}
                        subscription={s}
                        onClick={() => void openSeatsManager(s)}
                      />
                    ))}
                  </div>

                  {/* Desktop Subscriptions Table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">الاشتراك / الخدمة</th>
                          <th className="p-3">النوع</th>
                          <th className="p-3">الفرع</th>
                          <th className="p-3 text-center">المستخدمون</th>
                          <th className="p-3">تاريخ الانتهاء</th>
                          <th className="p-3">الحالة</th>
                          <th className="p-3 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSubscriptions.map((s, idx) => {
                          const isSelected = inspectedSub?.id === s.id;
                          return (
                            <tr
                              key={s.id}
                              onClick={() => setInspectedSub(s)}
                              className={`hover:bg-emerald-50/40 transition-colors cursor-pointer ${
                                isSelected ? "bg-emerald-50/50" : ""
                              }`}
                            >
                              <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                              <td className="p-3 font-bold text-slate-900">
                                <div>{s.service_name}</div>
                                <div className="text-[11px] text-slate-500 font-normal">
                                  {s.provider || s.account_email || "—"}
                                </div>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 font-semibold text-[11px]">
                                  {s.subscription_type}
                                </span>
                              </td>
                              <td className="p-3 text-slate-700">{s.branch_name || "جميع الفروع"}</td>
                              <td className="p-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                                <bdi dir="ltr">{s.allocated_seats ?? 0} / {s.seat_limit ?? 1}</bdi>
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                <bdi dir="ltr">{s.renewal_date || "—"}</bdi>
                              </td>
                              <td className="p-3">
                                <StatusBadge status={s.status} />
                              </td>
                              <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setInspectedSub(s)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-[#187A5A] hover:bg-emerald-50 cursor-pointer"
                                    title="عرض التفاصيل"
                                  >
                                    <Icons.Eye size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void openSeatsManager(s)}
                                    className="px-2 py-1 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                  >
                                    المقاعد
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Subscription Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة اشتراك أو ترخيص جديد"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم الخدمة أو البرنامج *
              </label>
              <input
                type="text"
                required
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="Microsoft 365 Business"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المزود (Provider)
              </label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Microsoft / AWS / Fortinet"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الخدمة
              </label>
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="SaaS">برمجيات كخدمة (SaaS)</option>
                <option value="Cloud Hosting">استضافة سحابية (Cloud Hosting)</option>
                <option value="Domain Registration">تسجيل نطاقات (Domain Registration)</option>
                <option value="Business Email">بريد إلكتروني تجاري (Business Email)</option>
                <option value="Security">حماية وأمن سيبراني (Security)</option>
                <option value="Support Contract">عقد دعم فني (Support Contract)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الباقة (Package Type)
              </label>
              <select
                value={pkgType}
                onChange={(e) => setPkgType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Basic">Basic</option>
                <option value="Standard">Standard</option>
                <option value="Professional">Professional</option>
                <option value="Business">Business</option>
                <option value="Enterprise">Enterprise</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                السعر *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                العملة
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="SAR">SAR (ريال)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                دورة الفوترة
              </label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Monthly">شهري (Monthly)</option>
                <option value="Quarterly">ربع سنوي (Quarterly)</option>
                <option value="Semi-Annual">نصف سنوي (Semi-Annual)</option>
                <option value="Annual">سنوي (Annual)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاريخ التجديد القادم *
              </label>
              <input
                type="date"
                required
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاريخ الانتهاء الفعلي
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              البريد الإلكتروني المرتبط بالحساب
            </label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="billing@company.sa"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRenew"
              checked={autoRenewal}
              onChange={(e) => setAutoRenewal(e.target.checked)}
              className="rounded text-[#187A5A]"
            />
            <label htmlFor="autoRenew" className="text-xs text-slate-700 font-semibold cursor-pointer">
              تفعيل التجديد التلقائي (Auto-Renewal)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الفرع المعتمد (اختياري)
              </label>
              <select
                value={subBranchId}
                onChange={(e) => setSubBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="">على مستوى الشركة بالكامل</option>
                {companyBranches.map((br) => (
                  <option key={br.id} value={br.id}>{br.branch_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عدد المقاعد / التراخيص المتاحة
              </label>
              <input
                type="number"
                min={1}
                value={seatLimit}
                onChange={(e) => setSeatLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              حفظ الاشتراك
            </button>
          </div>
        </form>
      </Modal>

      {/* Seat Allocation Modal (M:N employee_subscriptions) */}
      <Modal
        isOpen={showSeatsModal}
        onClose={() => setShowSeatsModal(false)}
        title={`إدارة مستخدمي الاشتراك: ${activeSub?.service_name || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-slate-500 block text-[10px]">المزود</span>
              <strong className="text-slate-900">{activeSub?.provider || "—"}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">الفرع</span>
              <strong className="text-slate-900">{activeSub?.branch_name || "جميع الفروع"}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">المقاعد المستخدمة</span>
              <strong className="font-mono text-[#123D32]">{seatEmployees.length} / {activeSub?.seat_limit ?? 1}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">الحالة</span>
              {activeSub && <StatusBadge status={activeSub.status} />}
            </div>
          </div>

          {canManage && (
            <form onSubmit={handleAssignSeat} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-6">
                <label htmlFor="seat-emp-pick" className="block font-bold text-slate-700 mb-1">إضافة موظف للاشتراك</label>
                <select
                  id="seat-emp-pick"
                  value={pickEmployeeId}
                  onChange={(e) => setPickEmployeeId(e.target.value)}
                  disabled={seatsLoading || allEmployees.length === 0}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 disabled:bg-slate-50"
                >
                  {allEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} (#{emp.employee_number})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                <label htmlFor="seat-note-input" className="block font-bold text-slate-700 mb-1">ملاحظة</label>
                <input
                  id="seat-note-input"
                  type="text"
                  value={seatNotes}
                  onChange={(e) => setSeatNotes(e.target.value)}
                  placeholder="رخصة عمل..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={seatsLoading || !pickEmployeeId}
                  className="w-full px-3 py-2 rounded-xl bg-[#123D32] hover:bg-[#187A5A] disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {seatsLoading ? "تحميل..." : "تخصيص"}
                </button>
              </div>
            </form>
          )}

          {seatsLoading ? (
            <p className="text-center text-slate-500 py-6">جاري تحميل قائمة المستفيدين...</p>
          ) : seatEmployees.length === 0 ? (
            <p className="text-center text-slate-500 py-6">لا يوجد موظفون مخصصون لهذا الاشتراك حتى الآن</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {seatEmployees.map((row) => (
                <div key={row.id} className="p-3 flex items-center justify-between gap-2 bg-white">
                  <div>
                    <div className="font-bold text-slate-900">{row.full_name} <span className="font-mono text-[10px] text-slate-500">#{row.employee_number}</span></div>
                    <div className="text-[11px] text-slate-500">{row.job_title || "—"} {row.notes ? `• ${row.notes}` : ""}</div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void handleRevokeSeat(row.employee_id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-[11px] font-bold cursor-pointer"
                    >
                      سحب المقعد
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
}
