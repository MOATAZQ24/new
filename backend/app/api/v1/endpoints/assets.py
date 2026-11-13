import uuid
import io
import base64
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.user import User, Employee
from app.models.company import Branch, Department
from app.schemas.asset import TechnicalAssetCreate, TechnicalAssetUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/assets", tags=["Technical Assets"])


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
    department_id: Optional[uuid.UUID] = None,
    asset_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    sort: str = Query("", pattern="^(|asset_code|asset_name|asset_type|serial_number|status|employee)$"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List technical assets with company isolation."""
    from app.api.v1.endpoints.workspace import authorize_company
    target_cid = company_id or active_cid
    authorize_company(db, current_user, target_cid)
    query = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid)

    if branch_id:
        query = query.filter(TechnicalAsset.branch_id == branch_id)
    if department_id:
        query = query.filter(TechnicalAsset.department_id == department_id)
    if asset_type:
        query = query.filter(TechnicalAsset.asset_type == asset_type)
    if status_filter:
        query = query.filter(TechnicalAsset.status == status_filter)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (TechnicalAsset.asset_name.ilike(s))
            | (TechnicalAsset.asset_code.ilike(s))
            | (TechnicalAsset.serial_number.ilike(s))
            | (TechnicalAsset.brand.ilike(s))
            | (TechnicalAsset.model.ilike(s))
        )

    total = query.count()
    ordering = getattr(TechnicalAsset, sort).asc() if sort and sort != "employee" else TechnicalAsset.created_at.desc()
    if sort == "employee":
        query = query.outerjoin(Employee, TechnicalAsset.assigned_employee_id == Employee.id)
        ordering = Employee.full_name.asc()
    assets = (
        query.order_by(ordering, TechnicalAsset.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
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

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_asset(
    payload: TechnicalAssetCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new technical asset with QR code generation."""
    target_cid = payload.company_id or active_cid

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

    asset = TechnicalAsset(
        company_id=target_cid,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        assigned_employee_id=payload.assigned_employee_id,
        asset_code=payload.asset_code.strip(),
        asset_name=payload.asset_name.strip(),
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
        asset.branch_id = payload.branch_id
    if payload.department_id is not None:
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
