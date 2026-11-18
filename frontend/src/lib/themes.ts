export type ThemePresetId =
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

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "emerald";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "emerald",
    nameAr: "الزمرد النخبوي",
    nameEn: "Emerald Elite",
    lightName: "Pearl Emerald",
    darkName: "Emerald Elite",
    descriptionAr: "الهوية المؤسسية الخضراء الهادئة مع عمق زمردي فاخر",
    signature: {
      primary: "#0B3B2E",
      secondary: "#087F5B",
      accent: "#C5A46D",
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
      accent: "#C5A46D",
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
      "chart-3": "#C5A46D",
      "chart-4": "#0F766E",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#061F19",
      foreground: "#E6FFF5",
      surface: "#0A2C23",
      "surface-muted": "#0F3A2F",
      "surface-elevated": "#134538",
      card: "#0A2C23",
      "card-foreground": "#E6FFF5",
      "sidebar-background": "#041611",
      "sidebar-foreground": "#E6FFF5",
      "sidebar-active": "#065F46",
      "header-background": "#08251E",
      primary: "#00A878",
      "primary-foreground": "#031A13",
      secondary: "#065F46",
      accent: "#10DFA0",
      "accent-foreground": "#031A13",
      muted: "#0F3A2F",
      "muted-foreground": "#9EC5B8",
      border: "#185344",
      input: "#0E342A",
      ring: "#10DFA0",
      hover: "#124236",
      selected: "#065F46",
      popover: "#0D352B",
      "chart-1": "#10DFA0",
      "chart-2": "#00A878",
      "chart-3": "#C5A46D",
      "chart-4": "#34D399",
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
    darkName: "Electric Blue",
    descriptionAr: "لؤلؤي أزرق صافي للنهار وأزرق تقني عميق لليلي",
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
      background: "#071A38",
      foreground: "#EAF5FF",
      surface: "#0C254E",
      "surface-muted": "#103166",
      "surface-elevated": "#143C7D",
      card: "#0C254E",
      "card-foreground": "#EAF5FF",
      "sidebar-background": "#051229",
      "sidebar-foreground": "#EAF5FF",
      "sidebar-active": "#123D8A",
      "header-background": "#0A1F42",
      primary: "#2563EB",
      "primary-foreground": "#FFFFFF",
      secondary: "#123D8A",
      accent: "#00B8FF",
      "accent-foreground": "#04152E",
      muted: "#103166",
      "muted-foreground": "#A3BCE6",
      border: "#1D4991",
      input: "#0F2D5E",
      ring: "#00B8FF",
      hover: "#153D7D",
      selected: "#123D8A",
      popover: "#0E2B59",
      "chart-1": "#00B8FF",
      "chart-2": "#3B82F6",
      "chart-3": "#60A5FA",
      "chart-4": "#1D4ED8",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#00B8FF",
    },
  },
  {
    id: "royal-purple",
    nameAr: "الأرجواني الملكي",
    nameEn: "Royal Purple",
    lightName: "Lavender Pearl",
    darkName: "Royal Purple",
    descriptionAr: "لافندر لؤلؤي ناعم وبنفسجي ملكي عميق",
    signature: {
      primary: "#33176B",
      secondary: "#7C3AED",
      accent: "#C084FC",
      background: "#FAF7FF",
      surface: "#FFFFFF",
    },
    light: {
      background: "#FAF7FF",
      foreground: "#1E1238",
      surface: "#FFFFFF",
      "surface-muted": "#F0E9FF",
      "surface-elevated": "#FFFFFF",
      card: "#FFFFFF",
      "card-foreground": "#1E1238",
      "sidebar-background": "#33176B",
      "sidebar-foreground": "#F5F0FF",
      "sidebar-active": "#7C3AED",
      "header-background": "#FFFFFF",
      primary: "#7C3AED",
      "primary-foreground": "#FFFFFF",
      secondary: "#33176B",
      accent: "#9333EA",
      "accent-foreground": "#FFFFFF",
      muted: "#F0E9FF",
      "muted-foreground": "#59487A",
      border: "#E0D3FA",
      input: "#F5F0FF",
      ring: "#7C3AED",
      hover: "#ECE2FF",
      selected: "#E7DAFF",
      popover: "#FFFFFF",
      "chart-1": "#7C3AED",
      "chart-2": "#33176B",
      "chart-3": "#A855F7",
      "chart-4": "#6366F1",
      "chart-5": "#64748B",
      success: "#059669",
      warning: "#D97706",
      destructive: "#DC2626",
      info: "#0284C7",
    },
    dark: {
      background: "#1B103B",
      foreground: "#F4EBFF",
      surface: "#251650",
      "surface-muted": "#301D66",
      "surface-elevated": "#3B247A",
      card: "#251650",
      "card-foreground": "#F4EBFF",
      "sidebar-background": "#130B2B",
      "sidebar-foreground": "#F4EBFF",
      "sidebar-active": "#5521A8",
      "header-background": "#201345",
      primary: "#7C3AED",
      "primary-foreground": "#FFFFFF",
      secondary: "#5521A8",
      accent: "#C084FC",
      "accent-foreground": "#1B103B",
      muted: "#301D66",
      "muted-foreground": "#C3B2E8",
      border: "#4A2D94",
      input: "#2D1B61",
      ring: "#C084FC",
      hover: "#382275",
      selected: "#5521A8",
      popover: "#2B195C",
      "chart-1": "#C084FC",
      "chart-2": "#8B5CF6",
      "chart-3": "#A855F7",
      "chart-4": "#818CF8",
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
    darkName: "Executive Gold",
    descriptionAr: "عاجي دافئ بلمسات ذهبية تنفيذية فخمة",
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
      background: "#211807",
      foreground: "#FFF5DB",
      surface: "#2D210B",
      "surface-muted": "#3B2B0F",
      "surface-elevated": "#473514",
      card: "#2D210B",
      "card-foreground": "#FFF5DB",
      "sidebar-background": "#171004",
      "sidebar-foreground": "#FFF5DB",
      "sidebar-active": "#805414",
      "header-background": "#271C09",
      primary: "#D49A22",
      "primary-foreground": "#171004",
      secondary: "#805414",
      accent: "#FFD166",
      "accent-foreground": "#171004",
      muted: "#3B2B0F",
      "muted-foreground": "#DEC89E",
      border: "#5E4519",
      input: "#36270D",
      ring: "#FFD166",
      hover: "#453312",
      selected: "#805414",
      popover: "#33250C",
      "chart-1": "#FFD166",
      "chart-2": "#D49A22",
      "chart-3": "#F59E0B",
      "chart-4": "#B7791F",
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
    darkName: "Crimson Power",
    descriptionAr: "كوارتز وردي أنيق مع قرمزي داكن جريء",
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
      background: "#300D1A",
      foreground: "#FFF0F3",
      surface: "#3F1223",
      "surface-muted": "#4F172C",
      "surface-elevated": "#5E1C35",
      card: "#3F1223",
      "card-foreground": "#FFF0F3",
      "sidebar-background": "#220812",
      "sidebar-foreground": "#FFF0F3",
      "sidebar-active": "#881337",
      "header-background": "#370F1E",
      primary: "#E11D48",
      "primary-foreground": "#FFFFFF",
      secondary: "#881337",
      accent: "#FB7185",
      "accent-foreground": "#220812",
      muted: "#4F172C",
      "muted-foreground": "#E5B3C2",
      border: "#752340",
      input: "#4A1529",
      ring: "#FB7185",
      hover: "#591A32",
      selected: "#881337",
      popover: "#471427",
      "chart-1": "#FB7185",
      "chart-2": "#E11D48",
      "chart-3": "#F43F5E",
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
    darkName: "Cyber Teal",
    descriptionAr: "جرافيت فضي متوازن نهاراً وتيل سيبراني ليلاً",
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
      background: "#06262B",
      foreground: "#ECFEFF",
      surface: "#09343B",
      "surface-muted": "#0D444D",
      "surface-elevated": "#10535E",
      card: "#09343B",
      "card-foreground": "#ECFEFF",
      "sidebar-background": "#041A1E",
      "sidebar-foreground": "#ECFEFF",
      "sidebar-active": "#0B5960",
      "header-background": "#072C32",
      primary: "#0E7490",
      "primary-foreground": "#FFFFFF",
      secondary: "#0B5960",
      accent: "#22D3EE",
      "accent-foreground": "#041A1E",
      muted: "#0D444D",
      "muted-foreground": "#A5CED4",
      border: "#166873",
      input: "#0B3D45",
      ring: "#22D3EE",
      hover: "#114E57",
      selected: "#0B5960",
      popover: "#0B3D45",
      "chart-1": "#22D3EE",
      "chart-2": "#06B6D4",
      "chart-3": "#0891B2",
      "chart-4": "#67E8F9",
      "chart-5": "#94A3B8",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#F43F5E",
      info: "#22D3EE",
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
 * supporting both new preset signatures and legacy Emerald colors (#123D32 / #187A5A).
 */
export function resolveThemePresetId(
  appearance?: { primary?: string; secondary?: string; accent?: string } | null,
  fallbackId?: unknown
): ThemePresetId {
  const p = (appearance?.primary || "").toUpperCase();
  const s = (appearance?.secondary || "").toUpperCase();

  for (const preset of THEME_PRESETS) {
    if (
      preset.signature.primary.toUpperCase() === p &&
      preset.signature.secondary.toUpperCase() === s
    ) {
      return preset.id;
    }
  }

  // Secondary/Primary partial matching
  for (const preset of THEME_PRESETS) {
    if (
      preset.signature.secondary.toUpperCase() === s ||
      preset.light.primary.toUpperCase() === s ||
      preset.dark.primary.toUpperCase() === s
    ) {
      return preset.id;
    }
  }

  // Legacy emerald corporate hexes
  if (p === "#123D32" || s === "#187A5A") {
    return "emerald";
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
