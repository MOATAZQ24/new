"""Telegram Bot Integration Readiness models.
Includes Telegram User Links, Transactional Notification Outbox, and Telegram Action Logs.
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import (
    String,
    Text,
    Boolean,
    Integer,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class TelegramUserLink(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "telegram_user_links"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    telegram_user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    telegram_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    verification_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    linked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    employee = relationship("Employee", foreign_keys=[employee_id])
    user = relationship("User", foreign_keys=[user_id])
    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        Index("idx_telegram_link_user", "telegram_user_id", "is_verified"),
    )


class NotificationOutbox(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notification_outbox"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(50), default="telegram", nullable=False)
    recipient_chat_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    reply_markup: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="Pending", nullable=False, index=True)  # Pending, Processing, Sent, Failed, Cancelled
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        Index("idx_outbox_poll", "status", "scheduled_at", "retry_count"),
    )


class TelegramActionLog(UUIDMixin, Base):
    __tablename__ = "telegram_action_logs"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    telegram_user_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    action: Mapped[str] = mapped_column(String(100), nullable=False)  # accept_task, start_task, complete_task, my_tasks, task_details
    task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), default="Success", nullable=False)  # Success, Failed, Unauthorized, InvalidTransition

    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", foreign_keys=[company_id])
    task = relationship("Task", foreign_keys=[task_id])
