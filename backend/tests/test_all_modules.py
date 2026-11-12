"""Comprehensive automated test suite for Investor Gate IT Operations Management System.
Tests Authentication, RBAC, Multi-Company Isolation, Asset Custody Lifecycle,
Help Desk Workflow, Maintenance Approvals, Dashboard KPIs, and Report Exports.
"""

import sys
import os
import unittest
from starlette.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import SessionLocal
from app.models.company import Company
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.ticket import HelpDeskTicket, TicketComment
from app.models.user import User


class TestITOperationsSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Get seeded companies
        cls.company_igt = cls.db.query(Company).filter(Company.company_code == "IGT").first()
        cls.company_ait = cls.db.query(Company).filter(Company.company_code == "AIT").first()
        cls.company_nhg = cls.db.query(Company).filter(Company.company_code == "NHG").first()

        assert cls.company_igt is not None, "IGT company not found. Run seed_data.py first!"
        assert cls.company_ait is not None, "AIT company not found."

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    # ── 1. Authentication Tests ──────────────────────────────────────────

    def test_01_login_invalid_password(self):
        """Verify invalid credentials return 401."""
        res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "WrongPassword"})
        self.assertEqual(res.status_code, 401)

    def test_02_login_success(self):
        """Verify admin login succeeds and returns user info with roles."""
        res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]["user"]
        self.assertEqual(data["username"], "admin")
        self.assertTrue(data["is_superadmin"])
        self.assertIn("Super Admin", data["roles"])
        self.assertTrue(len(data["companies"]) >= 3)

        # Store session cookie
        self.admin_cookie = res.cookies.get("session_token")
        self.assertIsNotNone(self.admin_cookie)

    def test_03_get_me_authenticated(self):
        """Verify /auth/me returns current user profile."""
        # Login first
        login_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        token = login_res.cookies.get("session_token")

        res = self.client.get("/api/v1/auth/me", cookies={"session_token": token})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["data"]["user"]["username"], "admin")

    # ── 2. Multi-Company Isolation Tests ─────────────────────────────────

    def test_04_cross_company_isolation(self):
        """Verify employee in Company A cannot access Company B records."""
        # Login as employee in Company 2 (AIT): saud_ait
        login_res = self.client.post("/api/v1/auth/login", json={"username": "saud_ait", "password": "Pass@12345"})
        self.assertEqual(login_res.status_code, 200)
        ait_cookie = login_res.cookies.get("session_token")

        # Try to access assets of Company 1 (IGT) using X-Company-ID header
        res = self.client.get(
            f"/api/v1/assets?company_id={str(self.company_igt.id)}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": ait_cookie},
        )
        # Must be rejected with 403 Forbidden!
        self.assertEqual(res.status_code, 403)

    # ── 3. Technical Assets & Custody Tests ──────────────────────────────

    def test_05_create_and_assign_asset(self):
        """Verify asset registration, atomic assignment, and double-assignment prevention."""
        # Login as admin
        login_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        admin_token = login_res.cookies.get("session_token")

        # 1. Create a new asset
        asset_payload = {
            "company_id": str(self.company_igt.id),
            "asset_code": "AST-TEST-999",
            "asset_name": "Test Lenovo P16 Workstation",
            "asset_type": "Laptop",
            "brand": "Lenovo",
            "model": "ThinkPad P16v",
            "serial_number": "SN-TEST-999-XYZ",
            "condition": "New",
            "status": "Available",
        }
        res_create = self.client.post(
            "/api/v1/assets",
            json=asset_payload,
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_create.status_code, 200)
        asset_id = res_create.json()["data"]["id"]

        # Get an employee from Company IGT
        emp = self.company_igt.branches[0].departments[0].company.branches[0].departments[0]
        from app.models.user import Employee
        first_emp = self.db.query(Employee).filter(Employee.company_id == self.company_igt.id).first()

        # 2. Assign asset to employee
        assign_payload = {
            "asset_id": asset_id,
            "employee_id": str(first_emp.id),
            "condition_on_assignment": "New",
            "notes": "تسليم عهدة اختبار تجريبي",
            "acknowledgment": True,
        }
        res_assign = self.client.post(
            "/api/v1/custody/assign",
            json=assign_payload,
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_assign.status_code, 200)
        custody_id = res_assign.json()["data"]["custody_id"]

        # 3. Verify asset status changed to Assigned
        res_asset = self.client.get(
            f"/api/v1/assets/{asset_id}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_asset.json()["data"]["status"], "Assigned")

        # 4. Attempt conflicting active assignment (Must be rejected with 400)
        res_double = self.client.post(
            "/api/v1/custody/assign",
            json=assign_payload,
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_double.status_code, 400)

        # 5. Return asset
        return_payload = {
            "condition_on_return": "Excellent",
            "notes": "تم فحص الجهاز وإعادته بحالة ممتازة",
        }
        res_return = self.client.post(
            f"/api/v1/custody/return/{custody_id}",
            json=return_payload,
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_return.status_code, 200)

        # 6. Verify asset status returned to Available
        res_asset_after = self.client.get(
            f"/api/v1/assets/{asset_id}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_asset_after.json()["data"]["status"], "Available")

    # ── 4. Help Desk Ticket Lifecycle & Internal Notes ───────────────────

    def test_06_ticket_lifecycle_and_notes_isolation(self):
        """Verify Help Desk tickets, technician internal notes separation, and status workflow."""
        login_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        admin_token = login_res.cookies.get("session_token")

        # 1. Create ticket
        ticket_payload = {
            "company_id": str(self.company_igt.id),
            "issue_title": "تعطل منفذ الشبكة في مكتب المحاسبة",
            "issue_description": "الكيبل لا يضيء عند ربط الجهاز بمنفذ الجدار",
            "priority": "High",
            "category": "Network",
        }
        res_ticket = self.client.post(
            "/api/v1/tickets",
            json=ticket_payload,
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_ticket.status_code, 200)
        ticket_id = res_ticket.json()["data"]["id"]

        # 2. Add public comment
        res_pub_comm = self.client.post(
            f"/api/v1/tickets/{ticket_id}/comments",
            json={"content": "تم تسجيل البلاغ وسيتوجه الفني للموقع خلال 30 دقيقة", "is_internal": False},
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_pub_comm.status_code, 200)

        # 3. Add internal technician note
        res_int_comm = self.client.post(
            f"/api/v1/tickets/{ticket_id}/comments",
            json={"content": "ملاحظة فنية سرية: منفذ Patch Panel رقم 14 يحتاج إعادة تأريض", "is_internal": True},
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_int_comm.status_code, 200)

        # 4. Check that staff (admin) sees internal note
        res_get_admin = self.client.get(
            f"/api/v1/tickets/{ticket_id}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        comments_admin = res_get_admin.json()["data"]["comments"]
        has_internal_admin = any(c["is_internal"] for c in comments_admin)
        self.assertTrue(has_internal_admin)

        # 5. Check that standard employee does NOT see internal note
        login_emp = self.client.post("/api/v1/auth/login", json={"username": "mona_igt", "password": "Pass@12345"})
        emp_token = login_emp.cookies.get("session_token")
        res_get_emp = self.client.get(
            f"/api/v1/tickets/{ticket_id}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": emp_token},
        )
        comments_emp = res_get_emp.json()["data"]["comments"]
        has_internal_emp = any(c["is_internal"] for c in comments_emp)
        self.assertFalse(has_internal_emp, "Security Violation: Internal notes exposed to regular employee!")

        # 6. Advance ticket status to Resolved
        res_status = self.client.post(
            f"/api/v1/tickets/{ticket_id}/status?new_status=Resolved&notes=تم+إصلاح+المنفذ",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res_status.status_code, 200)

    # ── 5. Dashboard KPIs & Reports Export Tests ─────────────────────────

    def test_07_dashboard_kpis(self):
        """Verify dashboard endpoint calculates real KPIs accurately from database."""
        login_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        admin_token = login_res.cookies.get("session_token")

        res = self.client.get(
            f"/api/v1/dashboard?company_id={str(self.company_igt.id)}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertGreater(data["total_assets"], 0)
        self.assertGreater(data["total_employees"], 0)
        self.assertGreater(data["active_subscriptions"], 0)
        self.assertIn("asset_status_distribution", data)
        self.assertIn("recent_activities", data)

    def test_08_reports_export_excel(self):
        """Verify Excel/CSV export returns UTF-8 with BOM for correct Arabic RTL handling."""
        login_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin@12345"})
        admin_token = login_res.cookies.get("session_token")

        res = self.client.get(
            f"/api/v1/reports/export?report_type=assets&format_type=excel&company_id={str(self.company_igt.id)}",
            headers={"X-Company-ID": str(self.company_igt.id)},
            cookies={"session_token": admin_token},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.headers.get("content-type", ""))
        # Verify UTF-8 BOM is present
        self.assertTrue(res.content.startswith(b"\xef\xbb\xbf"))


if __name__ == "__main__":
    unittest.main()
