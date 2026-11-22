"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useState } from "react";
import {
  X,
  Maximize2,
  Copy,
  Check,
  QrCode,
  Laptop,
  User,
  Building,
  Calendar,
  Clock,
  ArrowRightLeft,
  RotateCcw,
  Edit,
  Trash2,
  FileText,
  ShieldAlert,
  Info,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";

export interface CustodyMovement {
  id: string;
  employee_name: string;
  assignment_date: string;
  actual_return_date?: string | null;
  status: string;
}

export interface SplitDrawerAsset {
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
  custody_history?: CustodyMovement[];
}

interface AssetsSplitDrawerProps {
  asset: SplitDrawerAsset | null;
  onClose: () => void;
  onOpenHandover?: (asset: SplitDrawerAsset) => void;
  onOpenReturn?: (asset: SplitDrawerAsset) => void;
  onOpenTransfer?: (asset: SplitDrawerAsset) => void;
  onOpenEdit?: (asset: SplitDrawerAsset) => void;
  onOpenQR?: (asset: SplitDrawerAsset) => void;
  onOpenReceipt?: (custodyId: string) => void;
  onDelete?: (id: string, code: string) => void;
  canManage?: boolean;
  className?: string;
}

export function AssetsSplitDrawer({
  asset,
  onClose,
  onOpenHandover,
  onOpenReturn,
  onOpenTransfer,
  onOpenEdit,
  onOpenQR,
  onOpenReceipt,
  onDelete,
  canManage = false,
  className = "",
}: AssetsSplitDrawerProps) {
  const [copiedSerial, setCopiedSerial] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  if (!asset) return null;

  const copyToClipboard = (text: string, type: "serial" | "code") => {
    navigator.clipboard.writeText(text);
    if (type === "serial") {
      setCopiedSerial(true);
      setTimeout(() => setCopiedSerial(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const isAssigned = Boolean(asset.assigned_employee_name);

  return (
    <div
      dir="rtl"
      className={`w-full bg-card border border-border/80 rounded-2xl shadow-xs flex flex-col h-full overflow-hidden text-right transition-all animate-in fade-in duration-200 ${className}`}
    >
      {/* 1. Header Toolbar */}
      <div className="p-3.5 border-b border-border/80 flex items-center justify-between gap-2 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            title="إغلاق اللوحة الجانبية"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
          {onOpenQR && (
            <button
              type="button"
              onClick={() => onOpenQR(asset)}
              title="عرض رمز QR للأصل"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            >
              <QrCode size={15} />
              <span className="hidden sm:inline">QR</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground font-semibold">
            {asset.asset_code}
          </span>
          <StatusBadge status={asset.status} />
        </div>
      </div>

      {/* 2. Top Summary Card */}
      <div className="p-4 border-b border-border/60 shrink-0 bg-background/50 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-foreground leading-tight">
              {asset.asset_name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Laptop size={13} className="text-primary" />
                <span>{asset.asset_type}</span>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Building size={13} className="text-muted-foreground" />
                <span>{asset.branch_name || "الفرع غير محدد"}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => copyToClipboard(asset.asset_code, "code")}
            title="نسخ كود الأصل"
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 cursor-pointer transition shrink-0"
          >
            {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
            <span className="font-mono text-[10px]">{asset.asset_code}</span>
          </button>
        </div>

        {/* Custody Assignment Snapshot */}
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
          isAssigned
            ? "bg-purple-500/10 border-purple-500/20 text-purple-900 dark:text-purple-200"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isAssigned ? "bg-purple-500/20 text-primary" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            }`}>
              <User size={16} />
            </div>
            <div className="min-w-0 truncate">
              <div className="text-[10px] opacity-75 font-medium">حالة العهدة الحالية</div>
              <div className="font-bold truncate">
                {isAssigned ? asset.assigned_employee_name : "الأصل متوفر في المستودع (غير مسلّم)"}
              </div>
            </div>
          </div>

          {canManage && (
            <div className="shrink-0">
              {isAssigned ? (
                onOpenReturn && (
                  <button
                    type="button"
                    onClick={() => onOpenReturn(asset)}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw size={12} />
                    <span>استرجاع</span>
                  </button>
                )
              ) : (
                onOpenHandover && (
                  <button
                    type="button"
                    onClick={() => onOpenHandover(asset)}
                    className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[11px] shadow-2xs transition cursor-pointer flex items-center gap-1"
                  >
                    <ArrowRightLeft size={12} />
                    <span>تسليم عهدة</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="px-4 border-b border-border/80 flex items-center gap-4 text-xs font-bold shrink-0 bg-card">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          المواصفات والبيانات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>سجل العهدة</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted font-mono">
            {asset.custody_history?.length || 0}
          </span>
        </button>
      </div>

      {/* 4. Tab Content (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "overview" ? (
          <div className="space-y-4 text-xs">
            {/* Technical Specifications Grid */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-3">
              <h3 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <Info size={14} className="text-primary" />
                <span>البيانات والمواصفات الفنية</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">الماركة / المصنع:</span>
                  <span className="font-semibold text-foreground">{asset.brand || "غير محدد"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">الموديل:</span>
                  <span className="font-semibold text-foreground">{asset.model || "غير محدد"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">حالة العتاد:</span>
                  <span className="font-semibold text-foreground">{asset.condition || "جيد"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">التصنيف:</span>
                  <span className="font-semibold text-foreground">{asset.asset_category || asset.asset_type}</span>
                </div>
              </div>

              {/* Serial Number with Instant Copy */}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground block text-[11px]">الرقم التسلسلي (Serial Number):</span>
                  <span className="font-mono font-bold text-foreground">
                    {asset.serial_number || "غير مسجل"}
                  </span>
                </div>
                {asset.serial_number && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(asset.serial_number!, "serial")}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 cursor-pointer transition"
                    title="نسخ الرقم التسلسلي"
                  >
                    {copiedSerial ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    <span className="text-[10px]">نسخ</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notes Section if any */}
            {asset.notes && (
              <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-bold block">ملاحظات إضافية:</span>
                <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">
                  {asset.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Movement History List */
          <div className="space-y-3">
            {asset.custody_history && asset.custody_history.length > 0 ? (
              <div className="space-y-2">
                {asset.custody_history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-muted/20 hover:bg-muted/40 border border-border/70 rounded-xl flex items-center justify-between text-xs transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-foreground truncate">{h.employee_name}</div>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
                        <span>تسليم: {new Date(h.assignment_date).toLocaleDateString("ar-SA")}</span>
                        {h.actual_return_date && (
                          <span>• إرجاع: {new Date(h.actual_return_date).toLocaleDateString("ar-SA")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={h.status} />
                      {onOpenReceipt && (
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(h.id)}
                          className="px-2 py-1 rounded-lg border border-border hover:border-primary text-muted-foreground hover:text-foreground text-[10px] font-semibold cursor-pointer transition"
                        >
                          السند
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-border rounded-xl text-muted-foreground text-xs space-y-2">
                <Clock size={24} className="mx-auto text-muted-foreground/60" />
                <p>لا يوجد سجل حركة تسليم أو استرجاع سابقة لهذا الأصل.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Bottom Quick Actions Toolbar */}
      {canManage && (
        <div className="p-3 border-t border-border/80 bg-muted/20 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {onOpenEdit && (
              <button
                type="button"
                onClick={() => onOpenEdit(asset)}
                className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Edit size={13} className="text-primary" />
                <span>تعديل</span>
              </button>
            )}
            {onOpenTransfer && (
              <button
                type="button"
                onClick={() => onOpenTransfer(asset)}
                className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Building size={13} className="text-muted-foreground" />
                <span>نقل فرع</span>
              </button>
            )}
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(asset.id, asset.asset_code)}
              className="p-2 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
              title="حذف الأصل"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
