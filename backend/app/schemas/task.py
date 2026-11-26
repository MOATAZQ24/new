# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel


class TaskCommentBase(BaseModel):
    content: str


class TaskCommentCreate(TaskCommentBase):
    pass


class TaskCommentResponse(TaskCommentBase):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    user_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TaskBase(BaseModel):
    title: Optional[str] = "مهمة جديدة"
    description: Optional[str] = None
    priority: str = "Medium"  # Low, Medium, High, Urgent, Critical
    status: str = "To Do"  # To Do, In Progress, On Hold, Completed, Cancelled
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    is_voice_task: bool = False
    voice_note_url: Optional[str] = None
    voice_note_duration: Optional[int] = 0
    # Flexible Deadlines & Escalation
    deadline_type: Optional[str] = "duration"  # duration, fixed_datetime
    target_duration_minutes: Optional[int] = None
    deadline_at: Optional[datetime] = None


class TaskCreate(TaskBase):
    company_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    team_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    sla_policy_id: Optional[uuid.UUID] = None
    auto_assign: Optional[bool] = False
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    attachments: Optional[Any] = None
    notify_telegram: Optional[bool] = True
    is_broadcast: Optional[bool] = False
    broadcast_mode: Optional[str] = None
    is_accountable: Optional[bool] = True


class TaskBroadcastCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    broadcast_mode: str = "individual"  # individual, shared, announcement
    recipient_ids: List[uuid.UUID]
    accountable_id: Optional[uuid.UUID] = None  # for shared mode
    deadline_type: str = "duration"
    target_duration_minutes: Optional[int] = None
    due_date: Optional[date] = None
    deadline_at: Optional[datetime] = None
    company_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    notify_telegram: bool = True


class TaskParticipantResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: Optional[str] = None
    role_type: str  # accountable, collaborator, reviewer, consulted
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    deadline_type: Optional[str] = None
    target_duration_minutes: Optional[int] = None
    deadline_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    attachments: Optional[Any] = None
    is_voice_task: Optional[bool] = None
    voice_note_url: Optional[str] = None
    voice_note_duration: Optional[int] = None


class TaskBlockRequest(BaseModel):
    reason: str
    attachments: Optional[Any] = None


class TaskSubmitReviewRequest(BaseModel):
    notes: Optional[str] = None
    attachments: Optional[Any] = None


class TaskReviewRequest(BaseModel):
    review_notes: Optional[str] = None
    attachments: Optional[Any] = None


class TaskResponse(TaskBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    assigned_by_id: Optional[uuid.UUID] = None
    completed_at: Optional[datetime] = None
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    attachments: Optional[Any] = None
    assigned_to_name: Optional[str] = None
    assigned_by_name: Optional[str] = None
    related_asset_name: Optional[str] = None
    is_overdue: Optional[bool] = False
    comments_count: Optional[int] = 0

    # Collaboration & Lifecycle
    is_blocked: bool = False
    blocker_reason: Optional[str] = None
    blocked_at: Optional[datetime] = None
    unblocked_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    is_acknowledged: Optional[bool] = False
    accepted_at: Optional[datetime] = None
    submitted_for_review_at: Optional[datetime] = None
    reviewer_id: Optional[uuid.UUID] = None
    reviewer_name: Optional[str] = None
    review_notes: Optional[str] = None
    rework_count: int = 0

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
