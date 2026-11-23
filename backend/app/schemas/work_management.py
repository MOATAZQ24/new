# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Strict Pydantic v2 schemas for Work Management, Assignment Engine, SLA, and Bulk APIs.

Security: `company_id` is NEVER accepted from client payloads in new work-management schemas
(`extra="forbid"` rejects spoofed tenant fields at validation time).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.assignment import validate_rule_conditions

StrategyLiteral = Literal["manual", "round_robin", "least_loaded", "skill_based"]
EntityTypeLiteral = Literal["ticket", "task"]
VisibilityLiteral = Literal["public", "internal"]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── Teams & Members ───────────────────────────────────────────────────────────

class TeamCreate(StrictSchema):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    branch_id: Optional[uuid.UUID] = None
    default_strategy: StrategyLiteral = "least_loaded"
    lead_user_id: Optional[uuid.UUID] = None
    is_active: bool = True


class TeamUpdate(StrictSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    branch_id: Optional[uuid.UUID] = None
    default_strategy: Optional[StrategyLiteral] = None
    lead_user_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class TeamMemberUpsert(StrictSchema):
    user_id: uuid.UUID
    skills: List[str] = Field(default_factory=list, max_length=50)
    max_open_items: int = Field(10, ge=1, le=500)
    is_available: bool = True
    weight: int = Field(1, ge=1, le=100)

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, v: List[str]) -> List[str]:
        return sorted({s.strip().lower() for s in v if s and s.strip()})


class TeamMemberUpdate(StrictSchema):
    skills: Optional[List[str]] = Field(None, max_length=50)
    max_open_items: Optional[int] = Field(None, ge=1, le=500)
    is_available: Optional[bool] = None
    weight: Optional[int] = Field(None, ge=1, le=100)

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        return sorted({s.strip().lower() for s in v if s and s.strip()})


# ── Assignment Rules ──────────────────────────────────────────────────────────

class AssignmentRuleCreate(StrictSchema):
    entity_type: EntityTypeLiteral = "ticket"
    position: int = Field(0, ge=0, le=10000)
    name: str = Field(..., min_length=2, max_length=200)
    conditions: Dict[str, Any] = Field(default_factory=dict)
    team_id: uuid.UUID
    strategy: Optional[StrategyLiteral] = None
    is_active: bool = True
    stop_on_match: bool = True

    @field_validator("conditions")
    @classmethod
    def check_conditions(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_rule_conditions(v)


class AssignmentRuleUpdate(StrictSchema):
    position: Optional[int] = Field(None, ge=0, le=10000)
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    conditions: Optional[Dict[str, Any]] = None
    team_id: Optional[uuid.UUID] = None
    strategy: Optional[StrategyLiteral] = None
    is_active: Optional[bool] = None
    stop_on_match: Optional[bool] = None

    @field_validator("conditions")
    @classmethod
    def check_conditions(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        return validate_rule_conditions(v)


class AssignmentRuleReorder(StrictSchema):
    entity_type: EntityTypeLiteral = "ticket"
    rule_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=200)


class AssignmentDryRunRequest(StrictSchema):
    entity_type: EntityTypeLiteral = "ticket"
    category: Optional[str] = Field(None, max_length=100)
    priority: Optional[str] = Field(None, max_length=50)
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    asset_type: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field("", max_length=500)
    description: Optional[str] = Field("", max_length=4000)
    requester_role: Optional[str] = Field(None, max_length=100)
    required_skills: List[str] = Field(default_factory=list, max_length=30)


# ── SLA Policies ──────────────────────────────────────────────────────────────

class BusinessHoursPayload(StrictSchema):
    timezone: str = Field("Asia/Riyadh", max_length=80)
    working_days: List[str] = Field(
        default_factory=lambda: ["sun", "mon", "tue", "wed", "thu"], min_length=1, max_length=7
    )
    start: str = Field("08:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field("17:00", pattern=r"^\d{2}:\d{2}$")
    holidays: List[str] = Field(default_factory=list, max_length=60)


class SlaPolicyCreateV2(StrictSchema):
    name: str = Field(..., min_length=2, max_length=150)
    priority: str = Field(..., max_length=50)
    first_response_minutes: int = Field(60, ge=1, le=43200)
    resolution_minutes: int = Field(480, ge=1, le=129600)
    escalation_notify_minutes: int = Field(120, ge=1, le=129600)
    business_hours_only: bool = True
    business_hours: Optional[BusinessHoursPayload] = None
    is_default: bool = False
    escalate_on_breach: bool = False
    bump_priority_on_breach: bool = False
    is_active: bool = True


class SlaPolicyUpdateV2(StrictSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    priority: Optional[str] = Field(None, max_length=50)
    first_response_minutes: Optional[int] = Field(None, ge=1, le=43200)
    resolution_minutes: Optional[int] = Field(None, ge=1, le=129600)
    escalation_notify_minutes: Optional[int] = Field(None, ge=1, le=129600)
    business_hours_only: Optional[bool] = None
    business_hours: Optional[BusinessHoursPayload] = None
    is_default: Optional[bool] = None
    escalate_on_breach: Optional[bool] = None
    bump_priority_on_breach: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Workflow Transitions ──────────────────────────────────────────────────────

class WorkflowTransitionCreate(StrictSchema):
    entity_type: EntityTypeLiteral
    from_status: str = Field(..., min_length=1, max_length=50)
    to_status: str = Field(..., min_length=1, max_length=50)
    required_permission: Optional[str] = Field(None, max_length=80)
    requires_comment: bool = False
    is_active: bool = True


class WorkflowTransitionUpdate(StrictSchema):
    required_permission: Optional[str] = Field(None, max_length=80)
    requires_comment: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Ticket Categories, Macros, Saved Views ───────────────────────────────────

class TicketCategoryCreate(StrictSchema):
    name: str = Field(..., min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    default_priority: str = Field("Medium", max_length=50)
    default_team_id: Optional[uuid.UUID] = None
    required_skills: List[str] = Field(default_factory=list, max_length=30)
    is_active: bool = True


class TicketCategoryUpdate(StrictSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    default_priority: Optional[str] = Field(None, max_length=50)
    default_team_id: Optional[uuid.UUID] = None
    required_skills: Optional[List[str]] = Field(None, max_length=30)
    is_active: Optional[bool] = None


class MacroCreate(StrictSchema):
    title: str = Field(..., min_length=2, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    visibility: VisibilityLiteral = "public"
    is_shared: bool = True


class MacroUpdate(StrictSchema):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    body: Optional[str] = Field(None, min_length=1, max_length=10000)
    visibility: Optional[VisibilityLiteral] = None
    is_shared: Optional[bool] = None


class SavedViewCreate(StrictSchema):
    scope: Literal["tickets", "tasks", "my_work"]
    name: str = Field(..., min_length=2, max_length=150)
    filters: Dict[str, Any] = Field(default_factory=dict)
    sort: Dict[str, Any] = Field(default_factory=dict)
    columns: List[str] = Field(default_factory=list, max_length=40)
    is_shared: bool = False


class SavedViewUpdate(StrictSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    filters: Optional[Dict[str, Any]] = None
    sort: Optional[Dict[str, Any]] = None
    columns: Optional[List[str]] = Field(None, max_length=40)
    is_shared: Optional[bool] = None


# ── Ticket Action Payloads ───────────────────────────────────────────────────

class TicketAssignRequest(StrictSchema):
    team_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    auto_assign: bool = False
    clear_assignee: bool = False
    reason: Optional[str] = Field("manual", max_length=200)


class TicketTransitionRequest(StrictSchema):
    to_status: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = Field(None, max_length=4000)
    visibility: VisibilityLiteral = "public"


class TicketEventCreate(StrictSchema):
    content: Optional[str] = Field(None, max_length=10000)
    visibility: VisibilityLiteral = "public"
    macro_id: Optional[uuid.UUID] = None
    attachments: Optional[List[Dict[str, Any]]] = None


class TicketBulkRequest(StrictSchema):
    ticket_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=100)
    action: Literal["assign", "transition", "priority", "team", "close"]
    assignee_id: Optional[uuid.UUID] = None
    team_id: Optional[uuid.UUID] = None
    to_status: Optional[str] = Field(None, max_length=50)
    priority: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=2000)


class TicketMergeRequest(StrictSchema):
    target_ticket_id: uuid.UUID
    comment: Optional[str] = Field(None, max_length=2000)


class TicketToTaskRequest(StrictSchema):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    team_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    priority: Optional[str] = Field(None, max_length=50)
    due_date: Optional[date] = None
    auto_assign: bool = False
    require_tasks_done_to_close: Optional[bool] = None


class WatcherAddRequest(StrictSchema):
    user_id: Optional[uuid.UUID] = None  # Defaults to current_user


# ── Task Action Payloads ─────────────────────────────────────────────────────

class TaskAssignRequest(StrictSchema):
    team_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    employee_id: Optional[uuid.UUID] = None
    auto_assign: bool = False
    clear_assignee: bool = False
    reason: Optional[str] = Field("manual", max_length=200)


class TaskTransitionRequest(StrictSchema):
    to_status: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = Field(None, max_length=4000)


class TaskBulkRequest(StrictSchema):
    task_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=100)
    action: Literal["assign", "transition", "priority", "team"]
    assignee_id: Optional[uuid.UUID] = None
    employee_id: Optional[uuid.UUID] = None
    team_id: Optional[uuid.UUID] = None
    to_status: Optional[str] = Field(None, max_length=50)
    priority: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=2000)


class TaskChecklistCreate(StrictSchema):
    title: str = Field(..., min_length=1, max_length=300)
    position: Optional[int] = Field(None, ge=0, le=1000)


class TaskChecklistUpdate(StrictSchema):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    is_completed: Optional[bool] = None
    position: Optional[int] = Field(None, ge=0, le=1000)
