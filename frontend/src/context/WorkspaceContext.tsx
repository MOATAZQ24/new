"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_THEME_PRESET_ID,
  resolveThemePresetId,
  THEME_PRESET_MAP,
  ThemePresetId,
} from "@/lib/themes";
import {
  applyThemeToDocument,
  persistThemeLocally,
  readStoredPresetId,
  readStoredThemeMode,
} from "@/lib/applyTheme";

export const defaultAppearance = {
  theme: "system", primary: "#0B3B2E", secondary: "#087F5B", background: "#F6FAF8",
  accent: "#C5A46D", surface: "#FFFFFF", arabic_font: "IBM Plex Sans Arabic", english_font: "Inter",
  font_size: 16, font_weight: 400, density: "comfortable", radius: 12, sidebar_width: 256,
};
export type Appearance = typeof defaultAppearance;
export const widgetLabels: Record<string, string> = {
  kpis: "مؤشرات الأداء / KPIs", critical_tickets: "التذاكر الحرجة / Critical tickets",
  subscriptions: "تجديد الاشتراكات / Renewals", maintenance: "ملخص الصيانة / Maintenance",
  recent_tasks: "المهام الأخيرة / Recent tasks", asset_status: "حالات الأصول / Asset status",
  ticket_priorities: "أولويات الدعم / Ticket priorities", activity: "النشاط الأخير / Activity",
  quick_actions: "إجراءات سريعة / Quick actions",
};
export interface NavigationPreference { href: string; hidden: boolean; pinned: boolean; icon: string }
export interface TablePreference { columns: string[]; hidden: string[]; per_page: number; density: string; filters: Record<string, string>; sort: string; view: string }
export interface Workspace {
  appearance: Appearance; widgets: { id: string; enabled: boolean }[];
  navigation: NavigationPreference[]; collapsed: boolean; tables: Record<string, TablePreference>;
}
export const defaultWorkspace: Workspace = { appearance: defaultAppearance, widgets: Object.keys(widgetLabels).map(id => ({ id, enabled: true })), navigation: [], collapsed: false, tables: {} };
export interface WorkspaceResponse {
  available_widgets: string[]; configuration: Workspace; company_defaults: Appearance; enforced: string[];
  can_manage_company: boolean; branding: { logo: string | null; favicon: string | null };
}
interface WorkspaceState {
  saved: Workspace; draft: Workspace; setDraft: React.Dispatch<React.SetStateAction<Workspace>>;
  info: WorkspaceResponse | null; loading: boolean; error: string;
  presetId: ThemePresetId;
  selectPreset: (presetId: ThemePresetId, persist?: boolean) => Promise<void>;
  save: (configuration?: Workspace) => Promise<void>; cancel: () => void; reload: () => Promise<void>;
}
const Context = createContext<WorkspaceState | null>(null);
export const mediaUrl = (path: string) => `/api/v1${path}`;
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, activeCompanyId } = useAuth();
  const [saved, setSaved] = useState<Workspace>(defaultWorkspace);
  const [draft, setDraft] = useState<Workspace>(defaultWorkspace);
  const [info, setInfo] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const applyResponse = useCallback((data: WorkspaceResponse) => { setInfo(data); setSaved(data.configuration); setDraft(data.configuration); }, []);
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { applyResponse((await api.get<WorkspaceResponse>("/workspace")).data); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل التفضيلات"); }
    finally { setLoading(false); }
  }, [applyResponse]);
  useEffect(() => {
    const timer = setTimeout(() => {
    if (user && activeCompanyId) { void reload(); }
    else {
      const storedPreset = readStoredPresetId();
      const storedMode = readStoredThemeMode();
      const sig = THEME_PRESET_MAP[storedPreset].signature;
      const next = {
        ...defaultWorkspace,
        appearance: { ...defaultAppearance, ...sig, theme: storedMode || defaultAppearance.theme },
      };
      setSaved(next); setDraft(next); setInfo(null);
    }
    }, 0);
    return () => clearTimeout(timer);
  }, [user?.id, activeCompanyId, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const presetId = resolveThemePresetId(draft.appearance, DEFAULT_THEME_PRESET_ID);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const a = { ...draft.appearance };
    info?.enforced.forEach(field => { Object.assign(a, { [field]: info.company_defaults[field as keyof Appearance] }); });
    const effectivePresetId = resolveThemePresetId(a, DEFAULT_THEME_PRESET_ID);
    const apply = () => {
      const dark = a.theme === "dark" || (a.theme === "system" && media.matches);
      applyThemeToDocument(effectivePresetId, dark);
      persistThemeLocally(effectivePresetId, (a.theme === "light" || a.theme === "dark" ? a.theme : "system"));
      const values: Record<string, string> = {
        "workspace-radius": `${a.radius}px`,
        "workspace-font-size": `${a.font_size}px`,
        "workspace-font-weight": `${a.font_weight}`,
        "workspace-font": `'${a.english_font}', '${a.arabic_font}', sans-serif`,
        "sidebar-width": draft.collapsed ? "76px" : `${a.sidebar_width}px`,
        "workspace-spacing": a.density === "compact" ? ".5rem" : a.density === "spacious" ? "1.5rem" : "1rem",
      };
      Object.entries(values).forEach(([key, value]) => root.style.setProperty(`--${key}`, value));
      root.dataset.density = a.density;
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [draft.appearance, draft.collapsed, info]);
  useEffect(() => {
    if (!info?.branding.favicon) return;
    const link = document.createElement("link"); link.rel = "icon"; link.href = mediaUrl(info.branding.favicon) + `?v=${Date.now()}`;
    document.head.appendChild(link); return () => link.remove();
  }, [info]);
  const save = async (configuration = draft) => {
    applyResponse((await api.put<WorkspaceResponse>("/workspace", configuration)).data);
  };
  const selectPreset = async (nextPresetId: ThemePresetId, persist = true) => {
    const preset = THEME_PRESET_MAP[nextPresetId] || THEME_PRESET_MAP[DEFAULT_THEME_PRESET_ID];
    const nextConfig: Workspace = {
      ...draft,
      appearance: {
        ...draft.appearance,
        ...preset.signature,
      },
    };
    setDraft(nextConfig);
    persistThemeLocally(preset.id, (nextConfig.appearance.theme === "light" || nextConfig.appearance.theme === "dark" ? nextConfig.appearance.theme : "system"));
    if (!persist) return;
    if (info?.enforced?.some((f) => ["primary", "secondary", "accent", "background", "surface"].includes(f)) && info?.can_manage_company) {
      await api.put("/workspace/company-defaults", {
        appearance: { ...info.company_defaults, ...preset.signature },
        enforced: info.enforced,
      });
    }
    await save(nextConfig);
  };
  return <Context.Provider value={{ saved, draft, setDraft, info, loading, error, presetId, selectPreset, save, cancel: () => setDraft(saved), reload }}>{children}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error("WorkspaceProvider required"); return value; }
