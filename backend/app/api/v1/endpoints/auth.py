import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    verify_password,
    hash_password,
    create_session,
    invalidate_session,
    get_current_user,
    get_user_roles,
)
from app.core.response import success_response
from app.models.user import User, CompanyMembership
from app.models.company import Company
from app.schemas.auth import LoginRequest, ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.services.audit_service import log_audit
from app.services import recovery_service
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Authenticate user with username and password using Argon2id."""
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if not user or getattr(user, "is_deleted", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="تم قفل الحساب مؤقتاً لتكرار محاولات الدخول الخاطئة. يرجى مراجعة مسؤول النظام أو المحاولة لاحقاً.",
        )

    if user.account_status != "Active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="حساب المستخدم معطل أو غير نشط",
        )

    if not verify_password(payload.password, user.password_hash):
        # Update failed login count
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.utcnow() + timedelta(minutes=15)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )

    # Reset failed attempts and update last_login
    user.failed_login_attempts = 0
    user.last_login = datetime.utcnow()
    db.commit()

    # Create session and set cookie
    session = create_session(db, user.id, request, response)

    # Get roles and companies
    roles = get_user_roles(user, db)

    # Get company memberships
    memberships = db.query(CompanyMembership).filter(CompanyMembership.user_id == user.id).all()
    companies = []
    active_company_id = None
    for m in memberships:
        c = db.query(Company).filter(Company.id == m.company_id).first()
        if c:
            c_info = {
                "id": str(c.id),
                "name_ar": c.company_name_ar,
                "name_en": c.company_name_en,
                "code": c.company_code,
                "company_logo": c.company_logo,
                "role": m.role.name if m.role else ("Super Admin" if user.is_superadmin else "Employee"),
                "is_default": m.is_default,
            }
            companies.append(c_info)
            if m.is_default or active_company_id is None:
                active_company_id = str(c.id)

    if user.is_superadmin and not companies:
        all_companies = db.query(Company).all()
        for c in all_companies:
            companies.append({
                "id": str(c.id),
                "name_ar": c.company_name_ar,
                "name_en": c.company_name_en,
                "code": c.company_code,
                "company_logo": c.company_logo,
                "role": "Super Admin",
                "is_default": False,
            })
            if active_company_id is None:
                active_company_id = str(c.id)

    full_name = user.employee.full_name if user.employee else user.username

    log_audit(
        db=db,
        action="LOGIN",
        resource_type="User",
        resource_id=str(user.id),
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )

    user_info = {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "account_status": user.account_status,
        "is_superadmin": user.is_superadmin,
        "must_change_password": getattr(user, "must_change_password", False),
        "roles": roles,
        "companies": companies,
        "active_company_id": active_company_id,
        "employee_id": str(user.employee_id) if user.employee_id else None,
        "full_name": full_name,
        "token": session.session_token,
    }

    return success_response(data={"user": user_info}, message="تم تسجيل الدخول بنجاح")


@router.post("/logout")
def logout(request: Request, response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Log out current user and invalidate session."""
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if token:
        invalidate_session(db, token, response)

    log_audit(
        db=db,
        action="LOGOUT",
        resource_type="User",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )

    return success_response(message="تم تسجيل الخروج بنجاح")


@router.get("/me")
def get_me(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get profile of current authenticated user."""
    roles = get_user_roles(current_user, db)

    memberships = db.query(CompanyMembership).filter(CompanyMembership.user_id == current_user.id).all()
    companies = []
    active_company_id = None
    for m in memberships:
        c = db.query(Company).filter(Company.id == m.company_id).first()
        if c:
            c_info = {
                "id": str(c.id),
                "name_ar": c.company_name_ar,
                "name_en": c.company_name_en,
                "code": c.company_code,
                "company_logo": c.company_logo,
                "role": m.role.name if m.role else ("Super Admin" if current_user.is_superadmin else "Employee"),
                "is_default": m.is_default,
            }
            companies.append(c_info)
            if m.is_default or active_company_id is None:
                active_company_id = str(c.id)

    if current_user.is_superadmin and not companies:
        all_companies = db.query(Company).all()
        for c in all_companies:
            companies.append({
                "id": str(c.id),
                "name_ar": c.company_name_ar,
                "name_en": c.company_name_en,
                "code": c.company_code,
                "company_logo": c.company_logo,
                "role": "Super Admin",
                "is_default": False,
            })
            if active_company_id is None:
                active_company_id = str(c.id)

    full_name = current_user.employee.full_name if current_user.employee else current_user.username

    user_info = {
        "id": str(current_user.id),
        "username": current_user.username,
        "email": current_user.email,
        "account_status": current_user.account_status,
        "is_superadmin": current_user.is_superadmin,
        "must_change_password": getattr(current_user, "must_change_password", False),
        "roles": roles,
        "companies": companies,
        "active_company_id": active_company_id,
        "employee_id": str(current_user.employee_id) if current_user.employee_id else None,
        "full_name": full_name,
    }

    return success_response(data={"user": user_info})


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change user password."""
    if not verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="يجب أن تتكون كلمة المرور الجديدة من 6 خانات على الأقل")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.commit()

    log_audit(
        db=db,
        action="CHANGE_PASSWORD",
        resource_type="User",
        resource_id=str(current_user.id),
        user_id=current_user.id,
    )

    return success_response(message="تم تغيير كلمة المرور بنجاح")


# ── Self-Service Password Recovery ────────────────────────────────────

class VerifyTokenBody(BaseModel):
    token: str


@router.post("/forgot-password")
def forgot_password_endpoint(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Public self-service forgot password endpoint with enumeration protection."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    res = recovery_service.request_password_reset(
        db=db,
        identifier=payload.identifier,
        ip_address=ip,
        user_agent=ua,
    )
    return success_response(message=res["message"])


@router.post("/verify-reset-token")
def verify_token_endpoint(
    payload: VerifyTokenBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """Validate reset token status and expiration before presenting the reset form."""
    ip = request.client.host if request.client else None
    recovery_service.verify_reset_token(db=db, raw_token=payload.token, ip_address=ip)
    return success_response(message="رمز استعادة كلمة المرور صالح ويمكن المتابعة")


@router.post("/reset-password")
def reset_password_endpoint(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Execute password reset, invalidate token, and terminate all active sessions."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    res = recovery_service.reset_password_with_token(
        db=db,
        raw_token=payload.token,
        new_password=payload.new_password,
        ip_address=ip,
        user_agent=ua,
    )
    return success_response(message=res["message"])

