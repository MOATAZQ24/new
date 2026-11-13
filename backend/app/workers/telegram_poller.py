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
from app.services.telegram_service import (
    dispatch_outbox_notifications,
    execute_bot_action,
    verify_telegram_link,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("TelegramPoller")

RUNNING = True
OFFSET_FILE = os.path.join(os.path.dirname(__file__), ".telegram_offset.json")


def handle_signals(sig, frame):
    global RUNNING
    logger.info("Received termination signal. Gracefully shutting down Telegram poller...")
    RUNNING = False


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
    except Exception as e:
        logger.error(f"Failed to send Telegram reply to chat {chat_id}: {e}")


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
                    emp_name = link.employee.full_name if link.employee else "الموظف"
                    welcome_msg = (
                        f"🎉 <b>تم ربط حسابك بنجاح يا {emp_name}!</b>\n\n"
                        f"أهلاً بك في بوت <b>Investor Gate OS</b> التشغيلي.\n"
                        f"ستصلك إشعارات وتكليفات المهام التشغيلية مباشرة هنا مع إمكانية قبولها، وبدء العمل، ورفعها للمراجعة."
                    )
                    send_telegram_reply(bot_token, chat_id, welcome_msg)
                except Exception as e:
                    send_telegram_reply(bot_token, chat_id, f"⚠️ <b>تعذر ربط الحساب:</b> {str(e)}")
            else:
                send_telegram_reply(
                    bot_token,
                    chat_id,
                    "👋 <b>مرحباً بك في بوت Investor Gate OS التشغيلي!</b>\n\n"
                    "لربط حسابك الوظيفي، يرجى الدخول على لوحة النظام -> الإعدادات -> التكامل -> Telegram -> توليد رمز الربط، ثم الضغط على رابط الربط السريع.\n\n"
                    "الأوامر المتاحة:\n"
                    "📋 /tasks - عرض مهامي التشغيلية النشطة\n"
                    "ℹ️ /help - المساعدة والدعم",
                )
            return

        # /tasks - list my tasks
        if text.startswith("/tasks") or text == "مهامي":
            res = execute_bot_action(
                db=db,
                telegram_user_id=user_id,
                telegram_chat_id=chat_id,
                action_str="cmd:my_tasks",
                ip_address="telegram_long_polling",
            )
            send_telegram_reply(bot_token, chat_id, res.get("message", "لا توجد مهام نشطة"))
            return

        # /help
        if text.startswith("/help") or text == "مساعدة":
            help_text = (
                "ℹ️ <b>دليل استخدام بوت Investor Gate OS</b>\n\n"
                "• <b>/tasks</b>: استعراض المهام المسندة إليك وحالتها.\n"
                "• <b>الأزرار التفاعلية</b>: عند إسناد مهمة جديدة لك، يمكنك الضغط مباشرة على [قبول المهمة] أو [بدء التنفيذ].\n"
                "• <b>الربط الأمني</b>: يتم ربط حسابك برمز مشفر أحادي الاستخدام ينتهي تلقائياً بعد 30 دقيقة."
            )
            send_telegram_reply(bot_token, chat_id, help_text)
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
                    processed = dispatch_outbox_notifications(db=db, max_batch_size=10)
                    if processed > 0:
                        logger.info(f"Dispatched {processed} pending notification(s) from transactional outbox.")
                except Exception as ex:
                    logger.debug(f"Outbox check exception: {ex}")
                last_outbox_check = now_ts

            # 2. Retrieve configured Telegram bots
            bot_configs = get_active_bot_tokens(db)
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
    run_poller_loop()
