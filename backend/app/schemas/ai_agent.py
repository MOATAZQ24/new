"""Pydantic schemas for the Investor Gate OS AI Action Agent."""

import uuid
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class AgentChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)


class AgentChatContext(BaseModel):
    current_page: Optional[str] = Field(None, max_length=120)
    selected_task_id: Optional[uuid.UUID] = None
    selected_ticket_id: Optional[uuid.UUID] = None
    selected_employee_id: Optional[uuid.UUID] = None
    selected_asset_id: Optional[uuid.UUID] = None


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    company_id: Optional[uuid.UUID] = None
    idempotency_key: Optional[str] = Field(None, max_length=128)
    confirmation_token: Optional[str] = Field(None, max_length=128)
    confirm_decision: Optional[Literal["confirm", "cancel"]] = None
    resolved_employee_id: Optional[uuid.UUID] = None
    pending_intent: Optional[Dict[str, Any]] = None
    history: List[AgentChatMessage] = Field(default_factory=list, max_length=12)
    context: Optional[AgentChatContext] = None
