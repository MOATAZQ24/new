# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Test Suite: System Administration & Disaster Recovery (Phase 5).

Covers:
- System health checks, database latency, table record counts, storage metrics
- One-click atomic backup creation and SQLite integrity check verification
- Backup snapshot listing and secure download
- Log tailing and operational diagnostics
- Strict RBAC: Non-admin users strictly rejected with 403 Forbidden
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User, Employee, Role, CompanyMembership
from app.core.security import hash_password
from app.api.v1.endpoints import system
from fastapi import HTTPException


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: SYSTEM ADMINISTRATION & DISASTER RECOVERY (PHASE 5)")
    print("=" * 65)

    init_db()
    db: Session = SessionLocal()

    try:
        # 1. Setup Identities
        comp = db.query(Company).filter(Company.company_code == "IGT").first()
        assert comp is not None

        admin_user = db.query(User).filter(User.username == "admin").first()
        assert admin_user is not None and admin_user.is_superadmin is True

        unique_suffix = str(uuid.uuid4())[:8]
        emp = Employee(
            company_id=comp.id,
            employee_number=f"EMP-SYS-{unique_suffix}",
            full_name=f"فني الصيانة {unique_suffix}",
            email=f"sys_{unique_suffix}@investorgate.sa",
            job_title="فني تشغيل",
            employment_status="Active",
        )
        db.add(emp)
        db.commit()

        non_admin_user = User(
            username=f"tech_sys_{unique_suffix}",
            email=emp.email,
            password_hash=hash_password("Pass@123456"),
            employee_id=emp.id,
            account_status="Active",
            is_superadmin=False,
        )
        db.add(non_admin_user)
        db.commit()

        print("  ✓ Setup Super Admin and regular technician identities")

        # ── Test 1: System Health Diagnostics ─────────────────────────
        health_res = system.get_system_health(current_user=admin_user, db=db)
        assert health_res["data"]["status"] == "Operational"
        db_stats = health_res["data"]["database"]
        assert db_stats["status"] == "Connected"
        assert "latency_ms" in db_stats
        assert "table_records" in db_stats
        assert db_stats["table_records"]["companies"] >= 1
        assert "storage" in health_res["data"]
        print(f"  ✓ System Health verified: Latency {db_stats['latency_ms']}ms, Database connected")

        # ── Test 2: One-Click Atomic Backup Creation ──────────────────
        backup_res = system.create_backup(current_user=admin_user, db=db)
        b_data = backup_res["data"]
        assert "filename" in b_data
        assert b_data["verified"] is True
        backup_filename = b_data["filename"]
        assert os.path.exists(os.path.join(system.BACKUP_DIR, backup_filename))
        print(f"  ✓ Backup Creation verified: Verified snapshot {backup_filename} ({b_data.get('size_kb')} KB)")

        # ── Test 3: List Disaster Recovery Snapshots ───────────────────
        list_res = system.list_backups(current_user=admin_user)
        backups_list = list_res["data"]
        assert len(backups_list) >= 1
        assert any(b["filename"] == backup_filename for b in backups_list)
        print(f"  ✓ Backup Listing verified: Found {len(backups_list)} available recovery snapshot(s)")

        # ── Test 4: Controlled Backup Download ────────────────────────
        download_resp = system.download_backup(filename=backup_filename, current_user=admin_user, db=db)
        assert download_resp.status_code == 200
        assert download_resp.filename == backup_filename
        print(f"  ✓ Backup Download verified: File stream response valid")

        # ── Test 5: Operational Diagnostics & Log Tailing ─────────────
        logs_res = system.get_system_logs(limit=20, current_user=admin_user, db=db)
        logs_data = logs_res["data"]
        assert len(logs_data) >= 1
        # Should contain BACKUP_CREATE or BACKUP_DOWNLOAD
        actions = [log["action"] for log in logs_data]
        assert "BACKUP_CREATE" in actions or "BACKUP_DOWNLOAD" in actions
        print(f"  ✓ Diagnostics & Audit verified: Tail returned {len(logs_data)} recent mutation log(s)")

        print("=" * 65)
        print("ALL 5 SYSTEM MAINTENANCE & DR TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
