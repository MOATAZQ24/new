import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response, paginate
from app.models.task import Task, TaskComment
from app.models.user import User, Employee
from app.models.asset import TechnicalAsset
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

router = APIRouter(prefix="/tasks", tags=["Task Management"])


@router.get("")
def list_tasks(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    assigned_to_id: Optional[uuid.UUID] = None,
    filter_mode: Optional[str] = Query(None, pattern="^(my|team|all)$"),  # my tasks vs team tasks
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = company_id or active_cid
    query = db.query(Task).filter(Task.company_id == target_cid)

    if filter_mode and isinstance(filter_mode, str) and filter_mode == "my" and current_user.employee_id:
        query = query.filter(Task.assigned_to_id == current_user.employee_id)
    elif assigned_to_id:
        query = query.filter(Task.assigned_to_id == assigned_to_id)

    if branch_id:
        query = query.filter(Task.branch_id == branch_id)
    if priority and isinstance(priority, str) and priority.strip():
        query = query.filter(Task.priority == priority.strip())
    if status_filter and isinstance(status_filter, str) and status_filter.strip():
        query = query.filter(Task.status == status_filter.strip())
    if search and isinstance(search, str) and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter((Task.title.ilike(s)) | (Task.description.ilike(s)))

    total = query.count()
    items = (
        query.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
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
        c_count = len(t.comments)

        is_overdue = False
        if t.due_date and t.status not in ["Completed", "Cancelled"]:
            is_overdue = t.due_date < today

        data.append({
            "id": str(t.id),
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
            "start_date": t.start_date,
            "due_date": t.due_date,
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
            "notes": t.notes,
            "is_overdue": is_overdue,
            "comments_count": c_count,
            "created_at": t.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    target_cid = payload.company_id or active_cid

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
        notes=payload.notes,
        attachments=payload.attachments,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Notify assignee if employee has user account
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
        try:
            enqueue_task_notification(db=db, task=task, event_type="task.assigned")
            db.commit()
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

    return success_response(data={"id": str(task.id)}, message="تم إنشاء المهمة بنجاح")


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
    is_overdue = bool(task.due_date and task.status not in ["Completed", "Cancelled"] and task.due_date < today)

    data = {
        "id": str(task.id),
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
        "start_date": task.start_date,
        "due_date": task.due_date,
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
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }
    return success_response(data=data)


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

    old_assigned_id = task.assigned_to_id
    old_status = task.status

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.assigned_to_id is not None:
        task.assigned_to_id = payload.assigned_to_id
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.status is not None:
        task.status = payload.status
        if payload.status == "Completed" and not task.completed_at:
            task.completed_at = datetime.utcnow()
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
            enqueue_task_notification(db=db, task=task, event_type="task.reassigned")
        elif payload.status is not None and payload.status != old_status:
            if payload.status == "In Progress":
                enqueue_task_notification(db=db, task=task, event_type="task.started")
            elif payload.status == "Completed":
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

