import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope
from app.core.response import success_response, paginate
from app.models.subscription import ThirdPartySubscription
from app.models.user import User
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/subscriptions", tags=["Third-Party Subscriptions"])


@router.get("")
def list_subscriptions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    subscription_type: Optional[str] = None,
    billing_cycle: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid)

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
            "service_name": sub.service_name,
            "provider": sub.provider,
            "subscription_type": sub.subscription_type,
            "package_type": sub.package_type,
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
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Calculate monthly and annual costs, active and expiring soon counts."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    subs = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid).all()

    today = date.today()
    total_monthly = 0.0
    total_annual = 0.0
    active_count = 0
    expiring_soon_count = 0

    for s in subs:
        if s.status in ["Active", "Expiring Soon"]:
            active_count += 1
            cost = float(s.price)

            # Normalize to monthly and annual based on billing_cycle
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
            else:  # Annual or Custom
                monthly = cost / 12
                annual = cost

            total_monthly += monthly
            total_annual += annual

            if s.renewal_date:
                days = (s.renewal_date - today).days
                if 0 <= days <= 30:
                    expiring_soon_count += 1

    data = {
        "total_monthly_cost": round(total_monthly, 2),
        "total_annual_cost": round(total_annual, 2),
        "currency": "SAR",
        "active_subscriptions_count": active_count,
        "expiring_soon_count": expiring_soon_count,
    }
    return success_response(data=data)


@router.post("")
def create_subscription(
    payload: SubscriptionCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = payload.company_id or active_cid

    sub = ThirdPartySubscription(
        company_id=target_cid,
        service_name=payload.service_name.strip(),
        provider=payload.provider,
        subscription_type=payload.subscription_type,
        package_type=payload.package_type,
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

    if payload.service_name is not None:
        sub.service_name = payload.service_name
    if payload.provider is not None:
        sub.provider = payload.provider
    if payload.subscription_type is not None:
        sub.subscription_type = payload.subscription_type
    if payload.package_type is not None:
        sub.package_type = payload.package_type
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
