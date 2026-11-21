# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Direct unit tests for API endpoints and business logic."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User, Employee
from app.models.asset import TechnicalAsset, AssetCustody
from app.api.v1.endpoints.auth import login, get_me
from app.api.v1.endpoints.custody import assign_asset, return_asset
from app.api.v1.endpoints.dashboard import get_dashboard_data
from app.schemas.auth import LoginRequest
from app.schemas.asset import AssetCustodyAssign, AssetCustodyReturn
from fastapi import Request, Response
from starlette.datastructures import Headers


class DummyClient:
    host = "127.0.0.1"


class DummyRequest(Request):
    def __init__(self, cookies=None, headers=None):
        scope = {
            "type": "http",
            "client": ("127.0.0.1", 12345),
            "headers": [],
            "path": "/",
        }
        super().__init__(scope)
        self._cookies = cookies or {}
        self._headers = Headers(headers or {})

    @property
    def cookies(self):
        return self._cookies

    @property
    def headers(self):
        return self._headers


def test_auth_and_workflows():
    db = SessionLocal()
    print("Testing Auth...")
    req = DummyRequest()
    res = Response()

    # 1. Login with admin
    login_payload = LoginRequest(username="admin", password="Admin@12345")
    auth_res = login(login_payload, req, res, db)
    assert auth_res["data"]["user"]["username"] == "admin"
    assert "Super Admin" in auth_res["data"]["user"]["roles"]
    print("✓ Admin login successful:", auth_res["data"]["user"]["username"])

    admin_user = db.query(User).filter(User.username == "admin").first()

    # 2. Test Dashboard KPIs
    igt_company = db.query(Company).filter(Company.company_code == "IGT").first()
    dash_res = get_dashboard_data(igt_company.id, admin_user, igt_company.id, db)
    d = dash_res["data"]
    assert d["total_assets"] >= 10
    assert d["total_employees"] >= 10
    assert d["active_subscriptions"] >= 5
    print(f"✓ Dashboard KPIs verified: {d['total_assets']} assets, {d['total_employees']} employees, {d['active_subscriptions']} subscriptions")

    # 3. Test Custody Assignment and Return
    print("Testing Custody Workflow...")
    available_asset = db.query(TechnicalAsset).filter(
        TechnicalAsset.company_id == igt_company.id,
        TechnicalAsset.status == "Available"
    ).first()

    if not available_asset:
        # Create one
        available_asset = TechnicalAsset(
            company_id=igt_company.id,
            asset_code="AST-UNIT-01",
            asset_name="Test Asset",
            asset_type="Laptop",
            status="Available",
            condition="Good"
        )
        db.add(available_asset)
        db.commit()
        db.refresh(available_asset)

    emp = db.query(Employee).filter(Employee.company_id == igt_company.id).first()

    assign_payload = AssetCustodyAssign(
        asset_id=available_asset.id,
        employee_id=emp.id,
        condition_on_assignment="Good",
        notes="اختبار تسليم العهدة"
    )
    assign_res = assign_asset(assign_payload, admin_user, igt_company.id, db)
    custody_id = assign_res["data"]["custody_id"]
    print("✓ Asset assigned:", assign_res["message"])

    # Verify status is now Assigned
    db.refresh(available_asset)
    assert available_asset.status == "Assigned"

    # Return asset
    return_payload = AssetCustodyReturn(
        condition_on_return="Good",
        notes="إرجاع بعد الاختبار"
    )
    import uuid
    ret_res = return_asset(uuid.UUID(custody_id), return_payload, admin_user, igt_company.id, db)
    print("✓ Asset returned:", ret_res["message"])

    db.refresh(available_asset)
    assert available_asset.status == "Available"

    print("\nALL BACKEND UNIT TESTS PASSED SUCCESSFULLY! ✓✓✓")
    db.close()


if __name__ == "__main__":
    test_auth_and_workflows()
