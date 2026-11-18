# Security Policy & Architecture — Investor Gate OS

## 1. Authentication & Session Hardening
- **Password Hashing:** All user passwords are hashed using **Argon2id** (`argon2-cffi`). Plaintext passwords are never logged or persisted.
- **Session Management:** Server-side revocable sessions (`user_sessions` table) backed by `HttpOnly`, `SameSite=Lax` cookies (`Secure=true` enforced in production).
- **Brute-Force Protection:**
  - Application-layer lockout after `5` failed login attempts for `15` minutes (`locked_until`).
  - Nginx reverse-proxy rate limiting on `/api/v1/auth/login` (`login_limit` zone).
- **Mandatory First-Login Password Change:** Accounts provisioned with `must_change_password=True` (including initial bootstrap admins in production) are forced via `MustChangePasswordModal` and backend enforcement to rotate their password immediately.
- **Production Startup Fail-Fast:** `app/core/config.py` validates `SECRET_KEY` on startup when `ENVIRONMENT=production` and aborts immediately if `SECRET_KEY` is missing, default, or shorter than 32 characters.

## 2. Multi-Tenant & RBAC Enforcement
- **Strict Tenant Isolation:** Every multi-tenant table carries a `company_id` foreign key. All queries resolve the active tenant via `resolve_company_scope(current_user, active_cid, company_id)` and verify membership in `company_memberships`.
- **IDOR Prevention:** Direct object lookups (`GET`/`PUT`/`DELETE` by UUID) verify `record.company_id == target_cid` (and `validate_company_fk` for related foreign keys such as `branch_id`, `department_id`, `employee_id`, and `asset_id`).
- **Role-Based Access Control (`app/core/rbac.py`):** 6 canonical system roles (`Super Admin`, `Company Admin`, `IT Manager`, `IT Technician`, `Employee`, `Auditor`) enforced server-side on every endpoint.

## 3. Zero-Plaintext Secrets Vault
- Infrastructure devices (`it_infrastructure`) store only vault references (`credential_reference`), never plaintext passwords.
- Digital Asset secrets (`asset_secrets`) store only encrypted references via `vault_service.py` (HashiCorp Vault KV v2) and require Argon2id password re-authentication for reveal operations.
- Audit log payloads (`audit_logs`) mask credentials before persistence (`mask_config_credentials`).

## 4. Container & Database Hardening
- **Least-Privilege Database Role:** `docker/postgres/init-app-db.sh` provisions a non-superuser role (`itops_app`) with `NOSUPERUSER NOCREATEDB NOCREATEROLE` and schema-scoped DML privileges.
- **Network Isolation:** PostgreSQL (`5432`), FastAPI (`8000`), and Next.js (`3000`) use internal Docker `expose` only; external traffic enters exclusively through `nginx` (`80`/`443`).
- **Non-Root Containers:** Both `backend` (`appuser`, UID 1001) and `frontend` (`nextjs`, UID 1001) execute as unprivileged non-root users with memory and CPU limits.
