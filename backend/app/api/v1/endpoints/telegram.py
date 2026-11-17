"""Telegram Bot Integration Readiness API Endpoints."""

import os
import uuid
import hashlib
import secrets
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from typing import Literal
from app.core.rbac import has_module_permission
from app.services.telegram_permissions import crm_grants, effective_grants, policy_for, maximum_scope, POLICY_KEY

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles
from app.core.response import success_response, paginate
from app.models.user import User, Employee, CompanyMembership
from app.models.telegram import (
    TelegramUserLink,
    NotificationOutbox,
    TelegramActionLog,
    TelegramBotMenuConfig,
    TelegramMessageTemplate,
)
from app.models.integration import IntegrationConfig, IntegrationLog
from app.services.telegram_service import (
    get_telegram_config,
    generate_telegram_link_token,
    verify_telegram_link,
    unlink_employee_telegram,
    enqueue_task_notification,
    dispatch_outbox_notifications,
    execute_bot_action,
    test_telegram_connection,
    send_telegram_direct_message,
    get_telegram_worker_status,
    get_or_create_default_menu_configs,
    get_or_create_default_message_templates,
    render_template,
    publish_bot_commands_to_telegram,
)

router = APIRouter(prefix="/telegram", tags=["Telegram Bot Integration Readiness"])


def resolve_telegram_company(
    current_user: User,
    active_cid: uuid.UUID,
    company_id: Optional[Any],
    db: Session,
) -> uuid.UUID:
    """Resolve target company ID strictly enforcing multi-tenant isolation."""
    # Guard against FastAPI default Query object when called directly in tests
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
        CompanyMembership.status == "Active",
    ).first()
    if not mem:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة بوت وتكاملات هذه المنشأة")
    return company_id


# ── Schemas ───────────────────────────────────────────────────────────

class GenerateTokenRequest(BaseModel):
    employee_id: uuid.UUID
    expires_in_minutes: int = Field(default=30, ge=1, le=60)


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
    chat_id: Optional[str] = None
    employee_id: Optional[uuid.UUID] = None
    custom_message: Optional[str] = None


class TestConnectionRequest(BaseModel):
    bot_token: Optional[str] = None


class TelegramConfigUpdate(BaseModel):
    bot_token: Optional[str] = None
    bot_username: Optional[str] = "InvestorGateBot"
    chat_id: Optional[str] = None
    is_enabled: Optional[bool] = None
    notify_on_assigned: Optional[bool] = True
    notify_on_accepted: Optional[bool] = True
    notify_on_started: Optional[bool] = True
    notify_on_completed: Optional[bool] = True
    notify_on_overdue: Optional[bool] = True
    notify_on_reassigned: Optional[bool] = True


class UpdateTelegramPermissionsRequest(BaseModel):
    allowed_modules: Optional[List[str]] = None
    notification_preferences: Optional[Dict[str, Any]] = None
    notifications_enabled: Optional[bool] = None
    actions: Optional[Dict[str, List[Literal['view', 'create', 'update', 'manage']]]] = None
    data_scope: Optional[Literal['Self', 'Company']] = None
    role_template: Optional[Literal['custom', 'read_only', 'crm']] = None


class BotMenuCreate(BaseModel):
    label: str
    action: str
    menu_type: str = "reply_keyboard"  # reply_keyboard, inline_button, command
    sort_order: Optional[int] = 0
    is_enabled: Optional[bool] = True
    icon: Optional[str] = None
    description_ar: Optional[str] = None


class BotMenuUpdate(BaseModel):
    label: Optional[str] = None
    action: Optional[str] = None
    menu_type: Optional[str] = None
    sort_order: Optional[int] = None
    is_enabled: Optional[bool] = None
    icon: Optional[str] = None
    description_ar: Optional[str] = None


class BotMenuReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class BotMenuReorderPayload(BaseModel):
    items: List[BotMenuReorderItem]


class MessageTemplateUpdate(BaseModel):
    title_ar: Optional[str] = None
    content_ar: str
    is_active: Optional[bool] = True


class TemplatePreviewRequest(BaseModel):
    template_key: str
    content_ar: Optional[str] = None
    sample_data: Optional[Dict[str, Any]] = None


class TemplateTestSendRequest(BaseModel):
    template_key: str
    content_ar: Optional[str] = None
    chat_id: Optional[str] = None


# ── Status & Configuration ────────────────────────────────────────────

@router.get("/status")
def get_telegram_status(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve Telegram Bot integration readiness and configuration status."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    is_cfg, bot_token, bot_username = get_telegram_config(db, target_cid)

    # Get integration config record
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    # Mask token
    masked_token = None
    if bot_token:
        masked_token = f"{bot_token[:6]}...{bot_token[-4:]}" if len(bot_token) > 10 else "******"

    # Count statistics
    linked_count = db.query(TelegramUserLink).filter(
        TelegramUserLink.company_id == target_cid,
        TelegramUserLink.is_verified == True,
    ).count()

    total_employees = db.query(Employee).filter(
        Employee.company_id == target_cid,
        Employee.employment_status == "Active",
    ).count()

    outbox_pending = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == target_cid,
        NotificationOutbox.status == "Pending",
    ).count()

    outbox_sent = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == target_cid,
        NotificationOutbox.status == "Sent",
    ).count()

    outbox_failed = db.query(NotificationOutbox).filter(
        NotificationOutbox.company_id == target_cid,
        NotificationOutbox.status == "Failed",
    ).count()

    rules = (cfg.config_data or {}) if cfg else {}
    chat_id = rules.get("chat_id", "")

    return success_response(data={
        "is_configured": is_cfg,
        "status": cfg.status if (cfg and cfg.status) else ("Live (Connected)" if is_cfg else "Ready (Prepared)"),
        "readiness_summary": "بنية Telegram Bot جاهزة بالكامل (Transactional Outbox، التحقق بـ Token، والربط بالمهام). يمكنك ربط البوت مباشرة أو حفظ رمز الاعتماد.",
        "bot_username": bot_username,
        "bot_token_masked": masked_token,
        "has_bot_token": bool(bot_token),
        "chat_id": chat_id,
        "is_enabled": cfg.is_enabled if cfg else False,
        "last_tested_at": cfg.last_tested_at if cfg else None,
        "last_error": cfg.last_error if cfg else None,
        "worker_status": get_telegram_worker_status(),
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
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update Telegram Bot token, username, chat_id, and notification rules."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    if not cfg:
        cfg = IntegrationConfig(
            company_id=target_cid,
            service_name="telegram",
            display_name="إشعارات تليجرام الفورية (Telegram Bot)",
            is_enabled=False,
            config_data={},
            status="Not Configured",
        )
        db.add(cfg)
        db.flush()

    from sqlalchemy.orm.attributes import flag_modified

    current_data = dict(cfg.config_data or {})

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

    if payload.chat_id is not None:
        current_data["chat_id"] = payload.chat_id.strip()

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
    flag_modified(cfg, "config_data")
    db.commit()

    return success_response(message="تم تحديث إعدادات تكامل Telegram بنجاح")


@router.post("/test-connection")
def test_telegram_connection_endpoint(
    payload: Optional[TestConnectionRequest] = None,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Test connection to Telegram Bot API by calling getMe."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    bot_token = ""
    if payload and payload.bot_token and payload.bot_token.strip():
        bot_token = payload.bot_token.strip()
    elif cfg and cfg.config_data:
        bot_token = cfg.config_data.get("bot_token", "").strip()

    if not bot_token:
        # Check env
        env_tok = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if env_tok:
            bot_token = env_tok

    if not bot_token:
        raise HTTPException(status_code=400, detail="يرجى إدخال رمز Bot Token لاختبار الاتصال")

    result = test_telegram_connection(bot_token)
    now = datetime.utcnow()

    if cfg:
        cfg.last_tested_at = now
        if result.get("success"):
            cfg.status = "Connected"
            cfg.last_error = None
            if result.get("bot", {}).get("username"):
                cdata = dict(cfg.config_data or {})
                cdata["bot_username"] = result["bot"]["username"]
                cfg.config_data = cdata
                flag_modified(cfg, "config_data")
        else:
            cfg.status = "Error"
            cfg.last_error = result.get("message")
        db.commit()

    if not result.get("success"):
        return success_response(data=result, message=result.get("message"))
    return success_response(data=result, message=result.get("message"))


@router.post("/test-notification")
def send_test_notification_endpoint(
    payload: Optional[TestNotificationRequest] = None,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Send a real test notification to the configured chat_id or linked employee."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == target_cid,
        IntegrationConfig.service_name == "telegram",
    ).first()

    is_cfg, bot_token, bot_username = get_telegram_config(db, target_cid)
    if not bot_token:
        raise HTTPException(status_code=400, detail="يرجى حفظ أو إدخال رمز Bot Token أولاً")

    chat_id = None
    if payload and payload.chat_id and payload.chat_id.strip():
        chat_id = payload.chat_id.strip()
    elif cfg and cfg.config_data and cfg.config_data.get("chat_id"):
        chat_id = cfg.config_data.get("chat_id").strip()
    elif payload and payload.employee_id:
        link = db.query(TelegramUserLink).filter(
            TelegramUserLink.employee_id == payload.employee_id,
            TelegramUserLink.is_verified == True,
        ).first()
        if link and link.telegram_chat_id:
            chat_id = link.telegram_chat_id
    else:
        # Check if current user is linked to an employee
        emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
        if emp:
            link = db.query(TelegramUserLink).filter(
                TelegramUserLink.employee_id == emp.id,
                TelegramUserLink.is_verified == True,
            ).first()
            if link and link.telegram_chat_id:
                chat_id = link.telegram_chat_id

    if not chat_id:
        raise HTTPException(
            status_code=400,
            detail="يرجى تحديد معرّف المحادثة (Chat ID) لإرسال رسالة الاختبار، أو ربط حساب تليجرام للموظف",
        )

    msg_text = (
        payload.custom_message
        if (payload and payload.custom_message)
        else (
            f"🔔 <b>رسالة اختبارية من منصة Investor Gate OS</b>\n\n"
            f"✅ تم تأكيد الاتصال بنجاح مع بوت تليجرام (@{bot_username}).\n"
            f"📅 التاريخ: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC\n"
            f"👤 المرسل: {current_user.username}\n\n"
            f"<i>نظام Investor Gate لإدارة العمليات التقنية والأصول</i>"
        )
    )

    res = send_telegram_direct_message(bot_token=bot_token, chat_id=chat_id, text=msg_text)

    # Log in integration log
    log_entry = IntegrationLog(
        company_id=target_cid,
        service_name="telegram",
        event_type="test.notification",
        payload={"chat_id": chat_id, "sent_by": current_user.username},
        status="Success" if res.get("success") else "Failed",
        response_data=res,
        error_message=None if res.get("success") else res.get("message"),
    )
    db.add(log_entry)
    db.commit()

    if not res.get("success"):
        return success_response(data=res, message=res.get("message"))
    return success_response(data=res, message=res.get("message"))


# ── Employee Account Linking ──────────────────────────────────────────

@router.get("/links/list")
def list_employee_telegram_links(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List all employees in target company with their rich Telegram link status."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    employees = (
        db.query(Employee)
        .filter(Employee.company_id == target_cid, Employee.employment_status == "Active")
        .order_by(Employee.full_name.asc())
        .all()
    )

    links_by_emp_id = {
        l.employee_id: l
        for l in db.query(TelegramUserLink).filter(TelegramUserLink.company_id == target_cid).all()
    }

    _, _, bot_username = get_telegram_config(db, target_cid)

    data = []
    for emp in employees:
        link = links_by_emp_id.get(emp.id)
        is_linked = bool(link and link.is_verified)
        is_pending = bool(link and not link.is_verified and link.token_expires_at > datetime.utcnow())

        branch_name = getattr(emp.branch, "branch_name", None) if getattr(emp, "branch", None) else None
        department_name = getattr(emp.department, "department_name", None) if getattr(emp, "department", None) else None

        last_action = None
        if link and link.telegram_user_id:
            act = (
                db.query(TelegramActionLog)
                .filter(TelegramActionLog.telegram_user_id == link.telegram_user_id)
                .order_by(TelegramActionLog.created_at.desc())
                .first()
            )
            if act:
                last_action = act.created_at.isoformat()

        data.append({
            "employee_id": str(emp.id),
            "employee_number": emp.employee_number,
            "full_name": emp.full_name,
            "job_title": emp.job_title,
            "email": emp.email,
            "phone": emp.phone,
            "branch_name": branch_name or "الفرع الرئيسي",
            "department_name": department_name or "عام",
            "is_linked": is_linked,
            "is_pending_verification": is_pending,
            "telegram_username": link.telegram_username if link else None,
            "telegram_chat_id": link.telegram_chat_id if link else None,
            "telegram_user_id": link.telegram_user_id if link else None,
            "linked_at": link.linked_at.isoformat() if (link and link.is_verified and link.linked_at) else None,
            "token_expires_at": link.token_expires_at.isoformat() if (link and not link.is_verified and link.token_expires_at) else None,
            "last_interaction_at": last_action or (link.linked_at.isoformat() if (link and link.linked_at) else None),
            "bot_username": bot_username,
        })

    return success_response(data=data)


@router.post("/links/generate-token")
def create_link_token(
    payload: GenerateTokenRequest,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Generate a single-use expiring verification token for linking an employee."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != target_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة موظفي شركة أخرى")

    try:
        result = generate_telegram_link_token(
            db=db, employee_id=emp.id, company_id=emp.company_id,
            expires_in_minutes=payload.expires_in_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return success_response(data=result, message="تم توليد رمز الربط بنجاح (صالح لمدة 30 دقيقة)")


@router.post("/links/verify")
def verify_link(
    payload: VerifyTokenRequest,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Verify an employee Telegram token (used by Bot or Admin manual binding)."""
    candidate = db.query(TelegramUserLink).filter(TelegramUserLink.verification_token == payload.token.strip()).first()
    if candidate and candidate.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة الربط في هذه المنشأة")
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


@router.get("/links/{employee_id}/status")
def get_employee_link_status(
    employee_id: uuid.UUID,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Check live Telegram link verification status for an employee (for frontend live polling)."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != target_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لموظفي شركة أخرى")

    link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()
    _, _, bot_username = get_telegram_config(db, target_cid)

    now = datetime.utcnow()
    is_verified = bool(link and link.is_verified)
    is_pending = bool(link and not link.is_verified and link.token_expires_at > now)
    last_error = None
    last_result = None
    if link and not is_verified:
        token_ref = hashlib.sha256(link.verification_token.encode()).hexdigest()
        attempts = db.query(TelegramActionLog).filter(
            TelegramActionLog.company_id == link.company_id,
            TelegramActionLog.action == "verify_telegram_link",
        ).order_by(TelegramActionLog.created_at.desc()).all()
        attempt = next((a for a in attempts if (a.details or {}).get("employee_id") == str(emp.id)
                        and (a.details or {}).get("token_ref") == token_ref), None)
        if attempt:
            last_error, last_result = attempt.error_message, attempt.status

    return success_response(data={
        "employee_id": str(emp.id),
        "employee_name": emp.full_name,
        "is_verified": is_verified,
        "is_pending": is_pending,
        "expires_at": link.token_expires_at.isoformat() if link else None,
        "last_error": last_error,
        "last_result": last_result,
        "worker_status": get_telegram_worker_status(),
        "telegram_username": link.telegram_username if link else None,
        "telegram_chat_id": link.telegram_chat_id if link else None,
        "telegram_user_id": link.telegram_user_id if link else None,
        "linked_at": link.linked_at.isoformat() if (link and link.is_verified and link.linked_at) else None,
        "bot_username": bot_username,
    })


@router.delete("/links/{employee_id}")
def unlink_employee(
    employee_id: uuid.UUID,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Unlink an employee's Telegram account."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != target_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة موظفي شركة أخرى")

    success = unlink_employee_telegram(db, employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="لا يوجد ربط تليجرام مسجل لهذا الموظف")

    return success_response(message="تم إلغاء ربط حساب التليجرام بنجاح")


def get_crm_max_permitted_modules(user: Optional[User], employee: Employee, db: Session) -> List[str]:
    return [m for m, actions in crm_grants(user, employee.company_id, db).items() if 'view' in actions]


@router.get("/links/{employee_id}/details")
def get_employee_telegram_details(
    employee_id: uuid.UUID,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve full Telegram connection, RBAC permissions, and audit logs for an employee."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != target_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لموظفي شركة أخرى")

    link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()
    _, _, bot_username = get_telegram_config(db, target_cid)

    # Resolve associated User & Membership
    user = None
    if link and link.user_id:
        user = db.query(User).filter(User.id == link.user_id).first()
    if not user:
        user = db.query(User).filter(User.employee_id == emp.id).first()
    if not user and emp.email:
        user = db.query(User).filter(User.email == emp.email).first()

    roles = []
    if user:
        roles = get_user_roles(user, db, emp.company_id)
    if not roles:
        roles.append("Employee")

    max_modules = get_crm_max_permitted_modules(user, emp, db)
    current_allowed = link.allowed_modules if (link and link.allowed_modules is not None) else max_modules
    maximum = crm_grants(user, emp.company_id, db)

    # Load recent activity logs
    activity_logs = []
    if link and link.telegram_user_id:
        logs = (
            db.query(TelegramActionLog)
            .filter(
                TelegramActionLog.company_id == emp.company_id,
                TelegramActionLog.telegram_user_id == link.telegram_user_id,
            )
            .order_by(TelegramActionLog.created_at.desc())
            .limit(15)
            .all()
        )
        for lg in logs:
            activity_logs.append({
                "id": str(lg.id),
                "action": lg.action,
                "status": lg.status,
                "created_at": lg.created_at.isoformat() if lg.created_at else None,
                "error_message": lg.error_message,
                "ip_address": lg.ip_address,
                "details": lg.details,
            })

    modules_meta = [
        {"id": "tasks", "name": "المهام التشغيلية", "description": "استعراض وتحديث وتأكيد استلام المهام المسندة"},
        {"id": "tickets", "name": "تذاكر الدعم الفني", "description": "استعراض ومتابعة تذاكر الدعم الفني الخاصة بالموظف"},
        {"id": "custody", "name": "العهدة والأجهزة", "description": "استعراض الأجهزة والعهد التقنية المسلمة للموظف"},
        {"id": "assets", "name": "الأصول التقنية", "description": "استعراض أصول المنشأة الفنية وحالتها (للفنيين والمدراء)"},
        {"id": "subscriptions", "name": "الاشتراكات والتراخيص", "description": "استعراض اشتراكات البرمجيات وتواريخ التجديد (للفنيين والمدراء)"},
        {"id": "reports", "name": "تقارير العمليات", "description": "استعراض المؤشرات اللحظية لأداء العمليات (للإدارة فقط)"},
        {"id": "notifications", "name": "سجل الإشعارات", "description": "استعراض أحدث التنبيهات والإشعارات الواردة"},
        {"id": "search", "name": "البحث الفوري", "description": "إمكانية البحث السريع في السجلات المصرح بها"},
    ]

    return success_response(data={
        "employee": {
            "id": str(emp.id),
            "full_name": emp.full_name,
            "job_title": emp.job_title or "موظف",
            "department": emp.department.department_name if emp.department else None,
            "email": emp.email,
            "phone": emp.phone,
        },
        "link": {
            "is_verified": bool(link and link.is_verified),
            "telegram_username": link.telegram_username if link else None,
            "telegram_chat_id": link.telegram_chat_id if link else None,
            "telegram_user_id": link.telegram_user_id if link else None,
            "linked_at": link.linked_at.isoformat() if (link and link.linked_at) else None,
            "notifications_enabled": getattr(link, "notifications_enabled", True) if link else True,
            "allowed_modules": current_allowed,
            "permission_policy": policy_for(link),
            "data_scope": getattr(link, "data_scope", "Self") or "Self",
            "notification_preferences": getattr(link, "notification_preferences", None) or {
                "task_assigned": True,
                "task_status_changed": True,
                "ticket_created": True,
                "overdue_alerts": True,
            },
        },
        "user": {
            "user_id": str(user.id) if user else None,
            "username": user.username if user else None,
            "account_status": user.account_status if user else "Not Created",
            "is_superadmin": bool(user and user.is_superadmin),
            "roles": roles,
        },
        "permissions_matrix": {
            "maximum_actions": maximum,
            "effective_actions": effective_grants(link, maximum),
            "maximum_scope": maximum_scope(user, emp.company_id, db),
            "can_manage": has_module_permission(current_user, 'users', 'manage_access', emp.company_id, db),
            "max_permitted_modules": max_modules,
            "available_modules": modules_meta,
            "available_scopes": [
                {"id": "Self", "name": "بيانات الموظف فقط (Self-only)", "description": "يصل الموظف فقط لمهامه وتذاكره وعهدته الشخصية"},
                {"id": "Branch", "name": "فرع الموظف الحالي (Branch-wide)", "description": "يصل الموظف للأصول والمهام ضمن فرعه المسجل"},
                {"id": "Company", "name": "كامل المنشأة (Company-wide)", "description": "يصل الموظف لبيانات المنشأة بالكامل (للفنيين والمدراء)"},
            ],
            "role_templates": [
                {
                    "id": "employee",
                    "name": "قالب موظف قياسي",
                    "data_scope": "Self",
                    "modules": ["tasks", "tickets", "custody", "notifications", "search"],
                    "description": "استعراض المهام المسندة والتذاكر والعهدة الشخصية فقط",
                },
                {
                    "id": "technician",
                    "name": "قالب فني دعم وتقنية",
                    "data_scope": "Branch",
                    "modules": ["tasks", "tickets", "custody", "assets", "subscriptions", "notifications", "search"],
                    "description": "إدارة الأصول وتذاكر الدعم والاشتراكات والمهام الفنية",
                },
                {
                    "id": "manager",
                    "name": "قالب مدير عمليات وتقنية",
                    "data_scope": "Company",
                    "modules": ["tasks", "tickets", "custody", "assets", "subscriptions", "reports", "notifications", "search"],
                    "description": "صلاحية شاملة تشمل التقارير ومؤشرات العمليات اللحظية",
                },
            ],
        },
        "bot_username": bot_username,
        "activity_logs": activity_logs,
    })


@router.put("/links/{employee_id}/permissions")
def update_employee_telegram_permissions(
    employee_id: uuid.UUID,
    payload: UpdateTelegramPermissionsRequest,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update Telegram module access and notification preferences with strict CRM RBAC enforcement."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not current_user.is_superadmin and emp.company_id != target_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لموظفي شركة أخرى")

    link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="حساب Telegram غير مرتبط بهذا الموظف")

    # Resolve user and membership to verify CRM maximum capabilities
    user = None
    if link.user_id:
        user = db.query(User).filter(User.id == link.user_id).first()
    if not user:
        user = db.query(User).filter(User.employee_id == emp.id).first()

    max_permitted = get_crm_max_permitted_modules(user, emp, db)
    if not has_module_permission(current_user, 'users', 'manage_access', emp.company_id, db):
        raise HTTPException(status_code=403, detail='ليس لديك صلاحية إدارة وصول المستخدمين في هذه المنشأة')
    maximum = crm_grants(user, emp.company_id, db)
    policy = dict(policy_for(link))
    if payload.actions is not None:
        if any(m not in maximum or any(a not in maximum[m] for a in acts) for m, acts in payload.actions.items()):
            raise HTTPException(status_code=400, detail='الإجراءات تتجاوز صلاحيات CRM')
        policy['actions'] = payload.actions
    if payload.data_scope is not None:
        if payload.data_scope == 'Company' and maximum_scope(user, emp.company_id, db) != 'Company':
            raise HTTPException(status_code=400, detail='نطاق البيانات يتجاوز صلاحيات CRM')
        policy['scope'] = payload.data_scope
    if payload.role_template is not None:
        policy['template'] = payload.role_template

    if payload.allowed_modules is not None:
        # Enforce that Telegram permissions NEVER exceed CRM permissions
        excess = [m for m in payload.allowed_modules if m not in max_permitted]
        if excess:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن منح صلاحيات تيليجرام تتجاوز صلاحيات المستخدم في النظام. الوحدات غير المسموح بها لدور الموظف: {', '.join(excess)}"
            )
        link.allowed_modules = payload.allowed_modules

    if payload.notification_preferences is not None:
        link.notification_preferences = {k: v for k, v in payload.notification_preferences.items() if k != POLICY_KEY}

    link.notification_preferences = {**(link.notification_preferences or {}), POLICY_KEY: policy}

    if payload.notifications_enabled is not None:
        link.notifications_enabled = payload.notifications_enabled

    if payload.data_scope is not None:
        if payload.data_scope not in ("Self", "Branch", "Company"):
            raise HTTPException(status_code=400, detail="نطاق الوصول للبيانات غير صالح. الخيارات المتاحة: Self, Branch, Company")
        link.data_scope = payload.data_scope

    db.add(TelegramActionLog(
        company_id=emp.company_id,
        telegram_user_id=link.telegram_user_id or "admin_action",
        telegram_chat_id=link.telegram_chat_id,
        action="update_telegram_permissions",
        status="Success",
        details={
            "updated_by": current_user.username,
            "permission_policy": policy,
            "allowed_modules": link.allowed_modules,
            "data_scope": link.data_scope,
            "notifications_enabled": link.notifications_enabled,
        },
        ip_address="internal_api",
    ))
    db.commit()

    return success_response(
        data={
            "allowed_modules": link.allowed_modules,
            "data_scope": link.data_scope,
            "notification_preferences": link.notification_preferences,
            "notifications_enabled": link.notifications_enabled,
        },
        message="تم تحديث صلاحيات وإعدادات تيليجرام للموظف بنجاح"
    )


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
            "telegram_api_result": (i.payload or {}).get("telegram_api_result"),
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
    expected_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if not expected_secret or not x_telegram_bot_api_secret_token or not secrets.compare_digest(expected_secret, x_telegram_bot_api_secret_token):
        raise HTTPException(status_code=403, detail="Webhook authentication required")
    if os.getenv('TELEGRAM_UPDATE_MODE', 'polling') != 'webhook':
        raise HTTPException(status_code=409, detail='Webhook receiver disabled in polling mode')
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
    if not bot_token:
        raise HTTPException(status_code=503, detail='Webhook bot identity is not configured')
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    from app.workers.telegram_poller import process_telegram_update
    process_telegram_update(db, bot_token, body)
    return {'ok': True}



# ── No-Code Telegram Bot Menu Builder ────────────────────────────────────────

@router.get("/menu")
def get_bot_menu(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve all configured bot menu buttons and commands for the company."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    items = get_or_create_default_menu_configs(db, target_cid)
    data = [
        {
            "id": str(i.id),
            "company_id": str(i.company_id),
            "label": i.label,
            "action": i.action,
            "menu_type": i.menu_type,
            "sort_order": i.sort_order,
            "is_enabled": i.is_enabled,
            "icon": i.icon,
            "description_ar": i.description_ar,
        }
        for i in items
    ]
    return success_response(data=data)


@router.post("/menu")
def create_bot_menu_item(
    payload: BotMenuCreate,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new bot menu button or command."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    item = TelegramBotMenuConfig(
        company_id=target_cid,
        label=payload.label.strip(),
        action=payload.action.strip(),
        menu_type=payload.menu_type,
        sort_order=payload.sort_order or 0,
        is_enabled=payload.is_enabled if payload.is_enabled is not None else True,
        icon=payload.icon,
        description_ar=payload.description_ar,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(
        data={"id": str(item.id), "label": item.label, "action": item.action},
        message="تمت إضافة زر القائمة بنجاح",
    )


@router.put("/menu/{menu_id}")
def update_bot_menu_item(
    menu_id: uuid.UUID,
    payload: BotMenuUpdate,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update a bot menu button configuration."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    item = db.query(TelegramBotMenuConfig).filter(
        TelegramBotMenuConfig.id == menu_id,
        TelegramBotMenuConfig.company_id == target_cid,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="عنصر القائمة غير موجود")

    if payload.label is not None:
        item.label = payload.label.strip()
    if payload.action is not None:
        item.action = payload.action.strip()
    if payload.menu_type is not None:
        item.menu_type = payload.menu_type
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order
    if payload.is_enabled is not None:
        item.is_enabled = payload.is_enabled
    if payload.icon is not None:
        item.icon = payload.icon
    if payload.description_ar is not None:
        item.description_ar = payload.description_ar

    db.commit()
    db.refresh(item)
    return success_response(message="تم تحديث عنصر القائمة بنجاح")


@router.delete("/menu/{menu_id}")
def delete_bot_menu_item(
    menu_id: uuid.UUID,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Delete a bot menu item."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    item = db.query(TelegramBotMenuConfig).filter(
        TelegramBotMenuConfig.id == menu_id,
        TelegramBotMenuConfig.company_id == target_cid,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="عنصر القائمة غير موجود")

    db.delete(item)
    db.commit()
    return success_response(message="تم حذف عنصر القائمة بنجاح")


@router.post("/menu/reorder")
def reorder_bot_menu(
    payload: BotMenuReorderPayload,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Batch reorder bot menu buttons."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    for itm in payload.items:
        db.query(TelegramBotMenuConfig).filter(
            TelegramBotMenuConfig.id == itm.id,
            TelegramBotMenuConfig.company_id == target_cid,
        ).update({"sort_order": itm.sort_order})

    db.commit()
    return success_response(message="تمت إعادة ترتيب القائمة بنجاح")


@router.post("/menu/publish")
def publish_bot_menu(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Publish bot commands to Telegram Bot API (setMyCommands)."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    is_cfg, bot_token, _ = get_telegram_config(db, target_cid)
    if not is_cfg or not bot_token:
        raise HTTPException(status_code=400, detail="يجب تهيئة وحفظ Bot Token أولاً لنشر الأوامر")

    items = (
        db.query(TelegramBotMenuConfig)
        .filter(TelegramBotMenuConfig.company_id == target_cid, TelegramBotMenuConfig.is_enabled == True)
        .order_by(TelegramBotMenuConfig.sort_order.asc())
        .all()
    )

    commands = []
    for item in items:
        # Commands must be lowercase alphanumeric
        cmd_name = item.action.replace("cmd:", "").replace("act:", "").replace("/", "").strip().lower()
        if not cmd_name or len(cmd_name) > 32:
            continue
        commands.append({
            "command": cmd_name,
            "description": (item.description_ar or item.label)[:256],
        })

    if not commands:
        commands = [
            {"command": "tasks", "description": "عرض مهامي التشغيلية النشطة"},
            {"command": "tickets", "description": "عرض تذاكر الدعم الفني"},
            {"command": "help", "description": "دليل المساعدة والأوامر"},
        ]

    res = publish_bot_commands_to_telegram(bot_token, commands)
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=res.get("message"))
    return success_response(data=res, message="تم نشر وتحديث أوامر البوت على خوادم Telegram بنجاح!")


# ── Configurable Arabic Message Templates ─────────────────────────────────────

@router.get("/templates")
def get_message_templates(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve all configurable message templates for the company."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    templates = get_or_create_default_message_templates(db, target_cid)
    data = [
        {
            "id": str(t.id),
            "company_id": str(t.company_id),
            "template_key": t.template_key,
            "title_ar": t.title_ar,
            "content_ar": t.content_ar,
            "is_active": t.is_active,
        }
        for t in templates
    ]
    return success_response(data=data)


@router.put("/templates/{template_key}")
def update_message_template(
    template_key: str,
    payload: MessageTemplateUpdate,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update message template text and status."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    get_or_create_default_message_templates(db, target_cid)
    tmpl = db.query(TelegramMessageTemplate).filter(
        TelegramMessageTemplate.company_id == target_cid,
        TelegramMessageTemplate.template_key == template_key,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="القالب غير موجود")

    if payload.title_ar is not None:
        tmpl.title_ar = payload.title_ar.strip()
    tmpl.content_ar = payload.content_ar.strip()
    if payload.is_active is not None:
        tmpl.is_active = payload.is_active

    db.commit()
    db.refresh(tmpl)
    return success_response(message=f"تم حفظ وتحديث قالب '{tmpl.title_ar}' بنجاح")


@router.post("/templates/{template_key}/preview")
def preview_message_template(
    template_key: str,
    payload: TemplatePreviewRequest,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Render a preview of the message template with sample placeholder values."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    raw_content = payload.content_ar
    if not raw_content:
        tmpl = db.query(TelegramMessageTemplate).filter(
            TelegramMessageTemplate.company_id == target_cid,
            TelegramMessageTemplate.template_key == template_key,
        ).first()
        raw_content = tmpl.content_ar if tmpl else ""

    sample_context = {
        "employee_name": "سعود القحطاني",
        "company_name": "شركة بوابة المستثمر",
        "branch_name": "الفرع الرئيسي - الرياض",
        "department_name": "إدارة تقنية المعلومات",
        "task_title": "تحديث خادم البنية التحتية الرئيسي",
        "priority": "حرجة وعاجلة 🔴",
        "due_date": "2026-11-20",
        "description": "ترقية حزم الأمان وضبط إعدادات الشبكة ومراقبة استهلاك الموارد.",
        "new_status": "قيد التنفيذ 🚀",
        "actor_name": current_user.username,
        **(payload.sample_data or {}),
    }

    rendered = render_template(raw_content, sample_context)
    return success_response(data={"rendered": rendered, "template_key": template_key})


@router.post("/templates/{template_key}/test-send")
def test_send_template(
    template_key: str,
    payload: TemplateTestSendRequest,
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Send a rendered template test message to Telegram."""
    target_cid = resolve_telegram_company(current_user, active_cid, company_id, db)
    is_cfg, bot_token, _ = get_telegram_config(db, target_cid)
    if not is_cfg or not bot_token:
        raise HTTPException(status_code=400, detail="يجب ضبط Bot Token أولاً")

    chat_id = payload.chat_id
    if not chat_id:
        cfg = db.query(IntegrationConfig).filter(
            IntegrationConfig.company_id == target_cid,
            IntegrationConfig.service_name == "telegram",
        ).first()
        chat_id = (cfg.config_data or {}).get("chat_id") if cfg else None

    if not chat_id:
        raise HTTPException(status_code=400, detail="يرجى إدخال معرّف المحادثة (Chat ID) المستهدف")

    raw_content = payload.content_ar
    if not raw_content:
        tmpl = db.query(TelegramMessageTemplate).filter(
            TelegramMessageTemplate.company_id == target_cid,
            TelegramMessageTemplate.template_key == template_key,
        ).first()
        raw_content = tmpl.content_ar if tmpl else ""

    sample_context = {
        "employee_name": current_user.username,
        "company_name": "بوابة المستثمر",
        "branch_name": "الفرع الرئيسي",
        "department_name": "تقنية المعلومات",
        "task_title": "مهمة اختبار القالب التفاعلي",
        "priority": "عاجلة 🟠",
        "due_date": "2026-11-15",
        "description": "تجربة إرسال القالب من لوحة الإعدادات.",
        "new_status": "قيد المراجعة 🔍",
        "actor_name": current_user.username,
    }

    rendered = render_template(raw_content, sample_context)
    res = send_telegram_direct_message(bot_token, chat_id, rendered)
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=res.get("message"))
    return success_response(data=res, message="تم إرسال نموذج القالب بنجاح إلى حساب تليجرام!")
