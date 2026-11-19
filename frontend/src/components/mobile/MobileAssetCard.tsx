"use client";

import React from "react";
import {
  Laptop,
  Copy,
  Check,
  QrCode,
  UserCheck,
  ChevronLeft,
  Tag,
  Building2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";

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
  };
  onClick: () => void;
  onCopySerial?: (serial: string) => void;
  copiedSerial?: string | null;
  onShowQr?: () => void;
  onCustodyAction?: () => void;
}

export function MobileAssetCard({
  asset,
  onClick,
  onCopySerial,
  copiedSerial,
  onShowQr,
  onCustodyAction,
}: MobileAssetCardProps) {
  const isSerialCopied = copiedSerial === asset.serial_number;

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 p-4 shadow-2xs hover:border-[#187A5A] transition active:scale-[0.99] cursor-pointer space-y-3"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Header: Asset Code + Type + Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            dir="ltr"
            className="font-mono font-bold text-xs text-[#187A5A] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800 px-2 py-0.5 rounded-lg"
          >
            {asset.asset_code}
          </span>
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg">
            {asset.asset_type}
          </span>
        </div>

        <StatusBadge status={asset.status} />
      </div>

      {/* Asset Name & Brand/Model */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
          {asset.asset_name}
        </h3>
        {(asset.brand || asset.model) && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {[asset.brand, asset.model].filter(Boolean).join(" ")}
          </p>
        )}
      </div>

      {/* Serial Number & Custody Assignment */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
        {/* Serial Number with One-Tap Copy */}
        {asset.serial_number && (
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 rounded-xl px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] text-slate-400">S/N:</span>
              <span
                dir="ltr"
                className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-bold truncate"
              >
                {asset.serial_number}
              </span>
            </div>

            {onCopySerial && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopySerial(asset.serial_number!);
                }}
                className="p-1 text-slate-400 hover:text-[#187A5A] dark:hover:text-emerald-400 transition cursor-pointer shrink-0"
                title="نسخ الرقم التسلسلي"
              >
                {isSerialCopied ? (
                  <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    تم النسخ!
                  </span>
                ) : (
                  <Copy size={13} />
                )}
              </button>
            )}
          </div>
        )}

        {/* Assigned Employee or In-Stock Status */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">العهدة والموقع:</span>
          {asset.assigned_employee_name ? (
            <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <UserCheck size={13} />
              <span>{asset.assigned_employee_name}</span>
            </span>
          ) : (
            <span className="font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
              في المستودع (متاح)
            </span>
          )}
        </div>
      </div>

      {/* Footer: Quick Action Buttons */}
      <div
        className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          {onShowQr && (
            <button
              type="button"
              onClick={onShowQr}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
            >
              <QrCode size={13} />
              <span>QR</span>
            </button>
          )}

          {onCustodyAction && (
            <button
              type="button"
              onClick={onCustodyAction}
              className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[#187A5A] dark:text-emerald-400 text-xs font-semibold flex items-center gap-1 hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
            >
              <UserCheck size={13} />
              <span>{asset.assigned_employee_name ? "استرجاع / تحويل" : "صرف عهدة"}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClick}
          className="text-xs font-bold text-[#187A5A] dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
        >
          <span>التفاصيل</span>
          <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  );
}
