# Clean Install & Default Data Audit — Investor Gate OS

## 1. Classification of Discovered Artifacts & Records

| Artifact / Source | Classification | Finding & Remediation |
| :--- | :--- | :--- |
| `Role` definitions (6 roles) + Companies (`IGT`, `BLB`, `INV`) + 5 Branches (`مخرج 17`, `مخرج 18`, `العليا`, `الدمام`, `جدة`) + `Department` defaults | **1. Required Structural Data** | Retained in `backend/seed_data.py --clean-init` and `enterprise_service.py`. |
| `backend/seed_data.py --demo` (30 employees, assets, tickets, tasks, subscriptions) & `backend/seed_digital_assets.py` | **2. Demo/Test Data** | Isolated behind `--demo` / `SEED_DEMO_DATA=true` and strictly blocked when `ENVIRONMENT=production`. Never invoked during clean install. |
| `backend/app/core/config.py` fallback `SECRET_KEY` (legacy static default) | **4. Sensitive Configuration** | Replaced default fallback with `secrets.token_hex(32)` ephemeral runtime generation; production fails fast if missing/weak. |
| `scripts/setup.sh` old `sed` placeholders & `"Default Admin User: admin / Admin@12345"` banner | **4. Sensitive Configuration** | Updated to match `.env.example` placeholders, generate random `SECRET_KEY` + DB passwords via `openssl rand -hex`, run `--clean-init`, and direct users to `/setup`. |
| `.env.example` / `backend/.env.example` | **4. Sensitive Configuration (Template)** | Contains only non-functional placeholders (`replace-with-...`), zero real secrets. |
| Local `it_ops.db`, `.env`, `backups/`, `logs/`, `.lan-runtime/`, `scratch/` | **3. Existing Business / Local Dev Data** | Excluded from distributable release artifacts via `.dockerignore` and `installer/build_release.ps1`. |
| `frontend/src/` | **Clean** | Verified 0 occurrences of hardcoded `Admin@12345` or `SECRET_KEY`. |
