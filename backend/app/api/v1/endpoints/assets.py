import uuid
import io
import base64
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.user import User, Employee
from app.models.company import Branch, Department
from app.schemas.asset import TechnicalAssetCreate, TechnicalAssetUpdate
from app.services.audit_service import log_audit
from app.services import enterprise_service
from pydantic import BaseModel

router = APIRouter(prefix="/assets", tags=["Technical Assets"])


class AssetBranchTransferRequest(BaseModel):
    to_branch_id: uuid.UUID
    reason: Optional[str] = None
    require_approval: bool = False


@router.get("/analytics")
def get_assets_branch_analytics(
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    asset_category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return strictly deduplicated, branch-aware Asset & IT Asset Dashboard analytics."""
    from app.api.v1.endpoints.workspace import authorize_company
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    parsed_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    data = enterprise_service.get_branch_aware_asset_analytics(
        db=db,
        company_id=target_cid,
        branch_ids=parsed_branches,
        department_id=department_id,
        asset_category=asset_category,
    )
    return success_response(data=data)


def generate_qr_code_base64(data: str) -> str:
    """Generate QR code base64 PNG image."""
    try:
        import qrcode
        qr = qrcode.QRCode(version=1, box_size=6, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#123D32", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        # Fallback SVG QR placeholder if qrcode package is missing
        return f"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='100%' height='100%' fill='%23F5F7F8'/><text x='50%' y='50%' text-anchor='middle' fill='%23123D32' font-size='12'>{data}</text></svg>"


@router.get("")
def list_assets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    sort: str = Query("", pattern="^(|asset_code|asset_name|asset_type|serial_number|status|employee)$"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List technical & general assets with company isolation and multi-branch filtering."""
    from app.api.v1.endpoints.workspace import authorize_company
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    enterprise_service.ensure_canonical_five_branches(db, target_cid)
    parsed_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    query = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid)

    page_val = page if isinstance(page, int) else 1
    per_page_val = per_page if isinstance(per_page, int) else 20

    if parsed_branches:
        query = query.filter(TechnicalAsset.branch_id.in_(parsed_branches))
    if department_id and isinstance(department_id, uuid.UUID):
        query = query.filter(TechnicalAsset.department_id == department_id)
    if asset_category and isinstance(asset_category, str):
        query = query.filter(TechnicalAsset.asset_category == asset_category)
    if asset_type and isinstance(asset_type, str):
        query = query.filter(TechnicalAsset.asset_type == asset_type)
    if isinstance(status_filter, str) and status_filter.strip():
        query = query.filter(TechnicalAsset.status == status_filter.strip())
    if isinstance(search, str) and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (TechnicalAsset.asset_name.ilike(s))
            | (TechnicalAsset.asset_code.ilike(s))
            | (TechnicalAsset.serial_number.ilike(s))
            | (TechnicalAsset.brand.ilike(s))
            | (TechnicalAsset.model.ilike(s))
        )

    total = query.count()
    sort_str = sort if isinstance(sort, str) else ""
    ordering = getattr(TechnicalAsset, sort_str).asc() if sort_str and sort_str != "employee" and hasattr(TechnicalAsset, sort_str) else TechnicalAsset.created_at.desc()
    if sort_str == "employee":
        query = query.outerjoin(Employee, TechnicalAsset.assigned_employee_id == Employee.id)
        ordering = Employee.full_name.asc()
    assets = (
        query.order_by(ordering, TechnicalAsset.id)
        .offset((page_val - 1) * per_page_val)
        .limit(per_page_val)
        .all()
    )

    data = []
    for a in assets:
        emp_name = a.assigned_employee.full_name if a.assigned_employee else None
        b_name = a.branch.branch_name if a.branch else None
        d_name = a.department.department_name if a.department else None

        data.append({
            "id": str(a.id),
            "company_id": str(a.company_id),
            "branch_id": str(a.branch_id) if a.branch_id else None,
            "department_id": str(a.department_id) if a.department_id else None,
            "assigned_employee_id": str(a.assigned_employee_id) if a.assigned_employee_id else None,
            "assigned_employee_name": emp_name,
            "branch_name": b_name,
            "department_name": d_name,
            "asset_code": a.asset_code,
            "asset_name": a.asset_name,
            "asset_category": getattr(a, "asset_category", "IT") or "IT",
            "asset_type": a.asset_type,
            "brand": a.brand,
            "model": a.model,
            "serial_number": a.serial_number,
            "purchase_date": a.purchase_date,
            "warranty_expiry": a.warranty_expiry,
            "condition": a.condition,
            "status": a.status,
            "qr_code_data": a.qr_code_data,
            "notes": a.notes,
            "created_at": a.created_at,
        })

    pagination = paginate(total=total, page=page_val, per_page=per_page_val)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_asset(
    payload: TechnicalAssetCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new technical asset with QR code generation."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)

    validate_company_fk(db, Branch, payload.branch_id, target_cid, "الفرع")
    validate_company_fk(db, Department, payload.department_id, target_cid, "القسم")
    validate_company_fk(db, Employee, payload.assigned_employee_id, target_cid, "الموظف المعين")

    # Check unique asset_code in company
    existing = db.query(TechnicalAsset).filter(
        TechnicalAsset.company_id == target_cid,
        TechnicalAsset.asset_code == payload.asset_code.strip(),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="كود الأصل مسجل مسبقاً في هذه الشركة")

    qr_text = f"ASSET:{payload.asset_code.strip()}|CID:{target_cid}"
    qr_b64 = generate_qr_code_base64(qr_text)

    status_val = "Assigned" if payload.assigned_employee_id else payload.status

    canonical_branches = enterprise_service.ensure_canonical_five_branches(db, target_cid)
    effective_branch_id = payload.branch_id or (canonical_branches[2].id if len(canonical_branches) >= 3 else canonical_branches[0].id)

    asset = TechnicalAsset(
        company_id=target_cid,
        branch_id=effective_branch_id,
        department_id=payload.department_id,
        assigned_employee_id=payload.assigned_employee_id,
        asset_code=payload.asset_code.strip(),
        asset_name=payload.asset_name.strip(),
        asset_category=payload.asset_category or "IT",
        asset_type=payload.asset_type,
        brand=payload.brand,
        model=payload.model,
        serial_number=payload.serial_number,
        purchase_date=payload.purchase_date,
        warranty_expiry=payload.warranty_expiry,
        condition=payload.condition,
        status=status_val,
        qr_code_data=qr_b64,
        notes=payload.notes,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    # If assigned immediately on creation, create initial custody record
    if payload.assigned_employee_id:
        custody = AssetCustody(
            asset_id=asset.id,
            company_id=target_cid,
            employee_id=payload.assigned_employee_id,
            assigned_by=current_user.id,
            condition_on_assignment=payload.condition,
            status="Active",
            notes="تم التعيين عند إنشاء الأصل",
        )
        db.add(custody)
        db.commit()

    log_audit(
        db=db,
        action="CREATE",
        resource_type="TechnicalAsset",
        resource_id=str(asset.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"asset_code": asset.asset_code, "name": asset.asset_name},
    )

    return success_response(data={"id": str(asset.id), "asset_code": asset.asset_code}, message="تم إضافة الأصل التقني بنجاح")


@router.get("/{asset_id}")
def get_asset(
    asset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول إلى هذا الأصل")

    # Fetch custody history
    custodies = (
        db.query(AssetCustody)
        .filter(AssetCustody.asset_id == asset.id)
        .order_by(AssetCustody.assignment_date.desc())
        .all()
    )
    custody_history = []
    for c in custodies:
        custody_history.append({
            "id": str(c.id),
            "employee_id": str(c.employee_id),
            "employee_name": c.employee.full_name if c.employee else "غير معروف",
            "assignment_date": c.assignment_date,
            "expected_return_date": c.expected_return_date,
            "actual_return_date": c.actual_return_date,
            "condition_on_assignment": c.condition_on_assignment,
            "condition_on_return": c.condition_on_return,
            "status": c.status,
            "notes": c.notes,
        })

    data = {
        "id": str(asset.id),
        "company_id": str(asset.company_id),
        "branch_id": str(asset.branch_id) if asset.branch_id else None,
        "department_id": str(asset.department_id) if asset.department_id else None,
        "assigned_employee_id": str(asset.assigned_employee_id) if asset.assigned_employee_id else None,
        "assigned_employee_name": asset.assigned_employee.full_name if asset.assigned_employee else None,
        "branch_name": asset.branch.branch_name if asset.branch else None,
        "department_name": asset.department.department_name if asset.department else None,
        "asset_code": asset.asset_code,
        "asset_name": asset.asset_name,
        "asset_type": asset.asset_type,
        "brand": asset.brand,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "purchase_date": asset.purchase_date,
        "warranty_expiry": asset.warranty_expiry,
        "condition": asset.condition,
        "status": asset.status,
        "qr_code_data": asset.qr_code_data,
        "notes": asset.notes,
        "custody_history": custody_history,
        "created_at": asset.created_at,
    }
    return success_response(data=data)


@router.put("/{asset_id}")
def update_asset(
    asset_id: uuid.UUID,
    payload: TechnicalAssetUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذا الأصل")

    if payload.asset_name is not None:
        asset.asset_name = payload.asset_name
    if payload.asset_type is not None:
        asset.asset_type = payload.asset_type
    if payload.brand is not None:
        asset.brand = payload.brand
    if payload.model is not None:
        asset.model = payload.model
    if payload.serial_number is not None:
        asset.serial_number = payload.serial_number
    if payload.branch_id is not None:
        validate_company_fk(db, Branch, payload.branch_id, asset.company_id, "الفرع")
        asset.branch_id = payload.branch_id
    if payload.department_id is not None:
        validate_company_fk(db, Department, payload.department_id, asset.company_id, "القسم")
        asset.department_id = payload.department_id
    if payload.purchase_date is not None:
        asset.purchase_date = payload.purchase_date
    if payload.warranty_expiry is not None:
        asset.warranty_expiry = payload.warranty_expiry
    if payload.condition is not None:
        asset.condition = payload.condition
    if payload.status is not None:
        asset.status = payload.status
    if payload.notes is not None:
        asset.notes = payload.notes

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="TechnicalAsset",
        resource_id=str(asset.id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات الأصل بنجاح")


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    # Safety check: prevent deleting asset under active custody
    active_custody_count = db.query(AssetCustody).filter(
        AssetCustody.asset_id == asset.id,
        AssetCustody.status == "Active",
    ).count()
    if active_custody_count > 0 or asset.status == "Assigned":
        raise HTTPException(
            status_code=400,
            detail="لا يمكن حذف الأصل لوجود عهدة نشطة مسجلة عليه حالياً. يرجى استرجاع العهدة أولاً.",
        )

    log_audit(
        db=db,
        action="DELETE",
        resource_type="TechnicalAsset",
        resource_id=str(asset.id),
        user_id=current_user.id,
        company_id=asset.company_id,
    )

    db.delete(asset)
    db.commit()
    return success_response(message="تم حذف الأصل بنجاح")


@router.post("/{asset_id}/transfer-branch")
def transfer_asset_branch_endpoint(
    asset_id: uuid.UUID,
    payload: AssetBranchTransferRequest,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Transfer an asset to a new physical branch while preserving ownership and transfer history."""
    res = enterprise_service.transfer_asset_to_branch(
        db=db,
        current_user=current_user,
        company_id=active_cid,
        asset_id=asset_id,
        to_branch_id=payload.to_branch_id,
        reason=payload.reason,
        require_approval=payload.require_approval,
    )
    msg = (
        "تم إرسال طلب نقل الأصل للاعتماد"
        if payload.require_approval
        else f"تم نقل الأصل بنجاح إلى فرع ({res['to_branch_name']})"
    )
    return success_response(data=res, message=msg)
