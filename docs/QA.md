# Quality Assurance & Verification Log (`docs/QA.md`)

## Track 1: `feat/helpdesk-assignment` (Phases 1–4 + Docs)
- **Date:** 2026-11-24
- **Branch:** `feat/helpdesk-assignment`
- **Automated Verification Results:**
  - `backend/tests/test_helpdesk_migration.py`: **PASS** (SQLite upgrade -> downgrade -> re-upgrade preserved 68 tickets, 99 comments -> 99 events, 302 tasks; offline PostgreSQL upgrade/downgrade DDL verified)
  - `backend/tests/test_assignment_engine.py`: **PASS** (condition allowlist, rule ordering/`stop_on_match`, all 4 strategies, leave/capacity/watchers, 8-thread parallel concurrency test `u1=3, u2=3, unassigned=2`)
  - `backend/tests/test_sla_escalation.py`: **PASS** (business hours across shifts, Saudi Fri–Sat weekends, holidays, 24/7, pause/resume clock shifting, escalation worker idempotency)
  - `backend/tests/test_work_management_api.py`: **PASS** (teams, rules, reorder, dry-run, `Idempotency-Key` replay, transitions `409`, linked-task close gate `409`, merge, bulk partial results, `/me/work`, `/workload`, SLA reports & UTF-8 BOM CSV / HTML export, service-token trigger)
  - `backend/tests/test_work_management_security.py`: **PASS** (spoofed `company_id` `422`, cross-company BOLA/IDOR `403`/`404` across all new endpoints, voice file auth & path traversal defense, granular RBAC matrix across Admin/Technician/Employee/Auditor)
  - `backend/tests/run_all_tests.py`: **PASS** (13/13 modules)
  - `backend/tests/test_user_management.py`: **PASS**
  - `backend/tests/test_vault_customization.py`: **PASS**
  - `backend/tests/test_tasks_api.py`: **PASS**
  - `backend/tests/test_task_collaboration.py`: **PASS** (11/11)
  - `backend/tests/test_security_regressions.py`: **PASS** (28/28)
  - `frontend tsc --noEmit`: **PASS** (0 errors)
  - `frontend eslint` (all new Phase 4 files): **PASS** (0 errors, 0 warnings)
  - `scripts/verify_attribution.py`: **PASS** (100% IGOS-DAPF compliant)

## Track 2: `feat/ui-redesign`
- Pending Stage 0 Audit & Stage 1 Design Brief approval.

---

## Track 2 (`feat/ui-redesign`) — Stage 0 Baseline Audit & Stage 1 Brief Sign-Off (2026-11-24)

### Stage 0 Automated Baseline (`@axe-core/playwright`, Desktop `1440×900` RTL)
- `/login`: `0` critical, `0` serious, `1` moderate (`region`)
- `/`: `0` critical, `1` serious (`color-contrast` × 2 nodes)
- `/my-work`: `1` critical (`select-name`), `1` serious (`color-contrast`), `1` moderate (`region`)
- `/tickets`: `0` critical, `1` serious (`color-contrast`), `1` moderate (`page-has-heading-one`)
- `/tasks`: `2` critical (`button-name` × 2, `select-name` × 4), `1` serious (`color-contrast` × 8)
- **Baseline Screenshots:** 19 captures stored in `docs/design/screens/stage0/` (`1440/1024/390`, Light/Dark, RTL/LTR).
- **Stage 1 Deliverables Ready for Review:** `docs/AUDIT.md`, `docs/DESIGN.md`, `docs/DECISIONS.log`, `docs/design/explorations/` (3 hand-authored SVG Gate logo directions + rendered PNG specimens).
- **Status:** **APPROVED** — Direction A ("The Rising Threshold" / العتبة الصاعدة) + Warm Paper / Petrol Light & Deep Slate Ink Dark WCAG 2.2 AA tokens approved.

---

## Track 2 — Phase 4A (Tokens, Brand Kit, 19 CVA Primitives, `/design` Lab) + Calm App Shell & Split Login (2026-11-24)

### Build, Type, Lint, Attribution & Backend Verification
- **Production Next.js Build (`next build`, Next.js 16.4.6 Turbopack):** **PASS** (compiled cleanly in 3.7s incremental / 8.9s full; 0 errors)
- **`frontend tsc --noEmit`:** **PASS** (0 errors)
- **`scripts/verify_attribution.py`:** **PASS** (367/367 first-party files verified for Moataz Qasem / IGOS-DAPF)
- **Backend Regression Verification:**
  - `backend/tests/run_all_tests.py`: **PASS** (13/13 modules)
  - `backend/tests/test_work_management_api.py`: **PASS**
  - `backend/tests/test_work_management_security.py`: **PASS**
  - `backend/tests/test_sla_escalation.py`: **PASS**

### Live Production Browser & Accessibility Verification (`@axe-core/playwright`, Chromium)
- **`/design` dev-only gating:** Verified HTTP `404` in production build when `NEXT_PUBLIC_DESIGN_LAB` is unset.
- **Self-hosted typography:** All 6 WOFF2 weights loaded (`IBM Plex Sans Arabic 400/500/600`, `IBM Plex Sans 400/500/600`); **0 external `fonts.googleapis.com` / `fonts.gstatic.com` requests**.
- **Design Hard-Ban Checks (across `/login`, `/`, `/my-work`, `/tickets`, `/tasks` at `1440`, `1024`, `390`):**
  - `hasExposedCreds: false` on `/login`
  - `hasDevHud: false` across all routes (Dev Toolkit gated behind `NEXT_PUBLIC_DEV_TOOLKIT=1`, default OFF)
  - `hasAiBranding: false` across desktop & mobile (zero `"المساعد الذكي"` / `"معالج الطلبات الذكي"` / `Sparkles`)
  - **0 horizontal overflows** (`scrollWidth === clientWidth`) across `1440`, `1024`, and `390` viewports
  - **0 failed `/api/` requests** after authentication
- **Dark Mode Fix (`@custom-variant dark` + `applyTheme.ts`):** Verified authentic Sidebar theme toggle renders deep slate ink surfaces, crisp white typography, and WCAG AA active bars across Sidebar, TopNav, and Dashboard cards.
- **`@axe-core/playwright` Live Results (Production Build):**
  - `/login` (`1440×900` RTL Light): `0` critical, `0` serious, `0` moderate, `0` minor
  - `/my-work` (`1440×900` RTL Light): `0` critical, `0` serious, `0` moderate, `0` minor
  - `/tickets` (`1440×900` RTL Light): `0` critical, `0` serious, `1` moderate (`page-has-heading-one`, slated for Phase 4D)
  - `/` (`1440×900` RTL Light): `0` critical, `1` serious (legacy KPI badge on dashboard body, slated for Phase 4D)
- **Verification Screenshots:** Saved in `docs/design/screens/4a/` (`login-1440-rtl-light.png`, `login-390-rtl-light.png`, `dashboard-1440-rtl-light.png`, `dashboard-1440-rtl-dark.png`, `dashboard-1024-rtl-light.png`, `dashboard-390-rtl-light.png`, `my-work-1440-rtl-light.png`, `tickets-1440-rtl-light.png`, `tasks-1440-rtl-light.png`, plus `/design` lab matrix).
