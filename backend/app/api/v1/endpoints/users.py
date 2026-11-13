import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    get_current_user,
    get_user_company_id,
    require_role,
    hash_password,
    verify_password,
    get_user_roles,
)
from app.core.rbac import (
    require_permission,
    has_module_permission,
    get_permission_matrix_serializable,
    get_user_effective_roles,
    Module,
    Action,
)
from app.core.response import success_response, paginate
from app.models.user import User, Employee, Role, UserRole, CompanyMembership, UserSession
from app.models.company import Company, Branch, Department
from app.schemas.user import (
    UserCreateForm,
    UserUpdateForm,
    UserStatusUpdate,
    UserResetPasswordAdmin,
    CompanyAccessAssign,
    BulkUserImportRequest,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/users", tags=["User Management & Access Control"])


def generate_temp_password(length: int = 12) -> str:
    """Generate a secure, human-readable temporary password."""
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(chars) for _ in range(length))


# ── 1. List Users ──────────────────────────────────────────────────────────

@router.get("")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role_filter: Optional[str] = Query(None, alias="role"),
    company_filter: Optional[uuid.UUID] = Query(None, alias="company_id"),
    status_filter: Optional[str] = Query(None, alias="status"),
    include_deleted: bool = False,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "Auditor"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List users with company isolation, search, and role filtering."""
    query = db.query(User)

    if not include_deleted:
        query = query.filter(User.is_deleted == False)

    # Multi-tenant isolation: Super Admin sees all or filtered company; Company Admin sees their company's users
    target_cid = company_filter or active_cid
    if not current_user.is_superadmin:
        query = query.join(CompanyMembership, CompanyMembership.user_id == User.id).filter(
            CompanyMembership.company_id == target_cid,
            CompanyMembership.status == "Active",
        )
    elif company_filter:
        query = query.join(CompanyMembership, CompanyMembership.user_id == User.id).filter(
            CompanyMembership.company_id == company_filter
        )

    if status_filter:
        query = query.filter(User.account_status == status_filter)

    if search:
        s = f"%{search}%"
        query = query.outerjoin(Employee, Employee.id == User.employee_id).filter(
            (User.username.ilike(s))
            | (User.email.ilike(s))
            | (Employee.full_name.ilike(s))
            | (Employee.phone.ilike(s))
        )

    total = query.distinct().count()
    users = (
        query.distinct()
        .order_by(User.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for u in users:
        # Effective roles in target company
        effective_roles = get_user_effective_roles(u, target_cid, db)

        memberships = (
            db.query(CompanyMembership)
            .filter(CompanyMembership.user_id == u.id, CompanyMembership.status == "Active")
            .all()
        )
        companies_data = []
        for m in memberships:
            comp = db.query(Company).filter(Company.id == m.company_id).first()
            br = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
            if comp:
                companies_data.append({
                    "company_id": str(comp.id),
                    "company_name": comp.company_name_ar,
                    "branch_id": str(br.id) if br else None,
                    "branch_name": br.branch_name if br else None,
                    "role": m.role.name if m.role else "Employee",
                    "is_default": m.is_default,
                })

        is_locked = bool(u.locked_until and u.locked_until > datetime.utcnow())

        data.append({
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "full_name": u.employee.full_name if u.employee else u.username,
            "phone": u.employee.phone if u.employee else None,
            "job_title": u.employee.job_title if u.employee else None,
            "account_status": u.account_status,
            "is_superadmin": u.is_superadmin,
            "must_change_password": getattr(u, "must_change_password", False),
            "is_deleted": getattr(u, "is_deleted", False),
            "is_locked": is_locked,
            "locked_until": u.locked_until,
            "failed_login_attempts": u.failed_login_attempts,
            "roles": effective_roles,
            "companies": companies_data,
            "last_login": u.last_login,
            "created_at": u.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


# ── 2. Create User ─────────────────────────────────────────────────────────

@router.post("")
def create_user(
    payload: UserCreateForm,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new user with minimal wizard fields, role assignment, and multi-company membership."""
    # Privilege escalation prevention
    if payload.role == "Super Admin" and not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط مدير النظام العام (Super Admin) يملك صلاحية تعيين رتبة Super Admin",
        )

    # Company authorization check: Non-superadmin cannot create users for other companies
    target_cid = payload.company_id
    if not current_user.is_superadmin and target_cid != active_cid:
        # Check if current_user is admin in target_cid
        admin_membership = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == current_user.id,
                CompanyMembership.company_id == target_cid,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if not admin_membership or not admin_membership.role or admin_membership.role.name != "Company Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية إدارة المستخدمين في هذه الشركة",
            )

    # Duplicate checks
    existing_u = db.query(User).filter(User.username == payload.username.strip()).first()
    if existing_u:
        raise HTTPException(status_code=400, detail="اسم المستخدم مسجل مسبقاً في النظام")

    existing_e = db.query(User).filter(User.email == payload.email.strip()).first()
    if existing_e:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً في النظام")

    # Handle temporary credentials
    generated_temp_pass = None
    if not payload.password:
        generated_temp_pass = generate_temp_password(12)
        raw_password = generated_temp_pass
    else:
        raw_password = payload.password

    # 1. Create Employee record if not existing
    emp_number = f"EMP-{uuid.uuid4().hex[:6].upper()}"
    employee = Employee(
        company_id=target_cid,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        employee_number=emp_number,
        full_name=payload.full_name.strip(),
        email=payload.email.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        job_title=payload.role,
        employment_status="Active",
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)

    # 2. Create User account
    is_super = payload.role == "Super Admin" and current_user.is_superadmin
    new_user = User(
        employee_id=employee.id,
        username=payload.username.strip(),
        password_hash=hash_password(raw_password),
        email=payload.email.strip(),
        account_status=payload.account_status,
        is_superadmin=is_super,
        must_change_password=payload.must_change_password,
        is_deleted=False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 3. Resolve Role
    role_obj = db.query(Role).filter(Role.name == payload.role).first()
    if not role_obj:
        role_obj = Role(name=payload.role, is_system_role=True)
        db.add(role_obj)
        db.commit()
        db.refresh(role_obj)

    # Global role
    user_role = UserRole(user_id=new_user.id, role_id=role_obj.id)
    db.add(user_role)

    # 4. Create Company Membership with role and branch
    membership = CompanyMembership(
        user_id=new_user.id,
        company_id=target_cid,
        branch_id=payload.branch_id,
        role_id=role_obj.id,
        status="Active",
        is_default=True,
        assigned_by=current_user.id,
        assigned_at=datetime.utcnow(),
    )
    db.add(membership)
    db.commit()

    # Log audit
    log_audit(
        db=db,
        action="CREATE_USER",
        resource_type="User",
        resource_id=str(new_user.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={
            "username": new_user.username,
            "role": payload.role,
            "company_id": str(target_cid),
            "must_change_password": payload.must_change_password,
        },
    )

    return success_response(
        data={
            "user_id": str(new_user.id),
            "username": new_user.username,
            "temporary_password": generated_temp_pass,
            "must_change_password": new_user.must_change_password,
        },
        message="تم إنشاء حساب المستخدم بنجاح",
    )


# ── 3. Get User Details ────────────────────────────────────────────────────

@router.get("/{user_id}")
def get_user_details(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "Auditor"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get full user profile, employee linkage, multi-company roles, and activity."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    # Multi-tenant isolation check
    if not current_user.is_superadmin:
        has_access = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == user.id,
                CompanyMembership.company_id == active_cid,
            )
            .first()
        )
        if not has_access:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض بيانات هذا المستخدم")

    memberships = db.query(CompanyMembership).filter(CompanyMembership.user_id == user.id).all()
    companies_list = []
    for m in memberships:
        c = db.query(Company).filter(Company.id == m.company_id).first()
        b = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
        if c:
            companies_list.append({
                "membership_id": str(m.id),
                "company_id": str(c.id),
                "company_name": c.company_name_ar,
                "company_code": c.company_code,
                "branch_id": str(b.id) if b else None,
                "branch_name": b.branch_name if b else None,
                "role": m.role.name if m.role else "Employee",
                "status": m.status,
                "is_default": m.is_default,
                "assigned_at": m.assigned_at,
            })

    active_sessions_count = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.is_active == True, UserSession.expires_at > datetime.utcnow())
        .count()
    )

    data = {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "account_status": user.account_status,
        "is_superadmin": user.is_superadmin,
        "must_change_password": getattr(user, "must_change_password", False),
        "is_deleted": getattr(user, "is_deleted", False),
        "failed_login_attempts": user.failed_login_attempts,
        "is_locked": bool(user.locked_until and user.locked_until > datetime.utcnow()),
        "locked_until": user.locked_until,
        "last_login": user.last_login,
        "created_at": user.created_at,
        "active_sessions_count": active_sessions_count,
        "employee": {
            "id": str(user.employee.id) if user.employee else None,
            "full_name": user.employee.full_name if user.employee else None,
            "employee_number": user.employee.employee_number if user.employee else None,
            "phone": user.employee.phone if user.employee else None,
            "job_title": user.employee.job_title if user.employee else None,
            "branch_id": str(user.employee.branch_id) if user.employee and user.employee.branch_id else None,
            "department_id": str(user.employee.department_id) if user.employee and user.employee.department_id else None,
        } if user.employee else None,
        "companies": companies_list,
    }
    return success_response(data=data)


# ── 4. Update User ─────────────────────────────────────────────────────────

@router.put("/{user_id}")
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateForm,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update user information and role with strict privilege escalation prevention."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    # Prevent non-superadmins from modifying Super Admins or escalating themselves
    if user.is_superadmin and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="لا يمكن لمدير الشركة تعديل بيانات مدير النظام العام (Super Admin)")

    if payload.is_superadmin and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="فقط مدير النظام العام يملك صلاحية منح امتيازات Super Admin")

    if payload.email and payload.email != user.email:
        existing_e = db.query(User).filter(User.email == payload.email, User.id != user.id).first()
        if existing_e:
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل لمستخدم آخر")
        user.email = payload.email

    if payload.account_status:
        # Check: prevent deactivating the last Super Admin
        if user.is_superadmin and payload.account_status != "Active":
            active_super_count = db.query(User).filter(User.is_superadmin == True, User.account_status == "Active", User.is_deleted == False).count()
            if active_super_count <= 1:
                raise HTTPException(status_code=400, detail="لا يمكن تعطيل مدير النظام العام الأخير")
        user.account_status = payload.account_status

    if payload.is_superadmin is not None and current_user.is_superadmin:
        user.is_superadmin = payload.is_superadmin

    # Update role in active company
    if payload.role:
        role_obj = db.query(Role).filter(Role.name == payload.role).first()
        if not role_obj:
            role_obj = Role(name=payload.role, is_system_role=True)
            db.add(role_obj)
            db.commit()
            db.refresh(role_obj)

        # Update membership role
        membership = (
            db.query(CompanyMembership)
            .filter(CompanyMembership.user_id == user.id, CompanyMembership.company_id == active_cid)
            .first()
        )
        if membership:
            membership.role_id = role_obj.id

    # Update Employee record if exists
    if user.employee:
        if payload.full_name:
            user.employee.full_name = payload.full_name.strip()
        if payload.phone is not None:
            user.employee.phone = payload.phone.strip() if payload.phone else None
        if payload.job_title:
            user.employee.job_title = payload.job_title.strip()
        if payload.branch_id is not None:
            user.employee.branch_id = payload.branch_id
        if payload.department_id is not None:
            user.employee.department_id = payload.department_id

    db.commit()

    log_audit(
        db=db,
        action="UPDATE_USER",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات المستخدم بنجاح")


# ── 5. Activate / Deactivate User ──────────────────────────────────────────

@router.post("/{user_id}/status")
def toggle_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Activate, Deactivate, or Suspend user. Immediately revokes sessions if deactivated."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if user.is_superadmin and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="لا يمكن تعديل حالة مدير النظام العام")

    # Protect last active Super Admin
    if user.is_superadmin and payload.account_status != "Active":
        active_supers = db.query(User).filter(User.is_superadmin == True, User.account_status == "Active", User.is_deleted == False).count()
        if active_supers <= 1:
            raise HTTPException(status_code=400, detail="لا يمكن تعطيل مدير النظام العام الوحيد النشط")

    old_status = user.account_status
    user.account_status = payload.account_status

    # Immediately revoke all active sessions if user is suspended/inactive
    if payload.account_status in ["Inactive", "Suspended"]:
        db.query(UserSession).filter(UserSession.user_id == user.id).update({"is_active": False})

    db.commit()

    log_audit(
        db=db,
        action="CHANGE_USER_STATUS",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"from_status": old_status, "to_status": payload.account_status},
    )

    return success_response(message=f"تم تعديل حالة الحساب بنجاح إلى: {payload.account_status}")


# ── 6. Soft Delete User ────────────────────────────────────────────────────

@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Soft delete user account. Revokes all active sessions immediately and preserves audit logs."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الحالي")

    # Protect last active Super Admin
    if user.is_superadmin:
        active_supers = db.query(User).filter(User.is_superadmin == True, User.is_deleted == False).count()
        if active_supers <= 1:
            raise HTTPException(status_code=400, detail="لا يمكن حذف مدير النظام العام الأخير")

    user.is_deleted = True
    user.account_status = "Inactive"

    # Revoke sessions
    db.query(UserSession).filter(UserSession.user_id == user.id).update({"is_active": False})
    db.commit()

    log_audit(
        db=db,
        action="DELETE_USER",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
    )

    return success_response(message="تم حذف حساب المستخدم بنجاح (حذف آمن)")


@router.post("/{user_id}/restore")
def restore_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Restore a previously soft-deleted user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    user.is_deleted = False
    user.account_status = "Active"
    db.commit()

    log_audit(
        db=db,
        action="RESTORE_USER",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
    )

    return success_response(message="تم استعادة حساب المستخدم بنجاح")


# ── 7. Reset Password (Admin) ──────────────────────────────────────────────

@router.post("/{user_id}/reset-password")
def admin_reset_password(
    user_id: uuid.UUID,
    payload: UserResetPasswordAdmin,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Admin password reset with reauthentication and mandatory first-login password change."""
    # Strict reauthentication of admin password
    if not verify_password(payload.reauth_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="كلمة مرور المسؤول غير صحيحة. إعادة المصادقة مطلوبة لتنفيذ هذا الإجراء الأمني.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if user.is_superadmin and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="لا يمكن لمدير الشركة إعادة تعيين كلمة مرور Super Admin")

    generated_temp = None
    if not payload.new_password:
        generated_temp = generate_temp_password(12)
        new_raw_pw = generated_temp
    else:
        new_raw_pw = payload.new_password

    user.password_hash = hash_password(new_raw_pw)
    user.must_change_password = payload.must_change_password
    user.failed_login_attempts = 0
    user.locked_until = None

    # Invalidate all active user sessions to enforce relogin
    db.query(UserSession).filter(UserSession.user_id == user.id).update({"is_active": False})
    db.commit()

    log_audit(
        db=db,
        action="ADMIN_RESET_PASSWORD",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"must_change_password": payload.must_change_password},
    )

    return success_response(
        data={"temporary_password": generated_temp},
        message="تمت إعادة تعيين كلمة المرور بنجاح وإلغاء جميع الجلسات النشطة للمستخدم",
    )


# ── 8. Unlock Account ──────────────────────────────────────────────────────

@router.post("/{user_id}/unlock")
def unlock_account(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Unlock a locked account and reset failed login attempts."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    user.locked_until = None
    user.failed_login_attempts = 0
    if user.account_status != "Active":
        user.account_status = "Active"
    db.commit()

    log_audit(
        db=db,
        action="UNLOCK_USER_ACCOUNT",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        company_id=active_cid,
    )

    return success_response(message="تم إلغاء قفل حساب المستخدم بنجاح")


# ── 9. Multi-Company Access Management ─────────────────────────────────────

@router.get("/{user_id}/companies")
def get_user_companies(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    db: Session = Depends(get_db),
):
    """List all companies and roles assigned to a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    memberships = db.query(CompanyMembership).filter(CompanyMembership.user_id == user.id).all()
    data = []
    for m in memberships:
        c = db.query(Company).filter(Company.id == m.company_id).first()
        b = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
        if c:
            data.append({
                "membership_id": str(m.id),
                "company_id": str(c.id),
                "company_name_ar": c.company_name_ar,
                "company_code": c.company_code,
                "branch_id": str(b.id) if b else None,
                "branch_name": b.branch_name if b else None,
                "role": m.role.name if m.role else "Employee",
                "status": m.status,
                "is_default": m.is_default,
                "assigned_at": m.assigned_at,
            })
    return success_response(data=data)


@router.post("/{user_id}/companies")
def assign_company_access(
    user_id: uuid.UUID,
    payload: CompanyAccessAssign,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assign or update user access to a company with a company-specific role."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    target_company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not target_company:
        raise HTTPException(status_code=404, detail="الشركة غير موجودة")

    # Prevent privilege escalation: Company Admin can only assign access to their own companies
    if not current_user.is_superadmin and payload.company_id != active_cid:
        admin_membership = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == current_user.id,
                CompanyMembership.company_id == payload.company_id,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if not admin_membership or not admin_membership.role or admin_membership.role.name != "Company Admin":
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية إدارة هذه الشركة")

    if payload.role == "Super Admin" and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="لا يمكن تعيين رتبة Super Admin إلا من قبل Super Admin")

    role_obj = db.query(Role).filter(Role.name == payload.role).first()
    if not role_obj:
        role_obj = Role(name=payload.role, is_system_role=True)
        db.add(role_obj)
        db.commit()
        db.refresh(role_obj)

    membership = (
        db.query(CompanyMembership)
        .filter(CompanyMembership.user_id == user.id, CompanyMembership.company_id == payload.company_id)
        .first()
    )

    if membership:
        membership.branch_id = payload.branch_id
        membership.role_id = role_obj.id
        membership.status = "Active"
        membership.is_default = payload.is_default
    else:
        membership = CompanyMembership(
            user_id=user.id,
            company_id=payload.company_id,
            branch_id=payload.branch_id,
            role_id=role_obj.id,
            status="Active",
            is_default=payload.is_default,
            assigned_by=current_user.id,
            assigned_at=datetime.utcnow(),
        )
        db.add(membership)

    db.commit()

    log_audit(
        db=db,
        action="ASSIGN_COMPANY_ACCESS",
        resource_type="CompanyMembership",
        resource_id=str(membership.id),
        user_id=current_user.id,
        company_id=payload.company_id,
        new_values={"target_user": str(user.id), "role": payload.role},
    )

    return success_response(message="تم تعيين صلاحيات الشركة بنجاح")


@router.delete("/{user_id}/companies/{company_id}")
def remove_company_access(
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Remove user access from a specific company."""
    if not current_user.is_superadmin and company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إدارة هذه الشركة")

    membership = (
        db.query(CompanyMembership)
        .filter(CompanyMembership.user_id == user_id, CompanyMembership.company_id == company_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="عضوية الشركة غير موجودة")

    db.delete(membership)
    db.commit()

    log_audit(
        db=db,
        action="REMOVE_COMPANY_ACCESS",
        resource_type="CompanyMembership",
        resource_id=str(membership.id),
        user_id=current_user.id,
        company_id=company_id,
    )

    return success_response(message="تمت إزالة وصول المستخدم من الشركة بنجاح")


# ── 10. User Activity & Login History ──────────────────────────────────────

@router.get("/{user_id}/activity")
def get_user_activity(
    user_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "Auditor"])),
    db: Session = Depends(get_db),
):
    """Get audit activity and login history for a specific user."""
    from app.models.audit import AuditLog

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            "id": str(log.id),
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp,
        }
        for log in logs
    ]
    return success_response(data=data)


# ── 11. Bulk User Import (Without Passwords) ───────────────────────────────

@router.post("/bulk-import")
def bulk_import_users(
    payload: BulkUserImportRequest,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Bulk import users from list (e.g. parsed Excel) without passwords. Auto-generates temporary passwords."""
    created_count = 0
    errors = []

    for idx, item in enumerate(payload.users):
        u_name = item.username.strip()
        e_mail = item.email.strip()

        if db.query(User).filter(User.username == u_name).first():
            errors.append(f"السطر {idx+1}: اسم المستخدم '{u_name}' مسجل مسبقاً")
            continue

        if db.query(User).filter(User.email == e_mail).first():
            errors.append(f"السطر {idx+1}: البريد '{e_mail}' مسجل مسبقاً")
            continue

        temp_pass = generate_temp_password(12)

        # Create Employee
        emp = Employee(
            company_id=active_cid,
            branch_id=item.branch_id,
            department_id=item.department_id,
            employee_number=f"EMP-{uuid.uuid4().hex[:6].upper()}",
            full_name=item.full_name.strip(),
            email=e_mail,
            phone=item.phone,
            job_title=item.role or "Employee",
            employment_status="Active",
        )
        db.add(emp)
        db.commit()
        db.refresh(emp)

        # Create User
        new_u = User(
            employee_id=emp.id,
            username=u_name,
            password_hash=hash_password(temp_pass),
            email=e_mail,
            account_status="Active",
            is_superadmin=False,
            must_change_password=True,
            is_deleted=False,
        )
        db.add(new_u)
        db.commit()
        db.refresh(new_u)

        # Resolve role
        role_name = item.role or "Employee"
        role_obj = db.query(Role).filter(Role.name == role_name).first()
        if not role_obj:
            role_obj = Role(name=role_name, is_system_role=True)
            db.add(role_obj)
            db.commit()
            db.refresh(role_obj)

        db.add(UserRole(user_id=new_u.id, role_id=role_obj.id))
        db.add(CompanyMembership(
            user_id=new_u.id,
            company_id=active_cid,
            branch_id=item.branch_id,
            role_id=role_obj.id,
            status="Active",
            is_default=True,
            assigned_by=current_user.id,
            assigned_at=datetime.utcnow(),
        ))
        db.commit()
        created_count += 1

    log_audit(
        db=db,
        action="BULK_IMPORT_USERS",
        resource_type="User",
        resource_id=str(active_cid),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"created_count": created_count, "errors_count": len(errors)},
    )

    return success_response(
        data={"imported_count": created_count, "errors": errors},
        message=f"تم استيراد {created_count} مستخدم بنجاح" + (f" مع وجود {len(errors)} تنبيهات" if errors else ""),
    )


# ── 12. Permissions Matrix Reference ──────────────────────────────────────

@router.get("/permissions/matrix")
def get_permissions_matrix(
    current_user: User = Depends(get_current_user),
):
    """Get the full RBAC permission matrix structure for UI reference."""
    matrix = get_permission_matrix_serializable()
    return success_response(data=matrix)
