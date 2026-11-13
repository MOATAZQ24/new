"""Direct Endpoint Verification for /auth/forgot-password, /auth/verify-reset-token, /auth/reset-password."""

import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User, Employee
from app.core.security import hash_password, verify_password
from app.api.v1.endpoints import auth
from app.schemas.auth import ForgotPasswordRequest, ResetPasswordRequest
from app.services import email_service
from fastapi import Request
from starlette.datastructures import Headers


class DummyRequest(Request):
    def __init__(self, ip="192.168.1.100", ua="Mozilla/5.0 Test"):
        scope = {
            "type": "http",
            "client": (ip, 12345),
            "headers": [(b"user-agent", ua.encode("utf-8"))],
            "path": "/",
        }
        super().__init__(scope)


def test_auth_recovery_endpoints():
    print("=" * 65)
    print("STARTING DIRECT ENDPOINT TEST: AUTH PASSWORD RECOVERY API")
    print("=" * 65)

    init_db()
    db = SessionLocal()

    try:
        email_service.clear_mock_outbox()

        comp = db.query(Company).filter(Company.company_code == "IGT").first()
        assert comp is not None

        unique_suffix = str(uuid.uuid4())[:8]
        test_email = f"endpoint_rec_{unique_suffix}@investorgate.sa"
        test_username = f"user_ep_{unique_suffix}"

        emp = Employee(
            company_id=comp.id,
            employee_number=f"EMP-EP-{unique_suffix}",
            full_name=f"مستخدم نقطة النهاية {unique_suffix}",
            email=test_email,
            job_title="مهندس اختبار",
            employment_status="Active",
        )
        db.add(emp)
        db.commit()

        initial_pwd = "OldPassword@123"
        user = User(
            username=test_username,
            email=test_email,
            password_hash=hash_password(initial_pwd),
            employee_id=emp.id,
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user)
        db.commit()

        req = DummyRequest()

        # 1. POST /auth/forgot-password (Existent user)
        res_exist = auth.forgot_password_endpoint(
            payload=ForgotPasswordRequest(identifier=test_username),
            request=req,
            db=db,
        )
        assert "message" in res_exist

        # 2. POST /auth/forgot-password (Non-existent user - Anti-enumeration)
        res_ghost = auth.forgot_password_endpoint(
            payload=ForgotPasswordRequest(identifier="phantom_user_xyz"),
            request=req,
            db=db,
        )
        assert "message" in res_ghost
        assert res_exist["message"] == res_ghost["message"]
        print("  ✓ POST /auth/forgot-password: Anti-enumeration verified (Identical messages)")

        # 3. Retrieve generated token from email dispatch
        outbox = email_service.get_mock_outbox()
        assert len(outbox) >= 1
        raw_token = outbox[-1]["raw_token"]
        assert raw_token is not None
        print(f"  ✓ Email Dispatch: Captured secure token for verification")

        # 4. POST /auth/verify-reset-token
        body_verify = auth.VerifyTokenBody(token=raw_token)
        res_verify = auth.verify_token_endpoint(payload=body_verify, request=req, db=db)
        assert "message" in res_verify
        print("  ✓ POST /auth/verify-reset-token: Token validated successfully")

        # 5. POST /auth/reset-password
        new_pwd = "UpdatedSecurePass@999"
        res_reset = auth.reset_password_endpoint(
            payload=ResetPasswordRequest(token=raw_token, new_password=new_pwd),
            request=req,
            db=db,
        )
        assert "message" in res_reset
        print("  ✓ POST /auth/reset-password: Password updated successfully")

        # 6. Verify authentication with new password
        db.refresh(user)
        assert verify_password(new_pwd, user.password_hash) is True
        assert verify_password(initial_pwd, user.password_hash) is False
        print("  ✓ Verification: Login credentials successfully updated with new Argon2id hash")

        print("=" * 65)
        print("ALL AUTH PASSWORD RECOVERY ENDPOINTS PASSED 100%! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    test_auth_recovery_endpoints()
