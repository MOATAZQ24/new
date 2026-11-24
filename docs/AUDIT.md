# Investor Gate OS — Stage 0 Visual, UX & Accessibility Audit (`docs/AUDIT.md`)

- **Project:** Investor Gate OS (IGOS) — Enterprise IT Operations Management Platform
- **Original Developer:** Moataz Qasem (2026) — governed by IGOS-DAPF
- **Branch:** `feat/ui-redesign` (Frontend-only redesign audit; zero backend changes)
- **Audit Date:** 2026-11-24
- **Environments Audited:** Desktop (`1440×900`), Tablet (`1024×768`), Mobile (`390×844`) × Light & Dark themes × RTL (`ar`) & LTR (`en`)
- **Evidence Folder:** `docs/design/screens/stage0/` (19 captured screenshots)

---

## 1. Executive Summary

A comprehensive multi-viewport visual, typographic, RTL/LTR, and automated accessibility (`@axe-core/playwright`) audit of the current Investor Gate OS frontend reveals that while the underlying FastAPI/SQLAlchemy platform and Track 1 work-management backend are architecturally strong, the visual presentation currently suffers from **fragmented visual identity**, **template/AI-slop motifs**, **severe contrast and overlay accessibility failures**, and **layout crowding** that undermine enterprise trust in the first 3 seconds:

1. **Three conflicting palettes coexist simultaneously:** Royal Purple (`#7C3AED` / `#131127`) on `/login` and `/tickets`, Deep Maroon/Rose (`#4C0D1F` + pale pink canvas) on authenticated `/` and `/my-work`, and legacy Emerald/Teal (`#123D32` / `#187A5A`) badges scattered through components.
2. **Hard-banned AI/template visual tropes are prominent in global chrome:** Sparkles icons (`المساعد الذكي`, `معالج الطلبات الذكي`, `مفتش الواجهة`), purple ambient blur blobs + `rounded-3xl backdrop-blur-xl` glassmorphism on `/login`, and generic hover-lift animations on every card.
3. **Production UI is occluded by developer overlays:** `<DevToolkitLoader />` pins floating `FPS | ms | MB` and `مفتش الواجهة Ctrl+Shift+E` pills directly over sidebar footer controls on desktop and completely blocks the bottom navigation bar at `390px` mobile width.
4. **Automated `axe-core` audit recorded 3 Critical and 4 Serious violations** across just 5 core routes (`/login`, `/`, `/my-work`, `/tickets`, `/tasks`), including unnamed `<select>` controls, unlabeled icon buttons, missing page `<h1>` landmarks, and color-contrast failures across 12 DOM nodes.
5. **No real English/LTR parity exists at the shell level:** Setting `dir="ltr"` leaves Arabic labels hardcoded throughout navigation and wizards, corrupting bidi punctuation (`1. تصنيف المشكلة`, `SLA التوزيع و`).

---

## 2. Automated Baseline Accessibility (`@axe-core/playwright`) & Overflow Metrics

Measured live on `http://127.0.0.1:3001` (Desktop `1440×900`, RTL):

| Route | Critical | Serious | Moderate | Minor | Failing Rules & Node Counts |
|---|---:|---:|---:|---:|---|
| `/login` | 0 | 0 | 1 | 0 | `region` (3 nodes outside landmarks) |
| `/` (Dashboard) | 0 | **1** | 0 | 0 | `color-contrast` (2 nodes) |
| `/my-work` | **1** | **1** | 1 | 0 | `select-name` (1 critical), `color-contrast` (1 serious), `region` (3 moderate) |
| `/tickets` | 0 | **1** | 1 | 0 | `color-contrast` (1 serious), `page-has-heading-one` (1 moderate) |
| `/tasks` | **2** | **1** | 0 | 0 | `button-name` (2 critical), `select-name` (4 critical), `color-contrast` (8 serious) |

**Viewport Document Overflow Check (`scrollWidth > clientWidth`):**
- Document root hides horizontal overflow via `html { overflow-x: clip }` (`globals.css:158`), which masks **internal clipping** on `1024px` TopNav (clips Telegram/bell/user menu off inline-end), `1024px` `/tasks` table (hides due date & action columns), and `390px` Dashboard table (truncates task titles mid-word).

**Runtime Console & Hydration Issues Observed:**
- `frontend/src/app/layout.tsx`: Inline `<script dangerouslySetInnerHTML>` triggers React 19 error `"Encountered a script tag while rendering React component"` and risks nginx CSP incompatibility.
- `frontend/src/components/layout/Sidebar.tsx:245`: SSR/CSR hydration mismatch on the `Sun`/`Moon` theme toggle icon.
- `frontend/src/app/globals.css:8`: External `@import url('https://fonts.googleapis.com/...')` violates self-hosted/no-third-party-CDN constraint and pairs `Inter` instead of metric-matched `IBM Plex Sans`.

---

## 3. Top 15 UX & Visual Problems (Ranked by Impact)

### #1 — P0: Purple-Glow Glassmorphism Login & Exposed Default Credentials
- **Screen / Viewport:** `/login` (`1440×900` RTL Dark) — [`login-1440-rtl-dark.png`](design/screens/stage0/login-1440-rtl-dark.png)
- **Code:** `frontend/src/app/login/page.tsx`
- **Problem:** Forces dark mode regardless of preference, uses purple ambient blur blobs (`#7C3AED` / `#8B5CF6`), `rounded-3xl backdrop-blur-xl shadow-2xl`, a gradient `IG` box, glowing purple CTA button, and exposes default `admin / Admin@12345` credentials in the card footer. Also fires two unauthenticated `401` requests to `/auth/me` on mount.
- **Remediation (Phase 4D-9):** Replace with a calm split-screen layout on Warm Paper `#FAF9F6` (quiet typographic Petrol brand panel with new Gate SVG lockup + clean focused form panel), zero gradients/blurs, password-manager-friendly `autocomplete` attributes, zero hardcoded credential hints.

### #2 — P0: Three Conflicting Palettes & Hardcoded Theme Collisions
- **Screen / Viewport:** `/` (`1440×900` Light/Dark), `/my-work`, `/tickets` — [`dashboard-1440-rtl-light.png`](design/screens/stage0/dashboard-1440-rtl-light.png), [`dashboard-1440-rtl-dark.png`](design/screens/stage0/dashboard-1440-rtl-dark.png), [`tickets-inbox-1440-ltr-light.png`](design/screens/stage0/tickets-inbox-1440-ltr-light.png)
- **Code:** `frontend/src/app/globals.css` (lines 29–64, 157–212, 279–314), `frontend/src/lib/themes.ts`
- **Problem:** Light mode mixes a heavy maroon sidebar (`#4C0D1F`), pale pink canvas, rose active buttons, emerald/teal role chips (`مدير النظام العام` fails readability), and Royal Purple (`#7C3AED`) leaking on `/tickets`. Fragile `[class~="bg-white"]` CSS overrides fight Tailwind utilities and overwrite border radii globally.
- **Remediation (Phase 4A):** Single source of truth in `frontend/src/styles/tokens.css` (Warm Paper `#FAF9F6` + Petrol `#0E5A63` Light; crafted Deep Slate Ink `#111413` + `#4FB3BC` Dark), zero attribute-selector hacks, WCAG 2.2 AA verified for every pair.

### #3 — P0: Floating Dev Overlays Occluding Core Controls & Mobile Bottom Bar
- **Screen / Viewport:** All screens at `1440px`, `1024px`, and critically `390px` — [`dashboard-390-rtl-light.png`](design/screens/stage0/dashboard-390-rtl-light.png), [`my-work-1440-rtl-light-populated.png`](design/screens/stage0/my-work-1440-rtl-light-populated.png)
- **Code:** `frontend/src/app/layout.tsx` (`<DevToolkitLoader />`)
- **Problem:** Bottom-right `FPS | ms | MB` / `OFFLINE` pill and bottom-left `مفتش الواجهة Ctrl+Shift+E` pill overlap sidebar footer buttons (`?`, theme toggle, collapse) on desktop and completely obscure the mobile bottom navigation bar at `390px`.
- **Remediation (Phase 4C):** Gate `<DevToolkitLoader />` strictly behind an explicit opt-in dev env flag (`NEXT_PUBLIC_DEV_TOOLKIT=1`, default OFF) so default UI chrome is 100% clean across every viewport.

### #4 — P0: Hard-Banned AI Branding & Sparkles Iconography Across Chrome
- **Screen / Viewport:** Global TopNav & `/tickets` (`1440px`, `1024px`, `390px`) — [`dashboard-1440-rtl-light.png`](design/screens/stage0/dashboard-1440-rtl-light.png), [`tickets-portal-1440-rtl-light.png`](design/screens/stage0/tickets-portal-1440-rtl-light.png)
- **Code:** `frontend/src/components/layout/TopNav.tsx`, `frontend/src/app/tickets/page.tsx`, `frontend/src/app/page.tsx`
- **Problem:** Displays `"المساعد الذكي"` with 4-point `Sparkles` icon in the top header, `"معالج الطلبات الذكي"` + Sparkles in Help Desk, Sparkles on Dashboard `"إجراءات سريعة"`, and Sparkles on the floating inspector button.
- **Remediation (Phase 4C/4D):** Remove all AI-branded labels and Sparkles icons across the entire UI. Replace with functional operational wording (`أوامر سريعة`, `طلب خدمة جديد`) and disciplined 1.5px-stroke Lucide icons.

### #5 — P0: Severe Mobile Header Contrast Failure (`390px`)
- **Screen / Viewport:** `/` Mobile `390×844` Light — [`dashboard-390-rtl-light.png`](design/screens/stage0/dashboard-390-rtl-light.png)
- **Code:** `frontend/src/components/layout/TopNav.tsx`
- **Problem:** Mobile header renders dark maroon/near-black `"Investor Gate OS"` text on a dark charcoal top bar (< 2:1 contrast), making the brand illegible on phones.
- **Remediation (Phase 4C):** Unified `52px` surface top bar (`--surface` / `--border`) across all breakpoints with verified ≥ 7:1 text/logo contrast and `44×44px` minimum touch targets.

### #6 — P0: Critical Accessibility Failures on `/tasks` & `/my-work` (`axe-core`)
- **Screen / Viewport:** `/tasks` (`1440px` RTL) & `/my-work` (`1440px` RTL) — [`tasks-1440-rtl-light.png`](design/screens/stage0/tasks-1440-rtl-light.png)
- **Code:** `frontend/src/app/tasks/page.tsx`, `frontend/src/app/my-work/page.tsx`
- **Problem:** `axe-core` flagged 3 critical violations: 4 unnamed `<select>` filters and 2 icon-only buttons without discernible text on `/tasks`, 1 unnamed SLA `<select>` on `/my-work`, missing `<h1>` landmark on `/tickets`, and 12 `color-contrast` violations across `/`, `/my-work`, `/tickets`, `/tasks`.
- **Remediation (Phase 4A–4D):** Every primitive enforces accessible labels (`aria-label`/`<label>`), semantic landmarks (`<main>`, `<nav>`, `<aside>`, single `<h1>`), and verified AA contrast; axe-core gate requires 0 critical / 0 serious per phase.

### #7 — P1: Tablet `1024px` Global TopNav Clipping & Table Column Loss
- **Screen / Viewport:** `/tasks` & `/tickets` at `1024×768` — [`tasks-1024-rtl-light.png`](design/screens/stage0/tasks-1024-rtl-light.png), [`tickets-inbox-1024-rtl-light.png`](design/screens/stage0/tickets-inbox-1024-rtl-light.png)
- **Code:** `frontend/src/components/layout/TopNav.tsx`, `frontend/src/components/tasks/TasksDataTable.tsx`
- **Problem:** TopNav packs 7+ wide pills (company switcher, search, density toggle, AI pill, fullscreen, theme, Telegram pill, notifications, profile), clipping the inline-end user controls at `1024px`. On `/tasks`, the data table overflows horizontally, hiding due date, remaining time, and row actions.
- **Remediation (Phase 4C/4D):** Streamline TopNav to exactly 4 calm controls (`Company Switcher`, `Command Search ⌘K`, `Notifications`, `User Menu`) inside a clean `52px` bar; make tables responsive with sticky headers, column chooser, and `36px/44px` density toggle.

### #8 — P1: 3-Tier Stacked Chrome Pushing Help Desk Composer Below the Fold
- **Screen / Viewport:** `/tickets` Inbox at `1440×900` & `390×844` — [`tickets-inbox-1440-rtl-light.png`](design/screens/stage0/tickets-inbox-1440-rtl-light.png), [`tickets-inbox-390-rtl-light.png`](design/screens/stage0/tickets-inbox-390-rtl-light.png)
- **Code:** `frontend/src/app/tickets/page.tsx`, `frontend/src/components/work-management/HelpDeskInboxView.tsx`
- **Problem:** Stacking TopNav + 6-tab service ribbon + saved-view chip strip + 4 dropdown filter bars consumes ~240px vertically on desktop and >500px on mobile, pushing the ticket timeline and reply composer below the fold and creating a claustrophobic workspace.
- **Remediation (Phase 4B/4D):** Collapse Help Desk into a clean single-row page header + 3-region resizable split-pane (`List | Thread + Sticky Signature Composer | Context Panel`) occupying `calc(100vh - 52px)`, collapsing to stacked list → detail with sticky bottom composer on mobile.

### #9 — P1: External Google Fonts CDN, Unmatched `Inter` Pairing & Weight Sprawl
- **Screen / Viewport:** Global (all screens)
- **Code:** `frontend/src/app/globals.css:8`, `frontend/src/app/layout.tsx`
- **Problem:** Loads `IBM Plex Sans Arabic` + `Inter` from `fonts.googleapis.com` (breaks strict self-hosted/CSP/offline operation), loads 5 weights (`300–700`), and pairs `Inter` with `IBM Plex Sans Arabic` causing vertical baseline/x-height jitter on mixed Arabic/English lines (`TCK-2026-0049`, `SLA`).
- **Remediation (Phase 4A):** Self-host `IBM Plex Sans Arabic` + metric-matched `IBM Plex Sans` (`next/font/local` or `@fontsource` WOFF2 subsets, `font-display: swap`), strictly weights `400/500/600`, `1.6` Arabic body line-height, `tabular-nums`, and `<bdi>`/`dir="auto"` wrapping.

### #10 — P1: Missing Global Arabic/English LTR Parity & Bidi Punctuation Corruption
- **Screen / Viewport:** `/tickets` & `/` LTR `1440×900` — [`tickets-inbox-1440-ltr-light.png`](design/screens/stage0/tickets-inbox-1440-ltr-light.png), [`dashboard-1440-ltr-light.png`](design/screens/stage0/dashboard-1440-ltr-light.png)
- **Code:** `frontend/src/lib/i18n.ts`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/app/tickets/page.tsx`
- **Problem:** Switching to `dir="ltr" lang="en"` does not translate shell navigation or legacy views; Arabic text renders left-aligned with inverted punctuation (`.اختر من دليل الخدمات`, `1. تصنيف المشكلة`, `SLA التوزيع و`). Directional chevrons/arrows also fail to mirror consistently.
- **Remediation (Phase 4A–4D):** Externalize all UI copy through a unified reactive `ar`/`en` locale context, apply logical CSS properties exclusively (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `border-s-*`), wrap mixed identifiers in `<bdi>`, and mirror directional icons automatically.

### #11 — P1: Mixed Raw English Enums & Inconsistent Numerals Inside Arabic UI
- **Screen / Viewport:** `/tickets`, `/tasks`, `/settings/work-management` — [`tickets-inbox-1440-rtl-light.png`](design/screens/stage0/tickets-inbox-1440-rtl-light.png), [`settings-wm-1440-rtl-light.png`](design/screens/stage0/settings-wm-1440-rtl-light.png)
- **Code:** `HelpDeskInboxView.tsx`, `TasksDataTable.tsx`, `settings/work-management/page.tsx`
- **Problem:** Raw English statuses (`In Progress`, `Medium`, `Draft`, `To Do`, `Pending Approval`) and raw snake_case engine enums (`least_loaded`, `round_robin`) appear untranslated beside Arabic labels; Arabic-Indic dates (`٢٠٢٦/١١/٢٣`) clash with Western ticket IDs (`TCK-2026-0049`).
- **Remediation (Phase 4A/4D):** Centralize status/priority/strategy label formatters for both Arabic and English; standardize numeral formatting with Western tabular digits default for IDs/SLA timers/costs and optional user preference for Hijri/Gregorian dates and Arabic-Indic prose digits.

### #12 — P1: Dashboard Visual Overload & Misleading Hardcoded Metrics
- **Screen / Viewport:** `/` (`1440×900` Light/Dark, `390×844` Mobile) — [`dashboard-1440-rtl-light.png`](design/screens/stage0/dashboard-1440-rtl-light.png), [`dashboard-390-rtl-light.png`](design/screens/stage0/dashboard-390-rtl-light.png)
- **Code:** `frontend/src/app/page.tsx`
- **Problem:** Packs 8 KPI cards, 3 feed sections, 2 donut charts, and a quick-actions strip onto one screen; displays a hardcoded `72%` completion ring while actual data reads `79/239` (`33%`), wraps KPI delta pills (`+12%`, `-29%`) awkwardly at `1024px`, and renders an unadapted clipped desktop `<table>` at `390px`.
- **Remediation (Phase 4D-5):** Redesign Dashboard to max **4 restrained KPI tiles** derived strictly from live API figures, paired with clean custom SVG SLA & workload visuals (no chartjunk) and card-stacked lists on mobile.

### #13 — P2: Cliché Building/Bar-Chart Logo Mark & Inconsistent App Marks
- **Screen / Viewport:** Sidebar & `/login` — [`dashboard-1440-rtl-light.png`](design/screens/stage0/dashboard-1440-rtl-light.png), [`login-1440-rtl-dark.png`](design/screens/stage0/login-1440-rtl-dark.png)
- **Code:** `frontend/src/components/ui/BrandMark.tsx`, `frontend/src/app/login/page.tsx`
- **Problem:** Sidebar uses a literal 3-pillar bar-chart/building icon (`BrandMark.tsx`), while `/login` renders a completely unrelated purple gradient `"IG"` text square. Neither reflects the refined architectural identity of "Investor Gate · بوابة المستثمر".
- **Remediation (Stage 1 → Phase 4A):** Replace everywhere (sidebar, login, favicons 16/32, maskable app icon, loading mark) with the approved original hand-authored "Gate / Threshold" SVG logo system.

### #14 — P2: Dual Active Sidebar Items & Unreadable `Ctrl+K` Search Badge
- **Screen / Viewport:** `/settings/work-management` & Global TopNav — [`settings-wm-1440-rtl-light.png`](design/screens/stage0/settings-wm-1440-rtl-light.png), [`dashboard-1440-rtl-light.png`](design/screens/stage0/dashboard-1440-rtl-light.png)
- **Code:** `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/TopNav.tsx`
- **Problem:** On `/settings/work-management`, both `التوزيع و SLA` and `الإعدادات` satisfy `pathname.startsWith("/settings")` and highlight simultaneously. In Light mode, the TopNav `Ctrl+K` keycap renders dark-on-dark and is nearly illegible.
- **Remediation (Phase 4C):** Use longest-prefix route matching for active nav state (active = `primary-soft` bg + `primary` text + `2px` inline-start indicator bar) and style `<kbd>` hints using `--surface-2` + `--border` + `--text-2`.

### #15 — P2: Theme Persistence Failures, Hydration Errors & Excessive Background Polling
- **Screen / Viewport:** Global (`layout.tsx`, `Sidebar.tsx`, `WorkspaceContext.tsx`)
- **Code:** `frontend/src/app/layout.tsx:40`, `frontend/src/components/layout/Sidebar.tsx:245`, `frontend/src/context/WorkspaceContext.tsx`
- **Problem:** Direct URL navigation unpredictably flips between dark/light/purple/maroon depending on hydration timing; inline `<script dangerouslySetInnerHTML>` triggers React 19 hydration/script warnings; continuous `/api/health` polling creates unnecessary server load and SQLite lock contention in dev.
- **Remediation (Phase 4A/4C):** Clean SSR-safe theme state (`data-theme` without invalid React-body `<script>` injection, mounted-guarded icon toggle, single deterministic theme token source) and polite interval backoff for health indicators.

---

## 4. Stage 0 Screenshot Index (`docs/design/screens/stage0/`)

| File | Route | Viewport | Theme | Direction |
|---|---|---|---|---|
| `login-1440-rtl-dark.png` | `/login` | 1440×900 | Dark (forced) | RTL |
| `dashboard-1440-rtl-light.png` | `/` | 1440×900 | Light | RTL |
| `dashboard-1440-rtl-dark.png` | `/` | 1440×900 | Dark | RTL |
| `dashboard-1440-ltr-light.png` | `/` | 1440×900 | Light | LTR |
| `my-work-1440-rtl-light.png` | `/my-work` | 1440×900 | Light | RTL |
| `my-work-1440-rtl-light-populated.png` | `/my-work` | 1440×900 | Light | RTL |
| `my-work-1440-ltr-light.png` | `/my-work` | 1440×900 | Light | LTR |
| `tickets-portal-1440-rtl-light.png` | `/tickets` (Portal) | 1440×900 | Light | RTL |
| `tickets-inbox-1440-rtl-light.png` | `/tickets` (Inbox) | 1440×900 | Light | RTL |
| `tickets-inbox-1440-rtl-dark.png` | `/tickets` (Inbox) | 1440×900 | Dark | RTL |
| `tickets-inbox-1440-ltr-light.png` | `/tickets` (Portal) | 1440×900 | Light | LTR |
| `tasks-1440-rtl-light.png` | `/tasks` | 1440×900 | Light | RTL |
| `settings-wm-1440-rtl-light.png` | `/settings/work-management` | 1440×900 | Light | RTL |
| `tickets-inbox-1024-rtl-light.png` | `/tickets` | 1024×768 | Light | RTL |
| `tasks-1024-rtl-light.png` | `/tasks` | 1024×768 | Light | RTL |
| `dashboard-390-rtl-light.png` | `/` | 390×844 | Light | RTL |
| `tickets-inbox-390-rtl-light.png` | `/tickets` (Inbox) | 390×844 | Light | RTL |
| `tickets-portal-390-rtl-light.png` | `/tickets` (Portal) | 390×844 | Light | RTL |
| `tickets-kanban-390-rtl-light.png` | `/tickets` (Kanban) | 390×844 | Light | RTL |
| `tasks-390-rtl-light.png` | `/tasks` | 390×844 | Light | RTL |
