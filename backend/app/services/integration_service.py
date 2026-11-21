# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Integration Service for n8n and Telegram with graceful degradation."""

import uuid
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import urllib.request
import urllib.error

from sqlalchemy.orm import Session
from app.models.integration import IntegrationConfig, IntegrationLog

logger = logging.getLogger(__name__)


def get_or_create_default_configs(db: Session, company_id: Optional[uuid.UUID]) -> List[IntegrationConfig]:
    """Ensure standard integration placeholders exist."""
    defaults = [
        {
            "service_name": "n8n",
            "display_name": "أتمتة العمليات عبر n8n Webhook",
            "config_data": {"webhook_url": "", "auth_header": "", "events": ["ticket.created", "asset.assigned"]},
        },
        {
            "service_name": "telegram",
            "display_name": "إشعارات تليجرام الفورية (Telegram Bot)",
            "config_data": {"bot_token": "", "chat_id": "", "notify_on_urgent": True},
        },
    ]

    configs = []
    for d in defaults:
        existing = db.query(IntegrationConfig).filter(
            IntegrationConfig.company_id == company_id,
            IntegrationConfig.service_name == d["service_name"],
        ).first()

        if not existing:
            new_cfg = IntegrationConfig(
                company_id=company_id,
                service_name=d["service_name"],
                display_name=d["display_name"],
                is_enabled=False,
                config_data=d["config_data"],
                status="Not Configured",
            )
            db.add(new_cfg)
            db.commit()
            db.refresh(new_cfg)
            configs.append(new_cfg)
        else:
            configs.append(existing)

    return configs


def dispatch_event(
    db: Session,
    company_id: Optional[uuid.UUID],
    event_type: str,
    payload: Dict[str, Any],
) -> None:
    """Safely dispatch an event to all enabled integrations without blocking the system."""
    try:
        active_configs = db.query(IntegrationConfig).filter(
            IntegrationConfig.company_id == company_id,
            IntegrationConfig.is_enabled == True,
        ).all()

        for cfg in active_configs:
            try:
                if cfg.service_name == "n8n":
                    _dispatch_n8n(db, cfg, event_type, payload)
                elif cfg.service_name == "telegram":
                    _dispatch_telegram(db, cfg, event_type, payload)
            except Exception as e:
                logger.error(f"Error dispatching to {cfg.service_name}: {str(e)}")
    except Exception as e:
        logger.error(f"Error in integration dispatch_event: {str(e)}")


def _dispatch_n8n(db: Session, cfg: IntegrationConfig, event_type: str, payload: dict):
    webhook_url = (cfg.config_data or {}).get("webhook_url", "").strip()
    if not webhook_url:
        return

    log_entry = IntegrationLog(
        company_id=cfg.company_id,
        service_name="n8n",
        event_type=event_type,
        payload=payload,
        status="Pending",
    )
    db.add(log_entry)
    db.commit()

    try:
        data = json.dumps({
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": payload,
        }).encode("utf-8")

        headers = {"Content-Type": "application/json"}
        auth_header = (cfg.config_data or {}).get("auth_header")
        if auth_header:
            headers["Authorization"] = auth_header

        req = urllib.request.Request(webhook_url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            log_entry.status = "Success"
            log_entry.response_data = {"status_code": response.status, "body": res_body[:500]}
            db.commit()
    except Exception as err:
        log_entry.status = "Failed"
        log_entry.error_message = str(err)[:500]
        db.commit()


def _dispatch_telegram(db: Session, cfg: IntegrationConfig, event_type: str, payload: dict):
    bot_token = (cfg.config_data or {}).get("bot_token", "").strip()
    chat_id = (cfg.config_data or {}).get("chat_id", "").strip()
    if not bot_token or not chat_id:
        return

    text = f"🔔 *إشعار نظام Investor Gate*\n\n"
    text += f"*الحدث:* `{event_type}`\n"
    for k, v in list(payload.items())[:5]:
        text += f"• *{k}:* {str(v)}\n"

    log_entry = IntegrationLog(
        company_id=cfg.company_id,
        service_name="telegram",
        event_type=event_type,
        payload=payload,
        status="Pending",
    )
    db.add(log_entry)
    db.commit()

    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        data = json.dumps({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as response:
            log_entry.status = "Success"
            log_entry.response_data = {"status_code": response.status}
            db.commit()
    except Exception as err:
        log_entry.status = "Failed"
        log_entry.error_message = str(err)[:500]
        db.commit()


def test_integration(db: Session, company_id: Optional[uuid.UUID], service_name: str) -> Dict[str, Any]:
    """Test integration connectivity safely."""
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == company_id,
        IntegrationConfig.service_name == service_name,
    ).first()

    if not cfg:
        return {"success": False, "message": "التكامل غير موجود"}

    now = datetime.utcnow()
    cfg.last_tested_at = now

    if service_name == "n8n":
        url = (cfg.config_data or {}).get("webhook_url", "").strip()
        if not url:
            cfg.status = "Not Configured"
            cfg.last_error = "رابط Webhook غير محدد"
            db.commit()
            return {"success": False, "message": "يرجى إدخال رابط Webhook أولاً"}

        try:
            test_data = json.dumps({
                "test": True,
                "event": "test.ping",
                "timestamp": now.isoformat(),
                "system": "Investor Gate IT",
            }).encode("utf-8")
            req = urllib.request.Request(url, data=test_data, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                cfg.status = "Connected"
                cfg.last_error = None
                db.commit()
                return {"success": True, "message": f"تم الاتصال بنجاح مع n8n (كود الاستجابة: {resp.status})"}
        except Exception as e:
            cfg.status = "Error"
            cfg.last_error = str(e)
            db.commit()
            return {"success": False, "message": f"فشل الاتصال بـ n8n: {str(e)}"}

    elif service_name == "telegram":
        token = (cfg.config_data or {}).get("bot_token", "").strip()
        chat_id = (cfg.config_data or {}).get("chat_id", "").strip()
        if not token:
            cfg.status = "Not Configured"
            cfg.last_error = "رمز Bot Token مفقود"
            db.commit()
            return {"success": False, "message": "يرجى إدخال رمز Bot Token أولاً"}

        from app.services.telegram_service import test_telegram_connection, send_telegram_direct_message

        # 1. Test token via getMe
        conn_res = test_telegram_connection(token)
        if not conn_res.get("success"):
            cfg.status = "Error"
            cfg.last_error = conn_res.get("message")
            db.commit()
            return conn_res

        # 2. If chat_id is provided, also test message delivery
        if chat_id:
            msg_res = send_telegram_direct_message(
                bot_token=token,
                chat_id=chat_id,
                text="🟢 <b>اختبار نجاح الاتصال</b>\nتم ربط نظام Investor Gate بنجاح مع تليجرام!",
            )
            if not msg_res.get("success"):
                cfg.status = "Warning"
                cfg.last_error = msg_res.get("message")
                db.commit()
                return {"success": False, "message": f"تم التحقق من البوت ولكن تعذر الإرسال للـ Chat ID: {msg_res.get('message')}"}

        cfg.status = "Connected"
        cfg.last_error = None
        if conn_res.get("bot", {}).get("username"):
            cdata = cfg.config_data or {}
            cdata["bot_username"] = conn_res["bot"]["username"]
            cfg.config_data = cdata
        db.commit()
        return conn_res

    return {"success": False, "message": "خدمة غير معروفة"}
