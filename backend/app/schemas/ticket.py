# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

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
    ticket_type: Optional[str] = "Incident"  # Incident, ServiceRequest, AssetRequest
    tier: Optional[str] = "L1"  # L1, L2, L3
    notes: Optional[str] = None
    voice_note_url: Optional[str] = None


class TicketCreate(TicketBase):
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    requester_id: Optional[uuid.UUID] = None
    related_asset_id: Optional[uuid.UUID] = None
    attachments: Optional[Any] = None
    problem_id: Optional[uuid.UUID] = None


class TicketUpdate(BaseModel):
    issue_title: Optional[str] = None
    issue_description: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # Open, Assigned, In Progress, Waiting for User, Resolved, Closed, Cancelled
    category: Optional[str] = None
    ticket_type: Optional[str] = None
    tier: Optional[str] = None
    related_asset_id: Optional[uuid.UUID] = None
    problem_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    attachments: Optional[Any] = None
    voice_note_url: Optional[str] = None


class TicketResponse(TicketBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    ticket_number: str
    status: str
    ticket_type: str = "Incident"
    tier: str = "L1"
    sla_target_at: Optional[datetime] = None
    sla_paused_at: Optional[datetime] = None
    sla_paused_total_seconds: int = 0
    sla_status: str = "Within_SLA"
    voice_note_url: Optional[str] = None
    reopened_count: int = 0
    problem_id: Optional[uuid.UUID] = None
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


# ── ITIL Problem Management Schemas ─────────────────────────────────────

class ProblemRecordBase(BaseModel):
    title: str
    description: str
    root_cause: Optional[str] = None
    workaround: Optional[str] = None
    status: str = "Open"  # Open, Under_Investigation, Workaround_Found, Resolved, Closed


class ProblemRecordCreate(ProblemRecordBase):
    company_id: uuid.UUID
    assigned_to_id: Optional[uuid.UUID] = None


class ProblemRecordUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    root_cause: Optional[str] = None
    workaround: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[uuid.UUID] = None


class ProblemRecordResponse(ProblemRecordBase):
    id: uuid.UUID
    company_id: uuid.UUID
    assigned_to_id: Optional[uuid.UUID] = None
    assigned_to_name: Optional[str] = None
    linked_tickets_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Knowledge Management Schemas ────────────────────────────────────────

class KnowledgeArticleBase(BaseModel):
    title: str
    category: str = "General"
    symptom: str
    diagnostic_steps: Optional[str] = None
    resolution: str
    is_published: bool = False


class KnowledgeArticleCreate(KnowledgeArticleBase):
    company_id: uuid.UUID


class KnowledgeArticleUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    symptom: Optional[str] = None
    diagnostic_steps: Optional[str] = None
    resolution: Optional[str] = None
    is_published: Optional[bool] = None


class KnowledgeArticleResponse(KnowledgeArticleBase):
    id: uuid.UUID
    company_id: uuid.UUID
    author_id: Optional[uuid.UUID] = None
    author_name: Optional[str] = None
    approved_by_id: Optional[uuid.UUID] = None
    approved_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
