# Changelog

All notable changes to **Investor Gate IT Operations Management System (IGOS)** (Original Developer: Moataz Qasem, 2026) are documented in this file.

## [Unreleased] — `feat/helpdesk-assignment`

### Added
- **Data Model & Portable Migration (`20261124_helpdesk_assignment`):**
  - Added 13 company-scoped tables: `teams`, `team_members`, `assignment_rules`, `round_robin_cursors`, `ticket_categories`, `ticket_events`, `workflow_transitions`, `ticket_watchers`, `task_watchers`, `task_checklist_items`, `macros`, `saved_views`, `idempotency_keys`.
  - Additive columns and composite indexes on `sla_policies`, `helpdesk_tickets`, and `tasks`.
  - Non-destructive idempotent backfill of `ticket_comments` -> `ticket_events` and `tasks.assignee_id` from `users.employee_id`.
- **Rule-Driven Assignment Engine (`backend/app/services/assignment.py`):**
  - Pure evaluators (`validate_rule_conditions`, `matches_conditions`, `evaluate_rules`, `select_candidate`) and DB orchestrators supporting `manual`, `round_robin`, `least_loaded`, and `skill_based` strategies.
  - Eligibility filtering (active user, company membership, availability, capacity limit, approved `LeaveRequest`s) and concurrency protection (`pg_advisory_xact_lock` on PostgreSQL, per-team mutex on SQLite).
- **Business-Hours SLA & Idempotent Escalation Worker (`sla_service.py`, `workers/sla_escalation.py`):**
  - Timezone-aware business-hours deadline calculator (default `Asia/Riyadh`, Sun–Thu `08:00–17:00`, holiday skipping, pause/resume clock shifting).
  - Idempotent CLI & protected endpoint escalation job with priority bump and lead reassignment.
- **Work Management APIs & Granular RBAC:**
  - Unified `GET /api/v1/me/work`, `GET /api/v1/workload`, Teams/Rules/Dry-Run/SLA/Workflows/Categories/Macros/SavedViews CRUD, Ticket & Task `/assign`, `/transition`, `/events`, `/bulk` (max 100), `/merge`, `/tasks`, `/checklist`, `/watchers`, `Idempotency-Key` replay, cursor pagination, and `/reports/helpdesk-sla` + `sla_compliance`/`workload` exports.
  - Hardened `GET /api/v1/tickets/voice/{filename}` with authentication, tenant isolation, and path traversal protection; fixed legacy field mismatches in `tickets.py`.
- **Frontend UX:**
  - `/my-work` unified feed, URL-addressable split-pane Help Desk Inbox (`/tickets`) with keyboard shortcuts (`J`/`K`/`A`/`S`/`R`/`N`/`?`), macro picker, bulk action bar, merge, and linked tasks.
  - `/tasks` Workload capacity view, optimistic Kanban rollback, and interactive checklists in `TasksSplitDrawer`.
  - `/settings/work-management` 6-tab admin console (Teams, Rules + Dry-Run simulator, SLA, Workflow Matrix, Categories, Macros) and SLA/Workload analytics on `/reports`.

### Migration & Rollback Notes
- **SQLite (Dev):**
  ```bash
  cd backend
  alembic upgrade head
  # Rollback:
  alembic downgrade 20261120_admin_ops_upgrade
  ```
- **PostgreSQL 16 (Staging/Prod):**
  ```bash
  # Review offline DDL first:
  DATABASE_URL=postgresql://itops_app:<pw>@<host>:5432/itops alembic upgrade 20261120_admin_ops_upgrade:head --sql
  # Apply:
  docker compose exec backend alembic upgrade head
  ```
  *Note: Offline PostgreSQL upgrade and downgrade DDL were verified; run against staging PostgreSQL 16 prior to production deployment.*
