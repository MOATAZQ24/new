# Seed Data Policy — Investor Gate OS

## 1. Clean Initialization (`--clean-init` / `CLEAN_INIT=true`)
For **NEW** installations:
- Database schema is created/migrated via Alembic (`alembic upgrade head`).
- `backend/seed_data.py --clean-init` creates **ONLY**:
  1. The 6 canonical system roles (`Super Admin`, `Company Admin`, `IT Manager`, `IT Technician`, `Employee`, `Auditor`).
  2. Approved internal companies (`IGT`, `BLB`, `INV`) and standard departments.
  3. The 5 approved physical branches (`مخرج 17`, `مخرج 18`, `العليا`, `الدمام`, `جدة`).
- **Zero** demo employees, **zero** demo assets, **zero** demo custody records, **zero** demo subscriptions, **zero** demo tickets, **zero** demo tasks, and **zero** default admin accounts are created.

## 2. Demo Data Restriction
- Demo seeding (`--demo` / `SEED_DEMO_DATA=true`) is permitted **only** in `development` mode and raises `RuntimeError` in `production`.
- `backend/seed_digital_assets.py` is excluded from production bootstrap and installer workflows.

## 3. Safe Upgrade & Reinstall Policy
- Upgrading, repairing, or reinstalling **never** wipes existing databases.
- `seed_data.py` aborts immediately if `db.query(User).count() > 0`.
- Before applying Alembic migrations during an upgrade, a verified backup must be created.
- Factory reset is never automatic and requires explicit administrator authorization, a verified backup, and explicit confirmation.
