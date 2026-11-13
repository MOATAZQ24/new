"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";

export const defaultAppearance = {
  theme: "system", primary: "#123D32", secondary: "#187A5A", background: "#F5F7F8",
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
  save: (configuration?: Workspace) => Promise<void>; cancel: () => void; reload: () => Promise<void>;
}
const Context = createContext<WorkspaceState | null>(null);
export const mediaUrl = (path: string) => `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}${path}`;
function foreground(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)?.map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) || [1, 1, 1];
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? "#0F172A" : "#FFFFFF";
}
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, activeCompanyId } = useAuth();
  const [saved, setSaved] = useState(defaultWorkspace);
  const [draft, setDraft] = useState(defaultWorkspace);
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
    else { setSaved(defaultWorkspace); setDraft(defaultWorkspace); setInfo(null); }
    }, 0);
    return () => clearTimeout(timer);
  }, [user?.id, activeCompanyId, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const a = { ...draft.appearance };
    info?.enforced.forEach(field => { Object.assign(a, { [field]: info.company_defaults[field as keyof Appearance] }); });
    const apply = () => {
      const dark = a.theme === "dark" || (a.theme === "system" && media.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.classList.toggle("dark", dark);
      const background = dark ? "#101B19" : a.background;
      const surface = dark ? "#182824" : a.surface;
      const values: Record<string, string> = {
        "primary-dark": a.primary, "primary-green": a.secondary, "bg-main": background, surface,
        "gold-accent": a.accent, "text-main": foreground(surface), "text-muted": dark ? "#BDCEC8" : "#475569",
        "border-color": dark ? "#536660" : "#CBD5E1", "on-primary": foreground(a.primary),
        "on-secondary": foreground(a.secondary), "on-background": foreground(background),
        "workspace-radius": `${a.radius}px`, "workspace-font-size": `${a.font_size}px`,
        "workspace-font-weight": `${a.font_weight}`, "workspace-font": `'${a.english_font}', '${a.arabic_font}', sans-serif`,
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
  return <Context.Provider value={{ saved, draft, setDraft, info, loading, error, save, cancel: () => setDraft(saved), reload }}>{children}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error("WorkspaceProvider required"); return value; }
