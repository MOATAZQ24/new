# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.rbac import (
    GranularPermission,
    get_effective_roles_for_granular,
    has_granular_permission,
    require_granular_permission,
)
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Company, Branch
from app.models.ticket import (
    HelpDeskTicket,
    TicketComment,
    ProblemRecord,
    KnowledgeArticle,
    ServiceCatalogItem,
    TicketApproval,
    ServiceWorkflow,
    SlaPolicy,
)
from app.models.task import Task
from app.models.user import User, Employee, CompanyMembership
from app.models.asset import TechnicalAsset
from app.models.work_management import (
    AssignmentRule,
    Macro,
    SavedView,
    Team,
    TicketCategory,
    TicketEvent,
    TicketWatcher,
    WorkflowTransition,
)
from app.schemas.ticket import (
    TicketCreate,
    TicketUpdate,
    TicketCommentCreate,
    ProblemRecordCreate,
    ProblemRecordUpdate,
    ProblemRecordResponse,
    KnowledgeArticleCreate,
    KnowledgeArticleUpdate,
    KnowledgeArticleResponse,
    ServiceCatalogItemCreate,
    ServiceCatalogItemUpdate,
    TicketApprovalDecision,
    ServiceWorkflowCreate,
    ServiceWorkflowUpdate,
    SlaPolicyCreate,
    SlaPolicyUpdate,
)
from app.schemas.work_management import (
    TicketAssignRequest,
    TicketBulkRequest,
    TicketEventCreate,
    TicketMergeRequest,
    TicketToTaskRequest,
    TicketTransitionRequest,
    WatcherAddRequest,
)
from app.services.assignment import (
    CLOSED_TASK_STATUSES,
    auto_assign_task,
    auto_assign_ticket,
    manual_assign_task,
    manual_assign_ticket,
    sync_task_assignee_fields,
)
from app.services.audit_service import log_audit
from app.services.idempotency_service import (
    decode_cursor,
    encode_cursor,
    extract_idempotency_key,
    lookup_idempotent_response,
    store_idempotent_response,
)
from app.services.notification_service import create_notification
from app.services.sla_service import apply_sla_to_task, apply_sla_to_ticket, handle_ticket_sla_pause_resume
from app.services.task_assignment import validate_assignee
from app.services.service_desk_service import (
    seed_service_desk_defaults,
    process_ticket_approval,
)
from app.services.work_management_defaults import ensure_default_sla_policies, ensure_workflow_transitions

router = APIRouter(prefix="/tickets", tags=["IT Help Desk"])

VOICE_TICKET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "voice_tickets"))
os.makedirs(VOICE_TICKET_DIR, exist_ok=True)

TICKET_SLA_MINUTES = {
    "Critical": 60,
    "Urgent": 240,
    "High": 1440,
    "Medium": 4320,
    "Low": 10080,
}


def route_ticket_deterministically(company_id: uuid.UUID, branch_id: Optional[uuid.UUID], db: Session) -> Optional[uuid.UUID]:
    """ITIL 4 Deterministic Assignment Engine:
    Selects the least loaded active technician in the company/branch without AI.
    """
    tech_users = (
        db.query(User)
        .join(CompanyMembership, CompanyMembership.user_id == User.id)
        .filter(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "Active",
            User.account_status == "Active",
            User.is_deleted == False,
        )
        .all()
    )
    eligible_techs = []
    for u in tech_users:
        roles = get_user_roles(u, db, company_id=company_id)
        if any(r in ["IT Technician", "IT Manager", "Company Admin"] for r in roles):
            eligible_techs.append(u)

    if not eligible_techs:
        return None

    least_loaded_tech = None
    min_workload = float("inf")
    for tech in eligible_techs:
        load = (
            db.query(HelpDeskTicket)
            .filter(
                HelpDeskTicket.company_id == company_id,
                HelpDeskTicket.assigned_technician_id == tech.id,
                HelpDeskTicket.status.in_(["Assigned", "In Progress", "Waiting for User"]),
            )
            .count()
        )
        if load < min_workload:
            min_workload = load
            least_loaded_tech = tech

    return least_loaded_tech.id if least_loaded_tech else None


def generate_ticket_number(company_id: uuid.UUID, db: Session) -> str:
    """Generate race-safe sequential ticket number per company, e.g. TCK-2026-0001."""
    year = datetime.utcnow().year
    prefix = f"TCK-{year}-"
    # Lock company row on PostgreSQL to serialize concurrent ticket number generation per tenant
    db.query(Company).filter(Company.id == company_id).with_for_update().first()
    existing_numbers = [
        r[0]
        for r in db.query(HelpDeskTicket.ticket_number)
        .filter(HelpDeskTicket.ticket_number.like(f"{prefix}%"))
        .all()
        if r[0]
    ]
    max_seq = 0
    for tnum in existing_numbers:
        suffix = tnum[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    next_seq = max(max_seq + 1, len(existing_numbers) + 1)
    candidate = f"{prefix}{next_seq:04d}"
    while db.query(HelpDeskTicket.id).filter(HelpDeskTicket.ticket_number == candidate).first() is not None:
        next_seq += 1
        candidate = f"{prefix}{next_seq:04d}"
    return candidate


def _is_ticket_staff(user: User, company_id: uuid.UUID, db: Session) -> bool:
    if user.is_superadmin:
        return True
    roles = get_effective_roles_for_granular(user, company_id, db)
    return any(r in ("Super Admin", "Company Admin", "IT Manager", "IT Technician") for r in roles)


def _validate_and_apply_ticket_transition(
    db: Session,
    ticket: HelpDeskTicket,
    to_status: str,
    actor: User,
    comment: Optional[str] = None,
    visibility: str = "public",
    ip_address: Optional[str] = None,
) -> HelpDeskTicket:
    """Validate transition against WorkflowTransition matrix, check close gates, update SLA & events."""
    ensure_workflow_transitions(db, ticket.company_id, entity_type="ticket")
    old_status = ticket.status
    target_status = to_status.strip()

    if old_status == target_status:
        return ticket

    edge = (
        db.query(WorkflowTransition)
        .filter(
            WorkflowTransition.company_id == ticket.company_id,
            WorkflowTransition.entity_type == "ticket",
            WorkflowTransition.from_status == old_status,
            WorkflowTransition.to_status == target_status,
            WorkflowTransition.is_active == True,
        )
        .first()
    )
    if not edge:
        allowed_rows = (
            db.query(WorkflowTransition.to_status)
            .filter(
                WorkflowTransition.company_id == ticket.company_id,
                WorkflowTransition.entity_type == "ticket",
                WorkflowTransition.from_status == old_status,
                WorkflowTransition.is_active == True,
            )
            .all()
        )
        allowed_next = [r[0] for r in allowed_rows]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_WORKFLOW_TRANSITION",
                "message_en": f"Transition from '{old_status}' to '{target_status}' is not allowed.",
                "message_ar": f"لا يمكن نقل حالة التذكرة من ({old_status}) إلى ({target_status}).",
                "from_status": old_status,
                "to_status": target_status,
                "allowed_next": allowed_next,
            },
        )

    req_perm = edge.required_permission or (
        GranularPermission.TICKET_CLOSE if target_status in ("Closed", "Cancelled") else GranularPermission.TICKET_TRANSITION
    )
    if not has_granular_permission(actor, req_perm, ticket.company_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"ليس لديك صلاحية ({req_perm}) للانتقال إلى حالة ({target_status})",
        )

    if edge.requires_comment and (not comment or not comment.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "TRANSITION_COMMENT_REQUIRED",
                "message_en": f"A comment is required to transition to '{target_status}'.",
                "message_ar": f"يجب إدخال ملاحظة أو تعليق عند الانتقال إلى حالة ({target_status}).",
            },
        )

    # Gate closing if require_tasks_done_to_close is enabled and linked tasks are incomplete
    if target_status == "Closed" and ticket.require_tasks_done_to_close:
        open_linked = (
            db.query(Task)
            .filter(
                Task.company_id == ticket.company_id,
                Task.related_ticket_id == ticket.id,
                ~Task.status.in_(CLOSED_TASK_STATUSES),
            )
            .count()
        )
        if open_linked > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "OPEN_LINKED_TASKS",
                    "message_en": f"Cannot close ticket while {open_linked} linked task(s) remain open.",
                    "message_ar": f"لا يمكن إغلاق التذكرة قبل إتمام المهام المرتبطة المفتوحة ({open_linked}).",
                    "open_linked_tasks": open_linked,
                },
            )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    ticket.status = target_status

    if target_status == "In Progress" and not ticket.assigned_technician_id:
        ticket.assigned_technician_id = actor.id

    if old_status in ("Resolved", "Closed") and target_status in ("Open", "Assigned", "In Progress", "Reopened"):
        ticket.reopened_count = (ticket.reopened_count or 0) + 1
        ticket.resolved_at = None
        ticket.closed_at = None
    elif target_status in ("Open", "Assigned", "In Progress", "Waiting for User", "Waiting for Vendor", "Reopened"):
        ticket.resolved_at = None
        ticket.closed_at = None
    elif target_status == "Resolved":
        ticket.closed_at = None
        if not ticket.resolved_at:
            ticket.resolved_at = now
    elif target_status == "Closed":
        ticket.closed_at = now
        if not ticket.resolved_at:
            ticket.resolved_at = now

    handle_ticket_sla_pause_resume(ticket, old_status, target_status, now_utc=now)
    if _is_ticket_staff(actor, ticket.company_id, db) and not ticket.first_response_at:
        ticket.first_response_at = now

    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=ticket.company_id,
            actor_id=actor.id,
            kind="status_change",
            payload={
                "from": old_status,
                "to": target_status,
                "comment": comment.strip() if comment and comment.strip() else None,
            },
            visibility="public",
        )
    )

    if comment and comment.strip():
        is_int = (visibility == "internal") and _is_ticket_staff(actor, ticket.company_id, db)
        db.add(
            TicketComment(
                ticket_id=ticket.id,
                user_id=actor.id,
                content=comment.strip(),
                is_internal=is_int,
            )
        )
        db.add(
            TicketEvent(
                ticket_id=ticket.id,
                company_id=ticket.company_id,
                actor_id=actor.id,
                kind="comment_internal" if is_int else "comment_public",
                payload={"content": comment.strip()},
                visibility="internal" if is_int else "public",
            )
        )

    log_audit(
        db=db,
        action="STATUS_CHANGE",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=actor.id,
        company_id=ticket.company_id,
        old_values={"status": old_status},
        new_values={"status": target_status, "comment": comment},
        ip_address=ip_address,
        commit=False,
    )
    return ticket


@router.get("")
def list_tickets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    team_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    sla_state: Optional[str] = Query(None, pattern="^(ok|at_risk|breached|paused)$"),
    assigned_technician_id: Optional[uuid.UUID] = None,
    assignee_id: Optional[str] = None,  # supports "me", "unassigned", or UUID
    requester_id: Optional[uuid.UUID] = None,
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = None,
    q: Optional[str] = None,
    saved_view_id: Optional[uuid.UUID] = None,
    cursor: Optional[str] = None,
    sort: Optional[str] = Query(None, pattern="^(created_desc|created_asc|due_asc|updated_desc|priority_desc)$"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, company_id)

    # Apply saved view filters as defaults when saved_view_id is specified
    if saved_view_id and isinstance(saved_view_id, uuid.UUID):
        sv = (
            db.query(SavedView)
            .filter(
                SavedView.id == saved_view_id,
                SavedView.company_id == target_cid,
                or_(SavedView.user_id == current_user.id, SavedView.is_shared == True),
            )
            .first()
        )
        if sv and isinstance(sv.filters, dict):
            f = sv.filters
            status_filter = status_filter or f.get("status")
            priority = priority or f.get("priority")
            sla_state = sla_state or f.get("sla_state")
            assignee_id = assignee_id or f.get("assignee_id")
            if not team_id and f.get("team_id"):
                try:
                    team_id = uuid.UUID(str(f["team_id"]))
                except ValueError:
                    pass

    query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
    page_val = page if isinstance(page, int) else 1
    per_page_val = per_page if isinstance(per_page, int) else 20

    # If simple employee role, only show their submitted tickets
    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    if "Employee" in user_roles and len(user_roles) == 1 and not current_user.is_superadmin:
        if current_user.employee_id:
            query = query.filter(HelpDeskTicket.requester_id == current_user.employee_id)

    if branch_id and isinstance(branch_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.branch_id == branch_id)
    if team_id and isinstance(team_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.team_id == team_id)
    if category_id and isinstance(category_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.category_id == category_id)
    if category and isinstance(category, str):
        query = query.filter(HelpDeskTicket.category == category)
    if priority and isinstance(priority, str):
        query = query.filter(HelpDeskTicket.priority == priority)
    if status_filter and isinstance(status_filter, str):
        if "," in status_filter:
            query = query.filter(HelpDeskTicket.status.in_([s.strip() for s in status_filter.split(",") if s.strip()]))
        else:
            query = query.filter(HelpDeskTicket.status == status_filter)
    if sla_state and isinstance(sla_state, str):
        query = query.filter(HelpDeskTicket.sla_state == sla_state)
    if assigned_technician_id and isinstance(assigned_technician_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.assigned_technician_id == assigned_technician_id)
    if assignee_id and isinstance(assignee_id, str):
        val = assignee_id.strip().lower()
        if val == "me":
            query = query.filter(HelpDeskTicket.assigned_technician_id == current_user.id)
        elif val == "unassigned":
            query = query.filter(HelpDeskTicket.assigned_technician_id.is_(None))
        else:
            try:
                query = query.filter(HelpDeskTicket.assigned_technician_id == uuid.UUID(assignee_id.strip()))
            except ValueError:
                raise HTTPException(status_code=400, detail="معرف الفني غير صالح")
    if requester_id and isinstance(requester_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.requester_id == requester_id)
    if created_from and isinstance(created_from, date):
        query = query.filter(HelpDeskTicket.created_at >= datetime.combine(created_from, datetime.min.time()))
    if created_to and isinstance(created_to, date):
        query = query.filter(HelpDeskTicket.created_at <= datetime.combine(created_to, datetime.max.time()))
    if due_from and isinstance(due_from, date):
        query = query.filter(HelpDeskTicket.resolution_due_at >= datetime.combine(due_from, datetime.min.time()))
    if due_to and isinstance(due_to, date):
        query = query.filter(HelpDeskTicket.resolution_due_at <= datetime.combine(due_to, datetime.max.time()))

    search_term = q if (isinstance(q, str) and q.strip()) else (search if isinstance(search, str) else None)
    if search_term and search_term.strip():
        s = f"%{search_term.strip()}%"
        query = query.filter(
            (HelpDeskTicket.ticket_number.ilike(s))
            | (HelpDeskTicket.issue_title.ilike(s))
            | (HelpDeskTicket.issue_description.ilike(s))
        )

    total = query.count()

    # Optional keyset cursor pagination (default created_desc)
    sort_key = sort if isinstance(sort, str) else "created_desc"
    if cursor and isinstance(cursor, str) and sort_key == "created_desc":
        c_ts, c_id = decode_cursor(cursor)
        if c_ts is not None:
            query = query.filter(
                or_(
                    HelpDeskTicket.created_at < c_ts,
                    and_(HelpDeskTicket.created_at == c_ts, HelpDeskTicket.id < c_id),
                )
            )

    if sort_key == "created_asc":
        order_by = (HelpDeskTicket.created_at.asc(), HelpDeskTicket.id.asc())
    elif sort_key == "due_asc":
        order_by = (HelpDeskTicket.resolution_due_at.is_(None), HelpDeskTicket.resolution_due_at.asc(), HelpDeskTicket.created_at.desc())
    elif sort_key == "updated_desc":
        order_by = (HelpDeskTicket.updated_at.desc(), HelpDeskTicket.created_at.desc())
    else:
        order_by = (HelpDeskTicket.created_at.desc(), HelpDeskTicket.id.desc())

    items_q = query.options(
        joinedload(HelpDeskTicket.requester),
        joinedload(HelpDeskTicket.assigned_technician),
        joinedload(HelpDeskTicket.related_asset),
        joinedload(HelpDeskTicket.team),
        selectinload(HelpDeskTicket.comments),
        selectinload(HelpDeskTicket.watchers),
    ).order_by(*order_by)

    if cursor and isinstance(cursor, str) and sort_key == "created_desc":
        fetched = items_q.limit(per_page_val + 1).all()
        has_more = len(fetched) > per_page_val
        items = fetched[:per_page_val]
    else:
        fetched = items_q.offset((page_val - 1) * per_page_val).limit(per_page_val + 1).all()
        has_more = len(fetched) > per_page_val
        items = fetched[:per_page_val]

    next_cursor = encode_cursor(items[-1].created_at, items[-1].id) if (has_more and items) else None

    ticket_ids = [t.id for t in items]
    linked_task_counts: Dict[uuid.UUID, int] = {}
    if ticket_ids:
        for (rtid,) in db.query(Task.related_ticket_id).filter(Task.related_ticket_id.in_(ticket_ids)).all():
            if rtid:
                linked_task_counts[rtid] = linked_task_counts.get(rtid, 0) + 1

    data = []
    for t in items:
        req_name = t.requester.full_name if t.requester else None
        tech_name = (
            t.assigned_technician.employee.full_name
            if (t.assigned_technician and t.assigned_technician.employee)
            else (t.assigned_technician.username if t.assigned_technician else None)
        )
        asset_name = t.related_asset.asset_name if t.related_asset else None

        data.append({
            "id": str(t.id),
            "company_id": str(t.company_id),
            "branch_id": str(t.branch_id) if t.branch_id else None,
            "team_id": str(t.team_id) if t.team_id else None,
            "team_name": t.team.name if t.team else None,
            "category_id": str(t.category_id) if t.category_id else None,
            "ticket_number": t.ticket_number,
            "issue_title": t.issue_title,
            "issue_description": t.issue_description,
            "requester_id": str(t.requester_id) if t.requester_id else None,
            "requester_name": req_name,
            "assigned_technician_id": str(t.assigned_technician_id) if t.assigned_technician_id else None,
            "assigned_technician_name": tech_name,
            "priority": t.priority,
            "status": t.status,
            "category": t.category,
            "sla_policy_id": str(t.sla_policy_id) if t.sla_policy_id else None,
            "first_response_due_at": t.first_response_due_at.isoformat() if t.first_response_due_at else None,
            "resolution_due_at": t.resolution_due_at.isoformat() if t.resolution_due_at else None,
            "sla_state": t.sla_state or "ok",
            "merged_into_ticket_id": str(t.merged_into_ticket_id) if t.merged_into_ticket_id else None,
            "require_tasks_done_to_close": bool(t.require_tasks_done_to_close),
            "related_asset_id": str(t.related_asset_id) if t.related_asset_id else None,
            "related_asset_name": asset_name,
            "resolved_at": t.resolved_at,
            "closed_at": t.closed_at,
            "comments_count": len(t.comments),
            "watchers_count": len(t.watchers),
            "linked_tasks_count": linked_task_counts.get(t.id, 0),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        })

    pagination = paginate(total=total, page=page_val, per_page=per_page_val, next_cursor=next_cursor)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
    request: Request = None,
):
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)

    idem_key = extract_idempotency_key(request)
    if idem_key:
        cached = lookup_idempotent_response(db, target_cid, current_user.id, idem_key, "POST", "/api/v1/tickets")
        if cached is not None:
            return cached

    validate_company_fk(db, Branch, payload.branch_id, target_cid, "الفرع")
    validate_company_fk(db, Employee, payload.requester_id, target_cid, "مقدم الطلب")
    validate_company_fk(db, TechnicalAsset, payload.related_asset_id, target_cid, "الأصل المرتبط")
    if payload.team_id:
        validate_company_fk(db, Team, payload.team_id, target_cid, "الفريق")
    if payload.category_id:
        validate_company_fk(db, TicketCategory, payload.category_id, target_cid, "التصنيف")
    if payload.sla_policy_id:
        validate_company_fk(db, SlaPolicy, payload.sla_policy_id, target_cid, "سياسة SLA")

    t_number = generate_ticket_number(target_cid, db)

    # Resolve requester
    requester_id = payload.requester_id or current_user.employee_id

    # Calculate legacy SLA target fallback
    sla_mins = TICKET_SLA_MINUTES.get(payload.priority, 4320)
    sla_target = datetime.utcnow() + timedelta(minutes=sla_mins)

    initial_status = "Open"
    approval_status_val = "None"
    curr_approval_stage = None

    catalog_item = None
    if payload.catalog_item_id:
        catalog_item = db.query(ServiceCatalogItem).filter(
            ServiceCatalogItem.id == payload.catalog_item_id,
            ServiceCatalogItem.company_id == target_cid,
        ).first()

    if catalog_item and catalog_item.requires_approval:
        initial_status = "Pending Approval"
        approval_status_val = "Pending"
        curr_approval_stage = catalog_item.approval_type or "Manager"

    resolved_category = payload.category
    if payload.category_id:
        cat_obj = db.query(TicketCategory).filter(TicketCategory.id == payload.category_id).first()
        if cat_obj:
            resolved_category = cat_obj.name

    ticket = HelpDeskTicket(
        company_id=target_cid,
        branch_id=payload.branch_id,
        team_id=payload.team_id,
        category_id=payload.category_id,
        sla_policy_id=payload.sla_policy_id,
        ticket_number=t_number,
        issue_title=payload.issue_title.strip(),
        issue_description=payload.issue_description.strip(),
        requester_id=requester_id,
        assigned_technician_id=None,
        priority=payload.priority,
        status=initial_status,
        category=resolved_category,
        ticket_type=payload.ticket_type or "Incident",
        tier=payload.tier or "L1",
        sla_target_at=sla_target,
        sla_status="Within_SLA",
        sla_state="ok",
        require_tasks_done_to_close=bool(payload.require_tasks_done_to_close),
        voice_note_url=payload.voice_note_url,
        problem_id=payload.problem_id,
        related_asset_id=payload.related_asset_id,
        catalog_item_id=payload.catalog_item_id,
        custom_fields_data=payload.custom_fields_data,
        current_approval_stage=curr_approval_stage,
        approval_status=approval_status_val,
        notes=payload.notes,
        attachments=payload.attachments,
    )
    db.add(ticket)
    db.flush()

    # Apply business-hours SLA policy
    apply_sla_to_ticket(db, ticket, explicit_policy_id=payload.sla_policy_id)

    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=target_cid,
            actor_id=current_user.id,
            kind="status_change",
            payload={"from": None, "to": ticket.status, "created": True},
            visibility="public",
        )
    )

    if catalog_item and catalog_item.requires_approval:
        approval_record = TicketApproval(
            company_id=target_cid,
            ticket_id=ticket.id,
            approval_stage=curr_approval_stage,
            stage_order=1,
            status="Pending",
        )
        db.add(approval_record)
        db.commit()
    else:
        # Try rule-driven assignment engine first; fallback to legacy deterministic routing if no rules/teams exist
        has_rules_or_team = (
            ticket.team_id is not None
            or db.query(AssignmentRule.id)
            .filter(
                AssignmentRule.company_id == target_cid,
                AssignmentRule.entity_type == "ticket",
                AssignmentRule.is_active == True,
            )
            .first()
            is not None
        )
        if has_rules_or_team:
            db.flush()
            auto_assign_ticket(
                db=db,
                ticket=ticket,
                actor_id=current_user.id,
                commit=True,
                ip_address=request.client.host if (request and request.client) else None,
            )
        else:
            fallback_tech = route_ticket_deterministically(target_cid, payload.branch_id, db)
            if fallback_tech:
                ticket.assigned_technician_id = fallback_tech
                ticket.status = "Assigned"
            db.commit()

    db.refresh(ticket)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={
            "ticket_number": ticket.ticket_number,
            "title": ticket.issue_title,
            "team_id": str(ticket.team_id) if ticket.team_id else None,
            "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
        },
    )

    resp = success_response(
        data={
            "id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "status": ticket.status,
            "team_id": str(ticket.team_id) if ticket.team_id else None,
            "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
            "sla_state": ticket.sla_state,
            "resolution_due_at": ticket.resolution_due_at.isoformat() if ticket.resolution_due_at else None,
        },
        message=f"تم إنشاء التذكرة رقم {ticket.ticket_number} بنجاح",
    )
    if idem_key:
        store_idempotent_response(db, target_cid, current_user.id, idem_key, "POST", "/api/v1/tickets", resp)
    return resp


@router.post("/bulk")
def bulk_update_tickets(
    payload: TicketBulkRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TICKET_BULK)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Apply a bulk action across up to 100 tickets in active_cid with partial per-item reporting."""
    idem_key = extract_idempotency_key(request)
    if idem_key:
        cached = lookup_idempotent_response(db, active_cid, current_user.id, idem_key, "POST", "/api/v1/tickets/bulk")
        if cached is not None:
            return cached

    ip_addr = request.client.host if request.client else None
    succeeded: List[str] = []
    failed: List[Dict[str, Any]] = []

    for tid in payload.ticket_ids:
        ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == tid).first()
        if not ticket:
            failed.append({"id": str(tid), "error": "Ticket not found"})
            continue
        if not current_user.is_superadmin and ticket.company_id != active_cid:
            failed.append({"id": str(tid), "error": "Forbidden: cross-company access denied"})
            continue

        try:
            if payload.action == "assign":
                if not has_granular_permission(current_user, GranularPermission.TICKET_ASSIGN, ticket.company_id, db):
                    raise HTTPException(status_code=403, detail="Missing ticket:assign permission")
                manual_assign_ticket(
                    db=db,
                    ticket=ticket,
                    team_id=payload.team_id,
                    assignee_id=payload.assignee_id,
                    actor_id=current_user.id,
                    reason="bulk_assign",
                    commit=True,
                    ip_address=ip_addr,
                )
            elif payload.action == "team":
                if not payload.team_id:
                    raise HTTPException(status_code=400, detail="team_id is required for action='team'")
                manual_assign_ticket(
                    db=db,
                    ticket=ticket,
                    team_id=payload.team_id,
                    actor_id=current_user.id,
                    reason="bulk_team",
                    commit=True,
                    ip_address=ip_addr,
                )
            elif payload.action == "transition":
                if not payload.to_status:
                    raise HTTPException(status_code=400, detail="to_status is required for action='transition'")
                _validate_and_apply_ticket_transition(
                    db=db,
                    ticket=ticket,
                    to_status=payload.to_status,
                    actor=current_user,
                    comment=payload.comment,
                    ip_address=ip_addr,
                )
                db.commit()
            elif payload.action == "close":
                _validate_and_apply_ticket_transition(
                    db=db,
                    ticket=ticket,
                    to_status="Closed",
                    actor=current_user,
                    comment=payload.comment,
                    ip_address=ip_addr,
                )
                db.commit()
            elif payload.action == "priority":
                if not payload.priority:
                    raise HTTPException(status_code=400, detail="priority is required for action='priority'")
                old_p = ticket.priority
                ticket.priority = payload.priority.strip()
                apply_sla_to_ticket(db, ticket)
                db.add(
                    TicketEvent(
                        ticket_id=ticket.id,
                        company_id=ticket.company_id,
                        actor_id=current_user.id,
                        kind="priority_change",
                        payload={"from": old_p, "to": ticket.priority, "reason": "bulk_priority"},
                        visibility="public",
                    )
                )
                log_audit(
                    db=db,
                    action="BULK_PRIORITY",
                    resource_type="HelpDeskTicket",
                    resource_id=str(ticket.id),
                    user_id=current_user.id,
                    company_id=ticket.company_id,
                    old_values={"priority": old_p},
                    new_values={"priority": ticket.priority},
                    ip_address=ip_addr,
                    commit=False,
                )
                db.commit()
            succeeded.append(str(tid))
        except HTTPException as exc:
            db.rollback()
            failed.append({"id": str(tid), "error": exc.detail})
        except ValueError as exc:
            db.rollback()
            failed.append({"id": str(tid), "error": str(exc)})

    resp = success_response(
        data={
            "action": payload.action,
            "succeeded": succeeded,
            "failed": failed,
            "succeeded_count": len(succeeded),
            "failed_count": len(failed),
        },
        message=f"تم تنفيذ الإجراء الجماعي على {len(succeeded)} تذكرة",
    )
    if idem_key:
        store_idempotent_response(db, active_cid, current_user.id, idem_key, "POST", "/api/v1/tickets/bulk", resp)
    return resp


@router.get("/summary")
def get_tickets_summary(
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Authoritative KPI summary for helpdesk tickets strictly scoped to company/branch/role."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)

    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    if "Employee" in user_roles and len(user_roles) == 1 and not current_user.is_superadmin:
        if current_user.employee_id:
            query = query.filter(HelpDeskTicket.requester_id == current_user.employee_id)

    if branch_id:
        query = query.filter(HelpDeskTicket.branch_id == branch_id)

    total = query.count()
    open_count = query.filter(HelpDeskTicket.status.in_(["Open", "Assigned", "Pending"])).count()
    in_progress_count = query.filter(HelpDeskTicket.status == "In Progress").count()
    resolved_count = query.filter(HelpDeskTicket.status.in_(["Resolved", "Closed"])).count()
    critical_count = query.filter(
        HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"]),
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()

    return success_response(data={
        "total": total,
        "open": open_count,
        "in_progress": in_progress_count,
        "resolved": resolved_count,
        "critical": critical_count,
    })


# ── Multimedia & Voice Notes ─────────────────────────────────────────────

@router.post("/voice/upload")
async def upload_ticket_voice_note(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
):
    """Upload a voice note recording for Help Desk ticket submission with size limit and tenant isolation."""
    content = await file.read()
    max_bytes = 10 * 1024 * 1024
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="الملف الصوتي المرفوع فارغ")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="حجم الملف الصوتي يتجاوز الحد المسموح به (10 ميجابايت)")

    content_type = (file.content_type or "audio/webm").lower()
    ext = ".webm"
    if "mp4" in content_type or "m4a" in content_type:
        ext = ".m4a"
    elif "ogg" in content_type:
        ext = ".ogg"
    elif "wav" in content_type:
        ext = ".wav"
    elif "mp3" in content_type or "mpeg" in content_type:
        ext = ".mp3"

    filename = f"ticket_voice_{uuid.uuid4().hex[:16]}{ext}"
    company_dir = os.path.join(VOICE_TICKET_DIR, str(active_cid))
    os.makedirs(company_dir, exist_ok=True)
    file_path = os.path.join(company_dir, filename)
    with open(file_path, "wb") as f:
        f.write(content)

    url = f"/api/v1/tickets/voice/{filename}"
    return success_response(data={"voice_note_url": url, "filename": filename}, message="تم رفع التسجيل الصوتي بنجاح")


@router.get("/voice/{filename}")
def get_ticket_voice_file(
    filename: str,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Serve recorded ticket voice note with strict authentication, filename validation, and tenant isolation."""
    clean_name = os.path.basename(filename)
    if clean_name != filename or not re.match(r"^ticket_voice_[a-fA-F0-9]+\.(webm|ogg|m4a|mp4|wav|mp3)$", clean_name):
        raise HTTPException(status_code=400, detail="اسم الملف الصوتي غير صالح")

    base_dir = os.path.abspath(VOICE_TICKET_DIR)
    company_dir = os.path.abspath(os.path.join(base_dir, str(active_cid)))
    candidate = os.path.abspath(os.path.join(company_dir, clean_name))

    target_path = None
    if candidate.startswith(company_dir + os.sep) and os.path.isfile(candidate):
        target_path = candidate
    else:
        # Backward compatibility for pre-folder legacy files ONLY if a ticket in active_cid owns it (or superadmin)
        legacy_path = os.path.abspath(os.path.join(base_dir, clean_name))
        if legacy_path.startswith(base_dir + os.sep) and os.path.isfile(legacy_path):
            owner_ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.voice_note_url.like(f"%{clean_name}%")).first()
            if current_user.is_superadmin or (owner_ticket and owner_ticket.company_id == active_cid):
                target_path = legacy_path
            else:
                raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا التسجيل الصوتي")
        elif current_user.is_superadmin and os.path.isdir(base_dir):
            for entry in os.listdir(base_dir):
                alt = os.path.abspath(os.path.join(base_dir, entry, clean_name))
                if alt.startswith(base_dir + os.sep) and os.path.isfile(alt):
                    target_path = alt
                    break

    if not target_path:
        raise HTTPException(status_code=404, detail="الملف الصوتي غير موجود")

    media_type = "audio/webm"
    if clean_name.endswith((".m4a", ".mp4")):
        media_type = "audio/mp4"
    elif clean_name.endswith(".ogg"):
        media_type = "audio/ogg"
    elif clean_name.endswith(".wav"):
        media_type = "audio/wav"
    elif clean_name.endswith(".mp3"):
        media_type = "audio/mpeg"

    return FileResponse(target_path, media_type=media_type, headers={"Cache-Control": "private, max-age=3600"})


# ── ITIL 4 Problem Management Endpoints (Phase 6) ────────────────────────

@router.get("/problems/list")
def list_problems(
    company_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List Problem Management records for recurring technical incident analysis."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(ProblemRecord).filter(ProblemRecord.company_id == target_cid)
    if status_filter:
        query = query.filter(ProblemRecord.status == status_filter)

    problems = query.order_by(ProblemRecord.created_at.desc()).all()
    data = []
    for p in problems:
        data.append({
            "id": str(p.id),
            "company_id": str(p.company_id),
            "title": p.title,
            "description": p.description,
            "root_cause": p.root_cause,
            "workaround": p.workaround,
            "status": p.status,
            "assigned_to_id": str(p.assigned_to_id) if p.assigned_to_id else None,
            "assigned_to_name": p.assigned_to.username if p.assigned_to else None,
            "linked_tickets_count": len(p.tickets),
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        })
    return success_response(data=data)


@router.post("/problems")
def create_problem(
    payload: ProblemRecordCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new Problem Record for investigating root cause of incidents."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    prob = ProblemRecord(
        company_id=target_cid,
        title=payload.title.strip(),
        description=payload.description.strip(),
        root_cause=payload.root_cause,
        workaround=payload.workaround,
        status=payload.status or "Open",
        assigned_to_id=payload.assigned_to_id or current_user.id,
    )
    db.add(prob)
    db.commit()
    db.refresh(prob)

    log_audit(
        db=db, action="CREATE", resource_type="ProblemRecord",
        resource_id=str(prob.id), user_id=current_user.id, company_id=target_cid,
        new_values={"title": prob.title},
    )
    return success_response(data={"id": str(prob.id)}, message="تم إنشاء سجل المشكلة الجذرية بنجاح")


# ── Knowledge Base Endpoints (Phase 6) ───────────────────────────────────

@router.get("/knowledge/list")
def list_knowledge_articles(
    company_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Deterministic fast search of verified Knowledge Base articles without AI."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(KnowledgeArticle).filter(KnowledgeArticle.company_id == target_cid)

    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    is_staff = any(r in ["Super Admin", "Company Admin", "IT Manager", "IT Technician"] for r in user_roles)
    if not is_staff:
        query = query.filter(KnowledgeArticle.is_published == True)

    if category:
        query = query.filter(KnowledgeArticle.category == category)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (KnowledgeArticle.title.ilike(s))
            | (KnowledgeArticle.symptom.ilike(s))
            | (KnowledgeArticle.resolution.ilike(s))
        )

    articles = query.order_by(KnowledgeArticle.created_at.desc()).all()
    data = []
    for a in articles:
        data.append({
            "id": str(a.id),
            "company_id": str(a.company_id),
            "title": a.title,
            "category": a.category,
            "symptom": a.symptom,
            "diagnostic_steps": a.diagnostic_steps,
            "resolution": a.resolution,
            "is_published": a.is_published,
            "author_id": str(a.author_id) if a.author_id else None,
            "author_name": a.author.username if a.author else None,
            "approved_by_id": str(a.approved_by_id) if a.approved_by_id else None,
            "approved_by_name": a.approved_by.username if a.approved_by else None,
            "created_at": a.created_at.isoformat(),
            "updated_at": a.updated_at.isoformat(),
        })
    return success_response(data=data)


@router.post("/knowledge")
def create_knowledge_article(
    payload: KnowledgeArticleCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new operational Knowledge Base article."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    is_approver = any(r in ["Super Admin", "Company Admin", "IT Manager"] for r in user_roles)

    article = KnowledgeArticle(
        company_id=target_cid,
        title=payload.title.strip(),
        category=payload.category,
        symptom=payload.symptom.strip(),
        diagnostic_steps=payload.diagnostic_steps,
        resolution=payload.resolution.strip(),
        is_published=payload.is_published and is_approver,
        author_id=current_user.id,
        approved_by_id=current_user.id if (payload.is_published and is_approver) else None,
    )
    db.add(article)
    db.commit()
    db.refresh(article)

    log_audit(
        db=db, action="CREATE", resource_type="KnowledgeArticle",
        resource_id=str(article.id), user_id=current_user.id, company_id=target_cid,
        new_values={"title": article.title, "category": article.category, "is_published": article.is_published},
    )
    return success_response(data={"id": str(article.id)}, message="تم إنشاء المقال المعرفي بنجاح")


# ── Enterprise Service Catalog Endpoints ─────────────────────────────────

@router.get("/catalog")
def list_service_catalog_items(
    company_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List service catalog items with automatic enterprise seeding if empty."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)

    # Automatic idempotent seeding if catalog is empty for this company
    existing_count = db.query(ServiceCatalogItem).filter(ServiceCatalogItem.company_id == target_cid).count()
    if existing_count == 0:
        seed_service_desk_defaults(db, target_cid)

    query = db.query(ServiceCatalogItem).filter(ServiceCatalogItem.company_id == target_cid)
    if not include_inactive:
        query = query.filter(ServiceCatalogItem.is_active == True)
    if category:
        query = query.filter(ServiceCatalogItem.category == category)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (ServiceCatalogItem.name_ar.ilike(s))
            | (ServiceCatalogItem.name_en.ilike(s))
            | (ServiceCatalogItem.description_ar.ilike(s))
        )

    items = query.order_by(ServiceCatalogItem.display_order.asc(), ServiceCatalogItem.created_at.asc()).all()
    data = []
    for it in items:
        data.append({
            "id": str(it.id),
            "company_id": str(it.company_id),
            "category": it.category,
            "name_ar": it.name_ar,
            "name_en": it.name_en,
            "description_ar": it.description_ar,
            "icon": it.icon,
            "default_priority": it.default_priority,
            "estimated_duration_hours": it.estimated_duration_hours,
            "requires_approval": it.requires_approval,
            "approval_type": it.approval_type,
            "workflow_template": it.workflow_template,
            "dynamic_form_schema": it.dynamic_form_schema,
            "sla_policy_id": str(getattr(it, "sla_policy_id", None)) if getattr(it, "sla_policy_id", None) else None,
            "is_active": it.is_active,
            "display_order": it.display_order,
            "created_at": it.created_at.isoformat() if it.created_at else None,
        })
    return success_response(data=data)


@router.post("/catalog")
def create_service_catalog_item(
    payload: ServiceCatalogItemCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new service catalog item."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    item = ServiceCatalogItem(
        company_id=target_cid,
        category=payload.category,
        name_ar=payload.name_ar.strip(),
        name_en=payload.name_en.strip() if payload.name_en else None,
        description_ar=payload.description_ar.strip() if payload.description_ar else None,
        icon=payload.icon or "HelpCircle",
        default_priority=payload.default_priority,
        estimated_duration_hours=payload.estimated_duration_hours,
        requires_approval=payload.requires_approval,
        approval_type=payload.approval_type,
        workflow_template=payload.workflow_template,
        dynamic_form_schema=payload.dynamic_form_schema,
        sla_policy_id=payload.sla_policy_id,
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    log_audit(
        db=db, action="CREATE", resource_type="ServiceCatalogItem",
        resource_id=str(item.id), user_id=current_user.id, company_id=target_cid,
        new_values={"name_ar": item.name_ar, "category": item.category},
    )
    return success_response(data={"id": str(item.id)}, message="تم إضافة خدمة جديدة إلى دليل الخدمات بنجاح")


@router.put("/catalog/{item_id}")
def update_service_catalog_item(
    item_id: uuid.UUID,
    payload: ServiceCatalogItemUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update an existing service catalog item."""
    item = db.query(ServiceCatalogItem).filter(ServiceCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="عنصر دليل الخدمات غير موجود")

    if not current_user.is_superadmin and item.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذا العنصر")

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(item, field, val)

    db.commit()
    db.refresh(item)

    log_audit(
        db=db, action="UPDATE", resource_type="ServiceCatalogItem",
        resource_id=str(item.id), user_id=current_user.id, company_id=item.company_id,
        new_values=update_data,
    )
    return success_response(data={"id": str(item.id)}, message="تم تحديث عنصر دليل الخدمات بنجاح")


@router.delete("/catalog/{item_id}")
def delete_service_catalog_item(
    item_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Soft delete a service catalog item."""
    item = db.query(ServiceCatalogItem).filter(ServiceCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="عنصر دليل الخدمات غير موجود")

    if not current_user.is_superadmin and item.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذا العنصر")

    item.is_active = False
    db.commit()

    log_audit(
        db=db, action="DEACTIVATE", resource_type="ServiceCatalogItem",
        resource_id=str(item.id), user_id=current_user.id, company_id=item.company_id,
    )
    return success_response(data={"id": str(item.id)}, message="تم إلغاء تفعيل عنصر الخدمة بنجاح")


# ── Ticket Approvals Endpoints ───────────────────────────────────────────

@router.get("/approvals")
def list_ticket_approvals(
    company_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List service desk approvals for current user or company."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    is_mgmt = any(r in ["Super Admin", "Company Admin", "IT Manager", "Finance Manager"] for r in user_roles)

    query = (
        db.query(TicketApproval)
        .join(HelpDeskTicket, TicketApproval.ticket_id == HelpDeskTicket.id)
        .filter(TicketApproval.company_id == target_cid)
    )

    if not is_mgmt:
        query = query.filter(TicketApproval.assigned_approver_id == current_user.id)

    if status_filter:
        query = query.filter(TicketApproval.status == status_filter)

    approvals = query.order_by(TicketApproval.created_at.desc()).all()
    data = []
    for a in approvals:
        t = a.ticket
        data.append({
            "id": str(a.id),
            "ticket_id": str(a.ticket_id),
            "ticket_number": t.ticket_number if t else None,
            "ticket_title": t.issue_title if t else None,
            "ticket_priority": t.priority if t else None,
            "ticket_creator_name": t.requester.full_name if (t and t.requester) else None,
            "stage_name": a.approval_stage,
            "stage_order": a.stage_order,
            "status": a.status,
            "approver_id": str(a.assigned_approver_id) if a.assigned_approver_id else None,
            "approver_name": a.assigned_approver.username if a.assigned_approver else None,
            "decided_by_id": str(a.decided_by_id) if a.decided_by_id else None,
            "decided_by_name": a.decided_by.username if a.decided_by else None,
            "decision_notes": a.decision_notes,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "decided_at": a.decided_at.isoformat() if a.decided_at else None,
        })
    return success_response(data=data)


@router.post("/approvals/{approval_id}/decision")
def decide_ticket_approval(
    approval_id: uuid.UUID,
    payload: TicketApprovalDecision,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Record an approve or reject decision on a service request."""
    appr = db.query(TicketApproval).filter(TicketApproval.id == approval_id).first()
    if not appr:
        raise HTTPException(status_code=404, detail="طلب الاعتماد غير موجود")

    if not current_user.is_superadmin and appr.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذا الاعتماد")

    user_roles = get_user_roles(current_user, db, company_id=appr.company_id)
    is_approver = any(r in ["Super Admin", "Company Admin", "IT Manager", "Finance Manager"] for r in user_roles)
    if not is_approver and appr.assigned_approver_id != current_user.id:
        raise HTTPException(status_code=403, detail="غير مصرح لك باتخاذ قرار بشأن هذا الاعتماد")

    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == appr.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة المرتبطة غير موجودة")

    try:
        updated_appr = process_ticket_approval(
            db=db,
            ticket=ticket,
            approval_id=approval_id,
            decision=payload.decision,
            decider_user=current_user,
            notes=payload.decision_notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    log_audit(
        db=db,
        action="APPROVAL_DECISION",
        resource_type="TicketApproval",
        resource_id=str(appr.id),
        user_id=current_user.id,
        company_id=appr.company_id,
        new_values={"decision": payload.decision, "ticket_id": str(ticket.id), "notes": payload.decision_notes},
    )

    return success_response(
        data={"approval_id": str(appr.id), "ticket_id": str(ticket.id), "decision": payload.decision},
        message=f"تم تسجيل قرار الاعتماد ({payload.decision}) بنجاح"
    )


# ── Service Workflows Endpoints ──────────────────────────────────────────

@router.get("/workflows")
def list_service_workflows(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List service workflows for the company."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)

    # Check if empty, seed defaults
    existing_count = db.query(ServiceWorkflow).filter(ServiceWorkflow.company_id == target_cid).count()
    if existing_count == 0:
        seed_service_desk_defaults(db, target_cid)

    workflows = (
        db.query(ServiceWorkflow)
        .filter(ServiceWorkflow.company_id == target_cid, ServiceWorkflow.is_active == True)
        .order_by(ServiceWorkflow.created_at.desc())
        .all()
    )
    data = []
    for wf in workflows:
        data.append({
            "id": str(wf.id),
            "company_id": str(wf.company_id),
            "workflow_key": wf.workflow_key,
            "name_ar": wf.name_ar,
            "name_en": wf.name_en,
            "description": wf.description,
            "version": wf.version,
            "status": wf.status,
            "nodes_json": wf.nodes_json,
            "transitions_json": wf.transitions_json,
            "is_active": wf.is_active,
            "created_at": wf.created_at.isoformat() if wf.created_at else None,
        })
    return success_response(data=data)


@router.post("/workflows")
def create_or_update_workflow(
    payload: ServiceWorkflowCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Save or publish a service workflow definition."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)

    wf = (
        db.query(ServiceWorkflow)
        .filter(ServiceWorkflow.company_id == target_cid, ServiceWorkflow.workflow_key == payload.workflow_key)
        .first()
    )

    if wf:
        wf.name_ar = payload.name_ar.strip()
        wf.name_en = payload.name_en.strip() if payload.name_en else None
        wf.description = payload.description.strip() if payload.description else None
        wf.nodes_json = payload.nodes_json
        wf.transitions_json = payload.transitions_json
        wf.status = payload.status
        wf.version = wf.version + 1
        db.commit()
        db.refresh(wf)
        msg = "تم تحديث مسار العمل بنجاح"
    else:
        wf = ServiceWorkflow(
            company_id=target_cid,
            workflow_key=payload.workflow_key.strip(),
            name_ar=payload.name_ar.strip(),
            name_en=payload.name_en.strip() if payload.name_en else None,
            description=payload.description.strip() if payload.description else None,
            nodes_json=payload.nodes_json,
            transitions_json=payload.transitions_json,
            status=payload.status,
            version=1,
            is_active=True,
        )
        db.add(wf)
        db.commit()
        db.refresh(wf)
        msg = "تم إنشاء مسار العمل الجديد بنجاح"

    log_audit(
        db=db, action="SAVE_WORKFLOW", resource_type="ServiceWorkflow",
        resource_id=str(wf.id), user_id=current_user.id, company_id=target_cid,
        new_values={"workflow_key": wf.workflow_key, "version": wf.version},
    )
    return success_response(data={"id": str(wf.id), "version": wf.version}, message=msg)


# ── SLA Policies Endpoints ───────────────────────────────────────────────

@router.get("/slas")
def list_sla_policies(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List SLA Policies for the company."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)

    # Check if empty, seed defaults
    existing_count = db.query(SlaPolicy).filter(SlaPolicy.company_id == target_cid).count()
    if existing_count == 0:
        seed_service_desk_defaults(db, target_cid)

    slas = (
        db.query(SlaPolicy)
        .filter(SlaPolicy.company_id == target_cid, SlaPolicy.is_active == True)
        .order_by(SlaPolicy.first_response_minutes.asc())
        .all()
    )
    data = []
    for s in slas:
        data.append({
            "id": str(s.id),
            "company_id": str(s.company_id),
            "name": s.name,
            "name_ar": s.name,
            "name_en": s.name,
            "priority": s.priority,
            "first_response_minutes": s.first_response_minutes,
            "resolution_minutes": s.resolution_minutes,
            "response_time_minutes": s.first_response_minutes,
            "resolution_time_minutes": s.resolution_minutes,
            "escalation_notify_minutes": s.escalation_notify_minutes,
            "business_hours_only": s.business_hours_only,
            "business_hours": s.business_hours,
            "is_default": bool(s.is_default),
            "escalate_on_breach": bool(s.escalate_on_breach),
            "bump_priority_on_breach": bool(s.bump_priority_on_breach),
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return success_response(data=data)


@router.post("/slas")
def create_sla_policy(
    payload: SlaPolicyCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new SLA Policy."""
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    sla = SlaPolicy(
        company_id=target_cid,
        name=payload.name.strip(),
        priority=payload.priority,
        first_response_minutes=payload.first_response_minutes,
        resolution_minutes=payload.resolution_minutes,
        escalation_notify_minutes=payload.escalation_notify_minutes,
        business_hours_only=payload.business_hours_only,
        is_active=payload.is_active,
    )
    db.add(sla)
    db.commit()
    db.refresh(sla)

    log_audit(
        db=db, action="CREATE", resource_type="SlaPolicy",
        resource_id=str(sla.id), user_id=current_user.id, company_id=target_cid,
        new_values={"name": sla.name, "priority": sla.priority},
    )
    return success_response(data={"id": str(sla.id)}, message="تم إنشاء سياسة مستوى الخدمة بنجاح")


@router.put("/slas/{sla_id}")
def update_sla_policy(
    sla_id: uuid.UUID,
    payload: SlaPolicyUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update an SLA Policy."""
    sla = db.query(SlaPolicy).filter(SlaPolicy.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="سياسة مستوى الخدمة غير موجودة")

    if not current_user.is_superadmin and sla.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذه السياسة")

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(sla, field, val)

    db.commit()
    db.refresh(sla)

    log_audit(
        db=db, action="UPDATE", resource_type="SlaPolicy",
        resource_id=str(sla.id), user_id=current_user.id, company_id=sla.company_id,
        new_values=update_data,
    )
    return success_response(data={"id": str(sla.id)}, message="تم تحديث سياسة مستوى الخدمة بنجاح")






@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")

    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    user_roles = get_user_roles(current_user, db, company_id=ticket.company_id)
    is_staff = any(r in ["Super Admin", "Company Admin", "IT Manager", "IT Technician"] for r in user_roles)
    is_auditor = "Auditor" in user_roles

    # Non-staff Employee can only view their own tickets or tickets they watch
    if not is_staff and not is_auditor and not current_user.is_superadmin:
        is_watcher = (
            db.query(TicketWatcher.id)
            .filter(TicketWatcher.ticket_id == ticket.id, TicketWatcher.user_id == current_user.id)
            .first()
            is not None
        )
        if ticket.requester_id != current_user.employee_id and not is_watcher:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض هذه التذكرة")

    # Fetch comments: Filter out internal notes for non-staff employees!
    comment_query = db.query(TicketComment).filter(TicketComment.ticket_id == ticket.id)
    if not is_staff:
        comment_query = comment_query.filter(TicketComment.is_internal == False)

    comments = comment_query.order_by(TicketComment.created_at.asc()).all()
    comments_data = [
        {
            "id": str(c.id),
            "user_id": str(c.user_id),
            "user_name": c.user.username if c.user else "مستخدم",
            "content": c.content,
            "is_internal": c.is_internal,
            "created_at": c.created_at,
        }
        for c in comments
    ]

    linked_tasks = (
        db.query(Task)
        .filter(Task.related_ticket_id == ticket.id, Task.company_id == ticket.company_id)
        .order_by(Task.created_at.desc())
        .all()
    )
    linked_task = linked_tasks[0] if linked_tasks else None
    linked_tasks_data = [
        {
            "id": str(lt.id),
            "title": lt.title,
            "status": lt.status,
            "priority": lt.priority,
            "assignee_id": str(lt.assignee_id) if lt.assignee_id else None,
            "assigned_to_id": str(lt.assigned_to_id) if lt.assigned_to_id else None,
            "assigned_to_name": lt.assigned_to.full_name if lt.assigned_to else None,
            "due_date": lt.due_date.isoformat() if lt.due_date else None,
        }
        for lt in linked_tasks
    ]

    watchers_rows = (
        db.query(TicketWatcher)
        .filter(TicketWatcher.ticket_id == ticket.id, TicketWatcher.company_id == ticket.company_id)
        .all()
    )
    watchers_data = [
        {
            "user_id": str(w.user_id),
            "username": w.user.username if w.user else None,
            "full_name": w.user.employee.full_name if (w.user and w.user.employee) else (w.user.username if w.user else None),
        }
        for w in watchers_rows
    ]

    ensure_workflow_transitions(db, ticket.company_id, entity_type="ticket")
    allowed_edges = (
        db.query(WorkflowTransition)
        .filter(
            WorkflowTransition.company_id == ticket.company_id,
            WorkflowTransition.entity_type == "ticket",
            WorkflowTransition.from_status == ticket.status,
            WorkflowTransition.is_active == True,
        )
        .all()
    )
    allowed_transitions = [
        {
            "to_status": e.to_status,
            "requires_comment": e.requires_comment,
            "required_permission": e.required_permission,
        }
        for e in allowed_edges
        if (not e.required_permission or has_granular_permission(current_user, e.required_permission, ticket.company_id, db))
    ]

    approvals = db.query(TicketApproval).filter(TicketApproval.ticket_id == ticket.id).order_by(TicketApproval.stage_order.asc()).all()
    approvals_data = [
        {
            "id": str(a.id),
            "approval_stage": a.approval_stage,
            "stage_order": a.stage_order,
            "status": a.status,
            "decision_notes": a.decision_notes,
            "decided_at": a.decided_at.isoformat() if a.decided_at else None,
            "decided_by_name": a.decided_by.username if a.decided_by else None,
            "assigned_approver_name": a.assigned_approver.username if a.assigned_approver else None,
        }
        for a in approvals
    ]

    related_asset_info = None
    if ticket.related_asset:
        past_ticket_count = db.query(HelpDeskTicket).filter(
            HelpDeskTicket.related_asset_id == ticket.related_asset_id,
            HelpDeskTicket.id != ticket.id,
        ).count()
        related_asset_info = {
            "id": str(ticket.related_asset.id),
            "asset_code": ticket.related_asset.asset_code,
            "asset_name": ticket.related_asset.asset_name,
            "model": getattr(ticket.related_asset, "model", None),
            "serial_number": getattr(ticket.related_asset, "serial_number", None),
            "status": ticket.related_asset.status,
            "past_tickets_count": past_ticket_count,
        }

    data = {
        "id": str(ticket.id),
        "company_id": str(ticket.company_id),
        "branch_id": str(ticket.branch_id) if ticket.branch_id else None,
        "team_id": str(ticket.team_id) if ticket.team_id else None,
        "team_name": ticket.team.name if ticket.team else None,
        "category_id": str(ticket.category_id) if ticket.category_id else None,
        "sla_policy_id": str(ticket.sla_policy_id) if ticket.sla_policy_id else None,
        "first_response_due_at": ticket.first_response_due_at.isoformat() if ticket.first_response_due_at else None,
        "resolution_due_at": ticket.resolution_due_at.isoformat() if ticket.resolution_due_at else None,
        "sla_state": ticket.sla_state or "ok",
        "merged_into_ticket_id": str(ticket.merged_into_ticket_id) if ticket.merged_into_ticket_id else None,
        "require_tasks_done_to_close": bool(ticket.require_tasks_done_to_close),
        "ticket_number": ticket.ticket_number,
        "issue_title": ticket.issue_title,
        "issue_description": ticket.issue_description,
        "requester_id": str(ticket.requester_id) if ticket.requester_id else None,
        "requester_name": ticket.requester.full_name if ticket.requester else None,
        "requester_email": ticket.requester.email if ticket.requester else None,
        "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
        "assigned_technician_name": (
            ticket.assigned_technician.employee.full_name
            if (ticket.assigned_technician and ticket.assigned_technician.employee)
            else (ticket.assigned_technician.username if ticket.assigned_technician else None)
        ),
        "priority": ticket.priority,
        "status": ticket.status,
        "category": ticket.category,
        "catalog_item_id": str(ticket.catalog_item_id) if ticket.catalog_item_id else None,
        "catalog_item_name": ticket.catalog_item.name_ar if ticket.catalog_item else None,
        "custom_fields_data": ticket.custom_fields_data,
        "approval_status": ticket.approval_status or "None",
        "current_approval_stage": ticket.current_approval_stage,
        "approvals": approvals_data,
        "first_response_at": ticket.first_response_at.isoformat() if ticket.first_response_at else None,
        "related_asset_id": str(ticket.related_asset_id) if ticket.related_asset_id else None,
        "related_asset_name": ticket.related_asset.asset_name if ticket.related_asset else None,
        "related_asset_info": related_asset_info,
        "linked_task_id": str(linked_task.id) if linked_task else None,
        "linked_task_title": linked_task.title if linked_task else None,
        "linked_task_status": linked_task.status if linked_task else None,
        "linked_tasks": linked_tasks_data,
        "watchers": watchers_data,
        "allowed_transitions": allowed_transitions,
        "resolved_at": ticket.resolved_at,
        "closed_at": ticket.closed_at,
        "notes": ticket.notes,
        "attachments": ticket.attachments,
        "comments": comments_data,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }
    return success_response(data=data)


@router.post("/{ticket_id}/assign")
def assign_ticket_endpoint(
    ticket_id: uuid.UUID,
    payload: TicketAssignRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TICKET_ASSIGN)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assign/reassign ticket manually or re-run rule-driven auto-assignment."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إسناد هذه التذكرة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tickets/{ticket_id}/assign"
    if idem_key:
        cached = lookup_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    ip_addr = request.client.host if request.client else None
    try:
        if payload.auto_assign:
            if payload.team_id:
                validate_company_fk(db, Team, payload.team_id, ticket.company_id, "الفريق")
                ticket.team_id = payload.team_id
            decision = auto_assign_ticket(
                db=db,
                ticket=ticket,
                actor_id=current_user.id,
                force=True,
                commit=True,
                ip_address=ip_addr,
            )
            db.refresh(ticket)
            resp = success_response(
                data={
                    "ticket_id": str(ticket.id),
                    "team_id": str(ticket.team_id) if ticket.team_id else None,
                    "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
                    "status": ticket.status,
                    "strategy_used": decision.strategy_used,
                    "reason": decision.reason,
                    "matched_rule_id": str(decision.matched_rule_id) if decision.matched_rule_id else None,
                },
                message="تم تنفيذ التوزيع التلقائي للتذكرة",
            )
        else:
            manual_assign_ticket(
                db=db,
                ticket=ticket,
                team_id=payload.team_id,
                assignee_id=payload.assignee_id,
                clear_assignee=payload.clear_assignee,
                actor_id=current_user.id,
                reason=payload.reason or "manual",
                commit=True,
                ip_address=ip_addr,
            )
            resp = success_response(
                data={
                    "ticket_id": str(ticket.id),
                    "team_id": str(ticket.team_id) if ticket.team_id else None,
                    "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
                    "status": ticket.status,
                },
                message="تم إسناد التذكرة بنجاح",
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if idem_key:
        store_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.post("/{ticket_id}/transition")
def transition_ticket_endpoint(
    ticket_id: uuid.UUID,
    payload: TicketTransitionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Transition a ticket status strictly validated against WorkflowTransition matrix."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل حالة هذه التذكرة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tickets/{ticket_id}/transition"
    if idem_key:
        cached = lookup_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    _validate_and_apply_ticket_transition(
        db=db,
        ticket=ticket,
        to_status=payload.to_status,
        actor=current_user,
        comment=payload.comment,
        visibility=payload.visibility,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(ticket)

    if ticket.requester and ticket.requester.user and ticket.requester.user.id != current_user.id:
        create_notification(
            db=db,
            recipient_user_id=ticket.requester.user.id,
            company_id=ticket.company_id,
            event_type="ticket_status_changed",
            title=f"تحديث التذكرة {ticket.ticket_number}",
            message=f"تم تحديث حالة التذكرة ({ticket.issue_title}) إلى: {ticket.status}",
            related_record_type="ticket",
            related_record_id=ticket.id,
        )

    resp = success_response(
        data={
            "ticket_id": str(ticket.id),
            "status": ticket.status,
            "sla_state": ticket.sla_state,
            "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
            "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        },
        message=f"تم تحديث حالة التذكرة إلى {ticket.status}",
    )
    if idem_key:
        store_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.get("/{ticket_id}/events")
def list_ticket_events(
    ticket_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Unified chronological timeline of comments, internal notes, assignments, status/SLA/merge events."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لسجل التذكرة")

    is_staff = _is_ticket_staff(current_user, ticket.company_id, db)
    is_auditor = "Auditor" in get_effective_roles_for_granular(current_user, ticket.company_id, db)
    if not is_staff and not is_auditor and not current_user.is_superadmin:
        is_watcher = (
            db.query(TicketWatcher.id)
            .filter(TicketWatcher.ticket_id == ticket.id, TicketWatcher.user_id == current_user.id)
            .first()
            is not None
        )
        if ticket.requester_id != current_user.employee_id and not is_watcher:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض سجل هذه التذكرة")

    q = db.query(TicketEvent).filter(
        TicketEvent.ticket_id == ticket.id,
        TicketEvent.company_id == ticket.company_id,
    )
    if not is_staff and not is_auditor:
        q = q.filter(TicketEvent.visibility == "public")

    events = q.order_by(TicketEvent.created_at.asc()).all()
    data = []
    for ev in events:
        actor_name = None
        if ev.actor:
            actor_name = ev.actor.employee.full_name if ev.actor.employee else ev.actor.username
        data.append({
            "id": str(ev.id),
            "ticket_id": str(ev.ticket_id),
            "actor_id": str(ev.actor_id) if ev.actor_id else None,
            "actor_name": actor_name,
            "kind": ev.kind,
            "payload": ev.payload or {},
            "visibility": ev.visibility,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        })
    return success_response(data=data)


@router.post("/{ticket_id}/events")
def create_ticket_event(
    ticket_id: uuid.UUID,
    payload: TicketEventCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Post a public reply or internal note on a ticket, optionally expanding a Macro."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إضافة رد على هذه التذكرة")

    is_staff = _is_ticket_staff(current_user, ticket.company_id, db)
    if not is_staff and not current_user.is_superadmin:
        if ticket.requester_id != current_user.employee_id:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعليق على هذه التذكرة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tickets/{ticket_id}/events"
    if idem_key:
        cached = lookup_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    content = (payload.content or "").strip()
    visibility = payload.visibility if is_staff else "public"
    used_macro_id = None

    if payload.macro_id:
        macro = (
            db.query(Macro)
            .filter(
                Macro.id == payload.macro_id,
                Macro.company_id == ticket.company_id,
                or_(Macro.is_shared == True, Macro.created_by_id == current_user.id),
            )
            .first()
        )
        if not macro:
            raise HTTPException(status_code=404, detail="الرد الجاهز غير موجود")
        content = f"{macro.body}\n\n{content}".strip() if content else macro.body
        if is_staff and macro.visibility == "internal":
            visibility = "internal"
        used_macro_id = str(macro.id)

    if not content:
        raise HTTPException(status_code=400, detail="محتوى الرد أو الملاحظة مطلوب")

    is_internal = visibility == "internal"
    comment = TicketComment(
        ticket_id=ticket.id,
        user_id=current_user.id,
        content=content,
        is_internal=is_internal,
    )
    db.add(comment)
    db.flush()

    ev = TicketEvent(
        ticket_id=ticket.id,
        company_id=ticket.company_id,
        actor_id=current_user.id,
        kind="comment_internal" if is_internal else "comment_public",
        payload={
            "content": content,
            "legacy_comment_id": str(comment.id),
            "macro_id": used_macro_id,
            "attachments": payload.attachments or [],
        },
        visibility=visibility,
    )
    db.add(ev)

    if is_staff and not ticket.first_response_at:
        ticket.first_response_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(ev)

    resp = success_response(
        data={
            "id": str(ev.id),
            "comment_id": str(comment.id),
            "kind": ev.kind,
            "visibility": ev.visibility,
            "payload": ev.payload,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        },
        message="تم إضافة التحديث بنجاح",
    )
    if idem_key:
        store_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.post("/{ticket_id}/merge")
def merge_tickets_endpoint(
    ticket_id: uuid.UUID,
    payload: TicketMergeRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TICKET_MERGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Merge duplicate source `ticket_id` into `target_ticket_id` within the same company."""
    if ticket_id == payload.target_ticket_id:
        raise HTTPException(status_code=400, detail="لا يمكن دمج التذكرة مع نفسها")

    source = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    target = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == payload.target_ticket_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="إحدى التذكرتين غير موجودة")
    if source.company_id != target.company_id:
        raise HTTPException(status_code=403, detail="لا يمكن دمج تذكرتين من شركتين مختلفتين")
    if not current_user.is_superadmin and source.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية دمج هذه التذكرة")
    if source.merged_into_ticket_id is not None:
        raise HTTPException(status_code=409, detail="تم دمج هذه التذكرة مسبقاً")
    if target.merged_into_ticket_id is not None:
        raise HTTPException(status_code=409, detail="التذكرة الهدف مدمجة بالفعل في تذكرة أخرى")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    source.merged_into_ticket_id = target.id
    source.status = "Closed"
    source.closed_at = now
    if not source.resolved_at:
        source.resolved_at = now

    # Re-link Tasks from source to target
    moved_tasks = (
        db.query(Task)
        .filter(Task.related_ticket_id == source.id, Task.company_id == source.company_id)
        .update({"related_ticket_id": target.id})
    )

    # Copy Watchers to target without duplicates
    existing_target_watchers = {
        r[0]
        for r in db.query(TicketWatcher.user_id).filter(TicketWatcher.ticket_id == target.id).all()
    }
    for w in db.query(TicketWatcher).filter(TicketWatcher.ticket_id == source.id).all():
        if w.user_id not in existing_target_watchers:
            db.add(TicketWatcher(company_id=target.company_id, ticket_id=target.id, user_id=w.user_id))
            existing_target_watchers.add(w.user_id)

    merge_meta = {
        "source_ticket_id": str(source.id),
        "source_ticket_number": source.ticket_number,
        "target_ticket_id": str(target.id),
        "target_ticket_number": target.ticket_number,
        "moved_tasks_count": moved_tasks,
        "comment": payload.comment,
    }
    db.add(TicketEvent(ticket_id=source.id, company_id=source.company_id, actor_id=current_user.id, kind="merge", payload=merge_meta, visibility="public"))
    db.add(TicketEvent(ticket_id=target.id, company_id=target.company_id, actor_id=current_user.id, kind="merge", payload=merge_meta, visibility="public"))

    log_audit(
        db=db,
        action="MERGE_TICKET",
        resource_type="HelpDeskTicket",
        resource_id=str(source.id),
        user_id=current_user.id,
        company_id=source.company_id,
        new_values=merge_meta,
        ip_address=request.client.host if request.client else None,
        commit=False,
    )
    db.commit()

    return success_response(
        data=merge_meta,
        message=f"تم دمج التذكرة {source.ticket_number} في {target.ticket_number} بنجاح",
    )


@router.post("/{ticket_id}/tasks")
def create_linked_task_from_ticket(
    ticket_id: uuid.UUID,
    payload: TicketToTaskRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TASK_CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a linked operational Task from a Help Desk ticket with optional close-gate."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tickets/{ticket_id}/tasks"
    if idem_key:
        cached = lookup_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    if payload.team_id:
        validate_company_fk(db, Team, payload.team_id, ticket.company_id, "الفريق")
    if payload.assigned_to_id:
        validate_company_fk(db, Employee, payload.assigned_to_id, ticket.company_id, "الموظف المكلف")

    uid, eid = sync_task_assignee_fields(
        db,
        ticket.company_id,
        user_id=payload.assignee_id or (None if payload.auto_assign else ticket.assigned_technician_id),
        employee_id=payload.assigned_to_id,
    )

    task = Task(
        company_id=ticket.company_id,
        branch_id=ticket.branch_id,
        team_id=payload.team_id or ticket.team_id,
        title=(payload.title or f"مهمة من تذكرة: {ticket.issue_title}").strip(),
        description=payload.description or f"التذكرة الأصلية: {ticket.ticket_number}\n\n{ticket.issue_description}",
        assignee_id=uid,
        assigned_to_id=eid,
        assigned_by_id=current_user.id,
        requester_id=current_user.id,
        priority=payload.priority or ticket.priority,
        status="Assigned" if (uid or eid) else "To Do",
        due_date=payload.due_date,
        related_asset_id=ticket.related_asset_id,
        related_ticket_id=ticket.id,
    )
    db.add(task)
    db.flush()

    if payload.require_tasks_done_to_close is not None:
        ticket.require_tasks_done_to_close = payload.require_tasks_done_to_close

    apply_sla_to_task(db, task)

    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=ticket.company_id,
            actor_id=current_user.id,
            kind="task_linked",
            payload={"task_id": str(task.id), "task_title": task.title},
            visibility="public",
        )
    )
    log_audit(
        db=db,
        action="CREATE_LINKED_TASK",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=ticket.company_id,
        new_values={"task_id": str(task.id), "require_tasks_done_to_close": ticket.require_tasks_done_to_close},
        ip_address=request.client.host if request.client else None,
        commit=False,
    )

    if payload.auto_assign:
        auto_assign_task(db, task, actor_id=current_user.id, force=True, commit=True)
    else:
        db.commit()
    db.refresh(task)

    resp = success_response(
        data={
            "task_id": str(task.id),
            "title": task.title,
            "status": task.status,
            "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
            "require_tasks_done_to_close": bool(ticket.require_tasks_done_to_close),
        },
        message="تم إنشاء مهمة مرتبطة بالتذكرة بنجاح",
    )
    if idem_key:
        store_idempotent_response(db, ticket.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.post("/{ticket_id}/watchers")
def add_ticket_watcher(
    ticket_id: uuid.UUID,
    payload: WatcherAddRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    target_uid = payload.user_id or current_user.id
    if target_uid != current_user.id and not _is_ticket_staff(current_user, ticket.company_id, db):
        raise HTTPException(status_code=403, detail="يمكنك إضافة نفسك فقط كمتابع")

    target_user = db.query(User).filter(User.id == target_uid, User.is_deleted == False).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if not target_user.is_superadmin:
        mem = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == target_uid,
                CompanyMembership.company_id == ticket.company_id,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if not mem:
            raise HTTPException(status_code=400, detail="المستخدم المحدد غير تابع لهذه الشركة")

    existing = (
        db.query(TicketWatcher)
        .filter(TicketWatcher.ticket_id == ticket.id, TicketWatcher.user_id == target_uid)
        .first()
    )
    if not existing:
        db.add(TicketWatcher(company_id=ticket.company_id, ticket_id=ticket.id, user_id=target_uid))
        db.commit()
    return success_response(data={"ticket_id": str(ticket.id), "user_id": str(target_uid)}, message="تمت إضافة المتابع بنجاح")


@router.delete("/{ticket_id}/watchers/{user_id}")
def remove_ticket_watcher(
    ticket_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")
    if user_id != current_user.id and not _is_ticket_staff(current_user, ticket.company_id, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إزالة هذا المتابع")

    watcher = (
        db.query(TicketWatcher)
        .filter(TicketWatcher.ticket_id == ticket.id, TicketWatcher.user_id == user_id)
        .first()
    )
    if watcher:
        db.delete(watcher)
        db.commit()
    return success_response(message="تم إزالة المتابع بنجاح")


@router.post("/{ticket_id}/status")
def update_ticket_status(
    ticket_id: uuid.UUID,
    new_status: str = Query(..., pattern="^(Open|Assigned|Pending Approval|In Progress|Waiting for User|Waiting for Vendor|Resolved|Reopened|Closed|Cancelled)$"),
    technician_id: Optional[uuid.UUID] = None,
    notes: Optional[str] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Transition ticket status through IT Help Desk workflow."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")

    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل")

    old_status = ticket.status
    ticket.status = new_status

    if technician_id:
        tech_user = db.query(User).filter(User.id == technician_id, User.is_deleted == False).first()
        if not tech_user:
            raise HTTPException(status_code=400, detail="الفني المحدد غير موجود")
        if not tech_user.is_superadmin:
            tech_mem = db.query(CompanyMembership).filter(
                CompanyMembership.user_id == technician_id,
                CompanyMembership.company_id == ticket.company_id,
                CompanyMembership.status == "Active",
            ).first()
            if not tech_mem:
                raise HTTPException(status_code=400, detail="الفني المحدد غير تابع لهذه المنشأة")
        ticket.assigned_technician_id = technician_id
    elif new_status == "In Progress" and not ticket.assigned_technician_id:
        ticket.assigned_technician_id = current_user.id

    now = datetime.utcnow()

    # Reopen tracking
    if old_status in ("Resolved", "Closed") and new_status in ("Open", "In Progress", "Assigned"):
        ticket.reopened_count = (ticket.reopened_count or 0) + 1

    # SLA Clock Pause Logic (ITIL standard)
    if new_status == "Waiting for User":
        ticket.sla_paused_at = now
    elif old_status == "Waiting for User" and new_status != "Waiting for User":
        if ticket.sla_paused_at:
            paused_secs = int((now - ticket.sla_paused_at).total_seconds())
            ticket.sla_paused_total_seconds = (ticket.sla_paused_total_seconds or 0) + paused_secs
            ticket.sla_paused_at = None
            if ticket.sla_target_at:
                ticket.sla_target_at = ticket.sla_target_at + timedelta(seconds=paused_secs)

    if new_status in ("Open", "Assigned", "In Progress", "Waiting for User"):
        ticket.resolved_at = None
        ticket.closed_at = None
    elif new_status == "Resolved":
        ticket.closed_at = None
        if not ticket.resolved_at:
            ticket.resolved_at = now
    elif new_status == "Closed":
        ticket.closed_at = now
        if not ticket.resolved_at:
            ticket.resolved_at = now

    if notes:
        ticket.notes = f"{ticket.notes or ''} | [{new_status}]: {notes}".strip(" |")

    handle_ticket_sla_pause_resume(ticket, old_status, new_status, now_utc=now)
    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=ticket.company_id,
            actor_id=current_user.id,
            kind="status_change",
            payload={"from": old_status, "to": new_status, "notes": notes},
            visibility="public",
        )
    )

    db.commit()

    # Notify requester if user exists
    if ticket.requester and ticket.requester.user:
        create_notification(
            db=db,
            recipient_user_id=ticket.requester.user.id,
            company_id=ticket.company_id,
            event_type="ticket_status_changed",
            title=f"تحديث التذكرة {ticket.ticket_number}",
            message=f"تم تغيير حالة تذكرتك ({ticket.issue_title}) إلى: {new_status}",
            related_record_type="ticket",
            related_record_id=ticket.id,
        )

    log_audit(
        db=db,
        action="STATUS_CHANGE",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=ticket.company_id,
        old_values={"status": old_status},
        new_values={"status": new_status},
    )

    return success_response(message=f"تم تحديث حالة التذكرة إلى {new_status}")


@router.post("/{ticket_id}/comments")
def add_ticket_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Add comment or internal technician note."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")

    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    user_roles = get_user_roles(current_user, db, company_id=ticket.company_id)
    is_staff = any(r in ["Super Admin", "Company Admin", "IT Manager", "IT Technician"] for r in user_roles)

    # Only staff can post internal technician notes
    is_internal_val = payload.is_internal if is_staff else False

    comment = TicketComment(
        ticket_id=ticket.id,
        user_id=current_user.id,
        content=payload.content.strip(),
        is_internal=is_internal_val,
    )
    db.add(comment)
    db.flush()

    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=ticket.company_id,
            actor_id=current_user.id,
            kind="comment_internal" if is_internal_val else "comment_public",
            payload={"content": comment.content, "legacy_comment_id": str(comment.id)},
            visibility="internal" if is_internal_val else "public",
        )
    )

    # First technician response SLA milestone tracking
    if is_staff and not ticket.first_response_at:
        ticket.first_response_at = datetime.utcnow()
        db.add(ticket)

    db.commit()
    db.refresh(comment)

    return success_response(data={"id": str(comment.id)}, message="تم إضافة التعليق بنجاح")


@router.post("/{ticket_id}/convert-to-task")
def convert_ticket_to_task(
    ticket_id: uuid.UUID,
    assigned_to_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Convert Help Desk ticket to an actionable IT Task."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")

    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    if assigned_to_id:
        validate_assignee(db, ticket.company_id, assigned_to_id)

    task = Task(
        company_id=ticket.company_id,
        branch_id=ticket.branch_id,
        title=f"مهمة من تذكرة: {ticket.issue_title}",
        description=f"التذكرة الأصلية: {ticket.ticket_number}\n\nالوصف:\n{ticket.issue_description}",
        assigned_to_id=assigned_to_id or (ticket.assigned_technician.employee_id if ticket.assigned_technician else None),
        assigned_by_id=current_user.id,
        priority=ticket.priority,
        status="To Do",
        related_asset_id=ticket.related_asset_id,
        related_ticket_id=ticket.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    log_audit(
        db=db,
        action="CONVERT_TO_TASK",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=ticket.company_id,
        new_values={"task_id": str(task.id)},
    )

    return success_response(
        data={"task_id": str(task.id)},
        message=f"تم تحويل التذكرة إلى مهمة بنجاح برقم {task.title}",
    )


