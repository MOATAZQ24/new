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
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function SubscriptionsPage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Subscription Form
  const [serviceName, setServiceName] = useState("");
  const [provider, setProvider] = useState("");
  const [subType, setSubType] = useState("SaaS");
  const [pkgType, setPkgType] = useState("Business");
  const [accountEmail, setAccountEmail] = useState("");
  const [price, setPrice] = useState("100");
  const [currency, setCurrency] = useState("SAR");
  const [billingCycle, setBillingCycle] = useState("Annual");
  const [renewalDate, setRenewalDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [autoRenewal, setAutoRenewal] = useState(true);
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/subscriptions?search=${encodeURIComponent(debouncedSearch)}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (cycleFilter) url += `&billing_cycle=${cycleFilter}`;

      const [listRes, sumRes] = await Promise.all([
        api.get(url),
        api.get("/subscriptions/summary"),
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
    fetchData();
  }, [statusFilter, cycleFilter, activeCompanyId, debouncedSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/subscriptions", {
        company_id: activeCompanyId,
        service_name: serviceName,
        provider,
        subscription_type: subType,
        package_type: pkgType,
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
      setPrice("100");
      setRenewalDate("");
      setExpiryDate("");
      setNotes("");
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "فشل إضافة الاشتراك");
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
          subtitle="تحتاج متابعة الدفع والتجديد"
          icon={<Icons.AlertTriangle size={20} />}
          accentColor="border-amber-500"
          trend={summary?.expiring_soon_count > 0 ? "تنبيه" : undefined}
        />
        <StatsCard
          title="إجمالي الاشتراكات النشطة"
          value={summary?.active_subscriptions_count || 0}
          subtitle="خدمات مستمرة قيد الاستخدام"
          icon={<Icons.Check size={20} />}
          accentColor="border-emerald-600"
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
                <th className="p-3.5">النوع والباقة</th>
                <th className="p-3.5">السعر والدورة</th>
                <th className="p-3.5">تاريخ التجديد</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">التجديد التلقائي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((s) => {
                const isExpiring = s.days_to_renewal !== null && s.days_to_renewal <= 30 && s.days_to_renewal >= 0;
                const isOverdue = s.days_to_renewal !== null && s.days_to_renewal < 0;

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
                      <span className="font-semibold">{s.package_type}</span> • {s.subscription_type}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      <bdi dir="ltr">{s.price.toLocaleString()} {s.currency}</bdi>{" "}
                      <span className="text-[11px] text-slate-600 font-normal">/ {s.billing_cycle}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono text-slate-800">
                        <bdi dir="ltr">{s.renewal_date || "-"}</bdi>
                      </div>
                      {s.days_to_renewal !== null && (
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
                            ? `منتهي منذ ${Math.abs(s.days_to_renewal)} يوم`
                            : `متبقي ${s.days_to_renewal} يوم`}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-3.5 text-slate-700">
                      {s.auto_renewal ? (
                        <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                          <Icons.Check size={13} />
                          مفعّل
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">يدوي</span>
                      )}
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
    </DashboardLayout>
  );
}
