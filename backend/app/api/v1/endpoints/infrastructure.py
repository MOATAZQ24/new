import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Branch
from app.models.infrastructure import ITInfrastructure
from app.models.user import User, Employee
from app.schemas.infrastructure import InfrastructureCreate, InfrastructureUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/infrastructure", tags=["IT Infrastructure"])


@router.get("")
def list_infrastructure(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    device_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(ITInfrastructure).filter(ITInfrastructure.company_id == target_cid)

    if branch_id:
        query = query.filter(ITInfrastructure.branch_id == branch_id)
    if device_type:
        query = query.filter(ITInfrastructure.device_type == device_type)
    if status_filter:
        query = query.filter(ITInfrastructure.status == status_filter)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (ITInfrastructure.device_name.ilike(s))
            | (ITInfrastructure.hostname.ilike(s))
            | (ITInfrastructure.management_ip.ilike(s))
            | (ITInfrastructure.network_name.ilike(s))
            | (ITInfrastructure.model.ilike(s))
        )

    total = query.count()
    items = (
        query.order_by(ITInfrastructure.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for dev in items:
        resp_name = dev.responsible_person.full_name if dev.responsible_person else None
        b_name = dev.branch.branch_name if dev.branch else None

        data.append({
            "id": str(dev.id),
            "company_id": str(dev.company_id),
            "branch_id": str(dev.branch_id) if dev.branch_id else None,
            "device_name": dev.device_name,
            "device_type": dev.device_type,
            "manufacturer": dev.manufacturer,
            "model": dev.model,
            "serial_number": dev.serial_number,
            "hostname": dev.hostname,
            "management_ip": dev.management_ip,
            "network_name": dev.network_name,
            "vlan": dev.vlan,
            "location": dev.location,
            "responsible_person_id": str(dev.responsible_person_id) if dev.responsible_person_id else None,
            "responsible_person_name": resp_name,
            "branch_name": b_name,
            "credential_reference": dev.credential_reference,
            "firmware_version": dev.firmware_version,
            "last_configuration_change": dev.last_configuration_change,
            "status": dev.status,
            "notes": dev.notes,
            "created_at": dev.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_infrastructure(
    payload: InfrastructureCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    validate_company_fk(db, Branch, payload.branch_id, target_cid, "الفرع")
    validate_company_fk(db, Employee, payload.responsible_person_id, target_cid, "المسؤول")

    device = ITInfrastructure(
        company_id=target_cid,
        branch_id=payload.branch_id,
        device_name=payload.device_name.strip(),
        device_type=payload.device_type,
        manufacturer=payload.manufacturer,
        model=payload.model,
        serial_number=payload.serial_number,
        hostname=payload.hostname,
        management_ip=payload.management_ip,
        network_name=payload.network_name,
        vlan=payload.vlan,
        location=payload.location,
        responsible_person_id=payload.responsible_person_id,
        credential_reference=payload.credential_reference,
        firmware_version=payload.firmware_version,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="ITInfrastructure",
        resource_id=str(device.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"name": device.device_name, "type": device.device_type},
    )

    return success_response(data={"id": str(device.id)}, message="تم إضافة جهاز البنية التحتية بنجاح")


@router.get("/{device_id}")
def get_infrastructure(
    device_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    dev = db.query(ITInfrastructure).filter(ITInfrastructure.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")

    if not current_user.is_superadmin and dev.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا الجهاز")

    data = {
        "id": str(dev.id),
        "company_id": str(dev.company_id),
        "branch_id": str(dev.branch_id) if dev.branch_id else None,
        "device_name": dev.device_name,
        "device_type": dev.device_type,
        "manufacturer": dev.manufacturer,
        "model": dev.model,
        "serial_number": dev.serial_number,
        "hostname": dev.hostname,
        "management_ip": dev.management_ip,
        "network_name": dev.network_name,
        "vlan": dev.vlan,
        "location": dev.location,
        "responsible_person_id": str(dev.responsible_person_id) if dev.responsible_person_id else None,
        "responsible_person_name": dev.responsible_person.full_name if dev.responsible_person else None,
        "branch_name": dev.branch.branch_name if dev.branch else None,
        "credential_reference": dev.credential_reference,
        "firmware_version": dev.firmware_version,
        "last_configuration_change": dev.last_configuration_change,
        "status": dev.status,
        "notes": dev.notes,
        "created_at": dev.created_at,
    }
    return success_response(data=data)


@router.put("/{device_id}")
def update_infrastructure(
    device_id: uuid.UUID,
    payload: InfrastructureUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    dev = db.query(ITInfrastructure).filter(ITInfrastructure.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")

    if not current_user.is_superadmin and dev.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل")

    if payload.device_name is not None:
        dev.device_name = payload.device_name
    if payload.device_type is not None:
        dev.device_type = payload.device_type
    if payload.manufacturer is not None:
        dev.manufacturer = payload.manufacturer
    if payload.model is not None:
        dev.model = payload.model
    if payload.serial_number is not None:
        dev.serial_number = payload.serial_number
    if payload.branch_id is not None:
        dev.branch_id = payload.branch_id
    if payload.hostname is not None:
        dev.hostname = payload.hostname
    if payload.management_ip is not None:
        dev.management_ip = payload.management_ip
    if payload.network_name is not None:
        dev.network_name = payload.network_name
    if payload.vlan is not None:
        dev.vlan = payload.vlan
    if payload.location is not None:
        dev.location = payload.location
    if payload.responsible_person_id is not None:
        dev.responsible_person_id = payload.responsible_person_id
    if payload.credential_reference is not None:
        dev.credential_reference = payload.credential_reference
    if payload.firmware_version is not None:
        dev.firmware_version = payload.firmware_version
    if payload.status is not None:
        dev.status = payload.status
    if payload.notes is not None:
        dev.notes = payload.notes

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="ITInfrastructure",
        resource_id=str(dev.id),
        user_id=current_user.id,
        company_id=dev.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات جهاز البنية التحتية بنجاح")


@router.delete("/{device_id}")
def delete_infrastructure(
    device_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    dev = db.query(ITInfrastructure).filter(ITInfrastructure.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")

    if not current_user.is_superadmin and dev.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    log_audit(
        db=db,
        action="DELETE",
        resource_type="ITInfrastructure",
        resource_id=str(dev.id),
        user_id=current_user.id,
        company_id=dev.company_id,
    )

    db.delete(dev)
    db.commit()
    return success_response(message="تم حذف الجهاز بنجاح")
