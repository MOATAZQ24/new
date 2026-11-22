# Investor Gate OS — Application Version Management Policy & Single Source of Truth

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Status:** Authoritative Release & Versioning Policy  

---

## 1. Single Source of Truth (SSOT)

The definitive, authoritative application version for Investor Gate OS is stored in the root file:
```
/VERSION
```
Current Version: `3.0.0`

---

## 2. Component Synchronization Architecture

All tiers and packages derive or align with the root `VERSION` file as follows:

| Component | Target Location | Method of Resolution | Fallback |
| :--- | :--- | :--- | :--- |
| **Backend Core** | `backend/app/core/config.py` | Dynamically reads `/VERSION` at startup | `"3.0.0"` |
| **API Endpoints** | `/api/ready`, `/docs`, OpenAPI metadata | Uses `settings.APP_VERSION` from `config.py` | `"3.0.0"` |
| **Frontend UI** | `frontend/package.json` | Synchronized `"version": "3.0.0"` | Build-time injected |
| **Windows Installer** | `installer/InvestorGateOS.iss` | `#define MyAppVersion "3.0.0"` | Pre-build definition |
| **License Notice** | `installer/LICENSE_NOTICE.txt` | `Investor Gate OS (v3.0.0)` | Static notice |
| **Release Manifest**| `docs/governance/RELEASE_MANIFEST_v3.0.json` | `"version": "3.0.0"` | Formal governance record |

---

## 3. Semantic Versioning Analysis & Git History Audit

### Historical Analysis:
1. **Initial Baseline (`1.0.0`):** Early development baseline.
2. **First Major Handover Tag (`v3.0.0`):**
   - Tagged at commit `d40defd` on **2026-11-19 14:35:02 +0300**.
   - Note: The tag was applied prematurely before subsequent major feature consolidations (Administrative & Operational Intelligence, Split Workspace UI 2.0, Developer Toolkit, and Engineering Hardening).
3. **Current Generation (`3.0.0` Baseline):**
   - All modules, database schemas (up to migration `20261120_admin_ops_upgrade`), UI components, and test suites are now hardened, lint-free, and 100% compliant.

### Release Recommendation for Consolidation:
In compliance with SemVer 2.0.0 (`MAJOR.MINOR.PATCH`):
- Because tag `v3.0.0` already exists in Git history at `d40defd`, the recommended next immutable release tag for the consolidated merge is:
  **`v3.1.0`** (Feature release with backward-compatible operational intelligence and hardening).
- Tags must remain strictly immutable; never delete or move `v3.0.0`.

---

## 4. Release Verification Checklist
Before creating a new release tag:
1. Run `python scripts/verify_attribution.py` (Must pass 100%).
2. Run `python scripts/verify_provenance_integrity.py` (Must pass 100%).
3. Run `python -m unittest discover -s backend/tests -p "test_*.py"` (All tests pass).
4. Run `cd frontend && npx tsc --noEmit && npm run lint` (0 errors).
5. Ensure `VERSION`, `config.py`, `package.json`, and `InvestorGateOS.iss` reflect identical version strings.
