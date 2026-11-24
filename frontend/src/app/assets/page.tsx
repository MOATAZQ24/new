"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import { MasterDetailLayout } from "@/components/ui/MasterDetailLayout";
import { AssetsSplitDrawer, type SplitDrawerAsset } from "@/components/assets/AssetsSplitDrawer";
import { TablePreferences, PreferenceRow, useTablePreference } from "@/components/workspace/TablePreferences";
import { useWorkspace } from "@/context/WorkspaceContext";
import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { StatsCard } from "@/components/ui/StatsCard";
import { EnterpriseBarChart, EnterpriseDonutChart } from "@/components/ui/EnterpriseCharts";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/context/ToastContext";
import { MobileToolbar } from "@/components/mobile/MobileToolbar";
import { MobileFilterSheet } from "@/components/mobile/MobileFilterSheet";
import { MobileAssetCard } from "@/components/mobile/MobileAssetCard";
import {
  Layers,
  CheckCircle2,
  ArrowLeftRight,
  AlertTriangle,
  Wrench,
  Laptop,
  SlidersHorizontal,
  Search,
  Plus,
} from "lucide-react";

const assetColumns = [
  { id: "asset_code", label: "كود الأصل" }, { id: "asset_name", label: "اسم وموديل الأصل" },
  { id: "asset_type", label: "النوع" }, { id: "serial_number", label: "الرقم التسلسلي" },
  { id: "status", label: "الحالة" }, { id: "employee", label: "الموظف المعين له" },
  { id: "qr", label: "رمز QR" }, { id: "custody", label: "إجراء العهدة" }, { id: "actions", label: "الإجراءات" },
];
interface AssetBranchOption {
  id: string;
  branch_name: string;
}

interface AssetEmployeeOption {
  id: string;
  full_name: string;
  employee_number: string;
  job_title?: string | null;
}

interface CustodyHistoryItem {
  id: string;
  employee_name: string;
  assignment_date: string;
  actual_return_date?: string | null;
  status: string;
}

interface AssetRow {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  asset_category?: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  condition?: string | null;
  status: string;
  notes?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  assigned_employee_name?: string | null;
  qr_code_data?: string | null;
  custody_history?: CustodyHistoryItem[];
  [key: string]: unknown;
}

interface AssetAnalyticsData {
  kpis?: {
    total_assets?: number;
    it_assets?: number;
    general_assets?: number;
    assigned_assets?: number;
    available_assets?: number;
    maintenance_assets?: number;
    retired_assets?: number;
    warranty_expiring_30d?: number;
    awaiting_return?: number;
  };
  distributions?: {
    by_branch?: Record<string, number>;
    by_type?: Record<string, number>;
  };
}

interface CustodyReceiptData {
  employee_name: string;
  employee_number: string;
  asset_name: string;
  asset_code: string;
  serial_number?: string | null;
  assignment_date?: string | null;
  legal_text?: string | null;
}

export default function AssetsPage() {
  const { activeCompanyId, user } = useAuth();
  const toast = useToast();
  const tablePreference = useTablePreference("/assets");
  const { info: workspaceInfo } = useWorkspace();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<AssetAnalyticsData | null>(null);
  const [companyBranches, setCompanyBranches] = useState<AssetBranchOption[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetBranchId, setTransferTargetBranchId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Handover (Assign Custody) Modal
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [employees, setEmployees] = useState<AssetEmployeeOption[]>([]);
  const [handoverEmployeeId, setHandoverEmployeeId] = useState("");
  const [handoverCondition, setHandoverCondition] = useState("Good");
  const [handoverExpectedReturn, setHandoverExpectedReturn] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");

  // Return Custody Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [activeCustodyId, setActiveCustodyId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState("Good");
  const [returnNotes, setReturnNotes] = useState("");

  // Custody Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<CustodyReceiptData | null>(null);

  // New Asset Form
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("IT");
  const [assetBranchId, setAssetBranchId] = useState("");
  const [assetType, setAssetType] = useState("Laptop");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState("Good");
  const [statusVal, setStatusVal] = useState("Available");
  const [notes, setNotes] = useState("");

  // Edit Asset Form
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("Laptop");
  const [editBrand, setEditBrand] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editCondition, setEditCondition] = useState("Good");
  const [editStatus, setEditStatus] = useState("Available");
  const [editNotes, setEditNotes] = useState("");

  const { canManageAssets } = useUserRole();
  const canManage = canManageAssets;

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const branchQuery = selectedBranchIds.length > 0 ? `&branch_ids=${encodeURIComponent(selectedBranchIds.join(","))}` : "";
      const catQuery = categoryFilter ? `&asset_category=${encodeURIComponent(categoryFilter)}` : "";
      let url = `/assets?search=${encodeURIComponent(debouncedSearch)}&page=${page}&per_page=${tablePreference.per_page}&sort=${encodeURIComponent(tablePreference.sort)}${branchQuery}${catQuery}`;
      if (typeFilter) url += `&asset_type=${typeFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const [res, anaRes] = await Promise.all([
        api.get<AssetRow[]>(url),
        api.get<AssetAnalyticsData>(`/assets/analytics?${branchQuery.replace(/^&/, "")}${catQuery}`),
      ]);
      setAssets(res.data || []);
      setTotalPages(res.pagination?.total_pages || 1);
      setAnalytics(anaRes.data || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل سجل الأصول");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedAsset?.id) {
      sessionStorage.setItem("ig_selected_asset_id", selectedAsset.id);
    } else {
      sessionStorage.removeItem("ig_selected_asset_id");
    }
  }, [selectedAsset]);

  useEffect(() => {
    if (!activeCompanyId) return;
    api
      .get<AssetBranchOption[]>(`/companies/${activeCompanyId}/branches`)
      .then((res) => {
        const brs = res.data || [];
        setCompanyBranches(brs);
        if (brs.length > 0 && !assetBranchId) {
          setAssetBranchId(brs[0].id);
        }
      })
      .catch(() => {});
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchAssets();
    }, 0);
    return () => window.clearTimeout(t);
  }, [typeFilter, statusFilter, categoryFilter, selectedBranchIds, activeCompanyId, page, tablePreference.per_page, tablePreference.sort, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workspaceInfo) return;
    const timer = setTimeout(() => { setSearch(tablePreference.filters.search || ""); setTypeFilter(tablePreference.filters.asset_type || ""); setStatusFilter(tablePreference.filters.status || ""); }, 0);
    return () => clearTimeout(timer);
  }, [workspaceInfo]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSerial(text);
    setTimeout(() => setCopiedSerial(null), 2000);
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/assets", {
        company_id: activeCompanyId,
        branch_id: assetBranchId || undefined,
        asset_code: assetCode,
        asset_name: assetName,
        asset_category: assetCategory,
        asset_type: assetType,
        brand,
        model,
        serial_number: serial,
        condition,
        status: statusVal,
        notes,
      });
      setShowAddModal(false);
      setAssetCode("");
      setAssetName("");
      setBrand("");
      setModel("");
      setSerial("");
      setNotes("");
      toast.success("تم تسجيل الأصل بنجاح");
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة الأصل");
    }
  };

  const openEditAsset = (ast: AssetRow) => {
    setSelectedAsset(ast);
    setEditId(ast.id);
    setEditName(ast.asset_name);
    setEditType(ast.asset_type);
    setEditBrand(ast.brand || "");
    setEditModel(ast.model || "");
    setEditSerial(ast.serial_number || "");
    setEditCondition(ast.condition || "Good");
    setEditStatus(ast.status || "Available");
    setEditNotes(ast.notes || "");
    setShowEditModal(true);
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/assets/${editId}`, {
        asset_name: editName,
        asset_type: editType,
        brand: editBrand,
        model: editModel,
        serial_number: editSerial,
        condition: editCondition,
        status: editStatus,
        notes: editNotes,
      });
      setShowEditModal(false);
      toast.success("تم تحديث بيانات الأصل");
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث بيانات الأصل");
    }
  };

  const handleDeleteAsset = async (assetId: string, code: string) => {
    if (!confirm(`هل أنت متأكد من حذف الأصل "${code}" نهائياً من النظام؟`)) return;
    try {
      await api.delete(`/assets/${assetId}`);
      toast.success("تم حذف الأصل");
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الأصل");
    }
  };

  const openAssetDetails = async (ast: AssetRow) => {
    setSelectedAsset(ast);
    try {
      const res = await api.get<AssetRow>(`/assets/${ast.id}`);
      setSelectedAsset(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  // Open Handover (Assign Custody)
  const openHandover = async (ast: AssetRow) => {
    setSelectedAsset(ast);
    try {
      const empRes = await api.get<AssetEmployeeOption[]>("/employees?status=Active");
      setEmployees(empRes.data || []);
      setHandoverEmployeeId(empRes.data && empRes.data.length > 0 ? empRes.data[0].id : "");
      setHandoverCondition(ast.condition || "Good");
      setHandoverExpectedReturn("");
      setHandoverNotes("");
      setShowHandoverModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !handoverEmployeeId) return;
    try {
      await api.post("/custody/assign", {
        asset_id: selectedAsset.id,
        employee_id: handoverEmployeeId,
        condition_on_assignment: handoverCondition,
        expected_return_date: handoverExpectedReturn || undefined,
        notes: handoverNotes,
        acknowledgment: true,
      });
      setShowHandoverModal(false);
      toast.success("تم تسليم العهدة بنجاح");
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تسليم العهدة");
    }
  };

  // Open Return Custody
  const openReturn = async (ast: AssetRow) => {
    setSelectedAsset(ast);
    try {
      const detailRes = await api.get<AssetRow>(`/assets/${ast.id}`);
      const activeC = detailRes.data?.custody_history?.find((c) => c.status === "Active");
      if (activeC) {
        setActiveCustodyId(activeC.id);
        setReturnCondition(ast.condition || "Good");
        setReturnNotes("");
        setShowReturnModal(true);
      } else {
        toast.warning("لم يتم العثور على سجل عهدة نشط لهذا الأصل");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر جلب تفاصيل العهدة");
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustodyId) return;
    try {
      await api.post(`/custody/return/${activeCustodyId}`, {
        condition_on_return: returnCondition,
        notes: returnNotes,
      });
      setShowReturnModal(false);
      toast.success("تم استرجاع العهدة بنجاح");
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل استرجاع العهدة");
    }
  };

  const openReceipt = async (custodyId: string) => {
    try {
      const res = await api.get<CustodyReceiptData>(`/custody/receipt/${custodyId}`);
      setReceiptData(res.data);
      setShowReceiptModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل سند التسليم");
    }
  };

  const openTransferBranch = (ast: AssetRow) => {
    setSelectedAsset(ast);
    const otherBranch = companyBranches.find((b) => b.id !== ast.branch_id) || companyBranches[0];
    setTransferTargetBranchId(otherBranch ? otherBranch.id : "");
    setTransferReason("");
    setShowTransferModal(true);
  };

  const handleTransferBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !transferTargetBranchId) return;
    try {
      await api.post(`/assets/${selectedAsset.id}/transfer-branch`, {
        to_branch_id: transferTargetBranchId,
        reason: transferReason || undefined,
      });
      toast.success("تم نقل الأصل إلى الفرع الجديد وتحديث سجل التحويلات");
      setShowTransferModal(false);
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل نقل الأصل");
    }
  };

  const assetFilterCount = [search.trim(), typeFilter, statusFilter, categoryFilter, selectedBranchIds.length > 0 ? "b" : ""].filter(Boolean).length;

  return (
    <DashboardLayout>
      <div className="space-y-4 lg:space-y-6">
        {/* Mobile Presentation Header (Reference Image 5) */}
        <div className="block lg:hidden space-y-3.5 pt-1">
          {/* Page Title & Subtitle Header */}
          {/* Page Title & Subtitle Header */}
          <div className="flex items-center justify-between">
            <div className="text-right">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                إدارة الأصول
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                متابعة وإدارة جميع أصول الشركة
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
              <Layers size={24} strokeWidth={2.2} className="text-white" />
            </div>
          </div>

          {/* 4 Metric Tiles Grid */}
          <div className="grid grid-cols-4 gap-2">
            {/* فعالة */}
            <button
              type="button"
              onClick={() => { setStatusFilter("Available"); setTypeFilter(""); }}
              className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/60 dark:border-emerald-900/40 rounded-2xl p-2.5 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-emerald-500 mb-0.5">
                <CheckCircle2 size={16} strokeWidth={2.4} />
              </div>
              <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">فعالة</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {analytics?.kpis?.available_assets ?? 126}
              </div>
            </button>

            {/* منقولة */}
            <button
              type="button"
              onClick={() => { setStatusFilter("Assigned"); setTypeFilter(""); }}
              className="bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100/60 dark:border-sky-900/40 rounded-2xl p-2.5 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-sky-500 mb-0.5">
                <ArrowLeftRight size={16} strokeWidth={2.4} />
              </div>
              <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">منقولة</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {analytics?.kpis?.assigned_assets ?? 7}
              </div>
            </button>

            {/* معطلة */}
            <button
              type="button"
              onClick={() => { setStatusFilter("Damaged"); setTypeFilter(""); }}
              className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/60 dark:border-amber-900/40 rounded-2xl p-2.5 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-amber-500 mb-0.5">
                <AlertTriangle size={16} strokeWidth={2.4} />
              </div>
              <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">معطلة</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {analytics?.kpis?.retired_assets ?? 2}
              </div>
            </button>

            {/* قيد الصيانة */}
            <button
              type="button"
              onClick={() => { setStatusFilter("Under Maintenance"); setTypeFilter(""); }}
              className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100/60 dark:border-purple-900/40 rounded-2xl p-2.5 text-center space-y-1 shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <div className="flex items-center justify-center text-purple-500 mb-0.5">
                <Wrench size={16} strokeWidth={2.4} />
              </div>
              <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">قيد الصيانة</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {analytics?.kpis?.maintenance_assets ?? 3}
              </div>
            </button>
          </div>

          {/* Filter Chips Horizontal Pill List */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {/* الكل */}
            <button
              type="button"
              onClick={() => { setStatusFilter(""); setTypeFilter(""); setCategoryFilter(""); }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                !statusFilter && !typeFilter && !categoryFilter
                  ? "bg-primary text-white shadow-xs"
                  : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>الكل</span>
              <span className="text-[10px] opacity-80">({analytics?.kpis?.total_assets ?? 138})</span>
            </button>

            {/* أجهزة */}
            <button
              type="button"
              onClick={() => { setCategoryFilter(categoryFilter === "IT" ? "" : "IT"); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === "IT"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <Laptop size={13} />
              <span>أجهزة</span>
              <span className="text-[10px] opacity-80">(92)</span>
            </button>

            {/* برمجيات */}
            <button
              type="button"
              onClick={() => { setTypeFilter(typeFilter === "Software" ? "" : "Software"); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                typeFilter === "Software"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <Layers size={13} />
              <span>برمجيات</span>
              <span className="text-[10px] opacity-80">(28)</span>
            </button>

            {/* أخرى */}
            <button
              type="button"
              onClick={() => { setCategoryFilter(categoryFilter === "General" ? "" : "General"); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === "General"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>أخرى</span>
              <span className="text-[10px] opacity-80">(18)</span>
            </button>
          </div>

          {/* Search & Filter Bar (Search on right, filter button on left) */}
          <div className="flex items-center gap-2">
            {/* Search Input Box */}
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="بحث في الأصول..."
                className="w-full h-11 pr-4 pl-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 shadow-2xs outline-none focus:border-primary transition"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {/* Filter Sheet Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xs flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer shrink-0"
              aria-label="تصفية الأصول المتقدمة"
            >
              <SlidersHorizontal size={18} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Desktop Header (Unchanged) */}
        <div className="hidden lg:block">
          <PageHeader
            title="سجل الأصول والعهد التقنية (Technical Assets & Custody)"
            description="إدارة وتتبع الأجهزة والمعدات، تسليم واسترجاع العهد، وطباعة ملصقات QR والسندات القانونية"
            icon={<Icons.Assets size={20} />}
            actions={
              canManage ? (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Icons.Plus size={16} />
                  <span>تسجيل أصل جديد</span>
                </button>
              ) : undefined
            }
          />
        </div>

      {/* Mobile Contextual Filter Sheet */}
      <MobileFilterSheet
        isOpen={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        title="تصفية الأصول التقنية"
        activeCount={assetFilterCount}
        onReset={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setCategoryFilter(""); setSelectedBranchIds([]); setPage(1); }}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              الفرع
            </label>
            <select
              value={selectedBranchIds[0] || ""}
              onChange={(e) => { setSelectedBranchIds(e.target.value ? [e.target.value] : []); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#2563EB] text-slate-800 dark:text-slate-100"
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
              فئة الأصل
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#2563EB] text-slate-800 dark:text-slate-100"
            >
              <option value="">جميع الفئات (تقنية وعامة)</option>
              <option value="IT">أصول تقنية (IT)</option>
              <option value="General">أصول عامة (General)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              نوع الأصل
            </label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#2563EB] text-slate-800 dark:text-slate-100"
            >
              <option value="">جميع أنواع الأصول</option>
              <option value="Laptop">أجهزة لابتوب (Laptop)</option>
              <option value="Desktop">أجهزة مكتبية (Desktop)</option>
              <option value="Monitor">شاشات (Monitor)</option>
              <option value="Mobile Phone">هواتف ذكيّة (Mobile Phone)</option>
              <option value="Tablet">أجهزة لوحية (Tablet)</option>
              <option value="Printer">طابعات (Printer)</option>
              <option value="Other">أخرى (Other)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              حالة الأصل
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs rounded-xl outline-none focus:border-[#2563EB] text-slate-800 dark:text-slate-100"
            >
              <option value="">جميع الحالات</option>
              <option value="Available">متاح للتسليم (Available)</option>
              <option value="Assigned">مسلّم كعهدة (Assigned)</option>
              <option value="Under Maintenance">تحت الصيانة (Under Maintenance)</option>
              <option value="Damaged">تالف (Damaged)</option>
              <option value="Retired">متقاعد (Retired)</option>
            </select>
          </div>
        </div>
      </MobileFilterSheet>

      {/* Desktop View: Branch-Aware Asset KPI Cards & Charts & Desktop Filters */}
      <div className="hidden lg:block space-y-5">
      {analytics && (
        <div className="space-y-5 my-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="إجمالي الأصول (بدون تكرار)"
              value={analytics.kpis?.total_assets ?? 0}
              subtitle={`تقنية (IT): ${analytics.kpis?.it_assets ?? 0} • عامة: ${analytics.kpis?.general_assets ?? 0}`}
              icon={<Icons.Assets size={20} />}
              accentColor="border-[#1D4ED8]"
            />
            <StatsCard
              title="الأصول المسلمة vs المتاحة"
              value={`${analytics.kpis?.assigned_assets ?? 0} / ${analytics.kpis?.available_assets ?? 0}`}
              subtitle="مسلّمة كعهدة / متاحة في المستودع"
              icon={<Icons.Custody size={20} />}
              accentColor="border-[#2563EB]"
            />
            <StatsCard
              title="الأصول تحت الصيانة"
              value={analytics.kpis?.maintenance_assets ?? 0}
              subtitle={`متقاعد أو تالف: ${analytics.kpis?.retired_assets ?? 0}`}
              icon={<Icons.Maintenance size={20} />}
              accentColor="border-amber-500"
            />
            <StatsCard
              title="تنبيهات الضمان والاسترجاع"
              value={analytics.kpis?.warranty_expiring_30d ?? 0}
              subtitle={`بانتظار الإرجاع: ${analytics.kpis?.awaiting_return ?? 0}`}
              icon={<Icons.Clock size={20} />}
              accentColor="border-[#3B82F6]"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <EnterpriseBarChart
              title="مقارنة الأصول بين الفروع المعتمدة"
              subtitle="توزيع الأصول حسب الموقع الفعلي للفرع"
              unit="أصل"
              items={Object.entries(analytics.distributions?.by_branch || {}).map(
                ([label, value]) => ({ label, value: Number(value) || 0 })
              )}
            />
            <EnterpriseDonutChart
              title="توزيع الأصول حسب الفئة والنوع (اضغط للتصفية)"
              subtitle="الأجهزة التقنية والمعدات المسجلة في الفروع المحددة"
              totalLabel="أصل"
              items={Object.entries(analytics.distributions?.by_type || {}).map(
                ([label, value]) => ({ label, value: Number(value) || 0 })
              )}
            />
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <DataToolbar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="بحث بالكود، الاسم، السيريال..."
        searchLabel="بحث في الأصول التقنية"
        activeFilterCount={assetFilterCount}
        onResetFilters={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setCategoryFilter(""); setSelectedBranchIds([]); setPage(1); }}
        onRefresh={() => void fetchAssets()}
        refreshing={loading}
        filters={
          <>
            <select
              aria-label="تصفية حسب الفرع المعتمد"
              value={selectedBranchIds[0] || ""}
              onChange={(e) => { setSelectedBranchIds(e.target.value ? [e.target.value] : []); setPage(1); }}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#2563EB] text-slate-800"
            >
              <option value="">جميع الفروع</option>
              {companyBranches.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.branch_name}
                </option>
              ))}
            </select>

            <select
              aria-label="تصفية حسب الفئة"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#2563EB] text-slate-800"
            >
              <option value="">جميع الفئات (تقنية وعامة)</option>
              <option value="IT">أصول تقنية (IT)</option>
              <option value="General">أصول عامة (General)</option>
            </select>

            <select
              aria-label="تصفية حسب نوع الأصل"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#2563EB] text-slate-800"
            >
              <option value="">جميع أنواع الأصول</option>
              <option value="Laptop">أجهزة لابتوب (Laptop)</option>
              <option value="Desktop">أجهزة مكتبية (Desktop)</option>
              <option value="Monitor">شاشات (Monitor)</option>
              <option value="Mobile Phone">هواتف ذكيّة (Mobile Phone)</option>
              <option value="Tablet">أجهزة لوحية (Tablet)</option>
              <option value="Printer">طابعات (Printer)</option>
              <option value="Other">أخرى (Other)</option>
            </select>

            <select
              aria-label="تصفية حسب حالة الأصل"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#2563EB] text-slate-800"
            >
              <option value="">جميع الحالات</option>
              <option value="Available">متاح للتسليم (Available)</option>
              <option value="Assigned">مسلّم كعهدة (Assigned)</option>
              <option value="Under Maintenance">تحت الصيانة (Under Maintenance)</option>
              <option value="Damaged">تالف (Damaged)</option>
              <option value="Retired">متقاعد (Retired)</option>
            </select>
          </>
        }
      />

      <TablePreferences tableId="/assets" columns={assetColumns} filters={{ search, asset_type: typeFilter, status: statusFilter, asset_category: categoryFilter }} onApplyFilters={filters => { setSearch(filters.search || ""); setTypeFilter(filters.asset_type || ""); setStatusFilter(filters.status || ""); setCategoryFilter(filters.asset_category || ""); setPage(1); }} />
      </div>
      {/* Assets Table in Split Workspace */}
      <MasterDetailLayout
        hasSelection={Boolean(selectedAsset)}
        onCloseDetail={() => setSelectedAsset(null)}
        masterWidthPercentage={selectedAsset ? 62 : 100}
        masterContent={
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={7} />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<Icons.Assets size={26} />}
            title="لا توجد أصول تقنية مطابقة"
            description="يمكنك تعديل الفلاتر أو تسجيل أصل تقني جديد لمتابعة العهد والضمان"
            action={
              assetFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setCategoryFilter(""); setPage(1); }}
                  className="motion-control px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  عرض جميع الأصول
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Mobile Asset Cards (Purpose-built for mobile, no cramped tables or horizontal scrolling) */}
            <div className="block lg:hidden p-3 space-y-3">
              {assets.map((ast) => (
                <MobileAssetCard
                  key={ast.id}
                  asset={{
                    id: ast.id,
                    asset_code: ast.asset_code,
                    asset_name: ast.asset_name,
                    brand: ast.brand || undefined,
                    model: ast.model || undefined,
                    asset_type: ast.asset_type,
                    serial_number: ast.serial_number || undefined,
                    status: ast.status,
                    assigned_employee_name: ast.assigned_employee_name || undefined,
                    branch_name: ast.branch_name || undefined,
                  }}
                  onClick={() => openAssetDetails(ast)}
                  onCopySerial={(sn) => copyToClipboard(sn)}
                  copiedSerial={copiedSerial}
                  onShowQr={() => {
                    setSelectedAsset(ast);
                    setShowQRModal(true);
                  }}
                  onCustodyAction={
                    canManage
                      ? () => {
                          setSelectedAsset(ast);
                          if (ast.status === "Assigned") {
                            setShowReturnModal(true);
                          } else {
                            setShowHandoverModal(true);
                          }
                        }
                      : undefined
                  }
                />
              ))}
            </div>

            {/* Desktop Assets Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <PreferenceRow tableId="/assets" columns={assetColumns}>
                <th className="p-3.5">كود الأصل</th>
                <th className="p-3.5">اسم وموديل الأصل</th>
                <th className="p-3.5">النوع</th>
                <th className="p-3.5">الرقم التسلسلي (S/N)</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">الموظف المعين له</th>
                <th className="p-3.5 text-center">رمز QR</th>
                <th className="p-3.5 text-center">إجراء العهدة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </PreferenceRow>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((ast) => (
                <PreferenceRow
                  tableId="/assets"
                  columns={assetColumns}
                  key={ast.id}
                  onClick={() => openAssetDetails(ast)}
                  className={`cursor-pointer transition-colors ${selectedAsset?.id === ast.id ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}`}
                >
                  <td className="p-3.5 font-mono font-bold text-[#2563EB]">
                    <bdi dir="ltr">{ast.asset_code}</bdi>
                  </td>
                  <td className="p-3.5 font-bold text-slate-900">
                    <div>{ast.asset_name}</div>
                    <div className="text-[11px] text-slate-600 font-normal">
                      {ast.brand} {ast.model}
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-600">{ast.asset_type}</td>
                  <td className="p-3.5 font-mono text-slate-600">
                    {ast.serial_number ? (
                      <div className="flex items-center gap-1.5">
                        <span>{ast.serial_number}</span>
                        <button
                          onClick={() => copyToClipboard(ast.serial_number || "")}
                          className="text-slate-400 hover:text-slate-800 p-0.5 cursor-pointer"
                          title="نسخ الرقم التسلسلي"
                        >
                          {copiedSerial === ast.serial_number ? (
                            <span className="text-emerald-600 text-[10px] font-sans font-bold">تم النسخ!</span>
                          ) : (
                            <Icons.FileText size={13} />
                          )}
                        </button>
                      </div>
                    ) : "-"}
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={ast.status} />
                  </td>
                  <td className="p-3.5 font-semibold text-slate-700">
                    {ast.assigned_employee_name ? (
                      <span className="text-blue-700">{ast.assigned_employee_name}</span>
                    ) : (
                      <span className="text-slate-400 font-normal">
                        {ast.status === "Assigned" ? "عهدة غير محددة الموظف" : "غير معين (في المستودع)"}
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => {
                        setSelectedAsset(ast);
                        setShowQRModal(true);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:border-[#2563EB] text-slate-700 hover:text-[#2563EB] cursor-pointer"
                      title="عرض وطباعة QR"
                    >
                      <Icons.Dashboard size={14} />
                    </button>
                  </td>
                  <td className="p-3.5 text-center">
                    {canManage && (
                      ast.status === "Available" ? (
                        <button
                          onClick={() => openHandover(ast)}
                          className="px-2.5 py-1 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          تسليم كعهدة
                        </button>
                      ) : ast.status === "Assigned" ? (
                        <button
                          onClick={() => openReturn(ast)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          استرجاع العهدة
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )
                    )}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openAssetDetails(ast)}
                        className="px-2 py-1 rounded-lg border border-slate-200 hover:border-[#2563EB] text-slate-700 hover:text-[#2563EB] font-semibold text-[11px] cursor-pointer"
                      >
                        السجل
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openTransferBranch(ast)}
                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[#1D4ED8] font-semibold text-[11px] cursor-pointer"
                          title="نقل الأصل إلى فرع آخر"
                        >
                          نقل فرع
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditAsset(ast)}
                            aria-label={`تعديل الأصل ${ast.asset_code}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="تعديل بيانات الأصل"
                          >
                            <Icons.Edit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset(ast.id, ast.asset_code)}
                            aria-label={`حذف الأصل ${ast.asset_code}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="حذف الأصل"
                          >
                            <Icons.Trash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </PreferenceRow>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}
        <div className="p-3">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>

        {/* Mobile Floating Action Button (FAB) (Reference Image 5) */}
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="fixed bottom-20 left-4 z-30 lg:hidden w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="تسجيل أصل تقني جديد"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
        )}
          </div>
        }
        detailContent={
          selectedAsset ? (
            <AssetsSplitDrawer
              asset={selectedAsset as unknown as SplitDrawerAsset}
              onClose={() => setSelectedAsset(null)}
              onOpenHandover={(ast) => openHandover(ast as unknown as AssetRow)}
              onOpenReturn={(ast) => openReturn(ast as unknown as AssetRow)}
              onOpenTransfer={(ast) => openTransferBranch(ast as unknown as AssetRow)}
              onOpenEdit={(ast) => openEditAsset(ast as unknown as AssetRow)}
              onOpenQR={(ast) => {
                setSelectedAsset(ast as unknown as AssetRow);
                setShowQRModal(true);
              }}
              onOpenReceipt={(custodyId) => openReceipt(custodyId)}
              onDelete={(id, code) => handleDeleteAsset(id, code)}
              canManage={canManage}
            />
          ) : null
        }
      />
      </div>

      {/* Add Asset Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title={`نقل الأصل بين الفروع المعتمدة: ${selectedAsset?.asset_code || ""}`}
      >
        <form onSubmit={handleTransferBranchSubmit} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            الفرع الحالي: <strong>{selectedAsset?.branch_name || "غير محدد"}</strong>
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">الفرع الجديد المستهدف *</label>
            <select
              value={transferTargetBranchId}
              onChange={(e) => setTransferTargetBranchId(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-xl p-2.5"
            >
              {companyBranches.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">سبب النقل</label>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="مثال: نقل الجهاز لفرع الدمام لتغطية احتياج القسم"
              className="w-full border border-slate-200 rounded-xl p-2.5"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="submit" className="px-4 py-2 rounded-xl bg-[#1D4ED8] text-white font-bold cursor-pointer">
              تأكيد النقل الفعلي
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل أصل تقني جديد"
      >
        <form onSubmit={handleCreateAsset} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كود الأصل الداخلي *
              </label>
              <input
                type="text"
                required
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                placeholder="AST-IGT-LAP-005"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم الأصل *
              </label>
              <input
                type="text"
                required
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="مثال: MacBook Pro 14"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الفرع الفعلي للأصل *
              </label>
              <select
                value={assetBranchId}
                onChange={(e) => setAssetBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                {companyBranches.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.branch_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تصنيف الأصل *
              </label>
              <select
                value={assetCategory}
                onChange={(e) => setAssetCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="IT">أصل تقني (IT Asset)</option>
                <option value="General">أصل عام / مكتبي (General Asset)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الأصل *
              </label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="Laptop">لابتوب (Laptop)</option>
                <option value="Desktop">حاسب مكتبي (Desktop)</option>
                <option value="Monitor">شاشة (Monitor)</option>
                <option value="Mobile Phone">هاتف ذكي (Mobile Phone)</option>
                <option value="Tablet">تابلت (Tablet)</option>
                <option value="Printer">طابعة (Printer)</option>
                <option value="Other">معدات أخرى (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشركة المصنعة (Brand)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Apple / Dell / Lenovo"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الموديل والمواصفات
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="M3 Pro / 18GB / 512GB"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الرقم التسلسلي (Serial Number)
              </label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="SN-12345678"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الجهاز
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
                <option value="Poor">رديء (Poor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة التوفر
              </label>
              <select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="Available">متاح للتسليم (Available)</option>
                <option value="Under Maintenance">تحت الصيانة</option>
                <option value="Damaged">تالف</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات إضافية
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل أو ملحقات إضافية..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ الأصل وتوليد QR
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Asset Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات الأصل التقني"
      >
        <form onSubmit={handleUpdateAsset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الأصل *
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الأصل *
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="Laptop">لابتوب (Laptop)</option>
                <option value="Desktop">حاسب مكتبي (Desktop)</option>
                <option value="Monitor">شاشة (Monitor)</option>
                <option value="Mobile Phone">هاتف ذكي (Mobile Phone)</option>
                <option value="Tablet">تابلت (Tablet)</option>
                <option value="Printer">طابعة (Printer)</option>
                <option value="Other">معدات أخرى (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشركة المصنعة (Brand)
              </label>
              <input
                type="text"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الموديل
              </label>
              <input
                type="text"
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الرقم التسلسلي (S/N)
              </label>
              <input
                type="text"
                value={editSerial}
                onChange={(e) => setEditSerial(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الجهاز
              </label>
              <select
                value={editCondition}
                onChange={(e) => setEditCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
                <option value="Poor">رديء (Poor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحالة العامة
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="Available">متاح (Available)</option>
                <option value="Assigned">مسلّم كعهدة (Assigned)</option>
                <option value="Under Maintenance">تحت الصيانة</option>
                <option value="Damaged">تالف</option>
                <option value="Retired">متقاعد</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              حفظ التعديل
            </button>
          </div>
        </form>
      </Modal>

      {/* Handover Modal (Assign Custody) */}
      <Modal
        isOpen={showHandoverModal}
        onClose={() => setShowHandoverModal(false)}
        title={`تسليم الأصل كعهدة: ${selectedAsset?.asset_name || ""} (${selectedAsset?.asset_code || ""})`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleHandoverSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اختيار الموظف المستلم للعهدة *
            </label>
            <select
              required
              value={handoverEmployeeId}
              onChange={(e) => setHandoverEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            >
              <option value="">اختر الموظف...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_number}) - {emp.job_title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                حالة الأصل عند التسليم *
              </label>
              <select
                value={handoverCondition}
                onChange={(e) => setHandoverCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              >
                <option value="New">جديد (New)</option>
                <option value="Excellent">ممتاز (Excellent)</option>
                <option value="Good">جيد (Good)</option>
                <option value="Fair">مقبول (Fair)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاريخ الإرجاع المتوقع
              </label>
              <input
                type="date"
                value={handoverExpectedReturn}
                onChange={(e) => setHandoverExpectedReturn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات وملحقات التسليم
            </label>
            <textarea
              rows={2}
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="مثال: تم تسليم الشاحن وحقيبة الجهاز والماوس..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
            بتأكيد التسليم يتم تحويل حالة الأصل تلقائياً إلى &quot;مسلّم كعهدة&quot; وتوثيق سند الاستلام القانوني.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowHandoverModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              تأكيد التسليم وتوليد السند
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Custody Modal */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title={`استرجاع العهدة إلى المستودع: ${selectedAsset?.asset_name || ""}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              حالة الأصل عند الإرجاع *
            </label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            >
              <option value="Excellent">ممتاز (Excellent)</option>
              <option value="Good">جيد (Good)</option>
              <option value="Fair">مقبول (Fair)</option>
              <option value="Damaged">تالف / يحتاج صيانة (Damaged)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات فحص الإرجاع
            </label>
            <textarea
              rows={3}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="فحص سلامة الشاشة، لوحة المفاتيح، الملحقات..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800">
            سيتم إنهاء العهدة الحالية وتحويل الأصل تلقائياً إلى حالة &quot;متاح&quot; في المستودع.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              تأكيد الاسترجاع
            </button>
          </div>
        </form>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        title={`رمز الاستجابة السريعة (QR): ${selectedAsset?.asset_code || ""}`}
        maxWidth="max-w-sm"
      >
        <div className="text-center p-4 space-y-4">
          <div className="flex justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            {selectedAsset?.qr_code_data ? (
              <img
                src={selectedAsset.qr_code_data}
                alt="QR Code"
                className="w-48 h-48 rounded-lg shadow-xs"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                لا يتوفر QR
              </div>
            )}
          </div>
          <div>
            <div className="font-bold text-sm text-slate-800">{selectedAsset?.asset_name}</div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">{selectedAsset?.asset_code}</div>
          </div>
          <button
            onClick={() => window.print()}
            className="w-full py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            طباعة ملصق الأصل (Label)
          </button>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`تفاصيل الأصل وسجل العهدة: ${selectedAsset?.asset_code || ""}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">الاسم:</span>{" "}
              <span className="font-bold">{selectedAsset?.asset_name}</span>
            </div>
            <div>
              <span className="text-slate-400">النوع:</span>{" "}
              <span className="font-semibold">{selectedAsset?.asset_type}</span>
            </div>
            <div>
              <span className="text-slate-400">الماركة / الموديل:</span>{" "}
              <span>{selectedAsset?.brand} {selectedAsset?.model}</span>
            </div>
            <div>
              <span className="text-slate-400">الرقم التسلسلي:</span>{" "}
              <span className="font-mono">{selectedAsset?.serial_number || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الحالة العامة:</span>{" "}
              <StatusBadge status={selectedAsset?.status || "Available"} />
            </div>
            <div>
              <span className="text-slate-400">حالة العتاد:</span>{" "}
              <span className="font-semibold">{selectedAsset?.condition}</span>
            </div>
          </div>

          <h4 className="text-xs font-bold text-slate-800 pt-2 flex items-center gap-2">
            <Icons.Custody size={16} className="text-[#2563EB]" />
            <span>سجل تسليم وإرجاع العهدة ({selectedAsset?.custody_history?.length || 0})</span>
          </h4>

          {selectedAsset?.custody_history && selectedAsset.custody_history.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {selectedAsset.custody_history.map((h) => (
                <div
                  key={h.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800">{h.employee_name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      تاريخ التسليم: {new Date(h.assignment_date).toLocaleDateString("ar-SA")}{" "}
                      {h.actual_return_date && (
                        <span>• تاريخ الإرجاع: {new Date(h.actual_return_date).toLocaleDateString("ar-SA")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={h.status} />
                    <button
                      onClick={() => openReceipt(h.id)}
                      className="px-2 py-0.5 border border-slate-200 hover:border-[#2563EB] text-slate-700 text-[10px] rounded cursor-pointer"
                    >
                      عرض السند
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-xl">
              لم يتم تسليم هذا الأصل لأي موظف حتى الآن
            </p>
          )}
        </div>
      </Modal>

      {/* Legal Receipt Modal */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="سند تسليم واستلام عهدة تقنية (رسمي)"
        maxWidth="max-w-lg"
      >
        <div className="p-4 space-y-4 text-xs">
          <div className="text-center border-b border-slate-200 pb-3">
            <h3 className="font-black text-sm text-[#1D4ED8]">إقرار استلام عهدة تقنية</h3>
            <p className="text-slate-400 text-[11px] mt-0.5">سند رسمي موثق إلكترونياً</p>
          </div>

          {receiptData && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الموظف المستلم:</span>
                <span className="font-bold text-slate-900">{receiptData.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم الوظيفي:</span>
                <span className="font-mono">{receiptData.employee_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الأصل:</span>
                <span className="font-bold text-slate-900">{receiptData.asset_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">كود الأصل:</span>
                <span className="font-mono font-bold text-[#2563EB]">{receiptData.asset_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم التسلسلي (S/N):</span>
                <span className="font-mono">{receiptData.serial_number || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ التسليم:</span>
                <span>{receiptData.assignment_date ? new Date(receiptData.assignment_date).toLocaleString("ar-SA") : "-"}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-slate-600 leading-relaxed text-[11px]">
                {receiptData.legal_text || "أقر أنا الموقع أعلاه باستلام الجهاز الموضح بياناته بحالة جيدة، وأتعهد بالمحافظة عليه واستخدامه في أغراض العمل وإعادته متى طُلب مني ذلك."}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              طباعة السند
            </button>
            <button
              onClick={() => setShowReceiptModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
