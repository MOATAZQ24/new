# Investor Gate IT Operations Management System — API Documentation

## 1. Overview
The platform provides a comprehensive RESTful API built on **FastAPI** with automatic OpenAPI documentation.

Interactive OpenAPI documentation is accessible at:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`
- **OpenAPI Schema:** `http://localhost:8000/openapi.json`

---

## 2. Authentication & Headers
Authentication is handled via session tokens sent in secure HttpOnly cookies (`session_token`) or Bearer header (`Authorization: Bearer <session_token>`).

### Multi-Tenant Company Scope Header:
All requests must pass the target company context via:
```http
X-Company-ID: <company_uuid>
```
If omitted, the backend defaults to the user's primary assigned company membership.

---

## 3. Unified Response Envelope
All successful API responses return a standardized JSON structure:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "pagination": {
    "total": 100,
    "page": 1,
    "per_page": 20,
    "total_pages": 5
  }
}
```

---

## 4. Endpoint Catalog Summary

### Authentication (`/api/v1/auth`)
- `POST /login`: Authenticate with username and password. Sets HttpOnly cookie.
- `POST /logout`: Invalidate active session token.
- `GET /me`: Return current user profile, roles, and accessible companies.
- `POST /change-password`: Update account password.

### Companies & Branches (`/api/v1/companies`)
- `GET /`: List accessible companies.
- `POST /`: Create company (Super Admin only).
- `GET /{id}`: Company detail with branches and departments.
- `PUT /{id}`: Update company information.
- `POST /{id}/branches`: Add branch to company.
- `POST /{id}/departments`: Add department to branch.

### Employees & Users (`/api/v1/employees`)
- `GET /`: List employees with search and department filters.
- `POST /`: Create new employee.
- `GET /{id}`: Employee profile and assigned custody assets.
- `PUT /{id}`: Update employee details.
- `POST /{id}/create-user`: Create user login credentials for an employee.

### Technical Assets (`/api/v1/assets`)
- `GET /`: List assets with status, type, and search filters.
- `POST /`: Register new physical technical asset.
- `GET /{id}`: Asset details with custody history.
- `PUT /{id}`: Update asset specifications.
- `GET /{id}/qr`: Generate dynamic QR code image (PNG).

### Asset Custody & Handover (`/api/v1/custody`)
- `GET /`: List all custody assignment records.
- `POST /assign`: Atomically assign asset to employee.
- `POST /return/{id}`: Return asset with condition assessment.
- `POST /transfer/{id}`: Transfer custody from one employee to another.
- `GET /receipt/{id}`: Generate handover receipt data and HTML format.

### IT Infrastructure (`/api/v1/infrastructure`)
- `GET /`: List network and server hardware devices.
- `POST /`: Register infrastructure device (vault reference only).
- `GET /{id}`: Device details and configuration history.
- `PUT /{id}`: Update device attributes.

### Third-Party Subscriptions (`/api/v1/subscriptions`)
- `GET /`: List subscriptions and recurring services.
- `POST /`: Create new subscription contract.
- `GET /{id}`: Subscription detail.
- `PUT /{id}`: Update subscription or renewal dates.
- `GET /summary`: Aggregated monthly and annual cost calculation.

### Maintenance & Audit (`/api/v1/maintenance`)
- `GET /`: List maintenance, replacement, and configuration change records.
- `POST /`: Create maintenance or configuration change entry.
- `GET /{id}`: Record detail with rollback plan and risk assessment.
- `POST /{id}/approve`: Managerial approval/rejection for configuration changes.

### Task Management (`/api/v1/tasks`)
- `GET /`: List tasks with filter modes (`all`, `my`).
- `POST /`: Create operational task and notify assignee.
- `GET /{id}`: Task detail and timeline.
- `PUT /{id}`: Update task progress and status.
- `POST /{id}/comments`: Post collaboration comments.

### IT Help Desk (`/api/v1/tickets`)
- `GET /`: List support tickets.
- `POST /`: Open support ticket (auto-generates sequential number).
- `GET /{id}`: Ticket detail and public/internal comments.
- `POST /{id}/status`: Transition ticket status.
- `POST /{id}/comments`: Post reply (with `is_internal` technician flag).
- `POST /{id}/convert-to-task`: Convert ticket into an operational task.

### Notifications (`/api/v1/notifications`)
- `GET /`: List user notifications.
- `POST /{id}/read`: Mark notification as read.
- `POST /read-all`: Mark all notifications as read.

### Reports & Exports (`/api/v1/reports`)
- `GET /export`: Export any system dataset to Excel (`.csv` UTF-8 BOM) or printable HTML.

### Audit Logs (`/api/v1/audit`)
- `GET /`: Search immutable security audit trail.

---

## 5. Work Management, Rule-Driven Assignment & SLA Endpoints

### Idempotency & Cursor Pagination
- Optional `Idempotency-Key` header (max 128 chars, 24h TTL per `(company_id, user_id, key)`) supported on `POST /tickets`, `POST /tickets/{id}/assign`, `/transition`, `/events`, `/tasks`, `/tickets/bulk`, and corresponding `/tasks/*` mutation routes.
- `GET /tickets` and `GET /tasks` support both legacy `page`/`per_page` and keyset `cursor` pagination (`pagination.next_cursor`).

### Unified My Work & Workload
- `GET /api/v1/me/work`: Paginated unified feed across tickets, tasks, and pending approvals assigned to or watched by the current user, grouped into `overdue`, `today`, `this_week`, `later` with counts and granular permissions.
- `GET /api/v1/workload`: Per-team and per-technician open tickets/tasks, overdue counts, capacity utilization %, leave status, and 30-day avg resolution hours (`workload:view`).

### Help Desk Extensions (`/api/v1/tickets`)
- `GET /`: Filters by `status`, `priority`, `team_id`, `assignee_id` (`me`, `unassigned`, or UUID), `branch_id`, `category_id`, `sla_state`, `created_from/to`, `due_from/to`, `q`, `saved_view_id`, `sort`, `cursor`.
- `POST /{id}/assign`: Manual assignment (`team_id`, `assignee_id`, `clear_assignee`) or rule-driven re-assignment (`auto_assign: true`).
- `POST /{id}/transition`: Validates against company `WorkflowTransition` matrix (`409 INVALID_WORKFLOW_TRANSITION` / `409 OPEN_LINKED_TASKS`).
- `GET/POST /{id}/events`: Unified chronological timeline (`comment_public`, `comment_internal`, `assignment`, `status_change`, `sla_warning`, `sla_breach`, `merge`, `task_linked`) with optional `macro_id` expansion; internal events hidden from non-staff.
- `POST /bulk`: Up to 100 ticket IDs (`assign`, `team`, `transition`, `priority`, `close`) with partial per-item reporting, RBAC, and audit logs.
- `POST /{id}/merge`: Merge duplicate ticket into target ticket in same company (moves tasks & watchers, closes source, writes `merge` events on both).
- `POST /{id}/tasks`: Create linked task with optional `require_tasks_done_to_close` gate.
- `POST /{id}/watchers` & `DELETE /{id}/watchers/{user_id}`.

### Task Extensions (`/api/v1/tasks`)
- `POST /{id}/assign`, `POST /{id}/transition`, `POST /bulk` (max 100 IDs), `GET/POST/PATCH/DELETE /{id}/checklist`, `GET /{id}/subtasks`, `POST/DELETE /{id}/watchers`.

### Work Management Configuration CRUD
- `/api/v1/teams` & `/api/v1/teams/{id}/members` (`team:manage`)
- `/api/v1/assignment-rules`, `POST /assignment-rules/reorder`, `POST /assignment-rules/dry-run` (`rule:manage`)
- `/api/v1/sla-policies` (`sla:manage`)
- `/api/v1/workflows/transitions` (`workflow:manage`)
- `/api/v1/ticket-categories` (`team:manage`)
- `/api/v1/macros` (shared requires `macro:manage`) & `/api/v1/saved-views`

### SLA Reports & Escalation Worker
- `GET /api/v1/reports/helpdesk-sla?days=30`: SLA compliance %, avg first response & resolution times, backlog aging, priority breakdown, team workload.
- `GET /api/v1/reports/export?report_type=sla_compliance|workload&format_type=excel|html`: UTF-8 BOM CSV or printable Arabic HTML.
- `POST /api/v1/system/run-sla-escalation`: Idempotent SLA escalation trigger protected by `X-Service-Token` (`IGOS_SERVICE_TOKEN` >= 16 chars) or authenticated manager session (`sla:manage`). Also runnable via `python -m app.workers.sla_escalation`.
