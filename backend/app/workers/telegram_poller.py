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
    verify_telegram_link,
    build_telegram_reply_keyboard,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("TelegramPoller")

RUNNING = True
OFFSET_FILE = os.path.join(os.path.dirname(__file__), ".telegram_offset.json")


STATUS_FILE = os.path.join(os.path.dirname(__file__), ".telegram_worker_status.json")


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


def load_offset() -> int:
    """Load persistent update_id offset from local storage."""
    try:
        if os.path.exists(OFFSET_FILE):
            with open(OFFSET_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("offset", 0)
    except Exception as e:
        logger.warning(f"Failed to read offset file: {e}")
    return 0


def save_offset(offset: int) -> None:
    """Persist update_id offset to local file."""
    try:
        with open(OFFSET_FILE, "w", encoding="utf-8") as f:
            json.dump({"offset": offset, "updated_at": datetime.utcnow().isoformat()}, f)
    except Exception as e:
        logger.warning(f"Failed to save offset file: {e}")


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
                return data.get("result", [])
    except urllib.error.HTTPError as e:
        logger.error(f"Telegram API HTTP error {e.code}: {e.reason}")
    except Exception as e:
        logger.debug(f"getUpdates poll cycle notice: {e}")
    return []


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


def process_telegram_update(db: Session, bot_token: str, update: Dict[str, Any]) -> None:
    """Process incoming message or callback_query from Telegram."""
    # 1. Handle Callback Query (Inline Button Press)
    if "callback_query" in update:
        cb = update["callback_query"]
        cb_id = cb.get("id")
        user_id = str(cb.get("from", {}).get("id", ""))
        chat_id = str(cb.get("message", {}).get("chat", {}).get("id", ""))
        action_str = cb.get("data", "")

        logger.info(f"Processing callback query '{action_str}' from Telegram User {user_id}")
        if cb_id:
            answer_callback_query(bot_token, cb_id, "تم استلام الإجراء")

        res = execute_bot_action(
            db=db,
            telegram_user_id=user_id,
            telegram_chat_id=chat_id,
            action_str=action_str,
            ip_address="telegram_long_polling",
        )
        # Send confirmation message
        send_telegram_reply(bot_token, chat_id, res.get("message", "تم تنفيذ الإجراء بنجاح"))
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
        reply_kb = build_telegram_reply_keyboard(db, company_id) if company_id else None

        # /start or /start <token>
        if text.startswith("/start"):
            parts = text.split(" ")
            if len(parts) > 1 and parts[1].strip():
                # Linking token provided!
                token_val = parts[1].strip()
                try:
                    link = verify_telegram_link(
                        db=db,
                        token=token_val,
                        telegram_user_id=user_id,
                        telegram_chat_id=chat_id,
                        telegram_username=username,
                    )
                    emp_name = link.get("employee_name", "الموظف") if isinstance(link, dict) else (link.employee.full_name if getattr(link, "employee", None) else "الموظف")
                    company_name = link.get("company_name", "الشركة") if isinstance(link, dict) else "الشركة"
                    
                    # Fetch fresh reply keyboard after linking
                    fresh_kb = build_telegram_reply_keyboard(db, link.company_id if hasattr(link, 'company_id') else company_id)

                    welcome_msg = (
                        f"🎉 <b>تم ربط حسابك بنجاح يا {emp_name}!</b>\n"
                        f"🏢 المنشأة: <b>{company_name}</b>\n\n"
                        f"أهلاً بك في بوت <b>Investor Gate OS</b> التشغيلي.\n"
                        f"ستصلك إشعارات وتكليفات المهام التشغيلية مباشرة هنا مع إمكانية التفاعل الفوري.\n\n"
                        f"💡 استخدم أزرار القائمة أدناه للوصول السريع إلى مهامك وتذاكرك."
                    )
                    send_telegram_reply(bot_token, chat_id, welcome_msg, reply_markup=fresh_kb)
                except Exception as e:
                    send_telegram_reply(bot_token, chat_id, f"⚠️ <b>تعذر ربط الحساب:</b> {str(e)}")
            else:
                send_telegram_reply(
                    bot_token,
                    chat_id,
                    "👋 <b>مرحباً بك في بوت Investor Gate OS التشغيلي!</b>\n\n"
                    "لربط حسابك الوظيفي، يرجى الدخول على لوحة النظام -> الإعدادات -> التكاملات -> Telegram -> توليد رمز الربط، ثم النقر على رابط الربط السريع.\n\n"
                    "الأوامر المتاحة:\n"
                    "📋 /tasks - عرض مهامي التشغيلية النشطة\n"
                    "🎫 /tickets - عرض تذاكري النشطة\n"
                    "🔔 /notifications - عرض أحدث الإشعارات\n"
                    "ℹ️ /help - المساعدة والدعم",
                    reply_markup=reply_kb,
                )
            return

        # /tasks or 'مهامي'
        if text.startswith("/tasks") or "مهامي" in text:
            res = execute_bot_action(
                db=db,
                telegram_user_id=user_id,
                telegram_chat_id=chat_id,
                action_str="cmd:my_tasks",
                ip_address="telegram_long_polling",
            )
            send_telegram_reply(bot_token, chat_id, res.get("message", "لا توجد مهام نشطة"), reply_markup=reply_kb)
            return

        # /tickets or 'تذاكري'
        if text.startswith("/tickets") or "تذاكري" in text:
            if not user_link:
                send_telegram_reply(bot_token, chat_id, "⚠️ حساب التليجرام غير مرتبط بأي موظف معتمد في النظام.")
                return
            tickets = (
                db.query(HelpDeskTicket)
                .filter(
                    HelpDeskTicket.company_id == user_link.company_id,
                    HelpDeskTicket.status.in_(["New", "In Progress", "Pending Approval"]),
                )
                .order_by(HelpDeskTicket.created_at.desc())
                .limit(5)
                .all()
            )
            if not tickets:
                send_telegram_reply(bot_token, chat_id, "🎉 ليس لديك أي تذاكر دعم فني نشطة حالياً!", reply_markup=reply_kb)
            else:
                t_lines = [f"🎫 <b>تذاكر الدعم الفني النشطة ({len(tickets)}):</b>\n"]
                for i, tk in enumerate(tickets, 1):
                    p_badge = "🔴" if tk.priority in ("Urgent", "Critical") else ("🟠" if tk.priority == "High" else "🟡")
                    t_lines.append(f"{i}. {p_badge} <b>#{tk.ticket_number or i}: {tk.title}</b>\n   الحالة: {tk.status} | القسم: {tk.category or 'عام'}")
                send_telegram_reply(bot_token, chat_id, "\n".join(t_lines), reply_markup=reply_kb)
            return

        # /notifications or 'الإشعارات'
        if text.startswith("/notifications") or "الإشعارات" in text or "اشعارات" in text:
            if not user_link:
                send_telegram_reply(bot_token, chat_id, "⚠️ حساب التليجرام غير مرتبط بأي موظف معتمد في النظام.")
                return
            notifs = (
                db.query(Notification)
                .filter(Notification.company_id == user_link.company_id)
                .order_by(Notification.created_at.desc())
                .limit(5)
                .all()
            )
            if not notifs:
                send_telegram_reply(bot_token, chat_id, "🔔 لا توجد إشعارات جديدة حالياً.", reply_markup=reply_kb)
            else:
                n_lines = [f"🔔 <b>أحدث الإشعارات ({len(notifs)}):</b>\n"]
                for i, n in enumerate(notifs, 1):
                    date_str = n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else ""
                    n_lines.append(f"{i}. <b>{n.title}</b>\n   {n.message}\n   🕒 {date_str}")
                send_telegram_reply(bot_token, chat_id, "\n".join(n_lines), reply_markup=reply_kb)
            return

        # 'بوابة النظام' or /portal
        if "بوابة النظام" in text or text.startswith("/portal"):
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            send_telegram_reply(
                bot_token,
                chat_id,
                f"🌐 <b>بوابة Investor Gate OS الرقمية:</b>\n\n"
                f"يمكنك فتح لوحة التحكم السحابية وإدارة جميع العمليات عبر الرابط:\n"
                f"{frontend_url}\n\n"
                f"تسجيل الدخول متاح للمستخدمين المصرح لهم عبر بروتوكولات الأمان المؤسسية.",
                reply_markup=reply_kb,
            )
            return

        # /help or 'مساعدة'
        if text.startswith("/help") or "مساعدة" in text:
            help_text = (
                "ℹ️ <b>دليل استخدام بوت Investor Gate OS</b>\n\n"
                "• <b>📋 مهامي (/tasks)</b>: استعراض المهام التشغيلية المسندة إليك وتحديث حالتها.\n"
                "• <b>🎫 تذاكري (/tickets)</b>: استعراض تذاكر الدعم الفني الخاصة بك.\n"
                "• <b>🔔 الإشعارات (/notifications)</b>: استعراض أحدث التنبيهات.\n"
                "• <b>🌐 بوابة النظام</b>: الوصول المباشر إلى المنصة عبر المتصفح.\n"
                "• <b>الأزرار التفاعلية</b>: عند استلام مهمة جديدة يمكنك الضغط فوراً على [قبول المهمة] أو [بدء التنفيذ].\n"
                "• <b>الربط الآمن</b>: يتم ربط حسابك برمز مشفر أحادي الاستخدام عبر لوحة التحكم."
            )
            send_telegram_reply(bot_token, chat_id, help_text, reply_markup=reply_kb)
            return


def run_poller_loop(poll_interval: int = 3):
    """Main daemon loop running long-polling and transactional outbox dispatcher."""
    logger.info("Initializing Telegram Long-Polling Background Worker (LAN Outbound Mode)...")
    init_db()

    offset = load_offset()
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
                updates = fetch_telegram_updates(bot_token=token, offset=offset, timeout=10)

                for u in updates:
                    update_id = u.get("update_id", 0)
                    process_telegram_update(db=db, bot_token=token, update=u)
                    offset = max(offset, update_id + 1)
                    save_offset(offset)

                # Reset backoff on success
                backoff_delay = 1

        except Exception as e:
            logger.error(f"Error in Telegram poller loop: {e}")
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
