import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    get_current_user,
    get_user_company_id,
    require_role,
    hash_password,
    get_user_roles,
    resolve_company_scope,
)
from app.core.rbac import require_permission, Module, Action
from app.core.response import success_response, paginate
from app.models.user import Employee, User, Role, UserRole, CompanyMembership
from app.models.company import Company, Branch, Department
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.telegram import TelegramUserLink
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, UserCreate, UserUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/employees", tags=["Employees & Users"])


def validate_employee_location(db: Session, company_id: uuid.UUID, branch_id, department_id):
    for model, record_id in ((Branch, branch_id), (Department, department_id)):
        if record_id:
            record = db.query(model).filter(model.id == record_id, model.company_id == company_id).first()
            if not record:
                raise HTTPException(status_code=400, detail="الفرع أو القسم لا يتبع للشركة الحالية")
            if model is Department and branch_id and record.branch_id and record.branch_id != branch_id:
                raise HTTPException(status_code=400, detail="القسم لا يتبع للفرع المحدد")


@router.get("")
def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List employees with server-side company isolation."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(Employee).filter(Employee.company_id == target_cid)

    if branch_id:
        query = query.filter(Employee.branch_id == branch_id)
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if status_filter:
        query = query.filter(Employee.employment_status == status_filter)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (Employee.full_name.ilike(s))
            | (Employee.employee_number.ilike(s))
            | (Employee.email.ilike(s))
            | (Employee.job_title.ilike(s))
        )

    total = query.count()
    employees = (
        query.order_by(Employee.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    telegram_links = {
        l.employee_id: l
        for l in db.query(TelegramUserLink).filter(TelegramUserLink.company_id == target_cid).all()
    }

    data = []
    for emp in employees:
        b_name = emp.branch.branch_name if emp.branch else None
        d_name = emp.department.department_name if emp.department else None
        c_name = emp.company.company_name_ar if emp.company else None
        has_account = emp.user is not None
        tlink = telegram_links.get(emp.id)
        is_t_linked = bool(tlink and tlink.is_verified)
        t_user = tlink.telegram_username if (tlink and tlink.is_verified) else None
        t_notifs = bool(tlink.notifications_enabled) if (tlink and tlink.is_verified) else False

        data.append({
            "id": str(emp.id),
            "company_id": str(emp.company_id),
            "branch_id": str(emp.branch_id) if emp.branch_id else None,
            "department_id": str(emp.department_id) if emp.department_id else None,
            "employee_number": emp.employee_number,
            "full_name": emp.full_name,
            "job_title": emp.job_title,
            "email": emp.email,
            "phone": emp.phone,
            "employment_status": emp.employment_status,
            "branch_name": b_name,
            "department_name": d_name,
            "company_name": c_name,
            "has_user_account": has_account,
            "is_telegram_linked": is_t_linked,
            "telegram_username": t_user,
            "telegram_notifications_enabled": t_notifs,
            "created_at": emp.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_employee(
    payload: EmployeeCreate,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new employee with company isolation."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    validate_employee_location(db, target_cid, payload.branch_id, payload.department_id)

    # Check unique employee_number in company
    existing = db.query(Employee).filter(
        Employee.company_id == target_cid,
        Employee.employee_number == payload.employee_number.strip(),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="الرقم الوظيفي مسجل مسبقاً في هذه الشركة")

    emp = Employee(
        company_id=target_cid,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        employee_number=payload.employee_number.strip(),
        full_name=payload.full_name.strip(),
        job_title=payload.job_title,
        email=payload.email,
        phone=payload.phone,
        employment_status=payload.employment_status,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values=payload.model_dump(),
    )

    return success_response(data={"id": str(emp.id)}, message="تم إضافة الموظف بنجاح")


@router.get("/{employee_id}")
def get_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get employee details with assigned custody."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    # Company isolation
    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول إلى هذا الموظف")

    # Get active assigned assets
    active_custody = (
        db.query(AssetCustody)
        .filter(AssetCustody.employee_id == emp.id, AssetCustody.status == "Active")
        .all()
    )
    assigned_assets = []
    for c in active_custody:
        a = c.asset
        if a:
            assigned_assets.append({
                "custody_id": str(c.id),
                "asset_id": str(a.id),
                "asset_code": a.asset_code,
                "asset_name": a.asset_name,
                "asset_type": a.asset_type,
                "assignment_date": c.assignment_date,
                "condition": c.condition_on_assignment,
            })

    tlink = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp.id).first()
    is_t_linked = bool(tlink and tlink.is_verified)
    t_user = tlink.telegram_username if (tlink and tlink.is_verified) else None
    t_notifs = bool(tlink.notifications_enabled) if (tlink and tlink.is_verified) else False

    data = {
        "id": str(emp.id),
        "company_id": str(emp.company_id),
        "branch_id": str(emp.branch_id) if emp.branch_id else None,
        "department_id": str(emp.department_id) if emp.department_id else None,
        "employee_number": emp.employee_number,
        "full_name": emp.full_name,
        "job_title": emp.job_title,
        "email": emp.email,
        "phone": emp.phone,
        "employment_status": emp.employment_status,
        "branch_name": emp.branch.branch_name if emp.branch else None,
        "department_name": emp.department.department_name if emp.department else None,
        "company_name": emp.company.company_name_ar if emp.company else None,
        "has_user_account": emp.user is not None,
        "is_telegram_linked": is_t_linked,
        "telegram_username": t_user,
        "telegram_notifications_enabled": t_notifs,
        "assigned_assets": assigned_assets,
        "created_at": emp.created_at,
    }
    return success_response(data=data)


@router.put("/{employee_id}")
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذا الموظف")

    validate_employee_location(
        db, emp.company_id, payload.branch_id or emp.branch_id,
        payload.department_id or emp.department_id,
    )

    if payload.full_name is not None:
        emp.full_name = payload.full_name
    if payload.job_title is not None:
        emp.job_title = payload.job_title
    if payload.email is not None:
        emp.email = payload.email
    if payload.phone is not None:
        emp.phone = payload.phone
    if payload.employment_status is not None:
        emp.employment_status = payload.employment_status
        # If employee is terminated, resigned, or inactive, cascade deactivate user account, sessions, and Telegram link
        if payload.employment_status in ["Terminated", "Resigned", "Inactive"]:
            from app.models.user import UserSession
            from app.models.telegram import TelegramUserLink

            linked_user = db.query(User).filter(User.employee_id == emp.id).first()
            if linked_user:
                linked_user.account_status = "Inactive"
                db.query(UserSession).filter(UserSession.user_id == linked_user.id).update({"is_active": False})
            db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp.id).update({"is_verified": False})
    if payload.branch_id is not None:
        emp.branch_id = payload.branch_id
    if payload.department_id is not None:
        emp.department_id = payload.department_id

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=emp.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات الموظف بنجاح")


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.DELETE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذا الموظف")

    active_c = db.query(AssetCustody).filter(AssetCustody.employee_id == emp.id, AssetCustody.status == "Active").count()
    if active_c > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الموظف لوجود عهد نشطة مسجلة باسمه. يرجى استرجاع العهد أولاً.")

    from app.models.task import Task
    active_tasks = db.query(Task).filter(
        Task.assigned_to_id == emp.id,
        Task.status.notin_(["Completed", "Cancelled"]),
    ).count()
    if active_tasks > 0:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن حذف الموظف لوجود {active_tasks} مهمة نشطة مسندة إليه. يرجى إعادة إسناد المهام أولاً.",
        )

    log_audit(
        db=db,
        action="DELETE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=emp.company_id,
    )

    db.delete(emp)
    db.commit()
    return success_response(message="تم حذف الموظف بنجاح")


# ── Users & Roles ─────────────────────────────────────────────────────

@router.get("/users/list")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.USERS, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.is_deleted == False)
    if not current_user.is_superadmin:
        query = query.filter(User.company_memberships.any(
            (CompanyMembership.company_id == active_cid) & (CompanyMembership.status == "Active")
        ))
    if search:
        s = f"%{search}%"
        query = query.filter((User.username.ilike(s)) | (User.email.ilike(s)))

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for u in users:
        roles = get_user_roles(u, db, company_id=active_cid)
        memberships_query = db.query(CompanyMembership).filter(
            CompanyMembership.user_id == u.id, CompanyMembership.status == "Active")
        if not current_user.is_superadmin:
            memberships_query = memberships_query.filter(CompanyMembership.company_id == active_cid)
        memberships = memberships_query.all()
        companies_list = []
        for m in memberships:
            c = db.query(Company).filter(Company.id == m.company_id).first()
            if c:
                companies_list.append({"id": str(c.id), "name": c.company_name_ar})

        data.append({
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "account_status": u.account_status,
            "is_superadmin": u.is_superadmin,
            "roles": roles,
            "companies": companies_list,
            "full_name": u.employee.full_name if u.employee else None,
            "last_login": u.last_login,
            "created_at": u.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("/users/create")
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_permission(Module.USERS, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing_u = db.query(User).filter(User.username == payload.username.strip()).first()
    if existing_u:
        raise HTTPException(status_code=400, detail="اسم المستخدم مسجل مسبقاً")

    existing_e = db.query(User).filter(User.email == payload.email.strip()).first()
    if existing_e:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")

    target_cids = list(dict.fromkeys(payload.company_ids or [active_cid]))
    for cid in target_cids:
        resolve_company_scope(current_user, active_cid, cid)
        if not db.query(Company).filter(Company.id == cid).first():
            raise HTTPException(status_code=400, detail="الشركة غير موجودة")
    role_names = list(dict.fromkeys(payload.role_names or ["Employee"]))
    if not current_user.is_superadmin and (payload.is_superadmin or "Super Admin" in role_names):
        raise HTTPException(status_code=403, detail="لا يمكن منح صلاحية مدير النظام")
    from app.core.rbac import ROLE_PERMISSION_MATRIX
    roles = []
    for role_name in role_names:
        if role_name not in ROLE_PERMISSION_MATRIX:
            raise HTTPException(status_code=400, detail="الدور غير صالح")
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            raise HTTPException(status_code=400, detail="الدور غير موجود")
        roles.append(role)
    # Preserve legacy global role lists; the first role defines the company membership.
    primary_role = roles[0]
    if payload.employee_id:
        employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
        if not employee or employee.company_id not in target_cids:
            raise HTTPException(status_code=400, detail="الموظف لا يتبع للشركات المحددة")
        if employee.employment_status != "Active" or employee.user:
            raise HTTPException(status_code=400, detail="الموظف غير نشط أو مرتبط بحساب بالفعل")
    new_user = User(
        employee_id=payload.employee_id,
        username=payload.username.strip(), password_hash=hash_password(payload.password),
        email=payload.email.strip(), account_status=payload.account_status,
        is_superadmin=payload.is_superadmin if current_user.is_superadmin else False,
    )
    try:
        db.add(new_user)
        db.flush()
        for role in roles:
            db.add(UserRole(user_id=new_user.id, role_id=role.id))
        for idx, cid in enumerate(target_cids):
            db.add(CompanyMembership(
                user_id=new_user.id, company_id=cid, role_id=primary_role.id,
                status="Active", is_default=(idx == 0), assigned_by=current_user.id,
            ))
        if payload.employee_id:
            tlink = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == payload.employee_id).first()
            if tlink:
                tlink.user_id = new_user.id
        # log_audit commits the user, role, membership and audit together.
        log_audit(db=db, action="CREATE", resource_type="User",
                  resource_id=str(new_user.id), user_id=current_user.id,
                  company_id=active_cid,
                  new_values={"username": new_user.username, "roles": role_names})
    except Exception:
        db.rollback()
        raise

    return success_response(data={"id": str(new_user.id)}, message="تم إنشاء حساب المستخدم بنجاح")
