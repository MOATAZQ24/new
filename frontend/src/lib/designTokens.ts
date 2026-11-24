/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

/**
 * Investor Gate OS - Centralized Design Tokens
 * Follows 4px/8px grid, WCAG 2.2 AA contrast, Arabic RTL typography,
 * and unified semantic tokens across light/dark themes.
 */

export const designTokens = {
  // Brand & Accent Colors
  brand: {
    primary: "#1D4ED8",       // Emerald Deep
    primaryHover: "#0E2F26",
    primaryLight: "#2563EB",  // Emerald Secondary
    accent: "#3B82F6",        // Gold / Amber Accent
    accentHover: "#B29158",
    purple: "#7C3AED",        // Reference Theme Accent
    purpleLight: "#8B5CF6",
    purpleDark: "#6D28D9",
    purpleBg: "#F5F3FF",
    purpleBorder: "#DDD6FE",
  },

  // Semantic Status Colors (ITSM / Incident / Task Lifecycle)
  semantic: {
    critical: {
      text: "#DC2626",
      bg: "#FEF2F2",
      border: "#FECACA",
      badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
      dot: "bg-red-500",
      label: "حرج جداً",
      enLabel: "Critical",
    },
    urgent: {
      text: "#EA580C",
      bg: "#FFF7ED",
      border: "#FFEDD5",
      badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
      dot: "bg-orange-500",
      label: "عاجل",
      enLabel: "Urgent",
    },
    high: {
      text: "#D97706",
      bg: "#FFFBEB",
      border: "#FDE68A",
      badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
      dot: "bg-amber-500",
      label: "مرتفع",
      enLabel: "High",
    },
    medium: {
      text: "#2563EB",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
      dot: "bg-blue-500",
      label: "متوسط",
      enLabel: "Medium",
    },
    low: {
      text: "#4B5563",
      bg: "#F3F4F6",
      border: "#E5E7EB",
      badge: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
      dot: "bg-gray-400",
      label: "منخفض",
      enLabel: "Low",
    },
    completed: {
      text: "#16A34A",
      bg: "#F0FDF4",
      border: "#BBF7D0",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
      dot: "bg-emerald-500",
      label: "مكتملة",
      enLabel: "Completed",
    },
    inProgress: {
      text: "#2563EB",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
      dot: "bg-blue-500",
      label: "قيد التنفيذ",
      enLabel: "In Progress",
    },
    pending: {
      text: "#D97706",
      bg: "#FFFBEB",
      border: "#FDE68A",
      badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
      dot: "bg-amber-500",
      label: "بانتظار القبول",
      enLabel: "Pending Acceptance",
    },
  },

  // Typography Tokens
  typography: {
    fonts: {
      arabic: "'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      english: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    sizes: {
      xs: { fontSize: "0.75rem", lineHeight: "1rem" },       // 12px
      sm: { fontSize: "0.875rem", lineHeight: "1.25rem" },   // 14px
      base: { fontSize: "1rem", lineHeight: "1.5rem" },      // 16px
      lg: { fontSize: "1.125rem", lineHeight: "1.75rem" },   // 18px
      xl: { fontSize: "1.25rem", lineHeight: "1.75rem" },    // 20px
      "2xl": { fontSize: "1.5rem", lineHeight: "2rem" },     // 24px
      "3xl": { fontSize: "1.875rem", lineHeight: "2.25rem" },// 30px
    },
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // Spacing (Based on 4px / 8px grid)
  spacing: {
    1: "0.25rem",  // 4px
    2: "0.5rem",   // 8px
    3: "0.75rem",  // 12px
    4: "1rem",     // 16px
    5: "1.25rem",  // 20px
    6: "1.5rem",   // 24px
    8: "2rem",     // 32px
    10: "2.5rem",  // 40px
    12: "3rem",    // 48px
    16: "4rem",    // 64px
  },

  // Corner Radii
  radii: {
    none: "0px",
    sm: "0.25rem",   // 4px
    md: "0.375rem",  // 6px
    lg: "0.5rem",    // 8px
    xl: "0.75rem",   // 12px
    "2xl": "1rem",   // 16px
    "3xl": "1.5rem", // 24px
    full: "9999px",
  },

  // Shadows
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    base: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },

  // Density Configurations (Compact / Comfortable / Spacious)
  density: {
    compact: {
      tableRowHeight: "2.25rem", // 36px
      buttonPadding: "px-2.5 py-1 text-xs",
      cardPadding: "p-3",
      inputPadding: "py-1 px-2.5 text-xs",
      gap: "gap-2",
    },
    comfortable: {
      tableRowHeight: "3rem",    // 48px
      buttonPadding: "px-3.5 py-2 text-sm",
      cardPadding: "p-4",
      inputPadding: "py-2 px-3 text-sm",
      gap: "gap-3",
    },
    spacious: {
      tableRowHeight: "3.75rem", // 60px
      buttonPadding: "px-5 py-2.5 text-base",
      cardPadding: "p-6",
      inputPadding: "py-2.5 px-4 text-base",
      gap: "gap-4",
    },
  },

  // Viewport Breakpoints
  breakpoints: {
    mobile: "375px",
    tablet: "768px",
    desktop: "1024px",
    wide: "1440px",
    ultra: "1920px",
  },
} as const;

export type DesignTokens = typeof designTokens;
export default designTokens;
