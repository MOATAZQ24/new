# Investor Gate IT Operations Management System — Security Architecture & Guidelines

## 1. Security Principles
The system adheres to modern cybersecurity guidelines for internal enterprise infrastructure:
- **Defense in Depth:** Security implemented across proxy, network, transport, application, and database tiers.
- **Zero-Trust Network Access:** WireGuard VPN for administrative remote connectivity.
- **Least Privilege:** Strict Role-Based Access Control (RBAC) enforced server-side.
- **Multi-Tenant Data Isolation:** Complete segregation between subsidiary companies.
- **Zero Plaintext Secrets Policy:** Explicitly forbidden to store passwords or API keys in infrastructure tables.

---

## 2. Authentication & Session Management
- **Argon2id Password Hashing:** Passwords hashed using OWASP-recommended parameters (`argon2-cffi` with time cost 3, memory cost 64MB, parallelism 4).
- **HttpOnly Cookies:** Authentication tokens (`session_token`) stored strictly in `HttpOnly`, `SameSite=Lax`, and `Secure` cookies, preventing XSS-based token theft.
- **Session Expiration:** Server-side TTL invalidation (configurable via `SESSION_EXPIRE_HOURS`, defaults to 24h).
- **Brute Force Defense:** Nginx rate limiting on `/api/v1/auth/login` (5 requests/minute burst 3).
- **Rate Limiting:** General API requests limited to 30 requests/second burst 50.

---

## 3. Server-Side RBAC (Role-Based Access Control)

Six roles are recognized:
1. **Super Admin:** Global system access, manage companies, roles, and system-wide settings.
2. **Company Admin:** Administration of their authorized company, branches, and employees.
3. **IT Manager:** Full management of assets, custody, infrastructure, subscriptions, and change approvals.
4. **IT Technician:** Asset assignment, hardware maintenance, ticket resolution, and task execution.
5. **Employee:** View assigned technical custody assets, create and monitor personal helpdesk tickets.
6. **Auditor:** Read-only oversight of audit logs, compliance records, and report exports.

Roles are verified on every API request via FastAPI dependencies:
```python
current_user = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"]))
```

---

## 4. Infrastructure Credential Security
Under Module 5 (IT Infrastructure), storing plaintext passwords, enable secrets, or SNMP community strings in the database is strictly prohibited.

The `it_infrastructure` table contains only:
- `credential_reference`: An opaque pointer or URI to an enterprise secrets vault (e.g. `vault://network/core-switch-01` or `keepass://infra/firewall-mgmt`).
No password data is returned in API payloads or rendered in UI tables.

---

## 5. Security Audit Logging
Every data mutation (Create, Update, Delete, Custody Transfer, Status Change, Configuration Approval) is automatically captured in the immutable `audit_logs` table:
- User ID and username
- Action type (`CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `ASSIGN_CUSTODY`, `RETURN_CUSTODY`, `CONFIG_APPROVE`)
- Resource type and UUID
- Complete JSON diff of `old_values` and `new_values`
- Client IP address and UTC timestamp
The audit logs cannot be edited or deleted through any API endpoint.

---

## 6. Granular Work-Management RBAC Matrix

Mapped onto the 6 existing roles in `backend/app/core/rbac.py` without altering default access for existing modules:

| Granular Permission | Super Admin | Company Admin | IT Manager | IT Technician | Employee | Auditor |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `ticket:view`, `task:view` | Yes | Yes | Yes | Yes | Own / Watched | Yes (RO) |
| `ticket:create`, `task:create` | Yes | Yes | Yes | Yes | Yes | No |
| `ticket:assign`, `task:assign` | Yes | Yes | Yes | Yes | No | No |
| `ticket:transition`, `ticket:close` | Yes | Yes | Yes | Yes | No | No |
| `ticket:merge`, `ticket:bulk`, `task:bulk` | Yes | Yes | Yes | Yes | No | No |
| `task:transition` | Yes | Yes | Yes | Yes | Own Tasks | No |
| `workload:view` | Yes | Yes | Yes | Yes | No | Yes (RO) |
| `team:manage`, `rule:manage`, `sla:manage`, `workflow:manage`, `macro:manage` | Yes | Yes | Yes | No (private macros only) | No | No |

---

## 7. STRIDE Threat Model — Help Desk & Assignment Surface

| Threat (STRIDE) | Attack Vector | Implemented Mitigation | Verification |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Replaying or forging service escalation calls or cross-tenant headers | `X-Service-Token` validated with constant-time `hmac.compare_digest` (min 16 chars); `X-Company-ID` verified against active `CompanyMembership`; HttpOnly cookies + Argon2id unchanged | `test_work_management_api.py`, `test_work_management_security.py` |
| **Tampering** | Mass assignment of `company_id` or illegal status jumps; bypassing linked-task close gate | Pydantic v2 `extra="forbid"` rejects client-supplied `company_id` (`422`); `WorkflowTransition` matrix enforced server-side (`409`); `require_tasks_done_to_close` checked atomically | `test_work_management_api.py`, `test_work_management_security.py` |
| **Repudiation** | Disputed reassignments, merges, or SLA escalations | Append-only `ticket_events` timeline + immutable `audit_logs` with actor, IP, UTC timestamp, old/new JSON diffs, and assignment `reason` | `test_assignment_engine.py`, `test_sla_escalation.py` |
| **Information Disclosure** | Cross-company BOLA/IDOR on tickets, teams, rules, voice notes, internal notes, or `/me/work` | Every query filtered by `company_id`; `GET /tickets/voice/{filename}` requires auth + regex filename validation + path containment + tenant check; `visibility="internal"` events stripped for non-staff | `test_work_management_security.py` |
| **Denial of Service** | Craft excessive rules, oversized bulk payloads, or duplicate retry storms | Max 100 active rules/company; strict condition key allowlist; bulk capped at 100 IDs; `Idempotency-Key` deduplication (24h TTL); bounded business-hours calendar loop | `test_assignment_engine.py`, `test_work_management_api.py` |
| **Elevation of Privilege** | Technician or Employee mutating routing rules, SLA policies, shared macros, or viewing other employees' tickets | Granular RBAC dependencies (`require_granular_permission`) enforced server-side; Employees restricted to own/watched tickets; Auditors strictly read-only | `test_work_management_security.py` |
