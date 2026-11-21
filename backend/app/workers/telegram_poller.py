# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Standalone Telegram Bot Long-Polling Background Worker.

Designed for LAN-hosted private servers with strictly outbound internet connectivity (No Inbound Ports).
Uses Telegram Bot API `getUpdates` with offset tracking, exponential backoff on disconnects,
graceful signal handling, transactional outbox dispatching, and full RBAC integration.
"""

import os
import sys
import time
import signal
import json
import hashlib
import html
import secrets
import uuid
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, Any, List

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.core.config import settings
from app.models.company import Company
from app.models.integration import IntegrationConfig
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.models.ticket import HelpDeskTicket
from app.models.notification import Notification
from app.services.telegram_service import (
    dispatch_outbox_notifications,
    execute_bot_action,
    execute_pending_text,
    verify_telegram_link,
    resolve_telegram_identity,
    build_telegram_reply_keyboard,
    get_telegram_config,
    delete_telegram_webhook,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("TelegramPoller")

RUNNING = True
OFFSET_FILE = os.path.join(os.path.dirname(__file__), ".telegram_offset.json")


STATUS_FILE = os.path.join(os.path.dirname(__file__), ".telegram_worker_status.json")
POLL_HEALTH = {"last_successful_poll": None, "last_error": None}


def update_worker_status(offset: int, active_bots_count: int) -> None:
    """Record worker heartbeat and status to local file for API health checks."""
    try:
        data = {
            "is_running": True,
            "pid": os.getpid(),
            "last_heartbeat": datetime.utcnow().isoformat(),
            "offset": offset,
            "active_bots_count": active_bots_count,
            "mode": "Long-Polling (LAN Outbound)",
            **POLL_HEALTH,
        }
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        logger.debug(f"Failed to write worker status file: {e}")


def handle_signals(sig, frame):
    global RUNNING
    logger.info("Received termination signal. Gracefully shutting down Telegram poller...")
    RUNNING = False
    try:
        if os.path.exists(STATUS_FILE):
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump({"is_running": False, "pid": os.getpid(), "last_heartbeat": datetime.utcnow().isoformat()}, f)
    except Exception:
        pass


signal.signal(signal.SIGINT, handle_signals)
signal.signal(signal.SIGTERM, handle_signals)


def _bot_offset_key(bot_token: str) -> str:
    # Bot identity survives token rotation. Never persist credentials in offset files.
    return hashlib.sha256(bot_token.split(":", 1)[0].encode("utf-8")).hexdigest()


def load_offset(bot_token: Optional[str] = None, allow_legacy: bool = False) -> int:
    """Read a bot-specific cursor; migrate a legacy cursor only for a single bot."""
    if not os.path.exists(OFFSET_FILE):
        return 0
    with open(OFFSET_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if bot_token is None:
        return int(data.get("offset", 0))
    offsets = data.get("bot_offsets", {})
    key = _bot_offset_key(bot_token)
    if key in offsets:
        return int(offsets[key])
    if allow_legacy and not offsets:
        return int(data.get("offset", 0))
    return 0


def save_offset(offset: int, bot_token: Optional[str] = None) -> None:
    """Atomically persist progress after successful processing, retaining other bots."""
    data = {}
    if os.path.exists(OFFSET_FILE):
        with open(OFFSET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    if bot_token:
        data.setdefault("bot_offsets", {})[_bot_offset_key(bot_token)] = offset
    data.update(offset=offset, updated_at=datetime.utcnow().isoformat())
    temporary_path = OFFSET_FILE + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(temporary_path, OFFSET_FILE)



def get_active_bot_tokens(db: Session) -> List[Dict[str, Any]]:
    """Retrieve all configured and enabled Telegram bots across all companies."""
    configs = db.query(IntegrationConfig).filter(
        IntegrationConfig.service_name == "telegram",
        IntegrationConfig.is_enabled == True,
    ).all()

    tokens = []
    env_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if env_token and len(env_token) > 15:
        tokens.append({
            "company_id": None,
            "token": env_token,
            "username": "InvestorGateBot",
            "source": "environment",
        })

    for c in configs:
        if c.config_data and c.config_data.get("bot_token"):
            tok = c.config_data.get("bot_token").strip()
            if len(tok) > 15 and not any(t["token"] == tok for t in tokens):
                tokens.append({
                    "company_id": c.company_id,
                    "token": tok,
                    "username": c.config_data.get("bot_username", "InvestorGateBot"),
                    "source": f"company_{c.company_id}",
                })

    return tokens


def fetch_telegram_updates(bot_token: str, offset: int, timeout: int = 15) -> List[Dict[str, Any]]:
    """Long-poll Telegram Bot API using getUpdates (Strictly Outbound TLS)."""
    url = f"https://api.telegram.org/bot{bot_token}/getUpdates?offset={offset}&timeout={timeout}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "InvestorGateOS-Poller/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout + 5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                POLL_HEALTH.update(last_successful_poll=datetime.utcnow().isoformat(), last_error=None)
                return data.get("result", [])
            raise RuntimeError("Telegram getUpdates returned ok=false")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        category = "webhook conflict" if "webhook" in error_body.lower() else "another poller conflict" if e.code == 409 else "API failure"
        POLL_HEALTH["last_error"] = f"getUpdates HTTP {e.code}: {category}"
        if category == 'webhook conflict' and os.getenv('TELEGRAM_UPDATE_MODE', 'polling') == 'polling':
            delete_telegram_webhook(bot_token, drop_pending_updates=False)
        raise RuntimeError(POLL_HEALTH["last_error"]) from None
    except Exception as e:
        POLL_HEALTH["last_error"] = f"getUpdates failed ({type(e).__name__})"
        raise RuntimeError(POLL_HEALTH["last_error"]) from None


def send_telegram_reply(bot_token: str, chat_id: str, text: str, reply_markup: Optional[Dict] = None) -> None:
    """Send an immediate outbound reply to Telegram chat."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS-Poller/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except urllib.error.HTTPError as e:
        err_msg = ""
        try:
            err_msg = e.read().decode("utf-8")
        except Exception:
            pass
        if "can't parse entities" in err_msg.lower() or "entity" in err_msg.lower():
            try:
                payload.pop("parse_mode", None)
                req2 = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS-Poller/1.0"},
                )
                with urllib.request.urlopen(req2, timeout=10) as resp:
                    pass
                return
            except Exception:
                pass
        logger.error(f"Failed to send Telegram reply to chat {chat_id}: {e} - {err_msg}")
    except Exception as e:
        logger.error(f"Failed to send Telegram reply to chat {chat_id}: {e}")


def answer_callback_query(bot_token: str, callback_query_id: str, text: Optional[str] = None) -> None:
    """Acknowledge Telegram callback query to dismiss loading spinner."""
    url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
    payload = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS-Poller/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception as e:
        logger.debug(f"Failed to answer callback query {callback_query_id}: {e}")


def edit_telegram_message(bot_token: str, chat_id: str, message_id: int, text: str, reply_markup: Optional[Dict] = None) -> bool:
    """Edit an existing Telegram message in place for smooth interactive pagination and button updates."""
    url = f"https://api.telegram.org/bot{bot_token}/editMessageText"
    payload = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "InvestorGateOS-Poller/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True
    except Exception as e:
        logger.debug(f"editMessageText failed (fallback to sendMessage): {e}")
        return False


def process_telegram_update(db: Session, bot_token: str, update: Dict[str, Any]) -> None:
    """Process incoming message or callback_query from Telegram."""
    # 1. Handle Callback Query (Inline Button Press)
    if "callback_query" in update:
        cb = update["callback_query"]
        cb_id = cb.get("id")
        user_id = str(cb.get("from", {}).get("id", ""))
        chat_id = str(cb.get("message", {}).get("chat", {}).get("id", ""))
        msg_id = cb.get("message", {}).get("message_id")
        action_str = cb.get("data", "")

        logger.info(f"Processing callback query '{action_str}' from Telegram User {user_id}")
        if cb_id:
            answer_callback_query(bot_token, cb_id, "تم استلام الإجراء")

        context = resolve_telegram_identity(db, user_id, chat_id)
        if context.is_authorized:
            configured, expected_token, _ = get_telegram_config(db, context.company_id)
            if not configured or not secrets.compare_digest(expected_token, bot_token):
                send_telegram_reply(bot_token, chat_id, 'هذا الحساب مرتبط ببوت منشأة أخرى.')
                return

        res = execute_bot_action(
            db=db,
            telegram_user_id=user_id,
            telegram_chat_id=chat_id,
            action_str=action_str,
            ip_address="telegram_long_polling",
        )
        # Edit message in place for smooth interaction, or fallback to new reply
        edited = False
        if msg_id:
            edited = edit_telegram_message(
                bot_token=bot_token,
                chat_id=chat_id,
                message_id=msg_id,
                text=res.get("message", "تم تنفيذ الإجراء بنجاح"),
                reply_markup=res.get("reply_markup"),
            )
        if not edited:
            send_telegram_reply(
                bot_token=bot_token,
                chat_id=chat_id,
                text=res.get("message", "تم تنفيذ الإجراء بنجاح"),
                reply_markup=res.get("reply_markup"),
            )
        return

    # 2. Handle Text Message
    if "message" in update:
        msg = update["message"]
        text = msg.get("text", "").strip()
        chat_id = str(msg.get("chat", {}).get("id", ""))
        user_info = msg.get("from", {})
        user_id = str(user_info.get("id", ""))
        username = user_info.get("username", "")

        if not text:
            return

        # Resolve employee link if exists for company keyboard
        user_link = db.query(TelegramUserLink).filter(
            TelegramUserLink.telegram_user_id == user_id,
            TelegramUserLink.is_verified == True,
        ).first()
        company_id = user_link.company_id if user_link else None
        if user_link:
            context = resolve_telegram_identity(db, user_id, chat_id)
            configured, expected_token, _ = get_telegram_config(db, user_link.company_id)
            if not context.is_authorized:
                send_telegram_reply(bot_token, chat_id, context.error_message)
                return
            if not configured or not secrets.compare_digest(expected_token, bot_token):
                send_telegram_reply(bot_token, chat_id, 'هذا الحساب مرتبط ببوت منشأة أخرى.')
                return
        reply_kb = build_telegram_reply_keyboard(db, company_id, user_link=user_link) if company_id else None

        # /start or /start <token>
        if text.split(None, 1)[0].split("@", 1)[0] == "/start":
            parts = text.split(None, 1)
            token_val = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
            if token_val:
                # Linking token provided!
                try:
                    link = verify_telegram_link(
                        db=db,
                        token=token_val,
                        telegram_user_id=user_id,
                        telegram_chat_id=chat_id,
                        telegram_username=username,
                        bot_token=bot_token,
                    )
                    emp_name = link.get("employee_name", "الموظف") if isinstance(link, dict) else (link.employee.full_name if getattr(link, "employee", None) else "الموظف")
                    company_name = link.get("company_name", "الشركة") if isinstance(link, dict) else "الشركة"
                    
                    company_id = uuid.UUID(link['company_id'])
                    fresh_user_link = db.query(TelegramUserLink).filter(TelegramUserLink.telegram_user_id == user_id, TelegramUserLink.is_verified == True).first()
                    fresh_kb = build_telegram_reply_keyboard(db, company_id, user_link=fresh_user_link)

                    welcome_msg = (
                        f"🎉 <b>تم ربط حسابك بنجاح يا {html.escape(emp_name)}!</b>\n"
                        f"🏢 المنشأة: <b>{html.escape(company_name)}</b>\n\n"
                        f"أهلاً بك في <b>مركز عمليات Investor Gate OS</b>.\n"
                        f"ستصلك إشعارات وتكليفات المهام التشغيلية مباشرة هنا مع إمكانية التفاعل الفوري.\n\n"
                        f"💡 استخدم أزرار القائمة أدناه للوصول السريع إلى مهامك وتذاكرك وأصولك."
                    )
                    send_telegram_reply(bot_token, chat_id, welcome_msg, reply_markup=fresh_kb)
                except Exception as e:
                    db.rollback()
                    message = str(e) if isinstance(e, ValueError) else "تعذر إكمال المعالجة. يرجى مراجعة المسؤول"
                    send_telegram_reply(bot_token, chat_id, f"⚠️ <b>تعذر ربط الحساب:</b> {html.escape(message)}")
            else:
                if user_link and user_link.is_verified:
                    emp_name = user_link.employee.full_name if user_link.employee else "الموظف"
                    company_name = user_link.company.company_name_ar if user_link.company else "الشركة"
                    send_telegram_reply(
                        bot_token,
                        chat_id,
                        f"👋 <b>مرحباً بك يا {html.escape(emp_name)}!</b>\n"
                        f"🏢 المنشأة: <b>{html.escape(company_name)}</b>\n\n"
                        f"أنت متصل بمركز عمليات <b>Investor Gate OS</b> عبر Telegram.\n"
                        f"استخدم أزرار القائمة السريعة أدناه لإدارة عملياتك أو البحث في النظام.",
                        reply_markup=reply_kb,
                    )
                else:
                    send_telegram_reply(
                        bot_token,
                        chat_id,
                        "👋 <b>مرحباً بك في بوت Investor Gate OS التشغيلي!</b>\n\n"
                        "⚠️ حساب Telegram هذا غير مرتبط بأي موظف في النظام حتى الآن.\n\n"
                        "<b>لربط حسابك الوظيفي:</b>\n"
                        "1. افتح صفحتك الشخصية في نظام Investor Gate OS.\n"
                        "2. انقر على «ربط Telegram» ثم اضغط «نسخ الأمر».\n"
                        "3. الصق الأمر هنا في المحادثة وأرسله بالشكل التالي:\n"
                        "<code>/start &lt;رمز_الربط&gt;</code>\n\n"
                        "💡 إذا لم يكن لديك رمز ربط، يرجى مراجعة مسؤول النظام أو مديرك المباشر.",
                    )
            return

        # Free-text answer to a pending prompt (clarification question / custom rejection reason).
        # Handled BEFORE keyword command parsing so the text is bound to the exact employee + task.
        if user_link and user_link.is_verified and not text.startswith("/"):
            pending_res = execute_pending_text(db, user_id, chat_id, text)
            if pending_res is not None:
                send_telegram_reply(bot_token, chat_id, pending_res.get("message", ""),
                                    reply_markup=pending_res.get("reply_markup") or reply_kb)
                return

        # Direct token fallback (if employee pastes just the token without /start)
        if "_" in text or (len(text) == 6 and text.isdigit()):
            try:
                link = verify_telegram_link(
                    db=db,
                    token=text.strip(),
                    telegram_user_id=user_id,
                    telegram_chat_id=chat_id,
                    telegram_username=username,
                    bot_token=bot_token,
                )
                emp_name = link.get("employee_name", "الموظف") if isinstance(link, dict) else (link.employee.full_name if getattr(link, "employee", None) else "الموظف")
                company_name = link.get("company_name", "الشركة") if isinstance(link, dict) else "الشركة"
                company_id = uuid.UUID(link['company_id'])
                fresh_user_link = db.query(TelegramUserLink).filter(TelegramUserLink.telegram_user_id == user_id, TelegramUserLink.is_verified == True).first()
                fresh_kb = build_telegram_reply_keyboard(db, company_id, user_link=fresh_user_link)
                welcome_msg = (
                    f"🎉 <b>تم ربط حسابك بنجاح يا {html.escape(emp_name)}!</b>\n"
                    f"🏢 المنشأة: <b>{html.escape(company_name)}</b>\n\n"
                    f"أهلاً بك في <b>مركز عمليات Investor Gate OS</b>.\n"
                    f"ستصلك إشعارات وتكليفات المهام التشغيلية مباشرة هنا مع إمكانية التفاعل الفوري."
                )
                send_telegram_reply(bot_token, chat_id, welcome_msg, reply_markup=fresh_kb)
                return
            except Exception:
                db.rollback()
                pass

        # Unified Operations Hub command parsing
        cmd_clean = text.strip()
        cmd_lower = cmd_clean.lower().split("@")[0]
        cmd_action = None

        if cmd_lower in ("/tasks", "tasks") or "مهامي" in cmd_clean:
            cmd_action = "cmd:my_tasks"
        elif cmd_lower in ("/tickets", "tickets") or "تذاك" in cmd_clean or "تذاكر" in cmd_clean:
            cmd_action = "cmd:my_tickets"
        elif cmd_lower in ("/custody", "custody") or "عهد" in cmd_clean:
            cmd_action = "cmd:my_custody"
        elif cmd_lower in ("/assets", "assets") or "الأصول" in cmd_clean:
            cmd_action = "cmd:assets"
        elif cmd_lower in ("/subscriptions", "subscriptions") or "الاشتراكات" in cmd_clean or "اشتراكات" in cmd_clean:
            cmd_action = "cmd:subscriptions"
        elif cmd_lower in ("/reports", "reports") or "التقارير" in cmd_clean or "تقارير" in cmd_clean:
            cmd_action = "cmd:reports"
        elif cmd_lower in ("/notifications", "notifications") or "الإشعارات" in cmd_clean or "اشعارات" in cmd_clean:
            cmd_action = "cmd:notifications"
        elif cmd_lower.startswith("/search") or cmd_clean.startswith("بحث ") or cmd_clean in ("🔍 بحث سريع", "بحث سريع", "بحث"):
            if cmd_lower.startswith("/search"):
                parts = cmd_clean.split(None, 1)
                term = parts[1].strip() if len(parts) > 1 else ""
            elif cmd_clean.startswith("بحث "):
                term = cmd_clean[4:].strip()
            else:
                term = ""
            cmd_action = f"cmd:search:{term}"
        elif cmd_lower in ("/settings", "settings") or "إعداداتي" in cmd_clean:
            cmd_action = "cmd:settings"
        elif cmd_lower in ("/permissions", "permissions") or "صلاحياتي" in cmd_clean:
            cmd_action = "cmd:my_permissions"
        elif cmd_lower in ("/menu", "menu", "/main", "main") or "القائمة الرئيسية" in cmd_clean or cmd_clean == "الرئيسية":
            cmd_action = "cmd:main_menu"
        elif cmd_lower in ("/mute", "/unmute"):
            cmd_action = "cmd:toggle_notifs"
        elif cmd_lower in ("/portal", "portal") or "بوابة النظام" in cmd_clean:
            cmd_action = "cmd:portal"
        elif cmd_lower in ("/overdue", "overdue") or "متأخر" in cmd_clean:
            cmd_action = "cmd:overdue"
        elif cmd_lower in ("/help", "help") or "مساعدة" in cmd_clean or "دليل" in cmd_clean:
            cmd_action = "cmd:help"

        if cmd_action:
            res = execute_bot_action(
                db=db,
                telegram_user_id=user_id,
                telegram_chat_id=chat_id,
                action_str=cmd_action,
                ip_address="telegram_long_polling",
            )
            out_markup = res.get("reply_markup") or reply_kb
            send_telegram_reply(
                bot_token,
                chat_id,
                res.get("message", "تم استلام الطلب"),
                reply_markup=out_markup,
            )
            return

        # Fallback for unmapped messages
        if user_link and user_link.is_verified:
            send_telegram_reply(
                bot_token,
                chat_id,
                "💡 يمكنك استخدام أزرار القائمة أدناه أو إرسال /help لعرض قائمة الأوامر المتاحة.",
                reply_markup=reply_kb,
            )
        else:
            send_telegram_reply(
                bot_token,
                chat_id,
                "⚠️ حساب Telegram هذا غير مرتبط بنظام Investor Gate OS.\n"
                "لربط حسابك، أرسل الأمر:\n<code>/start &lt;رمز_الربط&gt;</code>",
            )
        return


def run_poller_loop(poll_interval: int = 3):
    """Main daemon loop running long-polling and transactional outbox dispatcher."""
    logger.info("Initializing Telegram Long-Polling Background Worker (LAN Outbound Mode)...")
    if os.getenv('TELEGRAM_UPDATE_MODE', 'polling') != 'polling':
        logger.info('Polling disabled: TELEGRAM_UPDATE_MODE is not polling')
        return
    init_db()

    offset = 0
    backoff_delay = 1
    last_outbox_check = 0

    while RUNNING:
        db: Session = SessionLocal()
        try:
            # 1. Dispatch any pending Transactional Outbox items every 5 seconds
            now_ts = time.time()
            if now_ts - last_outbox_check >= 5:
                try:
                    res = dispatch_outbox_notifications(db=db, limit=10)
                    processed = res.get("processed", 0) if isinstance(res, dict) else 0
                    if processed > 0:
                        logger.info(f"Dispatched {processed} pending notification(s) from transactional outbox.")
                except Exception as ex:
                    logger.debug(f"Outbox check exception: {ex}")
                last_outbox_check = now_ts

            # 2. Retrieve configured Telegram bots
            bot_configs = get_active_bot_tokens(db)
            update_worker_status(offset, len(bot_configs))

            if not bot_configs:
                # No bot tokens active yet; idle gracefully without consuming CPU
                time.sleep(poll_interval)
                continue

            for bot_item in bot_configs:
                token = bot_item["token"]
                bot_offset = load_offset(token, allow_legacy=len(bot_configs) == 1)
                updates = fetch_telegram_updates(bot_token=token, offset=bot_offset, timeout=10)

                for u in updates:
                    update_id = u.get("update_id", 0)
                    try:
                        process_telegram_update(db=db, bot_token=token, update=u)
                    except Exception as ex:
                        db.rollback()
                        logger.error("Update %s failed (%s)", update_id, type(ex).__name__)
                        POLL_HEALTH["last_error"] = f"Update {update_id} failed ({type(ex).__name__})"
                        # Keep a tenant-scoped, token-free failure record so the CRM can
                        # show the actual result instead of waiting indefinitely.
                        message = u.get("message", {})
                        text = message.get("text", "").strip()
                        parts = text.split(None, 1)
                        failed_link = None
                        if len(parts) == 2 and parts[0].split('@')[0] == '/start':
                            failed_link = db.query(TelegramUserLink).filter_by(verification_token=parts[1].strip()).first()
                        if failed_link is None and message.get('from', {}).get('id'):
                            failed_link = db.query(TelegramUserLink).filter_by(
                                telegram_user_id=str(message['from']['id']), is_verified=True,
                            ).first()
                        if failed_link is None:
                            # Never acknowledge an update whose failure cannot be durably
                            # recorded. Other bots can still progress independently.
                            break
                        if failed_link:
                            is_link_command = len(parts) == 2 and parts[0].split('@')[0] == '/start'
                            db.add(TelegramActionLog(
                                company_id=failed_link.company_id,
                                telegram_user_id=str(message.get('from', {}).get('id', 'unknown')),
                                action='verify_telegram_link' if is_link_command else 'worker_update_failed', status='Failed',
                                error_message='تعذر معالجة أمر الربط. يرجى إعادة الإرسال أو مراجعة المسؤول',
                                details={'employee_id':str(failed_link.employee_id), 'update_id':update_id,
                                         **({'token_ref':hashlib.sha256(parts[1].strip().encode()).hexdigest()} if is_link_command else {})},
                            ))
                            db.commit()
                        chat = message.get('chat', {})
                        if chat.get('type') == 'private' and chat.get('id'):
                            send_telegram_reply(token, str(chat['id']), 'تعذر معالجة الطلب. يرجى إعادة الإرسال أو مراجعة المسؤول')
                    bot_offset = max(bot_offset, update_id + 1)
                    save_offset(bot_offset, token)
                    offset = bot_offset
                    update_worker_status(offset, len(bot_configs))

                # Reset backoff on success
                backoff_delay = 1

        except Exception as e:
            db.rollback()
            logger.error("Error in Telegram poller loop (%s): %s", type(e).__name__, POLL_HEALTH.get('last_error') or 'Processing failed')
            update_worker_status(offset, len(bot_configs) if 'bot_configs' in locals() else 0)
            backoff_delay = min(backoff_delay * 2, 30)
            time.sleep(backoff_delay)
        finally:
            db.close()

        time.sleep(1)

    logger.info("Telegram Poller worker stopped cleanly.")


if __name__ == "__main__":
    # OS file locks are released on exit/crash, unlike a stale PID marker.
    # All supported launch commands use this entry point.
    lock_path = os.path.join(os.path.dirname(__file__), ".telegram_poller.lock")
    with open(lock_path, "a+b") as worker_lock:
        worker_lock.seek(0)
        if not worker_lock.read(1):
            worker_lock.write(b"0")
            worker_lock.flush()
        worker_lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(worker_lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(worker_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            logger.error("Another Telegram poller already holds the worker lock; exiting.")
            sys.exit(1)
        try:
            run_poller_loop()
        finally:
            worker_lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(worker_lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(worker_lock.fileno(), fcntl.LOCK_UN)
