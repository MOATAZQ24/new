"""Task Management models."""

import uuid
from datetime import datetime, date
from typing import Optional, List, Any

from sqlalchemy import (
    String,
    Text,
    Date,
    DateTime,
    Boolean,
    Integer,
    ForeignKey,
    Index,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Task(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tasks"

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
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    assigned_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    priority: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)  # Low, Medium, High, Urgent
    status: Mapped[str] = mapped_column(String(50), default="Assigned", nullable=False)  # Draft, Assigned, Accepted, In Progress, Blocked, Waiting for Response, Submitted for Review, Rework Required, Completed, Cancelled

    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    submitted_for_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Blocker tracking
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    blocker_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    unblocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Review & Rework
    reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rework_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    related_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technical_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    related_ticket_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("helpdesk_tickets.id", ondelete="SET NULL"),
        nullable=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachments: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Voice Task Recording
    is_voice_task: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    voice_note_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    voice_note_duration: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)

    # Deadlines & Escalation
    deadline_type: Mapped[str] = mapped_column(String(50), default="fixed_datetime", nullable=False)  # fixed_datetime, duration
    target_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Broadcast & Multi-Assignment
    is_broadcast: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    broadcast_mode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # individual, shared, announcement
    broadcast_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    is_accountable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    assigned_to: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[assigned_to_id])
    assigned_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_by_id])
    reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewer_id])
    related_asset: Mapped[Optional["TechnicalAsset"]] = relationship("TechnicalAsset", foreign_keys=[related_asset_id])
    related_ticket: Mapped[Optional["HelpDeskTicket"]] = relationship("HelpDeskTicket", foreign_keys=[related_ticket_id])
    comments: Mapped[List["TaskComment"]] = relationship(
        "TaskComment", back_populates="task", cascade="all, delete-orphan"
    )
    participants: Mapped[List["TaskParticipant"]] = relationship(
        "TaskParticipant", back_populates="task", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_tasks_company_id", "company_id"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_priority", "priority"),
        Index("ix_tasks_assigned_to", "assigned_to_id"),
        Index("ix_tasks_due_date", "due_date"),
        Index("ix_tasks_deadline_at", "deadline_at"),
    )


class TaskParticipant(UUIDMixin, TimestampMixin, Base):
    """Team members collaborating on a shared task with specific RACI roles."""

    __tablename__ = "task_participants"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_type: Mapped[str] = mapped_column(
        String(50), default="collaborator", nullable=False
    )  # accountable, collaborator, reviewer, consulted
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)

    task: Mapped["Task"] = relationship("Task", back_populates="participants")
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])

    __table_args__ = (
        UniqueConstraint("task_id", "employee_id", name="uq_task_participant"),
        Index("ix_task_participants_task_id", "task_id"),
        Index("ix_task_participants_employee_id", "employee_id"),
    )


class TaskComment(UUIDMixin, Base):
    __tablename__ = "task_comments"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    task: Mapped["Task"] = relationship("Task", back_populates="comments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_task_comments_task_id", "task_id"),
    )
