import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy.orm import Session
from fastapi import Request, Response, HTTPException, Depends, status

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserSession, CompanyMembership, UserRole, Role

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except Exception:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(64)


def create_session(
    db: Session, user_id: uuid.UUID, request: Request, response: Response
) -> UserSession:
    token = generate_session_token()
    expires_at = datetime.utcnow() + timedelta(hours=settings.SESSION_EXPIRE_HOURS)

    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "unknown")

    session = UserSession(
        user_id=user_id,
        session_token=token,
        expires_at=expires_at,
        ip_address=ip,
        user_agent=ua,
        is_active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Set secure HttpOnly session cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=False,  # Set True in production over HTTPS
        samesite="lax",
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
        path="/",
    )

    return session


def invalidate_session(db: Session, token: str, response: Response):
    session = db.query(UserSession).filter(UserSession.session_token == token).first()
    if session:
        session.is_active = False
        db.commit()

    response.delete_cookie(key="session_token", path="/")


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    # Check Cookie first, then Authorization: Bearer header
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مسجل الدخول (Not authenticated)",
        )

    now = datetime.utcnow()
    session = (
        db.query(UserSession)
        .filter(
            UserSession.session_token == token,
            UserSession.is_active == True,
            UserSession.expires_at > now,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="جلسة العمل منتهية أو غير صالحة (Invalid or expired session)",
        )

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or user.account_status != "Active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="حساب المستخدم غير مفعّل أو معطل (User account is not active)",
        )

    return user


def get_user_roles(user: User, db: Session) -> List[str]:
    """Retrieve all role names assigned to the user."""
    if user.is_superadmin:
        return ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"]
    user_roles = db.query(UserRole).filter(UserRole.user_id == user.id).all()
    role_ids = [ur.role_id for ur in user_roles]
    if not role_ids:
        return ["Employee"]
    roles = db.query(Role).filter(Role.id.in_(role_ids)).all()
    return [r.name for r in roles]


def get_user_company_id(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Get active company_id from X-Company-ID header, query param, or user default membership."""
    company_id_str = request.headers.get("X-Company-ID") or request.query_params.get("company_id")

    if company_id_str:
        try:
            cid = uuid.UUID(company_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="معرف الشركة غير صالح")

        # Super admin can access any company
        if user.is_superadmin:
            return cid

        # Verify company membership
        membership = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == user.id,
                CompanyMembership.company_id == cid,
            )
            .first()
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية الوصول إلى هذه الشركة (Access denied to this company)",
            )
        return cid

    # Find default membership
    membership = (
        db.query(CompanyMembership)
        .filter(CompanyMembership.user_id == user.id, CompanyMembership.is_default == True)
        .first()
    )
    if not membership:
        membership = (
            db.query(CompanyMembership)
            .filter(CompanyMembership.user_id == user.id)
            .first()
        )

    if not membership:
        if user.is_superadmin:
            # Return first company
            from app.models.company import Company
            c = db.query(Company).first()
            if c:
                return c.id
        raise HTTPException(status_code=400, detail="المستخدم لا ينتمي لأي شركة")

    return membership.company_id


def require_role(allowed_roles: List[str]):
    """Ensure current user has at least one of the allowed roles."""
    def role_checker(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if user.is_superadmin:
            return user

        user_roles = get_user_roles(user, db)
        if not any(role in allowed_roles for role in user_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك الصلاحيات الكافية لتنفيذ هذا الإجراء (Insufficient permissions)",
            )
        return user

    return role_checker
