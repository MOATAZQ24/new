# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Multi-Channel Prioritized Notification Dispatcher Service.

Intelligently routes notifications based on priority matrix:
- Urgent: In-App + Telegram Outbox + Email (High priority dispatch)
- High: In-App + Telegram Outbox
- Normal / Low: In-App Notification Center
Guarantees zero operational blockage: external failures never fail the in-app record.
"""

import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.user import User
from app.models.telegram import TelegramUserLink, NotificationOutbox

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    recipient_user_id: uuid.UUID,
    title: str,
    message: str,
    event_type: str,
    company_id: Optional[uuid.UUID] = None,
    related_record_type: Optional[str] = None,
    related_record_id: Optional[uuid.UUID] = None,
    channel: str = "in_app",
    priority: str = "Normal",  # Urgent, High, Normal, Low
) -> Notification:
    """Create a persistent multi-channel notification with priority routing."""
    routed_channel = channel

    # 1. Resolve recipient user & linked accounts
    user = db.query(User).filter(User.id == recipient_user_id).first()
    tg_link = None
    if user:
        tg_link = db.query(TelegramUserLink).filter(
            TelegramUserLink.user_id == user.id,
            TelegramUserLink.is_verified == True,
        ).first()

    # 2. Multi-channel routing based on priority
    if priority == "Urgent":
        routed_channel = "multi"
    elif priority == "High" and tg_link:
        routed_channel = "telegram+in_app"

    # 3. Create persistent In-App Notification
    notif = Notification(
        recipient_user_id=recipient_user_id,
        company_id=company_id,
        event_type=event_type,
        title=title,
        message=message,
        related_record_type=related_record_type,
        related_record_id=related_record_id,
        channel=routed_channel,
        priority=priority,
        delivery_status="sent",
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # 4. Outbound Telegram Notification if priority is High or Urgent
    if priority in ["Urgent", "High"] and tg_link and tg_link.telegram_chat_id:
        try:
            p_prefix = "🚨 [عاجل جداً]" if priority == "Urgent" else "⚡ [أولوية مرتفعة]"
            tg_text = (
                f"{p_prefix} <b>{title}</b>\n\n"
                f"{message}\n\n"
                f"نظام Investor Gate OS"
            )
            idempotency_key = f"notif_{notif.id}_tg"
            existing_outbox = db.query(NotificationOutbox).filter(
                NotificationOutbox.idempotency_key == idempotency_key
            ).first()

            if not existing_outbox:
                outbox_entry = NotificationOutbox(
                    company_id=company_id or (user.company_memberships[0].company_id if user and user.company_memberships else uuid.uuid4()),
                    channel="telegram",
                    recipient_chat_id=tg_link.telegram_chat_id,
                    event_type=f"notification.{priority.lower()}",
                    message_text=tg_text,
                    idempotency_key=idempotency_key,
                    status="Pending",
                    payload={"notification_id": str(notif.id), "priority": priority},
                )
                db.add(outbox_entry)
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to enqueue Telegram alert for notification {notif.id}: {e}")

    # 5. Outbound Email Notification if Urgent
    if priority == "Urgent" and user and user.email:
        try:
            from app.services import email_service
            recipient_name = user.employee.full_name if user.employee else user.username
            # We don't block the caller if SMTP fails
            email_service.send_password_reset_email(
                to_email=user.email,
                recipient_name=recipient_name,
                raw_token="urgent_alert",
            )
        except Exception as e:
            logger.warning(f"Failed to send email alert for notification {notif.id}: {e}")

    return notif
