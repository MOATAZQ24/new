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
    catalog_item_id: Optional[uuid.UUID] = None
    custom_fields_data: Optional[Any] = None


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
    catalog_item_id: Optional[uuid.UUID] = None
    custom_fields_data: Optional[Any] = None
    approval_status: Optional[str] = None
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
    catalog_item_id: Optional[uuid.UUID] = None
    catalog_item_name: Optional[str] = None
    custom_fields_data: Optional[Any] = None
    current_approval_stage: Optional[str] = None
    approval_status: Optional[str] = "None"
    first_response_at: Optional[datetime] = None
    escalated_at: Optional[datetime] = None
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


# ── Enterprise Service Catalog Schemas ──────────────────────────────────

class ServiceCatalogItemBase(BaseModel):
    category: str
    name_ar: str
    name_en: str
    description_ar: str
    description_en: Optional[str] = None
    icon: str = "Laptop"
    default_priority: str = "Medium"
    estimated_duration_hours: int = 24
    requires_approval: bool = False
    approval_type: Optional[str] = None
    dynamic_form_schema: Optional[Any] = None
    workflow_template: Optional[str] = "Standard_Incident"
    is_active: bool = True
    display_order: int = 0


class ServiceCatalogItemCreate(ServiceCatalogItemBase):
    company_id: uuid.UUID


class ServiceCatalogItemUpdate(BaseModel):
    category: Optional[str] = None
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    description_ar: Optional[str] = None
    description_en: Optional[str] = None
    icon: Optional[str] = None
    default_priority: Optional[str] = None
    estimated_duration_hours: Optional[int] = None
    requires_approval: Optional[bool] = None
    approval_type: Optional[str] = None
    dynamic_form_schema: Optional[Any] = None
    workflow_template: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class ServiceCatalogItemResponse(ServiceCatalogItemBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Service Desk Approvals Schemas ──────────────────────────────────────

class TicketApprovalDecision(BaseModel):
    decision: str  # Approved, Rejected
    decision_notes: Optional[str] = None


class TicketApprovalResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    ticket_id: uuid.UUID
    approval_stage: str
    stage_order: int
    assigned_approver_id: Optional[uuid.UUID] = None
    assigned_approver_name: Optional[str] = None
    status: str
    decision_notes: Optional[str] = None
    decided_at: Optional[datetime] = None
    decided_by_id: Optional[uuid.UUID] = None
    decided_by_name: Optional[str] = None
    ticket_number: Optional[str] = None
    ticket_title: Optional[str] = None
    requester_name: Optional[str] = None
    priority: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Service Workflow Schemas ────────────────────────────────────────────

class ServiceWorkflowBase(BaseModel):
    workflow_key: str
    name_ar: str
    name_en: str
    description: Optional[str] = None
    status: str = "Published"
    nodes_json: Optional[Any] = None
    transitions_json: Optional[Any] = None
    is_active: bool = True


class ServiceWorkflowCreate(ServiceWorkflowBase):
    company_id: uuid.UUID


class ServiceWorkflowUpdate(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    nodes_json: Optional[Any] = None
    transitions_json: Optional[Any] = None
    is_active: Optional[bool] = None


class ServiceWorkflowResponse(ServiceWorkflowBase):
    id: uuid.UUID
    company_id: uuid.UUID
    version: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── SLA Policy Schemas ──────────────────────────────────────────────────

class SlaPolicyBase(BaseModel):
    name: str
    priority: str
    first_response_minutes: int = 60
    resolution_minutes: int = 1440
    escalation_notify_minutes: int = 120
    business_hours_only: bool = True
    is_active: bool = True


class SlaPolicyCreate(SlaPolicyBase):
    company_id: uuid.UUID


class SlaPolicyUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[str] = None
    first_response_minutes: Optional[int] = None
    resolution_minutes: Optional[int] = None
    escalation_notify_minutes: Optional[int] = None
    business_hours_only: Optional[bool] = None
    is_active: Optional[bool] = None


class SlaPolicyResponse(SlaPolicyBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
