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
    title: str
    description: Optional[str] = None
    priority: str = "Medium"  # Low, Medium, High, Urgent
    status: str = "To Do"  # To Do, In Progress, On Hold, Completed, Cancelled
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class TaskCreate(TaskBase):
    company_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
    attachments: Optional[Any] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    attachments: Optional[Any] = None


class TaskBlockRequest(BaseModel):
    reason: str


class TaskSubmitReviewRequest(BaseModel):
    notes: Optional[str] = None


class TaskReviewRequest(BaseModel):
    review_notes: Optional[str] = None


class TaskResponse(TaskBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    assigned_to_id: Optional[uuid.UUID] = None
    assigned_by_id: Optional[uuid.UUID] = None
    completed_at: Optional[datetime] = None
    related_asset_id: Optional[uuid.UUID] = None
    related_ticket_id: Optional[uuid.UUID] = None
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
