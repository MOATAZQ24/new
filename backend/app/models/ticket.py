"""IT Help Desk Ticket models."""

import uuid
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import (
    String,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class HelpDeskTicket(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "helpdesk_tickets"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    ticket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    issue_title: Mapped[str] = mapped_column(String(255), nullable=False)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)

    requester_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_technician_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    priority: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)  # Low, Medium, High, Urgent / Critical
    status: Mapped[str] = mapped_column(String(50), default="Open", nullable=False)  # Open, Assigned, In Progress, Waiting for User, Resolved, Closed, Cancelled
    category: Mapped[str] = mapped_column(String(100), default="Hardware", nullable=False)  # Hardware, Software, Network, Internet, Email, Access / Account, Server, Other

    related_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technical_assets.id", ondelete="SET NULL"),
        nullable=True,
    )

    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachments: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    requester: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[requester_id])
    assigned_technician: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_technician_id])
    related_asset: Mapped[Optional["TechnicalAsset"]] = relationship("TechnicalAsset", foreign_keys=[related_asset_id])
    comments: Mapped[List["TicketComment"]] = relationship(
        "TicketComment", back_populates="ticket", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "ticket_number", name="uq_company_ticket_number"),
        Index("ix_helpdesk_tickets_company_id", "company_id"),
        Index("ix_helpdesk_tickets_status", "status"),
        Index("ix_helpdesk_tickets_priority", "priority"),
        Index("ix_helpdesk_tickets_category", "category"),
        Index("ix_helpdesk_tickets_assigned_tech", "assigned_technician_id"),
    )


class TicketComment(UUIDMixin, Base):
    __tablename__ = "ticket_comments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("helpdesk_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Important: Separate internal technician notes from requester-visible comments
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    ticket: Mapped["HelpDeskTicket"] = relationship("HelpDeskTicket", back_populates="comments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_ticket_comments_ticket_id", "ticket_id"),
    )
