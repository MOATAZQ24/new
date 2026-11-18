# Phase 0 — UI/UX Baseline Audit & Component Evaluation

- **Branches:** `ui/ready-made-components` & `ui/professional-refinement`
- **Baseline Screenshots:** `C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\ui_refinement\before\`

---

## 1. Visual & Accessibility Issues Identified in Baseline Audit

| Severity | Component / Page | Issue Identified in Baseline Screenshot (`before_settings_1440.png`) | Target Fix |
|---|---|---|---|
| **High** | `frontend/src/app/settings/page.tsx` (`التكاملات` Card) | All three integration rows (`Telegram`, `Google Calendar / الأتمتة`, `البريد الإلكتروني`) rendered the identical `<Icons.Send />` paper-plane icon instead of distinct service icons (`Send`, `Calendar`, `Mail`), and lacked clear connection/configuration status badges (`متصل`, `مفعل`, `غير مفعل`). | Integrate `lucide-react` service icons (`Send`, `Calendar`, `Mail`), add semantic connection/configuration status pills, and use an accessible `@radix-ui/react-switch` (`Switch` component) with RTL-aware thumb translation. |
| **High** | `frontend/src/app/settings/page.tsx` (Account Profile Card) | When logged in as a system account (`admin`) without a linked employee row, the card displayed two large empty grey boxes (`—`) and a crowded, wrapping row of 6 dark green role pills (`Employee`, `IT Technician`, `IT Manager`, `Company Admin`, `Super Admin`, `Auditor`). | Display structured profile rows distinguishing `اسم العرض`, `اسم المستخدم`, `البريد الإلكتروني`, `المسمى الوظيفي / الصفة`, and replace the crowded badge row with a primary role badge + clean expandable/structured role summary preserving multi-role visibility. |
| **High** | `frontend/src/app/settings/page.tsx` (`تغيير كلمة المرور` Card) | Password inputs lacked show/hide visibility toggles (`Eye`/`EyeOff`), used inconsistent `py-2 text-xs` heights (`~32px` instead of standard `40px` `h-10`), and had unbalanced vertical spacing relative to the adjacent profile card. | Standardize inputs to `h-10` (`40px`) with accessible show/hide password toggle buttons (`aria-label`), clear validation rules hint, and balanced card layout. |
| **Medium** | `frontend/src/app/settings/page.tsx` (`مظهر النظام` Card) | Theme selector buttons (`فاتح`, `داكن`, `تلقائي`) lacked the top-corner active checkmark badge shown in the reference design. | Add the active checkmark indicator badge on the selected theme option and standardize equal-height selectable tiles. |
| **Medium** | `frontend/src/app/settings/page.tsx` (`معلومات النظام` Card) | System Info card showed only 4 basic rows without live backup count or DB engine indicator from `/api/v1/system/health`. | Display compact, real-time diagnostic rows (`إصدار النظام`, `قاعدة البيانات`, `آخر نسخة احتياطية / السجلات`, `حالة الخدمات`, `الحساب النشط`) using real API data without hardcoding. |
| **Medium** | `frontend/src/app/globals.css` & Shared Primitives (`Badge.tsx`, `StatsCard.tsx`, `DataToolbar.tsx`, `PageHeader.tsx`, `Modal.tsx`) | Control heights varied between `30px`, `34px`, and `38px`; border radii and focus rings were not unified around a 4px spacing scale and `8–12px` radius scale. | Consolidate design tokens in `globals.css` and shared `shadcn/ui`-compatible primitives (`src/lib/utils.ts`, `src/components/ui/switch.tsx`, `Badge.tsx`, `DataToolbar.tsx`, `StatsCard.tsx`, `PageHeader.tsx`). |
| **Low** | `frontend/src/components/layout/Sidebar.tsx` & `TopNav.tsx` | Header controls had slightly different heights (`py-1`, `py-1.5`, `p-2`) and Sidebar active item indicator could be crisper in both expanded and collapsed modes. | Standardize header interactive controls to `h-9` (`36px`) with consistent borders/hover states and refine Sidebar navigation item spacing and active indicator bar. |

---

## 2. Ready-Made Open-Source Component Evaluation (Phase 1)

| Library / Source | License | Evaluation Decision | Usage in Investor Gate OS |
|---|---|---|---|
| **`lucide-react`** (`https://lucide.dev`) | ISC | **INSTALLED & ADOPTED** | Crisp, standardized 16–20px vector icons (`Send`, `Calendar`, `Mail`, `Eye`, `EyeOff`, `ShieldCheck`, `Database`, `Server`, `CheckCircle2`, etc.) replacing duplicated/missing custom SVGs in `Icons.tsx` and `settings/page.tsx`. |
| **`@radix-ui/react-switch`** (`https://www.radix-ui.com/primitives`) | MIT | **INSTALLED & ADOPTED** | Accessible WAI-ARIA `role="switch"` primitive (`frontend/src/components/ui/switch.tsx`) with keyboard (`Space`/`Enter`) and RTL thumb translation support. |
| **`clsx` + `tailwind-merge`** (`https://ui.shadcn.com`) | MIT | **INSTALLED & ADOPTED** | Standard `cn()` class merging utility (`frontend/src/lib/utils.ts`) used across `shadcn/ui`-aligned components (`Switch`, `Badge`, `StatsCard`, `DataToolbar`, `PageHeader`, `Modal`). |
| **`@tanstack/react-table`** (`https://tanstack.com/table`) | MIT | **NOT NEEDED (Avoided Bloat)** | Existing module tables (`/employees`, `/assets`, `/subscriptions`, `/tasks`, `/tickets`) already implement server-side sorting, filtering, pagination, and custom RTL row actions cleanly. Adding TanStack Table would duplicate working logic. |
