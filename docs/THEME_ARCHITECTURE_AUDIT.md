# Investor Gate OS — Theme Architecture Root Cause Audit

## 1. Executive Summary
An audit of `frontend/src/app/globals.css`, `frontend/src/context/WorkspaceContext.tsx`, `frontend/src/context/CustomizationContext.tsx`, `frontend/src/components/`, and `frontend/src/app/` reveals why the current color selector only updates a small subset of UI elements instead of transforming the full visual identity.

---

## 2. Root Causes Identified

1. **Accent-Only Mutation in Settings (`frontend/src/app/settings/page.tsx`):**
   - Clicking a swatch only mutates `appearance.secondary` (`--primary-green`), leaving `--primary-dark` (Sidebar background, primary buttons), `--bg-main`, `--surface`, `--border-color`, `--gold-accent`, hover states, selected states, and chart palettes unchanged.
2. **Incomplete Token Mapping in `globals.css` & `WorkspaceContext.tsx`:**
   - `WorkspaceContext.tsx` sets only 11 CSS custom properties (`--primary-dark`, `--primary-green`, `--bg-main`, `--surface`, `--gold-accent`, `--text-main`, `--text-muted`, `--border-color`, `--on-primary`, `--on-secondary`, `--on-background`).
   - Dark mode in `WorkspaceContext.tsx` hardcodes `#101B19` (background), `#182824` (surface), `#BDCEC8` (muted text), and `#536660` (border) regardless of which theme preset is selected.
   - `globals.css` only remaps 8 exact class tokens (`bg-white`, `bg-[#F5F7F8]`, `bg-[#123D32]`, `bg-[#187A5A]`, `bg-[#C5A46D]`, `text-[#123D32]`, `text-[#187A5A]`, `text-[#C5A46D]`), missing `hover:bg-[#187A5A]`, `hover:border-[#187A5A]`, `focus:border-[#187A5A]`, `bg-[#123D32]/10`, `bg-emerald-50`, `bg-slate-50`, `border-slate-200`, `dark:bg-slate-800`, and `ring` utilities.
3. **Hardcoded Hex & Tailwind Palette Classes Across Components:**
   - Inventory count (`Select-String` on `#[0-9a-fA-F]{3,6}`): **69** occurrences across `frontend/src/components/**/*.tsx` and **508** occurrences across `frontend/src/app/**/*.tsx`.
   - `EnterpriseCharts.tsx` uses a static `DEFAULT_PALETTE` array (`#123D32`, `#187A5A`, `#C5A46D`, `#0F766E`, etc.) and static SVG track stroke (`#E2E8F0`) instead of `--chart-1` .. `--chart-5` and `--border`.
   - `Sidebar.tsx` and `BrandMark.tsx` hardcode `#123D32`, `#187A5A`, and `#C5A46D`.
4. **No Pre-Hydration Theme Script (`frontend/src/app/layout.tsx`):**
   - `RootLayout` renders without reading persisted theme preset/mode before React hydration, causing a visible flash of default light styling when Dark Mode or a non-emerald preset is active.
5. **Backend Schema Compatibility Constraint (`backend/app/schemas/workspace.py`):**
   - `Appearance` uses Pydantic `ConfigDict(extra="forbid")` with `theme` (`light | dark | system`) and 5 hex color fields (`primary`, `secondary`, `background`, `surface`, `accent`).
   - Therefore, the Theme Preset Engine maps each of the 6 presets to a unique canonical `(primary, secondary)` hex signature + `localStorage` cache (`ig_theme_preset`, `ig_theme_mode`) so full preset selection persists across both `/api/v1/workspace` and zero-flash SSR hydration without modifying backend APIs or database models.

---

## 3. Target Architecture
1. **`frontend/src/lib/themes.ts`:** Centralized definition of the 6 complete Premium Themes (`emerald`, `electric-blue`, `royal-purple`, `executive-gold`, `crimson-power`, `graphite-teal`), each with full Light and Dark semantic token maps (`background`, `foreground`, `surface`, `surface-muted`, `surface-elevated`, `card`, `card-foreground`, `sidebar-background`, `sidebar-foreground`, `sidebar-active`, `header-background`, `primary`, `primary-foreground`, `secondary`, `accent`, `accent-foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `hover`, `selected`, `popover`, `chart-1`..`chart-5`, `success`, `warning`, `destructive`, `info`).
2. **`frontend/src/app/layout.tsx`:** Inline pre-hydration script applying `data-theme`, `data-theme-preset`, `dark` class, and CSS variables before first paint.
3. **`frontend/src/context/WorkspaceContext.tsx` & `CustomizationContext.tsx`:** Centralized preset resolution, live preview, instant Light/Dark/Auto switching, and dual persistence (`/api/v1/workspace` + `localStorage`).
4. **`frontend/src/app/globals.css`:** Semantic CSS token consumption and comprehensive mapping so all cards, surfaces, inputs, borders, hover/selected states, focus rings, sidebar, topnav, tables, modals, and charts respond dynamically to all 6 presets in both Light and Dark modes.
5. **`frontend/src/app/settings/page.tsx`:** Compact Premium Theme Gallery replacing the simple swatch circles, alongside independent Light / Dark / Auto controls.
