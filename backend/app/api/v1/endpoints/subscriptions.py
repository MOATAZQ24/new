import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Branch
from app.models.subscription import ThirdPartySubscription, EmployeeSubscription
from app.models.user import User, Employee
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate, SubscriptionSeatAssign
from app.services.audit_service import log_audit
from app.services import enterprise_service

router = APIRouter(prefix="/subscriptions", tags=["Third-Party Subscriptions"])


@router.get("")
def list_subscriptions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    subscription_type: Optional[str] = None,
    billing_cycle: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    query = (
        db.query(ThirdPartySubscription)
        .options(
            joinedload(ThirdPartySubscription.branch),
            joinedload(ThirdPartySubscription.assigned_owner),
            joinedload(ThirdPartySubscription.payment_responsible),
        )
        .filter(ThirdPartySubscription.company_id == target_cid)
    )

    if selected_branches:
        query = query.filter(
            or_(
                ThirdPartySubscription.branch_id.in_(selected_branches),
                ThirdPartySubscription.branch_id.is_(None),
            )
        )
    if subscription_type:
        query = query.filter(ThirdPartySubscription.subscription_type == subscription_type)
    if billing_cycle:
        query = query.filter(ThirdPartySubscription.billing_cycle == billing_cycle)
    if status_filter:
        query = query.filter(ThirdPartySubscription.status == status_filter)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (ThirdPartySubscription.service_name.ilike(s))
            | (ThirdPartySubscription.provider.ilike(s))
            | (ThirdPartySubscription.account_email.ilike(s))
        )

    total = query.count()
    items = (
        query.order_by(ThirdPartySubscription.renewal_date.asc().nullslast())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    sub_ids = [s.id for s in items]
    seat_counts_map = {}
    if sub_ids:
        rows = (
            db.query(EmployeeSubscription.subscription_id, func.count(EmployeeSubscription.id))
            .filter(
                EmployeeSubscription.subscription_id.in_(sub_ids),
                EmployeeSubscription.status == "Active",
            )
            .group_by(EmployeeSubscription.subscription_id)
            .all()
        )
        seat_counts_map = {sid: cnt for sid, cnt in rows}

    today = date.today()
    data = []
    for sub in items:
        owner_name = sub.assigned_owner.full_name if sub.assigned_owner else None
        payer_name = sub.payment_responsible.full_name if sub.payment_responsible else None

        days_to_renewal = None
        if sub.renewal_date:
            days_to_renewal = (sub.renewal_date - today).days

        # Dynamic status calculation if active but expiring soon
        calc_status = sub.status
        if sub.status == "Active" and days_to_renewal is not None:
            if days_to_renewal < 0:
                calc_status = "Expired"
            elif days_to_renewal <= 30:
                calc_status = "Expiring Soon"

        data.append({
            "id": str(sub.id),
            "company_id": str(sub.company_id),
            "branch_id": str(sub.branch_id) if getattr(sub, "branch_id", None) else None,
            "branch_name": sub.branch.branch_name if getattr(sub, "branch", None) else "جميع الفروع",
            "service_name": sub.service_name,
            "provider": sub.provider,
            "subscription_type": sub.subscription_type,
            "package_type": sub.package_type,
            "seat_limit": getattr(sub, "seat_limit", 1) or 1,
            "allocated_seats": seat_counts_map.get(sub.id, 0),
            "assigned_owner_id": str(sub.assigned_owner_id) if sub.assigned_owner_id else None,
            "payment_responsible_id": str(sub.payment_responsible_id) if sub.payment_responsible_id else None,
            "assigned_owner_name": owner_name,
            "payment_responsible_name": payer_name,
            "account_email": sub.account_email,
            "start_date": sub.start_date,
            "renewal_date": sub.renewal_date,
            "expiry_date": sub.expiry_date,
            "billing_cycle": sub.billing_cycle,
            "price": float(sub.price),
            "currency": sub.currency,
            "auto_renewal": sub.auto_renewal,
            "status": calc_status,
            "days_to_renewal": days_to_renewal,
            "notes": sub.notes,
            "created_at": sub.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.get("/summary")
def get_cost_summary(
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Calculate monthly and annual costs, active/expired counts, seat usage, and type/renewal breakdowns."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    q = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid)
    if selected_branches:
        q = q.filter(or_(ThirdPartySubscription.branch_id.in_(selected_branches), ThirdPartySubscription.branch_id.is_(None)))
    subs = q.all()

    today = date.today()
    total_monthly = 0.0
    total_annual = 0.0
    active_count = 0
    expiring_soon_count = 0
    expired_count = 0
    by_type: dict[str, int] = {}
    upcoming_by_month: dict[str, int] = {}

    for s in subs:
        st_type = s.subscription_type or "SaaS"
        by_type[st_type] = by_type.get(st_type, 0) + 1
        days = (s.renewal_date - today).days if s.renewal_date else None
        if s.status == "Expired" or (s.status == "Active" and days is not None and days < 0):
            expired_count += 1
        elif s.status in ["Active", "Expiring Soon"]:
            active_count += 1
            cost = float(s.price)

            cycle = (s.billing_cycle or "Annual").lower()
            if "month" in cycle:
                monthly = cost
                annual = cost * 12
            elif "quarter" in cycle:
                monthly = cost / 3
                annual = cost * 4
            elif "semi" in cycle:
                monthly = cost / 6
                annual = cost * 2
            else:
                monthly = cost / 12
                annual = cost

            total_monthly += monthly
            total_annual += annual

            if days is not None and 0 <= days <= 30:
                expiring_soon_count += 1
            if s.renewal_date and days is not None and days >= 0:
                ym = s.renewal_date.strftime("%Y-%m")
                upcoming_by_month[ym] = upcoming_by_month.get(ym, 0) + 1

    allocated_total = (
        db.query(func.count(EmployeeSubscription.id))
        .filter(
            EmployeeSubscription.company_id == target_cid,
            EmployeeSubscription.status == "Active",
        )
        .scalar()
        or 0
    )

    data = {
        "total_subscriptions_count": len(subs),
        "total_monthly_cost": round(total_monthly, 2),
        "total_annual_cost": round(total_annual, 2),
        "currency": "SAR",
        "active_subscriptions_count": active_count,
        "expiring_soon_count": expiring_soon_count,
        "expired_count": expired_count,
        "total_allocated_seats": allocated_total,
        "by_type": by_type,
        "upcoming_by_month": dict(sorted(upcoming_by_month.items())[:6]),
    }
    return success_response(data=data)


@router.post("")
def create_subscription(
    payload: SubscriptionCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    validate_company_fk(db, Branch, getattr(payload, "branch_id", None), target_cid, "الفرع")
    validate_company_fk(db, Employee, payload.assigned_owner_id, target_cid, "الموظف المسؤول")
    validate_company_fk(db, Employee, payload.payment_responsible_id, target_cid, "مسؤول الدفع")

    sub = ThirdPartySubscription(
        company_id=target_cid,
        branch_id=getattr(payload, "branch_id", None),
        service_name=payload.service_name.strip(),
        provider=payload.provider,
        subscription_type=payload.subscription_type,
        package_type=payload.package_type,
        seat_limit=max(1, getattr(payload, "seat_limit", 1) or 1),
        assigned_owner_id=payload.assigned_owner_id,
        payment_responsible_id=payload.payment_responsible_id,
        account_email=payload.account_email,
        start_date=payload.start_date,
        renewal_date=payload.renewal_date,
        expiry_date=payload.expiry_date,
        billing_cycle=payload.billing_cycle,
        price=payload.price,
        currency=payload.currency,
        auto_renewal=payload.auto_renewal,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="ThirdPartySubscription",
        resource_id=str(sub.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"service_name": sub.service_name, "price": float(sub.price)},
    )

    return success_response(data={"id": str(sub.id)}, message="تم إضافة الاشتراك بنجاح")


@router.get("/{sub_id}")
def get_subscription(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")

    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا الاشتراك")

    today = date.today()
    days_to_renewal = (sub.renewal_date - today).days if sub.renewal_date else None

    data = {
        "id": str(sub.id),
        "company_id": str(sub.company_id),
        "service_name": sub.service_name,
        "provider": sub.provider,
        "subscription_type": sub.subscription_type,
        "package_type": sub.package_type,
        "assigned_owner_id": str(sub.assigned_owner_id) if sub.assigned_owner_id else None,
        "payment_responsible_id": str(sub.payment_responsible_id) if sub.payment_responsible_id else None,
        "assigned_owner_name": sub.assigned_owner.full_name if sub.assigned_owner else None,
        "payment_responsible_name": sub.payment_responsible.full_name if sub.payment_responsible else None,
        "account_email": sub.account_email,
        "start_date": sub.start_date,
        "renewal_date": sub.renewal_date,
        "expiry_date": sub.expiry_date,
        "billing_cycle": sub.billing_cycle,
        "price": float(sub.price),
        "currency": sub.currency,
        "auto_renewal": sub.auto_renewal,
        "status": sub.status,
        "days_to_renewal": days_to_renewal,
        "notes": sub.notes,
        "created_at": sub.created_at,
    }
    return success_response(data=data)


@router.put("/{sub_id}")
def update_subscription(
    sub_id: uuid.UUID,
    payload: SubscriptionUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")

    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل")

    validate_company_fk(db, Branch, getattr(payload, "branch_id", None), sub.company_id, "الفرع")
    validate_company_fk(db, Employee, payload.assigned_owner_id, sub.company_id, "الموظف المسؤول")
    validate_company_fk(db, Employee, payload.payment_responsible_id, sub.company_id, "مسؤول الدفع")

    if payload.service_name is not None:
        sub.service_name = payload.service_name
    if payload.provider is not None:
        sub.provider = payload.provider
    if payload.subscription_type is not None:
        sub.subscription_type = payload.subscription_type
    if payload.package_type is not None:
        sub.package_type = payload.package_type
    if getattr(payload, "branch_id", None) is not None:
        sub.branch_id = payload.branch_id
    if getattr(payload, "seat_limit", None) is not None:
        sub.seat_limit = max(1, payload.seat_limit)
    if payload.assigned_owner_id is not None:
        sub.assigned_owner_id = payload.assigned_owner_id
    if payload.payment_responsible_id is not None:
        sub.payment_responsible_id = payload.payment_responsible_id
    if payload.account_email is not None:
        sub.account_email = payload.account_email
    if payload.start_date is not None:
        sub.start_date = payload.start_date
    if payload.renewal_date is not None:
        sub.renewal_date = payload.renewal_date
    if payload.expiry_date is not None:
        sub.expiry_date = payload.expiry_date
    if payload.billing_cycle is not None:
        sub.billing_cycle = payload.billing_cycle
    if payload.price is not None:
        sub.price = payload.price
    if payload.currency is not None:
        sub.currency = payload.currency
    if payload.auto_renewal is not None:
        sub.auto_renewal = payload.auto_renewal
    if payload.status is not None:
        sub.status = payload.status
    if payload.notes is not None:
        sub.notes = payload.notes

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="ThirdPartySubscription",
        resource_id=str(sub.id),
        user_id=current_user.id,
        company_id=sub.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث الاشتراك بنجاح")


@router.get("/{sub_id}/employees")
def list_subscription_employees(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List employees allocated to a subscription (M:N employee_subscriptions)."""
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا الاشتراك")

    rows = (
        db.query(EmployeeSubscription)
        .options(joinedload(EmployeeSubscription.employee))
        .filter(
            EmployeeSubscription.subscription_id == sub.id,
            EmployeeSubscription.status == "Active",
        )
        .order_by(EmployeeSubscription.allocated_at.desc())
        .all()
    )
    return success_response(
        data={
            "subscription_id": str(sub.id),
            "service_name": sub.service_name,
            "seat_limit": getattr(sub, "seat_limit", 1) or 1,
            "allocated_seats": len(rows),
            "employees": [
                {
                    "id": str(r.id),
                    "employee_id": str(r.employee_id),
                    "employee_number": r.employee.employee_number if r.employee else "—",
                    "full_name": r.employee.full_name if r.employee else "—",
                    "job_title": r.employee.job_title if r.employee else None,
                    "email": r.employee.email if r.employee else None,
                    "allocated_at": r.allocated_at.isoformat() if r.allocated_at else None,
                    "notes": r.notes,
                }
                for r in rows
            ],
        }
    )


@router.post("/{sub_id}/employees")
def assign_employee_to_subscription(
    sub_id: uuid.UUID,
    payload: SubscriptionSeatAssign,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Allocate a seat in a subscription to an active company employee."""
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذا الاشتراك")

    emp = validate_company_fk(db, Employee, payload.employee_id, sub.company_id, "الموظف")
    if not emp:
        raise HTTPException(status_code=400, detail="الموظف مطلوب")

    existing = (
        db.query(EmployeeSubscription)
        .filter(
            EmployeeSubscription.subscription_id == sub.id,
            EmployeeSubscription.employee_id == emp.id,
        )
        .first()
    )
    if existing and existing.status == "Active":
        raise HTTPException(status_code=400, detail="الموظف مرتبط بالفعل بهذا الاشتراك")

    active_count = (
        db.query(func.count(EmployeeSubscription.id))
        .filter(
            EmployeeSubscription.subscription_id == sub.id,
            EmployeeSubscription.status == "Active",
        )
        .scalar()
        or 0
    )
    limit_val = max(1, getattr(sub, "seat_limit", 1) or 1)
    if active_count >= limit_val:
        raise HTTPException(
            status_code=400,
            detail=f"اكتمل الحد الأقصى للمقاعد المتاحة ({active_count}/{limit_val})، قم برفع حد المقاعد أولاً",
        )

    if existing:
        existing.status = "Active"
        existing.allocated_by = current_user.id
        existing.allocated_at = datetime.utcnow()
        existing.notes = payload.notes
        rec = existing
    else:
        rec = EmployeeSubscription(
            company_id=sub.company_id,
            subscription_id=sub.id,
            employee_id=emp.id,
            allocated_by=current_user.id,
            status="Active",
            notes=payload.notes,
        )
        db.add(rec)

    db.commit()
    db.refresh(rec)
    log_audit(
        db=db,
        action="ALLOCATE_SEAT",
        resource_type="EmployeeSubscription",
        resource_id=str(rec.id),
        user_id=current_user.id,
        company_id=sub.company_id,
        new_values={"subscription_id": str(sub.id), "employee_id": str(emp.id)},
    )
    return success_response(
        data={"id": str(rec.id), "employee_id": str(emp.id), "allocated_seats": active_count + 1},
        message="تم ربط الموظف بالاشتراك بنجاح",
    )


@router.delete("/{sub_id}/employees/{employee_id}")
def revoke_employee_from_subscription(
    sub_id: uuid.UUID,
    employee_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Revoke an employee seat allocation from a subscription."""
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل")

    rec = (
        db.query(EmployeeSubscription)
        .filter(
            EmployeeSubscription.subscription_id == sub.id,
            EmployeeSubscription.employee_id == employee_id,
            EmployeeSubscription.status == "Active",
        )
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="ارتباط الموظف بهذا الاشتراك غير موجود")

    rec.status = "Revoked"
    db.commit()
    log_audit(
        db=db,
        action="REVOKE_SEAT",
        resource_type="EmployeeSubscription",
        resource_id=str(rec.id),
        user_id=current_user.id,
        company_id=sub.company_id,
        new_values={"subscription_id": str(sub.id), "employee_id": str(employee_id)},
    )
    return success_response(message="تم سحب مقعد الاشتراك من الموظف")


@router.delete("/{sub_id}")
def delete_subscription(
    sub_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    sub = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")

    if not current_user.is_superadmin and sub.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    log_audit(
        db=db,
        action="DELETE",
        resource_type="ThirdPartySubscription",
        resource_id=str(sub.id),
        user_id=current_user.id,
        company_id=sub.company_id,
    )

    db.delete(sub)
    db.commit()
    return success_response(message="تم حذف الاشتراك بنجاح")
