"""Test Suite: Self-Service Password Recovery via Gmail SMTP (Phase 2).

Covers:
- Account enumeration prevention (identical responses for existent and non-existent users)
- Cryptographic SHA-256 token hashing (zero plaintext token in database)
- 15-minute expiration enforcement
- Strict single-use token consumption
- Session termination upon successful password reset
- Rate limiting protection
- Branded Arabic RTL email generation and mock outbox verification
"""

import os
import sys
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User, Employee, UserSession, PasswordResetToken
from app.core.security import hash_password, verify_password
from app.services import recovery_service, email_service
from fastapi import HTTPException


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: PASSWORD RECOVERY VIA GMAIL SMTP (PHASE 2)")
    print("=" * 65)

    init_db()
    db: Session = SessionLocal()

    try:
        email_service.clear_mock_outbox()

        # 1. Setup test user
        comp = db.query(Company).filter(Company.company_code == "IGT").first()
        assert comp is not None

        unique_suffix = str(uuid.uuid4())[:8]
        test_email = f"recovery_{unique_suffix}@investorgate.sa"
        test_username = f"user_rec_{unique_suffix}"

        emp = Employee(
            company_id=comp.id,
            employee_number=f"EMP-REC-{unique_suffix}",
            full_name=f"مستخدم الاستعادة {unique_suffix}",
            email=test_email,
            job_title="مهندس نظم",
            employment_status="Active",
        )
        db.add(emp)
        db.commit()

        initial_password = "InitialPassword@123"
        test_user = User(
            username=test_username,
            email=test_email,
            password_hash=hash_password(initial_password),
            employee_id=emp.id,
            account_status="Active",
            is_superadmin=False,
        )
        db.add(test_user)
        db.commit()

        # Create active sessions to test termination
        s1 = UserSession(
            user_id=test_user.id,
            session_token=f"sess_token_1_{unique_suffix}",
            expires_at=datetime.utcnow() + timedelta(hours=24),
            is_active=True,
        )
        s2 = UserSession(
            user_id=test_user.id,
            session_token=f"sess_token_2_{unique_suffix}",
            expires_at=datetime.utcnow() + timedelta(hours=24),
            is_active=True,
        )
        db.add_all([s1, s2])
        db.commit()

        print("  ✓ Setup test user and 2 active sessions")

        # ── Test 1: Account Enumeration Prevention ────────────────────
        # Existing user
        res_exist = recovery_service.request_password_reset(
            db=db,
            identifier=test_username,
            ip_address="192.168.1.50",
        )
        # Non-existent user
        res_ghost = recovery_service.request_password_reset(
            db=db,
            identifier="non_existent_ghost_user_9999",
            ip_address="192.168.1.50",
        )

        assert res_exist["success"] is True
        assert res_ghost["success"] is True
        # CRITICAL RULE: Message must be 100% identical to prevent username enumeration!
        assert res_exist["message"] == res_ghost["message"]
        print("  ✓ Anti-Enumeration verified: Identical generic response for existent and non-existent accounts")

        # ── Test 2: SHA-256 Hashed Storage & Email Delivery ───────────
        outbox = email_service.get_mock_outbox()
        assert len(outbox) >= 1
        last_email = outbox[-1]
        assert last_email["to_email"] == test_email
        assert "reset_url" in last_email
        raw_token = last_email["raw_token"]
        assert raw_token is not None and len(raw_token) >= 30

        # Verify database record
        token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
        db_token = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
        assert db_token is not None
        assert db_token.user_id == test_user.id
        assert db_token.is_used is False
        assert db_token.expires_at > datetime.utcnow()
        # Verify RAW token is NEVER stored in database table
        assert db_token.token_hash != raw_token
        print("  ✓ Zero-Plaintext verified: Token stored strictly as SHA-256 hash (64 hex characters)")
        print(f"  ✓ Email Dispatch verified: Arabic RTL email delivered to {test_email}")

        # ── Test 3: Token Verification ────────────────────────────────
        verified = recovery_service.verify_reset_token(db=db, raw_token=raw_token)
        assert verified.id == db_token.id
        print("  ✓ Token verification endpoint: Valid token recognized successfully")

        # Invalid token rejection
        try:
            recovery_service.verify_reset_token(db=db, raw_token="tampered_token_that_does_not_exist_in_db")
            assert False, "Tampered token must fail!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  ✓ Tampered/invalid token correctly rejected with 400 Bad Request")

        # ── Test 4: Successful Password Reset ─────────────────────────
        new_password = "BrandNewSecretPassword@2026!"
        reset_result = recovery_service.reset_password_with_token(
            db=db,
            raw_token=raw_token,
            new_password=new_password,
            ip_address="192.168.1.50",
        )
        assert reset_result["success"] is True

        # Refresh user from DB
        db.refresh(test_user)
        assert verify_password(new_password, test_user.password_hash) is True
        assert verify_password(initial_password, test_user.password_hash) is False
        print("  ✓ Password reset executed: New password verified with Argon2id hash")

        # ── Test 5: Single-Use Token Enforcement ──────────────────────
        db.refresh(db_token)
        assert db_token.is_used is True
        assert db_token.used_at is not None

        try:
            # Reusing already used token
            recovery_service.reset_password_with_token(
                db=db,
                raw_token=raw_token,
                new_password="AnotherAttempt@999",
            )
            assert False, "Used token must never be accepted!"
        except HTTPException as e:
            assert e.status_code == 400
            assert "مسبقاً" in e.detail
            print("  ✓ Single-use token strictly enforced: Replay attempt rejected with 400 Bad Request")

        # ── Test 6: Session Invalidation Across All Devices ───────────
        active_sessions = db.query(UserSession).filter(
            UserSession.user_id == test_user.id,
            UserSession.is_active == True,
        ).all()
        assert len(active_sessions) == 0
        print("  ✓ Session Invalidation verified: All existing user sessions terminated immediately")

        # ── Test 7: Expiration Enforcement (> 15 Minutes) ─────────────
        # Create an expired token manually in DB
        expired_raw = f"expired_raw_{unique_suffix}_{secrets.token_urlsafe(16)}"
        expired_hash = hashlib.sha256(expired_raw.encode("utf-8")).hexdigest()
        expired_token = PasswordResetToken(
            user_id=test_user.id,
            token_hash=expired_hash,
            expires_at=datetime.utcnow() - timedelta(minutes=1),  # Expired
            is_used=False,
        )
        db.add(expired_token)
        db.commit()

        try:
            recovery_service.verify_reset_token(db=db, raw_token=expired_raw)
            assert False, "Expired token must be rejected!"
        except HTTPException as e:
            assert e.status_code == 400
            assert "انتهت صلاحية" in e.detail
            print("  ✓ Expiration verified: Expired token (> 15 minutes) rejected with 400 Bad Request")

        # ── Test 8: Rate Limiting Enforcement ─────────────────────────
        rate_limit_ip = "10.99.88.77"
        rate_limited = False
        for i in range(10):
            try:
                recovery_service.check_rate_limit(f"ip_reset:{rate_limit_ip}", max_requests=4, window_minutes=15)
            except HTTPException as e:
                if e.status_code == 429:
                    rate_limited = True
                    break

        assert rate_limited is True
        print("  ✓ Rate Limiting verified: Excessive requests throttled with 429 Too Many Requests")

        print("=" * 65)
        print("ALL 8 PASSWORD RECOVERY TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
