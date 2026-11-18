import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Company, Branch
from app.models.ticket import HelpDeskTicket, TicketComment
from app.models.task import Task
from app.models.user import User, Employee, CompanyMembership
from app.models.asset import TechnicalAsset
from app.schemas.ticket import TicketCreate, TicketUpdate, TicketCommentCreate
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.task_assignment import validate_assignee

router = APIRouter(prefix="/tickets", tags=["IT Help Desk"])


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

    # If simple employee role, only show their submitted tickets
    user_roles = get_user_roles(current_user, db, company_id=target_cid)
    if "Employee" in user_roles and len(user_roles) == 1 and not current_user.is_superadmin:
        if current_user.employee_id:
            query = query.filter(HelpDeskTicket.requester_id == current_user.employee_id)

    if branch_id:
        query = query.filter(HelpDeskTicket.branch_id == branch_id)
    if category:
        query = query.filter(HelpDeskTicket.category == category)
    if priority:
        query = query.filter(HelpDeskTicket.priority == priority)
    if status_filter:
        query = query.filter(HelpDeskTicket.status == status_filter)
    if assigned_technician_id:
        query = query.filter(HelpDeskTicket.assigned_technician_id == assigned_technician_id)
    if requester_id:
        query = query.filter(HelpDeskTicket.requester_id == requester_id)
    if search:
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

    pagination = paginate(total=total, page=page, per_page=per_page)
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

    ticket = HelpDeskTicket(
        company_id=target_cid,
        branch_id=payload.branch_id,
        ticket_number=t_number,
        issue_title=payload.issue_title.strip(),
        issue_description=payload.issue_description.strip(),
        requester_id=requester_id,
        priority=payload.priority,
        status="Open",
        category=payload.category,
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


