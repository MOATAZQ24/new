import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.maintenance import MaintenanceRecord
from app.models.asset import TechnicalAsset
from app.models.infrastructure import ITInfrastructure
from app.models.user import User
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification

router = APIRouter(prefix="/maintenance", tags=["Maintenance & Configuration Changes"])


@router.get("")
def list_maintenance(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    action_type: Optional[str] = None,  # Maintenance, Replacement, Configuration Change
    status_filter: Optional[str] = Query(None, alias="status"),
    approval_status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = company_id or active_cid
    query = db.query(MaintenanceRecord).filter(MaintenanceRecord.company_id == target_cid)

    if action_type:
        query = query.filter(MaintenanceRecord.action_type == action_type)
    if status_filter:
        query = query.filter(MaintenanceRecord.status == status_filter)
    if approval_status:
        query = query.filter(MaintenanceRecord.approval_status == approval_status)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (MaintenanceRecord.title.ilike(s))
            | (MaintenanceRecord.description.ilike(s))
            | (MaintenanceRecord.change_reason.ilike(s))
        )

    total = query.count()
    records = (
        query.order_by(MaintenanceRecord.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for r in records:
        rep_name = r.reported_by.full_name if r.reported_by else None
        tech_name = r.assigned_technician.username if r.assigned_technician else None

        # Resolve target name
        target_name = None
        if r.target_type == "asset":
            asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == r.target_id).first()
            if asset:
                target_name = f"{asset.asset_name} ({asset.asset_code})"
        elif r.target_type == "infrastructure":
            infra = db.query(ITInfrastructure).filter(ITInfrastructure.id == r.target_id).first()
            if infra:
                target_name = f"{infra.device_name} ({infra.device_type})"

        repl_name = r.replacement_asset.asset_name if r.replacement_asset else None

        data.append({
            "id": str(r.id),
            "company_id": str(r.company_id),
            "target_type": r.target_type,
            "target_id": str(r.target_id),
            "target_name": target_name,
            "action_type": r.action_type,
            "title": r.title,
            "description": r.description,
            "reported_by_id": str(r.reported_by_id) if r.reported_by_id else None,
            "assigned_technician_id": str(r.assigned_technician_id) if r.assigned_technician_id else None,
            "reported_by_name": rep_name,
            "assigned_technician_name": tech_name,
            "start_date": r.start_date,
            "completion_date": r.completion_date,
            "old_configuration_reference": r.old_configuration_reference,
            "new_configuration_reference": r.new_configuration_reference,
            "change_reason": r.change_reason,
            "risk_assessment": r.risk_assessment,
            "approval_status": r.approval_status,
            "planned_execution_window": r.planned_execution_window,
            "rollback_plan": r.rollback_plan,
            "verification_result": r.verification_result,
            "replacement_asset_id": str(r.replacement_asset_id) if r.replacement_asset_id else None,
            "replacement_asset_name": repl_name,
            "cost": float(r.cost) if r.cost else None,
            "status": r.status,
            "notes": r.notes,
            "created_at": r.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_maintenance(
    payload: MaintenanceCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = payload.company_id or active_cid

    record = MaintenanceRecord(
        company_id=target_cid,
        target_type=payload.target_type,
        target_id=payload.target_id,
        action_type=payload.action_type,
        title=payload.title.strip(),
        description=payload.description,
        reported_by_id=payload.reported_by_id,
        assigned_technician_id=payload.assigned_technician_id or current_user.id,
        start_date=payload.start_date,
        completion_date=payload.completion_date,
        old_configuration_reference=payload.old_configuration_reference,
        new_configuration_reference=payload.new_configuration_reference,
        change_reason=payload.change_reason,
        risk_assessment=payload.risk_assessment,
        approval_status=payload.approval_status,
        planned_execution_window=payload.planned_execution_window,
        rollback_plan=payload.rollback_plan,
        verification_result=payload.verification_result,
        replacement_asset_id=payload.replacement_asset_id,
        cost=payload.cost,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(record)

    # If it's a replacement and completed, update old and new asset statuses
    if payload.action_type == "Replacement" and payload.replacement_asset_id:
        if payload.target_type == "asset":
            old_asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == payload.target_id).first()
            new_asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == payload.replacement_asset_id).first()
            if old_asset and payload.status == "Completed":
                old_asset.status = "Damaged"
            if new_asset and payload.status == "Completed" and old_asset and old_asset.assigned_employee_id:
                new_asset.status = "Assigned"
                new_asset.assigned_employee_id = old_asset.assigned_employee_id

    db.commit()
    db.refresh(record)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="MaintenanceRecord",
        resource_id=str(record.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"title": record.title, "action_type": record.action_type},
    )

    return success_response(data={"id": str(record.id)}, message="تم تسجيل العملية بنجاح")


@router.post("/{record_id}/approve")
def approve_maintenance_change(
    record_id: uuid.UUID,
    decision: str = Query(..., pattern="^(Approved|Rejected)$"),
    notes: Optional[str] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Approve or reject a configuration change or maintenance procedure."""
    rec = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    if not current_user.is_superadmin and rec.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الاعتماد")

    rec.approval_status = decision
    if decision == "Approved" and rec.status == "Pending Approval":
        rec.status = "In Progress"

    if notes:
        rec.notes = f"{rec.notes or ''} | اعتماد: {decision} ({notes})".strip(" |")

    db.commit()

    if rec.assigned_technician_id:
        create_notification(
            db=db,
            recipient_user_id=rec.assigned_technician_id,
            company_id=rec.company_id,
            event_type="maintenance_approval",
            title=f"تم {decision == 'Approved' and 'اعتماد' or 'رفض'} طلب التغيير/الصيانة",
            message=f"الطلب ({rec.title}): تم تحديث حالة الاعتماد إلى {decision}",
            related_record_type="maintenance",
            related_record_id=rec.id,
        )

    log_audit(
        db=db,
        action="APPROVE",
        resource_type="MaintenanceRecord",
        resource_id=str(rec.id),
        user_id=current_user.id,
        company_id=rec.company_id,
        new_values={"approval_status": decision},
    )

    return success_response(message=f"تم تحديث حالة الاعتماد إلى: {decision}")


@router.get("/{record_id}")
def get_maintenance(
    record_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    r = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    if not current_user.is_superadmin and r.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا السجل")

    target_name = None
    if r.target_type == "asset":
        asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == r.target_id).first()
        if asset:
            target_name = f"{asset.asset_name} ({asset.asset_code})"
    elif r.target_type == "infrastructure":
        infra = db.query(ITInfrastructure).filter(ITInfrastructure.id == r.target_id).first()
        if infra:
            target_name = f"{infra.device_name} ({infra.device_type})"

    data = {
        "id": str(r.id),
        "company_id": str(r.company_id),
        "target_type": r.target_type,
        "target_id": str(r.target_id),
        "target_name": target_name,
        "action_type": r.action_type,
        "title": r.title,
        "description": r.description,
        "reported_by_id": str(r.reported_by_id) if r.reported_by_id else None,
        "assigned_technician_id": str(r.assigned_technician_id) if r.assigned_technician_id else None,
        "reported_by_name": r.reported_by.full_name if r.reported_by else None,
        "assigned_technician_name": r.assigned_technician.username if r.assigned_technician else None,
        "start_date": r.start_date,
        "completion_date": r.completion_date,
        "old_configuration_reference": r.old_configuration_reference,
        "new_configuration_reference": r.new_configuration_reference,
        "change_reason": r.change_reason,
        "risk_assessment": r.risk_assessment,
        "approval_status": r.approval_status,
        "planned_execution_window": r.planned_execution_window,
        "rollback_plan": r.rollback_plan,
        "verification_result": r.verification_result,
        "replacement_asset_id": str(r.replacement_asset_id) if r.replacement_asset_id else None,
        "replacement_asset_name": r.replacement_asset.asset_name if r.replacement_asset else None,
        "cost": float(r.cost) if r.cost else None,
        "status": r.status,
        "notes": r.notes,
        "created_at": r.created_at,
    }
    return success_response(data=data)


@router.put("/{record_id}")
def update_maintenance(
    record_id: uuid.UUID,
    payload: MaintenanceUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    r = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    if not current_user.is_superadmin and r.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل")

    if payload.title is not None:
        r.title = payload.title
    if payload.description is not None:
        r.description = payload.description
    if payload.reported_by_id is not None:
        r.reported_by_id = payload.reported_by_id
    if payload.assigned_technician_id is not None:
        r.assigned_technician_id = payload.assigned_technician_id
    if payload.start_date is not None:
        r.start_date = payload.start_date
    if payload.completion_date is not None:
        r.completion_date = payload.completion_date
    if payload.cost is not None:
        r.cost = payload.cost
    if payload.status is not None:
        r.status = payload.status
    if payload.notes is not None:
        r.notes = payload.notes
    if payload.change_reason is not None:
        r.change_reason = payload.change_reason
    if payload.risk_assessment is not None:
        r.risk_assessment = payload.risk_assessment
    if payload.approval_status is not None:
        r.approval_status = payload.approval_status
    if payload.planned_execution_window is not None:
        r.planned_execution_window = payload.planned_execution_window
    if payload.rollback_plan is not None:
        r.rollback_plan = payload.rollback_plan
    if payload.verification_result is not None:
        r.verification_result = payload.verification_result
    if payload.replacement_asset_id is not None:
        r.replacement_asset_id = payload.replacement_asset_id

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="MaintenanceRecord",
        resource_id=str(r.id),
        user_id=current_user.id,
        company_id=r.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث السجل بنجاح")


@router.delete("/{record_id}")
def delete_maintenance(
    record_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    r = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    if not current_user.is_superadmin and r.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    log_audit(
        db=db,
        action="DELETE",
        resource_type="MaintenanceRecord",
        resource_id=str(r.id),
        user_id=current_user.id,
        company_id=r.company_id,
    )

    db.delete(r)
    db.commit()
    return success_response(message="تم حذف السجل بنجاح")
