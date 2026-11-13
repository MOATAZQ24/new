import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.response import success_response, paginate
from app.models.company import Company, Branch, Department
from app.models.user import User, Employee, CompanyMembership
from app.schemas.company import (
    CompanyCreate, CompanyUpdate,
    BranchCreate, BranchUpdate,
    DepartmentCreate, DepartmentUpdate,
)
from app.services.audit_service import log_audit
from app.api.v1.endpoints.workspace import authorize_company

router = APIRouter(prefix="/companies", tags=["Companies"])


@router.get("")
def list_companies(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List companies accessible to the user."""
    query = db.query(Company)

    # Multi-company authorization check
    if not current_user.is_superadmin:
        user_cids = (
            db.query(CompanyMembership.company_id)
            .filter(CompanyMembership.user_id == current_user.id)
            .all()
        )
        allowed_ids = [cid[0] for cid in user_cids]
        query = query.filter(Company.id.in_(allowed_ids))

    if search:
        s = f"%{search}%"
        query = query.filter(
            (Company.company_name_ar.ilike(s))
            | (Company.company_name_en.ilike(s))
            | (Company.company_code.ilike(s))
        )

    if status_filter:
        query = query.filter(Company.status == status_filter)

    total = query.count()
    companies = (
        query.order_by(Company.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for c in companies:
        b_count = db.query(Branch).filter(Branch.company_id == c.id).count()
        e_count = db.query(Employee).filter(Employee.company_id == c.id).count()
        data.append({
            "id": str(c.id),
            "company_name_ar": c.company_name_ar,
            "company_name_en": c.company_name_en,
            "company_code": c.company_code,
            "company_logo": c.company_logo,
            "contact_email": c.contact_email,
            "contact_phone": c.contact_phone,
            "status": c.status,
            "branches_count": b_count,
            "employees_count": e_count,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_company(
    payload: CompanyCreate,
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Create a new company (Super Admin only)."""
    existing = db.query(Company).filter(Company.company_code == payload.company_code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="كود الشركة مستخدم بالفعل")

    company = Company(
        company_name_ar=payload.company_name_ar,
        company_name_en=payload.company_name_en,
        company_code=payload.company_code.upper(),
        company_logo=payload.company_logo,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        status=payload.status,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # Create default or initial branches
    created_branches = []
    if payload.initial_branches and len(payload.initial_branches) > 0:
        for b_name in payload.initial_branches:
            if b_name.strip():
                br = Branch(
                    company_id=company.id,
                    branch_name=b_name.strip(),
                    location="المقر",
                    status="Active",
                )
                db.add(br)
                created_branches.append(br)
    else:
        main_branch = Branch(
            company_id=company.id,
            branch_name="الفرع الرئيسي (Main Branch)",
            location="المقر الرئيسي",
            status="Active",
        )
        db.add(main_branch)
        created_branches.append(main_branch)

    db.flush()
    first_branch_id = created_branches[0].id if created_branches else None

    # Create default or initial departments
    if payload.initial_departments and len(payload.initial_departments) > 0:
        for d_name in payload.initial_departments:
            if d_name.strip():
                dept = Department(
                    company_id=company.id,
                    branch_id=first_branch_id,
                    department_name=d_name.strip(),
                    status="Active",
                )
                db.add(dept)
    else:
        it_dept = Department(
            company_id=company.id,
            branch_id=first_branch_id,
            department_name="إدارة تقنية المعلومات (IT Department)",
            status="Active",
        )
        db.add(it_dept)
    db.commit()

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Company",
        resource_id=str(company.id),
        user_id=current_user.id,
        company_id=company.id,
        new_values=payload.model_dump(),
    )

    return success_response(
        data={"id": str(company.id), "company_code": company.company_code},
        message="تم إنشاء الشركة بنجاح مع الفرع الرئيسي وقسم تقنية المعلومات",
    )


@router.get("/{company_id}")
def get_company(company_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get single company details."""
    authorize_company(db, current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="الشركة غير موجودة")

    b_count = db.query(Branch).filter(Branch.company_id == company.id).count()
    e_count = db.query(Employee).filter(Employee.company_id == company.id).count()

    data = {
        "id": str(company.id),
        "company_name_ar": company.company_name_ar,
        "company_name_en": company.company_name_en,
        "company_code": company.company_code,
        "company_logo": company.company_logo,
        "contact_email": company.contact_email,
        "contact_phone": company.contact_phone,
        "status": company.status,
        "branches_count": b_count,
        "employees_count": e_count,
        "created_at": company.created_at,
        "updated_at": company.updated_at,
    }
    return success_response(data=data)


@router.put("/{company_id}")
def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    db: Session = Depends(get_db),
):
    """Update company details."""
    authorize_company(db, current_user, company_id, admin=True)
    authorize_company(db, current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="الشركة غير موجودة")

    old_vals = {
        "name_ar": company.company_name_ar,
        "name_en": company.company_name_en,
        "status": company.status,
    }

    if payload.company_name_ar is not None:
        company.company_name_ar = payload.company_name_ar
    if payload.company_name_en is not None:
        company.company_name_en = payload.company_name_en
    if payload.company_code is not None:
        company.company_code = payload.company_code.upper()
    if payload.company_logo is not None:
        company.company_logo = payload.company_logo
    if payload.contact_email is not None:
        company.contact_email = payload.contact_email
    if payload.contact_phone is not None:
        company.contact_phone = payload.contact_phone
    if payload.status is not None:
        company.status = payload.status

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Company",
        resource_id=str(company.id),
        user_id=current_user.id,
        company_id=company.id,
        old_values=old_vals,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات الشركة بنجاح")


@router.delete("/{company_id}")
def delete_company(
    company_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Delete company (Super Admin only)."""
    authorize_company(db, current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="الشركة غير موجودة")

    log_audit(
        db=db,
        action="DELETE",
        resource_type="Company",
        resource_id=str(company.id),
        user_id=current_user.id,
        company_id=company.id,
    )

    db.delete(company)
    db.commit()
    return success_response(message="تم حذف الشركة بنجاح")


# ── Branches ──────────────────────────────────────────────────────────

@router.get("/{company_id}/branches")
def list_branches(
    company_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branches = db.query(Branch).filter(Branch.company_id == company_id).order_by(Branch.created_at.asc()).all()
    data = [
        {
            "id": str(b.id),
            "company_id": str(b.company_id),
            "branch_name": b.branch_name,
            "location": b.location,
            "contact_details": b.contact_details,
            "status": b.status,
            "created_at": b.created_at,
        }
        for b in branches
    ]
    return success_response(data=data)


@router.post("/{company_id}/branches")
def create_branch(
    company_id: uuid.UUID,
    payload: BranchCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    branch = Branch(
        company_id=company_id,
        branch_name=payload.branch_name,
        location=payload.location,
        contact_details=payload.contact_details,
        status=payload.status,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Branch",
        resource_id=str(branch.id),
        user_id=current_user.id,
        company_id=company_id,
        new_values=payload.model_dump(),
    )

    return success_response(data={"id": str(branch.id)}, message="تم إنشاء الفرع بنجاح")


@router.put("/branches/{branch_id}")
def update_branch(
    branch_id: uuid.UUID,
    payload: BranchUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")

    if payload.branch_name is not None:
        branch.branch_name = payload.branch_name
    if payload.location is not None:
        branch.location = payload.location
    if payload.contact_details is not None:
        branch.contact_details = payload.contact_details
    if payload.status is not None:
        branch.status = payload.status

    db.commit()
    return success_response(message="تم تحديث الفرع بنجاح")


@router.delete("/branches/{branch_id}")
def delete_branch(
    branch_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    db: Session = Depends(get_db),
):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")

    db.delete(branch)
    db.commit()
    return success_response(message="تم حذف الفرع بنجاح")


# ── Departments ───────────────────────────────────────────────────────

@router.get("/{company_id}/departments")
def list_departments(
    company_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    depts = db.query(Department).filter(Department.company_id == company_id).order_by(Department.created_at.asc()).all()
    data = [
        {
            "id": str(d.id),
            "company_id": str(d.company_id),
            "branch_id": str(d.branch_id) if d.branch_id else None,
            "department_name": d.department_name,
            "status": d.status,
            "created_at": d.created_at,
        }
        for d in depts
    ]
    return success_response(data=data)


@router.post("/{company_id}/departments")
def create_department(
    company_id: uuid.UUID,
    payload: DepartmentCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    dept = Department(
        company_id=company_id,
        branch_id=payload.branch_id,
        department_name=payload.department_name,
        manager_id=payload.manager_id,
        status=payload.status,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Department",
        resource_id=str(dept.id),
        user_id=current_user.id,
        company_id=company_id,
        new_values=payload.model_dump(),
    )

    return success_response(data={"id": str(dept.id)}, message="تم إنشاء القسم بنجاح")


@router.put("/departments/{dept_id}")
def update_department(
    dept_id: uuid.UUID,
    payload: DepartmentUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")

    if payload.department_name is not None:
        dept.department_name = payload.department_name
    if payload.branch_id is not None:
        dept.branch_id = payload.branch_id
    if payload.manager_id is not None:
        dept.manager_id = payload.manager_id
    if payload.status is not None:
        dept.status = payload.status

    db.commit()
    return success_response(message="تم تحديث القسم بنجاح")


@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")

    db.delete(dept)
    db.commit()
    return success_response(message="تم حذف القسم بنجاح")

