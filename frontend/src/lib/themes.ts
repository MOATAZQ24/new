/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

export type ThemePresetId =
  | "petrol"
  | "emerald"
  | "electric-blue"
  | "royal-purple"
  | "executive-gold"
  | "crimson-power"
  | "graphite-teal";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeTokenSet {
  background: string;
  foreground: string;
  surface: string;
  "surface-muted": string;
  "surface-elevated": string;
  card: string;
  "card-foreground": string;
  "sidebar-background": string;
  "sidebar-foreground": string;
  "sidebar-active": string;
  "header-background": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  accent: string;
  "accent-foreground": string;
  muted: string;
  "muted-foreground": string;
  border: string;
  input: string;
  ring: string;
  hover: string;
  selected: string;
  popover: string;
  "chart-1": string;
  "chart-2": string;
  "chart-3": string;
  "chart-4": string;
  "chart-5": string;
  success: string;
  warning: string;
  destructive: string;
  info: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  nameAr: string;
  nameEn: string;
  lightName: string;
  darkName: string;
  descriptionAr: string;
  /** Canonical signature persisted in /api/v1/workspace Appearance */
  signature: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
  };
  light: ThemeTokenSet;
  dark: ThemeTokenSet;
}

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "petrol";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "petrol",
    nameAr: "بوابة المستثمر — الأزرق والرمادي الهادئ (المعتمد)",
    nameEn: "Investor Gate — Enterprise Slate & Subtle Blue (Default)",
    lightName: "Neutral Slate",
    darkName: "Deep Slate Ink",
    descriptionAr: "الهوية البصرية الهادئة المعتمدة لـ Investor Gate OS: رمادي ناعم ولمسات زرقاء رصينة بتباين WCAG 2.2 AA",
    signature: {
      primary: "#2563EB",
      secondary: "#1D4ED8",
      accent: "#3B82F6",
      background: "#F8FAFC",
      surface: "#FFFFFF",
    },
    light: {
      background: "#F8FAFC",
      foreground: "#0F172A",
      surface: "#FFFFFF",
      "surface-muted": "#F1F5F9",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#0F172A",
      "sidebar-background": "#FFFFFF",
      "sidebar-foreground": "#0F172A",
      "sidebar-active": "#2563EB",
      "header-background": "#FFFFFF",
      primary: "#2563EB",
      "primary-foreground": "#FFFFFF",
      secondary: "#1D4ED8",
      accent: "#3B82F6",
      "accent-foreground": "#FFFFFF",
      muted: "#F1F5F9",
      "muted-foreground": "#475569",
      border: "#E2E8F0",
      input: "#FFFFFF",
      ring: "#2563EB",
      hover: "#F1F5F9",
      selected: "#EFF6FF",
      popover: "#FFFFFF",
      "chart-1": "#2563EB",
      "chart-2": "#0284C7",
      "chart-3": "#6366F1",
      "chart-4": "#0D9488",
      "chart-5": "#64748B",
      success: "#0284C7",
      warning: "#6366F1",
      destructive: "#E11D48",
      info: "#2563EB",
    },
    dark: {
      background: "#0B0F17",
      foreground: "#F8FAFC",
      surface: "#111827",
      "surface-muted": "#1F2937",
      "surface-elevated": "#374151",
      card: "#111827",
      "card-foreground": "#F8FAFC",
      "sidebar-background": "#111827",
      "sidebar-foreground": "#F8FAFC",
      "sidebar-active": "#3B82F6",
      "header-background": "#111827",
      primary: "#3B82F6",
      "primary-foreground": "#FFFFFF",
      secondary: "#1F2937",
      accent: "#60A5FA",
      "accent-foreground": "#0B0F17",
      muted: "#1F2937",
      "muted-foreground": "#94A3B8",
      border: "#1F2937",
      input: "#1F2937",
      ring: "#3B82F6",
      hover: "#1F2937",
      selected: "#1E293B",
      popover: "#111827",
      "chart-1": "#60A5FA",
      "chart-2": "#38BDF8",
      "chart-3": "#818CF8",
      "chart-4": "#2DD4BF",
      "chart-5": "#94A3B8",
      success: "#38BDF8",
      warning: "#818CF8",
      destructive: "#FB7185",
      info: "#60A5FA",
    },
  },
  {
    id: "royal-purple",
    nameAr: "الأرجواني الملكي (المعتمد)",
    nameEn: "Royal Purple (Approved)",
    lightName: "Lavender Pearl",
    darkName: "Obsidian Purple",
    descriptionAr: "الهوية الملكية المعتمدة لـ Investor Gate OS مع شريط داكن وأرجواني متألق",
    signature: {
      primary: "#131127",
      secondary: "#7C3AED",
      accent: "#8B5CF6",
      background: "#F7F8FC",
      surface: "#FFFFFF",
    },
    light: {
      background: "#F7F8FC",
      foreground: "#131127",
      surface: "#FFFFFF",
      "surface-muted": "#F3F4F9",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#131127",
      "sidebar-background": "#131127",
      "sidebar-foreground": "#FFFFFF",
      "sidebar-active": "#7C3AED",
      "header-background": "#FFFFFF",
      primary: "#7C3AED",
      "primary-foreground": "#FFFFFF",
      secondary: "#131127",
      accent: "#8B5CF6",
      "accent-foreground": "#FFFFFF",
      muted: "#F3F4F9",
      "muted-foreground": "#64748B",
      border: "#E5E7EB",
      input: "#F8FAFC",
      ring: "#7C3AED",
      hover: "#F1F5F9",
      selected: "#EDE9FE",
      popover: "#FFFFFF",
      "chart-1": "#7C3AED",
      "chart-2": "#131127",
      "chart-3": "#8B5CF6",
      "chart-4": "#6366F1",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#090D16",
      foreground: "#F1F5F9",
      surface: "#111827",
      "surface-muted": "#172033",
      "surface-elevated": "#1C273E",
      card: "#111827",
      "card-foreground": "#F1F5F9",
      "sidebar-background": "#0C0E1B",
      "sidebar-foreground": "#F1F5F9",
      "sidebar-active": "#7C3AED",
      "header-background": "#111827",
      primary: "#8B5CF6",
      "primary-foreground": "#FFFFFF",
      secondary: "#6D28D9",
      accent: "#A78BFA",
      "accent-foreground": "#090D16",
      muted: "#172033",
      "muted-foreground": "#94A3B8",
      border: "#222E42",
      input: "#151E30",
      ring: "#8B5CF6",
      hover: "#1C273E",
      selected: "#241E47",
      popover: "#131C2E",
      "chart-1": "#A78BFA",
      "chart-2": "#8B5CF6",
      "chart-3": "#7C3AED",
      "chart-4": "#6366F1",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#38BDF8",
    },
  },
  {
    id: "emerald",
    nameAr: "الزمرد النخبوي",
    nameEn: "Emerald Elite",
    lightName: "Pearl Emerald",
    darkName: "Emerald Obsidian",
    descriptionAr: "الهوية المؤسسية الخضراء الهادئة مع عمق زمردي فاخر",
    signature: {
      primary: "#0B3B2E",
      secondary: "#087F5B",
      accent: "#3B82F6",
      background: "#F6FAF8",
      surface: "#FFFFFF",
    },
    light: {
      background: "#F6FAF8",
      foreground: "#0F241D",
      surface: "#FFFFFF",
      "surface-muted": "#EAF3EF",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#0F241D",
      "sidebar-background": "#0B3B2E",
      "sidebar-foreground": "#F0FDF7",
      "sidebar-active": "#087F5B",
      "header-background": "#FFFFFF",
      primary: "#087F5B",
      "primary-foreground": "#FFFFFF",
      secondary: "#0B3B2E",
      accent: "#3B82F6",
      "accent-foreground": "#0B2921",
      muted: "#EAF3EF",
      "muted-foreground": "#435C53",
      border: "#D5E8DE",
      input: "#F1F7F4",
      ring: "#087F5B",
      hover: "#E4F1EB",
      selected: "#DCF2E8",
      popover: "#FFFFFF",
      "chart-1": "#087F5B",
      "chart-2": "#0B3B2E",
      "chart-3": "#3B82F6",
      "chart-4": "#0F766E",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#09110E",
      foreground: "#F1FBF7",
      surface: "#0F1E19",
      "surface-muted": "#152A23",
      "surface-elevated": "#1C362D",
      card: "#0F1E19",
      "card-foreground": "#F1FBF7",
      "sidebar-background": "#060D0A",
      "sidebar-foreground": "#F1FBF7",
      "sidebar-active": "#059669",
      "header-background": "#0F1E19",
      primary: "#10B981",
      "primary-foreground": "#031A13",
      secondary: "#059669",
      accent: "#34D399",
      "accent-foreground": "#031A13",
      muted: "#152A23",
      "muted-foreground": "#8EAEA3",
      border: "#1E3A31",
      input: "#12241E",
      ring: "#10B981",
      hover: "#183028",
      selected: "#103B2E",
      popover: "#0F1E19",
      "chart-1": "#34D399",
      "chart-2": "#10B981",
      "chart-3": "#3B82F6",
      "chart-4": "#059669",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#38BDF8",
    },
  },
  {
    id: "electric-blue",
    nameAr: "الأزرق الكهربائي",
    nameEn: "Electric Blue",
    lightName: "Arctic Blue",
    darkName: "Cobalt Obsidian",
    descriptionAr: "لؤلؤي أزرق صافي للنهار وأزرق تقني عميق مريح للعين ليلاً",
    signature: {
      primary: "#0F2A5E",
      secondary: "#2563EB",
      accent: "#00B8FF",
      background: "#F4F8FF",
      surface: "#FFFFFF",
    },
    light: {
      background: "#F4F8FF",
      foreground: "#0F1E3D",
      surface: "#FFFFFF",
      "surface-muted": "#E8F0FF",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#0F1E3D",
      "sidebar-background": "#0F2A5E",
      "sidebar-foreground": "#EFF6FF",
      "sidebar-active": "#2563EB",
      "header-background": "#FFFFFF",
      primary: "#2563EB",
      "primary-foreground": "#FFFFFF",
      secondary: "#0F2A5E",
      accent: "#0284C7",
      "accent-foreground": "#FFFFFF",
      muted: "#E8F0FF",
      "muted-foreground": "#475B80",
      border: "#D3E2FF",
      input: "#EFF5FF",
      ring: "#2563EB",
      hover: "#E2ECFF",
      selected: "#DBEAFE",
      popover: "#FFFFFF",
      "chart-1": "#2563EB",
      "chart-2": "#0F2A5E",
      "chart-3": "#0284C7",
      "chart-4": "#3B82F6",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#090D16",
      foreground: "#F1F5F9",
      surface: "#0F172A",
      "surface-muted": "#16223B",
      "surface-elevated": "#1E2D4C",
      card: "#0F172A",
      "card-foreground": "#F1F5F9",
      "sidebar-background": "#070A12",
      "sidebar-foreground": "#F1F5F9",
      "sidebar-active": "#2563EB",
      "header-background": "#0F172A",
      primary: "#3B82F6",
      "primary-foreground": "#FFFFFF",
      secondary: "#1D4ED8",
      accent: "#60A5FA",
      "accent-foreground": "#04152E",
      muted: "#16223B",
      "muted-foreground": "#8EA5C8",
      border: "#1E2E4A",
      input: "#121C33",
      ring: "#3B82F6",
      hover: "#1A2846",
      selected: "#153066",
      popover: "#0F172A",
      "chart-1": "#60A5FA",
      "chart-2": "#3B82F6",
      "chart-3": "#2563EB",
      "chart-4": "#1D4ED8",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#38BDF8",
    },
  },
  {
    id: "executive-gold",
    nameAr: "الذهبي التنفيذي",
    nameEn: "Executive Gold",
    lightName: "Champagne Ivory",
    darkName: "Executive Obsidian",
    descriptionAr: "عاجي دافئ بلمسات ذهبية تنفيذية فخمة ومريح للعين ليلاً",
    signature: {
      primary: "#3D2A09",
      secondary: "#9A6314",
      accent: "#D49A22",
      background: "#FFFCF5",
      surface: "#FFFFFF",
    },
    light: {
      background: "#FFFCF5",
      foreground: "#261A06",
      surface: "#FFFFFF",
      "surface-muted": "#F8F0DF",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#261A06",
      "sidebar-background": "#3B2809",
      "sidebar-foreground": "#FFF8EB",
      "sidebar-active": "#9A6314",
      "header-background": "#FFFFFF",
      primary: "#9A6314",
      "primary-foreground": "#FFFFFF",
      secondary: "#3B2809",
      accent: "#B7791F",
      "accent-foreground": "#FFFFFF",
      muted: "#F8F0DF",
      "muted-foreground": "#66502C",
      border: "#E9D7B7",
      input: "#FAF4E6",
      ring: "#B7791F",
      hover: "#F5EAD2",
      selected: "#F2E2C2",
      popover: "#FFFFFF",
      "chart-1": "#B7791F",
      "chart-2": "#3B2809",
      "chart-3": "#D49A22",
      "chart-4": "#854D0E",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#0C0C10",
      foreground: "#FDFBF7",
      surface: "#14141A",
      "surface-muted": "#1D1C26",
      "surface-elevated": "#262533",
      card: "#14141A",
      "card-foreground": "#FDFBF7",
      "sidebar-background": "#09090C",
      "sidebar-foreground": "#FDFBF7",
      "sidebar-active": "#D97706",
      "header-background": "#14141A",
      primary: "#F59E0B",
      "primary-foreground": "#171004",
      secondary: "#D97706",
      accent: "#FBBF24",
      "accent-foreground": "#171004",
      muted: "#1D1C26",
      "muted-foreground": "#A8A399",
      border: "#2B293A",
      input: "#181722",
      ring: "#F59E0B",
      hover: "#222030",
      selected: "#3D3017",
      popover: "#14141A",
      "chart-1": "#FBBF24",
      "chart-2": "#F59E0B",
      "chart-3": "#D97706",
      "chart-4": "#B47818",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#FBBF24",
      destructive: "#F43F5E",
      info: "#38BDF8",
    },
  },
  {
    id: "crimson-power",
    nameAr: "القرمزي القوي",
    nameEn: "Crimson Power",
    lightName: "Rose Quartz",
    darkName: "Crimson Obsidian",
    descriptionAr: "كوارتز وردي أنيق مع قرمزي داكن جريء وهادئ للعين ليلاً",
    signature: {
      primary: "#4F1025",
      secondary: "#C02655",
      accent: "#FB7185",
      background: "#FFF8FA",
      surface: "#FFFFFF",
    },
    light: {
      background: "#FFF8FA",
      foreground: "#2B0C16",
      surface: "#FFFFFF",
      "surface-muted": "#FCECF1",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#2B0C16",
      "sidebar-background": "#4F1025",
      "sidebar-foreground": "#FFF0F4",
      "sidebar-active": "#C02655",
      "header-background": "#FFFFFF",
      primary: "#C02655",
      "primary-foreground": "#FFFFFF",
      secondary: "#4F1025",
      accent: "#E11D48",
      "accent-foreground": "#FFFFFF",
      muted: "#FCECF1",
      "muted-foreground": "#6E3B4B",
      border: "#F4D5DF",
      input: "#FDF1F5",
      ring: "#C02655",
      hover: "#FAE3EB",
      selected: "#F9D6E2",
      popover: "#FFFFFF",
      "chart-1": "#C02655",
      "chart-2": "#4F1025",
      "chart-3": "#E11D48",
      "chart-4": "#FB7185",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#B91C1C",
      info: "#0284C7",
    },
    dark: {
      background: "#0E0A0D",
      foreground: "#FFF1F4",
      surface: "#181116",
      "surface-muted": "#231820",
      "surface-elevated": "#2F1F2B",
      card: "#181116",
      "card-foreground": "#FFF1F4",
      "sidebar-background": "#0A0709",
      "sidebar-foreground": "#FFF1F4",
      "sidebar-active": "#BE123C",
      "header-background": "#181116",
      primary: "#F43F5E",
      "primary-foreground": "#FFFFFF",
      secondary: "#E11D48",
      accent: "#FB7185",
      "accent-foreground": "#220812",
      muted: "#231820",
      "muted-foreground": "#B89CA4",
      border: "#34202D",
      input: "#1C131A",
      ring: "#F43F5E",
      hover: "#261A23",
      selected: "#3D1424",
      popover: "#181116",
      "chart-1": "#FB7185",
      "chart-2": "#F43F5E",
      "chart-3": "#E11D48",
      "chart-4": "#BE123C",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#FB7185",
      info: "#38BDF8",
    },
  },
  {
    id: "graphite-teal",
    nameAr: "الجرافيت والتيل",
    nameEn: "Graphite & Cyber Teal",
    lightName: "Silver Graphite",
    darkName: "Teal Obsidian",
    descriptionAr: "جرافيت فضي متوازن نهاراً وتيل تقني هادئ ليلاً",
    signature: {
      primary: "#1E293B",
      secondary: "#334155",
      accent: "#0891B2",
      background: "#F5F7FA",
      surface: "#FFFFFF",
    },
    light: {
      background: "#F5F7FA",
      foreground: "#0F172A",
      surface: "#FFFFFF",
      "surface-muted": "#E9EDF2",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#0F172A",
      "sidebar-background": "#1E293B",
      "sidebar-foreground": "#F8FAFC",
      "sidebar-active": "#334155",
      "header-background": "#FFFFFF",
      primary: "#334155",
      "primary-foreground": "#FFFFFF",
      secondary: "#1E293B",
      accent: "#0891B2",
      "accent-foreground": "#FFFFFF",
      muted: "#E9EDF2",
      "muted-foreground": "#475569",
      border: "#D4DCE5",
      input: "#EFF2F6",
      ring: "#334155",
      hover: "#E2E8F0",
      selected: "#DCE4EE",
      popover: "#FFFFFF",
      "chart-1": "#334155",
      "chart-2": "#0891B2",
      "chart-3": "#475569",
      "chart-4": "#0E7490",
      "chart-5": "#94A3B8",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0891B2",
    },
    dark: {
      background: "#090D12",
      foreground: "#F0FDF4",
      surface: "#0F1720",
      "surface-muted": "#16222E",
      "surface-elevated": "#1D2D3D",
      card: "#0F1720",
      "card-foreground": "#F0FDF4",
      "sidebar-background": "#070A0E",
      "sidebar-foreground": "#F0FDF4",
      "sidebar-active": "#0D9488",
      "header-background": "#0F1720",
      primary: "#14B8A6",
      "primary-foreground": "#FFFFFF",
      secondary: "#0F766E",
      accent: "#2DD4BF",
      "accent-foreground": "#041A1E",
      muted: "#16222E",
      "muted-foreground": "#8BA6B8",
      border: "#1E2F3E",
      input: "#121C27",
      ring: "#14B8A6",
      hover: "#1A2838",
      selected: "#13383B",
      popover: "#0F1720",
      "chart-1": "#2DD4BF",
      "chart-2": "#14B8A6",
      "chart-3": "#0D9488",
      "chart-4": "#0F766E",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#2DD4BF",
    },
  },
];

export const THEME_PRESET_MAP: Record<ThemePresetId, ThemePreset> = Object.fromEntries(
  THEME_PRESETS.map((preset) => [preset.id, preset])
) as Record<ThemePresetId, ThemePreset>;

export function isValidThemePresetId(id: unknown): id is ThemePresetId {
  return typeof id === "string" && id in THEME_PRESET_MAP;
}

/**
 * Resolves a ThemePresetId from persisted workspace Appearance hex colors,
 * supporting both new preset signatures and legacy Emerald colors (#1D4ED8 / #2563EB).
 */
export function resolveThemePresetId(
  appearance?: { primary?: string; secondary?: string; accent?: string } | null,
  fallbackId?: unknown
): ThemePresetId {
  const p = (appearance?.primary || "").toUpperCase();
  const s = (appearance?.secondary || "").toUpperCase();

  // Upgrade legacy pre-redesign default palettes cleanly to the canonical Petrol & Warm Paper system
  if (
    (p === "#131127" && s === "#7C3AED") ||
    (p === "#1D4ED8" && s === "#2563EB") ||
    (p === "#0E5A63")
  ) {
    return "petrol";
  }

  for (const preset of THEME_PRESETS) {
    if (
      preset.signature.primary.toUpperCase() === p &&
      preset.signature.secondary.toUpperCase() === s
    ) {
      return preset.id;
    }
  }

  if (isValidThemePresetId(fallbackId)) {
    return fallbackId;
  }

  return DEFAULT_THEME_PRESET_ID;
}

export function getThemeTokens(presetId: ThemePresetId, isDark: boolean): ThemeTokenSet {
  const preset = THEME_PRESET_MAP[presetId] || THEME_PRESET_MAP[DEFAULT_THEME_PRESET_ID];
  return isDark ? preset.dark : preset.light;
}
