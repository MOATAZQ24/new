# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from datetime import datetime, timedelta
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
from app.models.user import User, CompanyMembership, Role, UserRole, Employee
from app.models.company import Company
from app.schemas.auth import LoginRequest, ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.services.audit_service import log_audit
from app.services import recovery_service
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
import re
import threading

_BOOTSTRAP_LOCK = threading.Lock()
_DISALLOWED_BOOTSTRAP_PASSWORDS = {"admin@12345", "admin", "password", "123456", "12345678", "changeme", "qwerty123"}

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

    # Get active company memberships first so active company & scoped roles stay synchronized
    memberships = (
        db.query(CompanyMembership)
        .filter(CompanyMembership.user_id == user.id, CompanyMembership.status == "Active")
        .all()
    )
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

    if not user.is_superadmin and not companies:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا توجد عضوية منشأة نشطة لهذا الحساب",
        )

    roles = get_user_roles(user, db, uuid.UUID(active_company_id) if active_company_id else None)

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
    memberships = (
        db.query(CompanyMembership)
        .filter(CompanyMembership.user_id == current_user.id, CompanyMembership.status == "Active")
        .all()
    )
    companies = []
    active_company_id = None
    allowed_cids = set()
    for m in memberships:
        c = db.query(Company).filter(Company.id == m.company_id).first()
        if c:
            allowed_cids.add(str(c.id))
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
            allowed_cids.add(str(c.id))
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

    header_cid = request.headers.get("X-Company-ID")
    if header_cid:
        try:
            header_uuid = str(uuid.UUID(header_cid))
            if current_user.is_superadmin or header_uuid in allowed_cids:
                active_company_id = header_uuid
        except ValueError:
            pass

    roles = get_user_roles(current_user, db, uuid.UUID(active_company_id) if active_company_id else None)

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


# ── Secure First-Run Administrator Bootstrap ──────────────────────────

class BootstrapAdminRequest(BaseModel):
    full_name: str
    username: str
    password: str
    confirm_password: str
    email: str | None = None
    accept_license: bool = False


def _validate_strong_password(pw: str) -> None:
    if not pw or len(pw) < 12:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب أن تتكون كلمة المرور من 12 خانة على الأقل",
        )
    if pw.strip().lower() in _DISALLOWED_BOOTSTRAP_PASSWORDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يرجى اختيار كلمة مرور قوية وغير افتراضية",
        )
    has_upper = bool(re.search(r"[A-Z]", pw))
    has_lower = bool(re.search(r"[a-z]", pw))
    has_digit = bool(re.search(r"\d", pw))
    has_special = bool(re.search(r"[^A-Za-z0-9]", pw))
    if not (has_upper and has_lower and has_digit and has_special):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب أن تحتوي كلمة المرور على حرف كبير، حرف صغير، رقم، ورمز خاص",
        )


@router.get("/bootstrap-status")
def get_bootstrap_status(db: Session = Depends(get_db)):
    """Public check indicating whether initial administrator setup is still required."""
    requires_setup = db.query(User.id).first() is None
    return success_response(data={"requires_setup": requires_setup})


@router.post("/bootstrap")
def bootstrap_first_admin(
    payload: BootstrapAdminRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Transactional, single-use endpoint to initialize the first Super Admin account."""
    if not payload.accept_license:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب الموافقة على شروط الترخيص وإشعار الحقوق قبل إتمام التثبيت",
        )

    full_name = (payload.full_name or "").strip()
    username = (payload.username or "").strip()
    email = (payload.email or "").strip() or None

    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يرجى إدخال الاسم الكامل لمدير النظام",
        )
    if not re.match(r"^[A-Za-z0-9_.-]{3,50}$", username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="اسم المستخدم يجب أن يكون بين 3 و 50 حرفاً إنجليزياً أو رقماً",
        )
    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="كلمتا المرور غير متطابقتين",
        )
    _validate_strong_password(payload.password)

    with _BOOTSTRAP_LOCK:
        if db.query(User.id).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="تم إكمال التهيئة الأولية للنظام مسبقاً؛ هذا المسار مغلق نهائياً",
            )

        try:
            # Ensure essential roles and canonical companies/5 branches exist
            role_defs = [
                ("Super Admin", "مدير النظام العام", "صلاحيات كاملة على مستوى جميع الشركات والعمليات"),
                ("Company Admin", "مدير الشركة", "إدارة كافة بيانات الشركة والموظفين والأصول والتقارير"),
                ("IT Manager", "مدير تقنية المعلومات", "إدارة البنية التحتية والمهام والموافقات ومكتب المساعدة"),
                ("IT Technician", "فني تقنية معلومات", "استلام التذاكر وتنفيذ مهام الصيانة وتسليم العهد"),
                ("Employee", "موظف", "طلب الدعم الفني واستلام العهد ورفع التذاكر"),
                ("Auditor", "مدقق ومراجع", "الاطلاع على التقارير وسجلات المراجعة بدون تعديل"),
            ]
            super_role = db.query(Role).filter(Role.name == "Super Admin").first()
            for r_name, r_ar, r_desc in role_defs:
                if not db.query(Role).filter(Role.name == r_name).first():
                    r_obj = Role(name=r_name, name_ar=r_ar, description=r_desc, is_system_role=True)
                    db.add(r_obj)
                    db.flush()
                    if r_name == "Super Admin":
                        super_role = r_obj
            if not super_role:
                super_role = db.query(Role).filter(Role.name == "Super Admin").first()

            from app.services.enterprise_service import ensure_canonical_internal_companies
            ensure_canonical_internal_companies(db)
            db.flush()

            companies = db.query(Company).order_by(Company.created_at.asc()).all()
            emp = None
            if companies:
                emp = Employee(
                    company_id=companies[0].id,
                    employee_number="EMP-ADMIN-001",
                    full_name=full_name,
                    job_title="مدير النظام العام",
                    email=email,
                    employment_status="Active",
                )
                db.add(emp)
                db.flush()

            admin_user = User(
                username=username,
                password_hash=hash_password(payload.password),
                email=email,
                account_status="Active",
                is_superadmin=True,
                must_change_password=False,
                employee_id=emp.id if emp else None,
            )
            db.add(admin_user)
            db.flush()

            db.add(UserRole(user_id=admin_user.id, role_id=super_role.id))

            if companies:
                for idx, comp in enumerate(companies):
                    db.add(
                        CompanyMembership(
                            user_id=admin_user.id,
                            company_id=comp.id,
                            role_id=super_role.id,
                            is_default=(idx == 0),
                            status="Active",
                        )
                    )

            log_audit(
                db=db,
                action="BOOTSTRAP_FIRST_ADMIN",
                resource_type="User",
                resource_id=str(admin_user.id),
                user_id=admin_user.id,
                company_id=companies[0].id if companies else None,
                new_values={"username": username, "full_name": full_name},
                ip_address=request.client.host if request.client else None,
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="تعذر إكمال التهيئة الأولية بسبب تعارض متزامن",
            )

    return success_response(
        data={"username": username, "full_name": full_name},
        message="تم إنشاء حساب مدير النظام الأول وتأمين النظام بنجاح",
    )



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


# ── Secure First-Run Administrator Bootstrap ──────────────────────────

class BootstrapAdminRequest(BaseModel):
    full_name: str
    username: str
    password: str
    confirm_password: str
    email: str | None = None
    accept_license: bool = False


def _validate_strong_password(pw: str) -> None:
    if not pw or len(pw) < 12:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب أن تتكون كلمة المرور من 12 خانة على الأقل",
        )
    if pw.strip().lower() in _DISALLOWED_BOOTSTRAP_PASSWORDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يرجى اختيار كلمة مرور قوية وغير افتراضية",
        )
    has_upper = bool(re.search(r"[A-Z]", pw))
    has_lower = bool(re.search(r"[a-z]", pw))
    has_digit = bool(re.search(r"\d", pw))
    has_special = bool(re.search(r"[^A-Za-z0-9]", pw))
    if not (has_upper and has_lower and has_digit and has_special):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب أن تحتوي كلمة المرور على حرف كبير، حرف صغير، رقم، ورمز خاص",
        )


@router.get("/bootstrap-status")
def get_bootstrap_status(db: Session = Depends(get_db)):
    """Public check indicating whether initial administrator setup is still required."""
    requires_setup = db.query(User.id).first() is None
    return success_response(data={"requires_setup": requires_setup})


@router.post("/bootstrap")
def bootstrap_first_admin(
    payload: BootstrapAdminRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Transactional, single-use endpoint to initialize the first Super Admin account."""
    if not payload.accept_license:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يجب الموافقة على شروط الترخيص وإشعار الحقوق قبل إتمام التثبيت",
        )

    full_name = (payload.full_name or "").strip()
    username = (payload.username or "").strip()
    email = (payload.email or "").strip() or None

    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="يرجى إدخال الاسم الكامل لمدير النظام",
        )
    if not re.match(r"^[A-Za-z0-9_.-]{3,50}$", username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="اسم المستخدم يجب أن يكون بين 3 و 50 حرفاً إنجليزياً أو رقماً",
        )
    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="كلمتا المرور غير متطابقتين",
        )
    _validate_strong_password(payload.password)

    with _BOOTSTRAP_LOCK:
        if db.query(User.id).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="تم إكمال التهيئة الأولية للنظام مسبقاً؛ هذا المسار مغلق نهائياً",
            )

        try:
            # Ensure essential roles and canonical companies/5 branches exist
            role_defs = [
                ("Super Admin", "مدير النظام العام", "صلاحيات كاملة على مستوى جميع الشركات والعمليات"),
                ("Company Admin", "مدير الشركة", "إدارة كافة بيانات الشركة والموظفين والأصول والتقارير"),
                ("IT Manager", "مدير تقنية المعلومات", "إدارة البنية التحتية والمهام والموافقات ومكتب المساعدة"),
                ("IT Technician", "فني تقنية معلومات", "استلام التذاكر وتنفيذ مهام الصيانة وتسليم العهد"),
                ("Employee", "موظف", "طلب الدعم الفني واستلام العهد ورفع التذاكر"),
                ("Auditor", "مدقق ومراجع", "الاطلاع على التقارير وسجلات المراجعة بدون تعديل"),
            ]
            super_role = db.query(Role).filter(Role.name == "Super Admin").first()
            for r_name, r_ar, r_desc in role_defs:
                if not db.query(Role).filter(Role.name == r_name).first():
                    r_obj = Role(name=r_name, name_ar=r_ar, description=r_desc, is_system_role=True)
                    db.add(r_obj)
                    db.flush()
                    if r_name == "Super Admin":
                        super_role = r_obj
            if not super_role:
                super_role = db.query(Role).filter(Role.name == "Super Admin").first()

            from app.services.enterprise_service import ensure_canonical_internal_companies
            ensure_canonical_internal_companies(db)
            db.flush()

            companies = db.query(Company).order_by(Company.created_at.asc()).all()
            emp = None
            if companies:
                emp = Employee(
                    company_id=companies[0].id,
                    employee_number="EMP-ADMIN-001",
                    full_name=full_name,
                    job_title="مدير النظام العام",
                    email=email,
                    employment_status="Active",
                )
                db.add(emp)
                db.flush()

            admin_user = User(
                username=username,
                password_hash=hash_password(payload.password),
                email=email,
                account_status="Active",
                is_superadmin=True,
                must_change_password=False,
                employee_id=emp.id if emp else None,
            )
            db.add(admin_user)
            db.flush()

            db.add(UserRole(user_id=admin_user.id, role_id=super_role.id))

            if companies:
                for idx, comp in enumerate(companies):
                    db.add(
                        CompanyMembership(
                            user_id=admin_user.id,
                            company_id=comp.id,
                            role_id=super_role.id,
                            is_default=(idx == 0),
                            status="Active",
                        )
                    )

            log_audit(
                db=db,
                action="BOOTSTRAP_FIRST_ADMIN",
                resource_type="User",
                resource_id=str(admin_user.id),
                user_id=admin_user.id,
                company_id=companies[0].id if companies else None,
                new_values={"username": username, "full_name": full_name},
                ip_address=request.client.host if request.client else None,
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="تعذر إكمال التهيئة الأولية بسبب تعارض متزامن",
            )

    return success_response(
        data={"username": username, "full_name": full_name},
        message="تم إنشاء حساب مدير النظام الأول وتأمين النظام بنجاح",
    )


