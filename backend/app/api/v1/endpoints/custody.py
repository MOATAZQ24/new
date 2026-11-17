import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope
from app.core.rbac import require_permission, Module, Action
from app.core.response import success_response, paginate
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.user import User, Employee
from app.schemas.asset import AssetCustodyAssign, AssetCustodyReturn, AssetCustodyTransfer
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification

router = APIRouter(prefix="/custody", tags=["Asset Custody & Handover"])


@router.get("")
def list_custody(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    employee_id: Optional[uuid.UUID] = None,
    asset_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_permission(Module.CUSTODY, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List asset custody records with filtering."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(AssetCustody).filter(AssetCustody.company_id == target_cid)

    if employee_id:
        query = query.filter(AssetCustody.employee_id == employee_id)
    if asset_id:
        query = query.filter(AssetCustody.asset_id == asset_id)
    if status_filter:
        query = query.filter(AssetCustody.status == status_filter)

    total = query.count()
    records = (
        query.order_by(AssetCustody.assignment_date.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for r in records:
        data.append({
            "id": str(r.id),
            "asset_id": str(r.asset_id),
            "asset_code": r.asset.asset_code if r.asset else None,
            "asset_name": r.asset.asset_name if r.asset else None,
            "asset_type": r.asset.asset_type if r.asset else None,
            "company_id": str(r.company_id),
            "employee_id": str(r.employee_id),
            "employee_name": r.employee.full_name if r.employee else None,
            "assigned_by": str(r.assigned_by) if r.assigned_by else None,
            "assigner_name": r.assigner.username if r.assigner else None,
            "assignment_date": r.assignment_date,
            "expected_return_date": r.expected_return_date,
            "actual_return_date": r.actual_return_date,
            "condition_on_assignment": r.condition_on_assignment,
            "condition_on_return": r.condition_on_return,
            "acknowledgment": r.acknowledgment,
            "status": r.status,
            "notes": r.notes,
            "created_at": r.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("/assign")
def assign_asset(
    payload: AssetCustodyAssign,
    current_user: User = Depends(require_permission(Module.CUSTODY, Action.ASSIGN)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assign asset to employee using an atomic database transaction."""
    asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == payload.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل التقني غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="الأصل لا يتبع للشركة الحالية")

    # Prevent conflicting active assignments
    existing_active = db.query(AssetCustody).filter(
        AssetCustody.asset_id == asset.id,
        AssetCustody.status == "Active",
    ).first()
    if existing_active:
        raise HTTPException(
            status_code=400,
            detail=f"الأصل مسلّم بالفعل كعهدة نشطة للموظف ({existing_active.employee.full_name if existing_active.employee else 'موظف آخر'})",
        )

    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if employee.company_id != asset.company_id:
        raise HTTPException(
            status_code=400,
            detail="الموظف لا ينتمي لنفس منشأة الأصل التقني (مخالفة العزل المؤسسي)",
        )

    if employee.employment_status != "Active":
        raise HTTPException(status_code=400, detail="لا يمكن تسليم عهدة لموظف غير نشط")
    if asset.status not in ("Available",):
        raise HTTPException(status_code=400, detail="الأصل غير متاح للتسليم")

    # Atomic transaction
    try:
        claimed = db.query(TechnicalAsset).filter(
            TechnicalAsset.id == asset.id,
            TechnicalAsset.status == "Available",
            TechnicalAsset.assigned_employee_id.is_(None),
        ).update({"status": "Assigned", "assigned_employee_id": employee.id}, synchronize_session=False)
        if claimed != 1:
            raise HTTPException(status_code=409, detail="تغيرت حالة الأصل، يرجى إعادة المحاولة")
        db.refresh(asset)
        custody = AssetCustody(
            asset_id=asset.id,
            company_id=asset.company_id,
            employee_id=employee.id,
            assigned_by=current_user.id,
            assignment_date=datetime.utcnow(),
            expected_return_date=payload.expected_return_date,
            condition_on_assignment=payload.condition_on_assignment,
            acknowledgment=payload.acknowledgment,
            status="Active",
            notes=payload.notes,
        )
        db.add(custody)

        # Update asset status and assignment
        asset.status = "Assigned"
        asset.assigned_employee_id = employee.id
        asset.condition = payload.condition_on_assignment

        db.flush()
        log_audit(
            db=db,
            action="ASSIGN_ASSET",
            resource_type="AssetCustody",
            resource_id=str(custody.id),
            user_id=current_user.id,
            company_id=asset.company_id,
            new_values={
                "asset_code": asset.asset_code,
                "employee_name": employee.full_name,
                "condition": payload.condition_on_assignment,
            },
            commit=False,
        )
        db.commit()
        db.refresh(custody)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="فشلت عملية تسليم العهدة")

    # Deliver notifications only after the custody and audit transaction commits
    if employee.user:
        create_notification(
            db=db,
            recipient_user_id=employee.user.id,
            company_id=asset.company_id,
            event_type="asset_assigned",
            title="استلام عهدة جديدة",
            message=f"تم تسليمك الأصل التقني ({asset.asset_name} - {asset.asset_code}) كعهدة رسمية",
            related_record_type="custody",
            related_record_id=custody.id,
        )



    return success_response(
        data={"custody_id": str(custody.id)},
        message=f"تم تسليم العهدة للموظف {employee.full_name} بنجاح",
    )


@router.post("/return/{custody_id}")
def return_asset(
    custody_id: uuid.UUID,
    payload: AssetCustodyReturn,
    current_user: User = Depends(require_permission(Module.CUSTODY, Action.ASSIGN)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return asset from employee using an atomic database transaction."""
    custody = db.query(AssetCustody).filter(AssetCustody.id == custody_id).first()
    if not custody:
        raise HTTPException(status_code=404, detail="سجل العهدة غير موجود")

    if not current_user.is_superadmin and custody.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لهذا السجل")

    if custody.status != "Active":
        raise HTTPException(status_code=400, detail="العهدة ليست نشطة حالياً (تم إرجاعها مسبقاً)")

    asset = custody.asset
    employee = custody.employee
    if not asset or asset.company_id != custody.company_id:
        raise HTTPException(status_code=409, detail="بيانات العهدة غير متسقة")

    try:
        released = db.query(TechnicalAsset).filter(
            TechnicalAsset.id == asset.id,
            TechnicalAsset.status == "Assigned",
            TechnicalAsset.assigned_employee_id == custody.employee_id,
        ).update({"status": "Available", "assigned_employee_id": None}, synchronize_session=False)
        if released != 1:
            raise HTTPException(status_code=409, detail="تغيرت حالة الأصل، يرجى إعادة المحاولة")
        db.refresh(asset)
        custody.status = "Returned"
        custody.actual_return_date = datetime.utcnow()
        custody.condition_on_return = payload.condition_on_return
        if payload.notes:
            custody.notes = f"{custody.notes or ''} | إرجاع: {payload.notes}".strip(" |")

        # Update technical asset
        asset.status = "Available"
        asset.assigned_employee_id = None
        asset.condition = payload.condition_on_return

        db.flush()
        log_audit(
            db=db,
            action="RETURN_ASSET",
            resource_type="AssetCustody",
            resource_id=str(custody.id),
            user_id=current_user.id,
            company_id=custody.company_id,
            new_values={
                "asset_code": asset.asset_code,
                "return_condition": payload.condition_on_return,
            },
            commit=False,
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="فشلت عملية استرجاع العهدة")

    if employee and employee.user:
        create_notification(
            db=db,
            recipient_user_id=employee.user.id,
            company_id=custody.company_id,
            event_type="asset_returned",
            title="إرجاع العهدة",
            message=f"تم تأكيد استرجاع الأصل التقني ({asset.asset_name}) بحالة: {payload.condition_on_return}",
            related_record_type="custody",
            related_record_id=custody.id,
        )



    return success_response(message="تم استرجاع الأصل وتحديث حالة العهدة بنجاح")


@router.post("/transfer/{custody_id}")
def transfer_asset(
    custody_id: uuid.UUID,
    payload: AssetCustodyTransfer,
    current_user: User = Depends(require_permission(Module.CUSTODY, Action.ASSIGN)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Transfer an assigned asset to another employee atomically."""
    old_custody = db.query(AssetCustody).filter(AssetCustody.id == custody_id).first()
    if not old_custody:
        raise HTTPException(status_code=404, detail="سجل العهدة غير موجود")

    if not current_user.is_superadmin and old_custody.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لهذا السجل")

    if old_custody.status != "Active":
        raise HTTPException(status_code=400, detail="العهدة ليست نشطة")

    new_emp = db.query(Employee).filter(Employee.id == payload.new_employee_id).first()
    if not new_emp:
        raise HTTPException(status_code=404, detail="الموظف الجديد غير موجود")

    asset = old_custody.asset
    if not asset or asset.company_id != old_custody.company_id:
        raise HTTPException(status_code=409, detail="بيانات العهدة غير متسقة")
    if new_emp.employment_status != "Active" or new_emp.id == old_custody.employee_id:
        raise HTTPException(status_code=400, detail="يجب اختيار موظف نشط آخر")
    if new_emp.company_id != asset.company_id:
        raise HTTPException(
            status_code=400,
            detail="الموظف المنقول إليه لا ينتمي لنفس منشأة الأصل التقني (مخالفة العزل المؤسسي)",
        )
    try:
        moved = db.query(TechnicalAsset).filter(
            TechnicalAsset.id == asset.id,
            TechnicalAsset.status == "Assigned",
            TechnicalAsset.assigned_employee_id == old_custody.employee_id,
        ).update({"assigned_employee_id": new_emp.id}, synchronize_session=False)
        if moved != 1:
            raise HTTPException(status_code=409, detail="تغيرت حالة الأصل، يرجى إعادة المحاولة")
        db.refresh(asset)
        # Close old custody
        old_custody.status = "Transferred"
        old_custody.actual_return_date = datetime.utcnow()
        old_custody.condition_on_return = payload.condition

        # Create new custody
        new_custody = AssetCustody(
            asset_id=asset.id,
            company_id=asset.company_id,
            employee_id=new_emp.id,
            assigned_by=current_user.id,
            assignment_date=datetime.utcnow(),
            condition_on_assignment=payload.condition,
            status="Active",
            notes=f"منقول من الموظف {old_custody.employee.full_name if old_custody.employee else ''}. {payload.notes or ''}",
        )
        db.add(new_custody)

        # Update asset assigned employee
        asset.assigned_employee_id = new_emp.id
        asset.condition = payload.condition

        db.flush()
        log_audit(
            db=db,
            action="TRANSFER_ASSET",
            resource_type="AssetCustody",
            resource_id=str(new_custody.id),
            user_id=current_user.id,
            company_id=asset.company_id,
            new_values={"asset": asset.asset_code, "to_employee": new_emp.full_name},
            commit=False,
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="فشلت عملية النقل")



    return success_response(message=f"تم نقل العهدة إلى الموظف {new_emp.full_name} بنجاح")


@router.get("/receipt/{custody_id}")
def get_custody_receipt(
    custody_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.CUSTODY, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Generate handover receipt data with tenant isolation."""
    custody = db.query(AssetCustody).filter(AssetCustody.id == custody_id).first()
    if not custody:
        raise HTTPException(status_code=404, detail="العهدة غير موجودة")

    if not current_user.is_superadmin and custody.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لإيصال هذه العهدة")

    asset = custody.asset
    emp = custody.employee
    company = custody.company

    dept_name = getattr(emp.department, "department_name", None) if (emp and getattr(emp, "department", None)) else None
    br_name = getattr(emp.branch, "branch_name", None) if (emp and getattr(emp, "branch", None)) else None

    receipt_data = {
        "receipt_number": f"RCV-{str(custody.id)[:8].upper()}",
        "company_name_ar": company.company_name_ar if company else "",
        "company_name_en": company.company_name_en if company else "",
        "employee_name": emp.full_name if emp else "غير محدد",
        "employee_number": emp.employee_number if emp else "",
        "job_title": emp.job_title if emp else "",
        "department": dept_name,
        "branch": br_name,
        "asset_code": asset.asset_code,
        "asset_name": asset.asset_name,
        "asset_type": asset.asset_type,
        "brand": asset.brand,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "condition_on_assignment": custody.condition_on_assignment,
        "assignment_date": custody.assignment_date.strftime("%Y-%m-%d %H:%M"),
        "expected_return_date": custody.expected_return_date.strftime("%Y-%m-%d") if custody.expected_return_date else None,
        "notes": custody.notes,
        "declaration_text": "أقر أنا الموظف الموضح بياناتي أعلاه بأنني استلمت الأصل التقني المذكور بحالة جيدة وأتعهد بالحفاظ عليه واستخدامه في أغراض العمل وإعادته متى طُلب مني ذلك.",
    }
    return success_response(data=receipt_data)
