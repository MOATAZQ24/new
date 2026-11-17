"""Tenant scoped configuration and authenticated, sanitized branding media."""
import io
import warnings
import uuid
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id
from app.core.response import success_response
from app.models.company import Company
from app.models.user import User, CompanyMembership, Role
from app.models.workspace import WorkspacePreference, CompanyWorkspace
from app.schemas.workspace import Workspace, Appearance, CompanyDefaults
from app.services.audit_service import log_audit

router = APIRouter(prefix="/workspace", tags=["Workspace"])


def authorize_company(db, user, cid, admin=False):
    if not db.get(Company, cid):
        raise HTTPException(404, "Company not found")
    if user.is_superadmin:
        return
    membership = db.query(CompanyMembership).filter_by(user_id=user.id, company_id=cid, status="Active").first()
    if not membership:
        raise HTTPException(403, "Company access denied")
    role = db.get(Role, membership.role_id) if membership.role_id else None
    if admin and (not role or role.name != "Company Admin"):
        raise HTTPException(403, "Company administrator required")


def workspace_permissions(db, user, cid):
    membership = db.query(CompanyMembership).filter_by(user_id=user.id, company_id=cid, status="Active").first()
    role = db.get(Role, membership.role_id) if membership and membership.role_id else None
    role_name = "Super Admin" if user.is_superadmin else role.name if role else "Employee"
    if role_name in ("Super Admin", "Company Admin", "IT Manager", "Auditor"):
        return ["kpis", "critical_tickets", "subscriptions", "maintenance", "recent_tasks", "asset_status", "ticket_priorities", "activity", "quick_actions"]
    if role_name == "IT Technician":
        return ["critical_tickets", "maintenance", "recent_tasks", "quick_actions"]
    return ["critical_tickets", "recent_tasks", "quick_actions"]


def shared_settings(db, cid):
    return db.query(CompanyWorkspace).filter_by(company_id=cid).first()


def effective_workspace(db, user, cid):
    shared = shared_settings(db, cid)
    own = db.query(WorkspacePreference).filter_by(user_id=user.id, company_id=cid).first()
    workspace = Workspace.model_validate(own.configuration if own else {}).model_dump()
    defaults = Appearance.model_validate(shared.defaults if shared else {}).model_dump()
    if not own:
        workspace["appearance"] = defaults.copy()
    for field in shared.enforced if shared else []:
        workspace["appearance"][field] = defaults[field]
    membership = db.query(CompanyMembership).filter_by(user_id=user.id, company_id=cid).first()
    role = db.get(Role, membership.role_id) if membership and membership.role_id else None
    return {"configuration": workspace, "company_defaults": defaults,
            "available_widgets": workspace_permissions(db, user, cid),
            "enforced": shared.enforced if shared else [],
            "can_manage_company": user.is_superadmin or bool(role and role.name == "Company Admin"),
            "branding": {kind: f"/workspace/branding/{cid}/{kind}" if shared and getattr(shared, kind) else None for kind in ("logo", "favicon")}}


@router.get("")
def get_workspace(user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid)
    return success_response(data=effective_workspace(db, user, cid))


@router.put("")
def save_workspace(payload: Workspace, user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid)
    shared = shared_settings(db, cid)
    data = payload.model_dump()
    for field in shared.enforced if shared else []:
        data["appearance"][field] = Appearance.model_validate(shared.defaults).model_dump()[field]
    row = db.query(WorkspacePreference).filter_by(user_id=user.id, company_id=cid).first()
    if not row:
        row = WorkspacePreference(user_id=user.id, company_id=cid)
        db.add(row)
    row.configuration = data
    db.commit()
    return success_response(data=effective_workspace(db, user, cid))


@router.delete("")
def reset_workspace(user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid)
    db.query(WorkspacePreference).filter_by(user_id=user.id, company_id=cid).delete()
    db.commit()
    return success_response(data=effective_workspace(db, user, cid))


@router.put("/company-defaults")
def save_defaults(payload: CompanyDefaults, user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid, admin=True)
    row = shared_settings(db, cid)
    if not row:
        row = CompanyWorkspace(company_id=cid)
        db.add(row)
    row.defaults = payload.appearance.model_dump()
    row.enforced = payload.enforced
    db.commit()
    log_audit(db=db, action="UPDATE", resource_type="CompanyWorkspace", resource_id=str(cid), user_id=user.id, company_id=cid, new_values=payload.model_dump())
    return success_response(data=effective_workspace(db, user, cid))


@router.put("/branding/{kind}")
async def upload_branding(kind: str, file: UploadFile = File(...), user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid, admin=True)
    if kind not in ("logo", "favicon"):
        raise HTTPException(404, "Unknown branding type")
    content = await file.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(422, "Maximum image size is 2 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as im:
                if im.format not in ("PNG", "JPEG", "WEBP") or getattr(im, "n_frames", 1) != 1:
                    raise ValueError()
                if not (16 <= im.width <= 2048 and 16 <= im.height <= 2048):
                    raise ValueError()
                if kind == "favicon" and im.width != im.height:
                    raise ValueError()
                im.load()
                clean = im.convert("RGBA")
                if kind == "favicon":
                    clean = clean.resize((64, 64))
                output = io.BytesIO()
                clean.save(output, format="PNG")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "Use a static PNG, JPEG or WebP, 16–2048 pixels; favicon must be square")
    row = shared_settings(db, cid)
    if not row:
        row = CompanyWorkspace(company_id=cid)
        db.add(row)
    setattr(row, kind, output.getvalue())
    if kind == "logo":
        db.get(Company, cid).company_logo = f"/workspace/branding/{cid}/logo"
    db.commit()
    log_audit(db=db, action="UPDATE", resource_type="CompanyBranding", resource_id=str(cid), user_id=user.id, company_id=cid, new_values={"kind": kind})
    return success_response(data=effective_workspace(db, user, cid))


@router.delete("/branding/{kind}")
def remove_branding(kind: str, user: User = Depends(get_current_user), cid: uuid.UUID = Depends(get_user_company_id), db: Session = Depends(get_db)):
    authorize_company(db, user, cid, admin=True)
    if kind not in ("logo", "favicon"):
        raise HTTPException(404, "Unknown branding type")
    row = shared_settings(db, cid)
    if row:
        setattr(row, kind, None)
    if kind == "logo":
        db.get(Company, cid).company_logo = None
    db.commit()
    log_audit(db=db, action="DELETE", resource_type="CompanyBranding", resource_id=str(cid), user_id=user.id, company_id=cid, new_values={"kind": kind})
    return success_response(data=effective_workspace(db, user, cid))


@router.get("/branding/{company_id}/{kind}")
def branding_media(company_id: uuid.UUID, kind: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    authorize_company(db, user, company_id)
    row = shared_settings(db, company_id)
    if kind not in ("logo", "favicon") or not row or not getattr(row, kind):
        raise HTTPException(404, "Branding not found")
    return Response(getattr(row, kind), media_type="image/png", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
