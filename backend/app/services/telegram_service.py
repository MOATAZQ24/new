"""Telegram Bot Integration Service & Outbox Dispatcher.
Implements:
- Transactional Notification Outbox
- Single-use expiring employee verification tokens
- Task event notifications (assigned, accepted, started, completed, overdue, reassigned)
- Interactive inline keyboards
- Asynchronous dispatcher with retry mechanism, idempotency, and offline resilience
- Inbound callback & bot action processing with RBAC, ownership, and valid state transitions
"""

import os
import uuid
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
import urllib.request
import urllib.parse
import json

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.telegram import (
    TelegramUserLink,
    NotificationOutbox,
    TelegramActionLog,
    TelegramBotMenuConfig,
    TelegramMessageTemplate,
)
from app.models.task import Task
from app.models.user import Employee, User
from app.models.integration import IntegrationConfig

logger = logging.getLogger(__name__)

# System-wide or environment bot token fallback
TELEGRAM_BOT_TOKEN_ENV = os.getenv("TELEGRAM_BOT_TOKEN", "")


def get_telegram_config(db: Session, company_id: uuid.UUID) -> Tuple[bool, str, str]:
    """Retrieve Telegram bot configuration for a company.
    Returns: (is_configured, bot_token, bot_username)
    """
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == company_id,
        IntegrationConfig.service_name == "telegram",
    ).first()

    bot_token = ""
    bot_username = "InvestorGateBot"

    if cfg and cfg.config_data:
        bot_token = cfg.config_data.get("bot_token", "").strip()
        bot_username = cfg.config_data.get("bot_username", "InvestorGateBot").strip() or "InvestorGateBot"

    if not bot_token and TELEGRAM_BOT_TOKEN_ENV:
        bot_token = TELEGRAM_BOT_TOKEN_ENV.strip()

    is_configured = bool(bot_token and len(bot_token) > 15)
    return is_configured, bot_token, bot_username


def delete_telegram_webhook(bot_token: str, drop_pending_updates: bool = False) -> Dict[str, Any]:
    """Delete any registered webhook so getUpdates long-polling can operate without 409 Conflict."""
    clean_token = bot_token.strip()
    if not clean_token:
        return {"success": False, "message": "Bot token missing"}

    url = f"https://api.telegram.org/bot{clean_token}/deleteWebhook"
    payload = json.dumps({"drop_pending_updates": drop_pending_updates}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"success": bool(data.get("ok")), "message": data.get("description", "")}
    except Exception as e:
        return {"success": False, "message": str(e)}


def test_telegram_connection(bot_token: str) -> Dict[str, Any]:
    """Verify bot token validity by calling Telegram getMe API and clearing any conflicting webhook."""
    clean_token = bot_token.strip()
    if not clean_token:
        return {"success": False, "message": "لم يتم إدخال رمز Bot Token"}

    url = f"https://api.telegram.org/bot{clean_token}/getMe"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "InvestorGateOS/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                result = data.get("result", {})
                bot_user = result.get("username", "")
                bot_name = result.get("first_name", "")

                # Automatically clear any active webhook to allow seamless long-polling
                delete_telegram_webhook(clean_token)

                return {
                    "success": True,
                    "message": f"تم التحقق بنجاح! البوت @{bot_user} ({bot_name}) متصل وجاهز للعمل.",
                    "bot": {
                        "id": result.get("id"),
                        "username": bot_user,
                        "first_name": bot_name,
                        "can_join_groups": result.get("can_join_groups"),
                        "can_read_all_group_messages": result.get("can_read_all_group_messages"),
                    },
                }
            return {
                "success": False,
                "message": f"فشل التحقق: {data.get('description', 'استجابة غير صالحة من Telegram')}",
            }
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"success": False, "message": "رمز البوت غير صالح أو منتهي الصلاحية (401 Unauthorized). تأكد من نسخ الرمز بالكامل من @BotFather."}
        return {"success": False, "message": f"خطأ في خادم Telegram (HTTP {e.code}): {e.reason}"}
    except Exception as e:
        return {"success": False, "message": f"تعذر الاتصال بـ Telegram API: {str(e)}"}


def send_telegram_direct_message(bot_token: str, chat_id: str, text: str) -> Dict[str, Any]:
    """Send an immediate test notification message to a specific chat ID."""
    clean_token = bot_token.strip()
    clean_chat = str(chat_id).strip()

    if not clean_token:
        return {"success": False, "message": "رمز Bot Token مفقود"}
    if not clean_chat:
        return {"success": False, "message": "معرّف Chat ID مفقود"}

    url = f"https://api.telegram.org/bot{clean_token}/sendMessage"
    payload = {
        "chat_id": clean_chat,
        "text": text,
        "parse_mode": "HTML",
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                return {
                    "success": True,
                    "message": "تم إرسال رسالة الإشعار بنجاح إلى تليجرام!",
                    "message_id": data.get("result", {}).get("message_id"),
                }
            return {
                "success": False,
                "message": f"فشل إرسال الرسالة: {data.get('description', 'خطأ غير معروف')}",
            }
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
            desc = err_body.get("description", e.reason)
        except Exception:
            desc = e.reason

        # Retry without HTML formatting if entity parsing failed
        if "can't parse entities" in desc.lower() or "entity" in desc.lower():
            try:
                import re
                plain_text = re.sub(r"<[^<]+?>", "", text)
                plain_req = urllib.request.Request(
                    url,
                    data=json.dumps({"chat_id": clean_chat, "text": plain_text}).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS/1.0"},
                    method="POST",
                )
                with urllib.request.urlopen(plain_req, timeout=10.0) as resp2:
                    data2 = json.loads(resp2.read().decode("utf-8"))
                    if data2.get("ok"):
                        return {
                            "success": True,
                            "message": "تم إرسال رسالة الإشعار بنجاح إلى تليجرام (كنص عادي)!",
                            "message_id": data2.get("result", {}).get("message_id"),
                        }
            except Exception:
                pass

        if "chat not found" in desc.lower():
            return {
                "success": False,
                "message": "تعذر إرسال الإشعار: لم يتم العثور على المحادثة (Chat not found). تأكد أن المستخدم قام ببدء المحادثة مع البوت بالضغط على /start أولاً، وأن معرّف Chat ID رقمي وصحيح.",
            }
        if "bot was blocked by the user" in desc.lower():
            return {
                "success": False,
                "message": "تعذر إرسال الإشعار: قام المستخدم بحظر البوت (Bot was blocked by the user).",
            }
        return {"success": False, "message": f"خطأ في إرسال تليجرام ({e.code}): {desc}"}
    except Exception as e:
        return {"success": False, "message": f"تعذر إرسال الإشعار: {str(e)}"}


def get_telegram_worker_status() -> Dict[str, Any]:
    """Check whether the Telegram Long-Polling background daemon is active."""
    worker_status_file = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "workers", ".telegram_worker_status.json")
    )
    is_running = False
    last_heartbeat = None
    pid = None
    offset = 0
    mode = "Long-Polling (LAN Outbound)"

    if os.path.exists(worker_status_file):
        try:
            with open(worker_status_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                last_hb_str = data.get("last_heartbeat")
                pid = data.get("pid")
                offset = data.get("offset", 0)
                mode = data.get("mode", mode)

                if last_hb_str:
                    last_hb_dt = datetime.fromisoformat(last_hb_str)
                    age_seconds = (datetime.utcnow() - last_hb_dt).total_seconds()
                    # If heartbeat updated in the last 45 seconds, worker is actively running
                    if age_seconds < 45 and data.get("is_running", False):
                        is_running = True
                    last_heartbeat = last_hb_str
        except Exception as e:
            logger.debug(f"Failed to read worker status: {e}")

    return {
        "is_running": is_running,
        "status_label": "يعمل بنشاط (Active)" if is_running else "متوقف (Stopped)",
        "last_heartbeat": last_heartbeat,
        "pid": pid,
        "offset": offset,
        "mode": mode,
    }


# ── Employee Account Linking ──────────────────────────────────────────

def generate_telegram_link_token(
    db: Session,
    employee_id: uuid.UUID,
    company_id: uuid.UUID,
    user_id: Optional[uuid.UUID] = None,
    expires_in_minutes: int = 30,
) -> Dict[str, Any]:
    """Generate a single-use expiring verification token for an employee."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise ValueError("الموظف غير موجود")

    # If user_id not provided, resolve from employee
    if not user_id and emp.user:
        user_id = emp.user.id

    token = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(900000) + 100000}"  # 6-digit backup PIN
    full_token = f"{code}_{token}"
    expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)

    # Check if a link record already exists
    existing_link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()

    if existing_link:
        existing_link.verification_token = full_token
        existing_link.token_expires_at = expires_at
        existing_link.user_id = user_id or existing_link.user_id
        existing_link.company_id = company_id
        link_record = existing_link
    else:
        link_record = TelegramUserLink(
            employee_id=employee_id,
            user_id=user_id,
            company_id=company_id,
            verification_token=full_token,
            token_expires_at=expires_at,
            is_verified=False,
        )
        db.add(link_record)

    db.commit()
    db.refresh(link_record)

    _, _, bot_username = get_telegram_config(db, company_id)
    deep_link = f"https://t.me/{bot_username}?start={full_token}"

    return {
        "employee_id": str(employee_id),
        "employee_name": emp.full_name,
        "token": full_token,
        "pin_code": code,
        "bot_username": bot_username,
        "deep_link": deep_link,
        "expires_at": expires_at.isoformat(),
        "is_verified": link_record.is_verified,
        "telegram_username": link_record.telegram_username,
    }


def verify_telegram_link(
    db: Session,
    token: str,
    telegram_user_id: str,
    telegram_chat_id: str,
    telegram_username: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify an employee link token and bind the Telegram account."""
    now = datetime.utcnow()
    link = db.query(TelegramUserLink).filter(
        TelegramUserLink.verification_token == token.strip(),
    ).first()

    if not link:
        # Check by 6-digit PIN prefix
        clean_token = token.strip()
        link = db.query(TelegramUserLink).filter(
            TelegramUserLink.verification_token.startswith(f"{clean_token}_")
        ).first()

    if not link:
        raise ValueError("رمز التحقق غير صحيح أو غير موجود")

    if link.is_verified:
        raise ValueError("رمز التحقق تم استخدامه بالفعل مسبقاً (رمز أحادي الاستخدام)")

    if link.token_expires_at < now:
        raise ValueError("انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد من لوحة التحكم")

    # Strict 1:1 Identity Binding:
    # If this telegram account was previously linked to another employee in the company,
    # revoke the previous link immediately to prevent cross-account notifications.
    old_links = db.query(TelegramUserLink).filter(
        TelegramUserLink.company_id == link.company_id,
        TelegramUserLink.telegram_user_id == str(telegram_user_id),
        TelegramUserLink.id != link.id,
    ).all()
    for old in old_links:
        old.is_verified = False
        old.telegram_chat_id = None
        old.telegram_user_id = None
        old.telegram_username = None
        old.linked_at = None

    # Bind telegram details
    link.telegram_user_id = str(telegram_user_id)
    link.telegram_chat_id = str(telegram_chat_id)
    link.telegram_username = telegram_username.lstrip("@") if telegram_username else None
    link.is_verified = True
    link.linked_at = now

    db.commit()
    db.refresh(link)

    emp_name = link.employee.full_name if link.employee else "الموظف"
    company_name = link.company.company_name_ar if link.company else "الشركة"

    # Log verification action
    action_log = TelegramActionLog(
        company_id=link.company_id,
        telegram_user_id=str(telegram_user_id),
        telegram_chat_id=str(telegram_chat_id),
        action="verify_telegram_link",
        status="Success",
        details={
            "employee_id": str(link.employee_id),
            "employee_name": emp_name,
            "previous_links_revoked": len(old_links),
        },
    )
    db.add(action_log)
    db.commit()

    return {
        "success": True,
        "employee_name": emp_name,
        "company_name": company_name,
        "telegram_user_id": link.telegram_user_id,
        "telegram_chat_id": link.telegram_chat_id,
        "telegram_username": link.telegram_username,
        "linked_at": link.linked_at.isoformat(),
    }


def unlink_employee_telegram(db: Session, employee_id: uuid.UUID) -> bool:
    """Unlink an employee from Telegram, revoking bot access immediately without deleting employee or audit history."""
    link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()
    if not link:
        return False

    old_chat_id = link.telegram_chat_id
    old_tg_user = link.telegram_user_id

    link.is_verified = False
    link.telegram_chat_id = None
    link.telegram_user_id = None
    link.telegram_username = None
    link.linked_at = None
    # Reset token to prevent replay
    link.verification_token = secrets.token_urlsafe(24)

    # Log unlink action
    action_log = TelegramActionLog(
        company_id=link.company_id,
        telegram_user_id=old_tg_user or "unknown",
        telegram_chat_id=old_chat_id,
        action="unlink_employee",
        status="Success",
        details={"employee_id": str(employee_id), "unlinked_at": datetime.utcnow().isoformat()},
    )
    db.add(action_log)
    db.commit()
    return True


# ── Notification Formatting & Enqueuing ────────────────────────────────

def format_task_notification(task: Task, event_type: str, company_name: str) -> Tuple[str, Dict[str, Any]]:
    """Format rich Arabic text message and inline keyboard markup for a task event."""
    priority_labels = {
        "Low": "منخفضة 🟢",
        "Medium": "متوسطة 🟡",
        "High": "عالية 🟠",
        "Urgent": "حرجة وعاجلة 🔴",
    }
    p_text = priority_labels.get(task.priority, task.priority)
    due_str = task.due_date.strftime("%Y-%m-%d") if task.due_date else "غير محدد"
    task_id_str = str(task.id)

    event_titles = {
        "task.assigned": "📌 <b>تم إسناد مهمة تشغيلية جديدة إليك</b>",
        "task.accepted": "✅ <b>تم تأكيد وقبول المهمة</b>",
        "task.started": "🚀 <b>تم بدء العمل على المهمة</b>",
        "task.completed": "🏁 <b>اكتملت المهمة بنجاح</b>",
        "task.overdue": "⚠️ <b>تنبيه أمني: المهمة متأخرة عن موعدها المحدد!</b>",
        "task.reassigned": "🔄 <b>تمت إعادة إسناد المهمة التشغيلية</b>",
    }
    header = event_titles.get(event_type, f"🔔 <b>إشعار بالمهمة: {task.title}</b>")

    body_lines = [
        header,
        f"🏢 <b>المنشأة:</b> {company_name}",
        f"📝 <b>عنوان المهمة:</b> {task.title}",
        f"⚡ <b>الأولوية:</b> {p_text}",
        f"📊 <b>الحالة:</b> {task.status}",
        f"📅 <b>تاريخ الاستحقاق:</b> {due_str}",
    ]

    if task.description:
        desc_snippet = (task.description[:180] + "...") if len(task.description) > 180 else task.description
        body_lines.append(f"📄 <b>الوصف:</b> {desc_snippet}")

    body_lines.append("\n<i>نظام Investor Gate لإدارة العمليات التقنية</i>")
    message_text = "\n".join(body_lines)

    # Inline Keyboards
    if event_type in ("task.assigned", "task.reassigned"):
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "✅ قبول المهمة", "callback_data": f"act:accept:{task_id_str}"},
                    {"text": "🚀 بدء التنفيذ", "callback_data": f"act:start:{task_id_str}"},
                ],
                [
                    {"text": "📋 تفاصيل المهمة", "callback_data": f"act:info:{task_id_str}"},
                ],
            ]
        }
    elif event_type in ("task.accepted", "task.started"):
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "🏁 إكمال المهمة", "callback_data": f"act:done:{task_id_str}"},
                ],
                [
                    {"text": "📋 تفاصيل المهمة", "callback_data": f"act:info:{task_id_str}"},
                ],
            ]
        }
    else:
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "📋 تفاصيل المهمة", "callback_data": f"act:info:{task_id_str}"},
                    {"text": "📑 مهامي النشطة", "callback_data": "cmd:my_tasks"},
                ]
            ]
        }

    return message_text, reply_markup


def enqueue_task_notification(
    db: Session,
    task: Task,
    event_type: str,
    target_employee_id: Optional[uuid.UUID] = None,
    extra_payload: Optional[Dict[str, Any]] = None,
) -> Optional[NotificationOutbox]:
    """Enqueue a task notification into the transactional notification_outbox table.
    Ensures that task operations never fail even if Telegram is unconfigured or employee unlinked.
    """
    try:
        emp_id = target_employee_id or task.assigned_to_id
        if not emp_id:
            logger.info("No employee assigned to task %s; skipping telegram notification", task.id)
            return None

        # Look up link
        link = db.query(TelegramUserLink).filter(
            TelegramUserLink.employee_id == emp_id,
            TelegramUserLink.is_verified == True,
        ).first()

        company_name = task.company.company_name_ar if task.company else "شركة بوابة المستثمر"
        message_text, reply_markup = format_task_notification(task, event_type, company_name)

        chat_id = link.telegram_chat_id if link else None

        # Generate unique idempotency key
        now_ts = int(datetime.utcnow().timestamp())
        idempotency_key = f"{event_type}:{task.id}:{emp_id}:{now_ts}_{secrets.token_hex(4)}"

        payload = {
            "event_type": event_type,
            "task_id": str(task.id),
            "task_title": task.title,
            "task_status": task.status,
            "priority": task.priority,
            "employee_id": str(emp_id),
            "is_employee_linked": bool(link and link.is_verified),
            **(extra_payload or {}),
        }

        # Status is 'Pending' if linked, or 'Pending (Unlinked)' as non-blocking log
        initial_status = "Pending" if (link and chat_id) else "Skipped (Unlinked)"

        outbox_entry = NotificationOutbox(
            company_id=task.company_id,
            channel="telegram",
            recipient_chat_id=chat_id,
            event_type=event_type,
            payload=payload,
            message_text=message_text,
            reply_markup=reply_markup,
            status=initial_status,
            retry_count=0,
            max_retries=3,
            idempotency_key=idempotency_key,
            scheduled_at=datetime.utcnow(),
        )

        db.add(outbox_entry)
        db.flush()
        return outbox_entry
    except Exception as e:
        logger.error("Failed to enqueue task notification: %s", e)
        return None


# ── Asynchronous Outbox Dispatcher ────────────────────────────────────

def dispatch_outbox_notifications(db: Session, limit: int = 50) -> Dict[str, Any]:
    """Process pending outbox entries.
    If bot token is configured, sends to Telegram Bot API.
    If bot token is missing, flags as 'Ready (Awaiting Bot Token)' without error.
    """
    now = datetime.utcnow()
    pending_items = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.status == "Pending",
            NotificationOutbox.scheduled_at <= now,
            NotificationOutbox.retry_count < NotificationOutbox.max_retries,
        )
        .order_by(NotificationOutbox.scheduled_at.asc())
        .limit(limit)
        .all()
    )

    processed = 0
    sent = 0
    failed = 0
    ready_awaiting_token = 0

    for item in pending_items:
        processed += 1
        is_cfg, bot_token, _ = get_telegram_config(db, item.company_id)

        if not is_cfg or not bot_token:
            ready_awaiting_token += 1
            item.last_error = "جاهز للإرسال (بانتظار ضبط Bot Token في الإعدادات)"
            continue

        if not item.recipient_chat_id:
            item.status = "Failed"
            item.last_error = "لا يوجد chat_id مسجل للمستلم"
            failed += 1
            continue

        # Dispatch via Telegram Bot API
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        post_data = {
            "chat_id": item.recipient_chat_id,
            "text": item.message_text,
            "parse_mode": "HTML",
        }
        if item.reply_markup:
            post_data["reply_markup"] = item.reply_markup

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(post_data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                if resp.status in (200, 201):
                    item.status = "Sent"
                    item.sent_at = datetime.utcnow()
                    item.last_error = None
                    sent += 1
                else:
                    item.retry_count += 1
                    item.last_error = f"Telegram API returned status {resp.status}"
                    failed += 1
        except Exception as e:
            item.retry_count += 1
            item.last_error = f"Dispatch error: {str(e)}"
            if item.retry_count >= item.max_retries:
                item.status = "Failed"
            failed += 1

    db.commit()

    return {
        "processed": processed,
        "sent": sent,
        "failed": failed,
        "ready_awaiting_token": ready_awaiting_token,
    }


# ── Inbound Callback & Action Execution Engine ────────────────────────

def execute_bot_action(
    db: Session,
    telegram_user_id: str,
    telegram_chat_id: Optional[str],
    action_str: str,
    ip_address: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute an authenticated bot action (Accept Task, Start Task, Complete Task, My Tasks, Task Details).
    Enforces RBAC, company isolation, task ownership, and valid state transitions.
    """
    clean_user_id = str(telegram_user_id).strip()

    # 1. Authenticate sender link
    link = db.query(TelegramUserLink).filter(
        TelegramUserLink.telegram_user_id == clean_user_id,
        TelegramUserLink.is_verified == True,
    ).first()

    if not link and telegram_chat_id:
        link = db.query(TelegramUserLink).filter(
            TelegramUserLink.telegram_chat_id == str(telegram_chat_id).strip(),
            TelegramUserLink.is_verified == True,
        ).first()

    if not link:
        log_entry = TelegramActionLog(
            company_id=db.query(Task).first().company_id if db.query(Task).first() else uuid.uuid4(),
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else None,
            action=action_str,
            status="Unauthorized",
            error_message="حساب التليجرام غير مرتبط بأي موظف معتمد في النظام",
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
        return {
            "success": False,
            "status": "Unauthorized",
            "message": "⚠️ عذراً، حساب التليجرام الخاص بك غير مرتبط بحساب موظف معتمد. يرجى ربط حسابك أولاً من لوحة تحكم النظام.",
        }

    company_id = link.company_id
    emp_id = link.employee_id
    emp_name = link.employee.full_name if link.employee else "الموظف"

    # Check user role if linked user exists
    is_privileged = False
    if link.user:
        try:
            from app.core.security import get_user_roles
            roles = get_user_roles(link.user, db, company_id)
            is_privileged = any(r in ("Super Admin", "Company Admin", "IT Manager") for r in roles)
        except Exception:
            is_privileged = link.user.is_superadmin

    # 2. Parse action string
    parts = action_str.split(":")
    prefix = parts[0]
    action_name = parts[1] if len(parts) > 1 else prefix
    target_id_str = parts[2] if len(parts) > 2 else None

    # Handle 'cmd:my_tasks'
    if action_str == "cmd:my_tasks" or (prefix == "cmd" and action_name == "my_tasks"):
        tasks = (
            db.query(Task)
            .filter(
                Task.company_id == company_id,
                Task.assigned_to_id == emp_id,
                Task.status.in_([
                    "To Do", "In Progress", "On Hold",
                    "Assigned", "Accepted", "Blocked",
                    "Waiting for Response", "Submitted for Review", "Rework Required"
                ]),
            )
            .order_by(Task.due_date.asc().nullslast())
            .all()
        )

        log_entry = TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="my_tasks",
            status="Success",
            details={"tasks_count": len(tasks)},
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()

        if not tasks:
            return {
                "success": True,
                "status": "Success",
                "message": f"مرحباً {emp_name}، ليس لديك أي مهام تشغيلية قيد الانتظار حالياً! 🎉",
                "tasks": [],
            }

        task_lines = [f"📋 <b>مهامك النشطة يا {emp_name} ({len(tasks)} مهام):</b>\n"]
        for i, t in enumerate(tasks, 1):
            p_badge = "🔴" if t.priority == "Urgent" else ("🟠" if t.priority == "High" else "🟡")
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "غير محدد"
            task_lines.append(f"{i}. {p_badge} <b>{t.title}</b>\n   الحالة: {t.status} | الاستحقاق: {due}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(task_lines),
            "tasks": [{"id": str(t.id), "title": t.title, "status": t.status} for t in tasks],
        }

    # If action references a specific task
    if not target_id_str:
        return {
            "success": False,
            "status": "Failed",
            "message": "معرف المهمة مفقود في الطلب",
        }

    try:
        task_id = uuid.UUID(target_id_str)
    except ValueError:
        return {
            "success": False,
            "status": "Failed",
            "message": "معرف المهمة غير صالح",
        }

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return {
            "success": False,
            "status": "Failed",
            "message": "المهمة غير موجودة في النظام",
        }

    # 3. Enforce Company Isolation
    if task.company_id != company_id and not (link.user and link.user.is_superadmin):
        log_entry = TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action=action_name,
            task_id=task_id,
            status="Unauthorized",
            error_message="محاولة وصول لبيانات شركة أخرى (Cross-company violation)",
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
        return {
            "success": False,
            "status": "Unauthorized",
            "message": "⛔ غير مصرح لك بالوصول لمهام منشأة أخرى.",
        }

    # 4. Enforce Task Ownership & RBAC
    is_assignee = (task.assigned_to_id == emp_id)
    if not is_assignee and not is_privileged:
        log_entry = TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action=action_name,
            task_id=task_id,
            status="Unauthorized",
            error_message="الموظف ليس هو الفني المسند إليه المهمة ولا يملك صلاحية إدارية",
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
        return {
            "success": False,
            "status": "Unauthorized",
            "message": "⛔ هذه المهمة مسندة إلى فني آخر، وليس لديك صلاحية تعديلها.",
        }

    # 5. Execute Action State Machine Transitions
    log_status = "Success"
    error_msg = None
    response_msg = ""

    if action_name == "info":
        # Just return detailed summary
        due_str = task.due_date.strftime("%Y-%m-%d") if task.due_date else "غير محدد"
        response_msg = (
            f"📋 <b>تفاصيل المهمة #{task.title}</b>\n"
            f"🔹 <b>الحالة:</b> {task.status}\n"
            f"⚡ <b>الأولوية:</b> {task.priority}\n"
            f"📅 <b>الاستحقاق:</b> {due_str}\n"
            f"📄 <b>الوصف الكامل:</b> {task.description or 'لا يوجد وصف'}\n"
            f"👤 <b>المسؤول:</b> {emp_name}"
        )

    elif action_name == "accept":
        # Accept Task (from To Do -> In Progress)
        if task.status in ("Completed", "Cancelled"):
            log_status = "InvalidTransition"
            error_msg = f"لا يمكن قبول مهمة بحالة {task.status}"
            response_msg = f"⚠️ لا يمكن قبول المهمة لأنها بحالة: {task.status}"
        else:
            old_status = task.status
            task.status = "In Progress"
            db.commit()
            enqueue_task_notification(db, task, "task.accepted", extra_payload={"accepted_by": emp_name})
            response_msg = f"✅ شكراً لك يا {emp_name}، تم قبول المهمة بنجاح وتحديث حالتها إلى (قيد التنفيذ)."

    elif action_name == "start":
        # Start Task
        if task.status == "Completed":
            log_status = "InvalidTransition"
            error_msg = "المهمة مكتملة بالفعل"
            response_msg = "⚠️ المهمة مكتملة بالفعل ولا يمكن بدؤها مجدداً."
        elif task.status == "Cancelled":
            log_status = "InvalidTransition"
            error_msg = "المهمة ملغاة"
            response_msg = "⚠️ المهمة ملغاة."
        else:
            task.status = "In Progress"
            db.commit()
            enqueue_task_notification(db, task, "task.started", extra_payload={"started_by": emp_name})
            response_msg = f"🚀 تم بدء تنفيذ المهمة: {task.title} بنجاح!"

    elif action_name == "done":
        # Complete Task
        if task.status == "Completed":
            response_msg = "🏁 المهمة مكتملة ومغلقة بالفعل مسبقاً."
        elif task.status == "Cancelled":
            log_status = "InvalidTransition"
            error_msg = "لا يمكن إكمال مهمة ملغاة"
            response_msg = "⚠️ المهمة ملغاة."
        else:
            task.status = "Completed"
            task.completed_at = datetime.utcnow()
            db.commit()
            enqueue_task_notification(db, task, "task.completed", extra_payload={"completed_by": emp_name})
            response_msg = f"🏁 ممتاز يا {emp_name}! تم إغلاق المهمة وإكمالها بنجاح."

    else:
        log_status = "Failed"
        error_msg = f"إجراء غير معروف: {action_name}"
        response_msg = "⚠️ إجراء غير مدعوم."

    # Record Action Log
    action_log = TelegramActionLog(
        company_id=company_id,
        telegram_user_id=clean_user_id,
        telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
        action=action_name,
        task_id=task_id,
        status=log_status,
        details={
            "action_str": action_str,
            "employee_id": str(emp_id),
            "employee_name": emp_name,
            "new_task_status": task.status,
        },
        error_message=error_msg,
        ip_address=ip_address,
    )
    db.add(action_log)
    db.commit()

    return {
        "success": (log_status == "Success"),
        "status": log_status,
        "action": action_name,
        "task_id": str(task_id),
        "task_title": task.title,
        "new_status": task.status,
        "message": response_msg,
    }


# ── Bot Menu Builder & Reply Keyboard Engine ─────────────────────────────────

def get_or_create_default_menu_configs(db: Session, company_id: uuid.UUID) -> List[TelegramBotMenuConfig]:
    """Retrieve existing or seed default menu items for the company."""
    existing = (
        db.query(TelegramBotMenuConfig)
        .filter(TelegramBotMenuConfig.company_id == company_id)
        .order_by(TelegramBotMenuConfig.sort_order.asc())
        .all()
    )
    if existing:
        return existing

    defaults = [
        {
            "label": "📋 مهامي",
            "action": "cmd:my_tasks",
            "menu_type": "reply_keyboard",
            "sort_order": 1,
            "is_enabled": True,
            "icon": "📋",
            "description_ar": "استعراض المهام التشغيلية المسندة إليك",
        },
        {
            "label": "🎫 تذاكري",
            "action": "cmd:tickets",
            "menu_type": "reply_keyboard",
            "sort_order": 2,
            "is_enabled": True,
            "icon": "🎫",
            "description_ar": "استعراض تذاكر الدعم الفني الخاصة بك",
        },
        {
            "label": "🔔 الإشعارات",
            "action": "cmd:notifications",
            "menu_type": "reply_keyboard",
            "sort_order": 3,
            "is_enabled": True,
            "icon": "🔔",
            "description_ar": "استعراض أحدث التنبيهات والإشعارات",
        },
        {
            "label": "🌐 بوابة النظام",
            "action": "url:web_portal",
            "menu_type": "inline_button",
            "sort_order": 4,
            "is_enabled": True,
            "icon": "🌐",
            "description_ar": "فتح لوحة تحكم المنصة في المتصفح",
        },
        {
            "label": "❓ المساعدة",
            "action": "cmd:help",
            "menu_type": "reply_keyboard",
            "sort_order": 5,
            "is_enabled": True,
            "icon": "❓",
            "description_ar": "دليل استخدام أوامر البوت والدعم",
        },
    ]

    created = []
    for d in defaults:
        item = TelegramBotMenuConfig(company_id=company_id, **d)
        db.add(item)
        created.append(item)

    db.commit()
    for item in created:
        db.refresh(item)
    return created


def build_telegram_reply_keyboard(db: Session, company_id: uuid.UUID) -> Optional[Dict[str, Any]]:
    """Build dynamic reply keyboard markup for a company based on enabled menu items."""
    items = (
        db.query(TelegramBotMenuConfig)
        .filter(
            TelegramBotMenuConfig.company_id == company_id,
            TelegramBotMenuConfig.menu_type == "reply_keyboard",
            TelegramBotMenuConfig.is_enabled == True,
        )
        .order_by(TelegramBotMenuConfig.sort_order.asc())
        .all()
    )

    if not items:
        # Seed defaults
        items = [i for i in get_or_create_default_menu_configs(db, company_id) if i.menu_type == "reply_keyboard" and i.is_enabled]

    if not items:
        return None

    # Arrange buttons into rows of up to 2 buttons
    keyboard_rows: List[List[Dict[str, str]]] = []
    current_row: List[Dict[str, str]] = []

    for item in items:
        current_row.append({"text": item.label})
        if len(current_row) == 2:
            keyboard_rows.append(current_row)
            current_row = []

    if current_row:
        keyboard_rows.append(current_row)

    return {
        "keyboard": keyboard_rows,
        "resize_keyboard": True,
        "is_persistent": True,
    }


def publish_bot_commands_to_telegram(bot_token: str, commands: List[Dict[str, str]]) -> Dict[str, Any]:
    """Publish bot commands list to Telegram Bot API (setMyCommands) for in-app autocomplete menu."""
    url = f"https://api.telegram.org/bot{bot_token.strip()}/setMyCommands"
    payload = {"commands": commands}

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            if res_data.get("ok"):
                return {"success": True, "message": "تم تحديث أوامر البوت في تطبيق Telegram بنجاح!"}
            return {"success": False, "message": res_data.get("description", "فشل تحديث أوامر البوت")}
    except Exception as e:
        return {"success": False, "message": f"خطأ أثناء نشر أوامر البوت: {str(e)}"}


# ── Configurable Arabic Message Templates Engine ──────────────────────────────

def render_template(template_str: str, context: Dict[str, Any]) -> str:
    """Safely replace {placeholders} in template with context values."""
    rendered = template_str
    for k, v in context.items():
        rendered = rendered.replace(f"{{{k}}}", str(v or ""))
    return rendered


def get_or_create_default_message_templates(db: Session, company_id: uuid.UUID) -> List[TelegramMessageTemplate]:
    """Retrieve existing or seed default Arabic message templates for the company."""
    existing = (
        db.query(TelegramMessageTemplate)
        .filter(TelegramMessageTemplate.company_id == company_id)
        .all()
    )
    if existing:
        return existing

    defaults = [
        {
            "template_key": "welcome",
            "title_ar": "رسالة الترحيب والبدء",
            "content_ar": (
                "👋 مرحباً بك {employee_name} في بوت <b>Investor Gate OS</b> التابع لـ {company_name}!\n\n"
                "يمكنك استخدام الأزرار أدناه لاستعراض مهامك ومتابعة التذاكر والإشعارات التشغيلية مباشرة."
            ),
            "is_active": True,
        },
        {
            "template_key": "link_success",
            "title_ar": "إشعار نجاح ربط الحساب",
            "content_ar": (
                "✅ <b>تم ربط حسابك بنجاح!</b>\n\n"
                "👤 الموظف: <b>{employee_name}</b>\n"
                "🏢 المنشأة: <b>{company_name}</b>\n"
                "📍 الفرع: <b>{branch_name}</b>\n"
                "🏷️ القسم: <b>{department_name}</b>\n\n"
                "أصبحت الآن مؤهلاً لاستلام التنبيهات وإدارة المهام التشغيلية."
            ),
            "is_active": True,
        },
        {
            "template_key": "task_assigned",
            "title_ar": "إشعار إسناد مهمة جديدة",
            "content_ar": (
                "📌 <b>تم إسناد مهمة تشغيلية جديدة إليك:</b>\n\n"
                "📋 العنوان: <b>{task_title}</b>\n"
                "⚡ الأولوية: <b>{priority}</b>\n"
                "📅 تاريخ الاستحقاق: <b>{due_date}</b>\n"
                "🏢 المنشأة: <b>{company_name}</b>\n\n"
                "📝 <b>الوصف:</b>\n{description}"
            ),
            "is_active": True,
        },
        {
            "template_key": "task_status_changed",
            "title_ar": "إشعار تحديث حالة المهمة",
            "content_ar": (
                "🔄 <b>تحديث حالة المهمة:</b>\n\n"
                "📋 المهمة: <b>{task_title}</b>\n"
                "📊 الحالة الجديدة: <b>{new_status}</b>\n"
                "👤 بواسطة: <b>{actor_name}</b>"
            ),
            "is_active": True,
        },
    ]

    created = []
    for d in defaults:
        t = TelegramMessageTemplate(company_id=company_id, **d)
        db.add(t)
        created.append(t)

    db.commit()
    for t in created:
        db.refresh(t)
    return created

