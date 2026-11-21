"""IT Help Desk Ticket models."""

import uuid
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import (
    String,
    Boolean,
    Text,
    DateTime,
    Integer,
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

    # ITIL 4 / ISO 20000 Enhancements
    ticket_type: Mapped[str] = mapped_column(
        String(50), default="Incident", nullable=False
    )  # Incident, ServiceRequest, AssetRequest
    tier: Mapped[str] = mapped_column(String(20), default="L1", nullable=False)  # L1, L2, L3
    sla_target_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sla_paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sla_paused_total_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sla_status: Mapped[str] = mapped_column(
        String(50), default="Within_SLA", nullable=False
    )  # Within_SLA, At_Risk, Breached
    voice_note_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    reopened_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    problem_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("problem_records.id", ondelete="SET NULL"),
        nullable=True,
    )

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
    problem_record: Mapped[Optional["ProblemRecord"]] = relationship("ProblemRecord", foreign_keys=[problem_id])
    comments: Mapped[List["TicketComment"]] = relationship(
        "TicketComment", back_populates="ticket", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "ticket_number", name="uq_company_ticket_number"),
        Index("ix_helpdesk_tickets_company_id", "company_id"),
        Index("ix_helpdesk_tickets_status", "status"),
        Index("ix_helpdesk_tickets_priority", "priority"),
        Index("ix_helpdesk_tickets_category", "category"),
        Index("ix_helpdesk_tickets_ticket_type", "ticket_type"),
        Index("ix_helpdesk_tickets_tier", "tier"),
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


class ProblemRecord(UUIDMixin, TimestampMixin, Base):
    """ITIL Problem Management record for investigating root causes of recurring incidents."""

    __tablename__ = "problem_records"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    root_cause: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    workaround: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="Open", nullable=False
    )  # Open, Under_Investigation, Workaround_Found, Resolved, Closed
    assigned_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id])
    tickets: Mapped[List["HelpDeskTicket"]] = relationship("HelpDeskTicket", back_populates="problem_record")

    __table_args__ = (
        Index("ix_problem_records_company_id", "company_id"),
        Index("ix_problem_records_status", "status"),
    )


class KnowledgeArticle(UUIDMixin, TimestampMixin, Base):
    """Verified operational knowledge base article for fast deterministic problem resolution."""

    __tablename__ = "knowledge_articles"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), default="General", nullable=False)
    symptom: Mapped[str] = mapped_column(Text, nullable=False)
    diagnostic_steps: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    author: Mapped[Optional["User"]] = relationship("User", foreign_keys=[author_id])
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        Index("ix_knowledge_articles_company_id", "company_id"),
        Index("ix_knowledge_articles_category", "category"),
        Index("ix_knowledge_articles_published", "is_published"),
    )
