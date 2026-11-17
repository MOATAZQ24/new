"""AI Action Agent API Endpoints (Chat, Streamed Progress, Capabilities & History)."""

import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user, get_user_company_id, resolve_company_scope
from app.models.ai_agent import AIAgentExecution
from app.models.user import User
from app.schemas.ai_agent import AgentChatRequest
from app.services import ai_agent_service as agent_svc

router = APIRouter(prefix="/ai/agent", tags=["AI Action Agent"])


@router.get("/capabilities")
def agent_capabilities(
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return authorized AI agent capabilities for the signed-in user within company scope."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    caps = agent_svc.get_agent_capabilities(db, current_user, target_cid)
    return success_response(data=caps)


@router.post("/chat")
def agent_chat(
    payload: AgentChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Execute a natural-language command through structured RBAC-enforced Gemini tool calling."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    client_ip = request.client.host if request.client else "127.0.0.1"
    result = agent_svc.process_agent_request(
        db=db,
        current_user=current_user,
        target_cid=target_cid,
        payload=payload,
        ip_address=client_ip,
    )
    return success_response(data=result)


@router.post("/chat/stream")
def agent_chat_stream(
    payload: AgentChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Stream step-by-step progress events followed by the authoritative agent execution payload."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    client_ip = request.client.host if request.client else "127.0.0.1"

    recorded_events: List[Dict[str, Any]] = []

    def on_progress(step: Dict[str, Any]) -> None:
        recorded_events.append(dict(step))

    result = agent_svc.process_agent_request(
        db=db,
        current_user=current_user,
        target_cid=target_cid,
        payload=payload,
        ip_address=client_ip,
        progress_cb=on_progress,
    )

    def event_generator():
        for evt in recorded_events:
            yield json.dumps({"type": "progress", "step": evt}, ensure_ascii=False, default=str) + "\n"
        yield json.dumps({"type": "complete", "data": result}, ensure_ascii=False, default=str) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.get("/history")
def agent_execution_history(
    limit: int = Query(15, ge=1, le=50),
    company_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve the current user's recent verified AI Agent executions inside the active company."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    rows = (
        db.query(AIAgentExecution)
        .filter(
            AIAgentExecution.company_id == target_cid,
            AIAgentExecution.user_id == current_user.id,
        )
        .order_by(AIAgentExecution.created_at.desc())
        .limit(limit)
        .all()
    )
    return success_response(
        data=[
            {
                "id": str(r.id),
                "action_name": r.action_name,
                "status": r.status,
                "idempotency_key": r.idempotency_key,
                "created_at": r.created_at,
                "reply": (r.result_payload or {}).get("reply"),
                "result_card": (r.result_payload or {}).get("result_card"),
            }
            for r in rows
        ]
    )
