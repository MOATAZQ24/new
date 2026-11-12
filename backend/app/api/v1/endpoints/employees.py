import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, hash_password, get_user_roles
from app.core.response import success_response, paginate
from app.models.user import Employee, User, Role, UserRole, CompanyMembership
from app.models.company import Company, Branch, Department
from app.models.asset import TechnicalAsset, AssetCustody
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, UserCreate, UserUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/employees", tags=["Employees & Users"])


@router.get("")
def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List employees with server-side company isolation."""
    target_cid = company_id or active_cid
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

    data = []
    for emp in employees:
        b_name = emp.branch.branch_name if emp.branch else None
        d_name = emp.department.department_name if emp.department else None
        c_name = emp.company.company_name_ar if emp.company else None
        has_account = emp.user is not None

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
            "created_at": emp.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_employee(
    payload: EmployeeCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new employee with company isolation."""
    target_cid = payload.company_id or active_cid

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
    current_user: User = Depends(get_current_user),
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
        "assigned_assets": assigned_assets,
        "created_at": emp.created_at,
    }
    return success_response(data=data)


@router.put("/{employee_id}")
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذا الموظف")

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


# ── Users & Roles ─────────────────────────────────────────────────────

@router.get("/users/list")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    query = db.query(User)
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
        roles = get_user_roles(u, db)
        memberships = db.query(CompanyMembership).filter(CompanyMembership.user_id == u.id).all()
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
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing_u = db.query(User).filter(User.username == payload.username.strip()).first()
    if existing_u:
        raise HTTPException(status_code=400, detail="اسم المستخدم مسجل مسبقاً")

    existing_e = db.query(User).filter(User.email == payload.email.strip()).first()
    if existing_e:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")

    new_user = User(
        employee_id=payload.employee_id,
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        email=payload.email.strip(),
        account_status=payload.account_status,
        is_superadmin=payload.is_superadmin if current_user.is_superadmin else False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Assign roles
    role_names = payload.role_names or ["Employee"]
    for rname in role_names:
        r = db.query(Role).filter(Role.name == rname).first()
        if not r:
            r = Role(name=rname, is_system_role=True)
            db.add(r)
            db.commit()
            db.refresh(r)
        ur = UserRole(user_id=new_user.id, role_id=r.id)
        db.add(ur)

    # Assign company memberships
    target_cids = payload.company_ids or [active_cid]
    for idx, cid in enumerate(target_cids):
        cm = CompanyMembership(
            user_id=new_user.id,
            company_id=cid,
            is_default=(idx == 0),
        )
        db.add(cm)

    db.commit()

    log_audit(
        db=db,
        action="CREATE",
        resource_type="User",
        resource_id=str(new_user.id),
        user_id=current_user.id,
        new_values={"username": new_user.username, "roles": role_names},
    )

    return success_response(data={"id": str(new_user.id)}, message="تم إنشاء حساب المستخدم بنجاح")
