"""Task Collaboration and Lifecycle State Machine Service.

Enforces:
- 9-state formal lifecycle:
  Draft, Assigned, Accepted, In Progress, Blocked, Waiting for Response,
  Submitted for Review, Rework Required, Completed, Cancelled
- Blocker tracking with mandatory blocker reason
- Separation of duties: employees submit for review, only managers/reviewers approve
- Outbox notifications for Telegram & In-App notification queues
- Audit trail logging
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.task import Task, TaskComment
from app.models.user import User, Employee
from app.core.security import get_user_roles
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.telegram_service import enqueue_task_notification


# ── Valid Status Enums ────────────────────────────────────────────────
TASK_STATUS_DRAFT = "Draft"
TASK_STATUS_ASSIGNED = "Assigned"
TASK_STATUS_ACCEPTED = "Accepted"
TASK_STATUS_IN_PROGRESS = "In Progress"
TASK_STATUS_BLOCKED = "Blocked"
TASK_STATUS_WAITING = "Waiting for Response"
TASK_STATUS_SUBMITTED = "Submitted for Review"
TASK_STATUS_REWORK = "Rework Required"
TASK_STATUS_COMPLETED = "Completed"
TASK_STATUS_CANCELLED = "Cancelled"

# Backward compatibility map
STATUS_ALIAS_MAP = {
    "To Do": TASK_STATUS_ASSIGNED,
    "Pending": TASK_STATUS_ASSIGNED,
    "On Hold": TASK_STATUS_BLOCKED,
    "Done": TASK_STATUS_COMPLETED,
    "Approved / Completed": TASK_STATUS_COMPLETED,
}

VALID_STATUSES = {
    TASK_STATUS_DRAFT,
    TASK_STATUS_ASSIGNED,
    TASK_STATUS_ACCEPTED,
    TASK_STATUS_IN_PROGRESS,
    TASK_STATUS_BLOCKED,
    TASK_STATUS_WAITING,
    TASK_STATUS_SUBMITTED,
    TASK_STATUS_REWORK,
    TASK_STATUS_COMPLETED,
    TASK_STATUS_CANCELLED,
}

# ── Allowed Transitions Matrix ────────────────────────────────────────
ALLOWED_TRANSITIONS: Dict[str, List[str]] = {
    TASK_STATUS_DRAFT: [
        TASK_STATUS_ASSIGNED,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_ASSIGNED: [
        TASK_STATUS_ACCEPTED,
        TASK_STATUS_IN_PROGRESS,
        TASK_STATUS_BLOCKED,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_ACCEPTED: [
        TASK_STATUS_IN_PROGRESS,
        TASK_STATUS_BLOCKED,
        TASK_STATUS_WAITING,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_IN_PROGRESS: [
        TASK_STATUS_BLOCKED,
        TASK_STATUS_WAITING,
        TASK_STATUS_SUBMITTED,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_BLOCKED: [
        TASK_STATUS_IN_PROGRESS,
        TASK_STATUS_WAITING,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_WAITING: [
        TASK_STATUS_IN_PROGRESS,
        TASK_STATUS_BLOCKED,
        TASK_STATUS_SUBMITTED,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_SUBMITTED: [
        TASK_STATUS_COMPLETED,
        TASK_STATUS_REWORK,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_REWORK: [
        TASK_STATUS_IN_PROGRESS,
        TASK_STATUS_BLOCKED,
        TASK_STATUS_SUBMITTED,
        TASK_STATUS_CANCELLED,
    ],
    TASK_STATUS_COMPLETED: [
        TASK_STATUS_IN_PROGRESS,  # Admin reopen only
    ],
    TASK_STATUS_CANCELLED: [
        TASK_STATUS_ASSIGNED,  # Admin reopen only
    ],
}


def normalize_status(status_str: str) -> str:
    """Normalize legacy status names to the official 9-state schema."""
    cleaned = status_str.strip()
    return STATUS_ALIAS_MAP.get(cleaned, cleaned)


def is_manager_or_admin(user: User, db: Session, company_id: uuid.UUID) -> bool:
    """Check if user has management permissions (Super Admin, Company Admin, IT Manager)."""
    if user.is_superadmin:
        return True
    roles = get_user_roles(user, db, company_id)
    return any(r in ["Super Admin", "Company Admin", "IT Manager"] for r in roles)


def is_task_assignee(task: Task, user: User) -> bool:
    """Check if the given user is the assigned employee on the task."""
    if not task.assigned_to_id or not user.employee_id:
        return False
    return str(task.assigned_to_id) == str(user.employee_id)


def assert_task_access(task: Task, user: User, active_company_id: uuid.UUID) -> None:
    """Ensure multi-company data isolation."""
    if not user.is_superadmin and task.company_id != active_company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية الوصول إلى هذه المهمة ضمن الشركة النشطة",
        )


def validate_transition(task: Task, target_status: str, user: User, db: Session) -> str:
    """Validate that moving from task.status to target_status is permissible."""
    curr = normalize_status(task.status)
    target = normalize_status(target_status)

    if target not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"حالة المهمة غير صالحة: {target_status}",
        )

    if curr == target:
        return target

    allowed = ALLOWED_TRANSITIONS.get(curr, [])
    # Also support transitions from legacy aliased states
    if curr in STATUS_ALIAS_MAP:
        allowed = ALLOWED_TRANSITIONS.get(STATUS_ALIAS_MAP[curr], allowed)

    # Super Admin can force transitions if needed for recovery, except completing unsubmitted tasks directly without approval
    if target not in allowed and not user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"الانتقال غير مسموح من '{curr}' إلى '{target}'. الحالات المتاحة: {', '.join(allowed)}",
        )

    return target


# ── Action Implementations ────────────────────────────────────────────

def accept_task(task: Task, user: User, db: Session) -> Task:
    """Assignee formally accepts the task."""
    is_mgr = is_manager_or_admin(user, db, task.company_id)
    is_assignee = is_task_assignee(task, user)

    if not (is_assignee or is_mgr):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط الموظف المسندة إليه المهمة أو مدير النظام يمكنه قبول المهمة",
        )

    validate_transition(task, TASK_STATUS_ACCEPTED, user, db)

    task.status = TASK_STATUS_ACCEPTED
    task.accepted_at = datetime.utcnow()
    db.commit()

    # Notify assigner
    if task.assigned_by_id and str(task.assigned_by_id) != str(user.id):
        create_notification(
            db=db,
            recipient_user_id=task.assigned_by_id,
            company_id=task.company_id,
            event_type="task_accepted",
            title="تم قبول المهمة",
            message=f"قام الموظف بقبول المهمة: {task.title}",
            related_record_type="task",
            related_record_id=task.id,
        )

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.accepted")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_ACCEPT",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=user.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_ACCEPTED, "accepted_at": str(task.accepted_at)},
    )
    return task


def start_task(task: Task, user: User, db: Session) -> Task:
    """Start working on the task (moves to In Progress)."""
    is_mgr = is_manager_or_admin(user, db, task.company_id)
    is_assignee = is_task_assignee(task, user)

    if not (is_assignee or is_mgr):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط الموظف المسندة إليه المهمة أو المسؤول يمكنه بدء العمل على المهمة",
        )

    validate_transition(task, TASK_STATUS_IN_PROGRESS, user, db)

    task.status = TASK_STATUS_IN_PROGRESS
    if not task.start_date:
        task.start_date = datetime.utcnow().date()
    db.commit()

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.started")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_START",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=user.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_IN_PROGRESS},
    )
    return task


def block_task(task: Task, blocker_reason: str, user: User, db: Session) -> Task:
    """Pause task with an explicit blocker reason."""
    reason = (blocker_reason or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يجب توضيح سبب وجود المعوق أو الإيقاف المؤقت",
        )

    validate_transition(task, TASK_STATUS_BLOCKED, user, db)

    task.status = TASK_STATUS_BLOCKED
    task.is_blocked = True
    task.blocker_reason = reason
    task.blocked_at = datetime.utcnow()
    db.commit()

    # Post an internal comment about the blocker
    comment = TaskComment(
        task_id=task.id,
        user_id=user.id,
        content=f"⚠️ تم تعليق المهمة لوجود معوّق: {reason}",
    )
    db.add(comment)
    db.commit()

    # Notify assigner / managers
    if task.assigned_by_id and str(task.assigned_by_id) != str(user.id):
        create_notification(
            db=db,
            recipient_user_id=task.assigned_by_id,
            company_id=task.company_id,
            event_type="task_blocked",
            title="تعليق مهمة لوجود معوق",
            message=f"المهمة '{task.title}' تم تعليقها: {reason}",
            related_record_type="task",
            related_record_id=task.id,
        )

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.blocked", custom_message=f"⚠️ المهمة معلقة: {reason}")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_BLOCK",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=user.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_BLOCKED, "blocker_reason": reason},
    )
    return task


def unblock_task(task: Task, user: User, db: Session) -> Task:
    """Remove blocker and resume task into In Progress."""
    validate_transition(task, TASK_STATUS_IN_PROGRESS, user, db)

    old_reason = task.blocker_reason
    task.status = TASK_STATUS_IN_PROGRESS
    task.is_blocked = False
    task.unblocked_at = datetime.utcnow()
    db.commit()

    comment = TaskComment(
        task_id=task.id,
        user_id=user.id,
        content=f"✅ تم حل المعوّق واستئناف العمل على المهمة (المعوق السابق: {old_reason or 'غير محدد'})",
    )
    db.add(comment)
    db.commit()

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.started", custom_message="✅ تم استئناف العمل على المهمة بعد إزالة المعوق")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_UNBLOCK",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=user.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_IN_PROGRESS, "is_blocked": False},
    )
    return task


def submit_for_review(task: Task, notes: Optional[str], user: User, db: Session) -> Task:
    """Employee submits task for review and managerial approval."""
    is_mgr = is_manager_or_admin(user, db, task.company_id)
    is_assignee = is_task_assignee(task, user)

    if not (is_assignee or is_mgr):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط الموظف المسندة إليه المهمة أو المسؤول يمكنه رفعها للمراجعة",
        )

    validate_transition(task, TASK_STATUS_SUBMITTED, user, db)

    task.status = TASK_STATUS_SUBMITTED
    task.submitted_for_review_at = datetime.utcnow()
    if notes:
        task.notes = f"{task.notes}\n[ملاحظة التسليم]: {notes}" if task.notes else f"[ملاحظة التسليم]: {notes}"
    db.commit()

    if notes:
        comment = TaskComment(
            task_id=task.id,
            user_id=user.id,
            content=f"📋 تم رفع المهمة للمراجعة والاعتماد. ملاحظات الإنجاز: {notes}",
        )
        db.add(comment)
        db.commit()

    # Notify assigner / managers for review
    if task.assigned_by_id:
        create_notification(
            db=db,
            recipient_user_id=task.assigned_by_id,
            company_id=task.company_id,
            event_type="task_submitted_review",
            title="مهمة جاهزة للمراجعة والاعتماد",
            message=f"تم إنجاز المهمة '{task.title}' ورفعها للمراجعة",
            related_record_type="task",
            related_record_id=task.id,
        )

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.submitted", custom_message=f"📋 تم رفع المهمة للمراجعة: {task.title}")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_SUBMIT_REVIEW",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=user.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_SUBMITTED, "submitted_for_review_at": str(task.submitted_for_review_at)},
    )
    return task


def approve_task(task: Task, review_notes: Optional[str], reviewer: User, db: Session) -> Task:
    """Manager approves and officially marks the task as Completed.
    Separation of duties: An assignee cannot approve their own submission unless they are a Super Admin or Manager.
    """
    is_mgr = is_manager_or_admin(reviewer, db, task.company_id)
    if not is_mgr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="اعتماد وإتمام المهمة يتطلب صلاحية إدارية (مدير النظام أو مدير تقنية المعلومات)",
        )

    validate_transition(task, TASK_STATUS_COMPLETED, reviewer, db)

    task.status = TASK_STATUS_COMPLETED
    task.completed_at = datetime.utcnow()
    task.reviewer_id = reviewer.id
    task.review_notes = review_notes
    db.commit()

    comment_text = "🎉 تم اعتماد المهمة واكتمالها بنجاح بواسطة المسؤول"
    if review_notes:
        comment_text += f"\nملاحظات الاعتماد: {review_notes}"
    comment = TaskComment(
        task_id=task.id,
        user_id=reviewer.id,
        content=comment_text,
    )
    db.add(comment)
    db.commit()

    # Notify assignee of formal approval
    if task.assigned_to and task.assigned_to.user:
        create_notification(
            db=db,
            recipient_user_id=task.assigned_to.user.id,
            company_id=task.company_id,
            event_type="task_approved",
            title="تم اعتماد مهمتك واكتمالها",
            message=f"تم اعتماد المهمة '{task.title}' بنجاح",
            related_record_type="task",
            related_record_id=task.id,
        )

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.completed")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_APPROVE",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=reviewer.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_COMPLETED, "reviewer_id": str(reviewer.id), "completed_at": str(task.completed_at)},
    )
    return task


def rework_task(task: Task, rework_notes: str, reviewer: User, db: Session) -> Task:
    """Reviewer rejects submission and sends task back with required rework instructions."""
    is_mgr = is_manager_or_admin(reviewer, db, task.company_id)
    if not is_mgr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="طلب التعديل وإعادة العمل يتطلب صلاحية إدارية (مدير النظام أو مدير تقنية المعلومات)",
        )

    notes = (rework_notes or "").strip()
    if not notes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يجب تدوين الملاحظات والتعديلات المطلوبة لإعادة العمل على المهمة",
        )

    validate_transition(task, TASK_STATUS_REWORK, reviewer, db)

    task.status = TASK_STATUS_REWORK
    task.reviewer_id = reviewer.id
    task.review_notes = notes
    task.rework_count = (task.rework_count or 0) + 1
    db.commit()

    comment = TaskComment(
        task_id=task.id,
        user_id=reviewer.id,
        content=f"🔄 مطلوب تعديلات إضافية على المهمة (جولة التعديل #{task.rework_count}):\n{notes}",
    )
    db.add(comment)
    db.commit()

    # Notify assignee of required rework
    if task.assigned_to and task.assigned_to.user:
        create_notification(
            db=db,
            recipient_user_id=task.assigned_to.user.id,
            company_id=task.company_id,
            event_type="task_rework_requested",
            title="مطلوب تعديلات على المهمة",
            message=f"أعاد المسؤول المهمة '{task.title}' لطلب تعديلات: {notes}",
            related_record_type="task",
            related_record_id=task.id,
        )

    try:
        enqueue_task_notification(db=db, task=task, event_type="task.reassigned", custom_message=f"🔄 مطلوب تعديلات على المهمة: {notes}")
        db.commit()
    except Exception:
        pass

    log_audit(
        db=db,
        action="TASK_REWORK",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=reviewer.id,
        company_id=task.company_id,
        new_values={"status": TASK_STATUS_REWORK, "rework_count": task.rework_count, "review_notes": notes},
    )
    return task
