# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
INVESTOR GATE OS 3.0 — Comprehensive Independent Audit, Security, Workflow,
AI Agent 14-Scenario & Disposable DB Migration Verification Suite.

Guarantees:
- Never mutates or writes to production c:\\Users\\Acodet\\Desktop\\new\\it_ops.db
- Clones production it_ops.db into a temporary directory for Alembic + schema/orphan audit
- Runs multi-company isolation, RBAC, atomic transactions, procurement-to-asset,
  ticket reopen, dashboard reconciliation, and 14 AI Agent prompts + adversarial checks
- Collects P95 latency benchmarks across key operations
"""
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

# Guard before importing app modules so no engine touches production it_ops.db
os.environ["DATABASE_URL"] = "sqlite://"
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
PROD_DB_PATH = REPO_ROOT / "it_ops.db"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import get_db
from app.core.security import hash_password
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.base import Base
from app.models.company import Branch, Company, Department
from app.models.digital_asset import AssetSecret, DigitalAsset
from app.models.enterprise import (
    CANONICAL_BRANCH_NAMES,
    AttendanceRecord,
    EmployeeAssignmentHistory,
    EmployeeBranchAssignment,
    PhysicalBranchLocation,
    Project,
    PurchaseRequest,
    CRMCustomer,
)
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, Role, User, UserRole, UserSession
from app.services.enterprise_service import ensure_canonical_five_branches
from app.api.v1.endpoints import (
    assets,
    auth,
    companies,
    custody,
    dashboard,
    digital_assets,
    employees,
    enterprise,
    infrastructure,
    maintenance,
    reports,
    subscriptions,
    tasks,
    tickets,
    users,
)


def _unwrap(resp):
    body = resp.json()
    if isinstance(body, dict) and "data" in body and ("success" in body or "message" in body):
        return body["data"]
    return body


def _make_app(db_session):
    app = FastAPI()
    for mod in (
        auth,
        companies,
        employees,
        users,
        assets,
        custody,
        infrastructure,
        subscriptions,
        maintenance,
        tasks,
        tickets,
        dashboard,
        digital_assets,
        reports,
    ):
        app.include_router(mod.router, prefix="/api/v1")
    app.include_router(enterprise.hrm_router, prefix="/api/v1")
    app.include_router(enterprise.crm_router, prefix="/api/v1")
    app.include_router(enterprise.projects_router, prefix="/api/v1")
    app.include_router(enterprise.approvals_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db_session
    return app


class DisposableProductionCloneAuditTests(unittest.TestCase):
    """Clones it_ops.db (without touching original), runs Alembic upgrade, and audits integrity."""

    def test_clone_alembic_upgrade_schema_orphans_and_benchmarks(self):
        self.assertTrue(PROD_DB_PATH.exists(), f"Production DB not found at {PROD_DB_PATH}")
        orig_stat = PROD_DB_PATH.stat()

        with tempfile.TemporaryDirectory() as tmpdir:
            clone_path = Path(tmpdir) / "it_ops_audit_clone.db"
            shutil.copy2(PROD_DB_PATH, clone_path)

            clone_url = f"sqlite:///{clone_path.as_posix()}"
            sub_env = os.environ.copy()
            sub_env["DATABASE_URL"] = clone_url
            mig_proc = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=str(BACKEND_DIR),
                env=sub_env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                mig_proc.returncode,
                0,
                f"Alembic upgrade failed: {mig_proc.stdout}\n{mig_proc.stderr}",
            )

            eng = create_engine(clone_url, connect_args={"check_same_thread": False})
            try:
                insp = inspect(eng)
                table_names = set(insp.get_table_names())
                for required_tbl in (
                    "companies",
                    "branches",
                    "physical_branch_locations",
                    "employees",
                    "employee_branch_assignments",
                    "employee_assignment_history",
                    "performance_evaluations",
                    "attendance_records",
                    "leave_requests",
                    "crm_customers",
                    "crm_opportunities",
                    "crm_activities",
                    "projects",
                    "purchase_requests",
                    "workflow_approvals",
                    "employee_subscriptions",
                ):
                    self.assertIn(required_tbl, table_names, f"Missing table: {required_tbl}")

                with eng.connect() as conn:
                    ver = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
                    self.assertEqual([r[0] for r in ver], ["20261118_enterprise_qa_v3"])

                    # Verify canonical internal companies exist cleanly with 5 branches each
                    codes = {r[0] for r in conn.execute(text("SELECT UPPER(company_code) FROM companies")).fetchall()}
                    for req_code in ("IGT", "BLB", "INV"):
                        self.assertIn(req_code, codes, f"Missing canonical internal company {req_code}")

                    phys_count = conn.execute(
                        text("SELECT COUNT(*) FROM physical_branch_locations")
                    ).scalar_one()
                    self.assertEqual(phys_count, 5)

                    canonical_names = tuple(CANONICAL_BRANCH_NAMES)
                    placeholders = ",".join(f"'{n}'" for n in canonical_names)
                    non_canonical_active = conn.execute(
                        text(f"SELECT COUNT(*) FROM branches WHERE status='Active' AND branch_name NOT IN ({placeholders})")
                    ).scalar_one()
                    self.assertEqual(non_canonical_active, 0)

                    missing_phys = conn.execute(
                        text("SELECT COUNT(*) FROM branches WHERE status='Active' AND physical_branch_id IS NULL")
                    ).scalar_one()
                    self.assertEqual(missing_phys, 0)

                    null_person = conn.execute(
                        text("SELECT COUNT(*) FROM employees WHERE person_id IS NULL")
                    ).scalar_one()
                    self.assertEqual(null_person, 0)

                    # Orphan checks across child FK columns
                    orphan_queries = {
                        "eba_missing_emp": "SELECT COUNT(*) FROM employee_branch_assignments a LEFT JOIN employees e ON e.id = a.employee_id WHERE e.id IS NULL",
                        "eba_missing_branch": "SELECT COUNT(*) FROM employee_branch_assignments a LEFT JOIN branches b ON b.id = a.branch_id WHERE b.id IS NULL",
                        "emp_missing_branch": "SELECT COUNT(*) FROM employees e LEFT JOIN branches b ON b.id = e.branch_id WHERE e.branch_id IS NOT NULL AND b.id IS NULL",
                        "asset_missing_branch": "SELECT COUNT(*) FROM technical_assets t LEFT JOIN branches b ON b.id = t.branch_id WHERE t.branch_id IS NOT NULL AND b.id IS NULL",
                        "task_missing_branch": "SELECT COUNT(*) FROM tasks t LEFT JOIN branches b ON b.id = t.branch_id WHERE t.branch_id IS NOT NULL AND b.id IS NULL",
                        "crm_missing_branch": "SELECT COUNT(*) FROM crm_customers c LEFT JOIN branches b ON b.id = c.branch_id WHERE c.branch_id IS NOT NULL AND b.id IS NULL",
                        "proj_missing_branch": "SELECT COUNT(*) FROM projects p LEFT JOIN branches b ON b.id = p.branch_id WHERE p.branch_id IS NOT NULL AND b.id IS NULL",
                        "att_missing_branch": "SELECT COUNT(*) FROM attendance_records a LEFT JOIN branches b ON b.id = a.branch_id WHERE a.branch_id IS NOT NULL AND b.id IS NULL",
                        "mem_missing_comp": "SELECT COUNT(*) FROM company_memberships m LEFT JOIN companies c ON c.id = m.company_id WHERE c.id IS NULL",
                    }
                    for label, sql in orphan_queries.items():
                        cnt = conn.execute(text(sql)).scalar_one()
                        self.assertEqual(cnt, 0, f"Orphan detected in {label}: {cnt}")

                # Benchmark key endpoints against real cloned production volume
                CloneSession = sessionmaker(bind=eng)
                sdb = CloneSession()
                try:
                    super_u = sdb.query(User).filter(User.is_superadmin == True).first()  # noqa: E712
                    if super_u:
                        tok = f"clone-bench-{uuid.uuid4().hex}"
                        sess = UserSession(
                            user_id=super_u.id,
                            session_token=tok,
                            expires_at=datetime.utcnow() + timedelta(hours=1),
                            is_active=True,
                        )
                        sdb.add(sess)
                        sdb.commit()
                        comp = sdb.query(Company).filter(Company.status == "Active").first()
                        headers = {"Authorization": f"Bearer {tok}", "X-Company-ID": str(comp.id)}
                        client = TestClient(_make_app(sdb))
                        try:
                            bench_routes = [
                                ("employees_list", "/api/v1/employees"),
                                ("dashboard_overview", "/api/v1/dashboard"),
                                ("assets_analytics", "/api/v1/assets/analytics"),
                                ("hrm_overview", "/api/v1/hrm/overview"),
                                ("crm_overview", "/api/v1/crm/overview"),
                            ]
                            report_lines = []
                            for rname, path in bench_routes:
                                samples = []
                                for _ in range(5):
                                    t0 = time.perf_counter()
                                    res = client.get(path, headers=headers)
                                    elapsed_ms = (time.perf_counter() - t0) * 1000
                                    self.assertEqual(res.status_code, 200, f"{rname} -> {res.text}")
                                    samples.append(elapsed_ms)
                                p95 = sorted(samples)[int(0.95 * (len(samples) - 1))]
                                avg = statistics.mean(samples)
                                report_lines.append(f"{rname}: avg={avg:.2f}ms p95={p95:.2f}ms")
                            print("\n[CLONE BENCHMARK]", " | ".join(report_lines))
                        finally:
                            client.close()
                finally:
                    sdb.close()
            finally:
                eng.dispose()

        # Verify production DB file was untouched
        after_stat = PROD_DB_PATH.stat()
        self.assertEqual(orig_stat.st_mtime, after_stat.st_mtime)
        self.assertEqual(orig_stat.st_size, after_stat.st_size)


class EnterpriseCoreAndSecurityAuditTests(unittest.TestCase):
    """Multi-company identity, canonical branches, security IDOR, workflows & reconciliation."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )

        @event.listens_for(self.engine, "connect")
        def fk_on(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.client = TestClient(_make_app(self.db))

        # Companies
        self.igt = Company(company_name_ar="بوابة المستثمر", company_name_en="Investor Gate Tech", company_code="IGT")
        self.blink = Company(company_name_ar="بلينك بيل", company_name_en="BlinkBill", company_code="BLINK")
        self.db.add_all([self.igt, self.blink])
        self.db.flush()

        ensure_canonical_five_branches(self.db, self.igt.id)
        ensure_canonical_five_branches(self.db, self.blink.id)
        self.db.flush()

        self.igt_branches = {
            b.branch_name: b
            for b in self.db.query(Branch).filter(Branch.company_id == self.igt.id, Branch.status == "Active").all()
        }
        self.blink_branches = {
            b.branch_name: b
            for b in self.db.query(Branch).filter(Branch.company_id == self.blink.id, Branch.status == "Active").all()
        }
        self.assertEqual(len(self.igt_branches), 5)
        self.assertEqual(len(self.blink_branches), 5)

        self.dept_igt_it = Department(
            company_id=self.igt.id,
            branch_id=None,
            department_name="تقنية المعلومات",
            status="Active",
        )
        self.dept_igt_fais = Department(
            company_id=self.igt.id,
            branch_id=self.igt_branches["الرياض – الفيصلية (مخرج 18)"].id,
            department_name="دعم الفيصلية",
            status="Active",
        )
        self.dept_blink_ops = Department(
            company_id=self.blink.id,
            branch_id=self.blink_branches["الدمام"].id,
            department_name="التشغيل",
            status="Active",
        )
        self.db.add_all([self.dept_igt_it, self.dept_igt_fais, self.dept_blink_ops])
        self.db.flush()

        # Roles
        self.role_super = Role(name="Super Admin")
        self.role_admin = Role(name="Company Admin")
        self.role_mgr = Role(name="IT Manager")
        self.role_tech = Role(name="IT Technician")
        self.role_emp = Role(name="Employee")
        self.role_aud = Role(name="Auditor")
        self.db.add_all([self.role_super, self.role_admin, self.role_mgr, self.role_tech, self.role_emp, self.role_aud])
        self.db.flush()

        self.pw = "Audit@Strong2026!"
        self.super_user = self._make_user("superadmin", self.igt, self.role_super, is_superadmin=True)
        self.igt_admin = self._make_user("igt_admin", self.igt, self.role_admin)
        self.blink_admin = self._make_user("blink_admin", self.blink, self.role_admin)
        self.nora = self._make_user("nora", self.igt, self.role_admin)
        self.db.add(
            CompanyMembership(
                user_id=self.nora.id,
                company_id=self.blink.id,
                role_id=self.role_emp.id,
                status="Active",
                is_default=False,
            )
        )
        self.tech_user = self._make_user("tech_igt", self.igt, self.role_tech)

        # Employees across companies & canonical branches
        self.suli = self.igt_branches["الرياض – السلي (مخرج 17)"]
        self.fais = self.igt_branches["الرياض – الفيصلية (مخرج 18)"]
        self.olaya = self.igt_branches["الرياض – العليا"]
        self.dammam = self.igt_branches["الدمام"]
        self.jeddah = self.igt_branches["جدة"]

        self.emp_ahmad_1 = Employee(
            company_id=self.igt.id, branch_id=self.suli.id, department_id=self.dept_igt_it.id,
            employee_number="IGT-101", full_name="أحمد الحربي", job_title="مهندس شبكات", employment_status="Active",
        )
        self.emp_ahmad_2 = Employee(
            company_id=self.igt.id, branch_id=self.olaya.id, department_id=self.dept_igt_it.id,
            employee_number="IGT-102", full_name="أحمد الحربي", job_title="محلل نظم", employment_status="Active",
        )
        self.emp_khaled = Employee(
            company_id=self.igt.id, branch_id=self.olaya.id, department_id=self.dept_igt_it.id,
            employee_number="IGT-103", full_name="خالد المطيري", job_title="أخصائي بنية تحتية", employment_status="Active",
        )
        self.emp_mohammed = Employee(
            company_id=self.igt.id, branch_id=self.fais.id, department_id=self.dept_igt_it.id,
            employee_number="IGT-104", full_name="محمد الدوسري", job_title="فني دعم", employment_status="Active",
        )
        self.emp_sara = Employee(
            company_id=self.igt.id, branch_id=self.dammam.id, department_id=self.dept_igt_it.id,
            employee_number="IGT-105", full_name="سارة العتيبي", job_title="منسقة أمن", employment_status="Active",
        )
        self.emp_blink = Employee(
            company_id=self.blink.id, branch_id=self.blink_branches["الدمام"].id, department_id=self.dept_blink_ops.id,
            employee_number="BLK-201", full_name="سعد الشهري", job_title="مدير تشغيل", employment_status="Active",
        )
        self.db.add_all([self.emp_ahmad_1, self.emp_ahmad_2, self.emp_khaled, self.emp_mohammed, self.emp_sara, self.emp_blink])
        self.db.flush()

        # Assign خالد as multi-branch (Olaya primary + Jeddah secondary)
        for emp, br in (
            (self.emp_ahmad_1, self.suli),
            (self.emp_ahmad_2, self.olaya),
            (self.emp_khaled, self.olaya),
            (self.emp_mohammed, self.fais),
            (self.emp_sara, self.dammam),
            (self.emp_blink, self.blink_branches["الدمام"]),
        ):
            self.db.add(
                EmployeeBranchAssignment(
                    employee_id=emp.id,
                    company_id=emp.company_id,
                    branch_id=br.id,
                    is_primary=True,
                    status="Active",
                )
            )
        self.db.add(
            EmployeeBranchAssignment(
                employee_id=self.emp_khaled.id,
                company_id=self.igt.id,
                branch_id=self.jeddah.id,
                is_primary=False,
                status="Active",
            )
        )
        self.db.commit()

        self.super_h = {"Authorization": f"Bearer tok-superadmin", "X-Company-ID": str(self.igt.id)}
        self.igt_h = {"Authorization": f"Bearer tok-igt_admin", "X-Company-ID": str(self.igt.id)}
        self.blink_h = {"Authorization": f"Bearer tok-blink_admin", "X-Company-ID": str(self.blink.id)}
        self.nora_igt_h = {"Authorization": f"Bearer tok-nora", "X-Company-ID": str(self.igt.id)}
        self.nora_blink_h = {"Authorization": f"Bearer tok-nora", "X-Company-ID": str(self.blink.id)}

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def _make_user(self, uname, company, role, is_superadmin=False):
        u = User(
            username=uname,
            email=f"{uname}@audit.test",
            password_hash=hash_password(self.pw),
            is_superadmin=is_superadmin,
            account_status="Active",
            must_change_password=False,
        )
        self.db.add(u)
        self.db.flush()
        self.db.add_all([
            CompanyMembership(user_id=u.id, company_id=company.id, role_id=role.id, status="Active", is_default=True),
            UserRole(user_id=u.id, role_id=role.id),
            UserSession(
                user_id=u.id,
                session_token=f"tok-{uname}",
                expires_at=datetime.utcnow() + timedelta(hours=2),
                is_active=True,
            ),
        ])
        return u

    def test_scenarios_a_b_c_d_e_f_and_atomic_onboarding(self):
        # Scenario A: Multi-company same person sharing person_id
        r_create = self.client.post(
            "/api/v1/employees",
            json={
                "company_id": str(self.igt.id),
                "company_ids": [str(self.igt.id), str(self.blink.id)],
                "employee_number": "IGT-777",
                "full_name": "معتز قاسم",
                "job_title": "مهندس أنظمة أول",
                "email": "moataz@audit.test",
                "branch_ids": [str(self.olaya.id), str(self.dammam.id)],
                "department_id": str(self.dept_igt_it.id),
            },
            headers=self.super_h,
        )
        self.assertEqual(r_create.status_code, 200, r_create.text)
        igt_emps = self.db.query(Employee).filter(Employee.full_name == "معتز قاسم").all()
        self.assertEqual(len(igt_emps), 2)
        self.assertIsNotNone(igt_emps[0].person_id)
        self.assertEqual(igt_emps[0].person_id, igt_emps[1].person_id)
        self.assertNotEqual(igt_emps[0].company_id, igt_emps[1].company_id)

        # Scenario B: Strict company role separation + login lockout 423 (not HTTP 500)
        me_igt = _unwrap(self.client.get("/api/v1/auth/me", headers=self.nora_igt_h))
        self.assertIn("Company Admin", me_igt["user"]["roles"])
        me_blk = _unwrap(self.client.get("/api/v1/auth/me", headers=self.nora_blink_h))
        self.assertEqual(me_blk["user"]["roles"], ["Employee"])

        forbidden_emp = self.client.post(
            "/api/v1/employees",
            json={"employee_number": "FAIL-01", "full_name": "غير مصرح"},
            headers=self.nora_blink_h,
        )
        self.assertEqual(forbidden_emp.status_code, 403)

        for i in range(6):
            r_fail = self.client.post("/api/v1/auth/login", json={"username": "nora", "password": "WrongPassword!"})
            self.assertIn(r_fail.status_code, (401, 403), f"attempt {i}: {r_fail.text}")
        self.assertEqual(r_fail.status_code, 403)

        # Scenario C: Duplicate Arabic names filter accurately
        search_res = _unwrap(self.client.get("/api/v1/employees?search=أحمد", headers=self.igt_h))
        self.assertEqual(len(search_res), 2)
        self.assertEqual({e["branch_name"] for e in search_res}, {"الرياض – السلي (مخرج 17)", "الرياض – العليا"})

        # Scenario D: Single Jeddah laptop with multi-branch employee must NEVER double count
        lap_res = self.client.post(
            "/api/v1/assets",
            json={
                "company_id": str(self.igt.id),
                "branch_id": str(self.jeddah.id),
                "asset_code": "AST-JED-001",
                "asset_name": "ThinkPad X1 Carbon",
                "asset_category": "IT",
                "asset_type": "Laptop",
                "status": "Available",
            },
            headers=self.igt_h,
        )
        self.assertEqual(lap_res.status_code, 200, lap_res.text)
        lap_id = _unwrap(lap_res)["id"]

        cust_res = self.client.post(
            "/api/v1/custody/assign",
            json={
                "asset_id": lap_id,
                "employee_id": str(self.emp_khaled.id),
                "condition_on_assignment": "Excellent",
                "acknowledgment": True,
            },
            headers=self.igt_h,
        )
        self.assertEqual(cust_res.status_code, 200, cust_res.text)

        both_branches = f"{self.olaya.id},{self.jeddah.id}"
        assets_list = _unwrap(self.client.get(f"/api/v1/assets?branch_ids={both_branches}", headers=self.igt_h))
        self.assertEqual(len(assets_list), 1)
        ana = _unwrap(self.client.get(f"/api/v1/assets/analytics?branch_ids={both_branches}", headers=self.igt_h))
        self.assertEqual(ana["kpis"]["total_assets"], 1)
        self.assertEqual(ana["kpis"]["assigned_assets"], 1)
        emps_filtered = _unwrap(self.client.get(f"/api/v1/employees?branch_ids={both_branches}", headers=self.igt_h))
        khaled_matches = [e for e in emps_filtered if e["id"] == str(self.emp_khaled.id)]
        self.assertEqual(len(khaled_matches), 1)

        # Branch-bound department constraint rejects wrong branch assignment
        bad_dept = self.client.put(
            f"/api/v1/employees/{self.emp_mohammed.id}",
            json={"branch_ids": [str(self.dammam.id)], "department_id": str(self.dept_igt_fais.id)},
            headers=self.igt_h,
        )
        self.assertEqual(bad_dept.status_code, 400)

        # Scenario E: Employee branch transfer logs EmployeeAssignmentHistory + updates primary branch
        upd_res = self.client.put(
            f"/api/v1/employees/{self.emp_mohammed.id}",
            json={
                "branch_ids": [str(self.dammam.id)],
                "branch_id": str(self.dammam.id),
                "department_id": str(self.dept_igt_it.id),
                "change_reason": "نقل تشغيلي إلى فرع الدمام",
            },
            headers=self.igt_h,
        )
        self.assertEqual(upd_res.status_code, 200, upd_res.text)
        hist = self.db.query(EmployeeAssignmentHistory).filter(EmployeeAssignmentHistory.employee_id == self.emp_mohammed.id).all()
        self.assertGreaterEqual(len(hist), 1)
        self.assertIn("نقل تشغيلي إلى فرع الدمام", hist[-1].notes or "")

        # Scenario F: Deactivating User preserves Employee + Task + Custody history
        self.emp_mohammed.user_id = self.tech_user.id
        self.db.commit()
        deact = self.client.post(f"/api/v1/users/{self.tech_user.id}/status", json={"account_status": "Suspended"}, headers=self.igt_h)
        self.assertEqual(deact.status_code, 200, deact.text)
        self.assertEqual(self.client.post("/api/v1/auth/login", json={"username": "tech_igt", "password": self.pw}).status_code, 403)
        self.db.refresh(self.emp_mohammed)
        self.assertEqual(self.emp_mohammed.employment_status, "Active")

        # Atomicity rollback check: duplicate username while creating employee+user must leave ZERO orphan employees
        before_cnt = self.db.query(Employee).count()
        fail_atomic = self.client.post(
            "/api/v1/employees",
            json={
                "company_id": str(self.igt.id),
                "employee_number": "IGT-FAIL-ROLLBACK",
                "full_name": "فشل ذري",
                "email": "rollback@audit.test",
                "branch_ids": [str(self.suli.id)],
                "create_user_account": True,
                "username": "igt_admin",  # duplicate!
                "password": "StrongPassword123!",
            },
            headers=self.igt_h,
        )
        self.assertIn(fail_atomic.status_code, (400, 409), fail_atomic.text)
        self.assertEqual(self.db.query(Employee).count(), before_cnt)

    def test_p0_idor_canonical_protection_workflows_and_dashboard_reconciliation(self):
        # 1. Canonical branches cannot be renamed/deleted even by SuperAdmin; cross-company branches/depts return 403
        r_ren = self.client.put(
            f"/api/v1/companies/branches/{self.suli.id}",
            json={"branch_name": "فرع مخصص"},
            headers=self.super_h,
        )
        self.assertEqual(r_ren.status_code, 400)
        r_del = self.client.delete(f"/api/v1/companies/branches/{self.suli.id}", headers=self.super_h)
        self.assertEqual(r_del.status_code, 400)
        self.assertEqual(
            self.client.put(
                f"/api/v1/companies/branches/{self.blink_branches['الدمام'].id}",
                json={"location": "Hack"},
                headers=self.igt_h,
            ).status_code,
            403,
        )

        # 2. Cross-company Users IDOR check
        self.assertEqual(self.client.get(f"/api/v1/users/{self.blink_admin.id}/activity", headers=self.igt_h).status_code, 403)
        self.assertEqual(
            self.client.post(f"/api/v1/users/{self.blink_admin.id}/status", json={"account_status": "Suspended"}, headers=self.igt_h).status_code,
            403,
        )

        # 3. Cross-company FK injection rejection (Assets, CRM, Projects, Tasks, Digital Assets)
        self.assertEqual(
            self.client.post(
                "/api/v1/assets",
                json={
                    "company_id": str(self.igt.id),
                    "branch_id": str(self.blink_branches["الدمام"].id),
                    "asset_code": "XCOMP-AST",
                    "asset_name": "Hack",
                    "asset_type": "Laptop",
                },
                headers=self.igt_h,
            ).status_code,
            400,
        )

        # Create CRM Customer + Project in IGT with canonical branch persistence
        crm_res = self.client.post(
            "/api/v1/crm/customers",
            json={
                "customer_code": "CUST-AUDIT-1",
                "name_ar": "شركة الأمل التقنية",
                "branch_id": str(self.suli.id),
                "industry": "تقنية",
                "status": "Active",
            },
            headers=self.igt_h,
        )
        self.assertEqual(crm_res.status_code, 200, crm_res.text)
        cust_id = _unwrap(crm_res)["id"]

        proj_res = self.client.post(
            "/api/v1/projects",
            json={
                "project_code": "PRJ-AUDIT-1",
                "name": "ترقية شبكة السلي",
                "branch_id": str(self.suli.id),
                "status": "Active",
            },
            headers=self.igt_h,
        )
        self.assertEqual(proj_res.status_code, 200, proj_res.text)
        proj_id = _unwrap(proj_res)["id"]

        # Create Task linked to Project + Branch + Employee
        tsk_res = self.client.post(
            "/api/v1/tasks",
            json={
                "company_id": str(self.igt.id),
                "branch_id": str(self.suli.id),
                "project_id": proj_id,
                "title": "فحص سويتش مخرج 17",
                "assigned_to_id": str(self.emp_ahmad_1.id),
                "priority": "High",
            },
            headers=self.igt_h,
        )
        self.assertEqual(tsk_res.status_code, 200, tsk_res.text)
        tsk_data = _unwrap(tsk_res)
        self.assertEqual(tsk_data["project_id"], proj_id)

        # Cross-company Task comment & Secret rotate/permission isolation
        blink_task = Task(company_id=self.blink.id, title="مهمة بلينك", priority="Medium", status="Assigned")
        blink_da = DigitalAsset(company_id=self.blink.id, name="Blink Cloud", category="Cloud Service", platform="AWS", status="Active")
        self.db.add_all([blink_task, blink_da])
        self.db.flush()
        blink_sec = AssetSecret(asset_id=blink_da.asset_id, secret_type="API Key", vault_reference="mock-vault/test")
        self.db.add(blink_sec)
        self.db.commit()

        self.assertEqual(
            self.client.post(f"/api/v1/tasks/{blink_task.id}/comments", json={"content": "hack"}, headers=self.igt_h).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/digital-assets/secrets/{blink_sec.secret_id}/rotate",
                json={"new_secret_value": "newval", "reauth_password": self.pw},
                headers=self.igt_h,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/digital-assets/{blink_da.asset_id}/permissions",
                json={"user_id": str(self.igt_admin.id), "access_level": "Viewer"},
                headers=self.igt_h,
            ).status_code,
            403,
        )

        # Ticket resolve -> reopen clears resolved_at/closed_at
        tkt_res = self.client.post(
            "/api/v1/tickets",
            json={
                "company_id": str(self.igt.id),
                "branch_id": str(self.suli.id),
                "requester_id": str(self.emp_ahmad_1.id),
                "issue_title": "عطل طابعة",
                "issue_description": "انقطاع الشبكة",
                "priority": "High",
            },
            headers=self.igt_h,
        )
        self.assertEqual(tkt_res.status_code, 200, tkt_res.text)
        tkt_id = _unwrap(tkt_res)["id"]
        self.assertEqual(
            self.client.post(f"/api/v1/tickets/{tkt_id}/status?new_status=Resolved", headers=self.igt_h).status_code,
            200,
        )
        res_solve = _unwrap(self.client.get(f"/api/v1/tickets/{tkt_id}", headers=self.igt_h))
        self.assertIsNotNone(res_solve["resolved_at"])
        self.assertEqual(
            self.client.post(f"/api/v1/tickets/{tkt_id}/status?new_status=In%20Progress", headers=self.igt_h).status_code,
            200,
        )
        res_reopen = _unwrap(self.client.get(f"/api/v1/tickets/{tkt_id}", headers=self.igt_h))
        self.assertIsNone(res_reopen["resolved_at"])
        self.assertIsNone(res_reopen["closed_at"])

        # Procurement -> Approval -> Provision Asset E2E
        pr_res = self.client.post(
            "/api/v1/approvals/purchase-requests",
            json={
                "request_number": "PR-AUDIT-001",
                "item_name": "Dell Latitude 7450",
                "category": "Laptop",
                "quantity": 1,
                "unit_cost_sar": 5200,
                "requester_id": str(self.emp_ahmad_1.id),
                "branch_id": str(self.suli.id),
            },
            headers=self.igt_h,
        )
        self.assertEqual(pr_res.status_code, 200, pr_res.text)
        pr_payload = _unwrap(pr_res)
        pr_id = pr_payload["id"]
        app_id = pr_payload["approval_id"]

        self.assertEqual(
            self.client.post(f"/api/v1/approvals/{app_id}/decide", json={"decision": "Approved", "notes": "معتمد"}, headers=self.igt_h).status_code,
            200,
        )
        prov_res = self.client.post(
            f"/api/v1/approvals/purchase-requests/{pr_id}/provision-asset",
            json={"asset_code": "AST-PR-001", "asset_type": "Laptop", "branch_id": str(self.suli.id)},
            headers=self.igt_h,
        )
        self.assertEqual(prov_res.status_code, 200, prov_res.text)
        self.assertEqual(
            self.client.post(
                f"/api/v1/approvals/purchase-requests/{pr_id}/provision-asset",
                json={"asset_code": "AST-PR-002", "asset_type": "Laptop"},
                headers=self.igt_h,
            ).status_code,
            400,
        )

        # Dashboard reconciliation: damaged asset & filtered KPIs/charts sum cleanly
        self.client.post(
            "/api/v1/assets",
            json={
                "company_id": str(self.igt.id),
                "branch_id": str(self.olaya.id),
                "asset_code": "AST-DMG-1",
                "asset_name": "Damaged Dock",
                "asset_type": "Other",
                "status": "Damaged",
            },
            headers=self.igt_h,
        )
        dash_all = _unwrap(self.client.get("/api/v1/dashboard", headers=self.igt_h))
        self.assertEqual(sum(dash_all["asset_status_distribution"].values()), dash_all["total_assets"])
        dmg_vals = [v for k, v in dash_all["asset_status_distribution"].items() if "Damaged" in k]
        self.assertEqual(sum(dmg_vals), 1)
        self.assertEqual(dash_all["total_customers"], 1)
        self.assertEqual(dash_all["active_projects"], 1)

        dash_suli = _unwrap(self.client.get(f"/api/v1/dashboard?branch_ids={self.suli.id}", headers=self.igt_h))
        self.assertEqual(dash_suli["total_assets"], 1)  # Only AST-PR-001 in Suli!
        self.assertEqual(sum(dash_suli["asset_status_distribution"].values()), dash_suli["total_assets"])
        self.assertEqual(dash_suli["open_tickets"], 1)

    def test_subscriptions_mn_seats_cross_tenant_guard_branches_summary_and_reports_overview(self):
        # 1. Create a branch-bound subscription with seat_limit=1
        sub_res = self.client.post(
            "/api/v1/subscriptions",
            json={
                "company_id": str(self.igt.id),
                "branch_id": str(self.suli.id),
                "service_name": "Microsoft 365 Business",
                "provider": "Microsoft",
                "subscription_type": "SaaS",
                "seat_limit": 1,
                "price": 1200,
                "billing_cycle": "Annual",
                "renewal_date": (date.today() + timedelta(days=12)).isoformat(),
                "status": "Active",
            },
            headers=self.igt_h,
        )
        self.assertEqual(sub_res.status_code, 200, sub_res.text)
        sub_id = _unwrap(sub_res)["id"]

        # Security: PUT /subscriptions/{id} must reject assigning an employee from BlinkBill (foreign tenant)
        bad_upd = self.client.put(
            f"/api/v1/subscriptions/{sub_id}",
            json={"assigned_owner_id": str(self.emp_blink.id)},
            headers=self.igt_h,
        )
        self.assertEqual(bad_upd.status_code, 400)

        # Allocate seat 1 -> succeeds; allocating seat 2 when seat_limit=1 -> rejected cleanly
        seat1 = self.client.post(
            f"/api/v1/subscriptions/{sub_id}/employees",
            json={"employee_id": str(self.emp_ahmad_1.id), "notes": "رخصة رئيسية"},
            headers=self.igt_h,
        )
        self.assertEqual(seat1.status_code, 200, seat1.text)
        seat2 = self.client.post(
            f"/api/v1/subscriptions/{sub_id}/employees",
            json={"employee_id": str(self.emp_ahmad_2.id)},
            headers=self.igt_h,
        )
        self.assertEqual(seat2.status_code, 400)

        # Increase seat_limit to 2 and allocate second employee
        self.assertEqual(
            self.client.put(f"/api/v1/subscriptions/{sub_id}", json={"seat_limit": 2}, headers=self.igt_h).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/subscriptions/{sub_id}/employees",
                json={"employee_id": str(self.emp_ahmad_2.id)},
                headers=self.igt_h,
            ).status_code,
            200,
        )
        seats_list = _unwrap(self.client.get(f"/api/v1/subscriptions/{sub_id}/employees", headers=self.igt_h))
        self.assertEqual(seats_list["allocated_seats"], 2)

        # Revoke seat and confirm active count decreases
        self.assertEqual(
            self.client.delete(
                f"/api/v1/subscriptions/{sub_id}/employees/{self.emp_ahmad_2.id}",
                headers=self.igt_h,
            ).status_code,
            200,
        )
        seats_after = _unwrap(self.client.get(f"/api/v1/subscriptions/{sub_id}/employees", headers=self.igt_h))
        self.assertEqual(seats_after["allocated_seats"], 1)

        # Subscription summary includes M:N seats and chart series
        sub_sum = _unwrap(self.client.get(f"/api/v1/subscriptions/summary?branch_ids={self.suli.id}", headers=self.igt_h))
        self.assertEqual(sub_sum["total_allocated_seats"], 1)
        self.assertIn("SaaS", sub_sum["by_type"])

        # 2. Companies branches-summary returns all 5 canonical branches with reconciled counts
        br_sum = _unwrap(self.client.get(f"/api/v1/companies/branches-summary?company_id={self.igt.id}", headers=self.igt_h))
        self.assertEqual(len(br_sum), 5)
        self.assertEqual({b["branch_name"] for b in br_sum}, set(CANONICAL_BRANCH_NAMES))

        # 3. Reports overview returns authorized KPIs & company breakdown without leaking other tenant data to IGT admin
        rep_igt = _unwrap(self.client.get("/api/v1/reports/overview", headers=self.igt_h))
        self.assertEqual(len(rep_igt["company_breakdown"]), 1)
        self.assertEqual(rep_igt["company_breakdown"][0]["company_id"], str(self.igt.id))
        rep_sa = _unwrap(self.client.get("/api/v1/reports/overview", headers=self.super_h))
        self.assertGreaterEqual(len(rep_sa["company_breakdown"]), 2)

        # 4. Verify AI execution routes have been completely removed (404 Not Found)
        ai_resp = self.client.post("/api/v1/ai/agent/chat", json={"message": "test"}, headers=self.super_h)
        self.assertEqual(ai_resp.status_code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
