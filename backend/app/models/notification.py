"""Notification models."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class Notification(UUIDMixin, Base):
    __tablename__ = "notifications"

    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    related_record_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # task, ticket, asset, subscription, maintenance
    related_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    channel: Mapped[str] = mapped_column(String(50), default="in_app", nullable=False)  # in_app, telegram, email, multi
    priority: Mapped[str] = mapped_column(String(50), default="Normal", nullable=False)  # Urgent, High, Normal, Low
    delivery_status: Mapped[str] = mapped_column(String(50), default="sent", nullable=False)  # pending, sent, failed
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_user_id])
    company: Mapped[Optional["Company"]] = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        Index("ix_notifications_recipient_user_id", "recipient_user_id"),
        Index("ix_notifications_read_at", "read_at"),
        Index("ix_notifications_created_at", "created_at"),
    )
