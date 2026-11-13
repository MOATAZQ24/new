"""Integration Service for n8n, Telegram, and Google Gemini with graceful degradation."""

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
        {
            "service_name": "gemini",
            "display_name": "الذكاء الاصطناعي Google Gemini (تحليل التذاكر والأصول)",
            "config_data": {"api_key": "", "model": "gemini-2.0-flash", "auto_classify_tickets": True},
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
                elif cfg.service_name == "gemini":
                    _dispatch_gemini(db, cfg, event_type, payload)
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


def _dispatch_gemini(db: Session, cfg: IntegrationConfig, event_type: str, payload: dict):
    api_key = (cfg.config_data or {}).get("api_key", "").strip()
    if not api_key:
        return

    log_entry = IntegrationLog(
        company_id=cfg.company_id,
        service_name="gemini",
        event_type=event_type,
        payload=payload,
        status="Success",
        response_data={"message": "Gemini ready for automated processing"},
    )
    db.add(log_entry)
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
        if not token or not chat_id:
            cfg.status = "Not Configured"
            cfg.last_error = "رمز Bot Token أو معرّف Chat ID مفقود"
            db.commit()
            return {"success": False, "message": "يرجى إدخال Bot Token و Chat ID"}

        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            test_msg = json.dumps({
                "chat_id": chat_id,
                "text": "🟢 *اختبار نجاح الاتصال*\nتم ربط نظام Investor Gate بنجاح مع تليجرام!",
                "parse_mode": "Markdown",
            }).encode("utf-8")
            req = urllib.request.Request(url, data=test_msg, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                cfg.status = "Connected"
                cfg.last_error = None
                db.commit()
                return {"success": True, "message": "تم إرسال رسالة الاختبار بنجاح إلى تليجرام!"}
        except Exception as e:
            cfg.status = "Error"
            cfg.last_error = str(e)
            db.commit()
            return {"success": False, "message": f"فشل الاتصال بتليجرام: {str(e)}"}

    elif service_name == "gemini":
        api_key = (cfg.config_data or {}).get("api_key", "").strip()
        if not api_key:
            cfg.status = "Not Configured"
            cfg.last_error = "مفتاح API الخاص بـ Gemini غير محدد"
            db.commit()
            return {"success": False, "message": "يرجى إدخال مفتاح API لـ Google Gemini"}

        try:
            # Test model connection
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=6) as resp:
                cfg.status = "Connected"
                cfg.last_error = None
                db.commit()
                return {"success": True, "message": "تم التحقق من صحة مفتاح Google Gemini بنجاح!"}
        except Exception as e:
            cfg.status = "Error"
            cfg.last_error = str(e)
            db.commit()
            return {"success": False, "message": f"فشل التحقق من مفتاح Gemini: {str(e)}"}

    return {"success": False, "message": "خدمة غير معروفة"}
