"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React from "react";

interface BrandMarkProps {
  className?: string;
  size?: number;
  variant?: "dark-bg" | "light-bg" | "gold-badge";
  alt?: string;
}

/**
 * Investor Gate architectural monogram combining the emerald gateway pillars
 * and subtle gold accent (#C5A46D) aligned with the enterprise brand system.
 */
export function BrandMark({
  className = "",
  size = 40,
  variant = "gold-badge",
  alt = "Investor Gate",
}: BrandMarkProps) {
  const bg =
    variant === "gold-badge"
      ? "var(--accent, #C5A46D)"
      : variant === "dark-bg"
        ? "var(--sidebar-background, #123D32)"
        : "var(--card, #FFFFFF)";
  const strokePrimary =
    variant === "gold-badge"
      ? "var(--sidebar-background, #123D32)"
      : variant === "dark-bg"
        ? "#FFFFFF"
        : "var(--sidebar-background, #123D32)";
  const accentGold = variant === "gold-badge" ? "var(--accent-foreground, #0B2921)" : "var(--accent, #C5A46D)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={alt}
      className={className}
    >
      <rect width="40" height="40" rx="10" fill={bg} />
      {/* Architectural pillars & rising gate silhouette */}
      <path
        d="M10 30V16.5L15 13V30H10Z"
        fill={strokePrimary}
      />
      <path
        d="M17.5 30V10L22.5 7.5V30H17.5Z"
        fill={strokePrimary}
      />
      <path
        d="M25 30V14L30 17.5V30H25Z"
        fill={accentGold}
      />
      {/* Base horizon line */}
      <rect x="8" y="31.5" width="24" height="2" rx="1" fill={strokePrimary} opacity="0.85" />
    </svg>
  );
}
