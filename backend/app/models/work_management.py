# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Rule-driven Work Management models: Teams, Assignment Rules, Cursors,
Ticket Categories, Ticket Events, Workflow Transitions, Watchers,
Task Checklists, Macros, Saved Views, and Idempotency Keys.
"""

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
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


ASSIGNMENT_STRATEGIES = ("manual", "round_robin", "least_loaded", "skill_based")
TICKET_EVENT_KINDS = (
    "comment_public",
    "comment_internal",
    "status_change",
    "assignment",
    "priority_change",
    "sla_event",
    "task_linked",
    "merge",
    "ai_suggestion",
    "system",
)
ALLOWED_RULE_CONDITION_KEYS = frozenset({
    "category",
    "priority",
    "branch_id",
    "department_id",
    "asset_type",
    "keywords",
    "requester_role",
})


class Team(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "teams"

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
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_strategy: Mapped[str] = mapped_column(
        String(30), default="least_loaded", nullable=False
    )  # manual, round_robin, least_loaded, skill_based
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    lead_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    lead_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[lead_user_id])
    members: Mapped[List["TeamMember"]] = relationship(
        "TeamMember", back_populates="team", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_teams_company_name"),
        Index("ix_teams_company_id", "company_id"),
        Index("ix_teams_company_active", "company_id", "is_active"),
        Index("ix_teams_branch_id", "branch_id"),
        Index("ix_teams_lead_user_id", "lead_user_id"),
    )


class TeamMember(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "team_members"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    skills: Mapped[Any] = mapped_column(JSON, default=list, nullable=False)
    max_open_items: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weight: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    team: Mapped["Team"] = relationship("Team", back_populates="members")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_member_team_user"),
        Index("ix_team_members_company_team", "company_id", "team_id"),
        Index("ix_team_members_company_user", "company_id", "user_id"),
        Index("ix_team_members_user_id", "user_id"),
    )


class AssignmentRule(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "assignment_rules"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(
        String(20), default="ticket", nullable=False
    )  # ticket | task
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    conditions: Mapped[Any] = mapped_column(JSON, default=dict, nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    strategy: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True
    )  # None = inherit from team; else manual|round_robin|least_loaded|skill_based
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    stop_on_match: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    team: Mapped["Team"] = relationship("Team", foreign_keys=[team_id])

    __table_args__ = (
        Index("ix_assignment_rules_company_entity_pos", "company_id", "entity_type", "is_active", "position"),
        Index("ix_assignment_rules_team_id", "team_id"),
    )


class RoundRobinCursor(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "round_robin_cursors"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope_type: Mapped[str] = mapped_column(
        String(20), default="team", nullable=False
    )  # team | rule
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    last_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_index: Mapped[int] = mapped_column(Integer, default=-1, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    last_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[last_user_id])

    __table_args__ = (
        UniqueConstraint("company_id", "scope_type", "scope_id", name="uq_rr_cursor_company_scope"),
        Index("ix_rr_cursors_company_scope", "company_id", "scope_type", "scope_id"),
    )


class TicketCategory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ticket_categories"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ar: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_priority: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)
    default_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )
    required_skills: Mapped[Any] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    default_team: Mapped[Optional["Team"]] = relationship("Team", foreign_keys=[default_team_id])

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_ticket_categories_company_name"),
        Index("ix_ticket_categories_company_id", "company_id"),
        Index("ix_ticket_categories_default_team", "default_team_id"),
    )


class TicketEvent(UUIDMixin, Base):
    """Append-only timeline events for Help Desk tickets."""

    __tablename__ = "ticket_events"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("helpdesk_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[Any] = mapped_column(JSON, default=dict, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)  # public | internal
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now(), nullable=False
    )

    ticket: Mapped["HelpDeskTicket"] = relationship("HelpDeskTicket", back_populates="events")
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    actor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[actor_id])

    __table_args__ = (
        Index("ix_ticket_events_ticket_created", "ticket_id", "created_at"),
        Index("ix_ticket_events_company_kind", "company_id", "kind"),
        Index("ix_ticket_events_actor_id", "actor_id"),
    )


class WorkflowTransition(UUIDMixin, TimestampMixin, Base):
    """Configurable state transition rules per company & entity_type (ticket|task)."""

    __tablename__ = "workflow_transitions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # ticket | task
    from_status: Mapped[str] = mapped_column(String(50), nullable=False)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    required_permission: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    requires_comment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "entity_type",
            "from_status",
            "to_status",
            name="uq_workflow_transition_edge",
        ),
        Index("ix_workflow_transitions_company_entity", "company_id", "entity_type", "from_status"),
    )


class TicketWatcher(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ticket_watchers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
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

    ticket: Mapped["HelpDeskTicket"] = relationship("HelpDeskTicket", back_populates="watchers")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("ticket_id", "user_id", name="uq_ticket_watcher"),
        Index("ix_ticket_watchers_company_user", "company_id", "user_id"),
        Index("ix_ticket_watchers_ticket_id", "ticket_id"),
    )


class TaskWatcher(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "task_watchers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
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

    task: Mapped["Task"] = relationship("Task", back_populates="watchers")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_watcher"),
        Index("ix_task_watchers_company_user", "company_id", "user_id"),
        Index("ix_task_watchers_task_id", "task_id"),
    )


class TaskChecklistItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "task_checklist_items"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    task: Mapped["Task"] = relationship("Task", back_populates="checklist_items")
    completed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[completed_by_id])

    __table_args__ = (
        Index("ix_task_checklist_task_pos", "task_id", "position"),
        Index("ix_task_checklist_company_id", "company_id"),
    )


class Macro(UUIDMixin, TimestampMixin, Base):
    """Reusable canned replies / note macros."""

    __tablename__ = "macros"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)  # public | internal
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("ix_macros_company_shared", "company_id", "is_shared"),
        Index("ix_macros_created_by", "created_by_id"),
    )


class SavedView(UUIDMixin, TimestampMixin, Base):
    """Per-user or company-shared saved filter/sort/column presets."""

    __tablename__ = "saved_views"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope: Mapped[str] = mapped_column(String(30), nullable=False)  # tickets | tasks | my_work
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    filters: Mapped[Any] = mapped_column(JSON, default=dict, nullable=False)
    sort: Mapped[Any] = mapped_column(JSON, default=dict, nullable=False)
    columns: Mapped[Any] = mapped_column(JSON, default=list, nullable=False)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_saved_views_company_scope", "company_id", "scope", "user_id"),
    )


class IdempotencyKey(UUIDMixin, TimestampMixin, Base):
    """Stores idempotency responses per (company_id, user_id, key) with TTL."""

    __tablename__ = "idempotency_keys"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[Any] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "key", name="uq_idempotency_company_user_key"),
        Index("ix_idempotency_keys_expires_at", "expires_at"),
    )
