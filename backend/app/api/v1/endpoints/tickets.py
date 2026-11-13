import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles
from app.core.response import success_response, paginate
from app.models.ticket import HelpDeskTicket, TicketComment
from app.models.task import Task
from app.models.user import User, Employee
from app.models.asset import TechnicalAsset
from app.schemas.ticket import TicketCreate, TicketUpdate, TicketCommentCreate
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services import gemini_service

router = APIRouter(prefix="/tickets", tags=["IT Help Desk"])


def generate_ticket_number(company_id: uuid.UUID, db: Session) -> str:
    """Generate sequential ticket number per company, e.g. TCK-2026-0001."""
    year = datetime.utcnow().year
    count = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == company_id).count()
    return f"TCK-{year}-{(count + 1):04d}"


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
    target_cid = company_id or active_cid
    query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)

    # If simple employee role, only show their submitted tickets
    user_roles = get_user_roles(current_user, db)
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
        query.order_by(HelpDeskTicket.created_at.desc())
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
    target_cid = payload.company_id or active_cid
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

    user_roles = get_user_roles(current_user, db)
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
        ticket.assigned_technician_id = technician_id
    elif new_status == "In Progress" and not ticket.assigned_technician_id:
        ticket.assigned_technician_id = current_user.id

    now = datetime.utcnow()
    if new_status == "Resolved" and not ticket.resolved_at:
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

    user_roles = get_user_roles(current_user, db)
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


@router.post("/{ticket_id}/ai-assist")
def ai_assist_ticket(
    ticket_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Generate intelligent recommendations, summary, and diagnostic steps for a ticket."""
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    if not current_user.is_superadmin and ticket.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه التذكرة")

    analysis = gemini_service.analyze_ticket_ai(
        title=ticket.issue_title,
        description=ticket.issue_description,
        current_category=ticket.category,
        current_priority=ticket.priority,
    )
    return success_response(data=analysis)

