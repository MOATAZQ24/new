# Release Data Validation & Verification Checklist

## 1. Clean Installation Verification Gates
Verified in an isolated clean SQLite/PostgreSQL test environment (`seed_data.py --clean-init` + `/api/v1/auth/bootstrap`):
1. Zero demo employees (`Employee.count == 0` before bootstrap).
2. Zero demo assets (`TechnicalAsset.count == 0`).
3. Zero demo custody records (`AssetCustody.count == 0`).
4. Zero demo tickets (`HelpDeskTicket.count == 0`).
5. Zero demo tasks (`Task.count == 0`).
6. Zero demo subscriptions (`ThirdPartySubscription.count == 0`).
7. Zero default login accounts (`User.count == 0` before `/setup`).
8. Zero hardcoded passwords or real API secrets in release staging (`installer/build_release.ps1` secret scan).
9. Required 6 roles and 5 approved branches (`مخرج 17`, `مخرج 18`, `العليا`, `الدمام`, `جدة`) exist.
10. First administrator creation via `POST /api/v1/auth/bootstrap` succeeds with strong password + license acceptance.
11. Repeated `POST /api/v1/auth/bootstrap` attempts are rejected with `403 Forbidden`.
12. Authentication and RBAC work for the newly created Super Admin.
13. Upgrade / `seed_data.py` re-run preserves all existing users and business data.

## 2. Legal & Publisher Sign-Off Flags
- **Developer Attribution:** `Moataz Qasem / معتز قاسم` (`Cybersecurity & Networks Specialist`) — confirmed.
- **Legal Decisions Requiring Approval:**
  - Verified Windows Add/Remove Programs legal `AppPublisher` name and support/contact URLs in `release_metadata.json` (`linkedin_url`, `email`) must be confirmed before commercial/public distribution (`publisher_status: PENDING_LEGAL_CONFIRMATION`).
  - Exclusive software ownership / commercial EULA text should be reviewed by legal counsel prior to public distribution.
