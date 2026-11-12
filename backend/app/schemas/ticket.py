import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class TicketCommentBase(BaseModel):
    content: str
    is_internal: bool = False  # Separates internal technician notes from requester visible comments


class TicketCommentCreate(TicketCommentBase):
    pass


class TicketCommentResponse(TicketCommentBase):
    id: uuid.UUID
    ticket_id: uuid.UUID
    user_id: uuid.UUID
    user_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TicketBase(BaseModel):
    issue_title: str
    issue_description: str
    priority: str = "Medium"  # Low, Medium, High, Urgent / Critical
    category: str = "Hardware"  # Hardware, Software, Network, Internet, Email, Access / Account, Server, Other
    notes: Optional[str] = None


class TicketCreate(TicketBase):
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    requester_id: Optional[uuid.UUID] = None
    related_asset_id: Optional[uuid.UUID] = None
    attachments: Optional[Any] = None


class TicketUpdate(BaseModel):
    issue_title: Optional[str] = None
    issue_description: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # Open, Assigned, In Progress, Waiting for User, Resolved, Closed, Cancelled
    category: Optional[str] = None
    related_asset_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    attachments: Optional[Any] = None


class TicketResponse(TicketBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    ticket_number: str
    status: str
    requester_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None
    related_asset_id: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    attachments: Optional[Any] = None
    requester_name: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    related_asset_name: Optional[str] = None
    comments_count: Optional[int] = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
