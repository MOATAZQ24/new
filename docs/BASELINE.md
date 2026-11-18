# Phase 0 — Baseline Inventory, Dependency Map & Regression Gate

- **Branch:** `cleanup/full-refactor` (branched from `release/v1.0-closure` commit `c1e730a`)
- **Timestamp:** 2026-11-18T13:23:28+03:00

---

## 1. Repository Inventory & Baseline Metrics

| Layer | File Count | Lines of Code (LOC) | Inventory Details |
|---|---|---|---|
| **Backend (`backend/app`)** | 80 | 23,367 | 22 endpoint modules, 17 SQLAlchemy model modules, 16 Pydantic schema modules, 15 service modules, 5 core modules |
| **Frontend (`frontend/src`)** | 55 | 26,407 | 24 route pages (`app/**/page.tsx`), 23 reusable UI/feature components (`components/**/*.tsx`), 3 React contexts, 5 utility/hook libraries |
| **Backend Test Suite (`backend/tests`)** | 34 | 9,199 | Direct module runner (`run_all_tests.py`), unit/security/RBAC/tenant isolation suites, and Playwright E2E suites |
| **Alembic Migrations (`backend/alembic/versions`)** | 6 | 248 | `20261113_workspace` -> `20261117_telegram_identity` -> `20261117_telegram_scope` -> `20261117_ai_agent_exec` -> `20261117_enterprise_v3` -> `20261118_enterprise_qa_v3` |

### 1.1 Backend Modules
- **Core (`backend/app/core/`):** `config.py`, `database.py`, `rbac.py`, `response.py`, `security.py`
- **API v1 Endpoints (`backend/app/api/v1/endpoints/`):** `assets.py`, `audit.py`, `auth.py`, `companies.py`, `custody.py`, `customization.py`, `dashboard.py`, `digital_assets.py`, `employees.py`, `enterprise.py`, `infrastructure.py`, `integrations.py`, `maintenance.py`, `notifications.py`, `reports.py`, `subscriptions.py`, `system.py`, `tasks.py`, `telegram.py`, `tickets.py`, `users.py`, `workspace.py`
- **Models (`backend/app/models/`):** `asset.py`, `audit.py`, `base.py`, `company.py`, `customization.py`, `digital_asset.py`, `enterprise.py`, `infrastructure.py`, `integration.py`, `maintenance.py`, `notification.py`, `subscription.py`, `task.py`, `telegram.py`, `ticket.py`, `user.py`, `workspace.py`
- **Schemas (`backend/app/schemas/`):** `asset.py`, `audit.py`, `auth.py`, `company.py`, `customization.py`, `dashboard.py`, `digital_asset.py`, `employee.py`, `infrastructure.py`, `maintenance.py`, `notification.py`, `subscription.py`, `task.py`, `ticket.py`, `user.py`, `workspace.py`
- **Services (`backend/app/services/`):** `arabic_nlp.py`, `audit_service.py`, `email_service.py`, `enterprise_service.py`, `integration_service.py`, `notification_service.py`, `recovery_service.py`, `task_assignment.py`, `task_service.py`, `task_workflow.py`, `telegram_permissions.py`, `telegram_router.py`, `telegram_service.py`, `vault_service.py`, `webhook_service.py`

### 1.2 Frontend Pages & Components
- **Pages (`frontend/src/app/`):**
  - `/` (`page.tsx` — Dashboard)
  - `/companies` (`companies/page.tsx` — Companies & 5 Canonical Branches)
  - `/employees` (`employees/page.tsx` — Employee Directory) & `/employees/[id]` (`employees/[id]/page.tsx` — Employee 360° Profile)
  - `/assets` (`assets/page.tsx` — Technical Assets) & `/custody` (`custody/page.tsx` — Asset Custody & Handover)
  - `/subscriptions` (`subscriptions/page.tsx` — Subscriptions & Licenses + M:N Employee Seats)
  - `/tickets` (`tickets/page.tsx` — Help Desk)
  - `/tasks` (`tasks/page.tsx` — Tasks & Deadlines)
  - `/reports` (`reports/page.tsx` — Reports & CSV/PDF Exports)
  - `/settings` (`settings/page.tsx`), `/settings/appearance`, `/settings/branding`, `/settings/integrations`, `/settings/system`
  - Supporting admin routes: `/users`, `/audit`, `/notifications`, `/digital-assets`, `/infrastructure`, `/maintenance`, `/login`, `/forgot-password`, `/reset-password`
- **Components (`frontend/src/components/`):**
  - Layout & Auth: `layout/DashboardLayout.tsx`, `layout/Sidebar.tsx`, `layout/TopNav.tsx`, `auth/MustChangePasswordModal.tsx`
  - Telegram & Workspace: `telegram/TelegramActionPermissions.tsx`, `telegram/TelegramLinkingModal.tsx`, `workspace/TablePreferences.tsx`, `workspace/WorkspaceSettings.tsx`
  - UI Primitives: `ui/AlertBanner.tsx`, `ui/Badge.tsx`, `ui/BranchIntelligenceFilterBar.tsx`, `ui/BrandMark.tsx`, `ui/DataToolbar.tsx`, `ui/EmployeeCombobox.tsx`, `ui/EmptyState.tsx`, `ui/EnterpriseCharts.tsx`, `ui/Icons.tsx`, `ui/Modal.tsx`, `ui/PageHeader.tsx`, `ui/Pagination.tsx`, `ui/ReorderList.tsx`, `ui/StatsCard.tsx`, `ui/TableSkeleton.tsx`

---

## 2. Dependency & Usage Map

### 2.1 Backend Router -> Service -> Model Map
- `auth.py` -> `security.py`, `recovery_service.py`, `audit_service.py` -> `User`, `UserSession`, `CompanyMembership`, `PasswordResetToken`
- `companies.py` -> `enterprise_service.py`, `audit_service.py` -> `Company`, `Branch`, `Department`, `PhysicalBranchLocation`
- `employees.py` -> `enterprise_service.py`, `arabic_nlp.py`, `audit_service.py` -> `Employee`, `EmployeeBranchAssignment`, `EmployeeAssignmentHistory`, `User`, `AssetCustody`, `EmployeeSubscription`
- `users.py` -> `security.py`, `rbac.py`, `audit_service.py` -> `User`, `Role`, `UserRole`, `CompanyMembership`
- `assets.py` & `custody.py` -> `enterprise_service.py`, `audit_service.py`, `notification_service.py` -> `TechnicalAsset`, `AssetCustody`, `AssetBranchTransfer`
- `subscriptions.py` -> `audit_service.py`, `notification_service.py` -> `ThirdPartySubscription`, `EmployeeSubscription`, `Employee`, `Branch`
- `tasks.py` -> `task_workflow.py`, `task_assignment.py`, `task_service.py`, `telegram_service.py` -> `Task`, `TaskComment`, `NotificationOutbox`, `TelegramUserLink`
- `tickets.py` -> `audit_service.py`, `notification_service.py` -> `HelpDeskTicket`, `TicketComment`, `Task`
- `dashboard.py` & `reports.py` -> `enterprise_service.py`, `task_workflow.py` -> Aggregates across `TechnicalAsset`, `HelpDeskTicket`, `Task`, `Employee`, `ThirdPartySubscription`, `Company`, `Branch`, `Notification`, `IntegrationConfig`
- `telegram.py` & `integrations.py` -> `telegram_service.py`, `telegram_router.py`, `telegram_permissions.py`, `integration_service.py` -> `TelegramUserLink`, `NotificationOutbox`, `TelegramActionLog`, `TelegramBotMenuConfig`, `TelegramMessageTemplate`, `IntegrationConfig`, `IntegrationLog`
- `digital_assets.py` -> `vault_service.py`, `audit_service.py` -> `DigitalAsset`, `AssetSecret`, `AssetAccessPermission`
- `workspace.py` & `customization.py` -> `WorkspacePreference`, `CompanyWorkspace`, `UserWorkspacePreference`, `CompanyBranding`
- `system.py` -> `audit_service.py` -> Database backup/restore & health diagnostics

### 2.2 Frontend Page -> Component -> API Client Map
- All pages use `frontend/src/lib/api.ts` (`api.get`, `api.post`, `api.put`, `api.patch`, `api.delete`, `exportReportDownload`) with `API_BASE = "/api/v1"`.
- Shared layout (`DashboardLayout` -> `Sidebar` + `TopNav` + `MustChangePasswordModal`) wraps all authenticated routes.

---

## 3. Baseline Regression Gate Results

| Check | Command | Baseline Status | Details |
|---|---|---|---|
| **Backend 13-Module Test Runner** | `python backend/tests/run_all_tests.py` | **PASS (Exit 0)** | `13/13` modules verified (`ALL 13 SYSTEM MODULES PASSED ALL VERIFICATIONS SUCCESSFULLY!`) |
| **Backend Unittest Suites** | `python -m unittest ...` | **PASS (Exit 0)** | `101/101` unittests + `40/40` workflow E2E + `11/11` task collaboration API checks passed |
| **Frontend TypeScript** | `npx.cmd tsc --noEmit` | **PASS (Exit 0)** | `0` type errors |
| **Frontend ESLint** | `npm.cmd run lint` | **PASS (Exit 0)** | `0` errors, `35` warnings |
| **Frontend Next.js Build** | `npm.cmd run build` | **PASS (Exit 0)** | 24 routes compiled in `1.64s` |
| **Docker Compose Config** | `docker compose config --quiet` | **PASS (Exit 0)** | `0` warnings |
