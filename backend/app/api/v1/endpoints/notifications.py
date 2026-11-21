# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.response import success_response, paginate
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    priority: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.recipient_user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    if priority:
        query = query.filter(Notification.priority == priority)

    total = query.count()
    items = (
        query.order_by(Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = [
        {
            "id": str(n.id),
            "event_type": n.event_type,
            "title": n.title,
            "message": n.message,
            "priority": getattr(n, "priority", "Normal") or "Normal",
            "related_record_type": n.related_record_type,
            "related_record_id": str(n.related_record_id) if n.related_record_id else None,
            "channel": n.channel,
            "delivery_status": n.delivery_status,
            "read_at": n.read_at,
            "created_at": n.created_at,
        }
        for n in items
    ]

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.recipient_user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")

    notif.read_at = datetime.utcnow()
    db.commit()
    return success_response(message="تم تحديد الإشعار كمقروء")


@router.post("/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    db.query(Notification).filter(
        Notification.recipient_user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({"read_at": now})
    db.commit()
    return success_response(message="تم تحديد جميع الإشعارات كمقروءة")
