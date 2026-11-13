"""Password Recovery & Self-Service Reset Service.

Enforces:
- Cryptographically secure single-use tokens with 15-minute expiry
- SHA-256 hashed storage only (zero plaintext token persistence)
- Strict account enumeration protection (identical generic responses)
- Rate limiting on reset requests and verification attempts
- Full invalidation of all existing user sessions upon successful reset
- Audit trail logging
"""

import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserSession, PasswordResetToken
from app.services.audit_service import log_audit
from app.services import email_service

logger = logging.getLogger(__name__)

# In-memory rate limiting tracker: IP / identifier -> list of request timestamps
_RATE_LIMIT_STORE: Dict[str, list] = {}


def check_rate_limit(key: str, max_requests: int = 5, window_minutes: int = 15) -> None:
    """Enforce rate limits per IP or identifier within a sliding time window."""
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=window_minutes)

    timestamps = _RATE_LIMIT_STORE.get(key, [])
    # Filter out timestamps outside window
    timestamps = [ts for ts in timestamps if ts > window_start]
    if len(timestamps) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تم تجاوز الحد المسموح به من الطلبات مؤقتاً. يرجى الانتظار والمحاولة لاحقاً.",
        )
    timestamps.append(now)
    _RATE_LIMIT_STORE[key] = timestamps


def hash_reset_token(raw_token: str) -> str:
    """Compute SHA-256 digest of a raw reset token."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def request_password_reset(
    db: Session,
    identifier: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """Process a public forgot-password request.
    Always returns identical message regardless of whether the account exists or not (anti-enumeration).
    """
    clean_id = (identifier or "").strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يرجى إدخال اسم المستخدم أو البريد الإلكتروني المسجل",
        )

    # Apply rate limiting per IP and per identifier
    if ip_address:
        check_rate_limit(f"ip_reset:{ip_address}", max_requests=5, window_minutes=15)
    check_rate_limit(f"ident_reset:{clean_id.lower()}", max_requests=3, window_minutes=15)

    # Generic success message returned in all outcomes
    generic_response = {
        "success": True,
        "message": "إذا كان الحساب مسجلاً في المنظومة، فسيتم إرسال رابط استعادة كلمة المرور إلى البريد الإلكتروني المسجل خلال لحظات.",
    }

    # Find user by username or email
    user = (
        db.query(User)
        .filter(
            or_(
                User.username == clean_id,
                User.email == clean_id,
            )
        )
        .first()
    )

    # If user doesn't exist, is deleted, or has no valid email, exit gracefully
    if not user or getattr(user, "is_deleted", False) or not user.email or user.account_status != "Active":
        # Simulate slight constant-time delay against timing enumeration
        hash_reset_token(secrets.token_urlsafe(32))
        return generic_response

    # Invalidate any existing unused reset tokens for this user
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False,
    ).update({"is_used": True})

    # Generate secure random token
    raw_token = secrets.token_urlsafe(32)
    token_digest = hash_reset_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

    # Persist ONLY the hash
    token_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_digest,
        expires_at=expires_at,
        is_used=False,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(token_record)
    db.commit()

    recipient_name = user.employee.full_name if user.employee else user.username

    # Dispatch email
    email_service.send_password_reset_email(
        to_email=user.email,
        recipient_name=recipient_name,
        raw_token=raw_token,
        expire_minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    )

    # Audit log
    log_audit(
        db=db,
        action="FORGOT_PASSWORD_REQUEST",
        resource_type="User",
        resource_id=str(user.id),
        user_id=user.id,
        ip_address=ip_address,
    )

    return generic_response


def verify_reset_token(
    db: Session,
    raw_token: str,
    ip_address: Optional[str] = None,
) -> PasswordResetToken:
    """Validate token format, existence, single-use, and expiration."""
    clean_token = (raw_token or "").strip()
    if len(clean_token) < 16:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز استعادة كلمة المرور غير صالح",
        )

    if ip_address:
        check_rate_limit(f"token_verify:{ip_address}", max_requests=10, window_minutes=15)

    token_digest = hash_reset_token(clean_token)
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_digest).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رابط استعادة كلمة المرور غير صالح أو غير موجود",
        )

    if record.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="تم استخدام رابط استعادة كلمة المرور هذا مسبقاً (رابط أحادي الاستخدام). يرجى طلب رابط جديد.",
        )

    if record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="انتهت صلاحية رابط استعادة كلمة المرور (صالح لمدة 15 دقيقة فقط). يرجى طلب رابط جديد.",
        )

    return record


def reset_password_with_token(
    db: Session,
    raw_token: str,
    new_password: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute password reset using verified token, enforce strong password, and terminate active sessions."""
    # Verify token
    record = verify_reset_token(db=db, raw_token=raw_token, ip_address=ip_address)

    # Validate new password
    clean_pwd = (new_password or "").strip()
    if len(clean_pwd) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يجب ألا تقل كلمة المرور الجديدة عن 6 خانات",
        )

    user = record.user
    if not user or user.account_status != "Active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="حساب المستخدم غير نشط أو تم تعطيله",
        )

    # 1. Update user password and clear lockouts
    user.password_hash = hash_password(clean_pwd)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.must_change_password = False

    # 2. Mark token as used
    record.is_used = True
    record.used_at = datetime.utcnow()

    # 3. Invalidate any other outstanding reset tokens for this user
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False,
    ).update({"is_used": True})

    # 4. Invalidate ALL existing active user sessions across all browsers/devices
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.is_active == True,
    ).update({"is_active": False})

    db.commit()

    # 5. Audit log
    log_audit(
        db=db,
        action="RESET_PASSWORD_SUCCESS",
        resource_type="User",
        resource_id=str(user.id),
        user_id=user.id,
        ip_address=ip_address,
    )

    logger.info(f"Password reset successfully completed for user {user.username}. All existing sessions invalidated.")

    return {
        "success": True,
        "message": "تمت إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
    }
