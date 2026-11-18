# Investor Gate OS — Full Cleanup, Security Hardening & Deployment Audit Report

- **Branches:** `cleanup/full-refactor` & `release/v1.0-closure` (`master`/`main` untouched)
- **Alembic Head Revision:** `20261118_enterprise_qa_v3`
- **Date:** 2026-11-18
- **Final Decision:** **GO FOR RELEASE** (`0` remaining blockers)

---

## 1. What Was Removed (With Proof)

| Removed Item | Type | Proof of Non-Use / Reason | Commit |
|---|---|---|---|
| `backend/app/api/v1/endpoints/ai_agent.py`, `backend/app/schemas/ai_agent.py`, `backend/app/services/ai_agent_service.py`, `backend/app/services/ai_agent_tools.py`, `backend/app/services/gemini_service.py`, `backend/app/models/ai_agent.py`, `frontend/src/components/ai/AiAgentSidePanel.tsx` | Unapproved AI / Gemini Feature | Removed per release scope directive; verified `0` remaining source references via AST + `Select-String` and `404 Not Found` on `POST /api/v1/ai/agent/chat`. | `c1e730a` |
| `backend/app/schemas/audit.py`, `backend/app/schemas/dashboard.py`, `backend/app/schemas/notification.py` | Unused Pydantic Schemas | AST & repository-wide grep showed `0` references outside `schemas/__init__.py`. | `a163e3f` |
| `frontend/src/components/ui/BranchIntelligenceFilterBar.tsx`, `frontend/src/components/workspace/WorkspaceSettings.tsx` | Unused React Components | Repository-wide `.ts`/`.tsx` scan showed `0` imports across `frontend/src`. | `a163e3f` |
| `aiofiles`, `openpyxl`, `reportlab`, `arabic-reshaper`, `python-bidi`, `jinja2`, `aiosqlite`, `asyncpg` in `backend/requirements.txt` | Unused Python Dependencies | Static import scan across all `.py` files confirmed `0` imports (CSV export uses stdlib `csv` + UTF-8 BOM; PDF export uses printable HTML; SQLAlchemy uses `psycopg2-binary` / `sqlite3`). Reduced `requirements.txt` from `22` to `14` pinned packages. | `a163e3f` |

---

## 2. What Was Fixed (Defects, Security & Deployment)

| Category | Defect / Vulnerability Found | Root Cause & Fix Implemented | Verification |
|---|---|---|---|
| **PostgreSQL Fresh Startup (`database.py`)** | `RuntimeError: Schema migration failed for users.must_change_password; startup aborted` (`relation "users" does not exist`) when starting `backend` against a brand-new empty PostgreSQL 16 database. | `_migrate_columns()` checked table existence on SQLite (`sqlite_master`) but ran `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on PostgreSQL before `Base.metadata.create_all()` or `alembic upgrade head` created the tables. Updated `_migrate_columns()` in `backend/app/core/database.py` to check `inspect(conn).get_table_names()` for both SQLite and PostgreSQL, and updated `backend/Dockerfile` CMD to run `alembic upgrade head` prior to `uvicorn`. | Verified on live `postgres:16.6-alpine` container (`itops-staging-backend` healthy). |
| **PostgreSQL Fresh Migration (`20261113_workspace.py` & `20261117_telegram_identity.py`)** | `20261113_workspace.py` created `workspace_preferences` (which has FKs to `users.id` and `companies.id`) before base tables existed on an empty PostgreSQL database. | Added `Base.metadata.create_all(bind=bind, checkfirst=True)` to `20261113_workspace.py` and `20261117_telegram_identity.py`. | `alembic upgrade head` -> `downgrade -1` -> `upgrade head` succeeded on fresh PostgreSQL 16.6 and SQLite. |
| **PostgreSQL Backup & Restore (`system.py`)** | `POST /api/v1/system/backup` previously returned a placeholder string on PostgreSQL, and `restore` did not handle cyclic nullable FKs (`companies`, `branches`, `departments`, `users`, `employees`) or `Decimal` serialization. | Implemented full SHA-256-verified JSON/SQL snapshot creation, verification (`POST /api/v1/system/backups/{filename}/verify`), and two-pass cycle-safe transactional restore (`POST /api/v1/system/backups/{filename}/restore`) in `backend/app/api/v1/endpoints/system.py`. | Verified end-to-end against deployed PostgreSQL 16.6 (`pg_dump_20261118_105517_005151.sql`, `sha256: 57ffcde2...`). |
| **First-Admin Default Credentials (`seed_data.py`)** | `seed_data.py` previously seeded `admin` with hardcoded `Admin@12345` regardless of environment. | Enforced `ADMIN_INITIAL_PASSWORD` (>=12 chars, non-default) when `ENVIRONMENT` is `staging`/`production` or `ENFORCE_NO_DEFAULT_CREDENTIALS=true`, refused execution in `production` without `ALLOW_PRODUCTION_BOOTSTRAP=true`, and set `must_change_password=True`. | Verified in `itops-staging`: missing/default password exited with code `1`; strong password succeeded; login with `Admin@12345` returned `401`. |
| **Production Weak `SECRET_KEY` Fail-Fast (`config.py`)** | Backend previously allowed starting in production with a default `SECRET_KEY`. | Added `settings.validate_production_security()` in `backend/app/core/config.py` and `backend/app/main.py` lifespan to abort startup if `ENVIRONMENT=production` and `SECRET_KEY` is default or `<32` chars. | Unit & config verification passed. |
| **Docker Compose & Least-Privilege DB Role (`docker-compose.yml`, `init-app-db.sh`)** | `docker-compose.yml` previously had weak fallbacks (`changeme`), published `5432`, `8000`, and `3000` on the host, ran `backend` as `root`, and connected to PostgreSQL as superuser `postgres`. | Hardened `docker-compose.yml`: required `${DB_PASSWORD:?}`, `${APP_DB_PASSWORD:?}`, `${SECRET_KEY:?}`; internal `expose` only for `db`/`backend`/`frontend`; non-root `appuser`/`nextjs`; healthchecks + resource limits; and `docker/postgres/init-app-db.sh` creating non-superuser `itops_app` (`usesuper = False`). | Verified on live `itops-staging` stack (`SELECT current_user, usesuper` -> `('itops_app', False)`). |
| **Ticket Numbering Race Condition & N+1 Queries (`tickets.py`, `tasks.py`)** | `generate_ticket_number` used `count() + 1` without locking; `list_tickets` and `list_tasks` lazy-loaded related entities per row. | Added per-company row lock (`with_for_update()`) + max sequence scan in `generate_ticket_number`, and added `joinedload`/`selectinload` in `list_tickets` and `list_tasks`. | Verified in `run_all_tests.py` and staging API tests. |

---

## 3. Before / After Metrics

| Metric | Baseline (Phase 0) | Post-Refactor (Phase 6) | Delta |
|---|---|---|---|
| **Backend `app/` Files** | 80 | 77 | `-3` unused schema modules removed (`-7` AI modules removed in closure) |
| **Frontend `src/` Files** | 55 | 53 | `-2` unused component modules removed |
| **Backend `requirements.txt` Packages** | 22 (unpinned `>=`) | 14 (pinned `==`) | `-8` unused heavy packages removed (`-36%`) |
| **Docker Build Context (`backend` / `frontend`)** | `236.38 MB` | `21.65 KB` / `4.80 KB` | `-99.99%` context transfer size via `.dockerignore` |
| **PostgreSQL App DB Role Superuser Status** | `postgres` (`usesuper=True`) | `itops_app` (`usesuper=False`) | Least-privilege enforced |
| **Exposed Host Ports in `docker-compose.yml`** | `5432`, `8000`, `3000`, `80`, `443` | `80`, `443` (Nginx only) | Internal services isolated on `itops-network` |

---

## 4. Needs Human Decision (Preserved Safely)

1. **`backend/app/api/v1/endpoints/enterprise.py` (`hrm_router`, `crm_router`, `projects_router`, `approvals_router`):**
   - Although the standalone frontend pages (`/crm`, `/hrm`, `/projects`, `/approvals`) were removed to match the strict 9-module UI scope, these backend endpoints are still exercised by `backend/tests/test_enterprise_v3.py` and `backend/tests/test_enterprise_deep_audit.py` and share tables with `/employees/[id]` (`profile360`). Kept intact so no existing test or database table is broken; human product owner can decide whether to archive those API sub-routers in a future major version.
2. **Legacy Alembic Migration `20261117_ai_agent_executions.py`:**
   - Preserved in `backend/alembic/versions/` because `20261117_enterprise_v3.py` depends on `down_revision = "20261117_ai_agent_exec"` and existing SQLite databases record that revision in `alembic_version`.

---

## 5. Rollback Note
- To revert to the pre-refactor closure commit: `git checkout c1e730a` (or `git checkout 22d1ae2` for pre-closure).
- To roll back one database migration revision: `alembic downgrade -1`.
- To restore a database snapshot via API: `POST /api/v1/system/backups/{filename}/restore`.
