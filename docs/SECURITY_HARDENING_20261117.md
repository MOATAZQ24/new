# Authorization hardening verification — 2026-11-17

Scope: the four P0 findings from the initial audit and the four requested P1 follow-ups. This is an incremental engineering verification, not a complete application audit or a compliance/certification claim.

## Change ownership and data safety

Existing diffs were inspected before editing. The working tree already contained partial custody and tenant-scope fixes. Those were preserved and completed. Additional Telegram model, notification, command and test changes appeared concurrently; they were preserved, not authored or validated as feature expansion by this security pass. In particular, the existing `notifications_enabled` model/column addition is outside this pass.

No application database was opened by the new tests. Test modules set DATABASE_URL=sqlite:// before application imports and use fresh in-memory SQLAlchemy engines, with foreign keys enabled for HTTP tests. Polling tests use generated temporary files and mocked database initialization, Telegram requests and update processing. No production deployment, secret changes, database reset, application data cleanup or QR/token-linking changes were performed.

## Completed corrections

| Issue / root cause | Correction | Files changed in this pass | Verification |
| --- | --- | --- | --- |
| P0 custody transfers/receipts had missing tenant and authorization checks; partial checks were already present in the working tree | Preserve tenant checks; enforce the shared custody permission matrix; reject foreign target employees | backend/app/api/v1/endpoints/custody.py | HTTP foreign-record rejection, authorized receipt and transfer, employee transfer denial, historical custody preservation |
| P0 legacy user listing queried all users and serialized all memberships | Scope user rows, roles and nested membership data; exclude deleted users | backend/app/api/v1/endpoints/employees.py | Foreign users and unrelated nested memberships excluded |
| P0 legacy provisioning trusted company, employee and role input and committed dependent records separately | Validate company existence and scope, known existing roles, employee-company relationship, employee eligibility and Super Admin escalation; persist user, roles, memberships and audit atomically; deduplicate role/company input | backend/app/api/v1/endpoints/employees.py | Foreign company/employee, invented role and elevation rejected; valid creation, duplicate request, multiple roles and injected audit failure covered |
| P0 company query/header conflicts bypassed active scope; role checks without headers used global roles | Reject conflicting company IDs and out-of-scope requests centrally; resolve role checks against validated active company; apply scope helper to remaining list routes | backend/app/core/security.py; backend/app/api/v1/endpoints/audit.py; dashboard.py; digital_assets.py; users.py | Header/query conflict denied across six route groups; query-only foreign scope denied; company-specific role separation; Super Admin access retained |
| P1 suspended memberships remained valid during company resolution | Require Active membership for explicit, default and fallback company selection | backend/app/core/security.py | Explicit and default suspended-membership rejection |
| P1 custody assignments/transfers lacked employee/status consistency and could race on stale asset snapshots | Require active same-company employee and available asset; reject transfer to the same employee; use conditional ownership writes with HTTP 409 on stale updates | backend/app/api/v1/endpoints/custody.py | Successful assign/return/transfer; repeated operations, inactive/foreign employees, retired assets and stale ownership rejected |
| P1 custody audit could fail after custody was committed | Add opt-in deferred audit commit and commit custody, asset and audit together | backend/app/services/audit_service.py; backend/app/api/v1/endpoints/custody.py | Injected audit failure rolls back both assignment and transfer; default audit behavior remains committing |
| Employee branch/department references were not tenant validated | Validate location relationships before creation/update writes | backend/app/api/v1/endpoints/employees.py | Foreign branch rejected without changing employee data |
| Telegram action authorization did not revalidate identity lifecycle; chat fallback could authenticate a different sender | Require verified sender identity, matching chat, active internal user, active employee and active membership (explicit Super Admin exemption); persist known-tenant authorization denials; log unknown senders without inventing a tenant | backend/app/services/telegram_service.py | Active linked user succeeds; disabled account, suspended membership, inactive employee and mismatched sender/chat rejected |
| P1 Telegram bots shared one update cursor | Persist separate hashed bot-identity cursors atomically; preserve identity across token rotation; advance only after successful processing; reuse legacy cursor only for a single configured bot | backend/app/workers/telegram_poller.py | Independent offsets, restart/rotation, legacy handling, corrupt files, failed save, real polling-loop cursor selection and failed-processing acknowledgment covered |
| P1 schema upgrade exceptions were silently swallowed | Roll back the failed statement and abort startup with table/column context | backend/app/core/database.py | Additive migration preserves existing test rows and is repeatable; injected DB failure propagates after rollback |

Legacy multi-role input remains accepted. The first validated role defines each new company membership, matching the single-role membership model; all validated global role records are retained. Existing memberships lacking a company role remain least-privilege Employee rather than inheriting a global administrator role.

## Executed verification

- `backend/.venv/Scripts/python.exe -W ignore::DeprecationWarning -m unittest discover -s backend/tests -p '*security_regressions.py' -q`: **36 passed** (28 HTTP/business/Telegram authorization tests, 8 worker/migration tests).
- New tests: backend/tests/test_security_regressions.py and backend/tests/test_p1_security_regressions.py.
- The initial combined run encountered Windows sandbox permission failures on generated Temp directories. The approved rerun passed all tests; no application data was used.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` from frontend: **passed**.
- `npm run lint -- --quiet` from frontend: **failed, 237 errors** in frontend files not edited by this pass, including no-explicit-any and React effect rules. The npm wrapper emitted a Windows pipe access error but ESLint did execute and return its findings.
- `git diff --check`: **passed**, with Git line-ending notices only.
- No dependencies added. The installed test client emits an httpx deprecation warning.

## Remaining risks and next work

1. PostgreSQL runtime, lock contention under simultaneous production-like requests, and full deployment behavior were not tested. The stale-ownership regression is deterministic; it is not a PostgreSQL load/concurrency test.
2. Existing databases and legacy destructive test scripts were deliberately not exercised. Existing rows were not repaired or backfilled. Administrators may need to review missing membership roles and employees whose Telegram links have no active internal account/membership.
3. The startup migration mechanism still uses create_all and additive column upgrades. Failures now stop startup, but a versioned Alembic baseline and controlled upgrade procedure remain necessary. Earlier successful additive steps can remain committed before a later step fails; reruns are intended to resume safely.
4. Telegram cursor files assume one polling worker. Durable inbound-update deduplication and multi-worker coordination remain separate work. With multiple bots, ambiguous legacy shared cursors are not copied to every bot; pending updates may be replayed from each bot's queue.
5. Telegram delivery was mocked. No live bot or credentials were used. Existing notification/outbox reliability and other concurrently added Telegram features have not been certified by these tests.
6. Post-commit notification delivery is still separate from custody persistence. Delivery failures require follow-up reconciliation/outbox work; custody and audit now remain atomic.
7. Frontend lint debt and the remaining application modules require continued review. No claim is made that the entire application is free of security defects.
