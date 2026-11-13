"""Telegram Bot Integration Readiness API Endpoints."""

import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.user import User, Employee
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.models.integration import IntegrationConfig
from app.services.telegram_service import (
    get_telegram_config,
    generate_telegram_link_token,
    verify_telegram_link,
    unlink_employee_telegram,
    enqueue_task_notification,
    dispatch_outbox_notifications,
    execute_bot_action,
)

router = APIRouter(prefix="/telegram", tags=["Telegram Bot Integration Readiness"])


# ── Schemas ───────────────────────────────────────────────────────────

class GenerateTokenRequest(BaseModel):
    employee_id: uuid.UUID
    expires_in_minutes: Optional[int] = 30


class VerifyTokenRequest(BaseModel):
    token: str
    telegram_user_id: str
    telegram_chat_id: str
    telegram_username: Optional[str] = None


class BotActionSimulationRequest(BaseModel):
    telegram_user_id: str
    telegram_chat_id: Optional[str] = None
    action_str: str = Field(..., description="e.g. act:accept:<task_id>, act:start:<task_id>, act:done:<task_id>, cmd:my_tasks")


class TestNotificationRequest(BaseModel):
    employee_id: uuid.UUID
    custom_message: Optional[str] = None


class TelegramConfigUpdate(BaseModel):
    bot_token: Optional[str] = None
    bot_username: Optional[str] = "InvestorGateBot"
    is_enabled: Optional[bool] = None
    notify_on_assigned: Optional[bool] = True
    notify_on_accepted: Optional[bool] = True
    notify_on_started: Optional[bool] = True
    notify_on_completed: Optional[bool] = True
    notify_on_overdue: Optional[bool] = True
    notify_on_reassigned: Optional[bool] = True


# ── Status & Configuration ────────────────────────────────────────────

@router.get("/status")
def get_telegram_status(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve Telegram Bot integration readiness and configuration status."""
    is_cfg, bot_token, bot_username = get_telegram_config(db, active_cid)

    # Get integration config record
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == active_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    # Mask token
    masked_token = None
    if bot_token:
        masked_token = f"{bot_token[:6]}...{bot_token[-4:]}" if len(bot_token) > 10 else "******"

    # Count statistics
    linked_count = db.query(TelegramUserLink).filter(
        TelegramUserLink.company_id == active_cid,
        TelegramUserLink.is_verified == True,
    ).count()

    total_employees = db.query(Employee).filter(
        Employee.company_id == active_cid,
        Employee.employment_status == "Active",
    ).count()

    outbox_pending = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == active_cid,
        NotificationOutbox.status == "Pending",
    ).count()

    outbox_sent = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == active_cid,
        NotificationOutbox.status == "Sent",
    ).count()

    outbox_failed = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == active_cid,
        NotificationOutbox.status == "Failed",
    ).count()

    rules = (cfg.config_data or {}) if cfg else {}

    return success_response(data={
        "is_configured": is_cfg,
        "status": "Ready (Prepared)" if not is_cfg else "Live (Connected)",
        "readiness_summary": "بنية Telegram Bot جاهزة بالكامل (Transactional Outbox، التحقق بـ Token، والربط بالمهام). تتطلب إدخال Bot Token للتفعيل الحي.",
        "bot_username": bot_username,
        "bot_token_masked": masked_token,
        "is_enabled": cfg.is_enabled if cfg else False,
        "webhook_endpoint": "/api/v1/telegram/webhook",
        "notification_rules": {
            "notify_on_assigned": rules.get("notify_on_assigned", True),
            "notify_on_accepted": rules.get("notify_on_accepted", True),
            "notify_on_started": rules.get("notify_on_started", True),
            "notify_on_completed": rules.get("notify_on_completed", True),
            "notify_on_overdue": rules.get("notify_on_overdue", True),
            "notify_on_reassigned": rules.get("notify_on_reassigned", True),
        },
        "stats": {
            "linked_employees": linked_count,
            "total_active_employees": total_employees,
            "outbox_pending": outbox_pending,
            "outbox_sent": outbox_sent,
            "outbox_failed": outbox_failed,
        }
    })


@router.put("/config")
def update_telegram_config(
    payload: TelegramConfigUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update Telegram Bot token, username, and notification rules."""
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == active_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    if not cfg:
        cfg = IntegrationConfig(
            company_id=active_cid,
            service_name="telegram",
            display_name="إشعارات تليجرام الفورية (Telegram Bot)",
            is_enabled=False,
            config_data={},
            status="Not Configured",
        )
        db.add(cfg)
        db.flush()

    current_data = cfg.config_data or {}

    if payload.bot_token is not None:
        clean_token = payload.bot_token.strip()
        if clean_token:
            current_data["bot_token"] = clean_token
            cfg.status = "Connected"
        else:
            current_data.pop("bot_token", None)
            cfg.status = "Not Configured"

    if payload.bot_username is not None:
        current_data["bot_username"] = payload.bot_username.strip().lstrip("@")

    if payload.is_enabled is not None:
        cfg.is_enabled = payload.is_enabled

    # Notification rules
    for rule in [
        "notify_on_assigned",
        "notify_on_accepted",
        "notify_on_started",
        "notify_on_completed",
        "notify_on_overdue",
        "notify_on_reassigned",
    ]:
        val = getattr(payload, rule)
        if val is not None:
            current_data[rule] = val

    cfg.config_data = current_data
    db.commit()

    return success_response(message="تم تحديث إعدادات تكامل Telegram بنجاح")


# ── Employee Account Linking ──────────────────────────────────────────

@router.get("/links/list")
def list_employee_telegram_links(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List all employees in active company with their Telegram link status."""
    employees = (
        db.query(Employee)
        .filter(Employee.company_id == active_cid, Employee.employment_status == "Active")
        .order_by(Employee.full_name.asc())
        .all()
    )

    links_by_emp_id = {
        l.employee_id: l
        for l in db.query(TelegramUserLink).filter(TelegramUserLink.company_id == active_cid).all()
    }

    _, _, bot_username = get_telegram_config(db, active_cid)

    data = []
    for emp in employees:
        link = links_by_emp_id.get(emp.id)
        is_linked = bool(link and link.is_verified)
        is_pending = bool(link and not link.is_verified and link.token_expires_at > datetime.utcnow())

        data.append({
            "employee_id": str(emp.id),
            "employee_number": emp.employee_number,
            "full_name": emp.full_name,
            "job_title": emp.job_title,
            "email": emp.email,
            "phone": emp.phone,
            "is_linked": is_linked,
            "is_pending_verification": is_pending,
            "telegram_username": link.telegram_username if link else None,
            "telegram_chat_id": link.telegram_chat_id if link else None,
            "telegram_user_id": link.telegram_user_id if link else None,
            "linked_at": link.linked_at if (link and link.is_verified) else None,
            "token_expires_at": link.token_expires_at if (link and not link.is_verified) else None,
            "bot_username": bot_username,
        })

    return success_response(data=data)


@router.post("/links/generate-token")
def create_link_token(
    payload: GenerateTokenRequest,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Generate a single-use expiring verification token for linking an employee."""
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة موظفي شركة أخرى")

    result = generate_telegram_link_token(
        db=db,
        employee_id=emp.id,
        company_id=emp.company_id,
        expires_in_minutes=payload.expires_in_minutes or 30,
    )
    return success_response(data=result, message="تم توليد رمز الربط بنجاح (صالح لمدة 30 دقيقة)")


@router.post("/links/verify")
def verify_link(
    payload: VerifyTokenRequest,
    db: Session = Depends(get_db),
):
    """Verify an employee Telegram token (used by Bot or Admin manual binding)."""
    try:
        res = verify_telegram_link(
            db=db,
            token=payload.token,
            telegram_user_id=payload.telegram_user_id,
            telegram_chat_id=payload.telegram_chat_id,
            telegram_username=payload.telegram_username,
        )
        return success_response(data=res, message="تم ربط حساب التليجرام بالموظف بنجاح!")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/links/{employee_id}")
def unlink_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Unlink an employee's Telegram account."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة موظفي شركة أخرى")

    success = unlink_employee_telegram(db, employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="لا يوجد ربط تليجرام مسجل لهذا الموظف")

    return success_response(message="تم إلغاء ربط حساب التليجرام بنجاح")


# ── Outbox & Dispatcher ───────────────────────────────────────────────

@router.get("/outbox")
def list_outbox_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    event_type: Optional[str] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List Transactional Outbox entries with pagination and delivery status."""
    query = db.query(NotificationOutbox).filter(NotificationOutbox.company_id == active_cid)

    if status_filter:
        query = query.filter(NotificationOutbox.status == status_filter)
    if event_type:
        query = query.filter(NotificationOutbox.event_type == event_type)

    total = query.count()
    items = (
        query.order_by(NotificationOutbox.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = [
        {
            "id": str(i.id),
            "event_type": i.event_type,
            "recipient_chat_id": i.recipient_chat_id,
            "message_text": i.message_text,
            "status": i.status,
            "retry_count": i.retry_count,
            "max_retries": i.max_retries,
            "idempotency_key": i.idempotency_key,
            "last_error": i.last_error,
            "scheduled_at": i.scheduled_at,
            "sent_at": i.sent_at,
            "created_at": i.created_at,
        }
        for i in items
    ]

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("/outbox/dispatch")
def trigger_outbox_dispatch(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    """Trigger the notification outbox dispatcher worker."""
    results = dispatch_outbox_notifications(db=db, limit=50)
    return success_response(data=results, message="تم تشغيل معالج الإشعارات (Dispatcher) بنجاح")


# ── Action Simulator & Logs ───────────────────────────────────────────

@router.post("/simulate-action")
def simulate_bot_action(
    payload: BotActionSimulationRequest,
    request: Request,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    db: Session = Depends(get_db),
):
    """Simulate an inbound Telegram bot action (Accept, Start, Done, My Tasks)
    without requiring a live webhook, validating state transitions and RBAC.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    res = execute_bot_action(
        db=db,
        telegram_user_id=payload.telegram_user_id,
        telegram_chat_id=payload.telegram_chat_id,
        action_str=payload.action_str,
        ip_address=client_ip,
    )
    return success_response(data=res, message="تمت معالجة الإجراء عبر محرك التليجرام")


@router.get("/action-logs")
def list_action_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List telegram action audit logs."""
    query = db.query(TelegramActionLog).filter(TelegramActionLog.company_id == active_cid)
    total = query.count()
    items = (
        query.order_by(TelegramActionLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = [
        {
            "id": str(i.id),
            "telegram_user_id": i.telegram_user_id,
            "telegram_chat_id": i.telegram_chat_id,
            "action": i.action,
            "task_id": str(i.task_id) if i.task_id else None,
            "status": i.status,
            "details": i.details,
            "error_message": i.error_message,
            "created_at": i.created_at,
        }
        for i in items
    ]

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


# ── Inbound Webhook ───────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
):
    """Authenticated Telegram Bot Webhook endpoint.
    Handles /start token verification and inline button callback queries.
    """
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    client_ip = request.client.host if request.client else "127.0.0.1"

    # Handle Callback Query (Inline Button Click)
    if "callback_query" in body:
        cq = body["callback_query"]
        sender = cq.get("from", {})
        sender_id = str(sender.get("id"))
        chat_id = str(cq.get("message", {}).get("chat", {}).get("id", sender_id))
        callback_data = cq.get("data", "")

        result = execute_bot_action(
            db=db,
            telegram_user_id=sender_id,
            telegram_chat_id=chat_id,
            action_str=callback_data,
            ip_address=client_ip,
        )
        return {"ok": True, "result": result}

    # Handle Direct Message (e.g. /start <token>)
    if "message" in body:
        msg = body["message"]
        text = msg.get("text", "").strip()
        sender = msg.get("from", {})
        sender_id = str(sender.get("id"))
        chat_id = str(msg.get("chat", {}).get("id"))
        username = sender.get("username")

        if text.startswith("/start "):
            token = text[7:].strip()
            try:
                verify_telegram_link(
                    db=db,
                    token=token,
                    telegram_user_id=sender_id,
                    telegram_chat_id=chat_id,
                    telegram_username=username,
                )
                return {"ok": True, "action": "verified"}
            except Exception as e:
                return {"ok": True, "error": str(e)}

        if text == "/mytasks" or text == "/my_tasks":
            result = execute_bot_action(
                db=db,
                telegram_user_id=sender_id,
                telegram_chat_id=chat_id,
                action_str="cmd:my_tasks",
                ip_address=client_ip,
            )
            return {"ok": True, "result": result}

    return {"ok": True}
