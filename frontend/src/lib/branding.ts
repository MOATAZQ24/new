/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

export interface BrandConfig {
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  shortCode: string;
  logoBadgeUrl?: string;
  supportEmail: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

/**
 * Centralized Brand Configuration
 * The visual identity is configured here in a single location, allowing the entire
 * system branding to be updated or replaced without altering module logic.
 */
export const DEFAULT_BRAND: BrandConfig = {
  nameAr: "بوابة المستثمر",
  nameEn: "Investor Gate OS",
  taglineAr: "نظام إدارة عمليات وتقنية المعلومات للمنشآت",
  taglineEn: "Enterprise IT Operations & Asset Management Platform",
  shortCode: "IGOS",
  supportEmail: "support@investorgate.sa",
  primaryColor: "#078363",
  secondaryColor: "#123D32",
  accentColor: "#C5A46D",
};

export function getActiveBrand(customOverrides?: Partial<BrandConfig>): BrandConfig {
  return {
    ...DEFAULT_BRAND,
    ...customOverrides,
  };
}
