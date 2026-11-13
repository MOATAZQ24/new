import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.user import User
from app.models.integration import IntegrationConfig, IntegrationLog
from app.services.integration_service import (
    get_or_create_default_configs,
    test_integration,
    dispatch_event,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/integrations", tags=["Integration Layer (n8n, Telegram, Gemini)"])


class IntegrationUpdatePayload(BaseModel):
    is_enabled: Optional[bool] = None
    config_data: Optional[Dict[str, Any]] = None


class TestEventPayload(BaseModel):
    event_type: str = "test.manual_ping"
    payload: Dict[str, Any] = {"message": "اختبار يدوي من لوحة التحكم"}


@router.get("")
def list_integrations(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List all integrations and their current status for the active company."""
    configs = get_or_create_default_configs(db, active_cid)
    data = [
        {
            "id": str(c.id),
            "service_name": c.service_name,
            "display_name": c.display_name,
            "is_enabled": c.is_enabled,
            "status": c.status,
            "config_data": c.config_data or {},
            "last_tested_at": c.last_tested_at,
            "last_error": c.last_error,
        }
        for c in configs
    ]
    return success_response(data=data)


@router.get("/{service_name}")
def get_integration(
    service_name: str,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get single integration details."""
    get_or_create_default_configs(db, active_cid)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == active_cid,
        IntegrationConfig.service_name == service_name,
    ).first()

    if not cfg:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")

    return success_response(
        data={
            "id": str(cfg.id),
            "service_name": cfg.service_name,
            "display_name": cfg.display_name,
            "is_enabled": cfg.is_enabled,
            "status": cfg.status,
            "config_data": cfg.config_data or {},
            "last_tested_at": cfg.last_tested_at,
            "last_error": cfg.last_error,
        }
    )


@router.put("/{service_name}")
def update_integration(
    service_name: str,
    payload: IntegrationUpdatePayload,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update integration settings, API credentials, or toggle status."""
    get_or_create_default_configs(db, active_cid)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == active_cid,
        IntegrationConfig.service_name == service_name,
    ).first()

    if not cfg:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")

    if payload.is_enabled is not None:
        cfg.is_enabled = payload.is_enabled
    if payload.config_data is not None:
        existing_data = cfg.config_data or {}
        existing_data.update(payload.config_data)
        cfg.config_data = existing_data

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Integration",
        resource_id=service_name,
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"is_enabled": cfg.is_enabled, "service": service_name},
    )

    return success_response(message="تم تحديث إعدادات التكامل بنجاح")


@router.post("/{service_name}/test")
def test_integration_endpoint(
    service_name: str,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Trigger a connectivity test for the selected integration."""
    result = test_integration(db, active_cid, service_name)
    if not result.get("success"):
        return success_response(data=result, message=result.get("message"))
    return success_response(data=result, message=result.get("message"))


@router.get("/logs/list")
def list_integration_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    service_name: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """View event logs dispatched to external systems."""
    query = db.query(IntegrationLog).filter(IntegrationLog.company_id == active_cid)

    if service_name:
        query = query.filter(IntegrationLog.service_name == service_name)
    if status_filter:
        query = query.filter(IntegrationLog.status == status_filter)

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
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Trigger a mock event to test the integration pipeline."""
    dispatch_event(db, active_cid, payload.event_type, payload.payload)
    return success_response(message="تم إرسال حدث الاختبار إلى جميع التكاملات النشطة")
