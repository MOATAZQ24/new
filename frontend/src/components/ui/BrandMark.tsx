"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { BrandSymbol } from "./brand-logo";

interface BrandMarkProps {
  className?: string;
  size?: number;
  variant?: "dark-bg" | "light-bg" | "gold-badge";
  alt?: string;
}

export function BrandMark({
  className = "",
  size = 36,
  variant = "light-bg",
  alt = "بوابة المستثمر — Investor Gate",
}: BrandMarkProps) {
  const tone = variant === "dark-bg" ? "reversed" : "color";
  return <BrandSymbol size={size} tone={tone} label={alt} className={className} />;
}
