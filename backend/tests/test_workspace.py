# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Isolated HTTP workflow tests; never write to the application's database."""
import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from PIL import Image
from app.models import Base
from app.models.user import User, Role, CompanyMembership
from app.models.company import Company
from app.core.database import get_db
from app.core.security import get_current_user
from app.api.v1.endpoints import workspace, dashboard


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.company = Company(company_name_ar="اختبار", company_name_en="Test", company_code="TEST")
        self.other = Company(company_name_ar="أخرى", company_name_en="Other", company_code="OTHER")
        self.admin_role = Role(name="Company Admin")
        self.employee_role = Role(name="Employee")
        self.user = User(username="test", email="test@example.test", password_hash="not-a-login", is_superadmin=False)
        self.second = User(username="second", email="second@example.test", password_hash="not-a-login", is_superadmin=False)
        self.db.add_all([self.company, self.other, self.admin_role, self.employee_role, self.user, self.second]); self.db.flush()
        self.membership = CompanyMembership(user_id=self.user.id, company_id=self.company.id, role_id=self.admin_role.id, is_default=True)
        self.db.add_all([self.membership, CompanyMembership(user_id=self.second.id, company_id=self.company.id, role_id=self.employee_role.id, is_default=True)]); self.db.commit()
        self.current = self.user
        app = FastAPI(); app.include_router(workspace.router); app.include_router(dashboard.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current
        self.client = TestClient(app)
        self.headers = {"X-Company-ID": str(self.company.id)}

    def tearDown(self):
        self.client.close(); self.db.close(); self.engine.dispose()

    def get(self):
        res = self.client.get("/workspace", headers=self.headers)
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["data"]

    def test_save_reload_reset_and_user_isolation(self):
        config = self.get()["configuration"]
        config["appearance"]["theme"] = "dark"
        config["widgets"] = list(reversed(config["widgets"]))
        config["widgets"][0]["enabled"] = False
        config["tables"] = {"/assets": {"columns": ["name", "status"], "hidden": ["status"], "per_page": 50, "filters": {"status": "Available"}, "sort": "name", "view": "Available assets"}}
        self.assertEqual(self.client.put("/workspace", json=config, headers=self.headers).status_code, 200)
        self.assertEqual(self.get()["configuration"]["widgets"], config["widgets"])
        self.assertEqual(self.get()["configuration"]["tables"]["/assets"]["per_page"], 50)
        self.current = self.second
        self.assertEqual(self.get()["configuration"]["appearance"]["theme"], "system")
        self.current = self.user
        self.assertEqual(self.get()["configuration"]["appearance"]["theme"], "dark")
        self.assertEqual(self.client.delete("/workspace", headers=self.headers).status_code, 200)
        self.assertEqual(self.get()["configuration"]["appearance"]["theme"], "system")

    def test_validation_and_essential_settings(self):
        for mutate in [lambda c: c["appearance"].update(primary="url(javascript:x)"), lambda c: c["appearance"].update(sidebar_width=9999), lambda c: c["widgets"].append({"id": "secret", "enabled": True}), lambda c: c["navigation"][-1].update(hidden=True)]:
            config = self.get()["configuration"]; mutate(config)
            self.assertEqual(self.client.put("/workspace", json=config, headers=self.headers).status_code, 422)

    def test_company_isolation_and_scoped_admin(self):
        other = {"X-Company-ID": str(self.other.id)}
        self.assertEqual(self.client.get("/workspace", headers=other).status_code, 403)
        self.assertEqual(self.client.get(f"/dashboard?company_id={self.other.id}", headers=self.headers).status_code, 403)
        self.current = self.second
        self.assertFalse(self.get()["can_manage_company"])
        self.assertEqual(self.client.put("/workspace/company-defaults", json={}, headers=self.headers).status_code, 403)
        self.assertEqual(self.client.put("/workspace/branding/logo", files={"file": ("x.png", b"x", "image/png")}, headers=self.headers).status_code, 403)
        dashboard_data = self.client.get("/dashboard", headers=self.headers)
        self.assertEqual(dashboard_data.status_code, 200, dashboard_data.text)
        self.assertNotIn("monthly_subscription_cost", dashboard_data.json()["data"])
        self.assertNotIn("activity", self.get()["available_widgets"])

    def test_enforced_defaults_override_user_settings(self):
        self.assertEqual(self.client.put("/workspace/company-defaults", json={"appearance": {"primary": "#112233"}, "enforced": ["primary"]}, headers=self.headers).status_code, 200)
        self.current = self.second
        config = self.get()["configuration"]
        config["appearance"]["primary"] = "#ffffff"
        res = self.client.put("/workspace", json=config, headers=self.headers)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["data"]["configuration"]["appearance"]["primary"], "#112233")

    def test_branding_sanitization_validation_isolation_and_removal(self):
        data = io.BytesIO(); Image.new("RGB", (32, 32), "green").save(data, format="PNG")
        res = self.client.put("/workspace/branding/logo", files={"file": ("logo.svg", data.getvalue(), "image/svg+xml")}, headers=self.headers)
        self.assertEqual(res.status_code, 200, res.text)
        path = res.json()["data"]["branding"]["logo"]
        image = self.client.get(path)
        self.assertEqual(image.headers["content-type"], "image/png")
        self.assertEqual(image.headers["cache-control"], "no-store")
        self.assertEqual(self.client.get(f"/workspace/branding/{self.other.id}/logo").status_code, 403)
        for bad in [b'<svg onload="alert(1)"></svg>', b"x" * (2 * 1024 * 1024 + 1)]:
            self.assertEqual(self.client.put("/workspace/branding/logo", files={"file": ("logo.png", bad)}, headers=self.headers).status_code, 422)
        tiny = io.BytesIO(); Image.new("RGB", (8, 8)).save(tiny, format="PNG")
        self.assertEqual(self.client.put("/workspace/branding/logo", files={"file": ("tiny.png", tiny.getvalue())}, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.delete("/workspace/branding/logo", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
