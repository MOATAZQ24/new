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
import hashlib
import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple, Set
import urllib.request
import urllib.parse
import json

from sqlalchemy.orm import Session
from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError

from app.models.telegram import (
    TelegramUserLink,
    NotificationOutbox,
    TelegramActionLog,
    TelegramBotMenuConfig,
    TelegramMessageTemplate,
)
from app.models.task import Task, TaskComment
from app.models.user import Employee, User, Role, UserRole, CompanyMembership
from app.models.ticket import HelpDeskTicket
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.subscription import ThirdPartySubscription
from app.models.notification import Notification
from app.services.notification_service import create_notification
from app.services.task_workflow import (
    Actor, WorkflowError, transition, task_keyboard, task_ref, stage_of, STAGE_LABELS_AR,
    REJECTION_REASONS, set_pending, pop_pending, has_pending,
)
from app.models.integration import IntegrationConfig, IntegrationLog
from app.core.config import settings
from app.core.security import get_user_roles, hash_password
from app.core.rbac import ROLE_PERMISSION_MATRIX
from app.services.telegram_permissions import crm_grants, effective_grants, policy_for, maximum_scope

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
    """Verify credentials without changing the bot's update receiver."""
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


def send_telegram_audio_file(
    bot_token: str,
    chat_id: str,
    audio_file_path: str,
    caption: Optional[str] = None,
    duration: int = 0,
) -> Dict[str, Any]:
    """Send an audio file directly to a recipient chat on Telegram via sendAudio."""
    clean_token = bot_token.strip()
    clean_chat = str(chat_id).strip()
    if not clean_token or not clean_chat:
        return {"success": False, "message": "بيانات الاتصال مفقودة"}
    if not os.path.isfile(audio_file_path):
        return {"success": False, "message": "ملف التسجيل الصوتي غير موجود"}

    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    body = bytearray()

    def add_field(name: str, val: str):
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{val}\r\n".encode("utf-8"))

    add_field("chat_id", clean_chat)
    if caption:
        add_field("caption", caption[:1024])
    if duration > 0:
        add_field("duration", str(duration))

    try:
        with open(audio_file_path, "rb") as f:
            file_bytes = f.read()

        filename = os.path.basename(audio_file_path)
        mime_type = "audio/webm"
        if filename.endswith(".ogg"):
            mime_type = "audio/ogg"
        elif filename.endswith(".mp3"):
            mime_type = "audio/mpeg"
        elif filename.endswith(".m4a") or filename.endswith(".mp4"):
            mime_type = "audio/mp4"

        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"{filename}\"\r\nContent-Type: {mime_type}\r\n\r\n".encode("utf-8"))
        body.extend(file_bytes)
        body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

        url = f"https://api.telegram.org/bot{clean_token}/sendAudio"
        req = urllib.request.Request(
            url,
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "InvestorGateOS/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "success": data.get("ok") is True,
                "message_id": (data.get("result") or {}).get("message_id"),
            }
    except Exception as e:
        logger.warning("Failed to send audio to Telegram: %s", e)
        return {"success": False, "message": str(e)}


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
    last_error = None
    last_successful_poll = None

    if os.path.exists(worker_status_file):
        try:
            with open(worker_status_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                last_hb_str = data.get("last_heartbeat")
                pid = data.get("pid")
                offset = data.get("offset", 0)
                mode = data.get("mode", mode)
                last_error = data.get("last_error")
                last_successful_poll = data.get("last_successful_poll")

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
        "last_error": last_error,
        "last_successful_poll": last_successful_poll,
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
    if emp.company_id != company_id or emp.employment_status != "Active":
        raise ValueError("الموظف غير نشط أو لا ينتمي إلى المنشأة المحددة")
    if not 1 <= expires_in_minutes <= 60:
        raise ValueError("مدة صلاحية الرمز يجب أن تكون بين دقيقة و60 دقيقة")

    # If user_id not provided, resolve from employee
    if not user_id and emp.user:
        user_id = emp.user.id

    token = secrets.token_hex(8)
    code = f"{secrets.randbelow(900000) + 100000}"  # 6-digit backup PIN
    full_token = f"{code}_{token}"
    expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)

    # Check if a link record already exists
    existing_link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == employee_id).first()

    if existing_link:
        if existing_link.is_verified:
            raise ValueError("الحساب مرتبط بالفعل. يجب أن يلغي مسؤول مخول الربط قبل إصدار أمر جديد")
        if existing_link.is_verified:
            # Reset verification so administrator can issue fresh linking command
            existing_link.is_verified = False
            existing_link.telegram_user_id = None
            existing_link.telegram_chat_id = None
            existing_link.telegram_username = None
            existing_link.linked_at = None
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

    db.add(TelegramActionLog(
        company_id=company_id, telegram_user_id="system", action="generate_telegram_link_token",
        status="Pending", details={"employee_id": str(employee_id),
                                  "token_ref": hashlib.sha256(full_token.encode()).hexdigest()},
    ))
    db.commit()
    _, _, bot_username = get_telegram_config(db, company_id)
    command = f"/start {full_token}"

    return {
        "employee_id": str(employee_id),
        "employee_name": emp.full_name,
        "token": full_token,
        "pin_code": code,
        "command": command,
        "bot_username": bot_username,
        "expires_at": expires_at.isoformat(),
        "is_verified": link_record.is_verified,
        "telegram_username": link_record.telegram_username,
    }


# ── Centralized Telegram Identity & Authorization Resolver ──────────────

class TelegramIdentityContext:
    def __init__(
        self,
        is_authorized: bool,
        error_code: str,
        error_message: str,
        link: Optional[TelegramUserLink] = None,
        employee: Optional[Employee] = None,
        user: Optional[User] = None,
        membership: Optional[CompanyMembership] = None,
        roles: Optional[List[str]] = None,
        permissions: Optional[Set[Tuple[str, str]]] = None,
        is_privileged: bool = False,
    ):
        self.is_authorized = is_authorized
        self.error_code = error_code
        self.error_message = error_message
        self.link = link
        self.employee = employee
        self.user = user
        self.membership = membership
        self.company_id = link.company_id if link else (employee.company_id if employee else None)
        self.roles = roles or []
        self.permissions = permissions or set()
        self.is_privileged = is_privileged
        self.data_scope = getattr(link, "data_scope", "Self") or "Self"
        self.allowed_modules = getattr(link, "allowed_modules", None) or [
            "tasks", "tickets", "custody", "notifications", "search"
        ]
        self.effective_permissions: Dict[str, List[str]] = {}
        for p in self.permissions:
            if isinstance(p, str) and ":" in p:
                mod, act = p.split(":", 1)
                self.effective_permissions.setdefault(mod, []).append(act)
            elif isinstance(p, (tuple, list)) and len(p) == 2:
                self.effective_permissions.setdefault(p[0], []).append(p[1])
        if "tasks" in self.allowed_modules and "tasks" not in self.effective_permissions:
            self.effective_permissions["tasks"] = ["view", "update"]

    @property
    def employee_name(self) -> str:
        return self.employee.full_name if self.employee else "الموظف"

    def can_access_module(self, module_name: str) -> bool:
        """Check both Telegram-specific module permissions and CRM RBAC permissions.
        Telegram permissions must NEVER exceed user's CRM permissions!
        """
        if not self.is_authorized:
            return False

        if module_name in ('settings', 'help', 'portal', 'my_permissions', 'main_menu'):
            return True
        return 'view' in self.effective_permissions.get(module_name, [])



def ensure_employee_user_account(db: Session, employee: Employee, company_id: uuid.UUID) -> User:
    """Ensure that an employee has an active Application User account and CompanyMembership.
    If not already existing, safely provisions a standard non-admin account (IT Technician or Employee)
    preserving strict RBAC and company isolation.
    """
    import re

    # 1. Check if employee already has a linked user
    user = None
    if employee.user:
        user = employee.user
    else:
        user = db.query(User).filter(User.employee_id == employee.id).first()

    # 2. Check by email if employee email exists
    if not user and employee.email:
        user = db.query(User).filter(User.email.ilike(employee.email.strip())).first()
        if user and not user.employee_id:
            user.employee_id = employee.id
            db.flush()

    # 3. If still no user, auto-provision a standard user account for this active employee
    if not user:
        target_role_name = "Employee"
        role = db.query(Role).filter(Role.name == target_role_name).first()
        if not role:
            role = db.query(Role).filter(Role.name == "Employee").first()

        base_user = re.sub(r'[^a-zA-Z0-9_]', '', employee.employee_number or employee.id.hex[:6]).lower()
        if not base_user:
            base_user = f"emp_{employee.id.hex[:6]}"
        username = base_user
        idx = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_user}_{idx}"
            idx += 1

        email = employee.email or f"{username}@investorgate.sa"
        idx_e = 1
        orig_email = email
        while db.query(User).filter(User.email.ilike(email)).first():
            email = f"emp_{idx_e}_{orig_email}"
            idx_e += 1

        user = User(
            employee_id=employee.id,
            username=username,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(16)),
            account_status="Active",
            is_superadmin=False,
            must_change_password=True,
        )
        db.add(user)
        db.flush()

        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    # 4. Ensure active company membership exists
    membership = db.query(CompanyMembership).filter(
        CompanyMembership.user_id == user.id,
        CompanyMembership.company_id == company_id,
    ).first()

    if not membership:
        role = None
        user_role = db.query(UserRole).filter(UserRole.user_id == user.id).first()
        if user_role:
            role = user_role.role
        if not role:
            role = db.query(Role).filter(Role.name == "Employee").first()

        db.add(CompanyMembership(
            user_id=user.id,
            company_id=company_id,
            role_id=role.id if role else None,
            status="Active",
            is_default=True,
        ))

    db.commit()
    return user


def resolve_telegram_identity(
    db: Session,
    telegram_user_id: str,
    telegram_chat_id: Optional[str] = None,
) -> TelegramIdentityContext:
    """Centralized Telegram identity and authorization resolver.
    Enforces:
    1. Active Telegram link
    2. Correct Telegram user identity & chat validation
    3. Active employee in company scope
    4. Active application user account (auto-associating if needed)
    5. Active company membership
    6. RBAC roles and effective permissions
    """
    clean_user_id = str(telegram_user_id).strip()

    # 1. Locate verified TelegramUserLink
    link = db.query(TelegramUserLink).filter(
        TelegramUserLink.telegram_user_id == clean_user_id,
        TelegramUserLink.is_verified == True,
    ).first()

    if not link:
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="UNLINKED",
            error_message=(
                "⚠️ <b>حساب Telegram الخاص بك غير مرتبط بحساب موظف معتمد.</b>\n\n"
                "يرجى فتح ملفك الوظيفي في لوحة تحكم <b>Investor Gate OS</b> والنقر على «ربط Telegram» ثم إرسال الأمر المنسوخ:\n"
                "<code>/start &lt;رمز_الربط&gt;</code>"
            ),
        )

    # 2. Verify Employee
    employee = link.employee
    if not employee:
        employee = db.query(Employee).filter(Employee.id == link.employee_id).first()

    if not employee:
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="EMPLOYEE_NOT_FOUND",
            error_message="سجل الموظف المرتبط بهذا الحساب غير موجود في النظام.",
            link=link,
        )

    if employee.employment_status != "Active":
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="EMPLOYEE_INACTIVE",
            error_message="حالة الموظف غير نشطة في الشركة. يرجى مراجعة إدارة الموارد البشرية.",
            link=link,
            employee=employee,
        )

    if employee.company_id != link.company_id:
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="TENANT_MISMATCH",
            error_message="المنشأة المرتبطة بالموظف لا تتطابق مع سجل الربط.",
            link=link,
            employee=employee,
        )

    # 3. Verify / Update Chat ID
    if telegram_chat_id:
        chat_str = str(telegram_chat_id).strip()
        if link.telegram_chat_id and link.telegram_chat_id != chat_str:
            if chat_str != clean_user_id:
                return TelegramIdentityContext(
                    is_authorized=False,
                    error_code="CHAT_MISMATCH",
                    error_message="معرف المحادثة لا يتطابق مع الحساب المسجل.",
                    link=link,
                    employee=employee,
                )

    # 4. Resolve & Synchronize Application User
    user = None
    if link.user_id:
        user = db.query(User).filter(User.id == link.user_id).first()
    if not user:
        user = ensure_employee_user_account(db, employee, link.company_id)
        if user and link.user_id != user.id:
            link.user_id = user.id
            db.commit()

    if not user:
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="NO_USER_ACCOUNT",
            error_message="حسابك مرتبط بالموظف، لكن لا يوجد حساب مستخدم نشط في النظام مرتبط بهذا الموظف. يرجى التواصل مع المسؤول.",
            link=link,
            employee=employee,
        )

    # 5. Check User Account Status
    now = datetime.utcnow()
    if user.is_deleted or user.account_status != "Active":
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="ACCOUNT_INACTIVE",
            error_message="حساب المستخدم الخاص بك غير نشط أو موقوف. يرجى التواصل مع مسؤول النظام.",
            link=link,
            employee=employee,
            user=user,
        )

    if user.locked_until and user.locked_until > now:
        return TelegramIdentityContext(
            is_authorized=False,
            error_code="ACCOUNT_LOCKED",
            error_message="حسابك مقفل مؤقتاً لأسباب أمنية. يرجى المحاولة لاحقاً أو مراجعة المسؤول.",
            link=link,
            employee=employee,
            user=user,
        )

    # 6. Check Active Company Membership
    membership = None
    if not user.is_superadmin:
        membership = db.query(CompanyMembership).filter(
            CompanyMembership.user_id == user.id,
            CompanyMembership.company_id == link.company_id,
            CompanyMembership.status == "Active",
        ).first()

        if not membership:
            return TelegramIdentityContext(
                is_authorized=False,
                error_code="NO_ACTIVE_MEMBERSHIP",
                error_message="حسابك مرتبط، لكن لا توجد عضوية شركة نشطة. يرجى التواصل مع المسؤول.",
                link=link,
                employee=employee,
                user=user,
            )

    # 7. Resolve RBAC Roles & Effective Permissions
    roles = get_user_roles(user, db, link.company_id)
    perms = set()
    for r in roles:
        role_perms = ROLE_PERMISSION_MATRIX.get(r, {})
        for mod, acts in role_perms.items():
            for a in acts:
                perms.add((mod, a))
    is_privileged = user.is_superadmin or any(r in ("Super Admin", "Company Admin", "IT Manager") for r in roles)

    context = TelegramIdentityContext(
        is_authorized=True,
        error_code="AUTHORIZED",
        error_message="",
        link=link,
        employee=employee,
        user=user,
        membership=membership,
        roles=roles,
        permissions=perms,
        is_privileged=is_privileged,
    )
    context.effective_permissions = effective_grants(link, crm_grants(user, link.company_id, db))
    scope = policy_for(link).get('scope', getattr(link, 'data_scope', 'Self'))
    context.data_scope = 'Company' if scope == 'Company' and maximum_scope(user, link.company_id, db) == 'Company' else 'Self'
    return context


def verify_telegram_link(
    db: Session,
    token: str,
    telegram_user_id: str,
    telegram_chat_id: str,
    telegram_username: Optional[str] = None,
    bot_token: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify an employee link token and bind the Telegram account."""
    now = datetime.utcnow()
    clean_token = token.strip()
    if not re.fullmatch(r"[0-9]{6}_[0-9a-f]{16}", clean_token):
        raise ValueError("رمز التحقق غير صحيح. أرسل أمر /start كاملاً كما يظهر في النظام")
    link = db.query(TelegramUserLink).filter(
        TelegramUserLink.verification_token == clean_token,
    ).with_for_update().first()

    if not link:
        raise ValueError("رمز التحقق غير صحيح أو غير موجود")

    emp_name = link.employee.full_name if link.employee else "الموظف"
    company_name = link.company.company_name_ar if link.company else "الشركة"

    if link.is_verified:
        if bot_token is None and str(link.telegram_user_id) == str(telegram_user_id):
            return {
                "success": True,
                "already_linked": True,
                "employee_name": emp_name,
                "company_name": company_name,
                "message": f"حسابك مرتبط بالفعل مسبقاً يا {emp_name}. يمكنك استخدام الأزرار والقوائم مباشرة.",
            }
        raise ValueError("رمز التحقق تم استخدامه بالفعل مسبقاً (رمز أحادي الاستخدام)")

    token_ref = hashlib.sha256(clean_token.encode()).hexdigest()
    def reject(message, status="Failed"):
        db.add(TelegramActionLog(
            company_id=link.company_id, telegram_user_id=str(telegram_user_id),
            telegram_chat_id=str(telegram_chat_id), action="verify_telegram_link",
            status=status, error_message=message,
            details={"employee_id": str(link.employee_id), "token_ref": token_ref},
        ))
        db.commit()
        raise ValueError(message)

    if link.token_expires_at <= now:
        reject("انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد من لوحة التحكم")
    if not link.employee or link.employee.company_id != link.company_id or link.employee.employment_status != "Active":
        reject("الموظف غير نشط أو لا ينتمي إلى المنشأة المسجلة")
    if not str(telegram_user_id).isdigit() or str(telegram_user_id) != str(telegram_chat_id):
        reject("يجب إرسال أمر الربط من المحادثة الخاصة بحساب الموظف")
    if bot_token is not None:
        configured, expected_token, _ = get_telegram_config(db, link.company_id)
        if not configured or not secrets.compare_digest(expected_token, bot_token):
            reject("أرسل الأمر إلى بوت المنشأة المحدد في نافذة الربط")

    conflict = db.query(TelegramUserLink).filter(
        TelegramUserLink.telegram_user_id == str(telegram_user_id),
        TelegramUserLink.is_verified == True,
        TelegramUserLink.id != link.id,
    ).first()
    if conflict:
        reject("حساب Telegram مرتبط بموظف آخر. يلزم إلغاء الربط السابق بواسطة مسؤول مخول؛ لم يتم نقل الحساب", "Conflict")

    # Compare-and-set consumes this exact generation once, even with concurrent requests.
    try:
        claimed = db.execute(update(TelegramUserLink).where(
            TelegramUserLink.id == link.id,
            TelegramUserLink.verification_token == clean_token,
            TelegramUserLink.is_verified == False,
            TelegramUserLink.token_expires_at > now,
        ).values(telegram_user_id=str(telegram_user_id), telegram_chat_id=str(telegram_chat_id),
                 telegram_username=telegram_username.lstrip("@") if telegram_username else None,
                 is_verified=True, linked_at=now), execution_options={"synchronize_session": False})
        if claimed.rowcount != 1:
            db.rollback()
            raise ValueError("تم استخدام الرمز أو استبداله. اطلب أمراً جديداً من المسؤول")
        link.telegram_user_id = str(telegram_user_id)
        link.telegram_chat_id = str(telegram_chat_id)
        link.telegram_username = telegram_username.lstrip("@") if telegram_username else None
        link.is_verified = True
        link.linked_at = now
        db.flush()
    except IntegrityError:
        db.rollback()
        reject("حساب Telegram مرتبط بموظف آخر. يلزم إلغاء الربط السابق بواسطة مسؤول مخول", "Conflict")

    db.refresh(link)

    # Auto-resolve or safely provision user account & active membership
    user = ensure_employee_user_account(db, link.employee, link.company_id)
    link.user_id = user.id

    # Initialize default allowed modules if none
    if not link.allowed_modules:
        roles = get_user_roles(user, db, link.company_id)
        is_admin_mgr = user.is_superadmin or any(r in ("Super Admin", "Company Admin", "IT Manager") for r in roles)
        is_tech = any(r == "IT Technician" for r in roles)
        mods = ["tasks", "tickets", "custody", "notifications", "search"]
        if is_tech or is_admin_mgr:
            mods.extend(["assets", "subscriptions"])
        if is_admin_mgr:
            mods.append("reports")
        link.allowed_modules = mods

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
            "token_ref": token_ref,
        },
    )
    db.add(action_log)
    db.commit()

    return {
        "success": True,
        "is_verified": True,
        "company_id": str(link.company_id),
        "employee_id": str(link.employee_id),
        "employee_name": emp_name,
        "company_name": company_name,
        "telegram_user_id": link.telegram_user_id,
        "telegram_chat_id": link.telegram_chat_id,
        "telegram_username": link.telegram_username,
        "allowed_modules": link.allowed_modules,
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
    ref_num = f"#TASK-{task_id_str[:8].upper()}"
    emp_name = task.assigned_to.full_name if task.assigned_to else "غير محدد"

    event_titles = {
        "task.assigned": "📌 <b>تم إسناد مهمة تشغيلية جديدة إليك</b>",
        "task.accepted": "✅ <b>تم قبول المهمة وبدء تنفيذها</b>",
        "task.started": "🚀 <b>تم بدء العمل على المهمة</b>",
        "task.rejected": "❌ <b>تم تسجيل رفض المهمة</b>",
        "task.submitted_for_review": "📋 <b>تم رفع المهمة للمراجعة والاعتماد</b>",
        "task.completed": "🏁 <b>اكتملت المهمة بنجاح</b>",
        "task.approved": "🎉 <b>تم اعتماد المهمة رسمياً وإغلاقها</b>",
        "task.overdue": "⚠️ <b>تنبيه أمني: المهمة متأخرة عن موعدها المحدد!</b>",
        "task.reassigned": "🔄 <b>تمت إعادة إسناد المهمة التشغيلية</b>",
        "task.clarification_requested": "❓ <b>طلب توضيح على مهمة</b>",
        "task.cancelled": "🚫 <b>تم إلغاء المهمة</b>",
    }
    header = event_titles.get(event_type, f"🔔 <b>إشعار بالمهمة: {task.title}</b>")
    if getattr(task, "is_voice_task", False) and event_type == "task.assigned":
        header = "🎙️ <b>تم إسناد مهمة صوتية جديدة إليك</b>"

    body_lines = [
        header,
        f"🏢 <b>المنشأة:</b> {company_name}",
        f"🔢 <b>رقم المرجع:</b> <code>{ref_num}</code>",
        f"📝 <b>عنوان المهمة:</b> {task.title}",
    ]

    if getattr(task, "is_voice_task", False):
        body_lines.append(f"🎙️ <b>التسجيل الصوتي:</b> رسالة صوتية مسجلة ({getattr(task, 'voice_note_duration', 0) or 0} ثانية)")

    body_lines.extend([
        f"👤 <b>الموظف المسند إليه:</b> {emp_name}",
        f"⚡ <b>الأولوية:</b> {p_text}",
        f"📊 <b>الحالة:</b> {STAGE_LABELS_AR.get(stage_of(task.status), task.status)} ({task.status})",
        f"📅 <b>تاريخ الاستحقاق:</b> {due_str}",
    ])

    if task.description:
        desc_snippet = (task.description[:180] + "...") if len(task.description) > 180 else task.description
        body_lines.append(f"📄 <b>الوصف:</b> {desc_snippet}")

    if getattr(task, "is_voice_task", False):
        body_lines.append("🎙️ <i>ملاحظة: التسجيل الصوتي مرفق مع الإشعار أدناه، ويمكنك أيضاً الاستماع إليه وإدارة المهمة من خلال منصة Investor Gate OS.</i>")

    body_lines.append("\n<i>نظام Investor Gate لإدارة العمليات التقنية</i>")
    message_text = "\n".join(body_lines)

    # Inline keyboard: only actions that are valid for the task's CURRENT status.
    if event_type in ("task.assigned", "task.reassigned", "task.accepted", "task.started"):
        reply_markup = task_keyboard(task, can_act=True)
    elif event_type in ("task.submitted_for_review", "task.review_requested"):
        reply_markup = task_keyboard(task, can_act=False, can_manage=True)
    else:
        reply_markup = {"inline_keyboard": [[
            {"text": "📋 تفاصيل المهمة", "callback_data": f"act:info:{task_id_str}"},
            {"text": "📑 مهامي النشطة", "callback_data": "cmd:my_tasks"},
        ]]}

    return message_text, reply_markup


def enqueue_task_notification(
    db: Session,
    task: Task,
    event_type: str,
    target_employee_id: Optional[uuid.UUID] = None,
    extra_payload: Optional[Dict[str, Any]] = None,
    dedupe_key: Optional[str] = None,
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
            TelegramUserLink.company_id == task.company_id,
            TelegramUserLink.is_verified == True,
        ).first()

        company_name = task.company.company_name_ar if task.company else "شركة بوابة المستثمر"
        message_text, reply_markup = format_task_notification(task, event_type, company_name)

        chat_id = link.telegram_chat_id if link else None

        # Generate unique idempotency key
        now_ts = int(datetime.utcnow().timestamp())
        if dedupe_key:
            idempotency_key = f"{event_type}:{dedupe_key}"[:255]
            existing = db.query(NotificationOutbox).filter(NotificationOutbox.idempotency_key == idempotency_key).first()
            if existing:
                return existing  # duplicate request: never enqueue the same notification twice
        else:
            idempotency_key = f"{event_type}:{task.id}:{emp_id}:{now_ts}_{secrets.token_hex(4)}"

        payload = {
            "event_type": event_type,
            "task_id": str(task.id),
            "task_title": task.title,
            "task_status": task.status,
            "priority": task.priority,
            "employee_id": str(emp_id),
            "is_employee_linked": bool(link and link.is_verified),
            "is_voice_task": bool(getattr(task, "is_voice_task", False)),
            "voice_note_url": getattr(task, "voice_note_url", None),
            "voice_note_duration": getattr(task, "voice_note_duration", 0),
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

def dispatch_outbox_notifications(
    db: Session,
    limit: int = 50,
    company_id: Optional[uuid.UUID] = None,
    outbox_id: Optional[uuid.UUID] = None,
) -> Dict[str, Any]:
    """Process pending outbox entries.
    If bot token is configured, sends to Telegram Bot API.
    If bot token is missing, backs off scheduled_at without head-of-line blocking configured companies.
    """
    now = datetime.utcnow()
    query = db.query(NotificationOutbox).filter(
        NotificationOutbox.status == "Pending",
        NotificationOutbox.scheduled_at <= now,
        NotificationOutbox.retry_count < NotificationOutbox.max_retries,
    )
    if outbox_id is not None:
        query = query.filter(NotificationOutbox.id == outbox_id)
    elif company_id is not None:
        query = query.filter(NotificationOutbox.company_id == company_id)
    pending_items = query.order_by(NotificationOutbox.scheduled_at.asc()).limit(limit).all()

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
            item.scheduled_at = datetime.utcnow() + timedelta(minutes=5)
            continue

        if not item.recipient_chat_id:
            item.status = "Failed"
            item.last_error = "لا يوجد chat_id مسجل للمستلم"
            failed += 1
            continue

        # Check per-user notification preference
        user_link = db.query(TelegramUserLink).filter(
            TelegramUserLink.telegram_chat_id == item.recipient_chat_id,
            TelegramUserLink.company_id == item.company_id,
            TelegramUserLink.is_verified == True,
        ).first()
        if user_link and getattr(user_link, "notifications_enabled", True) is False:
            item.status = "Skipped"
            item.last_error = "تم كتم الإشعارات بحسب تفضيل المستخدم (User muted notifications)"
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

        api_result = {"ok": False}
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(post_data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                response_body = json.loads(resp.read().decode("utf-8"))
                api_result = {
                    "ok": response_body.get("ok") is True, "http_status": resp.status,
                    "message_id": (response_body.get("result") or {}).get("message_id"),
                    "error_code": response_body.get("error_code"),
                }
                if resp.status in (200, 201) and api_result["ok"]:
                    item.status = "Sent"
                    item.sent_at = datetime.utcnow()
                    item.last_error = None
                    sent += 1

                    # Send voice note file directly to Telegram chat if available
                    if item.payload and item.payload.get("is_voice_task") and item.payload.get("voice_note_url"):
                        try:
                            v_url = str(item.payload.get("voice_note_url", ""))
                            clean_fn = os.path.basename(v_url)
                            voice_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "voice_tasks"))
                            local_audio = os.path.join(voice_dir, str(item.company_id), clean_fn)
                            if os.path.isfile(local_audio):
                                task_ref = f"#TASK-{str(item.payload.get('task_id', ''))[:8].upper()}"
                                send_telegram_audio_file(
                                    bot_token=bot_token,
                                    chat_id=item.recipient_chat_id,
                                    audio_file_path=local_audio,
                                    caption=f"🎙️ التسجيل الصوتي للمهمة {task_ref}",
                                    duration=int(item.payload.get("voice_note_duration") or 0),
                                )
                        except Exception as err:
                            logger.warning("Audio delivery alongside notification failed: %s", err)
                else:
                    item.retry_count += 1
                    item.last_error = f"Telegram API returned status {resp.status}, ok={api_result['ok']}"
                    if item.retry_count >= item.max_retries:
                        item.status = "Failed"
                    else:
                        backoff_sec = (2 ** item.retry_count) * 10
                        item.scheduled_at = datetime.utcnow() + timedelta(seconds=backoff_sec)
                    failed += 1
        except Exception as e:
            api_result = {"ok": False, "error_type": type(e).__name__}
            if isinstance(e, urllib.error.HTTPError):
                api_result["http_status"] = e.code
                try:
                    body = json.loads(e.read().decode("utf-8"))
                    api_result["error_code"] = body.get("error_code", e.code)
                    api_result["description"] = str(body.get("description", "Telegram API error")).replace(bot_token, "[redacted]")[:500]
                except Exception:
                    pass
            item.retry_count += 1
            item.last_error = f"Telegram delivery failed ({api_result.get('http_status', type(e).__name__)})"
            if item.retry_count >= item.max_retries:
                item.status = "Failed"
            else:
                backoff_sec = (2 ** item.retry_count) * 10
                item.scheduled_at = datetime.utcnow() + timedelta(seconds=backoff_sec)
            failed += 1
        item.payload = {**(item.payload or {}), "telegram_api_result": api_result}
        db.add(IntegrationLog(
            company_id=item.company_id, service_name="telegram", event_type=item.event_type,
            status="Success" if api_result.get("ok") else "Failed",
            payload={"outbox_id": str(item.id), "task_id": (item.payload or {}).get("task_id")},
            response_data=api_result, error_message=item.last_error,
        ))

    db.commit()

    return {
        "processed": processed,
        "sent": sent,
        "failed": failed,
        "ready_awaiting_token": ready_awaiting_token,
    }


# ── Inbound Callback & Action Execution Engine ────────────────────────


WORKFLOW_BOT_ACTIONS = ("accept", "start", "reject", "reject_custom", "do_reject", "done", "complete", "clarify", "reopen", "cancel_pending")


def run_bot_workflow_action(db, context, link, task, action_name, arg):
    """Telegram → shared workflow service. Returns (log_status, error, message, reply_markup).

    The success message is produced only AFTER the service committed the change.
    """
    actor = Actor(user_id=context.user.id if context.user else link.user_id, employee_id=context.employee.id,
                  name=context.employee.full_name, company_id=context.company_id, privileged=context.is_privileged,
                  superadmin=bool(context.user and context.user.is_superadmin), source="telegram")
    tid = str(task.id)
    try:
        if action_name == "cancel_pending":
            pop_pending(db, link)
            return "Success", None, "تم إلغاء الإجراء المعلّق.", task_keyboard(task, can_act=True, can_manage=context.is_privileged)
        if action_name == "reject":  # step 1: show predefined reasons (short codes keep callback_data < 64 bytes)
            if stage_of(task.status) not in ("new", "in_progress", "waiting"):
                raise WorkflowError("invalid_transition", "⚠️ لا يمكن رفض هذه المهمة في حالتها الحالية.")
            rows = [[{"text": f"⚠️ {text}", "callback_data": f"act:do_reject:{tid}:{code}"}] for code, text in REJECTION_REASONS.items()]
            rows.append([{"text": "✍️ سبب آخر (اكتبه)", "callback_data": f"act:reject_custom:{tid}"}])
            rows.append([{"text": "🔙 تراجع", "callback_data": f"act:info:{tid}"}])
            return "Success", None, f"❓ <b>اختر سبب الرفض للمهمة {task_ref(task)}:</b>", {"inline_keyboard": rows}
        if action_name in ("reject_custom", "clarify"):
            if stage_of(task.status) not in ("new", "in_progress", "waiting"):
                raise WorkflowError("invalid_transition", "⚠️ لا يمكن تنفيذ هذا الإجراء على هذه المهمة في حالتها الحالية.")
            set_pending(db, link, "reject" if action_name == "reject_custom" else "clarify", task.id)
            prompt = "✍️ اكتب سبب الرفض الآن في رسالة واحدة." if action_name == "reject_custom" else "✍️ اكتب سؤالك أو طلب التوضيح الآن في رسالة واحدة."
            return "Success", None, f"{prompt}\nالمهمة: {task_ref(task)}", {"inline_keyboard": [[{"text": "🔙 إلغاء", "callback_data": f"act:cancel_pending:{tid}"}]]}
        if action_name == "do_reject":
            reason = REJECTION_REASONS.get((arg or "").strip(), (arg or "").strip())
            outcome = transition(db, task, actor, "reject", reason)
        else:
            outcome = transition(db, task, actor, "complete" if action_name == "done" else action_name, arg)
        return "Success", None, outcome.message, None
    except WorkflowError as exc:
        db.rollback()
        status = "Unauthorized" if exc.http_status == 403 else "InvalidTransition"
        return status, exc.message, exc.message if exc.message.startswith(("⚠️", "ℹ️", "⛔")) else f"⚠️ {exc.message}", None


def execute_pending_text(db, telegram_user_id, telegram_chat_id, text):
    """Free-text reply to a pending clarification/custom-rejection prompt. Returns None if nothing is pending."""
    context = resolve_telegram_identity(db, str(telegram_user_id).strip(), telegram_chat_id)
    if not context.is_authorized or not has_pending(context.link):
        return None
    pending = pop_pending(db, context.link)
    if not pending:
        return {"success": False, "status": "Expired", "message": "⌛ انتهت صلاحية الطلب المعلّق. أعد المحاولة من تفاصيل المهمة."}
    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(pending["task_id"]), Task.company_id == context.company_id).first()
    except ValueError:
        task = None
    if not task:
        return {"success": False, "status": "Failed", "message": "المهمة غير موجودة."}
    action = "reject" if pending["kind"] == "reject" else "clarify"
    status, err, msg, _ = _run_text_action(db, context, task, action, text)
    db.refresh(task)
    return {"success": status == "Success", "status": status, "message": msg, "task_id": str(task.id), "new_status": task.status,
            "reply_markup": task_keyboard(task, can_act=True, can_manage=context.is_privileged)}


def _run_text_action(db, context, task, action, text):
    actor = Actor(user_id=context.user.id if context.user else context.link.user_id, employee_id=context.employee.id,
                  name=context.employee.full_name, company_id=context.company_id, privileged=context.is_privileged,
                  superadmin=bool(context.user and context.user.is_superadmin), source="telegram")
    try:
        return "Success", None, transition(db, task, actor, action, text).message, None
    except WorkflowError as exc:
        db.rollback()
        return "InvalidTransition", exc.message, exc.message, None


def execute_bot_action(db, telegram_user_id, telegram_chat_id, action_str, ip_address=None):
    from app.services.telegram_router import execute
    return execute(db, telegram_user_id, telegram_chat_id, action_str, ip_address)


def _execute_bot_action_legacy(
    db: Session,
    telegram_user_id: str,
    telegram_chat_id: Optional[str],
    action_str: str,
    ip_address: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute an authenticated bot action (Tasks, Tickets, Assets, Custody, Subscriptions, Reports, Search).
    Enforces centralized identity resolution, RBAC, tenant isolation, ownership, and valid state transitions.
    """
    clean_user_id = str(telegram_user_id).strip()

    # 1. Resolve Identity and Context
    context = resolve_telegram_identity(db, telegram_user_id=clean_user_id, telegram_chat_id=telegram_chat_id)
    if not context.is_authorized:
        company_id = context.company_id or (context.link.company_id if context.link else None)
        if company_id:
            db.add(TelegramActionLog(
                company_id=company_id,
                telegram_user_id=clean_user_id,
                telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else None,
                action="authorization_check",
                status="Unauthorized",
                error_message=context.error_message,
                ip_address=ip_address,
            ))
            db.commit()
        return {
            "success": False,
            "status": "Unauthorized",
            "error_code": context.error_code,
            "message": context.error_message,
        }

    link = context.link
    company_id = context.company_id
    employee = context.employee
    emp_id = employee.id
    emp_name = employee.full_name
    is_privileged = context.is_privileged

    # 2. Parse action string
    parts = action_str.split(":", 3)
    prefix = parts[0]
    action_name = parts[1] if len(parts) > 1 else prefix
    target_id_str = parts[2] if len(parts) > 2 else None
    rejection_reason_arg = parts[3] if len(parts) > 3 else None

    # Handle 'cmd:my_tasks' (supports active default and 'cmd:my_tasks:completed')
    if action_str == "cmd:my_tasks" or (prefix == "cmd" and action_name == "my_tasks"):
        if not context.can_access_module("tasks"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        from app.services import task_workflow as wf
        is_completed_view = ":completed" in action_str
        view_mode = "completed" if is_completed_view else "active"

        if is_completed_view:
            tasks = (
                db.query(Task)
                .filter(
                    Task.company_id == company_id,
                    Task.assigned_to_id == emp_id,
                    wf.stage_condition("completed"),
                )
                .order_by(Task.completed_at.desc().nullslast(), Task.created_at.desc())
                .all()
            )
        else:
            tasks = (
                db.query(Task)
                .filter(
                    Task.company_id == company_id,
                    Task.assigned_to_id == emp_id,
                    wf.stage_condition("active"),
                )
                .order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
                .all()
            )

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="my_tasks",
            status="Success",
            details={"tasks_count": len(tasks), "view": view_mode},
            ip_address=ip_address,
        ))
        db.commit()

        if not tasks:
            return {
                "success": True,
                "status": "Success",
                "view": view_mode,
                "message": "لا توجد لديك مهام مكتملة حالياً." if is_completed_view else "لا توجد لديك مهام حالياً.",
                "reply_markup": {
                    "inline_keyboard": [
                        [{"text": "🏠 القائمة الرئيسية", "callback_data": "cmd:main_menu"}, {"text": "🛡️ صلاحياتي", "callback_data": "cmd:my_permissions"}]
                    ]
                },
                "tasks": [],
            }

        # Pagination & Interactive inline action buttons (4 per page)
        page = 1
        if "page" in action_str:
            try:
                page = max(1, int(action_str.split("page:")[-1].split(":")[0]))
            except Exception:
                page = 1
        page_size = 4
        total_tasks = len(tasks)
        total_pages = max(1, (total_tasks + page_size - 1) // page_size)
        page = min(page, total_pages)
        start_idx = (page - 1) * page_size
        page_tasks = tasks[start_idx : start_idx + page_size]

        header_label = "مهامك المكتملة" if is_completed_view else "مهامك النشطة"
        task_lines = [f"📋 <b>{header_label} يا {emp_name} ({total_tasks} مهام | صفحة {page}/{total_pages}):</b>\n"]
        inline_kb = []
        for i, t in enumerate(page_tasks, start_idx + 1):
            p_badge = "🟢" if is_completed_view else ("🔴" if t.priority == "Urgent" else ("🟠" if t.priority == "High" else "🟡"))
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "غير محدد"
            ack_status = "✓ تم الاستلام" if getattr(t, "acknowledged_at", None) else "⏳ بانتظار الاستلام"
            task_lines.append(f"{i}. {p_badge} <b>{t.title}</b>\n   الحالة: {t.status} ({ack_status}) | الاستحقاق: {due}")
            inline_kb.append([
                {"text": f"تفاصيل #{t.title[:22]}", "callback_data": f"act:info:{t.id}"}
            ])

        nav_row = []
        base_cmd = "cmd:my_tasks:completed" if is_completed_view else "cmd:my_tasks"
        if page > 1:
            nav_row.append({"text": "⬅️ السابق", "callback_data": f"{base_cmd}:page:{page - 1}"})
        if page < total_pages:
            nav_row.append({"text": "التالي ➡️", "callback_data": f"{base_cmd}:page:{page + 1}"})
        if nav_row:
            inline_kb.append(nav_row)

        toggle_row = [
            {"text": "🟢 المهام المكتملة" if not is_completed_view else "📋 المهام النشطة", "callback_data": "cmd:my_tasks:completed" if not is_completed_view else "cmd:my_tasks"}
        ]
        inline_kb.append(toggle_row)

        inline_kb.append([
            {"text": "🏠 القائمة الرئيسية", "callback_data": "cmd:main_menu"},
            {"text": "🛡️ صلاحياتي", "callback_data": "cmd:my_permissions"},
        ])

        return {
            "success": True,
            "status": "Success",
            "view": view_mode,
            "message": "\n".join(task_lines),
            "reply_markup": {"inline_keyboard": inline_kb},
            "tasks": [{"id": str(t.id), "title": t.title, "status": t.status, "stage": wf.stage_of(t.status)} for t in tasks],
        }

    # Handle 'cmd:my_tickets'
    if action_str in ("cmd:my_tickets", "cmd:tickets") or (prefix == "cmd" and action_name in ("my_tickets", "tickets")):
        if not context.can_access_module("tickets"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        ticket_query = db.query(HelpDeskTicket).filter(
            HelpDeskTicket.company_id == company_id,
            HelpDeskTicket.status.in_(["New", "In Progress", "Pending Approval"]),
        )
        if not is_privileged:
            ticket_query = ticket_query.filter(
                or_(
                    HelpDeskTicket.requester_id == emp_id,
                    HelpDeskTicket.assigned_technician_id == context.user.id if context.user else False,
                )
            )
        tickets = ticket_query.order_by(HelpDeskTicket.created_at.desc()).limit(10).all()

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="my_tickets",
            status="Success",
            details={"tickets_count": len(tickets)},
            ip_address=ip_address,
        ))
        db.commit()

        if not tickets:
            return {
                "success": True,
                "status": "Success",
                "message": "لا توجد لديك تذاكر دعم فني حالياً.",
                "tickets": [],
            }

        t_lines = [f"🎫 <b>تذاكر الدعم الفني النشطة ({len(tickets)}):</b>\n"]
        for i, tk in enumerate(tickets, 1):
            p_badge = "🔴" if tk.priority in ("Urgent", "Critical") else ("🟠" if tk.priority == "High" else "🟡")
            num = tk.ticket_number or f"TK-{i}"
            t_lines.append(f"{i}. {p_badge} <b>#{num}: {tk.issue_title}</b>\n   الحالة: {tk.status} | القسم: {tk.category or 'عام'}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(t_lines),
            "tickets": [{"id": str(tk.id), "title": tk.issue_title, "status": tk.status} for tk in tickets],
        }

    # Handle 'cmd:my_custody'
    if action_str == "cmd:my_custody" or (prefix == "cmd" and action_name == "my_custody"):
        if not context.can_access_module("custody"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        custodies = (
            db.query(AssetCustody)
            .filter(
                AssetCustody.company_id == company_id,
                AssetCustody.employee_id == emp_id,
                AssetCustody.status == "Active",
            )
            .all()
        )

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="my_custody",
            status="Success",
            details={"custodies_count": len(custodies)},
            ip_address=ip_address,
        ))
        db.commit()

        if not custodies:
            return {
                "success": True,
                "status": "Success",
                "message": "ليس لديك أي عهد تقنية مسجلة حالياً.",
                "custodies": [],
            }

        c_lines = [f"💼 <b>عهدتك التقنية النشطة يا {emp_name} ({len(custodies)} أصول):</b>\n"]
        for i, c in enumerate(custodies, 1):
            ast = c.asset
            ast_name = ast.asset_name if ast else "أصل تقني"
            ast_code = ast.asset_code if ast else "-"
            model = ast.model if ast else ""
            ser = ast.serial_number if (ast and ast.serial_number) else "غير محدد"
            assign_date = c.assignment_date.strftime("%Y-%m-%d") if c.assignment_date else ""
            c_lines.append(
                f"{i}. 💻 <b>{ast_name}</b> ({ast_code})\n"
                f"   الموديل: {model} | الرقم التسلسلي: <code>{ser}</code>\n"
                f"   الحالة: {c.condition_on_assignment or 'جيدة'} | تاريخ الاستلام: {assign_date}"
            )
        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(c_lines),
            "custodies": [{"id": str(c.id), "asset_code": c.asset.asset_code if c.asset else None} for c in custodies],
        }

    # Handle 'cmd:assets'
    if action_str in ("cmd:assets", "cmd:all_assets") or (prefix == "cmd" and action_name == "assets"):
        if not context.can_access_module("assets"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        total_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id).count()
        in_use_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id, TechnicalAsset.status == "In Use").count()
        maint_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id, TechnicalAsset.status == "Maintenance").count()
        recent_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id).order_by(TechnicalAsset.created_at.desc()).limit(5).all()

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="assets_lookup",
            status="Success",
            details={"total_assets": total_assets},
            ip_address=ip_address,
        ))
        db.commit()

        a_lines = [
            f"💻 <b>سجل الأصول التقنية في المنشأة:</b>\n",
            f"• إجمالي الأصول: <b>{total_assets}</b> أصل",
            f"• قيد الاستخدام والعهدة: <b>{in_use_assets}</b>",
            f"• في الصيانة / الإصلاح: <b>{maint_assets}</b>\n",
            f"🔹 <b>أحدث الأصول المسجلة:</b>"
        ]
        for idx, a in enumerate(recent_assets, 1):
            s_badge = "🟢" if a.status in ("Available", "In Use") else ("🟡" if a.status == "Assigned" else "🔴")
            a_lines.append(f"{idx}. {s_badge} <b>{a.asset_name}</b> ({a.asset_code}) | {a.asset_type or 'عام'}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(a_lines),
            "total_assets": total_assets,
        }

    # Handle 'cmd:subscriptions'
    if action_str in ("cmd:subscriptions", "cmd:subs") or (prefix == "cmd" and action_name == "subscriptions"):
        if not context.can_access_module("subscriptions"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        subs = (
            db.query(ThirdPartySubscription)
            .filter(
                ThirdPartySubscription.company_id == company_id,
            )
            .order_by(ThirdPartySubscription.renewal_date.asc().nullslast())
            .limit(8)
            .all()
        )

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="subscriptions_lookup",
            status="Success",
            details={"subs_count": len(subs)},
            ip_address=ip_address,
        ))
        db.commit()

        if not subs:
            return {
                "success": True,
                "status": "Success",
                "message": "لا توجد اشتراكات أو تراخيص برمجية نشطة مسجلة حالياً.",
                "subscriptions": [],
            }

        s_lines = [f"💳 <b>الاشتراكات والتراخيص السحابية النشطة ({len(subs)}):</b>\n"]
        for i, sb in enumerate(subs, 1):
            ren_date = sb.renewal_date.strftime("%Y-%m-%d") if sb.renewal_date else "تجديد تلقائي"
            cost_str = f"{sb.price} {sb.currency}" if sb.price is not None else "غير محدد"
            s_lines.append(f"{i}. 🌐 <b>{sb.service_name}</b> ({sb.provider or 'مزود خارجي'})\n   تاريخ التجديد: {ren_date} | التكلفة: {cost_str}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(s_lines),
            "subscriptions": [{"id": str(sb.id), "service_name": sb.service_name} for sb in subs],
        }

    # Handle 'cmd:reports'
    if action_str in ("cmd:reports", "cmd:kpis") or (prefix == "cmd" and action_name == "reports"):
        if not context.can_access_module("reports"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        active_tasks = db.query(Task).filter(Task.company_id == company_id, Task.status.in_(["To Do", "In Progress", "Assigned", "Accepted"])).count()
        urgent_tasks = db.query(Task).filter(Task.company_id == company_id, Task.priority == "Urgent", Task.status != "Completed").count()
        open_tickets = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == company_id, HelpDeskTicket.status.in_(["New", "In Progress"])).count()
        total_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id).count()
        active_subs = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == company_id, ThirdPartySubscription.status == "Active").count()

        today = datetime.utcnow().date()
        overdue_tasks = db.query(Task).filter(Task.company_id == company_id, Task.due_date < today, Task.status.notin_(["Completed", "Cancelled"])).count()

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="reports_kpis",
            status="Success",
            ip_address=ip_address,
        ))
        db.commit()

        rep_lines = [
            f"📊 <b>التقرير والملخص التشغيلي اللحظي:</b>\n",
            f"📋 المهام التشغيلية النشطة: <b>{active_tasks}</b>",
            f"⚡ المهام العاجلة: <b>{urgent_tasks}</b>",
            f"⚠️ المهام المتأخرة عن موعدها: <b>{overdue_tasks}</b>",
            f"🎫 تذاكر الدعم الفني المفتوحة: <b>{open_tickets}</b>",
            f"💻 الأصول التقنية الإجمالية: <b>{total_assets}</b>",
            f"💳 الاشتراكات والتراخيص النشطة: <b>{active_subs}</b>\n",
            f"🕒 تم التحديث في: <code>{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</code>"
        ]

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(rep_lines),
        }

    # Handle 'cmd:notifications'
    if action_str in ("cmd:notifications", "cmd:notifs") or (prefix == "cmd" and action_name == "notifications"):
        if not context.can_access_module("notifications"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        notifs = (
            db.query(Notification)
            .filter(Notification.company_id == company_id)
            .order_by(Notification.created_at.desc())
            .limit(5)
            .all()
        )

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="notifications_lookup",
            status="Success",
            ip_address=ip_address,
        ))
        db.commit()

        if not notifs:
            return {
                "success": True,
                "status": "Success",
                "message": "🔔 لا توجد إشعارات جديدة حالياً.",
                "notifications": [],
            }

        n_lines = [f"🔔 <b>أحدث الإشعارات والتنبيهات ({len(notifs)}):</b>\n"]
        for i, n in enumerate(notifs, 1):
            dt_str = n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else ""
            n_lines.append(f"{i}. <b>{n.title}</b>\n   {n.message}\n   🕒 {dt_str}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(n_lines),
        }

    # Handle 'cmd:search'
    if action_str.startswith("cmd:search") or (prefix == "cmd" and action_name == "search"):
        if not context.can_access_module("search"):
            return {"success": False, "status": "Forbidden", "message": "ليس لديك صلاحية لتنفيذ هذا الإجراء."}

        query_str = target_id_str.strip() if target_id_str else ""
        if not query_str:
            return {
                "success": True,
                "status": "Success",
                "message": (
                    "🔍 <b>البحث السريع في Investor Gate OS:</b>\n\n"
                    "للبحث عن المهام أو التذاكر أو الأصول، أرسل الأمر:\n"
                    "<code>/search &lt;كلمة_البحث&gt;</code>\n\n"
                    "أمثلة:\n"
                    "• <code>/search طابعة</code>\n"
                    "• <code>/search خادم</code>\n"
                    "• <code>/search شبكة</code>"
                )
            }

        s_term = f"%{query_str}%"
        matched_tasks = db.query(Task).filter(Task.company_id == company_id, Task.title.ilike(s_term)).limit(3).all()
        matched_tickets = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == company_id, HelpDeskTicket.issue_title.ilike(s_term)).limit(3).all()
        matched_assets = []
        if context.can_access_module("assets"):
            matched_assets = db.query(TechnicalAsset).filter(
                TechnicalAsset.company_id == company_id,
                or_(TechnicalAsset.asset_name.ilike(s_term), TechnicalAsset.asset_code.ilike(s_term))
            ).limit(3).all()

        total_matches = len(matched_tasks) + len(matched_tickets) + len(matched_assets)
        if total_matches == 0:
            return {
                "success": True,
                "status": "Success",
                "message": f"🔍 لم يتم العثور على أي نتائج مطابقة لـ: «<b>{query_str}</b>».",
            }

        res_lines = [f"🔍 <b>نتائج البحث عن «{query_str}» ({total_matches} نتيجة):</b>\n"]
        if matched_tasks:
            res_lines.append("📋 <b>المهام المطابقة:</b>")
            for t in matched_tasks:
                res_lines.append(f"• #{t.title} (الحالة: {t.status})")
            res_lines.append("")

        if matched_tickets:
            res_lines.append("🎫 <b>التذاكر المطابقة:</b>")
            for tk in matched_tickets:
                res_lines.append(f"• #{tk.ticket_number or tk.id.hex[:6]}: {tk.issue_title} ({tk.status})")
            res_lines.append("")

        if matched_assets:
            res_lines.append("💻 <b>الأصول المطابقة:</b>")
            for ast in matched_assets:
                res_lines.append(f"• {ast.asset_name} ({ast.asset_code}) - {ast.status}")

        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(res_lines),
        }

    # Handle 'cmd:overdue'
    if action_str == "cmd:overdue" or (prefix == "cmd" and action_name == "overdue"):
        today = datetime.utcnow().date()
        query = db.query(Task).filter(
            Task.company_id == company_id,
            Task.due_date < today,
            Task.status.notin_(["Completed", "Cancelled"]),
        )
        if not is_privileged:
            query = query.filter(Task.assigned_to_id == emp_id)
        overdue_tasks = query.order_by(Task.due_date.asc()).limit(10).all()

        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action="overdue_tasks",
            status="Success",
            details={"overdue_count": len(overdue_tasks)},
            ip_address=ip_address,
        ))
        db.commit()

        if not overdue_tasks:
            return {
                "success": True,
                "status": "Success",
                "message": "🎉 ممتاز! لا توجد أي مهام متأخرة عن موعد استحقاقها حالياً.",
                "tasks": [],
            }

        o_lines = [f"⚠️ <b>تنبيه المهام المتأخرة ({len(overdue_tasks)} مهام):</b>\n"]
        for i, t in enumerate(overdue_tasks, 1):
            days_late = (today - t.due_date).days if t.due_date else 0
            p_badge = "🔴" if t.priority == "Urgent" else ("🟠" if t.priority == "High" else "🟡")
            o_lines.append(f"{i}. {p_badge} <b>{t.title}</b>\n   متأخرة بـ {days_late} يوم | الحالة: {t.status}")
        return {
            "success": True,
            "status": "Success",
            "message": "\n".join(o_lines),
            "tasks": [{"id": str(t.id), "title": t.title, "status": t.status} for t in overdue_tasks],
        }

    # Handle 'cmd:toggle_notifs'
    if action_str == "cmd:toggle_notifs" or (prefix == "cmd" and action_name == "toggle_notifs"):
        current_pref = getattr(link, "notifications_enabled", True)
        new_pref = not current_pref
        link.notifications_enabled = new_pref
        db.commit()
        status_txt = "تفعيل 🔔" if new_pref else "كتم وتعديل 🔕"
        return {
            "success": True,
            "status": "Success",
            "message": f"تم {status_txt} إشعارات تيليجرام لحسابك بنجاح.",
            "notifications_enabled": new_pref,
        }

    # Handle 'cmd:settings'
    if action_str in ("cmd:settings", "cmd:my_settings") or (prefix == "cmd" and action_name == "settings"):
        pref = "مفعلة 🔔" if getattr(link, "notifications_enabled", True) else "مكتومة 🔕"
        roles_str = "، ".join(context.roles) if context.roles else "موظف"
        settings_msg = (
            f"⚙️ <b>إعدادات وبيانات حسابك في Investor Gate OS:</b>\n\n"
            f"👤 الموظف: <b>{emp_name}</b>\n"
            f"🏢 المنشأة: <b>{employee.company.company_name_ar if employee.company else 'الشركة'}</b>\n"
            f"🔑 الدور في النظام: <b>{roles_str}</b>\n"
            f"📱 معرف تيليجرام: <code>{clean_user_id}</code>\n"
            f"🔔 حالة استلام الإشعارات: <b>{pref}</b>\n\n"
            f"للتبديل بين تفعيل وكتم الإشعارات أرسل /mute أو /unmute"
        )
        return {
            "success": True,
            "status": "Success",
            "message": settings_msg,
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {"text": "🛡️ عرض صلاحياتي", "callback_data": "cmd:my_permissions"},
                        {"text": "🏠 القائمة الرئيسية", "callback_data": "cmd:main_menu"},
                    ]
                ]
            },
        }

    # Handle 'cmd:my_permissions'
    if action_str in ("cmd:my_permissions", "cmd:permissions") or (prefix == "cmd" and action_name in ("my_permissions", "permissions")):
        roles_str = "، ".join(context.roles) if context.roles else "موظف"
        scope_map = {
            "Self": "بياناتي وتكليفاتي فقط (Self-only)",
            "Branch": "فرعي الحالي (Branch-wide)",
            "Company": "كامل المنشأة (Company-wide)",
        }
        scope_txt = scope_map.get(getattr(link, "data_scope", "Self"), "بياناتي وتكليفاتي فقط")

        allowed_list = context.allowed_modules
        all_meta = [
            ("tasks", "📋 المهام التشغيلية: استعراض وتحديث وتأكيد استلام المهام"),
            ("tickets", "🎫 تذاكر الدعم الفني: متابعة وتحديث التذاكر"),
            ("custody", "💼 العهدة والأصول: استعراض الأجهزة المستلمة"),
            ("assets", "💻 الأصول التقنية: متابعة أصول المنشأة الفنية"),
            ("subscriptions", "💳 الاشتراكات: متابعة تراخيص البرمجيات والتجديدات"),
            ("reports", "📊 التقارير: الاطلاع على مؤشرات الأداء والعمليات"),
            ("notifications", "🔔 الإشعارات: استعراض سجل التنبيهات"),
            ("search", "🔍 البحث الفوري: البحث في السجلات المصرح بها"),
        ]
        mods_lines = []
        for m_id, m_label in all_meta:
            status_icon = "✅" if m_id in allowed_list else "⛔"
            mods_lines.append(f"{status_icon} {m_label}")

        notif_status = "مفعلة 🔔" if getattr(link, "notifications_enabled", True) else "معطلة 🔕"

        perm_msg = (
            f"🛡️ <b>صلاحياتك المعتمدة في مركز عمليات Telegram:</b>\n\n"
            f"👤 الموظف: <b>{emp_name}</b>\n"
            f"🏢 المنشأة: <b>{employee.company.company_name_ar if employee.company else 'الشركة'}</b>\n"
            f"🔑 الدور في النظام (CRM): <b>{roles_str}</b>\n"
            f"🌐 نطاق الوصول للبيانات: <b>{scope_txt}</b>\n"
            f"🔔 استلام الإشعارات: <b>{notif_status}</b>\n\n"
            f"<b>حالة الوحدات المصرح بها:</b>\n" +
            "\n".join(mods_lines) +
            "\n\n<i>ملاحظة: لا يمكن تعديل هذه الصلاحيات إلا من خلال لوحة تحكم المسؤول في النظام.</i>"
        )
        return {
            "success": True,
            "status": "Success",
            "message": perm_msg,
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {"text": "📋 مهامي النشطة", "callback_data": "cmd:my_tasks"},
                        {"text": "🏠 القائمة الرئيسية", "callback_data": "cmd:main_menu"},
                    ]
                ]
            },
        }

    # Handle 'cmd:main_menu'
    if action_str in ("cmd:main_menu", "cmd:home", "cmd:start_menu") or (prefix == "cmd" and action_name in ("main_menu", "home")):
        menu_kb = [
            [
                {"text": "📋 مهامي التشغيلية", "callback_data": "cmd:my_tasks"},
                {"text": "🎫 تذاكر الدعم", "callback_data": "cmd:my_tickets"},
            ],
            [
                {"text": "💼 الأصول والعهدة", "callback_data": "cmd:my_custody"},
                {"text": "🛡️ صلاحياتي", "callback_data": "cmd:my_permissions"},
            ],
            [
                {"text": "🔔 الإشعارات", "callback_data": "cmd:notifications"},
                {"text": "⚙️ إعداداتي", "callback_data": "cmd:settings"},
            ],
        ]
        if context.can_access_module("assets"):
            menu_kb.insert(2, [
                {"text": "💻 الأصول التقنية", "callback_data": "cmd:assets"},
                {"text": "💳 الاشتراكات", "callback_data": "cmd:subscriptions"},
            ])
        if context.can_access_module("reports"):
            menu_kb.insert(3, [
                {"text": "📊 تقارير العمليات", "callback_data": "cmd:reports"},
            ])

        return {
            "success": True,
            "status": "Success",
            "message": (
                f"🏠 <b>القائمة الرئيسية — مركز عمليات Investor Gate OS</b>\n\n"
                f"مرحباً بك يا <b>{emp_name}</b>\n"
                f"🏢 المنشأة: <b>{employee.company.company_name_ar if employee.company else 'الشركة'}</b>\n\n"
                f"اختر العملية أو الوحدة التي تريد إدارتها من الأزرار التفاعلية أدناه:"
            ),
            "reply_markup": {"inline_keyboard": menu_kb},
        }

    # Handle 'cmd:portal'
    if action_str in ("cmd:portal", "url:web_portal") or (prefix == "cmd" and action_name == "portal"):
        portal_url = settings.FRONTEND_URL or "http://192.168.8.137:3000"
        return {
            "success": True,
            "status": "Success",
            "message": (
                f"🌐 <b>بوابة Investor Gate OS الرقمية:</b>\n\n"
                f"يمكنك فتح لوحة التحكم السحابية وإدارة جميع العمليات عبر الرابط:\n"
                f"{portal_url}\n\n"
                f"تسجيل الدخول متاح للمستخدمين المصرح لهم عبر بروتوكولات الأمان المؤسسية."
            ),
        }

    # Handle 'cmd:help'
    if action_str in ("cmd:help", "cmd:guide") or (prefix == "cmd" and action_name == "help"):
        guide_text = (
            "ℹ️ <b>دليل مركز عمليات Investor Gate OS عبر Telegram:</b>\n\n"
            "• <b>📋 مهامي (/tasks)</b>: استعراض المهام التشغيلية وتأكيد استلامها وتحديث حالتها.\n"
            "• <b>🎫 تذاكري (/tickets)</b>: متابعة تذاكر الدعم الفني النشطة.\n"
            "• <b>💼 عهدتي (/custody)</b>: عرض الأجهزة والعهد التقنية المستلمة.\n"
            "• <b>💻 الأصول (/assets)</b>: استعراض أصول المنشأة الفنية للمصرح لهم.\n"
            "• <b>💳 الاشتراكات (/subscriptions)</b>: متابعة تراخيص البرمجيات والتجديدات.\n"
            "• <b>📊 التقارير (/reports)</b>: المؤشرات اللحظية لأداء العمليات.\n"
            "• <b>🔍 بحث سريع (/search &lt;كلمة&gt;)</b>: بحث فوري عبر جميع السجلات.\n"
            "• <b>🔔 الإشعارات (/notifications)</b>: استعراض أحدث التنبيهات.\n"
            "• <b>⚙️ إعداداتي (/settings)</b>: إعدادات الإشعارات والحساب."
        )
        return {
            "success": True,
            "status": "Success",
            "message": guide_text,
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
    if task.company_id != company_id and not (context.user and context.user.is_superadmin):
        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action=action_name,
            task_id=task_id,
            status="Unauthorized",
            error_message="محاولة وصول لبيانات شركة أخرى (Cross-company violation)",
            ip_address=ip_address,
        ))
        db.commit()
        return {
            "success": False,
            "status": "Unauthorized",
            "message": "⛔ غير مصرح لك بالوصول لمهام منشأة أخرى.",
        }

    # 4. Enforce Task Ownership & RBAC
    is_assignee = (task.assigned_to_id == emp_id)
    if not is_assignee and not is_privileged:
        db.add(TelegramActionLog(
            company_id=company_id,
            telegram_user_id=clean_user_id,
            telegram_chat_id=str(telegram_chat_id) if telegram_chat_id else link.telegram_chat_id,
            action=action_name,
            task_id=task_id,
            status="Unauthorized",
            error_message="الموظف ليس هو الفني المسند إليه المهمة ولا يملك صلاحية إدارية",
            ip_address=ip_address,
        ))
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
    custom_reply_markup = None

    if action_name == "info":
        due_str = task.due_date.strftime("%Y-%m-%d") if task.due_date else "غير محدد"
        ack_str = f"تم الاستلام ({task.acknowledged_at.strftime('%Y-%m-%d %H:%M')})" if getattr(task, "acknowledged_at", None) else "بانتظار الاستلام"
        response_msg = (
            f"📋 <b>تفاصيل المهمة #{task.title}</b>\n"
            f"🔹 <b>الحالة:</b> {task.status}\n"
            f"⚡ <b>الأولوية:</b> {task.priority}\n"
            f"📅 <b>الاستحقاق:</b> {due_str}\n"
            f"📨 <b>حالة الاستلام:</b> {ack_str}\n"
            f"📄 <b>الوصف الكامل:</b> {task.description or 'لا يوجد وصف'}\n"
            f"👤 <b>المسؤول:</b> {emp_name}"
        )

    elif action_name in ("ack", "acknowledge"):
        now_utc = datetime.utcnow()
        if getattr(task, "acknowledged_at", None):
            response_msg = f"ℹ️ تم تأكيد استلام هذه المهمة مسبقاً في: {task.acknowledged_at.strftime('%Y-%m-%d %H:%M UTC')}."
        else:
            task.acknowledged_at = now_utc
            if task.status in ("Assigned", "To Do"):
                task.status = "Accepted"
                task.accepted_at = now_utc
            db.commit()

            from app.services.audit_service import log_audit
            try:
                log_audit(
                    db=db,
                    action="TASK_ACKNOWLEDGED",
                    resource_type="Task",
                    resource_id=str(task.id),
                    user_id=link.user_id if link.user else None,
                    company_id=company_id,
                    new_values={"acknowledged_at": str(now_utc), "acknowledged_by": emp_name},
                )
            except Exception:
                pass

            response_msg = f"✅ شكراً لك يا {emp_name}، تم تسجيل تأكيد استلام المهمة بنجاح، بالتوفيق في إنجازها!"

    elif action_name in WORKFLOW_BOT_ACTIONS:
        log_status, error_msg, response_msg, custom_reply_markup = run_bot_workflow_action(
            db, context, link, task, action_name, rejection_reason_arg)

    elif action_name == "approve":
        if not is_privileged:
            log_status = "Unauthorized"
            error_msg = "اعتماد المهمة يتطلب صلاحية إدارية"
            response_msg = "⛔ اعتماد المهمة يتطلب صلاحية مدير معتمد."
        elif task.status != "Submitted for Review":
            log_status = "InvalidTransition"
            error_msg = f"المهمة ليست بانتظار الاعتماد (الحالة: {task.status})"
            response_msg = f"⚠️ المهمة بحالة ({task.status})، ولا يمكن اعتمادها إلا عندما تكون (قيد المراجعة والاعتماد)."
        else:
            task.status = "Completed"
            task.completed_at = datetime.utcnow()
            task.reviewer_id = link.user_id if link.user_id else None
            db.commit()
            enqueue_task_notification(db, task, "task.approved", extra_payload={"approved_by": emp_name})
            response_msg = f"✅ تم اعتماد المهمة #{task.title} رسمياً وإغلاقها بنجاح بواسطة المدير {emp_name}."

    elif action_name == "rework":
        if not is_privileged:
            log_status = "Unauthorized"
            error_msg = "طلب إعادة العمل يتطلب صلاحية إدارية"
            response_msg = "⛔ طلب إعادة العمل يتطلب صلاحية مدير."
        elif task.status != "Submitted for Review":
            log_status = "InvalidTransition"
            error_msg = f"المهمة ليست بانتظار المراجعة (الحالة: {task.status})"
            response_msg = f"⚠️ المهمة بحالة ({task.status})، ولا يمكن طلب إعادة العمل إلا عند المراجعة."
        else:
            task.status = "Rework Required"
            task.rework_count = (task.rework_count or 0) + 1
            task.reviewer_id = link.user_id if link.user_id else None
            db.commit()
            enqueue_task_notification(db, task, "task.rework_requested", extra_payload={"reviewer_name": emp_name})
            response_msg = f"🔄 تم إعادة المهمة #{task.title} للفني لإجراء التعديلات والملاحظات المطلوبة."

    else:
        log_status = "Failed"
        error_msg = f"إجراء غير معروف: {action_name}"
        response_msg = "⚠️ إجراء غير مدعوم."

    # Record Action Log
    db.add(TelegramActionLog(
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
    ))
    db.commit()

    if custom_reply_markup:
        effective_reply_markup = custom_reply_markup
    else:
        db.refresh(task)
        effective_reply_markup = task_keyboard(task, can_act=(is_assignee or is_privileged), can_manage=is_privileged)

    return {
        "success": (log_status == "Success"),
        "status": log_status,
        "action": action_name,
        "task_id": str(task_id),
        "task_title": task.title,
        "new_status": task.status,
        "message": response_msg,
        "reply_markup": effective_reply_markup,
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
    existing_actions = {e.action for e in existing}

    defaults = [
        {
            "label": "📋 مهامي",
            "action": "cmd:my_tasks",
            "menu_type": "reply_keyboard",
            "sort_order": 1,
            "is_enabled": True,
            "icon": "📋",
            "description_ar": "استعراض المهام التشغيلية المسندة إليك وتحديث حالتها",
        },
        {
            "label": "🎫 تذاكري",
            "action": "cmd:my_tickets",
            "menu_type": "reply_keyboard",
            "sort_order": 2,
            "is_enabled": True,
            "icon": "🎫",
            "description_ar": "استعراض تذاكر الدعم الفني الخاصة بك",
        },
        {
            "label": "💼 عهدتي",
            "action": "cmd:my_custody",
            "menu_type": "reply_keyboard",
            "sort_order": 3,
            "is_enabled": True,
            "icon": "💼",
            "description_ar": "استعراض الأجهزة والعهد التقنية المستلمة",
        },
        {
            "label": "💻 الأصول",
            "action": "cmd:assets",
            "menu_type": "reply_keyboard",
            "sort_order": 4,
            "is_enabled": True,
            "icon": "💻",
            "description_ar": "استعراض وإدارة الأصول الفنية للمصرح لهم",
        },
        {
            "label": "📊 التقارير",
            "action": "cmd:reports",
            "menu_type": "reply_keyboard",
            "sort_order": 5,
            "is_enabled": True,
            "icon": "📊",
            "description_ar": "مؤشرات الأداء اللحظية والملخص التشغيلي",
        },
        {
            "label": "💳 الاشتراكات",
            "action": "cmd:subscriptions",
            "menu_type": "reply_keyboard",
            "sort_order": 6,
            "is_enabled": True,
            "icon": "💳",
            "description_ar": "متابعة تراخيص البرمجيات والاشتراكات السحابية",
        },
        {
            "label": "🔍 بحث سريع",
            "action": "cmd:search",
            "menu_type": "reply_keyboard",
            "sort_order": 7,
            "is_enabled": True,
            "icon": "🔍",
            "description_ar": "البحث الفوري في المهام والتذاكر والأصول",
        },
        {
            "label": "🔔 الإشعارات",
            "action": "cmd:notifications",
            "menu_type": "reply_keyboard",
            "sort_order": 8,
            "is_enabled": True,
            "icon": "🔔",
            "description_ar": "استعراض أحدث التنبيهات والإشعارات",
        },
        {
            "label": "⚙️ إعداداتي",
            "action": "cmd:settings",
            "menu_type": "reply_keyboard",
            "sort_order": 9,
            "is_enabled": True,
            "icon": "⚙️",
            "description_ar": "إعدادات الإشعارات وبيانات الحساب",
        },
        {
            "label": "🛡️ صلاحياتي",
            "action": "cmd:my_permissions",
            "menu_type": "reply_keyboard",
            "sort_order": 10,
            "is_enabled": True,
            "icon": "🛡️",
            "description_ar": "استعراض الصلاحيات المعتمدة لحسابك في تيليجرام",
        },
        {
            "label": "ℹ️ المساعدة",
            "action": "cmd:help",
            "menu_type": "reply_keyboard",
            "sort_order": 11,
            "is_enabled": True,
            "icon": "ℹ️",
            "description_ar": "دليل استخدام أوامر البوت والدعم",
        },
    ]

    added = False
    for d in defaults:
        if d["action"] not in existing_actions:
            item = TelegramBotMenuConfig(company_id=company_id, **d)
            db.add(item)
            existing.append(item)
            added = True

    if added:
        db.commit()
        for item in existing:
            db.refresh(item)
    return sorted(existing, key=lambda x: x.sort_order)


def build_telegram_reply_keyboard(
    db: Session,
    company_id: uuid.UUID,
    context: Optional[TelegramIdentityContext] = None,
    user_link: Optional[TelegramUserLink] = None,
) -> Optional[Dict[str, Any]]:
    """Build dynamic reply keyboard markup for a company based on enabled menu items and user permissions."""
    if company_id is None:
        return None
    if user_link is not None:
        if user_link.company_id != company_id:
            return None
        context = context or resolve_telegram_identity(db, user_link.telegram_user_id, user_link.telegram_chat_id)
    items = [
        i for i in get_or_create_default_menu_configs(db, company_id)
        if i.menu_type == "reply_keyboard" and i.is_enabled
    ]

    if not items:
        return None

    # Filter by user permissions if context provided
    filtered_items = []
    for item in items:
        if context:
            action_key = item.action.split(":", 1)[1] if ":" in item.action else item.action
            mod_map = {
                "my_tasks": "tasks", "tasks": "tasks",
                "my_tickets": "tickets", "tickets": "tickets",
                "my_custody": "custody", "custody": "custody",
                "assets": "assets", "subscriptions": "subscriptions",
                "reports": "reports", "search": "search",
                "notifications": "notifications", "settings": "settings",
                "my_permissions": "settings", "permissions": "settings",
                "help": "help", "portal": "portal",
            }
            target_mod = mod_map.get(action_key, "tasks")
            if not context.can_access_module(target_mod):
                continue
        filtered_items.append(item)

    if not filtered_items:
        filtered_items = items

    # Arrange buttons into rows of up to 2 buttons
    keyboard_rows: List[List[Dict[str, str]]] = []
    current_row: List[Dict[str, str]] = []

    for item in filtered_items:
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

