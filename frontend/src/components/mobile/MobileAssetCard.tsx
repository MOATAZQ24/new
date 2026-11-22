"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";
import {
  Laptop,
  Printer,
  Wifi,
  Monitor,
  Wrench,
  Check,
  X,
  ChevronLeft,
  MapPin,
  Layers,
} from "lucide-react";

interface MobileAssetCardProps {
  asset: {
    id: string;
    asset_code: string;
    asset_name: string;
    brand?: string;
    model?: string;
    asset_type: string;
    serial_number?: string;
    status: string;
    assigned_employee_name?: string;
    company_name?: string;
    branch_name?: string;
    location_name?: string;
  };
  onClick: () => void;
  onCopySerial?: (serial: string) => void;
  copiedSerial?: string | null;
  onShowQr?: () => void;
  onCustodyAction?: () => void;
}

function getDeviceIcon(asset: { asset_type?: string; asset_name?: string; model?: string }) {
  const t = ((asset.asset_type || "") + " " + (asset.asset_name || "") + " " + (asset.model || "")).toLowerCase();
  if (t.includes("print") || t.includes("طابع")) return Printer;
  if (t.includes("شبك") || t.includes("راوتر") || t.includes("unifi") || t.includes("switch") || t.includes("router"))
    return Wifi;
  if (t.includes("مكتب") || t.includes("desktop") || t.includes("optiplex") || t.includes("شاش") || t.includes("pc"))
    return Monitor;
  if (t.includes("لابتوب") || t.includes("laptop") || t.includes("thinkpad") || t.includes("كمبيوتر"))
    return Laptop;
  return Layers;
}

export function MobileAssetCard({
  asset,
  onClick,
}: MobileAssetCardProps) {
  // Status Meta matching Reference Image 5 (فعالة, قيد الصيانة, معطلة, منقولة)
  const getStatusMeta = () => {
    const s = (asset.status || "").toLowerCase();
    if (s.includes("maint") || s.includes("صيان")) {
      return {
        label: "قيد الصيانة",
        pillClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
        icon: Wrench,
      };
    }
    if (s.includes("damag") || s.includes("عطل") || s.includes("معطل") || s.includes("disabl") || s.includes("retir")) {
      return {
        label: "معطلة",
        pillClass: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400",
        icon: X,
      };
    }
    if (s.includes("trans") || s.includes("منقول")) {
      return {
        label: "منقولة",
        pillClass: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
        icon: Check,
      };
    }
    return {
      label: "فعالة",
      pillClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
      icon: Check,
    };
  };

  const statusMeta = getStatusMeta();
  const StatusIcon = statusMeta.icon;

  // Friendly location: Branch / Location / Company
  const locationLabel =
    asset.location_name ||
    (asset.branch_name ? `الرياض - ${asset.branch_name}` : "الرياض - الإدارة العامة");

  const displayName = [asset.brand, asset.model].filter(Boolean).join(" ") || asset.asset_name;

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xs p-4 hover:border-primary/40 transition active:scale-[0.99] cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Right side (RTL): Device Icon/Visual + Title + Type + Location */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700/60 flex items-center justify-center shrink-0">
            {React.createElement(getDeviceIcon(asset), { size: 24, strokeWidth: 1.8 })}
          </div>

          <div className="min-w-0 text-right">
            <h3 dir="auto" className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {displayName}
            </h3>

            {/* Type with icon */}
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              {React.createElement(getDeviceIcon(asset), { size: 12, className: "text-slate-400 shrink-0" })}
              <span>{asset.asset_type || "جهاز تقني"}</span>
            </div>

            {/* Location with MapPin icon */}
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
              <MapPin size={12} className="text-slate-400 shrink-0" />
              <span className="truncate">{locationLabel}</span>
            </div>
          </div>
        </div>

        {/* Left side (RTL): Status badge with icon + Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusMeta.pillClass}`}
          >
            <StatusIcon size={12} strokeWidth={2.5} className="shrink-0" />
            <span>{statusMeta.label}</span>
          </div>

          <ChevronLeft size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
        </div>
      </div>
    </div>
  );
}
