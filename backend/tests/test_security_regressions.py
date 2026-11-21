# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""HTTP security regressions. Never connect to an application database.
Run: backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -p test_security_regressions.py -v
"""
import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

# Set BEFORE importing any app module. Each test has its own in-memory DB as well.
os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import app.models
from app.models.base import Base
from app.models.company import Company, Branch
from app.models.user import User, Employee, Role, UserRole, CompanyMembership, UserSession
from app.models.asset import TechnicalAsset, AssetCustody
from app.core.database import get_db
from app.api.v1.endpoints import employees, custody, users, audit, dashboard, digital_assets


class SecurityRegressions(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        @event.listens_for(self.engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.app = FastAPI()
        for module in (employees, custody, users, audit, dashboard, digital_assets):
            self.app.include_router(module.router, prefix="/api/v1")
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.a = Company(company_name_ar="أ", company_name_en="A", company_code="A")
        self.b = Company(company_name_ar="ب", company_name_en="B", company_code="B")
        self.db.add_all([self.a, self.b]); self.db.flush()
        self.admin_role = Role(name="Company Admin")
        self.employee_role = Role(name="Employee")
        self.super_role = Role(name="Super Admin")
        self.db.add_all([self.admin_role, self.employee_role, self.super_role]); self.db.flush()
        self.admin = self.make_user("admin", self.a, self.admin_role)
        self.other = self.make_user("other", self.b, self.admin_role)
        self.worker = self.make_user("worker", self.a, self.employee_role)
        self.ea = Employee(company_id=self.a.id, full_name="موظف أ", employee_number="A1")
        self.eb = Employee(company_id=self.b.id, full_name="موظف ب", employee_number="B1")
        self.next_emp = Employee(company_id=self.a.id, full_name="موظف جديد", employee_number="A2")
        self.db.add_all([self.ea, self.eb, self.next_emp]); self.db.flush()
        self.asset_a = TechnicalAsset(company_id=self.a.id, asset_code="A", asset_name="A", asset_type="Laptop", status="Assigned", assigned_employee_id=self.ea.id)
        self.asset_b = TechnicalAsset(company_id=self.b.id, asset_code="B", asset_name="B", asset_type="Laptop", status="Assigned", assigned_employee_id=self.eb.id)
        self.db.add_all([self.asset_a, self.asset_b]); self.db.flush()
        self.ca = AssetCustody(asset_id=self.asset_a.id, company_id=self.a.id, employee_id=self.ea.id, assigned_by=self.admin.id, assignment_date=datetime.utcnow(), status="Active")
        self.cb = AssetCustody(asset_id=self.asset_b.id, company_id=self.b.id, employee_id=self.eb.id, assigned_by=self.other.id, assignment_date=datetime.utcnow(), status="Active")
        self.db.add_all([self.ca, self.cb]); self.db.commit()
        self.headers = {"Authorization": "Bearer admin", "X-Company-ID": str(self.a.id)}

    def make_user(self, name, company, role):
        user = User(username=name, email=name+"@example.test", password_hash="unused")
        self.db.add(user); self.db.flush()
        self.db.add_all([
            CompanyMembership(user_id=user.id, company_id=company.id, role_id=role.id, status="Active", is_default=True),
            UserRole(user_id=user.id, role_id=role.id),
            UserSession(user_id=user.id, session_token=name, expires_at=datetime.utcnow()+timedelta(hours=1), is_active=True),
        ])
        return user

    def tearDown(self):
        self.client.close(); self.db.close(); self.engine.dispose()

    def post_user(self, **overrides):
        payload = dict(username="new", email="new@example.test", password="Strong-test-password", role_names=["Employee"], company_ids=[str(self.a.id)])
        payload.update(overrides)
        return self.client.post("/api/v1/employees/users/create", json=payload, headers=self.headers)

    def test_cross_company_transfer_denied_without_mutation(self):
        response = self.client.post(f"/api/v1/custody/transfer/{self.cb.id}", json={"new_employee_id": str(self.next_emp.id)}, headers=self.headers)
        self.assertEqual(response.status_code, 403, response.text)
        self.db.refresh(self.cb); self.db.refresh(self.asset_b)
        self.assertEqual(self.cb.status, "Active")
        self.assertEqual(self.asset_b.assigned_employee_id, self.eb.id)
        self.assertEqual(self.db.query(AssetCustody).count(), 2)

    def test_receipt_scope_and_authorized_success(self):
        self.assertEqual(self.client.get(f"/api/v1/custody/receipt/{self.cb.id}", headers=self.headers).status_code, 403)
        response = self.client.get(f"/api/v1/custody/receipt/{self.ca.id}", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["data"]["employee_name"], self.ea.full_name)

    def test_employee_cannot_transfer(self):
        response = self.client.post(f"/api/v1/custody/transfer/{self.ca.id}", json={"new_employee_id": str(self.next_emp.id)}, headers={"Authorization": "Bearer worker"})
        self.assertEqual(response.status_code, 403)

    def test_company_header_query_conflicts_denied(self):
        for path in ("employees", "custody", "users", "audit", "dashboard", "digital-assets"):
            with self.subTest(path=path):
                response = self.client.get(f"/api/v1/{path}?company_id={self.b.id}", headers=self.headers)
                self.assertEqual(response.status_code, 403, response.text)

    def test_query_only_other_company_denied(self):
        response = self.client.get(f"/api/v1/employees?company_id={self.b.id}", headers={"Authorization": "Bearer admin"})
        self.assertEqual(response.status_code, 403)

    def test_legacy_user_list_is_scoped_including_nested_memberships(self):
        self.db.add(CompanyMembership(user_id=self.worker.id, company_id=self.b.id, role_id=self.employee_role.id))
        self.db.commit()
        response = self.client.get("/api/v1/employees/users/list", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()["data"]
        self.assertNotIn("other", [row["username"] for row in data])
        for row in data:
            self.assertEqual([company["id"] for company in row["companies"]], [str(self.a.id)])

    def test_creation_rejects_other_tenant_and_escalation(self):
        for payload in ({"company_ids": [str(self.b.id)]}, {"role_names": ["Super Admin"]}, {"is_superadmin": True}, {"role_names": ["Invented"]}, {"employee_id": str(self.eb.id)}):
            with self.subTest(payload=payload):
                response = self.post_user(**payload)
                self.assertIn(response.status_code, (400, 403), response.text)
                self.assertIsNone(self.db.query(User).filter_by(username="new").first())

    def test_valid_creation_and_duplicate(self):
        response = self.post_user(employee_id=str(self.next_emp.id))
        self.assertEqual(response.status_code, 200, response.text)
        new = self.db.query(User).filter_by(username="new").one()
        membership = self.db.query(CompanyMembership).filter_by(user_id=new.id).one()
        self.assertEqual(membership.role_id, self.employee_role.id)
        self.assertEqual(membership.company_id, self.a.id)
        self.assertEqual(self.post_user().status_code, 400)

    def test_creation_failure_rolls_back_all_writes(self):
        with patch.object(employees, "log_audit", side_effect=RuntimeError("audit failure")):
            with self.assertRaises(RuntimeError):
                self.post_user()
        self.assertIsNone(self.db.query(User).filter_by(username="new").first())
        self.assertEqual(self.db.query(CompanyMembership).count(), 3)

    def test_employee_creation_scope_and_branch_validation(self):
        branch = Branch(company_id=self.b.id, branch_name="B")
        self.db.add(branch); self.db.commit()
        payload = dict(company_id=str(self.b.id), employee_number="NEW", full_name="New")
        self.assertEqual(self.client.post("/api/v1/employees", json=payload, headers=self.headers).status_code, 403)
        payload.update(company_id=str(self.a.id), branch_id=str(branch.id))
        self.assertEqual(self.client.post("/api/v1/employees", json=payload, headers=self.headers).status_code, 400)
        self.assertEqual(self.db.query(Employee).count(), 3)

    def test_no_header_uses_company_role_not_global_admin(self):
        self.db.add(UserRole(user_id=self.worker.id, role_id=self.admin_role.id)); self.db.commit()
        response = self.client.get("/api/v1/employees/users/list", headers={"Authorization": "Bearer worker"})
        self.assertEqual(response.status_code, 403)

    def test_suspended_membership_denied_explicit_and_default(self):
        membership = self.db.query(CompanyMembership).filter_by(user_id=self.admin.id).one()
        membership.status = "Suspended"; self.db.commit()
        self.assertEqual(self.client.get("/api/v1/employees", headers=self.headers).status_code, 403)
        self.assertIn(self.client.get("/api/v1/employees", headers={"Authorization": "Bearer admin"}).status_code, (400,403))

    def test_transfer_preserves_history_and_rejects_repeat(self):
        url = f"/api/v1/custody/transfer/{self.ca.id}"
        payload = {"new_employee_id": str(self.next_emp.id)}
        response = self.client.post(url, json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.ca); self.db.refresh(self.asset_a)
        self.assertEqual(self.ca.status, "Transferred")
        self.assertEqual(self.asset_a.assigned_employee_id, self.next_emp.id)
        self.assertEqual(self.db.query(AssetCustody).filter_by(asset_id=self.asset_a.id, status="Active").count(), 1)
        self.assertEqual(self.client.post(url, json=payload, headers=self.headers).status_code, 400)

    def test_assignment_rejects_inactive_foreign_and_unavailable(self):
        asset = TechnicalAsset(company_id=self.a.id, asset_code="FREE", asset_name="Free", asset_type="Laptop", status="Available")
        self.db.add(asset); self.db.commit()
        self.next_emp.employment_status = "Terminated"; self.db.commit()
        for employee in (self.next_emp, self.eb):
            response = self.client.post("/api/v1/custody/assign", json={"asset_id": str(asset.id), "employee_id": str(employee.id)}, headers=self.headers)
            self.assertEqual(response.status_code, 400, response.text)
        self.next_emp.employment_status = "Active"; asset.status = "Retired"; self.db.commit()
        response = self.client.post("/api/v1/custody/assign", json={"asset_id": str(asset.id), "employee_id": str(self.next_emp.id)}, headers=self.headers)
        self.assertEqual(response.status_code, 400, response.text)

    def test_superadmin_cross_company_access_remains_available(self):
        self.admin.is_superadmin = True; self.db.commit()
        response = self.client.get(f"/api/v1/custody/receipt/{self.cb.id}", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        response = self.client.get(f"/api/v1/employees?company_id={self.b.id}", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["data"][0]["company_id"], str(self.b.id))

    def test_assignment_return_and_duplicate_return(self):
        asset = TechnicalAsset(company_id=self.a.id, asset_code="NEW", asset_name="New", asset_type="Laptop", status="Available")
        self.db.add(asset); self.db.commit()
        payload = {"asset_id": str(asset.id), "employee_id": str(self.next_emp.id)}
        response = self.client.post("/api/v1/custody/assign", json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.post("/api/v1/custody/assign", json=payload, headers=self.headers).status_code, 400)
        record = self.db.query(AssetCustody).filter_by(asset_id=asset.id).one()
        response = self.client.post(f"/api/v1/custody/return/{record.id}", json={"condition_on_return": "Good"}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(asset); self.db.refresh(record)
        self.assertIsNone(asset.assigned_employee_id)
        self.assertEqual(asset.status, "Available")
        self.assertEqual(record.status, "Returned")
        self.assertEqual(self.client.post(f"/api/v1/custody/return/{record.id}", json={"condition_on_return": "Good"}, headers=self.headers).status_code, 400)

    def test_invalid_transfer_targets_preserve_history(self):
        self.next_emp.employment_status = "Inactive"; self.db.commit()
        for employee in (self.ea, self.eb, self.next_emp):
            response = self.client.post(f"/api/v1/custody/transfer/{self.ca.id}", json={"new_employee_id": str(employee.id)}, headers=self.headers)
            self.assertEqual(response.status_code, 400, response.text)
        self.db.refresh(self.ca)
        self.assertEqual(self.ca.status, "Active")
        self.assertEqual(self.db.query(AssetCustody).count(), 2)

    def test_competing_asset_update_rejects_stale_transfer(self):
        # Keep the ORM's old snapshot while another SQL statement changes ownership.
        from sqlalchemy import update
        self.db.execute(update(TechnicalAsset).where(TechnicalAsset.id == self.asset_a.id).values(assigned_employee_id=self.worker.employee_id).execution_options(synchronize_session=False))
        self.db.commit()
        # Restore the stale snapshot deliberately to exercise the conditional write.
        from sqlalchemy.orm.attributes import set_committed_value
        set_committed_value(self.asset_a, "assigned_employee_id", self.ea.id)
        response = self.client.post(f"/api/v1/custody/transfer/{self.ca.id}", json={"new_employee_id": str(self.next_emp.id)}, headers=self.headers)
        self.assertEqual(response.status_code, 409, response.text)
        self.db.refresh(self.ca)
        self.assertEqual(self.ca.status, "Active")
        self.assertEqual(self.db.query(AssetCustody).count(), 2)

    def test_employee_update_rejects_foreign_branch_without_mutation(self):
        branch = Branch(company_id=self.b.id, branch_name="B")
        self.db.add(branch); self.db.commit()
        response = self.client.put(f"/api/v1/employees/{self.ea.id}", json={"branch_id": str(branch.id), "full_name": "Changed"}, headers=self.headers)
        self.assertEqual(response.status_code, 400, response.text)
        self.db.refresh(self.ea)
        self.assertEqual(self.ea.full_name, "موظف أ")
        self.assertIsNone(self.ea.branch_id)

    def test_multi_company_roles_do_not_bleed_across_scope(self):
        self.db.add(CompanyMembership(user_id=self.worker.id, company_id=self.b.id, role_id=self.admin_role.id, status="Active"))
        self.db.commit()
        response = self.client.get("/api/v1/employees/users/list", headers={"Authorization": "Bearer worker", "X-Company-ID": str(self.a.id)})
        self.assertEqual(response.status_code, 403)
        response = self.client.get("/api/v1/employees/users/list", headers={"Authorization": "Bearer worker", "X-Company-ID": str(self.b.id)})
        self.assertEqual(response.status_code, 200, response.text)

    def test_legacy_multiple_roles_and_duplicate_memberships(self):
        response = self.post_user(role_names=["Company Admin", "Employee", "Employee"], company_ids=[str(self.a.id), str(self.a.id)])
        self.assertEqual(response.status_code, 200, response.text)
        new = self.db.query(User).filter_by(username="new").one()
        self.assertEqual(self.db.query(UserRole).filter_by(user_id=new.id).count(), 2)
        member = self.db.query(CompanyMembership).filter_by(user_id=new.id).one()
        self.assertEqual(member.role_id, self.admin_role.id)

    def test_malformed_company_id_rejected(self):
        headers = dict(self.headers, **{"X-Company-ID": "invalid"})
        response = self.client.get("/api/v1/employees", headers=headers)
        self.assertEqual(response.status_code, 400)

    def telegram_link(self):
        from app.models.telegram import TelegramUserLink
        self.worker.employee_id = self.ea.id
        link = TelegramUserLink(company_id=self.a.id, employee_id=self.ea.id, user_id=self.worker.id,
            telegram_user_id="100", telegram_chat_id="100", verification_token="regression-token",
            token_expires_at=datetime.utcnow()+timedelta(minutes=5), is_verified=True)
        self.db.add(link); self.db.commit()
        return link

    def test_telegram_denies_suspended_membership_and_logs_rejection(self):
        from app.services.telegram_service import execute_bot_action
        from app.models.telegram import TelegramActionLog
        self.telegram_link()
        member = self.db.query(CompanyMembership).filter_by(user_id=self.worker.id).one()
        member.status = "Suspended"; self.db.commit()
        result = execute_bot_action(self.db, "100", "100", "cmd:my_tasks")
        self.assertEqual(result["status"], "Unauthorized")
        self.assertEqual(self.db.query(TelegramActionLog).one().status, "Unauthorized")

    def test_telegram_active_user_success_and_disabled_user_denied(self):
        from app.services.telegram_service import execute_bot_action
        self.telegram_link()
        self.assertTrue(execute_bot_action(self.db, "100", "100", "cmd:my_tasks")["success"])
        self.worker.account_status = "Inactive"; self.db.commit()
        self.assertEqual(execute_bot_action(self.db, "100", "100", "cmd:my_tasks")["status"], "Unauthorized")

    def test_telegram_chat_does_not_authenticate_another_sender(self):
        from app.services.telegram_service import execute_bot_action
        self.telegram_link()
        self.assertEqual(execute_bot_action(self.db, "unknown", "100", "cmd:my_tasks")["status"], "Unauthorized")
        self.assertEqual(execute_bot_action(self.db, "100", "other-chat", "cmd:my_tasks")["status"], "Unauthorized")

    def test_telegram_inactive_employee_denied(self):
        from app.services.telegram_service import execute_bot_action
        self.telegram_link()
        self.ea.employment_status = "Terminated"; self.db.commit()
        self.assertEqual(execute_bot_action(self.db, "100", "100", "cmd:my_tasks")["status"], "Unauthorized")

    def test_custody_audit_failure_rolls_back_transfer(self):
        with patch.object(custody, "log_audit", side_effect=RuntimeError("audit unavailable")):
            response = self.client.post(f"/api/v1/custody/transfer/{self.ca.id}", json={"new_employee_id": str(self.next_emp.id)}, headers=self.headers)
        self.assertEqual(response.status_code, 500)
        self.db.refresh(self.ca); self.db.refresh(self.asset_a)
        self.assertEqual(self.ca.status, "Active")
        self.assertEqual(self.asset_a.assigned_employee_id, self.ea.id)
        self.assertEqual(self.db.query(AssetCustody).count(), 2)

    def test_custody_audit_failure_rolls_back_assignment(self):
        asset = TechnicalAsset(company_id=self.a.id, asset_code="AUDIT", asset_name="Audit", asset_type="Laptop", status="Available")
        self.db.add(asset); self.db.commit()
        with patch.object(custody, "log_audit", side_effect=RuntimeError("audit unavailable")):
            response = self.client.post("/api/v1/custody/assign", json={"asset_id": str(asset.id), "employee_id": str(self.next_emp.id)}, headers=self.headers)
        self.assertEqual(response.status_code, 500)
        self.db.refresh(asset)
        self.assertEqual(asset.status, "Available")
        self.assertIsNone(asset.assigned_employee_id)
        self.assertEqual(self.db.query(AssetCustody).count(), 2)


if __name__ == "__main__":
    unittest.main()
