import uuid
from typing import Optional
from sqlalchemy.orm import Session
from app.models.notification import Notification


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
) -> Notification:
    """Create a persistent notification."""
    notif = Notification(
        recipient_user_id=recipient_user_id,
        company_id=company_id,
        event_type=event_type,
        title=title,
        message=message,
        related_record_type=related_record_type,
        related_record_id=related_record_id,
        channel=channel,
        delivery_status="sent",
    )
    db.add(notif)
    db.commit()
    return notif
