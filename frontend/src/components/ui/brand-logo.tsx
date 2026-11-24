"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";

export type BrandLogoVariant = "symbol" | "horizontal" | "stacked";
export type BrandLogoTone = "color" | "monochrome" | "reversed";

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  size?: number;
  loading?: boolean;
  className?: string;
  label?: string;
}

/**
 * Approved Investor Gate Original SVG Mark — Direction A ("The Rising Threshold" / العتبة الصاعدة).
 */
export function BrandSymbol({
  size = 32,
  tone = "color",
  loading = false,
  className = "",
  label = "بوابة المستثمر — Investor Gate",
}: {
  size?: number;
  tone?: BrandLogoTone;
  loading?: boolean;
  className?: string;
  label?: string;
}) {
  const primaryFill =
    tone === "reversed"
      ? "#FFFFFF"
      : tone === "monochrome"
        ? "currentColor"
        : "var(--primary, #0E5A63)";

  const accentFill =
    tone === "reversed"
      ? "#FFFFFF"
      : tone === "monochrome"
        ? "currentColor"
        : "var(--accent, #2563EB)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      className={`shrink-0 ${className}`}
    >
      <path
        d="M5 27V14C5 9.02944 9.02944 5 14 5H16.5V9.5H14C11.5147 9.5 9.5 11.5147 9.5 14V27H5Z"
        fill={primaryFill}
      />
      <path
        d="M22.5 27V10.5L19.5 8.5V4L27 8.5V27H22.5Z"
        fill={primaryFill}
      />
      <path
        d="M13 18.2L19 14.8V19L13 22.4V18.2Z"
        fill={accentFill}
        className={loading ? "ig-loading-keystone" : undefined}
      />
    </svg>
  );
}

export function BrandLogo({
  variant = "horizontal",
  tone = "color",
  size = 32,
  loading = false,
  className = "",
  label = "بوابة المستثمر — Investor Gate",
}: BrandLogoProps) {
  if (variant === "symbol") {
    return (
      <BrandSymbol
        size={size}
        tone={tone}
        loading={loading}
        className={className}
        label={label}
      />
    );
  }

  const titleColor =
    tone === "reversed"
      ? "text-white"
      : tone === "monochrome"
        ? "text-current"
        : "text-[var(--text)]";
  const subtitleColor =
    tone === "reversed"
      ? "text-white/90"
      : tone === "monochrome"
        ? "text-current opacity-80"
        : "text-[var(--text-2)]";

  if (variant === "stacked") {
    return (
      <div
        className={`inline-flex flex-col items-center gap-2.5 select-none ${className}`}
        aria-label={label}
      >
        <BrandSymbol size={size} tone={tone} loading={loading} label={label} />
        <div className="flex flex-col items-center leading-tight text-center">
          <span className={`text-[17px] font-semibold tracking-[-0.015em] ${titleColor}`}>
            بوابة المستثمر
          </span>
          <span
            dir="ltr"
            className={`mt-0.5 text-[10.5px] font-medium tracking-[0.12em] uppercase ${subtitleColor}`}
          >
            INVESTOR GATE
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap ${className}`}
      aria-label={label}
    >
      <BrandSymbol size={size} tone={tone} loading={loading} label={label} />
      <div className="flex flex-col leading-[1.2] text-start">
        <span className={`text-[15px] font-semibold tracking-[-0.015em] ${titleColor}`}>
          بوابة المستثمر
        </span>
        <span
          dir="ltr"
          className={`mt-0.5 text-[10px] font-medium tracking-[0.10em] uppercase ${subtitleColor}`}
        >
          INVESTOR GATE
        </span>
      </div>
    </div>
  );
}

export function BrandLoadingMark({
  size = 40,
  label = "جارٍ التحميل...",
  className = "",
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex flex-col items-center justify-center gap-2 ${className}`}
    >
      <BrandSymbol size={size} tone="color" loading label={label} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default BrandLogo;
