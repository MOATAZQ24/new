"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useRef, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { StatsCard } from "@/components/ui/StatsCard";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useDialogAccessibility } from "@/components/ui/useDialogAccessibility";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface DigitalSecretItem {
  secret_id: string;
  secret_type: string;
  access_policy: string;
  vault_reference_masked: string;
  last_rotated?: string | null;
  last_accessed?: string | null;
}

interface DigitalPermissionItem {
  permission_id: string;
  username?: string | null;
  full_name?: string | null;
  access_level: string;
  can_reveal_secrets?: boolean;
}

interface DigitalAssetItem {
  asset_id: string;
  name: string;
  category: string;
  platform: string;
  branch_id?: string | null;
  branch_name?: string | null;
  url?: string | null;
  username?: string | null;
  account_email?: string | null;
  recovery_email?: string | null;
  recovery_phone?: string | null;
  two_factor_method?: string | null;
  two_factor_phone?: string | null;
  domain_registrar?: string | null;
  nameservers?: string | null;
  subscription_tier?: string | null;
  payment_method?: string | null;
  assigned_employee_id?: string | null;
  assigned_employee_name?: string | null;
  status: string;
  subscription_cost?: number | string | null;
  two_factor_enabled?: boolean;
  expires_at?: string | null;
  notes?: string | null;
  secrets_count?: number;
  secrets?: DigitalSecretItem[];
  permissions?: DigitalPermissionItem[];
}

interface DigitalEmployeeOption {
  id: string;
  employee_id?: string;
  full_name: string;
  employee_number?: string;
  job_title?: string | null;
}

interface DigitalBranchOption {
  id: string;
  branch_id?: string;
  branch_name: string;
}

interface DigitalUserOption {
  id: string;
  username: string;
  full_name?: string | null;
  role?: string | null;
  employee?: { full_name?: string | null } | null;
}

interface VaultStatusInfo {
  status: string;
}

export default function DigitalAssetsPage() {
  const { activeCompanyId, activeCompany } = useAuth();
  const toast = useToast();

  // State
  const [assets, setAssets] = useState<DigitalAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employees, setEmployees] = useState<DigitalEmployeeOption[]>([]);
  const [branches, setBranches] = useState<DigitalBranchOption[]>([]);
  const [users, setUsers] = useState<DigitalUserOption[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatusInfo | null>(null);

  // Modals & Drawer State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<DigitalAssetItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [drawerTab, setDrawerTab] = useState<"details" | "secrets" | "permissions">("details");
  useDialogAccessibility(drawerOpen && Boolean(selectedAsset), drawerRef, () => setDrawerOpen(false));

  // Secret Operations State
  const [showAddSecretModal, setShowAddSecretModal] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<DigitalSecretItem | null>(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealCountdown, setRevealCountdown] = useState<number>(30);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Add/Rotate Secret Inputs
  const [secretType, setSecretType] = useState("Password");
  const [secretValue, setSecretValue] = useState("");
  const [newRotateValue, setNewRotateValue] = useState("");
  const [rotationDue, setRotationDue] = useState("");

  // Permission Modal State
  const [showGrantPermModal, setShowGrantPermModal] = useState(false);
  const [permUserId, setPermUserId] = useState("");
  const [permAccessLevel, setPermAccessLevel] = useState("Viewer");
  const [permCanReveal, setPermCanReveal] = useState(false);
  const [permExpiresAt, setPermExpiresAt] = useState("");

  // Asset Form State
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Social Media");
  const [formPlatform, setFormPlatform] = useState("X (Twitter)");
  const [formBranchId, setFormBranchId] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formAccountEmail, setFormAccountEmail] = useState("");
  const [formRecoveryEmail, setFormRecoveryEmail] = useState("");
  const [formRecoveryPhone, setFormRecoveryPhone] = useState("");
  const [formTwoFactorMethod, setFormTwoFactorMethod] = useState("Authenticator App (TOTP)");
  const [formTwoFactorPhone, setFormTwoFactorPhone] = useState("");
  const [formDomainRegistrar, setFormDomainRegistrar] = useState("");
  const [formNameservers, setFormNameservers] = useState("");
  const [formSubscriptionTier, setFormSubscriptionTier] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("");
  const [formAssignedEmployeeId, setFormAssignedEmployeeId] = useState("");
  const [formStatus, setFormStatus] = useState("Active");
  const [formSubscriptionCost, setFormSubscriptionCost] = useState("0");
  const [formTwoFactorEnabled, setFormTwoFactorEnabled] = useState(false);
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Category Options
  const categories = [
    "Domain",
    "Hosting",
    "SaaS",
    "Cloud Service",
    "Social Media",
    "Email",
    "API Service",
    "Database",
    "Other",
  ];

  // Platform Options
  const platforms = [
    "X (Twitter)",
    "LinkedIn",
    "Instagram",
    "Facebook / Meta",
    "TikTok",
    "YouTube",
    "Snapchat",
    "Google Workspace",
    "Microsoft 365",
    "Apple Developer",
    "GitHub",
    "Cloudflare",
    "AWS",
    "Google Cloud",
    "OpenAI",
    "DigitalOcean",
    "Hetzner",
    "SendGrid",
    "Slack",
    "Stripe",
    "Other",
  ];

  // Fetch list of digital assets
  const fetchAssets = async () => {
    setLoading(true);
    try {
      let query = "/digital-assets?per_page=100";
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (categoryFilter) query += `&category=${encodeURIComponent(categoryFilter)}`;
      if (platformFilter) query += `&platform=${encodeURIComponent(platformFilter)}`;
      if (statusFilter) query += `&status=${encodeURIComponent(statusFilter)}`;

      const res = await api.get<DigitalAssetItem[]>(query);
      setAssets(res.data || []);
    } catch (err) {
      console.error("Failed to load digital assets", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch auxiliary options (employees, branches, users, vault status)
  const fetchAuxData = async () => {
    try {
      const [empRes, userRes, vaultRes] = await Promise.allSettled([
        api.get<DigitalEmployeeOption[]>("/employees?status=Active"),
        api.get<DigitalUserOption[]>("/employees/users/list"),
        api.get<VaultStatusInfo>("/digital-assets/vault/status"),
      ]);

      if (empRes.status === "fulfilled") setEmployees(empRes.value.data || []);
      if (userRes.status === "fulfilled") setUsers(userRes.value.data || []);
      if (vaultRes.status === "fulfilled") setVaultStatus(vaultRes.value.data || null);

      if (activeCompanyId) {
        try {
          const brRes = await api.get<DigitalBranchOption[]>(`/companies/${activeCompanyId}/branches`);
          setBranches(brRes.data || []);
        } catch {
          setBranches([]);
        }
      }
    } catch (e) {
      console.error("Auxiliary data fetch error", e);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchAssets();
      void fetchAuxData();
    }, 0);
    return () => window.clearTimeout(t);
  }, [search, categoryFilter, platformFilter, statusFilter, activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open asset drawer and fetch full details
  const handleOpenDrawer = async (asset: DigitalAssetItem) => {
    try {
      const res = await api.get<DigitalAssetItem>(`/digital-assets/${asset.asset_id}`);
      setSelectedAsset(res.data);
      setDrawerOpen(true);
      setDrawerTab("details");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل تحميل تفاصيل الأصل الرقمي");
    }
  };

  // Refresh selected asset details inside drawer
  const refreshSelectedAsset = async () => {
    if (!selectedAsset) return;
    try {
      const res = await api.get<DigitalAssetItem>(`/digital-assets/${selectedAsset.asset_id}`);
      setSelectedAsset(res.data);
      fetchAssets();
    } catch (err) {
      console.error(err);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormName("");
    setFormCategory("Social Media");
    setFormPlatform("X (Twitter)");
    setFormBranchId("");
    setFormUrl("");
    setFormUsername("");
    setFormAccountEmail("");
    setFormRecoveryEmail("");
    setFormRecoveryPhone("");
    setFormTwoFactorMethod("Authenticator App (TOTP)");
    setFormTwoFactorPhone("");
    setFormDomainRegistrar("");
    setFormNameservers("");
    setFormSubscriptionTier("");
    setFormPaymentMethod("");
    setFormAssignedEmployeeId("");
    setFormStatus("Active");
    setFormSubscriptionCost("0");
    setFormTwoFactorEnabled(false);
    setFormExpiresAt("");
    setFormNotes("");
  };

  // Prepare edit modal
  const handleOpenEdit = (asset: DigitalAssetItem) => {
    setSelectedAsset(asset);
    setFormName(asset.name || "");
    setFormCategory(asset.category || "Social Media");
    setFormPlatform(asset.platform || "X (Twitter)");
    setFormBranchId(asset.branch_id || "");
    setFormUrl(asset.url || "");
    setFormUsername(asset.username || "");
    setFormAccountEmail(asset.account_email || "");
    setFormRecoveryEmail(asset.recovery_email || "");
    setFormRecoveryPhone(asset.recovery_phone || "");
    setFormTwoFactorMethod(asset.two_factor_method || "Authenticator App (TOTP)");
    setFormTwoFactorPhone(asset.two_factor_phone || "");
    setFormDomainRegistrar(asset.domain_registrar || "");
    setFormNameservers(asset.nameservers || "");
    setFormSubscriptionTier(asset.subscription_tier || "");
    setFormPaymentMethod(asset.payment_method || "");
    setFormAssignedEmployeeId(asset.assigned_employee_id || "");
    setFormStatus(asset.status || "Active");
    setFormSubscriptionCost(asset.subscription_cost ? String(asset.subscription_cost) : "0");
    setFormTwoFactorEnabled(Boolean(asset.two_factor_enabled));
    setFormExpiresAt(asset.expires_at ? asset.expires_at.split("T")[0] : "");
    setFormNotes(asset.notes || "");
    setShowEditModal(true);
  };

  // Submit Create Asset
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError("");
    try {
      await api.post("/digital-assets", {
        name: formName.trim(),
        category: formCategory,
        platform: formPlatform,
        company_id: activeCompanyId,
        branch_id: formBranchId || null,
        url: formUrl.trim() || null,
        username: formUsername.trim() || null,
        account_email: formAccountEmail.trim() || null,
        recovery_email: formRecoveryEmail.trim() || null,
        recovery_phone: formRecoveryPhone.trim() || null,
        two_factor_method: formTwoFactorMethod || null,
        two_factor_phone: formTwoFactorPhone.trim() || null,
        domain_registrar: formDomainRegistrar.trim() || null,
        nameservers: formNameservers.trim() || null,
        subscription_tier: formSubscriptionTier.trim() || null,
        payment_method: formPaymentMethod.trim() || null,
        assigned_employee_id: formAssignedEmployeeId || null,
        status: formStatus,
        subscription_cost: parseFloat(formSubscriptionCost) || 0,
        two_factor_enabled: formTwoFactorEnabled,
        expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
        notes: formNotes.trim() || null,
      });

      setShowAddModal(false);
      resetForm();
      fetchAssets();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل إنشاء الأصل الرقمي");
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Update Asset
  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.put(`/digital-assets/${selectedAsset.asset_id}`, {
        name: formName.trim(),
        category: formCategory,
        platform: formPlatform,
        branch_id: formBranchId || null,
        url: formUrl.trim() || null,
        username: formUsername.trim() || null,
        account_email: formAccountEmail.trim() || null,
        recovery_email: formRecoveryEmail.trim() || null,
        recovery_phone: formRecoveryPhone.trim() || null,
        two_factor_method: formTwoFactorMethod || null,
        two_factor_phone: formTwoFactorPhone.trim() || null,
        domain_registrar: formDomainRegistrar.trim() || null,
        nameservers: formNameservers.trim() || null,
        subscription_tier: formSubscriptionTier.trim() || null,
        payment_method: formPaymentMethod.trim() || null,
        assigned_employee_id: formAssignedEmployeeId || null,
        status: formStatus,
        subscription_cost: parseFloat(formSubscriptionCost) || 0,
        two_factor_enabled: formTwoFactorEnabled,
        expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
        notes: formNotes.trim() || null,
      });

      setShowEditModal(false);
      fetchAssets();
      if (drawerOpen) refreshSelectedAsset();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تحديث بيانات الأصل الرقمي");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Asset
  const handleDeleteAsset = async (asset: DigitalAssetItem) => {
    if (!confirm(`هل أنت متأكد من حذف الأصل الرقمي "${asset.name}" وجميع أسراره المشفرة من الخزنة؟`)) {
      return;
    }
    try {
      await api.delete(`/digital-assets/${asset.asset_id}`);
      if (drawerOpen && selectedAsset?.asset_id === asset.asset_id) {
        setDrawerOpen(false);
      }
      fetchAssets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الأصل الرقمي");
    }
  };

  // Reveal Secret with Reauthentication
  const handleOpenReveal = (secret: DigitalSecretItem) => {
    setSelectedSecret(secret);
    setReauthPassword("");
    setRevealedValue(null);
    setActionError("");
    setShowRevealModal(true);
  };

  const handleConfirmReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSecret) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<{ secret_value?: string }>(`/digital-assets/secrets/${selectedSecret.secret_id}/reveal`, {
        reauth_password: reauthPassword,
      });

      setRevealedValue(res.data?.secret_value || "");
      setRevealCountdown(30);

      // Refresh drawer so last_accessed updates
      refreshSelectedAsset();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل التحقق من كلمة المرور وكشف السر");
    } finally {
      setActionLoading(false);
    }
  };

  // Countdown timer for revealed secret
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (revealedValue && revealCountdown > 0) {
      timer = setInterval(() => {
        setRevealCountdown((prev) => {
          if (prev <= 1) {
            setRevealedValue(null);
            setShowRevealModal(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [revealedValue, revealCountdown]);

  // Copy secret value to clipboard
  const handleCopySecret = () => {
    if (!revealedValue) return;
    navigator.clipboard.writeText(revealedValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Add Secret to Vault
  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.post(`/digital-assets/${selectedAsset.asset_id}/secrets`, {
        secret_type: secretType,
        secret_value: secretValue,
        rotation_due: rotationDue ? new Date(rotationDue).toISOString() : null,
      });

      setShowAddSecretModal(false);
      setSecretValue("");
      setRotationDue("");
      refreshSelectedAsset();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تخزين السر في الخزنة");
    } finally {
      setActionLoading(false);
    }
  };

  // Rotate Secret
  const handleOpenRotate = (secret: DigitalSecretItem) => {
    setSelectedSecret(secret);
    setNewRotateValue("");
    setReauthPassword("");
    setActionError("");
    setShowRotateModal(true);
  };

  const handleConfirmRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSecret) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.post(`/digital-assets/secrets/${selectedSecret.secret_id}/rotate`, {
        new_secret_value: newRotateValue,
        reauth_password: reauthPassword,
      });

      setShowRotateModal(false);
      setNewRotateValue("");
      setReauthPassword("");
      refreshSelectedAsset();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل تدوير السر");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Secret
  const handleDeleteSecret = async (secret: DigitalSecretItem) => {
    if (!confirm(`هل أنت متأكد من حذف هذا السر (${secret.secret_type}) نهائياً من الخزنة المشفرة؟`)) {
      return;
    }
    try {
      await api.delete(`/digital-assets/secrets/${secret.secret_id}`);
      toast.success("تم حذف السر نهائياً من الخزنة");
      refreshSelectedAsset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل حذف السر من الخزنة");
    }
  };

  // Grant Permission
  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !permUserId) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.post(`/digital-assets/${selectedAsset.asset_id}/permissions`, {
        user_id: permUserId,
        access_level: permAccessLevel,
        can_reveal_secrets: permCanReveal,
        expires_at: permExpiresAt ? new Date(permExpiresAt).toISOString() : null,
      });

      setShowGrantPermModal(false);
      setPermUserId("");
      setPermAccessLevel("Viewer");
      setPermCanReveal(false);
      setPermExpiresAt("");
      refreshSelectedAsset();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل منح الصلاحيات");
    } finally {
      setActionLoading(false);
    }
  };

  // Revoke Permission
  const handleRevokePermission = async (perm: DigitalPermissionItem) => {
    if (!confirm(`هل أنت متأكد من إلغاء صلاحيات المستخدم على هذا الأصل الرقمي؟`)) {
      return;
    }
    try {
      await api.delete(`/digital-assets/permissions/${perm.permission_id}`);
      refreshSelectedAsset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "فشل إلغاء الصلاحية");
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = assets.length;
    const active = assets.filter((a) => a.status === "Active").length;
    const twoFactorCount = assets.filter((a) => a.two_factor_enabled).length;
    const totalSecrets = assets.reduce((sum, a) => sum + Number(a.secrets_count || 0), 0);
    const twoFactorRate = total > 0 ? Math.round((twoFactorCount / total) * 100) : 0;

    return { total, active, twoFactorRate, totalSecrets };
  }, [assets]);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header & Vault Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface)] dark:bg-slate-900 p-6 rounded-2xl border border-[var(--border)] dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icons.Lock size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)] dark:text-white">
                  الأصول الرقمية وخزنة الأسرار
                </h1>
                <p className="text-sm text-[var(--text-3)] dark:text-slate-400 mt-0.5">
                  إدارة وحماية الأصول السحابية والنطاقات وحفظ أسرار الاعتماد المشفرة (Zero-Plaintext Policy)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Vault Status Indicator */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border bg-[var(--surface-2)] dark:bg-slate-800/60 border-[var(--border)] dark:border-slate-700">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  vaultStatus?.status === "healthy" || vaultStatus?.status === "mock"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500"
                }`}
              />
              <span className="text-[var(--text-2)] dark:text-slate-300">
                خزنة HashiCorp Vault:
              </span>
              <span
                className={
                  vaultStatus?.status === "healthy"
                    ? "text-emerald-700 dark:text-emerald-400 font-bold"
                    : "text-amber-700 dark:text-amber-400 font-bold"
                }
              >
                {vaultStatus?.status === "healthy"
                  ? "متصلة ومشفرة (Active)"
                  : vaultStatus?.status === "mock"
                  ? "وضع التطوير الآمن"
                  : "غير مهيأة"}
              </span>
            </div>

            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-sm"
            >
              <Icons.Plus size={18} />
              <span>إضافة أصل رقمي جديد</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="إجمالي الأصول الرقمية"
            value={stats.total}
            icon={<Icons.Lock size={18} />}
            accentColor="border-[#1D4ED8]"
          />
          <StatsCard
            title="الأصول النشطة"
            value={stats.active}
            icon={<Icons.CheckCircle size={18} />}
            accentColor="border-emerald-500"
          />
          <StatsCard
            title="نسبة تفعيل 2FA"
            value={`${stats.twoFactorRate}%`}
            icon={<Icons.ShieldCheck size={18} />}
            accentColor="border-[#3B82F6]"
          />
          <StatsCard
            title="أسرار الخزنة المشفرة"
            value={stats.totalSecrets}
            icon={<Icons.Key size={18} />}
            accentColor="border-blue-500"
          />
        </div>

        {/* Filter Bar */}
        <div className="bg-[var(--surface)] dark:bg-slate-900 p-4 rounded-xl border border-[var(--border)] dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Icons.Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              type="text"
              placeholder="البحث بالاسم، المنصة، اسم المستخدم، البريد، أو الرابط..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface-2)] dark:bg-slate-800/50 text-[var(--text)] dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface-2)] dark:bg-slate-800/50 text-[var(--text-2)] dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface-2)] dark:bg-slate-800/50 text-[var(--text-2)] dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">جميع المنصات</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface-2)] dark:bg-slate-800/50 text-[var(--text-2)] dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">جميع الحالات</option>
              <option value="Active">نشط (Active)</option>
              <option value="Suspended">معلق (Suspended)</option>
              <option value="Expired">منتهي (Expired)</option>
              <option value="In Review">قيد المراجعة (In Review)</option>
            </select>

            {(search || categoryFilter || platformFilter || statusFilter) && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("");
                  setPlatformFilter("");
                  setStatusFilter("");
                }}
                className="px-3 py-2 text-xs font-semibold text-[var(--text-2)] dark:text-slate-400 hover:text-red-600 transition"
              >
                إلغاء الفلاتر
              </button>
            )}
          </div>
        </div>

        {/* Assets Table */}
        <div className="bg-[var(--surface)] dark:bg-slate-900 rounded-2xl border border-[var(--border)] dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm text-[var(--text-2)] dark:text-slate-300">
              <thead className="bg-[var(--surface-2)] dark:bg-slate-800/50 text-xs font-semibold text-[var(--text-3)] dark:text-slate-400 uppercase border-b border-[var(--border)] dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">الأصل الرقمي والمنصة</th>
                  <th className="px-6 py-4">التصنيف</th>
                  <th className="px-6 py-4">بيانات الحساب والبريد</th>
                  <th className="px-6 py-4">الموظف المسؤول</th>
                  <th className="px-6 py-4 text-center">2FA</th>
                  <th className="px-6 py-4 text-center">أسرار الخزنة</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8}>
                      <TableSkeleton variant="table" rows={5} cols={7} />
                    </td>
                  </tr>
                ) : assets.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={<Icons.Lock size={26} />}
                        title="لا توجد أصول رقمية مطابقة"
                        description="يمكنك إضافة أصل رقمي جديد وربطه بخزنة HashiCorp Vault الآن"
                      />
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => (
                    <tr
                      key={asset.asset_id}
                      className="hover:bg-[var(--surface-2)] dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-[var(--text)] dark:text-white">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Icons.Globe size={18} />
                          </div>
                          <div>
                            <div className="font-bold flex items-center gap-2">
                              <span>{asset.name}</span>
                              {asset.url && (
                                <a
                                  href={asset.url.startsWith("http") ? asset.url : `https://${asset.url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--text-3)] hover:text-primary transition"
                                  title="فتح الرابط الخارجي"
                                >
                                  <Icons.ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-3)] flex items-center gap-1.5 mt-0.5">
                              <span className="font-medium text-[var(--text-2)] dark:text-slate-400">
                                {asset.platform}
                              </span>
                              {asset.branch_name && (
                                <>
                                  <span>•</span>
                                  <span>{asset.branch_name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-1 text-xs rounded-md bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-2)] dark:text-slate-300 border border-[var(--border)] dark:border-slate-700">
                          {asset.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="space-y-1">
                          {asset.username && (
                            <div className="text-[var(--text)] dark:text-white font-mono font-semibold">
                              {asset.username}
                            </div>
                          )}
                          {asset.account_email && (
                            <div className="text-[var(--text-2)] dark:text-slate-300 font-mono text-[11px] flex items-center gap-1">
                              <span className="text-[var(--text-3)]">البريد:</span>
                              <span>{asset.account_email}</span>
                            </div>
                          )}
                          {asset.recovery_phone && (
                            <div className="text-[var(--text-3)] dark:text-slate-400 font-mono text-[11px] flex items-center gap-1">
                              <span className="text-[var(--text-3)]">الهاتف:</span>
                              <span dir="ltr">{asset.recovery_phone}</span>
                            </div>
                          )}
                          {asset.recovery_email && (
                            <div className="text-amber-700 dark:text-amber-400 font-mono text-[10px] flex items-center gap-1">
                              <span className="text-[var(--text-3)]">استرداد:</span>
                              <span>{asset.recovery_email}</span>
                            </div>
                          )}
                          {!asset.username && !asset.account_email && !asset.recovery_phone && (
                            <span className="text-[var(--text-3)]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {asset.assigned_employee_name ? (
                          <div className="flex items-center gap-1.5 text-[var(--text)] dark:text-slate-200">
                            <Icons.User size={14} className="text-[var(--text-3)]" />
                            <span>{asset.assigned_employee_name}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-3)]">غير مخصص</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {asset.two_factor_enabled ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <Icons.ShieldCheck size={13} />
                              <span>مفعل</span>
                            </span>
                            <span className="text-[10px] text-[var(--text-3)] font-medium">
                              {asset.two_factor_method ? asset.two_factor_method.split(" ")[0] : "TOTP"}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--text-2)] dark:bg-slate-800 dark:text-slate-400">
                            <span>معطل</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            handleOpenDrawer(asset);
                            setDrawerTab("secrets");
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition"
                        >
                          <Icons.Key size={14} />
                          <span>{asset.secrets_count || 0} أسرار</span>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={asset.status} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenDrawer(asset)}
                            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-primary hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                            title="عرض التفاصيل والخزنة"
                          >
                            <Icons.Eye size={18} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(asset)}
                            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-amber-600 hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                            title="تعديل الأصل"
                          >
                            <Icons.Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset)}
                            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-red-600 hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                            title="حذف الأصل"
                          >
                            <Icons.Trash size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Asset Details & Secrets Drawer (Slide-over) */}
        {drawerOpen && selectedAsset && (
          <div className="motion-backdrop-enter fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="digital-asset-drawer-title"
              className="motion-drawer w-full max-w-2xl bg-[var(--surface)] dark:bg-slate-900 h-full shadow-2xl flex flex-col border-r border-[var(--border)] dark:border-slate-800"
              tabIndex={-1}
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-[var(--border)] dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icons.Lock size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="digital-asset-drawer-title" className="text-xl font-bold text-[var(--text)] dark:text-white">
                        {selectedAsset.name}
                      </h2>
                      <StatusBadge status={selectedAsset.status} />
                    </div>
                    <p className="text-xs text-[var(--text-3)] mt-0.5">
                      {selectedAsset.platform} • {selectedAsset.category}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-xl text-[var(--text-3)] hover:text-slate-600 hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  <Icons.X size={20} />
                </button>
              </div>

              {/* Drawer Tabs */}
              <div className="flex border-b border-[var(--border)] dark:border-slate-800 px-6">
                <button
                  onClick={() => setDrawerTab("details")}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${
                    drawerTab === "details"
                      ? "border-primary text-primary"
                      : "border-transparent text-[var(--text-3)] hover:text-slate-800"
                  }`}
                >
                  تفاصيل الأصل
                </button>
                <button
                  onClick={() => setDrawerTab("secrets")}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                    drawerTab === "secrets"
                      ? "border-primary text-primary"
                      : "border-transparent text-[var(--text-3)] hover:text-slate-800"
                  }`}
                >
                  <span>خزنة الأسرار المشفرة</span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold">
                    {selectedAsset.secrets?.length || 0}
                  </span>
                </button>
                <button
                  onClick={() => setDrawerTab("permissions")}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                    drawerTab === "permissions"
                      ? "border-primary text-primary"
                      : "border-transparent text-[var(--text-3)] hover:text-slate-800"
                  }`}
                >
                  <span>صلاحيات الوصول</span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-2)] dark:text-slate-300">
                    {selectedAsset.permissions?.length || 0}
                  </span>
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* TAB 1: DETAILS */}
                {drawerTab === "details" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">الرابط المباشر (URL)</span>
                        {selectedAsset.url ? (
                          <a
                            href={selectedAsset.url.startsWith("http") ? selectedAsset.url : `https://${selectedAsset.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono break-all text-xs flex items-center gap-1"
                          >
                            <span>{selectedAsset.url}</span>
                            <Icons.ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-[var(--text-3)]">—</span>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">اسم المستخدم / الحساب</span>
                        <span className="font-mono font-semibold text-[var(--text)] dark:text-slate-200">
                          {selectedAsset.username || "—"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">بريد الحساب المسجل</span>
                        <span className="font-mono text-[var(--text)] dark:text-slate-200 text-xs">
                          {selectedAsset.account_email || "—"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">هاتف الاسترداد (Recovery Phone)</span>
                        <span className="font-mono text-[var(--text)] dark:text-slate-200 text-xs" dir="ltr">
                          {selectedAsset.recovery_phone || "—"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">البريد البديل للاسترداد (Recovery Email)</span>
                        <span className="font-mono text-amber-700 dark:text-amber-400 text-xs">
                          {selectedAsset.recovery_email || "—"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">حماية المصادقة الثنائية (2FA)</span>
                        <span className="font-semibold text-xs">
                          {selectedAsset.two_factor_enabled ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Icons.ShieldCheck size={16} />
                              مفعلة ({selectedAsset.two_factor_method || "TOTP"})
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Icons.AlertTriangle size={16} />
                              معطلة (يوصى بتفعيلها)
                            </span>
                          )}
                        </span>
                      </div>

                      {selectedAsset.two_factor_phone && (
                        <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                          <span className="text-xs text-[var(--text-3)] block mb-1">هاتف رموز الـ 2FA (2FA Phone)</span>
                          <span className="font-mono text-[var(--text)] dark:text-slate-200 text-xs" dir="ltr">
                            {selectedAsset.two_factor_phone}
                          </span>
                        </div>
                      )}

                      {selectedAsset.domain_registrar && (
                        <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                          <span className="text-xs text-[var(--text-3)] block mb-1">مسجل النطاق (Registrar)</span>
                          <span className="font-medium text-[var(--text)] dark:text-slate-200 text-xs">
                            {selectedAsset.domain_registrar}
                          </span>
                        </div>
                      )}

                      {selectedAsset.nameservers && (
                        <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                          <span className="text-xs text-[var(--text-3)] block mb-1">خوادم الأسماء (Nameservers)</span>
                          <span className="font-mono text-[var(--text-2)] dark:text-slate-300 text-xs">
                            {selectedAsset.nameservers}
                          </span>
                        </div>
                      )}

                      {selectedAsset.subscription_tier && (
                        <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                          <span className="text-xs text-[var(--text-3)] block mb-1">خطة وفئة الاشتراك</span>
                          <span className="font-semibold text-[var(--text)] dark:text-slate-200 text-xs">
                            {selectedAsset.subscription_tier}
                          </span>
                        </div>
                      )}

                      {selectedAsset.payment_method && (
                        <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                          <span className="text-xs text-[var(--text-3)] block mb-1">طريقة الدفع المسجلة</span>
                          <span className="font-medium text-[var(--text)] dark:text-slate-200 text-xs">
                            {selectedAsset.payment_method}
                          </span>
                        </div>
                      )}

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">الموظف المسؤول (Assigned)</span>
                        <span className="font-semibold text-[var(--text)] dark:text-slate-200">
                          {selectedAsset.assigned_employee_name || "غير مخصص"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">تكلفة الاشتراك التقديرية</span>
                        <span className="font-bold text-[var(--text)] dark:text-white">
                          {selectedAsset.subscription_cost ? `${selectedAsset.subscription_cost} ر.س` : "مجاني / غير محدد"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs text-[var(--text-3)] block mb-1">تاريخ الانتهاء / التجديد</span>
                        <span className="text-[var(--text)] dark:text-slate-200 text-xs">
                          {selectedAsset.expires_at ? new Date(selectedAsset.expires_at).toLocaleDateString("ar-SA") : "لا يوجد انتهاء"}
                        </span>
                      </div>
                    </div>

                    {selectedAsset.notes && (
                      <div className="p-4 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800">
                        <span className="text-xs font-semibold text-[var(--text-3)] block mb-2">ملاحظات إضافية</span>
                        <p className="text-sm text-[var(--text-2)] dark:text-slate-300 whitespace-pre-line leading-relaxed">
                          {selectedAsset.notes}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-[var(--border)] dark:border-slate-800 flex justify-end gap-3">
                      <button
                        onClick={() => handleOpenEdit(selectedAsset)}
                        className="px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-2)] dark:text-slate-300 rounded-xl text-sm font-semibold transition"
                      >
                        تعديل البيانات
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: SECRETS VAULT */}
                {drawerTab === "secrets" && (
                  <div className="space-y-6">
                    {/* Security Notice */}
                    <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 text-xs leading-relaxed flex items-start gap-3">
                      <Icons.ShieldCheck size={20} className="shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <div className="font-bold mb-1">
                          حماية مشددة وفق سياسة Zero-Plaintext Credentials:
                        </div>
                        يتم تخزين جميع الأسرار وكلمات المرور في **HashiCorp Vault KV v2** المشفر. لا تحفظ قاعدة البيانات أي نصوص صريحة إطلاقاً، وتتطلب عملية الكشف إعادة المصادقة بكلمة المرور وصلاحية Reveal مع تسجيل تدقيق كامل.
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-[var(--text)] dark:text-white text-base">
                        الأسرار وكلمات المرور المسجلة
                      </h3>
                      <button
                        onClick={() => {
                          setSecretType("Password");
                          setSecretValue("");
                          setRotationDue("");
                          setActionError("");
                          setShowAddSecretModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition"
                      >
                        <Icons.Plus size={16} />
                        <span>إضافة سر إلى الخزنة</span>
                      </button>
                    </div>

                    {/* Secrets List */}
                    {selectedAsset.secrets && selectedAsset.secrets.length > 0 ? (
                      <div className="space-y-3">
                        {selectedAsset.secrets.map((secret) => (
                          <div
                            key={secret.secret_id}
                            className="p-4 rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-2)] dark:bg-slate-800/40 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                                  <Icons.Key size={16} />
                                </div>
                                <div>
                                  <div className="font-bold text-sm text-[var(--text)] dark:text-white flex items-center gap-2">
                                    <span>{secret.secret_type}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[var(--text-2)] dark:text-slate-300 font-mono">
                                      {secret.access_policy}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--text-3)] mt-0.5">
                                    {secret.vault_reference_masked}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleOpenReveal(secret)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-xs"
                                >
                                  <Icons.Eye size={14} />
                                  <span>كشف السر</span>
                                </button>
                                <button
                                  onClick={() => handleOpenRotate(secret)}
                                  className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-slate-900 hover:bg-[var(--surface-2)] dark:hover:bg-slate-700 transition"
                                  title="تدوير السر (Rotate)"
                                >
                                  <Icons.Refresh size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteSecret(secret)}
                                  className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-red-600 hover:bg-[var(--surface-2)] dark:hover:bg-slate-700 transition"
                                  title="حذف من الخزنة"
                                >
                                  <Icons.Trash size={16} />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-3)] pt-2 border-t border-[var(--border)] dark:border-slate-800">
                              <div>
                                <span>آخر تدوير: </span>
                                <span className="font-medium text-[var(--text-2)] dark:text-slate-300">
                                  {secret.last_rotated ? new Date(secret.last_rotated).toLocaleDateString("ar-SA") : "لم يتم التدوير"}
                                </span>
                              </div>
                              <div>
                                <span>آخر وصول: </span>
                                <span className="font-medium text-[var(--text-2)] dark:text-slate-300">
                                  {secret.last_accessed ? new Date(secret.last_accessed).toLocaleTimeString("ar-SA") : "لم يُكشف بعد"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center border border-dashed border-[var(--border)] dark:border-slate-800 rounded-xl">
                        <Icons.Lock size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-2)] dark:text-slate-300">
                          لا توجد أسرار أو كلمات مرور في الخزنة لهذا الأصل
                        </p>
                        <p className="text-xs text-[var(--text-3)] mt-1">
                          انقر على &quot;إضافة سر إلى الخزنة&quot; لحفظ كلمة المرور أو مفتاح الـ API بأمان
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PERMISSIONS */}
                {drawerTab === "permissions" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-[var(--text)] dark:text-white text-base">
                          أذونات الوصول والتحكم
                        </h3>
                        <p className="text-xs text-[var(--text-3)] mt-0.5">
                          تحديد الموظفين المخولين بعرض الأصل وكشف أسرار الخزنة
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPermUserId("");
                          setPermAccessLevel("Viewer");
                          setPermCanReveal(false);
                          setPermExpiresAt("");
                          setActionError("");
                          setShowGrantPermModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition"
                      >
                        <Icons.Plus size={16} />
                        <span>منح صلاحية لمستخدم</span>
                      </button>
                    </div>

                    {selectedAsset.permissions && selectedAsset.permissions.length > 0 ? (
                      <div className="divide-y divide-[var(--border)] dark:divide-slate-800 border border-[var(--border)] dark:border-slate-800 rounded-xl overflow-hidden">
                        {selectedAsset.permissions.map((perm) => (
                          <div
                            key={perm.permission_id}
                            className="p-4 flex items-center justify-between bg-[var(--surface)] dark:bg-slate-900"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[var(--surface-2)] dark:bg-slate-800 flex items-center justify-center font-bold text-[var(--text-2)] dark:text-slate-300 text-xs">
                                {perm.username?.substring(0, 2).toUpperCase() || "US"}
                              </div>
                              <div>
                                <div className="font-bold text-sm text-[var(--text)] dark:text-white flex items-center gap-2">
                                  <span>{perm.full_name || perm.username}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                                    {perm.access_level}
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--text-3)] flex items-center gap-3 mt-1">
                                  <span>اسم الدخول: {perm.username}</span>
                                  <span>•</span>
                                  <span>
                                    كشف الأسرار:{" "}
                                    <strong className={perm.can_reveal_secrets ? "text-emerald-600" : "text-[var(--text-3)]"}>
                                      {perm.can_reveal_secrets ? "مسموح" : "غير مسموح"}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {perm.access_level !== "Owner" && (
                              <button
                                onClick={() => handleRevokePermission(perm)}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                              >
                                إلغاء الصلاحية
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-8 text-sm text-[var(--text-3)]">
                        لا توجد صلاحيات مخصصة مسجلة
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create Digital Asset */}
        {showAddModal && (
          <Modal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            title="إضافة أصل رقمي جديد"
          >
            <form onSubmit={handleCreateAsset} className="space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    اسم الأصل الرقمي *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: حساب AWS Production"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    المنصة (Platform) *
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    التصنيف (Category) *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الفرع التابع له
                  </label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">عام / الشركة كاملة</option>
                    {branches.map((b) => (
                      <option key={b.branch_id || b.id} value={b.branch_id || b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    رابط المنصة / بوابة الدخول (URL)
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    اسم المستخدم / المعرف (Username)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: admin_ops"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    بريد الحساب الأساسي (Account Email)
                  </label>
                  <input
                    type="email"
                    placeholder="ops@investorgate.com"
                    value={formAccountEmail}
                    onChange={(e) => setFormAccountEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    البريد البديل للاسترداد (Recovery Email)
                  </label>
                  <input
                    type="email"
                    placeholder="backup@investorgate-holdings.com"
                    value={formRecoveryEmail}
                    onChange={(e) => setFormRecoveryEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    هاتف الاسترداد والحساب (Linked Phone)
                  </label>
                  <input
                    type="text"
                    placeholder="+9665..."
                    value={formRecoveryPhone}
                    onChange={(e) => setFormRecoveryPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    طريقة المصادقة الثنائية (2FA Method)
                  </label>
                  <select
                    value={formTwoFactorMethod}
                    onChange={(e) => setFormTwoFactorMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Authenticator App (TOTP)">تطبيق المصادقة (Google / MS Authenticator)</option>
                    <option value="SMS Verification">رسائل نصية قصيرة (SMS)</option>
                    <option value="Security Key (FIDO2 / YubiKey)">مفتاح أمان مادي (Security Key / YubiKey)</option>
                    <option value="Email OTP">رمز عبر البريد الإلكتروني (Email OTP)</option>
                    <option value="Apple / Google Prompt">إشعار تأكيد على الجهاز (Push Prompt)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    هاتف رموز الـ 2FA (إذا كان مختلفاً)
                  </label>
                  <input
                    type="text"
                    placeholder="+9665..."
                    value={formTwoFactorPhone}
                    onChange={(e) => setFormTwoFactorPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    مسجل النطاق (Domain Registrar)
                  </label>
                  <input
                    type="text"
                    placeholder="SaudiNIC, Cloudflare, GoDaddy..."
                    value={formDomainRegistrar}
                    onChange={(e) => setFormDomainRegistrar(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    خوادم الأسماء (Nameservers)
                  </label>
                  <input
                    type="text"
                    placeholder="ns1.cloudflare.com, ns2..."
                    value={formNameservers}
                    onChange={(e) => setFormNameservers(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    فئة / خطة الاشتراك (Tier)
                  </label>
                  <input
                    type="text"
                    placeholder="Enterprise, Verified, Business..."
                    value={formSubscriptionTier}
                    onChange={(e) => setFormSubscriptionTier(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    طريقة الدفع (Payment Method)
                  </label>
                  <input
                    type="text"
                    placeholder="بطاقة الشركة (*4412), حوالة سنوية..."
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الموظف المسؤول (Assigned Employee)
                  </label>
                  <select
                    value={formAssignedEmployeeId}
                    onChange={(e) => setFormAssignedEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">بدون تخصيص</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                        {emp.full_name} ({emp.employee_number || emp.job_title})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الحالة
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Active">نشط (Active)</option>
                    <option value="Suspended">معلق (Suspended)</option>
                    <option value="Expired">منتهي (Expired)</option>
                    <option value="In Review">قيد المراجعة (In Review)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    تكلفة الاشتراك (ر.س)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formSubscriptionCost}
                    onChange={(e) => setFormSubscriptionCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    تاريخ الانتهاء / التجديد
                  </label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-700">
                <input
                  type="checkbox"
                  id="twoFactorCheckbox"
                  checked={formTwoFactorEnabled}
                  onChange={(e) => setFormTwoFactorEnabled(e.target.checked)}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="twoFactorCheckbox" className="text-xs font-semibold text-[var(--text)] dark:text-slate-200 cursor-pointer">
                  المصادقة الثنائية (2FA) مفعلة على هذا الحساب
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  placeholder="أي معلومات إضافية أو إرشادات أمان..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري الحفظ..." : "حفظ الأصل الرقمي"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Edit Digital Asset */}
        {showEditModal && (
          <Modal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            title="تعديل بيانات الأصل الرقمي"
          >
            <form onSubmit={handleUpdateAsset} className="space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    اسم الأصل الرقمي *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    المنصة (Platform) *
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    التصنيف (Category) *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الفرع
                  </label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">عام / الشركة كاملة</option>
                    {branches.map((b) => (
                      <option key={b.branch_id || b.id} value={b.branch_id || b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    رابط المنصة (URL)
                  </label>
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    اسم المستخدم (Username)
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    بريد الحساب الأساسي
                  </label>
                  <input
                    type="email"
                    value={formAccountEmail}
                    onChange={(e) => setFormAccountEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    البريد البديل للاسترداد (Recovery Email)
                  </label>
                  <input
                    type="email"
                    value={formRecoveryEmail}
                    onChange={(e) => setFormRecoveryEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    هاتف الاسترداد والحساب (Linked Phone)
                  </label>
                  <input
                    type="text"
                    value={formRecoveryPhone}
                    onChange={(e) => setFormRecoveryPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    طريقة المصادقة الثنائية (2FA Method)
                  </label>
                  <select
                    value={formTwoFactorMethod}
                    onChange={(e) => setFormTwoFactorMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Authenticator App (TOTP)">تطبيق المصادقة (Google / MS Authenticator)</option>
                    <option value="SMS Verification">رسائل نصية قصيرة (SMS)</option>
                    <option value="Security Key (FIDO2 / YubiKey)">مفتاح أمان مادي (Security Key / YubiKey)</option>
                    <option value="Email OTP">رمز عبر البريد الإلكتروني (Email OTP)</option>
                    <option value="Apple / Google Prompt">إشعار تأكيد على الجهاز (Push Prompt)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    هاتف رموز الـ 2FA (إذا كان مختلفاً)
                  </label>
                  <input
                    type="text"
                    value={formTwoFactorPhone}
                    onChange={(e) => setFormTwoFactorPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    مسجل النطاق (Domain Registrar)
                  </label>
                  <input
                    type="text"
                    value={formDomainRegistrar}
                    onChange={(e) => setFormDomainRegistrar(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    خوادم الأسماء (Nameservers)
                  </label>
                  <input
                    type="text"
                    value={formNameservers}
                    onChange={(e) => setFormNameservers(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    فئة / خطة الاشتراك (Tier)
                  </label>
                  <input
                    type="text"
                    value={formSubscriptionTier}
                    onChange={(e) => setFormSubscriptionTier(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    طريقة الدفع (Payment Method)
                  </label>
                  <input
                    type="text"
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الموظف المسؤول
                  </label>
                  <select
                    value={formAssignedEmployeeId}
                    onChange={(e) => setFormAssignedEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">بدون تخصيص</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                        {emp.full_name} ({emp.employee_number || emp.job_title})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    الحالة
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Active">نشط (Active)</option>
                    <option value="Suspended">معلق (Suspended)</option>
                    <option value="Expired">منتهي (Expired)</option>
                    <option value="In Review">قيد المراجعة (In Review)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    تكلفة الاشتراك (ر.س)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formSubscriptionCost}
                    onChange={(e) => setFormSubscriptionCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                    تاريخ الانتهاء / التجديد
                  </label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-700">
                <input
                  type="checkbox"
                  id="twoFactorCheckboxEdit"
                  checked={formTwoFactorEnabled}
                  onChange={(e) => setFormTwoFactorEnabled(e.target.checked)}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="twoFactorCheckboxEdit" className="text-xs font-semibold text-[var(--text)] dark:text-slate-200 cursor-pointer">
                  المصادقة الثنائية (2FA) مفعلة على هذا الحساب
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري التحديث..." : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Reveal Secret (Reauthentication Required) */}
        {showRevealModal && (
          <Modal
            isOpen={showRevealModal}
            onClose={() => {
              setShowRevealModal(false);
              setRevealedValue(null);
            }}
            title="تأكيد الهوية لكشف السر المشفر"
          >
            <div className="space-y-4">
              {!revealedValue ? (
                <form onSubmit={handleConfirmReveal} className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                    <Icons.Lock size={20} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                      <strong>إعادة المصادقة مطلوبة (Re-authentication):</strong>
                      <br />
                      لحماية أسرار النظام ومنع الوصول غير المصرح به، أدخل كلمة مرور حسابك الحالي لفك تشفير هذا السر من خزنة HashiCorp Vault.
                    </div>
                  </div>

                  {actionError && (
                    <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                      {actionError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                      كلمة مرور حسابك الحالي *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="أدخل كلمة مرور تسجيل الدخول..."
                      value={reauthPassword}
                      onChange={(e) => setReauthPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRevealModal(false)}
                      className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <Icons.Key size={16} />
                      <span>{actionLoading ? "جاري التحقق وفك التشفير..." : "تأكيد وكشف السر"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                      <Icons.CheckCircle size={18} />
                      <span>تم فك تشفير السر من الخزنة بنجاح</span>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold font-mono">
                      يختفي تلقائياً خلال {revealCountdown} ثانية
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-3)] mb-1">
                      قيمة السر ({selectedSecret?.secret_type}):
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={revealedValue}
                        className="w-full px-4 py-3 text-base font-mono font-bold rounded-xl border border-[var(--border)] dark:border-slate-700 bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text)] dark:text-white select-all"
                      />
                      <button
                        onClick={handleCopySecret}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90 transition shadow-xs"
                      >
                        {copied ? (
                          <>
                            <Icons.Check size={14} />
                            <span>تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Icons.Copy size={14} />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        setRevealedValue(null);
                        setShowRevealModal(false);
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-2)] dark:bg-slate-800 text-[var(--text-2)] dark:text-slate-300 transition"
                    >
                      إغلاق وإخفاء السر
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* Modal: Add Secret */}
        {showAddSecretModal && (
          <Modal
            isOpen={showAddSecretModal}
            onClose={() => setShowAddSecretModal(false)}
            title="إضافة سر جديد إلى الخزنة المشفرة"
          >
            <form onSubmit={handleAddSecret} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-800 text-xs text-[var(--text-2)] dark:text-slate-400">
                سيتم إرسال هذا السر مباشرة إلى <strong>HashiCorp Vault KV v2</strong> ولن يتم حفظ أي نسخة نصية في جداول التطبيق.
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  نوع السر *
                </label>
                <select
                  value={secretType}
                  onChange={(e) => setSecretType(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="Password">كلمة مرور الحساب (Master Password)</option>
                  <option value="2FA Authenticator Key">مفتاح إعداد تطبيق المصادقة الثنائية (TOTP Authenticator Key / Serial)</option>
                  <option value="Recovery Code">رموز الاسترداد الاحتياطية للطوارئ (Backup / Recovery Codes)</option>
                  <option value="Domain Transfer Auth / EPP Code">رمز نقل النطاق الرسمي (Domain EPP / Auth Code)</option>
                  <option value="API Key">مفتاح برمجية (API Key)</option>
                  <option value="Token">رمز اعتماد أو جلسة (Bearer / Access Token)</option>
                  <option value="Security Questions">أسئلة الأمان والإجابات السرية (Security Questions & Answers)</option>
                  <option value="Client Secret">سر العميل (OAuth Client Secret)</option>
                  <option value="Private Key">مفتاح خاص أو شهادة (SSH / SSL Private Key)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  قيمة السر (Secret Value) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="أدخل السر المراد تشفيره في الخزنة..."
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  تاريخ استحقاق التدوير (Rotation Due) - اختياري
                </label>
                <input
                  type="date"
                  value={rotationDue}
                  onChange={(e) => setRotationDue(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSecretModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري التشفير والحفظ..." : "حفظ في الخزنة المشفرة"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Rotate Secret */}
        {showRotateModal && (
          <Modal
            isOpen={showRotateModal}
            onClose={() => setShowRotateModal(false)}
            title="تدوير وتحديث السر في الخزنة المشفرة"
          >
            <form onSubmit={handleConfirmRotate} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300">
                سيتم استبدال قيمة السر القديمة بالقيمة الجديدة في HashiCorp Vault وتحديث تاريخ التدوير.
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  قيمة السر الجديدة (New Secret Value) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="أدخل السر الجديد..."
                  value={newRotateValue}
                  onChange={(e) => setNewRotateValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  تأكيد كلمة مرور حسابك (Re-authentication) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="أدخل كلمة مرور حسابك..."
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRotateModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري التدوير..." : "تأكيد تدوير السر"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Grant Permission */}
        {showGrantPermModal && (
          <Modal
            isOpen={showGrantPermModal}
            onClose={() => setShowGrantPermModal(false)}
            title="منح صلاحية وصول لمستخدم"
          >
            <form onSubmit={handleGrantPermission} className="space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  المستخدم *
                </label>
                <select
                  required
                  value={permUserId}
                  onChange={(e) => setPermUserId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="">اختر المستخدم...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.employee?.full_name || u.username} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  مستوى الصلاحية *
                </label>
                <select
                  value={permAccessLevel}
                  onChange={(e) => setPermAccessLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="Viewer">مشاهد فقط (Viewer)</option>
                  <option value="Editor">محرر (Editor)</option>
                  <option value="Admin">مدير (Admin)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface-2)] dark:bg-slate-800/50 border border-[var(--border)] dark:border-slate-700">
                <input
                  type="checkbox"
                  id="canRevealCheckbox"
                  checked={permCanReveal}
                  onChange={(e) => setPermCanReveal(e.target.checked)}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="canRevealCheckbox" className="text-xs font-semibold text-[var(--text)] dark:text-slate-200 cursor-pointer">
                  السماح بكشف وعرض أسرار الخزنة (Reveal Secrets)
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-2)] dark:text-slate-300 mb-1">
                  تاريخ انتهاء الصلاحية (اختياري)
                </label>
                <input
                  type="date"
                  value={permExpiresAt}
                  onChange={(e) => setPermExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] dark:border-slate-700 bg-[var(--surface)] dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGrantPermModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? "جاري الحفظ..." : "منح الصلاحية"}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
