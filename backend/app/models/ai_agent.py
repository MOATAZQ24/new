"""AI Agent Execution & Idempotency Persistence Models."""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import (
    String,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class AIAgentExecution(UUIDMixin, Base):
    __tablename__ = "ai_agent_executions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    confirmation_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    action_name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="executed")
    request_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    result_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "idempotency_key", name="uq_ai_agent_exec_idempotency"),
        Index("ix_ai_agent_exec_created", "created_at"),
    )
