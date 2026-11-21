/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import {
  DEFAULT_THEME_PRESET_ID,
  getThemeTokens,
  isValidThemePresetId,
  ThemeMode,
  ThemePresetId,
  THEME_PRESETS,
} from "./themes";

export const THEME_PRESET_STORAGE_KEY = "ig_theme_preset";
export const THEME_MODE_STORAGE_KEY = "ig_theme_mode";

export function readStoredPresetId(): ThemePresetId {
  if (typeof window === "undefined") return DEFAULT_THEME_PRESET_ID;
  try {
    const raw = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    return isValidThemePresetId(raw) ? raw : DEFAULT_THEME_PRESET_ID;
  } catch {
    return DEFAULT_THEME_PRESET_ID;
  }
}

export function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

export function persistThemeLocally(presetId: ThemePresetId, mode: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, presetId);
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function applyThemeToDocument(presetId: ThemePresetId, isDark: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const tokens = getThemeTokens(presetId, isDark);

  root.dataset.theme = isDark ? "dark" : "light";
  root.dataset.themePreset = presetId;
  root.classList.toggle("dark", isDark);

  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Legacy & shell compatibility aliases
  root.style.setProperty("--bg-main", tokens.background);
  root.style.setProperty("--text-main", tokens.foreground);
  root.style.setProperty("--text-muted", tokens["muted-foreground"]);
  root.style.setProperty("--border-color", tokens.border);
  root.style.setProperty("--primary-dark", tokens["sidebar-background"]);
  root.style.setProperty("--primary-green", tokens.primary);
  root.style.setProperty("--gold-accent", tokens.accent);
  root.style.setProperty("--on-primary", tokens["primary-foreground"]);
  root.style.setProperty("--on-secondary", tokens["primary-foreground"]);
  root.style.setProperty("--on-background", tokens.foreground);
  root.style.setProperty("--surface-subtle", tokens["surface-muted"]);
  root.style.setProperty("--surface-hover", tokens.hover);
}

/**
 * Generates an inline pre-hydration script for RootLayout to prevent FOUC
 * before React mounts.
 */
export function buildPreHydrationThemeScript(): string {
  const payload = Object.fromEntries(
    THEME_PRESETS.map((p) => [
      p.id,
      { light: p.light, dark: p.dark },
    ])
  );
  return `(function(){try{var p=localStorage.getItem("${THEME_PRESET_STORAGE_KEY}")||"${DEFAULT_THEME_PRESET_ID}";var m=localStorage.getItem("${THEME_MODE_STORAGE_KEY}")||"system";var presets=${JSON.stringify(payload)};if(!presets[p])p="${DEFAULT_THEME_PRESET_ID}";var dark=m==="dark"||(m==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=dark?presets[p].dark:presets[p].light;var r=document.documentElement;r.dataset.theme=dark?"dark":"light";r.dataset.themePreset=p;r.classList.toggle("dark",dark);for(var k in t){r.style.setProperty("--"+k,t[k]);}r.style.setProperty("--bg-main",t.background);r.style.setProperty("--text-main",t.foreground);r.style.setProperty("--text-muted",t["muted-foreground"]);r.style.setProperty("--border-color",t.border);r.style.setProperty("--primary-dark",t["sidebar-background"]);r.style.setProperty("--primary-green",t.primary);r.style.setProperty("--gold-accent",t.accent);r.style.setProperty("--on-primary",t["primary-foreground"]);r.style.setProperty("--on-secondary",t["primary-foreground"]);r.style.setProperty("--on-background",t.foreground);r.style.setProperty("--surface-subtle",t["surface-muted"]);r.style.setProperty("--surface-hover",t.hover);}catch(e){}})();`;
}
