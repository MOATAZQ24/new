"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { StatsCard } from "@/components/ui/StatsCard";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { BranchIntelligenceFilterBar } from "@/components/ui/BranchIntelligenceFilterBar";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

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
  const { activeCompanyId, user } = useAuth();
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [companyBranches, setCompanyBranches] = useState<BranchPickOption[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [showAddModal, setShowAddModal] = useState(false);

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
      setSubscriptions(listRes.data || []);
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

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            الاشتراكات الخارجية والتراخيص (Third-Party Subscriptions)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة الاشتراكات السحابية، الاستضافة، النطاقات، البرمجيات، وحساب تكاليف التجديد
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Icons.Plus size={16} />
          <span>إضافة اشتراك جديد</span>
        </button>
      </div>

      {/* Cost Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="التكلفة الشهرية المقدرة"
          value={`${summary?.total_monthly_cost?.toLocaleString() || 0} ر.س`}
          subtitle="متوسط المصروف الشهري للاشتراكات"
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-[#187A5A]"
        />
        <StatsCard
          title="التكلفة السنوية الإجمالية"
          value={`${summary?.total_annual_cost?.toLocaleString() || 0} ر.س`}
          subtitle="الميزانية السنوية المتوقعة للخدمات"
          icon={<Icons.Subscriptions size={20} />}
          accentColor="border-[#123D32]"
        />
        <StatsCard
          title="تجديدات قادمة خلال 30 يوم"
          value={summary?.expiring_soon_count || 0}
          subtitle={`منتهية: ${summary?.expired_count || 0} • تحتاج متابعة`}
          icon={<Icons.AlertTriangle size={20} />}
          accentColor="border-amber-500"
          trend={(summary?.expiring_soon_count || 0) > 0 ? "تنبيه" : undefined}
        />
        <StatsCard
          title="الاشتراكات النشطة والمقاعد"
          value={`${summary?.active_subscriptions_count || 0} / ${summary?.total_allocated_seats || 0}`}
          subtitle="اشتراك نشط / مستخدم مخصص له مقعد"
          icon={<Icons.Check size={20} />}
          accentColor="border-emerald-600"
        />
      </div>

      {/* Canonical 5-Branch Filter Bar */}
      <BranchIntelligenceFilterBar
        selectedBranchIds={selectedBranchIds}
        onChangeBranchIds={setSelectedBranchIds}
        label="تصفية الاشتراكات حسب الفرع المعتمد"
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <EnterpriseDonutChart
          title="توزيع الاشتراكات حسب النوع"
          subtitle="تصنيف التراخيص والخدمات السحابية الحالية"
          totalLabel="اشتراك"
          items={Object.entries(summary?.by_type || {}).map(([label, value]) => ({ label, value }))}
        />
        <EnterpriseBarChart
          title="تجديدات الاشتراكات القادمة حسب الشهر"
          subtitle="جدول الاستحقاقات القادمة خلال الأشهر المقبلة"
          unit="اشتراك"
          items={Object.entries(summary?.upcoming_by_month || {}).map(([label, value]) => ({ label, value }))}
        />
      </div>

      {/* Filter Bar */}
      <DataToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="بحث باسم الخدمة أو المزود..."
        searchLabel="بحث في الاشتراكات"
        activeFilterCount={[search.trim(), statusFilter, cycleFilter].filter(Boolean).length}
        onResetFilters={() => { setSearch(""); setStatusFilter(""); setCycleFilter(""); }}
        onRefresh={() => void fetchData()}
        refreshing={loading}
        filters={
          <>
            <select
              aria-label="تصفية حسب حالة الاشتراك"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">جميع الحالات</option>
              <option value="Active">نشط (Active)</option>
              <option value="Expiring Soon">قريب الانتهاء (Expiring Soon)</option>
              <option value="Expired">منتهي (Expired)</option>
              <option value="Suspended">معلق (Suspended)</option>
            </select>

            <select
              aria-label="تصفية حسب دورة الفوترة"
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">جميع دورات الفوترة</option>
              <option value="Monthly">شهري (Monthly)</option>
              <option value="Quarterly">ربع سنوي (Quarterly)</option>
              <option value="Annual">سنوي (Annual)</option>
            </select>
          </>
        }
      />

      {/* Subscriptions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={6} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={<Icons.Subscriptions size={26} />}
            title="لا توجد اشتراكات مطابقة"
            description="يمكنك تعديل الفلاتر أو إضافة اشتراك أو ترخيص تقني جديد"
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="p-3.5">اسم الخدمة</th>
                <th className="p-3.5">المزود (Provider)</th>
                <th className="p-3.5">الفرع والنوع</th>
                <th className="p-3.5">المقاعد</th>
                <th className="p-3.5">السعر والدورة</th>
                <th className="p-3.5">تاريخ التجديد</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">المستخدمون</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((s) => {
                const daysLeft = typeof s.days_to_renewal === "number" ? s.days_to_renewal : null;
                const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
                const isOverdue = daysLeft !== null && daysLeft < 0;

                return (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">
                      <div>{s.service_name}</div>
                      <div className="text-[11px] text-slate-600 font-normal">
                        <bdi dir="ltr">{s.account_email || "-"}</bdi>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-800 font-semibold">{s.provider || "-"}</td>
                    <td className="p-3.5 text-slate-700">
                      <div className="font-semibold">{s.package_type} • {s.subscription_type}</div>
                      <div className="text-[10px] text-slate-500">{s.branch_name || "جميع الفروع"}</div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                      <bdi dir="ltr">{s.allocated_seats ?? 0} / {s.seat_limit ?? 1}</bdi>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      <bdi dir="ltr">{s.price.toLocaleString()} {s.currency}</bdi>{" "}
                      <span className="text-[11px] text-slate-600 font-normal">/ {s.billing_cycle}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono text-slate-800">
                        <bdi dir="ltr">{s.renewal_date || "-"}</bdi>
                      </div>
                      {daysLeft !== null && (
                        <div
                          className={`text-[11px] font-bold ${
                            isOverdue
                              ? "text-rose-700"
                              : isExpiring
                              ? "text-amber-700"
                              : "text-slate-600"
                          }`}
                        >
                          {isOverdue
                            ? `منتهي منذ ${Math.abs(daysLeft)} يوم`
                            : `متبقي ${daysLeft} يوم`}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-3.5 text-slate-700">
                      <button
                        type="button"
                        onClick={() => void openSeatsManager(s)}
                        className="px-2.5 py-1 rounded-lg bg-[#123D32] hover:bg-[#187A5A] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        إدارة المستخدمين
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
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
