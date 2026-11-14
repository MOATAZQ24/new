import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.user import User, CompanyMembership
from app.models.integration import IntegrationConfig, IntegrationLog
from app.services.integration_service import (
    get_or_create_default_configs,
    test_integration,
    dispatch_event,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/integrations", tags=["Integration Layer (n8n, Telegram, Gemini)"])


def resolve_integration_company(
    current_user: User,
    active_cid: uuid.UUID,
    company_id: Optional[Any],
    db: Session,
) -> uuid.UUID:
    """Resolve target company ID strictly enforcing multi-tenant isolation."""
    if not company_id or not isinstance(company_id, (uuid.UUID, str)) or company_id == active_cid:
        return active_cid
    if isinstance(company_id, str):
        try:
            company_id = uuid.UUID(company_id)
        except (ValueError, AttributeError):
            return active_cid

    if current_user.is_superadmin:
        return company_id

    mem = db.query(CompanyMembership).filter(
        CompanyMembership.user_id == current_user.id,
        CompanyMembership.company_id == company_id,
    ).first()
    if not mem:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة تكاملات هذه المنشأة")
    return company_id


def mask_config_credentials(config_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Zero-Plaintext Masking: Mask all secret tokens and keys in outbound API responses."""
    if not config_data:
        return {}
    res = dict(config_data)
    sensitive_keys = ["bot_token", "api_key", "secret_key", "auth_token", "auth_header", "password"]
    for k in sensitive_keys:
        if k in res and res[k] and isinstance(res[k], str):
            val = res[k].strip()
            if len(val) > 8:
                res[f"{k}_masked"] = f"{val[:4]}...{val[-4:]}"
            else:
                res[f"{k}_masked"] = "******"
            res[f"has_{k}"] = True
            # Never return plaintext secrets in client GET responses
            res[k] = ""
        else:
            res[f"has_{k}"] = False
    return res


class IntegrationUpdatePayload(BaseModel):
    is_enabled: Optional[bool] = None
    config_data: Optional[Dict[str, Any]] = None


class TestEventPayload(BaseModel):
    event_type: str = "test.manual_ping"
    payload: Dict[str, Any] = {"message": "اختبار يدوي من لوحة التحكم"}


@router.get("")
def list_integrations(
    company_id: Optional[uuid.UUID] = Query(None, description="Select target company (Super Admin / Authorized Member)"),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List all integrations and their current status for the target company."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    configs = get_or_create_default_configs(db, target_cid)
    data = [
        {
            "id": str(c.id),
            "company_id": str(c.company_id),
            "service_name": c.service_name,
            "display_name": c.display_name,
            "is_enabled": c.is_enabled,
            "status": c.status,
            "config_data": mask_config_credentials(c.config_data or {}),
            "last_tested_at": c.last_tested_at,
            "last_error": c.last_error,
        }
        for c in configs
    ]
    return success_response(data=data)


@router.get("/{service_name}")
def get_integration(
    service_name: str,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get single integration details with masked credentials."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    get_or_create_default_configs(db, target_cid)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == service_name,
    ).first()

    if not cfg:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")

    return success_response(
        data={
            "id": str(cfg.id),
            "company_id": str(cfg.company_id),
            "service_name": cfg.service_name,
            "display_name": cfg.display_name,
            "is_enabled": cfg.is_enabled,
            "status": cfg.status,
            "config_data": mask_config_credentials(cfg.config_data or {}),
            "last_tested_at": cfg.last_tested_at,
            "last_error": cfg.last_error,
        }
    )


@router.put("/{service_name}")
def update_integration(
    service_name: str,
    payload: IntegrationUpdatePayload,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update integration settings, API credentials, or toggle status with dirty tracking."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    get_or_create_default_configs(db, target_cid)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == service_name,
    ).first()

    if not cfg:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")

    if payload.is_enabled is not None:
        cfg.is_enabled = payload.is_enabled

    if payload.config_data is not None:
        existing_data = dict(cfg.config_data or {})
        for k, v in payload.config_data.items():
            # If secret key is empty or masked placeholder, keep existing value
            if k in ("bot_token", "api_key", "secret_key", "auth_token", "auth_header", "password"):
                if isinstance(v, str) and (not v.strip() or "..." in v or v == "******"):
                    continue
            existing_data[k] = v

        cfg.config_data = existing_data
        flag_modified(cfg, "config_data")

    db.commit()
    db.refresh(cfg)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Integration",
        resource_id=service_name,
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"is_enabled": cfg.is_enabled, "service": service_name},
    )

    return success_response(message="تم حفظ إعدادات التكامل بنجاح")


@router.post("/{service_name}/test")
def test_integration_endpoint(
    service_name: str,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Trigger a connectivity test for the selected integration within target company."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    result = test_integration(db, target_cid, service_name)
    if not result.get("success"):
        return success_response(data=result, message=result.get("message"))
    return success_response(data=result, message=result.get("message"))


@router.get("/logs/list")
def list_integration_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    service_name: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """View event logs dispatched to external systems."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    query = db.query(IntegrationLog).filter(IntegrationLog.company_id == target_cid)

    if service_name and isinstance(service_name, str) and service_name.strip():
        query = query.filter(IntegrationLog.service_name == service_name.strip())
    if status_filter and isinstance(status_filter, str) and status_filter.strip():
        query = query.filter(IntegrationLog.status == status_filter.strip())

    total = query.count()
    logs = (
        query.order_by(IntegrationLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = [
        {
            "id": str(l.id),
            "service_name": l.service_name,
            "event_type": l.event_type,
            "status": l.status,
            "payload": l.payload,
            "response_data": l.response_data,
            "error_message": l.error_message,
            "created_at": l.created_at,
        }
        for l in logs
    ]

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("/trigger-test-event")
def trigger_manual_event(
    payload: TestEventPayload,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Manually dispatch a test webhook/integration event."""
    target_cid = resolve_integration_company(current_user, active_cid, company_id, db)
    dispatch_event(db, target_cid, payload.event_type, payload.payload)
    return success_response(message=f"تم إرسال حدث الاختبار '{payload.event_type}' بنجاح")
