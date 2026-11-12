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
