# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Integration Layer models for n8n, Telegram, and custom webhooks."""

import uuid
from datetime import datetime
from typing import Optional, Any

from sqlalchemy import (
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class IntegrationConfig(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "integration_configs"

    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    service_name: Mapped[str] = mapped_column(String(50), nullable=False)  # n8n, telegram, webhook
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Secure configuration JSON (webhook_url, bot_token, chat_id, api_key, etc.)
    config_data: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    
    # Status: Connected, Disconnected, Error, Not Configured
    status: Mapped[str] = mapped_column(String(50), default="Not Configured", nullable=False)
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_integration_service", "company_id", "service_name"),
    )


class IntegrationLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "integration_logs"

    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_name: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)  # ticket.created, asset.assigned, test.ping, etc.
    status: Mapped[str] = mapped_column(String(50), default="Pending", nullable=False)  # Success, Failed, Skipped
    
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    response_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_integration_log_service", "service_name", "created_at"),
    )
