"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, apiRequest } from "@/lib/api";
import { useWorkspace, mediaUrl } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";

export interface ColorPalette {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  accent: string;
}

export interface TypographySettings {
  arabicFont: string;
  englishFont: string;
  fontSize: "small" | "medium" | "large";
  fontWeight: "normal" | "medium" | "bold";
}

export interface DashboardWidgetConfig {
  id: string;
  enabled: boolean;
  order: number;
  title: string;
}

export interface TableConfig {
  visibleColumns?: string[];
  columnOrder?: string[];
  rowsPerPage?: number;
  density?: "compact" | "normal";
}

export interface CustomizationPreferencesPayload {
  theme?: "light" | "dark" | "system";
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  surface_color?: string;
  accent_color?: string;
  arabic_font?: string;
  english_font?: string;
  font_size?: "small" | "medium" | "large";
  font_weight?: "normal" | "medium" | "bold";
  density?: "compact" | "comfortable" | "spacious";
  border_radius?: "none" | "sm" | "rounded" | "lg";
  sidebar_width?: number;
  sidebar_collapsed?: boolean;
  pinned_nav?: string[];
  hidden_nav?: string[];
  nav_order?: string[];
  dashboard_layout?: DashboardWidgetConfig[];
  table_preferences?: Record<string, TableConfig>;
  company_branding?: CompanyBrandingData | null;
}

export interface CompanyBrandingData {
  company_logo?: string | null;
  favicon_url?: string | null;
  brand_name_ar?: string | null;
  brand_name_en?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  enforce_company_theme?: boolean;
}

interface CustomizationContextType {
  theme: "light" | "dark" | "system";
  resolvedTheme: "light" | "dark";
  colors: ColorPalette;
  typography: TypographySettings;
  density: "compact" | "comfortable" | "spacious";
  borderRadius: "none" | "sm" | "rounded" | "lg";
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  pinnedNav: string[];
  hiddenNav: string[];
  navOrder: string[];
  dashboardLayout: DashboardWidgetConfig[];
  companyBranding: CompanyBrandingData | null;
  isLoading: boolean;
  
  // Actions
  setTheme: (t: "light" | "dark" | "system") => void;
  setColors: (c: ColorPalette) => void;
  setTypography: (t: TypographySettings) => void;
  setDensity: (d: "compact" | "comfortable" | "spacious") => void;
  setBorderRadius: (r: "none" | "sm" | "rounded" | "lg") => void;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  togglePinNav: (href: string) => void;
  toggleHideNav: (href: string) => void;
  setNavOrder: (order: string[]) => void;
  setDashboardLayout: (layout: DashboardWidgetConfig[]) => void;
  getTableConfig: (tableId: string) => TableConfig;
  setTableConfig: (tableId: string, cfg: TableConfig) => void;
  savePreferences: (override?: Record<string, unknown>) => Promise<void>;
  resetPreferences: () => Promise<void>;
  updateBranding: (branding: Partial<CompanyBrandingData>) => Promise<void>;
  removeLogo: () => Promise<void>;
}

const DEFAULT_COLORS: ColorPalette = {
  primary: "#123D32",
  secondary: "#187A5A",
  background: "#F5F7F8",
  surface: "#FFFFFF",
  accent: "#C5A46D",
};

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  arabicFont: "IBM Plex Sans Arabic",
  englishFont: "Inter",
  fontSize: "medium",
  fontWeight: "normal",
};

const DEFAULT_DASHBOARD: DashboardWidgetConfig[] = [
  {"id": "quick_actions", "enabled": true, "order": 1, "title": "الإجراءات السريعة"},
  {"id": "alerts", "enabled": true, "order": 2, "title": "تنبيهات التذاكر والاشتراكات"},
  {"id": "kpis_primary", "enabled": true, "order": 3, "title": "مؤشرات الأداء الرئيسية"},
  {"id": "kpis_financial", "enabled": true, "order": 4, "title": "المؤشرات المالية والصيانة"},
  {"id": "asset_distribution", "enabled": true, "order": 5, "title": "توزيع حالات الأصول التقنية"},
  {"id": "ticket_priorities", "enabled": true, "order": 6, "title": "أولويات تذاكر الدعم الفني"},
  {"id": "recent_activity", "enabled": true, "order": 7, "title": "سجل العمليات والرقابة الأخير"},
];

const CustomizationContext = createContext<CustomizationContextType | undefined>(undefined);

export function LegacyCustomizationProvider({ children }: { children: React.ReactNode }) {
  const { user, activeCompanyId } = useAuth();
  const [theme, setThemeState] = useState<"light" | "dark" | "system">("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [colors, setColors] = useState<ColorPalette>(DEFAULT_COLORS);
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [borderRadius, setBorderRadius] = useState<"none" | "sm" | "rounded" | "lg">("rounded");
  const [sidebarWidth, setSidebarWidth] = useState<number>(256);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [pinnedNav, setPinnedNav] = useState<string[]>([]);
  const [hiddenNav, setHiddenNav] = useState<string[]>([]);
  const [navOrder, setNavOrderState] = useState<string[]>([]);
  const [dashboardLayout, setDashboardLayoutState] = useState<DashboardWidgetConfig[]>(DEFAULT_DASHBOARD);
  const [tablePreferences, setTablePreferences] = useState<Record<string, TableConfig>>({});
  const [companyBranding, setCompanyBranding] = useState<CompanyBrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute resolved theme
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (theme === "system") {
        const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        setResolvedTheme(isDark ? "dark" : "light");
      } else {
        setResolvedTheme(theme);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [theme]);

  // Apply CSS custom properties and dark mode class to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.style.setProperty("--bg-main", "#0F172A");
      root.style.setProperty("--surface", "#1E293B");
      root.style.setProperty("--text-main", "#F8FAFC");
      root.style.setProperty("--text-muted", "#94A3B8");
      root.style.setProperty("--border-color", "#334155");
    } else {
      root.classList.remove("dark");
      root.style.setProperty("--bg-main", colors.background);
      root.style.setProperty("--surface", colors.surface);
      root.style.setProperty("--text-main", "#0F172A");
      root.style.setProperty("--text-muted", "#64748B");
      root.style.setProperty("--border-color", "#E2E8F0");
    }

    root.style.setProperty("--primary-dark", colors.primary);
    root.style.setProperty("--primary-green", colors.secondary);
    root.style.setProperty("--gold-accent", colors.accent);

    const fontScale = typography.fontSize === "small" ? "0.92" : typography.fontSize === "large" ? "1.08" : "1";
    root.style.setProperty("--font-scale", fontScale);

    const radiusVal = borderRadius === "none" ? "0px" : borderRadius === "sm" ? "6px" : borderRadius === "lg" ? "16px" : "12px";
    root.style.setProperty("--radius", radiusVal);

    root.style.setProperty("--sidebar-w", `${sidebarCollapsed ? 80 : sidebarWidth}px`);
  }, [resolvedTheme, colors, typography, borderRadius, sidebarWidth, sidebarCollapsed]);

  // Load preferences from server
  const loadPreferences = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const res = await api.get<CustomizationPreferencesPayload>("/customization/preferences");
      if (res.data) {
        const d = res.data;
        if (d.theme) setThemeState(d.theme);
        if (d.primary_color) {
          setColors({
            primary: d.primary_color,
            secondary: d.secondary_color || DEFAULT_COLORS.secondary,
            background: d.background_color || DEFAULT_COLORS.background,
            surface: d.surface_color || DEFAULT_COLORS.surface,
            accent: d.accent_color || DEFAULT_COLORS.accent,
          });
        }
        if (d.arabic_font) {
          setTypography({
            arabicFont: d.arabic_font,
            englishFont: d.english_font || "Inter",
            fontSize: d.font_size || "medium",
            fontWeight: d.font_weight || "normal",
          });
        }
        if (d.density) setDensity(d.density);
        if (d.border_radius) setBorderRadius(d.border_radius);
        if (d.sidebar_width) setSidebarWidth(d.sidebar_width);
        if (typeof d.sidebar_collapsed === "boolean") setSidebarCollapsed(d.sidebar_collapsed);
        if (d.pinned_nav) setPinnedNav(d.pinned_nav);
        if (d.hidden_nav) setHiddenNav(d.hidden_nav);
        if (d.nav_order) setNavOrderState(d.nav_order);
        if (d.dashboard_layout && d.dashboard_layout.length > 0) setDashboardLayoutState(d.dashboard_layout);
        if (d.table_preferences) setTablePreferences(d.table_preferences);
        if (d.company_branding) setCompanyBranding(d.company_branding);
      }
    } catch (err) {
      console.error("Failed to load user preferences", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadPreferences();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadPreferences]);

  const setTheme = (t: "light" | "dark" | "system") => {
    setThemeState(t);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const togglePinNav = (href: string) => {
    setPinnedNav((prev) =>
      prev.includes(href) ? prev.filter((p) => p !== href) : [...prev, href]
    );
  };

  const toggleHideNav = (href: string) => {
    setHiddenNav((prev) =>
      prev.includes(href) ? prev.filter((p) => p !== href) : [...prev, href]
    );
  };

  const setNavOrder = (order: string[]) => {
    setNavOrderState(order);
  };

  const setDashboardLayout = (layout: DashboardWidgetConfig[]) => {
    setDashboardLayoutState(layout);
  };

  const getTableConfig = (tableId: string): TableConfig => {
    return tablePreferences[tableId] || { density: "normal", rowsPerPage: 20 };
  };

  const setTableConfig = (tableId: string, cfg: TableConfig) => {
    setTablePreferences((prev) => {
      const updated = { ...prev, [tableId]: { ...(prev[tableId] || {}), ...cfg } };
      api.put("/customization/preferences", { table_preferences: updated }).catch(console.error);
      return updated;
    });
  };

  const savePreferences = async (override?: Record<string, unknown>) => {
    const payload = {
      theme,
      primary_color: colors.primary,
      secondary_color: colors.secondary,
      background_color: colors.background,
      surface_color: colors.surface,
      accent_color: colors.accent,
      arabic_font: typography.arabicFont,
      english_font: typography.englishFont,
      font_size: typography.fontSize,
      font_weight: typography.fontWeight,
      density,
      border_radius: borderRadius,
      sidebar_width: sidebarWidth,
      sidebar_collapsed: sidebarCollapsed,
      pinned_nav: pinnedNav,
      hidden_nav: hiddenNav,
      nav_order: navOrder,
      dashboard_layout: dashboardLayout,
      table_preferences: tablePreferences,
      ...(override || {}),
    };

    await api.put("/customization/preferences", payload);
  };

  const resetPreferences = async () => {
    await api.post("/customization/preferences/reset");
    setThemeState("system");
    setColors(DEFAULT_COLORS);
    setTypography(DEFAULT_TYPOGRAPHY);
    setDensity("comfortable");
    setBorderRadius("rounded");
    setSidebarWidth(256);
    setSidebarCollapsed(false);
    setPinnedNav([]);
    setHiddenNav([]);
    setNavOrderState([]);
    setDashboardLayoutState(DEFAULT_DASHBOARD);
    setTablePreferences({});
  };

  const updateBranding = async (branding: Partial<CompanyBrandingData>) => {
    await api.put("/customization/branding", branding);
    const res = await api.get<CompanyBrandingData>("/customization/branding");
    setCompanyBranding(res.data);
  };

  const removeLogo = async () => {
    await api.delete("/customization/branding/logo");
    setCompanyBranding((prev) => (prev ? { ...prev, company_logo: null } : null));
  };

  return (
    <CustomizationContext.Provider
      value={{
        theme,
        resolvedTheme,
        colors,
        typography,
        density,
        borderRadius,
        sidebarWidth,
        sidebarCollapsed,
        pinnedNav,
        hiddenNav,
        navOrder,
        dashboardLayout,
        companyBranding,
        isLoading,
        setTheme,
        setColors,
        setTypography,
        setDensity,
        setBorderRadius,
        setSidebarWidth,
        toggleSidebar,
        togglePinNav,
        toggleHideNav,
        setNavOrder,
        setDashboardLayout,
        getTableConfig,
        setTableConfig,
        savePreferences,
        resetPreferences,
        updateBranding,
        removeLogo,
      }}
    >
      {children}
    </CustomizationContext.Provider>
  );
}

export function useCustomization() {
  const context = useContext(CustomizationContext);
  if (!context) {
    throw new Error("useCustomization must be used within a CustomizationProvider");
  }
  return context;
}

// Compatibility adapter: existing appearance pages and layout use the same validated
// workspace store as the new editor. The legacy provider remains available for migration.
export function CustomizationProvider({ children }: { children: React.ReactNode }) {
  const { draft, setDraft, info, loading, save, reload } = useWorkspace();
  const a = draft.appearance;
  const colors = { primary: a.primary, secondary: a.secondary, background: a.background, surface: a.surface, accent: a.accent };
  const typography: TypographySettings = { arabicFont: a.arabic_font, englishFont: a.english_font,
    fontSize: a.font_size < 16 ? "small" : a.font_size > 16 ? "large" : "medium",
    fontWeight: a.font_weight >= 700 ? "bold" : a.font_weight >= 500 ? "medium" : "normal" };
  const appearance = (patch: Partial<typeof a>) => setDraft(d => ({ ...d, appearance: { ...d.appearance, ...patch } }));
  const nav = (href: string, key: "hidden" | "pinned") => setDraft(d => ({ ...d, navigation: d.navigation.map(n => n.href === href && !(key === "hidden" && href === "/settings") ? { ...n, [key]: !n[key] } : n) }));
  const isSystemDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDarkActive = a.theme === "dark" || (a.theme === "system" && Boolean(isSystemDark));
  const value: CustomizationContextType = {
    theme: a.theme as "light" | "dark" | "system", resolvedTheme: isDarkActive ? "dark" : "light", colors, typography,
    density: a.density as "compact" | "comfortable" | "spacious", borderRadius: a.radius === 0 ? "none" : a.radius <= 6 ? "sm" : a.radius >= 16 ? "lg" : "rounded",
    sidebarWidth: a.sidebar_width, sidebarCollapsed: draft.collapsed,
    pinnedNav: draft.navigation.filter(n => n.pinned).map(n => n.href), hiddenNav: draft.navigation.filter(n => n.hidden).map(n => n.href), navOrder: draft.navigation.map(n => n.href),
    dashboardLayout: draft.widgets.map((w, order) => ({ ...w, order, title: w.id })),
    companyBranding: info ? { company_logo: info.branding.logo ? mediaUrl(info.branding.logo) : null, favicon_url: info.branding.favicon ? mediaUrl(info.branding.favicon) : null } : null,
    isLoading: loading, setTheme: theme => appearance({ theme }), setColors: colors => appearance(colors),
    setTypography: t => appearance({ arabic_font: t.arabicFont, english_font: t.englishFont, font_size: { small: 14, medium: 16, large: 18 }[t.fontSize], font_weight: { normal: 400, medium: 500, bold: 700 }[t.fontWeight] }),
    setDensity: density => appearance({ density }), setBorderRadius: radius => appearance({ radius: { none: 0, sm: 6, rounded: 12, lg: 16 }[radius] }), setSidebarWidth: sidebar_width => appearance({ sidebar_width }),
    toggleSidebar: () => setDraft(d => ({ ...d, collapsed: !d.collapsed })), togglePinNav: href => nav(href, "pinned"), toggleHideNav: href => nav(href, "hidden"),
    setNavOrder: order => setDraft(d => ({ ...d, navigation: [...d.navigation].sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href)) })),
    setDashboardLayout: layout => setDraft(d => ({ ...d, widgets: layout.map(w => ({ id: w.id, enabled: w.enabled })) })),
    getTableConfig: id => { const t = draft.tables[id]; return { columnOrder: t?.columns, visibleColumns: t?.columns.filter(c => !t.hidden.includes(c)), rowsPerPage: t?.per_page || 20, density: t?.density === "compact" ? "compact" : "normal" }; },
    setTableConfig: (id, cfg) => setDraft(d => ({ ...d, tables: { ...d.tables, [id]: { columns: cfg.columnOrder || [], hidden: [], per_page: cfg.rowsPerPage || 20, density: cfg.density === "compact" ? "compact" : "comfortable", filters: {}, sort: "", view: "" } } })),
    savePreferences: async () => save(), resetPreferences: async () => { await api.delete("/workspace"); await reload(); },
    updateBranding: async data => {
      for (const [key, kind] of [["company_logo", "logo"], ["favicon_url", "favicon"]] as const) {
        const url = data[key];
        if (url?.startsWith("data:image/")) {
          const blob = await (await fetch(url)).blob(); const body = new FormData(); body.append("file", blob, "branding");
          await apiRequest(`/workspace/branding/${kind}`, { method: "PUT", body });
        }
      }
      if (data.primary_color || data.secondary_color || data.accent_color || data.enforce_company_theme !== undefined) {
        await api.put("/workspace/company-defaults", { appearance: { ...a, primary: data.primary_color || a.primary, secondary: data.secondary_color || a.secondary, accent: data.accent_color || a.accent }, enforced: data.enforce_company_theme ? ["primary", "secondary", "accent"] : [] });
      }
      await reload();
    },
    removeLogo: async () => { await api.delete("/workspace/branding/logo"); await reload(); },
  };
  return <CustomizationContext.Provider value={value}>{children}</CustomizationContext.Provider>;
}
