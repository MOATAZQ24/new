# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import secrets
import uuid
from datetime import date, datetime
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
    validate_company_fk,
)
from app.core.rbac import require_permission, Module, Action
from app.core.response import success_response, paginate
from app.models.user import Employee, User, Role, UserRole, CompanyMembership
from app.models.company import Company, Branch, Department
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.telegram import TelegramUserLink
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    UserCreate,
    UserUpdate,
    EmployeePositionCreate,
    EmployeePositionUpdate,
    EmployeePositionResponse,
)
from app.services.audit_service import log_audit
from app.services import enterprise_service

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
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    multi_branch_only: bool = False,
    include_archived: bool = Query(False),
    search: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List employees with server-side company isolation, canonical Arabic/typo-tolerant search, and archive support."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    enterprise_service.ensure_canonical_five_branches(db, target_cid)
    parsed_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    status_str = status_filter if isinstance(status_filter, str) else None
    inc_arch = bool(include_archived) if not hasattr(include_archived, "default") else False
    search_str = search if isinstance(search, str) else None

    matched = enterprise_service.search_canonical_directory(
        db=db,
        company_id=target_cid,
        search=search_str,
        branch_ids=parsed_branches,
        department_id=department_id if isinstance(department_id, uuid.UUID) else None,
        status_filter=status_str,
        multi_branch_only=bool(multi_branch_only) if not hasattr(multi_branch_only, "default") else False,
        include_archived=inc_arch,
        limit=500,
    )
    total = len(matched)
    start = (page - 1) * per_page
    data = matched[start : start + per_page]
    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.get("/summary")
def get_employees_summary(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return authoritative directory summary KPIs for the Employees page."""
    from app.models.subscription import EmployeeSubscription

    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    emps = db.query(Employee).filter(Employee.company_id == target_cid).all()
    active_emps = [e for e in emps if not getattr(e, "is_deleted", False) and e.employment_status != "Archived"]
    archived_emps = [e for e in emps if getattr(e, "is_deleted", False) or e.employment_status == "Archived"]

    asset_emp_ids = {
        r[0]
        for r in db.query(AssetCustody.employee_id)
        .filter(AssetCustody.company_id == target_cid, AssetCustody.status == "Active")
        .distinct()
        .all()
    }
    sub_emp_ids = {
        r[0]
        for r in db.query(EmployeeSubscription.employee_id)
        .filter(EmployeeSubscription.company_id == target_cid, EmployeeSubscription.status == "Active")
        .distinct()
        .all()
    }
    return success_response(
        data={
            "total": len(active_emps),
            "active": sum(1 for e in active_emps if e.employment_status == "Active"),
            "suspended": sum(1 for e in active_emps if e.employment_status in ("Suspended", "On Leave")),
            "left": sum(1 for e in active_emps if e.employment_status in ("Terminated", "Resigned", "Inactive")),
            "archived": len(archived_emps),
            "with_assets": sum(1 for e in active_emps if e.id in asset_emp_ids),
            "with_subscriptions": sum(1 for e in active_emps if e.id in sub_emp_ids),
        }
    )


@router.post("")
def create_employee(
    payload: EmployeeCreate,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a canonical employee supporting multi-branch and multi-company assignments."""
    from app.models.enterprise import EmployeeBranchAssignment

    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    canonical_branches = enterprise_service.ensure_canonical_five_branches(db, target_cid)
    default_branch_id = canonical_branches[2].id if len(canonical_branches) >= 3 else canonical_branches[0].id

    effective_branch_ids: List[uuid.UUID] = []
    if payload.branch_id:
        effective_branch_ids.append(payload.branch_id)
    for bid in payload.branch_ids or []:
        if bid not in effective_branch_ids:
            effective_branch_ids.append(bid)
    if not effective_branch_ids:
        effective_branch_ids.append(default_branch_id)

    primary_branch_id = effective_branch_ids[0]
    validate_employee_location(db, target_cid, primary_branch_id, payload.department_id)
    for bid in effective_branch_ids:
        validate_company_fk(db, Branch, bid, target_cid, "الفرع")
    validate_company_fk(db, Employee, payload.manager_id, target_cid, "المدير المباشر")

    # Validate any additional company IDs upfront before writing anything
    extra_company_ids: List[uuid.UUID] = []
    for cid in payload.company_ids or []:
        if cid != target_cid and cid not in extra_company_ids:
            if not current_user.is_superadmin:
                admin_mem = db.query(CompanyMembership).filter(
                    CompanyMembership.user_id == current_user.id,
                    CompanyMembership.company_id == cid,
                    CompanyMembership.status == "Active",
                ).first()
                if not admin_mem or not admin_mem.role or admin_mem.role.name not in ("Company Admin", "IT Manager"):
                    raise HTTPException(status_code=403, detail="ليس لديك صلاحية إضافة موظف لهذه المنشأة الإضافية")
            extra_company_ids.append(cid)

    # Check unique employee_number in primary company and extra companies
    existing = db.query(Employee).filter(
        Employee.company_id == target_cid,
        Employee.employee_number == payload.employee_number.strip(),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="الرقم الوظيفي مسجل مسبقاً في هذه الشركة")

    if payload.create_user_account:
        u_name = (payload.username or "").strip()
        u_email = (payload.email or "").strip()
        if not u_name or not u_email:
            raise HTTPException(status_code=400, detail="اسم المستخدم والبريد الإلكتروني مطلوبان عند إنشاء حساب دخول")
        if db.query(User).filter(User.username == u_name).first():
            raise HTTPException(status_code=400, detail="اسم المستخدم مسجل مسبقاً في النظام")
        if db.query(User).filter(User.email == u_email).first():
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل لحساب دخول آخر")

    shared_person_id = payload.person_id or uuid.uuid4()
    created_temp_password: Optional[str] = None
    created_user_id: Optional[str] = None

    # Pre-ensure branches in extra companies before entering main write transaction
    extra_default_branches: dict[uuid.UUID, uuid.UUID] = {}
    for cid in extra_company_ids:
        c_branches = enterprise_service.ensure_canonical_five_branches(db, cid)
        extra_default_branches[cid] = c_branches[2].id if len(c_branches) >= 3 else c_branches[0].id

    try:
        emp = Employee(
            person_id=shared_person_id,
            company_id=target_cid,
            branch_id=primary_branch_id,
            department_id=payload.department_id,
            manager_id=payload.manager_id,
            employee_number=payload.employee_number.strip(),
            full_name=payload.full_name.strip(),
            job_title=payload.job_title,
            email=payload.email,
            phone=payload.phone,
            employment_status=payload.employment_status,
            hire_date=payload.hire_date or date.today(),
            employment_type=payload.employment_type or "Full-Time",
            work_location=payload.work_location,
            avatar_url=payload.avatar_url,
        )
        db.add(emp)
        db.flush()

        # Persist primary & secondary branch assignments in the active company
        for idx, bid in enumerate(effective_branch_ids):
            db.add(
                EmployeeBranchAssignment(
                    employee_id=emp.id,
                    company_id=target_cid,
                    branch_id=bid,
                    department_id=payload.department_id,
                    role_name=payload.role_name or "Employee",
                    job_title=payload.job_title,
                    is_primary=(idx == 0),
                    status="Active",
                )
            )

        # Optional additional assignments across branches/companies
        for extra in payload.assignments or []:
            asg_cid = resolve_company_scope(current_user, active_cid, extra.company_id or target_cid)
            br_extra = db.query(Branch).filter(Branch.id == extra.branch_id, Branch.company_id == asg_cid).first()
            if not br_extra:
                raise HTTPException(status_code=400, detail="أحد الفروع الإضافية المحددة غير صالح لهذه المنشأة")
            if not (asg_cid == target_cid and br_extra.id in effective_branch_ids):
                db.add(
                    EmployeeBranchAssignment(
                        employee_id=emp.id,
                        company_id=asg_cid,
                        branch_id=br_extra.id,
                        department_id=extra.department_id,
                        role_name=extra.role_name or payload.role_name or "Employee",
                        job_title=extra.job_title or payload.job_title,
                        is_primary=extra.is_primary,
                        status="Active",
                    )
                )

        # Create companion Employee records in additional selected companies sharing person_id
        for extra_cid in extra_company_ids:
            dup_in_extra = db.query(Employee).filter(
                Employee.company_id == extra_cid,
                Employee.employee_number == payload.employee_number.strip(),
            ).first()
            if dup_in_extra:
                raise HTTPException(status_code=400, detail="الرقم الوظيفي مسجل مسبقاً في المنشأة الإضافية")
            extra_emp = Employee(
                person_id=shared_person_id,
                company_id=extra_cid,
                branch_id=extra_default_branches[extra_cid],
                employee_number=payload.employee_number.strip(),
                full_name=payload.full_name.strip(),
                job_title=payload.job_title,
                email=payload.email,
                phone=payload.phone,
                employment_status=payload.employment_status,
                hire_date=payload.hire_date or date.today(),
                employment_type=payload.employment_type or "Full-Time",
                work_location=payload.work_location,
            )
            db.add(extra_emp)
            db.flush()
            db.add(
                EmployeeBranchAssignment(
                    employee_id=extra_emp.id,
                    company_id=extra_cid,
                    branch_id=extra_default_branches[extra_cid],
                    role_name=payload.role_name or "Employee",
                    job_title=payload.job_title,
                    is_primary=True,
                    status="Active",
                )
            )
            enterprise_service.record_employee_assignment_history(
                db=db,
                employee=extra_emp,
                change_type="Onboarding",
                changed_by_id=current_user.id,
                notes="تسكين مرتبط متعدد المنشآت لنفس الشخص",
            )

        # Optional atomic login account + memberships
        if payload.create_user_account:
            raw_pw = payload.password or f"Ig!{secrets.token_hex(5)}"
            if not payload.password:
                created_temp_password = raw_pw
            new_user = User(
                employee_id=emp.id,
                username=payload.username.strip(),
                password_hash=hash_password(raw_pw),
                email=payload.email.strip(),
                account_status="Active",
                is_superadmin=False,
                must_change_password=True,
                is_deleted=False,
            )
            db.add(new_user)
            db.flush()
            created_user_id = str(new_user.id)

            r_name = payload.role_name or "Employee"
            role_obj = db.query(Role).filter(Role.name == r_name).first()
            if not role_obj:
                role_obj = Role(name=r_name, is_system_role=True)
                db.add(role_obj)
                db.flush()
            db.add(UserRole(user_id=new_user.id, role_id=role_obj.id))
            db.add(
                CompanyMembership(
                    user_id=new_user.id,
                    company_id=target_cid,
                    branch_id=primary_branch_id,
                    role_id=role_obj.id,
                    status="Active",
                    is_default=True,
                    assigned_by=current_user.id,
                    assigned_at=datetime.utcnow(),
                )
            )
            for extra_cid in extra_company_ids:
                db.add(
                    CompanyMembership(
                        user_id=new_user.id,
                        company_id=extra_cid,
                        branch_id=extra_default_branches[extra_cid],
                        role_id=role_obj.id,
                        status="Active",
                        is_default=False,
                        assigned_by=current_user.id,
                        assigned_at=datetime.utcnow(),
                    )
                )

        enterprise_service.record_employee_assignment_history(
            db=db,
            employee=emp,
            change_type="Onboarding",
            changed_by_id=current_user.id,
            notes="تسجيل الموظف في الدليل الموحد للمنشأة",
        )
        db.commit()
        db.refresh(emp)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل إضافة الموظف وتم التراجع عن التغييرات: {str(exc)}")

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values=payload.model_dump(mode="json", exclude={"password"}),
    )

    resp_data = {
        "id": str(emp.id),
        "person_id": str(shared_person_id),
        "branch_ids": [str(b) for b in effective_branch_ids],
        "company_ids": [str(target_cid)] + [str(c) for c in extra_company_ids],
    }
    if created_user_id:
        resp_data["user_id"] = created_user_id
    if created_temp_password:
        resp_data["temporary_password"] = created_temp_password

    return success_response(
        data=resp_data,
        message="تم إضافة الموظف بنجاح وربطه بالفروع المعتمدة",
    )


@router.get("/{employee_id}/profile360")
def get_employee_360_endpoint(
    employee_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return the complete 360° Employee Profile workspace."""
    data = enterprise_service.get_employee_360_profile(
        db=db,
        current_user=current_user,
        company_id=active_cid,
        employee_id=employee_id,
    )
    return success_response(data=data)


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

    from app.models.enterprise import EmployeeBranchAssignment

    if payload.branch_ids is not None:
        for bid in payload.branch_ids:
            validate_company_fk(db, Branch, bid, emp.company_id, "الفرع")

    effective_branch_id = payload.branch_id or (
        payload.branch_ids[0] if payload.branch_ids else emp.branch_id
    )
    validate_employee_location(
        db, emp.company_id, effective_branch_id,
        payload.department_id or emp.department_id,
    )
    if payload.manager_id is not None:
        if payload.manager_id == emp.id:
            raise HTTPException(status_code=400, detail="لا يمكن تعيين الموظف مديراً لنفسه")
        validate_company_fk(db, Employee, payload.manager_id, emp.company_id, "المدير المباشر")

    existing_branch_ids = [
        r[0]
        for r in db.query(EmployeeBranchAssignment.branch_id)
        .filter(
            EmployeeBranchAssignment.employee_id == emp.id,
            EmployeeBranchAssignment.company_id == emp.company_id,
            EmployeeBranchAssignment.status == "Active",
        )
        .all()
    ]
    new_branch_ids_set = set(payload.branch_ids) if payload.branch_ids is not None else None
    branch_list_changed = (
        new_branch_ids_set is not None and new_branch_ids_set != set(existing_branch_ids)
    )

    org_changed = any(
        [
            payload.branch_id is not None and payload.branch_id != emp.branch_id,
            branch_list_changed,
            payload.department_id is not None and payload.department_id != emp.department_id,
            payload.job_title is not None and payload.job_title != emp.job_title,
            payload.employment_status is not None and payload.employment_status != emp.employment_status,
            payload.manager_id is not None and payload.manager_id != getattr(emp, "manager_id", None),
        ]
    )

    try:
        if payload.full_name is not None:
            emp.full_name = payload.full_name
        if payload.job_title is not None:
            emp.job_title = payload.job_title
        if payload.email is not None:
            emp.email = payload.email
        if payload.phone is not None:
            emp.phone = payload.phone
        if payload.manager_id is not None:
            emp.manager_id = payload.manager_id
        if payload.hire_date is not None:
            emp.hire_date = payload.hire_date
        if payload.employment_type is not None:
            emp.employment_type = payload.employment_type
        if payload.work_location is not None:
            emp.work_location = payload.work_location
        if payload.avatar_url is not None:
            emp.avatar_url = payload.avatar_url
        if payload.employment_status is not None:
            emp.employment_status = payload.employment_status
            # If employee is terminated, resigned, or inactive, cascade deactivate user account & sessions while preserving employee record and historical data
            if payload.employment_status in ["Terminated", "Resigned", "Inactive"]:
                from app.models.user import UserSession

                linked_user = db.query(User).filter(User.employee_id == emp.id).first()
                if linked_user:
                    linked_user.account_status = "Inactive"
                    db.query(UserSession).filter(UserSession.user_id == linked_user.id).update({"is_active": False})
                db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp.id).update({"is_verified": False})
        if payload.branch_id is not None:
            emp.branch_id = payload.branch_id
        if payload.department_id is not None:
            emp.department_id = payload.department_id

        if payload.branch_ids is not None:
            db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == emp.id,
                EmployeeBranchAssignment.company_id == emp.company_id,
            ).delete()
            deduped_bids: List[uuid.UUID] = []
            for bid in payload.branch_ids:
                if bid not in deduped_bids:
                    deduped_bids.append(bid)
            if deduped_bids:
                emp.branch_id = deduped_bids[0]
                for idx, bid in enumerate(deduped_bids):
                    db.add(
                        EmployeeBranchAssignment(
                            employee_id=emp.id,
                            company_id=emp.company_id,
                            branch_id=bid,
                            department_id=emp.department_id,
                            job_title=emp.job_title,
                            is_primary=(idx == 0),
                            status="Active",
                        )
                    )
        elif payload.branch_id is not None:
            # Keep EmployeeBranchAssignment synchronized with primary branch changes
            db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == emp.id,
                EmployeeBranchAssignment.company_id == emp.company_id,
            ).update({"is_primary": False})
            existing_primary_row = db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == emp.id,
                EmployeeBranchAssignment.company_id == emp.company_id,
                EmployeeBranchAssignment.branch_id == payload.branch_id,
            ).first()
            if existing_primary_row:
                existing_primary_row.is_primary = True
                existing_primary_row.department_id = emp.department_id
                existing_primary_row.job_title = emp.job_title
                existing_primary_row.status = "Active"
            else:
                db.add(
                    EmployeeBranchAssignment(
                        employee_id=emp.id,
                        company_id=emp.company_id,
                        branch_id=payload.branch_id,
                        department_id=emp.department_id,
                        job_title=emp.job_title,
                        is_primary=True,
                        status="Active",
                    )
                )

        if org_changed:
            change_kind = (
                "Deactivation"
                if emp.employment_status in ("Terminated", "Resigned", "Inactive", "Suspended")
                else "Transfer"
            )
            enterprise_service.record_employee_assignment_history(
                db=db,
                employee=emp,
                change_type=change_kind,
                changed_by_id=current_user.id,
                notes=payload.change_reason or "تحديث بيانات التسكين الوظيفي",
            )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل تحديث الموظف وتم التراجع عن التغييرات: {str(exc)}")

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=emp.company_id,
        new_values=payload.model_dump(exclude_unset=True, mode="json"),
    )

    return success_response(message="تم تحديث بيانات الموظف بنجاح")


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: uuid.UUID,
    permanent: bool = Query(False, description="حذف نهائي إذا توفرت الصلاحية ولم تكن هناك قيود ارتباط"),
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
        raise HTTPException(status_code=400, detail="لا يمكن أرشفة أو حذف الموظف لوجود عهد نشطة مسجلة باسمه. يرجى استرجاع العهد أولاً.")

    from app.models.task import Task
    active_tasks = db.query(Task).filter(
        Task.assigned_to_id == emp.id,
        Task.status.notin_(["Completed", "Cancelled"]),
    ).count()
    if active_tasks > 0:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن أرشفة أو حذف الموظف لوجود {active_tasks} مهمة نشطة مسندة إليه. يرجى إعادة إسناد المهام أولاً.",
        )

    if permanent and current_user.is_superadmin:
        try:
            log_audit(
                db=db,
                action="PERMANENT_DELETE",
                resource_type="Employee",
                resource_id=str(emp.id),
                user_id=current_user.id,
                company_id=emp.company_id,
            )
            db.delete(emp)
            db.commit()
            return success_response(message="تم حذف الموظف نهائياً بنجاح")
        except Exception:
            db.rollback()
            # If foreign key blocks hard delete, safely fall back to soft-delete archive

    emp.is_deleted = True
    emp.deleted_at = datetime.utcnow()
    emp.employment_status = "Archived"

    log_audit(
        db=db,
        action="ARCHIVE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=emp.company_id,
        new_values={"status": "Archived", "is_deleted": True},
    )

    db.commit()
    return success_response(message="تمت أرشفة الموظف بنجاح وحفظ كافة سجلاته التاريخية بأمان (يمكنك استعادته في أي وقت من الأرشيف)")


@router.post("/{employee_id}/restore")
def restore_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية استعادة هذا الموظف")

    emp.is_deleted = False
    emp.deleted_at = None
    emp.employment_status = "Active"

    log_audit(
        db=db,
        action="RESTORE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=emp.company_id,
        new_values={"status": "Active", "is_deleted": False},
    )

    db.commit()
    return success_response(message="تمت استعادة الموظف وتفعيل حالته بنجاح")


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


# ── Multi-Position & Reporting Hierarchy (Phase 1) ──────────────────────

def check_circular_manager(employee_id: uuid.UUID, manager_id: Optional[uuid.UUID], db: Session, max_depth: int = 50) -> None:
    """Ensure setting manager_id for employee_id does not create a circular reporting chain."""
    if not manager_id:
        return
    if manager_id == employee_id:
        raise HTTPException(status_code=400, detail="لا يمكن تعيين الموظف مديراً لنفسه")

    current = manager_id
    visited = {employee_id}
    depth = 0
    while current and depth < max_depth:
        if current in visited:
            raise HTTPException(
                status_code=400,
                detail="تعيين هذا المدير يؤدي إلى علاقة تبعية دائرية غير مقبولة (Circular Hierarchy Detected)",
            )
        visited.add(current)
        depth += 1
        mgr_emp = db.query(Employee).filter(Employee.id == current).first()
        if not mgr_emp or not mgr_emp.manager_id:
            break
        current = mgr_emp.manager_id


@router.get("/{employee_id}/positions")
def list_employee_positions(
    employee_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve all organizational positions held by an employee across all companies and branches."""
    from app.models.enterprise import EmployeeBranchAssignment

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    positions = (
        db.query(EmployeeBranchAssignment)
        .filter(EmployeeBranchAssignment.employee_id == employee_id)
        .order_by(EmployeeBranchAssignment.is_primary.desc(), EmployeeBranchAssignment.created_at.asc())
        .all()
    )

    result = []
    for pos in positions:
        c_name = pos.company.company_name_ar if pos.company else ""
        b_name = pos.branch.branch_name if pos.branch else ""
        d_name = pos.department.department_name if pos.department else None
        m_name = pos.manager.full_name if pos.manager else None

        result.append({
            "id": str(pos.id),
            "employee_id": str(pos.employee_id),
            "company_id": str(pos.company_id),
            "company_name": c_name,
            "branch_id": str(pos.branch_id),
            "branch_name": b_name,
            "department_id": str(pos.department_id) if pos.department_id else None,
            "department_name": d_name,
            "manager_id": str(pos.manager_id) if pos.manager_id else None,
            "manager_name": m_name,
            "job_title": pos.job_title,
            "role_name": pos.role_name,
            "section": pos.section,
            "team": pos.team,
            "start_date": pos.start_date.isoformat() if pos.start_date else None,
            "end_date": pos.end_date.isoformat() if pos.end_date else None,
            "is_primary": pos.is_primary,
            "status": pos.status,
            "created_at": pos.created_at.isoformat(),
            "updated_at": pos.updated_at.isoformat(),
        })

    return success_response(data=result)


@router.post("/{employee_id}/positions")
def add_employee_position(
    employee_id: uuid.UUID,
    payload: EmployeePositionCreate,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assign an additional organizational position to an employee in any company/branch."""
    from app.models.enterprise import EmployeeBranchAssignment

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    # Validate target company and branch
    branch = db.query(Branch).filter(Branch.id == payload.branch_id, Branch.company_id == payload.company_id).first()
    if not branch:
        raise HTTPException(status_code=400, detail="الفرع المحدد لا يتبع للشركة المحددة")

    if payload.department_id:
        dept = db.query(Department).filter(Department.id == payload.department_id, Department.company_id == payload.company_id).first()
        if not dept:
            raise HTTPException(status_code=400, detail="القسم المحدد لا يتبع للشركة المحددة")

    # Cycle detection for direct manager
    if payload.manager_id:
        check_circular_manager(employee_id, payload.manager_id, db)

    # Check if duplicate position already exists
    existing = db.query(EmployeeBranchAssignment).filter(
        EmployeeBranchAssignment.employee_id == employee_id,
        EmployeeBranchAssignment.company_id == payload.company_id,
        EmployeeBranchAssignment.branch_id == payload.branch_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="الموظف يشغل منصباً بالفعل في هذا الفرع")

    # If marked as primary, unmark previous primary positions
    if payload.is_primary:
        db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == employee_id,
            EmployeeBranchAssignment.is_primary == True,
        ).update({"is_primary": False})

    new_pos = EmployeeBranchAssignment(
        employee_id=employee_id,
        company_id=payload.company_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        job_title=payload.job_title,
        role_name=payload.role_name or "Employee",
        section=payload.section,
        team=payload.team,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_primary=payload.is_primary,
        status="Active",
    )
    db.add(new_pos)
    db.commit()
    db.refresh(new_pos)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="EmployeePosition",
        resource_id=str(new_pos.id),
        user_id=current_user.id,
        company_id=payload.company_id,
        new_values={"job_title": new_pos.job_title, "branch_id": str(new_pos.branch_id), "is_primary": new_pos.is_primary},
    )

    return success_response(data={"id": str(new_pos.id)}, message="تمت إضافة المنصب الوظيفي بنجاح")


@router.put("/{employee_id}/positions/{position_id}")
def update_employee_position(
    employee_id: uuid.UUID,
    position_id: uuid.UUID,
    payload: EmployeePositionUpdate,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update details of an employee's organizational position."""
    from app.models.enterprise import EmployeeBranchAssignment

    pos = db.query(EmployeeBranchAssignment).filter(
        EmployeeBranchAssignment.id == position_id,
        EmployeeBranchAssignment.employee_id == employee_id,
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="المنصب الوظيفي غير موجود")

    if payload.manager_id is not None:
        check_circular_manager(employee_id, payload.manager_id, db)
        pos.manager_id = payload.manager_id

    if payload.branch_id is not None:
        pos.branch_id = payload.branch_id
    if payload.department_id is not None:
        pos.department_id = payload.department_id
    if payload.job_title is not None:
        pos.job_title = payload.job_title
    if payload.role_name is not None:
        pos.role_name = payload.role_name
    if payload.section is not None:
        pos.section = payload.section
    if payload.team is not None:
        pos.team = payload.team
    if payload.start_date is not None:
        pos.start_date = payload.start_date
    if payload.end_date is not None:
        pos.end_date = payload.end_date
    if payload.status is not None:
        pos.status = payload.status

    if payload.is_primary is True:
        db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == employee_id,
            EmployeeBranchAssignment.id != position_id,
        ).update({"is_primary": False})
        pos.is_primary = True
    elif payload.is_primary is False:
        pos.is_primary = False

    db.commit()
    db.refresh(pos)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="EmployeePosition",
        resource_id=str(pos.id),
        user_id=current_user.id,
        company_id=pos.company_id,
        new_values={"job_title": pos.job_title, "is_primary": pos.is_primary, "status": pos.status},
    )

    return success_response(data={"id": str(pos.id)}, message="تم تحديث بيانات المنصب بنجاح")


@router.delete("/{employee_id}/positions/{position_id}")
def delete_employee_position(
    employee_id: uuid.UUID,
    position_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.EMPLOYEES, Action.DELETE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Deactivate or remove an employee position."""
    from app.models.enterprise import EmployeeBranchAssignment

    pos = db.query(EmployeeBranchAssignment).filter(
        EmployeeBranchAssignment.id == position_id,
        EmployeeBranchAssignment.employee_id == employee_id,
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="المنصب الوظيفي غير موجود")

    if pos.is_primary:
        # Check if other positions exist
        other = db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == employee_id,
            EmployeeBranchAssignment.id != position_id,
            EmployeeBranchAssignment.status == "Active",
        ).first()
        if other:
            other.is_primary = True

    db.delete(pos)
    db.commit()

    log_audit(
        db=db,
        action="DELETE",
        resource_type="EmployeePosition",
        resource_id=str(position_id),
        user_id=current_user.id,
        company_id=pos.company_id,
        new_values={"deleted": True},
    )

    return success_response(message="تم حذف المنصب الوظيفي بنجاح")
