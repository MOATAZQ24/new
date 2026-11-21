import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Company, Branch
from app.models.ticket import HelpDeskTicket, TicketComment, ProblemRecord, KnowledgeArticle
from app.models.task import Task
from app.models.user import User, Employee, CompanyMembership
from app.models.asset import TechnicalAsset
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
)
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.task_assignment import validate_assignee

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


@router.get("")
def list_tickets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_technician_id: Optional[uuid.UUID] = None,
    requester_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
    page_val = page if isinstance(page, int) else 1
    per_page_val = per_page if isinstance(per_page, int) else 20

    # If simple employee role, only show their submitted tickets
    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    if "Employee" in user_roles and len(user_roles) == 1 and not current_user.is_superadmin:
        if current_user.employee_id:
            query = query.filter(HelpDeskTicket.requester_id == current_user.employee_id)

    if branch_id:
        query = query.filter(HelpDeskTicket.branch_id == branch_id)
    if category:
        query = query.filter(HelpDeskTicket.category == category)
    if priority and isinstance(priority, str):
        query = query.filter(HelpDeskTicket.priority == priority)
    if status_filter and isinstance(status_filter, str):
        query = query.filter(HelpDeskTicket.status == status_filter)
    if assigned_technician_id and isinstance(assigned_technician_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.assigned_technician_id == assigned_technician_id)
    if requester_id and isinstance(requester_id, uuid.UUID):
        query = query.filter(HelpDeskTicket.requester_id == requester_id)
    if search and isinstance(search, str):
        s = f"%{search}%"
        query = query.filter(
            (HelpDeskTicket.ticket_number.ilike(s))
            | (HelpDeskTicket.issue_title.ilike(s))
            | (HelpDeskTicket.issue_description.ilike(s))
        )

    total = query.count()
    items = (
        query.options(
            joinedload(HelpDeskTicket.requester),
            joinedload(HelpDeskTicket.assigned_technician),
            joinedload(HelpDeskTicket.related_asset),
            selectinload(HelpDeskTicket.comments),
        )
        .order_by(HelpDeskTicket.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for t in items:
        req_name = t.requester.full_name if t.requester else None
        tech_name = t.assigned_technician.username if t.assigned_technician else None
        asset_name = t.related_asset.asset_name if t.related_asset else None

        data.append({
            "id": str(t.id),
            "company_id": str(t.company_id),
            "branch_id": str(t.branch_id) if t.branch_id else None,
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
            "related_asset_id": str(t.related_asset_id) if t.related_asset_id else None,
            "related_asset_name": asset_name,
            "resolved_at": t.resolved_at,
            "closed_at": t.closed_at,
            "comments_count": len(t.comments),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        })

    pagination = paginate(total=total, page=page_val, per_page=per_page_val)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    validate_company_fk(db, Branch, payload.branch_id, target_cid, "الفرع")
    validate_company_fk(db, Employee, payload.requester_id, target_cid, "مقدم الطلب")
    validate_company_fk(db, TechnicalAsset, payload.related_asset_id, target_cid, "الأصل المرتبط")
    t_number = generate_ticket_number(target_cid, db)

    # Resolve requester
    requester_id = payload.requester_id or current_user.employee_id

    # Calculate SLA Target
    sla_mins = TICKET_SLA_MINUTES.get(payload.priority, 4320)
    sla_target = datetime.utcnow() + timedelta(minutes=sla_mins)

    # ITIL Deterministic Routing
    assigned_tech_id = route_ticket_deterministically(target_cid, payload.branch_id, db)
    initial_status = "Assigned" if assigned_tech_id else "Open"

    ticket = HelpDeskTicket(
        company_id=target_cid,
        branch_id=payload.branch_id,
        ticket_number=t_number,
        issue_title=payload.issue_title.strip(),
        issue_description=payload.issue_description.strip(),
        requester_id=requester_id,
        assigned_technician_id=assigned_tech_id,
        priority=payload.priority,
        status=initial_status,
        category=payload.category,
        ticket_type=payload.ticket_type or "Incident",
        tier=payload.tier or "L1",
        sla_target_at=sla_target,
        sla_status="Within_SLA",
        voice_note_url=payload.voice_note_url,
        problem_id=payload.problem_id,
        related_asset_id=payload.related_asset_id,
        notes=payload.notes,
        attachments=payload.attachments,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"ticket_number": ticket.ticket_number, "title": ticket.issue_title},
    )

    return success_response(
        data={"id": str(ticket.id), "ticket_number": ticket.ticket_number},
        message=f"تم إنشاء التذكرة رقم {ticket.ticket_number} بنجاح",
    )


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

    linked_task = db.query(Task).filter(Task.related_ticket_id == ticket.id).first()

    data = {
        "id": str(ticket.id),
        "company_id": str(ticket.company_id),
        "branch_id": str(ticket.branch_id) if ticket.branch_id else None,
        "ticket_number": ticket.ticket_number,
        "issue_title": ticket.issue_title,
        "issue_description": ticket.issue_description,
        "requester_id": str(ticket.requester_id) if ticket.requester_id else None,
        "requester_name": ticket.requester.full_name if ticket.requester else None,
        "requester_email": ticket.requester.email if ticket.requester else None,
        "assigned_technician_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
        "assigned_technician_name": ticket.assigned_technician.username if ticket.assigned_technician else None,
        "priority": ticket.priority,
        "status": ticket.status,
        "category": ticket.category,
        "related_asset_id": str(ticket.related_asset_id) if ticket.related_asset_id else None,
        "related_asset_name": ticket.related_asset.asset_name if ticket.related_asset else None,
        "linked_task_id": str(linked_task.id) if linked_task else None,
        "linked_task_title": linked_task.title if linked_task else None,
        "linked_task_status": linked_task.status if linked_task else None,
        "resolved_at": ticket.resolved_at,
        "closed_at": ticket.closed_at,
        "notes": ticket.notes,
        "attachments": ticket.attachments,
        "comments": comments_data,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }
    return success_response(data=data)


@router.post("/{ticket_id}/status")
def update_ticket_status(
    ticket_id: uuid.UUID,
    new_status: str = Query(..., pattern="^(Open|Assigned|In Progress|Waiting for User|Resolved|Closed|Cancelled)$"),
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


# ── Multimedia & Voice Notes ─────────────────────────────────────────────

@router.post("/voice/upload")
async def upload_ticket_voice_note(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a voice note recording for Help Desk ticket submission."""
    filename = f"ticket_voice_{uuid.uuid4().hex[:12]}.webm"
    file_path = os.path.join(VOICE_TICKET_DIR, filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    url = f"/api/v1/tickets/voice/{filename}"
    return success_response(data={"voice_note_url": url, "filename": filename}, message="تم رفع التسجيل الصوتي بنجاح")


@router.get("/voice/{filename}")
def get_ticket_voice_file(filename: str):
    """Serve recorded ticket voice note."""
    file_path = os.path.join(VOICE_TICKET_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="الملف الصوتي غير موجود")
    return FileResponse(file_path, media_type="audio/webm")


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



