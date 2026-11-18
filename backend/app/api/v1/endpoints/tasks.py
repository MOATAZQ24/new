import uuid
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Branch
from app.models.enterprise import Project
from app.models.task import Task, TaskComment
from app.models.ticket import HelpDeskTicket
from app.models.user import User, Employee
from app.models.asset import TechnicalAsset
from app.models.telegram import TelegramUserLink, NotificationOutbox
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskCommentCreate,
    TaskBlockRequest,
    TaskSubmitReviewRequest,
    TaskReviewRequest,
)
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.telegram_service import enqueue_task_notification
from app.services import task_service
from app.services.task_assignment import search_assignees, validate_assignee, eligible_expression
from app.services import task_workflow as wf
from sqlalchemy import func, and_

router = APIRouter(prefix="/tasks", tags=["Task Management"])


@router.get('/assignees')
def list_task_assignees(
    search: str = Query('', max_length=160),
    selected_id: Optional[uuid.UUID] = None,
    limit: int = Query(15, ge=1, le=30),
    current_user: User = Depends(require_role(['Super Admin', 'Company Admin', 'IT Manager', 'IT Technician'])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    employees = search_assignees(db, active_cid, search, selected_id, limit)
    ids = [employee.id for employee in employees]
    links = {link.employee_id: link for link in db.query(TelegramUserLink).filter(
        TelegramUserLink.company_id == active_cid, TelegramUserLink.employee_id.in_(ids)).all()} if ids else {}
    from app.services.task_assignment import employee_query
    eligible_ids = {emp.id for emp in employee_query(db, active_cid).filter(
        Employee.id.in_(ids), eligible_expression(active_cid)).all()} if ids else set()
    return success_response(data=[{
        'id': str(emp.id), 'full_name': emp.full_name, 'employee_number': emp.employee_number,
        'department_name': emp.department.department_name if emp.department else None,
        'job_title': emp.job_title, 'employment_status': emp.employment_status,
        'account_status': emp.user.account_status if emp.user else emp.employment_status,
        'assignable': emp.id in eligible_ids,
        'is_telegram_linked': bool(links.get(emp.id) and links[emp.id].is_verified),
        'telegram_username': links[emp.id].telegram_username if emp.id in links and links[emp.id].is_verified else None,
        'telegram_notifications_enabled': bool(emp.id in links and links[emp.id].is_verified and links[emp.id].notifications_enabled),
    } for emp in employees])


def _filtered_task_query(
    db: Session, current_user: User, target_cid, *, branch_id=None, project_id=None, assigned_to_id=None, filter_mode=None,
    priority=None, search=None, created_by_id=None, due_from=None, due_to=None,
):
    """Single definition of the tenant-scoped task filters, shared by the list and the KPI summary."""
    query = db.query(Task).filter(Task.company_id == target_cid)
    if filter_mode == "my" and current_user.employee_id:
        query = query.filter(Task.assigned_to_id == current_user.employee_id)
    elif assigned_to_id:
        query = query.filter(Task.assigned_to_id == assigned_to_id)
    if branch_id:
        query = query.filter(Task.branch_id == branch_id)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if priority and priority.strip():
        query = query.filter(Task.priority == priority.strip())
    if created_by_id:
        query = query.filter(Task.assigned_by_id == created_by_id)
    if due_from:
        query = query.filter(Task.due_date >= due_from)
    if due_to:
        query = query.filter(Task.due_date <= due_to)
    cond = wf.search_condition(db, search) if search else None
    if cond is not None:
        query = query.filter(cond)
    return query


@router.get("")
def list_tasks(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    assigned_to_id: Optional[uuid.UUID] = None,
    created_by_id: Optional[uuid.UUID] = None,
    filter_mode: Optional[str] = Query(None, pattern="^(my|team|all)$"),
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    overdue: Optional[bool] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = Query(None, max_length=160),
    sort_by: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """status accepts a stage key (new, in_progress, waiting, completed, rejected, cancelled, active, overdue)
    or an exact stored status. Overdue is derived from due_date and is independent of the stored status."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    query = _filtered_task_query(
        db, current_user, target_cid, branch_id=branch_id, project_id=project_id, assigned_to_id=assigned_to_id, filter_mode=filter_mode,
        priority=priority, search=search, created_by_id=created_by_id, due_from=due_from, due_to=due_to)
    if status_filter and status_filter.strip():
        query = query.filter(wf.status_condition(status_filter))
    if overdue is True:
        query = query.filter(wf.stage_condition("overdue"))
    elif overdue is False:
        query = query.filter(~wf.stage_condition("overdue"))

    total = query.count()
    sort_key = sort_by.strip().lower() if isinstance(sort_by, str) and sort_by.strip() else "created_desc"
    if sort_key == "due_asc":
        order_clauses = (Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.desc(), Task.id)
    elif sort_key == "due_desc":
        order_clauses = (Task.due_date.is_(None), Task.due_date.desc(), Task.created_at.desc(), Task.id)
    elif sort_key == "updated_desc":
        order_clauses = (Task.updated_at.desc(), Task.created_at.desc(), Task.id)
    else:
        order_clauses = (Task.created_at.desc(), Task.due_date.is_(None), Task.due_date.asc(), Task.id)

    items = (
        query.order_by(*order_clauses)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    today = date.today()
    data = []
    for t in items:
        assignee_name = t.assigned_to.full_name if t.assigned_to else None
        assigner_name = t.assigned_by.username if t.assigned_by else None
        reviewer_name = t.reviewer.username if t.reviewer else None
        asset_name = t.related_asset.asset_name if t.related_asset else None
        stage = wf.stage_of(t.status)
        data.append({
            "id": str(t.id),
            "reference": wf.task_ref(t),
            "company_id": str(t.company_id),
            "branch_id": str(t.branch_id) if t.branch_id else None,
            "title": t.title,
            "description": t.description,
            "assigned_to_id": str(t.assigned_to_id) if t.assigned_to_id else None,
            "assigned_to_name": assignee_name,
            "assigned_by_id": str(t.assigned_by_id) if t.assigned_by_id else None,
            "assigned_by_name": assigner_name,
            "reviewer_id": str(t.reviewer_id) if t.reviewer_id else None,
            "reviewer_name": reviewer_name,
            "priority": t.priority,
            "status": t.status,
            "stage": stage,
            "stage_label": wf.STAGE_LABELS_AR.get(stage, t.status),
            "start_date": t.start_date,
            "due_date": t.due_date,
            "acknowledged_at": t.acknowledged_at,
            "is_acknowledged": bool(t.acknowledged_at),
            "accepted_at": t.accepted_at,
            "submitted_for_review_at": t.submitted_for_review_at,
            "completed_at": t.completed_at,
            "is_blocked": bool(t.is_blocked),
            "blocker_reason": t.blocker_reason,
            "blocked_at": t.blocked_at,
            "unblocked_at": t.unblocked_at,
            "review_notes": t.review_notes,
            "rework_count": t.rework_count or 0,
            "related_asset_id": str(t.related_asset_id) if t.related_asset_id else None,
            "related_asset_name": asset_name,
            "related_ticket_id": str(t.related_ticket_id) if t.related_ticket_id else None,
            "project_id": str(t.project_id) if t.project_id else None,
            "notes": t.notes,
            "is_overdue": wf.is_overdue(t, today),
            "comments_count": len(t.comments),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.get("/summary")
def task_summary(
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    assigned_to_id: Optional[uuid.UUID] = None,
    created_by_id: Optional[uuid.UUID] = None,
    filter_mode: Optional[str] = Query(None, pattern="^(my|team|all)$"),
    priority: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=160),
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """KPI counters computed from the database with the SAME filters as the list (status/stage excluded),
    plus a change token the dashboard polls to refresh when Telegram or another user changed a task."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    base = _filtered_task_query(
        db, current_user, target_cid, branch_id=branch_id, assigned_to_id=assigned_to_id, filter_mode=filter_mode,
        priority=priority, search=search, created_by_id=created_by_id, due_from=due_from, due_to=due_to)
    ids = base.with_entities(Task.id).scalar_subquery()
    counts = {
        stage: db.query(func.count(Task.id)).filter(Task.id.in_(ids), wf.stage_condition(stage)).scalar() or 0
        for stage in [*wf.STAGE_STATUSES, "active", "overdue"]
    }
    total = base.count()
    last = db.query(func.max(Task.updated_at)).filter(Task.id.in_(ids)).scalar()
    return success_response(data={
        "total": total, **counts,
        "version": f"{total}:{last.isoformat() if last else ''}",
        "unknown_status": total - sum(counts[k] for k in wf.STAGE_STATUSES),
    })


@router.post("")
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    if payload.assigned_to_id:
        validate_assignee(db, target_cid, payload.assigned_to_id)
    validate_company_fk(db, Branch, payload.branch_id, target_cid, "الفرع")
    validate_company_fk(db, TechnicalAsset, payload.related_asset_id, target_cid, "الأصل المرتبط")
    validate_company_fk(db, HelpDeskTicket, payload.related_ticket_id, target_cid, "التذكرة المرتبطة")
    validate_company_fk(db, Project, payload.project_id, target_cid, "المشروع")

    # Double-submit guard: identical task from the same creator within 20 seconds returns the existing record.
    recent = db.query(Task).filter(
        Task.company_id == target_cid, Task.assigned_by_id == current_user.id, Task.title == payload.title.strip(),
        Task.assigned_to_id == payload.assigned_to_id, Task.created_at >= datetime.utcnow() - timedelta(seconds=20),
    ).first()
    if recent:
        return success_response(data={"id": str(recent.id), "delivery_status": None, "duplicate": True},
                                message="تم إنشاء هذه المهمة للتو")

    task = Task(
        company_id=target_cid,
        branch_id=payload.branch_id,
        title=payload.title.strip(),
        description=payload.description,
        assigned_to_id=payload.assigned_to_id,
        assigned_by_id=current_user.id,
        priority=payload.priority,
        status=payload.status,
        start_date=payload.start_date,
        due_date=payload.due_date,
        related_asset_id=payload.related_asset_id,
        related_ticket_id=payload.related_ticket_id,
        project_id=payload.project_id,
        notes=payload.notes,
        attachments=payload.attachments,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Notify assignee if employee has user account
    delivery_info = None
    if payload.assigned_to_id:
        emp = db.query(Employee).filter(Employee.id == payload.assigned_to_id).first()
        if emp and emp.user:
            create_notification(
                db=db,
                recipient_user_id=emp.user.id,
                company_id=target_cid,
                event_type="task_assigned",
                title="تم إسناد مهمة جديدة إليك",
                message=f"المهمة: {task.title} (الأولوية: {task.priority})",
                related_record_type="task",
                related_record_id=task.id,
            )

        # Enqueue in Telegram Transactional Outbox (non-blocking)
        if getattr(payload, "notify_telegram", True):
            try:
                outbox_entry = enqueue_task_notification(db=db, task=task, event_type="task.assigned",
                                                          dedupe_key=f"{task.id}:{payload.assigned_to_id}")
                db.commit()
                if outbox_entry:
                    try:
                        from app.services.telegram_service import dispatch_outbox_notifications
                        dispatch_outbox_notifications(db=db, limit=5, outbox_id=outbox_entry.id)
                        db.refresh(outbox_entry)
                    except Exception:
                        pass
                    delivery_info = {
                        "outbox_id": str(outbox_entry.id),
                        "status": outbox_entry.status,
                        "recipient_chat_id": outbox_entry.recipient_chat_id,
                        "scheduled_at": str(outbox_entry.scheduled_at),
                        "sent_at": str(outbox_entry.sent_at) if outbox_entry.sent_at else None,
                        "last_error": outbox_entry.last_error,
                    }
            except Exception:
                pass

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"title": task.title, "priority": task.priority},
    )

    return success_response(
        data={
            "id": str(task.id),
            "project_id": str(task.project_id) if task.project_id else None,
            "delivery_status": delivery_info,
        },
        message="تم إنشاء المهمة بنجاح"
    )


@router.get("/{task_id}")
def get_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")

    comments = (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task.id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )
    comments_data = [
        {
            "id": str(c.id),
            "user_id": str(c.user_id),
            "user_name": c.user.username if c.user else "مستخدم",
            "content": c.content,
            "created_at": c.created_at,
        }
        for c in comments
    ]

    today = date.today()
    stage = wf.stage_of(task.status)
    is_overdue = wf.is_overdue(task, today)

    # Telegram linking & notification delivery tracking
    tlink = None
    if task.assigned_to_id:
        tlink = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == task.assigned_to_id).first()

    matched_outbox = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.company_id == task.company_id,
            NotificationOutbox.idempotency_key.like(f"%:{task.id}:%"),
        )
        .order_by(NotificationOutbox.created_at.desc())
        .first()
    )

    telegram_info = {
        "is_employee_linked": bool(tlink and tlink.is_verified),
        "telegram_username": tlink.telegram_username if (tlink and tlink.is_verified) else None,
        "notifications_enabled": bool(tlink.notifications_enabled) if (tlink and tlink.is_verified) else False,
        "delivery_status": matched_outbox.status if matched_outbox else ("Not Enqueued" if not (tlink and tlink.is_verified) else "Pending"),
        "sent_at": matched_outbox.sent_at if matched_outbox else None,
        "last_error": matched_outbox.last_error if matched_outbox else None,
        "retry_count": matched_outbox.retry_count if matched_outbox else 0,
        "max_retries": matched_outbox.max_retries if matched_outbox else 3,
        "outbox_id": str(matched_outbox.id) if matched_outbox else None,
    }

    data = {
        "id": str(task.id),
        "reference": wf.task_ref(task),
        "company_id": str(task.company_id),
        "branch_id": str(task.branch_id) if task.branch_id else None,
        "title": task.title,
        "description": task.description,
        "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
        "assigned_to_name": task.assigned_to.full_name if task.assigned_to else None,
        "assigned_by_id": str(task.assigned_by_id) if task.assigned_by_id else None,
        "assigned_by_name": task.assigned_by.username if task.assigned_by else None,
        "reviewer_id": str(task.reviewer_id) if task.reviewer_id else None,
        "reviewer_name": task.reviewer.username if task.reviewer else None,
        "priority": task.priority,
        "status": task.status,
        "stage": stage,
        "stage_label": wf.STAGE_LABELS_AR.get(stage, task.status),
        "start_date": task.start_date,
        "due_date": task.due_date,
        "acknowledged_at": task.acknowledged_at,
        "is_acknowledged": bool(task.acknowledged_at),
        "accepted_at": task.accepted_at,
        "submitted_for_review_at": task.submitted_for_review_at,
        "completed_at": task.completed_at,
        "is_blocked": bool(task.is_blocked),
        "blocker_reason": task.blocker_reason,
        "blocked_at": task.blocked_at,
        "unblocked_at": task.unblocked_at,
        "review_notes": task.review_notes,
        "rework_count": task.rework_count or 0,
        "related_asset_id": str(task.related_asset_id) if task.related_asset_id else None,
        "related_asset_name": task.related_asset.asset_name if task.related_asset else None,
        "related_ticket_id": str(task.related_ticket_id) if task.related_ticket_id else None,
        "notes": task.notes,
        "attachments": task.attachments,
        "is_overdue": is_overdue,
        "comments": comments_data,
        "telegram_info": telegram_info,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }
    return success_response(data=data)


@router.get("/{task_id}/telegram-status")
def get_task_telegram_status(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve live Telegram delivery and employee acknowledgement status for a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")

    tlink = None
    if task.assigned_to_id:
        tlink = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == task.assigned_to_id).first()

    matched_outbox = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.company_id == task.company_id,
            NotificationOutbox.idempotency_key.like(f"%:{task.id}:%"),
        )
        .order_by(NotificationOutbox.created_at.desc())
        .first()
    )

    info = {
        "task_id": str(task.id),
        "task_title": task.title,
        "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
        "assigned_to_name": task.assigned_to.full_name if task.assigned_to else None,
        "is_employee_linked": bool(tlink and tlink.is_verified),
        "telegram_username": tlink.telegram_username if (tlink and tlink.is_verified) else None,
        "notifications_enabled": bool(tlink.notifications_enabled) if (tlink and tlink.is_verified) else False,
        "acknowledged_at": task.acknowledged_at,
        "is_acknowledged": bool(task.acknowledged_at),
        "delivery_status": matched_outbox.status if matched_outbox else ("Not Enqueued" if not (tlink and tlink.is_verified) else "Pending"),
        "sent_at": matched_outbox.sent_at if matched_outbox else None,
        "last_error": matched_outbox.last_error if matched_outbox else None,
        "retry_count": matched_outbox.retry_count if matched_outbox else 0,
        "max_retries": matched_outbox.max_retries if matched_outbox else 3,
        "outbox_id": str(matched_outbox.id) if matched_outbox else None,
    }
    return success_response(data=info)


@router.post("/{task_id}/resend-telegram")
def resend_task_telegram(
    task_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Manually re-enqueue and dispatch Telegram notification for a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")

    if not task.assigned_to_id:
        raise HTTPException(status_code=400, detail="المهمة غير مسندة إلى أي موظف")

    tlink = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == task.assigned_to_id).first()
    if not tlink or not tlink.is_verified:
        raise HTTPException(status_code=400, detail="الموظف غير مرتبط بحساب تيليجرام مؤكد")

    outbox_entry = enqueue_task_notification(db=db, task=task, event_type="task.assigned")
    db.commit()

    dispatch_result = None
    try:
        from app.services.telegram_service import dispatch_outbox_notifications
        dispatch_result = dispatch_outbox_notifications(
            db=db, limit=5, outbox_id=outbox_entry.id if outbox_entry else None
        )
    except Exception as e:
        dispatch_result = {"error": str(e)}

    if outbox_entry:
        db.refresh(outbox_entry)

    log_audit(
        db=db,
        action="RESEND_NOTIFICATION",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=current_user.id,
        company_id=task.company_id,
        new_values={"channel": "telegram", "outbox_id": str(outbox_entry.id) if outbox_entry else None},
    )

    return success_response(
        data={
            "task_id": str(task.id),
            "outbox_id": str(outbox_entry.id) if outbox_entry else None,
            "status": outbox_entry.status if outbox_entry else "Failed",
            "sent_at": outbox_entry.sent_at if outbox_entry else None,
            "last_error": outbox_entry.last_error if outbox_entry else None,
            "dispatch_summary": dispatch_result,
        },
        message="تمت إعادة إرسال إشعار المهمة عبر تيليجرام بنجاح"
    )


@router.put("/{task_id}")
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذه المهمة")

    user_roles = get_user_roles(current_user, db, company_id=task.company_id)
    is_mgr = any(r in ["Super Admin", "Company Admin", "IT Manager"] for r in user_roles)
    is_assignee = bool(current_user.employee_id and task.assigned_to_id == current_user.employee_id)

    if not is_mgr and not is_assignee:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذه المهمة")

    # Separation of duties: Assignee cannot self-approve or mark task completed directly
    if not is_mgr and payload.status in ["Completed", "Approved"]:
        raise HTTPException(
            status_code=403,
            detail="لا يمكن اعتماد أو إكمال المهمة ذاتياً. يرجى تقديمها للمراجعة والاعتماد من قبل المدير.",
        )

    # Only managers can reassign tasks
    if 'assigned_to_id' in payload.model_fields_set and payload.assigned_to_id != task.assigned_to_id and not is_mgr:
        raise HTTPException(
            status_code=403,
            detail="إعادة إسناد المهام تتطلب صلاحية مدير.",
        )

    old_assigned_id = task.assigned_to_id
    old_status = task.status

    if 'assigned_to_id' in payload.model_fields_set and payload.assigned_to_id is not None:
        validate_assignee(db, task.company_id, payload.assigned_to_id)
    if 'branch_id' in payload.model_fields_set and payload.branch_id is not None:
        validate_company_fk(db, Branch, payload.branch_id, task.company_id, "الفرع")
    if 'project_id' in payload.model_fields_set and payload.project_id is not None:
        validate_company_fk(db, Project, payload.project_id, task.company_id, "المشروع")
    if 'related_asset_id' in payload.model_fields_set and payload.related_asset_id is not None:
        validate_company_fk(db, TechnicalAsset, payload.related_asset_id, task.company_id, "الأصل المرتبط")
    if 'related_ticket_id' in payload.model_fields_set and payload.related_ticket_id is not None:
        validate_company_fk(db, HelpDeskTicket, payload.related_ticket_id, task.company_id, "التذكرة المرتبطة")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if 'branch_id' in payload.model_fields_set:
        task.branch_id = payload.branch_id
    if 'project_id' in payload.model_fields_set:
        task.project_id = payload.project_id
    if 'related_asset_id' in payload.model_fields_set:
        task.related_asset_id = payload.related_asset_id
    if 'related_ticket_id' in payload.model_fields_set:
        task.related_ticket_id = payload.related_ticket_id
    if 'assigned_to_id' in payload.model_fields_set:
        task.assigned_to_id = payload.assigned_to_id
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.status is not None and payload.status != task.status:
        task.status = payload.status
        if payload.status == "Completed" and not task.completed_at:
            task.completed_at = datetime.utcnow()
    elif 'assigned_to_id' in payload.model_fields_set and payload.assigned_to_id not in (None, old_assigned_id) \
            and wf.stage_of(task.status) in ("rejected", "cancelled"):
        task.status, task.blocker_reason = "Assigned", None  # re-assigning a rejected task reopens it
    if payload.start_date is not None:
        task.start_date = payload.start_date
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.notes is not None:
        task.notes = payload.notes

    db.commit()

    # Enqueue Telegram Outbox events based on transitions
    try:
        if payload.assigned_to_id is not None and payload.assigned_to_id != old_assigned_id:
            enqueue_task_notification(db=db, task=task, event_type="task.reassigned",
                                      dedupe_key=f"{task.id}:{task.assigned_to_id}:{task.updated_at}")
        elif task.status != old_status:
            if task.status == "In Progress":
                enqueue_task_notification(db=db, task=task, event_type="task.started")
            elif task.status == "Completed":
                enqueue_task_notification(db=db, task=task, event_type="task.completed")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=current_user.id,
        company_id=task.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث المهمة بنجاح")


@router.post("/{task_id}/comments")
def add_task_comment(
    task_id: uuid.UUID,
    payload: TaskCommentCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")

    comment = TaskComment(
        task_id=task.id,
        user_id=current_user.id,
        content=payload.content.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return success_response(data={"id": str(comment.id)}, message="تم إضافة التعليق بنجاح")


@router.delete("/{task_id}")
def delete_task(
    task_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    db.delete(task)
    db.commit()
    return success_response(message="تم حذف المهمة بنجاح")


# ── Task Collaboration & 9-State Lifecycle Actions ────────────────────

@router.post("/{task_id}/accept")
def accept_task_endpoint(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assignee accepts the task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.accept_task(task=task, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم قبول المهمة بنجاح")


@router.post("/{task_id}/start")
def start_task_endpoint(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Start working on the task (moves status to In Progress)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.start_task(task=task, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم بدء العمل على المهمة")


@router.post("/{task_id}/block")
def block_task_endpoint(
    task_id: uuid.UUID,
    payload: TaskBlockRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Mark task as Blocked with an explicit blocker reason."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.block_task(task=task, blocker_reason=payload.reason, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "blocker_reason": updated.blocker_reason}, message="تم تسجيل تعليق المهمة لوجود معوق")


@router.post("/{task_id}/unblock")
def unblock_task_endpoint(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Resolve blocker and resume task into In Progress."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.unblock_task(task=task, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم إزالة المعوق واستئناف المهمة")


@router.post("/{task_id}/submit-review")
def submit_for_review_endpoint(
    task_id: uuid.UUID,
    payload: TaskSubmitReviewRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Employee submits task for review and managerial approval."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.submit_for_review(task=task, notes=payload.notes, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم رفع المهمة للمراجعة بنجاح")


@router.post("/{task_id}/approve")
def approve_task_endpoint(
    task_id: uuid.UUID,
    payload: TaskReviewRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Manager approves and officially completes the task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.approve_task(task=task, review_notes=payload.review_notes, reviewer=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم اعتماد المهمة وإكمالها بنجاح")


@router.post("/{task_id}/rework")
def rework_task_endpoint(
    task_id: uuid.UUID,
    payload: TaskReviewRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Reviewer returns task with rework instructions."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    updated = task_service.rework_task(task=task, rework_notes=payload.review_notes or "", reviewer=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "rework_count": updated.rework_count}, message="تم طلب تعديلات إضافية على المهمة")


@router.post("/{task_id}/reject")
def reject_task_endpoint(
    task_id: uuid.UUID,
    payload: Optional[TaskBlockRequest] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assignee or manager rejects the task with a reason."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)
    reason = payload.reason if payload else "اعتذار الفني عن استلام المهمة"
    updated = task_service.reject_task(task=task, reason=reason, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status}, message="تم تسجيل رفض المهمة بنجاح")




# ── Shared workflow actions (same service as Telegram) ───────────────────
class _ReasonBody(__import__("pydantic").BaseModel):
    reason: Optional[str] = None


def _workflow_endpoint(action: str):
    def endpoint(
        task_id: uuid.UUID,
        body: _ReasonBody = _ReasonBody(),
        current_user: User = Depends(get_current_user),
        active_cid: uuid.UUID = Depends(get_user_company_id),
        db: Session = Depends(get_db),
    ):
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        actor = wf.Actor(
            user_id=current_user.id, employee_id=current_user.employee_id, name=current_user.username,
            company_id=active_cid, privileged=task_service.is_manager_or_admin(current_user, db, task.company_id),
            superadmin=bool(current_user.is_superadmin), source="dashboard")
        try:
            outcome = wf.transition(db, task, actor, action, body.reason)
        except wf.WorkflowError as exc:
            raise HTTPException(status_code=exc.http_status, detail=exc.message)
        return success_response(data={"id": str(task.id), "status": task.status, "stage": wf.stage_of(task.status),
                                      "changed": outcome.changed}, message=outcome.message)
    endpoint.__name__ = f"workflow_{action}"
    return endpoint


for _action in ("complete", "clarify", "reopen", "cancel"):
    router.add_api_route(f"/{{task_id}}/{_action}", _workflow_endpoint(_action), methods=["POST"])
