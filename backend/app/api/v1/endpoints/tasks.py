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
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.rbac import (
    GranularPermission,
    has_granular_permission,
    require_granular_permission,
)
from app.core.security import get_current_user, get_user_company_id, require_role, get_user_roles, resolve_company_scope, validate_company_fk
from app.core.response import success_response, paginate
from app.models.company import Branch
from app.models.enterprise import Project
from app.models.task import Task, TaskComment, TaskParticipant
from app.models.ticket import HelpDeskTicket, SlaPolicy
from app.models.user import CompanyMembership, User, Employee
from app.models.asset import TechnicalAsset
from app.models.telegram import TelegramUserLink, NotificationOutbox
from app.models.work_management import (
    TaskChecklistItem,
    TaskWatcher,
    Team,
    WorkflowTransition,
)
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskCommentCreate,
    TaskBlockRequest,
    TaskSubmitReviewRequest,
    TaskReviewRequest,
    TaskBroadcastCreate,
    TaskParticipantResponse,
)
from app.schemas.work_management import (
    TaskAssignRequest,
    TaskBulkRequest,
    TaskChecklistCreate,
    TaskChecklistUpdate,
    TaskTransitionRequest,
    WatcherAddRequest,
)
from app.services.assignment import (
    auto_assign_task,
    manual_assign_task,
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
from app.services.sla_service import apply_sla_to_task
from app.services.telegram_service import enqueue_task_notification
from app.services import task_service
from app.services.task_assignment import search_assignees, validate_assignee, eligible_expression
from app.services import task_workflow as wf
from app.services.work_management_defaults import ensure_workflow_transitions
from sqlalchemy import func, and_, or_

router = APIRouter(prefix="/tasks", tags=["Task Management"])

VOICE_UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "voice_tasks"))
os.makedirs(VOICE_UPLOAD_DIR, exist_ok=True)

ATTACHMENT_UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "task_attachments"))
os.makedirs(ATTACHMENT_UPLOAD_DIR, exist_ok=True)

ALLOWED_ATTACHMENT_EXTS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".zip": "application/zip",
}


def _merge_task_attachments(existing: Any, incoming: Any) -> list:
    base: list = list(existing) if isinstance(existing, list) else []
    if not incoming:
        return base
    items = incoming if isinstance(incoming, list) else [incoming]
    seen_urls = {
        (x.get("url") if isinstance(x, dict) else str(x))
        for x in base
        if x
    }
    for item in items:
        if not item:
            continue
        url = item.get("url") if isinstance(item, dict) else str(item)
        if url not in seen_urls:
            base.append(item)
            seen_urls.add(url)
    return base


@router.post("/attachment-upload")
async def upload_task_attachment(
    file: UploadFile = File(...),
    stage: Optional[str] = Form(None),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
):
    """Secure file and image upload for tasks and workflow stage transitions."""
    content = await file.read()
    max_bytes = 15 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="حجم الملف المرفق يتجاوز الحد المسموح به (15 ميجابايت)."
        )
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف المرفوع فارغ."
        )

    orig_name = os.path.basename(file.filename or "attachment")
    _, ext = os.path.splitext(orig_name.lower())
    content_type = (file.content_type or "").lower()

    if ext not in ALLOWED_ATTACHMENT_EXTS:
        if "png" in content_type:
            ext = ".png"
        elif "jpeg" in content_type or "jpg" in content_type:
            ext = ".jpg"
        elif "webp" in content_type:
            ext = ".webp"
        elif "gif" in content_type:
            ext = ".gif"
        elif "pdf" in content_type:
            ext = ".pdf"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="نوع الملف غير مدعوم. الأنواع المسموحة: الصور (PNG, JPG, WEBP, GIF) والمستندات (PDF, Word, Excel, CSV, TXT, ZIP)."
            )

    file_id = f"att_{uuid.uuid4().hex}{ext}"
    company_folder = os.path.join(ATTACHMENT_UPLOAD_DIR, str(active_cid))
    os.makedirs(company_folder, exist_ok=True)

    dest_path = os.path.join(company_folder, file_id)
    with open(dest_path, "wb") as f:
        f.write(content)

    size_kb = max(1, round(len(content) / 1024))
    size_label = f"{round(size_kb / 1024, 1)} MB" if size_kb >= 1024 else f"{size_kb} KB"
    is_image = ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}

    return success_response(
        data={
            "name": orig_name,
            "filename": file_id,
            "url": f"/api/v1/tasks/attachments/{file_id}",
            "size": size_label,
            "size_bytes": len(content),
            "content_type": ALLOWED_ATTACHMENT_EXTS.get(ext, "application/octet-stream"),
            "is_image": is_image,
            "stage": stage,
            "uploaded_by": current_user.username,
            "uploaded_at": datetime.utcnow().isoformat(),
        },
        message="تم إرفاق الملف بنجاح"
    )


@router.get("/attachments/{filename}")
def get_task_attachment(
    filename: str,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
):
    """Serve an uploaded task attachment or image with company-level isolation."""
    clean_filename = os.path.basename(filename)
    if not re.match(r"^att_[a-fA-F0-9]+\.[a-z0-9]+$", clean_filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="اسم المرفق غير صالح")

    target_path = os.path.join(ATTACHMENT_UPLOAD_DIR, str(active_cid), clean_filename)
    found = os.path.isfile(target_path)

    if not found and current_user.is_superadmin and os.path.exists(ATTACHMENT_UPLOAD_DIR):
        for cid_dir in os.listdir(ATTACHMENT_UPLOAD_DIR):
            cand = os.path.join(ATTACHMENT_UPLOAD_DIR, cid_dir, clean_filename)
            if os.path.isfile(cand):
                target_path = cand
                found = True
                break

    if not found or not os.path.isfile(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الملف المرفق غير موجود")

    _, ext = os.path.splitext(clean_filename.lower())
    media_type = ALLOWED_ATTACHMENT_EXTS.get(ext, "application/octet-stream")
    return FileResponse(target_path, media_type=media_type)


@router.post("/voice-upload")
async def upload_task_voice_note(
    file: UploadFile = File(...),
    duration: int = Form(0),
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
):
    """Secure audio upload for native voice tasks.
    Enforces <= 10MB file size, duration <= 300 seconds, and tenant company isolation.
    """
    if duration > 300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الحد الأقصى لمدّة الرسالة الصوتية هو 5 دقائق (300 ثانية)."
        )

    content = await file.read()
    max_bytes = 10 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="حجم الملف الصوتي يتجاوز الحد المسموح به (10 ميجابايت)."
        )
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف الصوتي المرفوع فارغ."
        )

    content_type = file.content_type or "audio/webm"
    ext = ".webm"
    if "mp4" in content_type or "m4a" in content_type:
        ext = ".m4a"
    elif "ogg" in content_type:
        ext = ".ogg"
    elif "wav" in content_type:
        ext = ".wav"
    elif "mp3" in content_type or "mpeg" in content_type:
        ext = ".mp3"

    file_id = f"voice_{uuid.uuid4().hex}{ext}"
    company_folder = os.path.join(VOICE_UPLOAD_DIR, str(active_cid))
    os.makedirs(company_folder, exist_ok=True)

    dest_path = os.path.join(company_folder, file_id)
    with open(dest_path, "wb") as f:
        f.write(content)

    return success_response(
        data={
            "voice_note_url": f"/api/v1/tasks/voice/{file_id}",
            "filename": file_id,
            "duration": duration,
            "size_bytes": len(content),
            "content_type": content_type,
        },
        message="تم رفع التسجيل الصوتي بنجاح"
    )


@router.get("/voice/{filename}")
def get_task_voice_note(
    filename: str,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Stream an authenticated voice note with company-level RBAC and byte-range support.
    Accepts standard Bearer authorization header or session token query param for HTML5 audio tags.
    """
    clean_filename = os.path.basename(filename)
    if not re.match(r"^voice_[a-fA-F0-9]+\.(webm|ogg|m4a|mp4|wav|mp3)$", clean_filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="اسم الملف الصوتي غير صالح")

    target_path = os.path.join(VOICE_UPLOAD_DIR, str(active_cid), clean_filename)
    found = os.path.isfile(target_path)

    # If not found directly and user is superadmin, search across company directories
    if not found and current_user.is_superadmin:
        if os.path.exists(VOICE_UPLOAD_DIR):
            for cid_dir in os.listdir(VOICE_UPLOAD_DIR):
                cand = os.path.join(VOICE_UPLOAD_DIR, cid_dir, clean_filename)
                if os.path.isfile(cand):
                    target_path = cand
                    found = True
                    break

    # If still not found, check if a Task with company_id == active_cid references this filename
    if not found:
        task = db.query(Task).filter(
            Task.company_id == active_cid,
            Task.voice_note_url.like(f"%{clean_filename}%")
        ).first()
        if task:
            cand = os.path.join(VOICE_UPLOAD_DIR, str(task.company_id), clean_filename)
            if os.path.isfile(cand):
                target_path = cand
                found = True

    if not found or not os.path.isfile(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="التسجيل الصوتي غير موجود")

    # Double check tenant security: ensure target_path is within allowed company folder (or superadmin)
    if not current_user.is_superadmin:
        company_folder = os.path.abspath(os.path.join(VOICE_UPLOAD_DIR, str(active_cid)))
        if not os.path.abspath(target_path).startswith(company_folder):
            task = db.query(Task).filter(Task.voice_note_url.like(f"%{clean_filename}%")).first()
            if not task or task.company_id != active_cid:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ليس لديك صلاحية الوصول لهذا التسجيل الصوتي")

    media_type = "audio/webm"
    if clean_filename.endswith(".m4a") or clean_filename.endswith(".mp4"):
        media_type = "audio/mp4"
    elif clean_filename.endswith(".ogg"):
        media_type = "audio/ogg"
    elif clean_filename.endswith(".wav"):
        media_type = "audio/wav"
    elif clean_filename.endswith(".mp3"):
        media_type = "audio/mpeg"

    return FileResponse(
        target_path,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600"
        }
    )


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
    team_id: Optional[uuid.UUID] = None,
    assigned_to_id: Optional[uuid.UUID] = None,
    assignee_id: Optional[str] = None,  # supports "me", "unassigned", or UUID
    created_by_id: Optional[uuid.UUID] = None,
    parent_task_id: Optional[uuid.UUID] = None,
    related_ticket_id: Optional[uuid.UUID] = None,
    filter_mode: Optional[str] = Query(None, pattern="^(my|team|all)$"),
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    sla_state: Optional[str] = Query(None, pattern="^(ok|at_risk|breached|paused)$"),
    overdue: Optional[bool] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = Query(None, max_length=160),
    q: Optional[str] = Query(None, max_length=160),
    cursor: Optional[str] = None,
    sort_by: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """status accepts a stage key (new, in_progress, waiting, completed, rejected, cancelled, active, overdue)
    or an exact stored status. Overdue is derived from due_date and is independent of the stored status."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    effective_search = q if (isinstance(q, str) and q.strip()) else search
    query = _filtered_task_query(
        db, current_user, target_cid, branch_id=branch_id, project_id=project_id, assigned_to_id=assigned_to_id, filter_mode=filter_mode,
        priority=priority, search=effective_search, created_by_id=created_by_id, due_from=due_from, due_to=due_to)
    if team_id and isinstance(team_id, uuid.UUID):
        query = query.filter(Task.team_id == team_id)
    if parent_task_id and isinstance(parent_task_id, uuid.UUID):
        query = query.filter(Task.parent_task_id == parent_task_id)
    if related_ticket_id and isinstance(related_ticket_id, uuid.UUID):
        query = query.filter(Task.related_ticket_id == related_ticket_id)
    if sla_state and isinstance(sla_state, str):
        query = query.filter(Task.sla_state == sla_state)
    if assignee_id and isinstance(assignee_id, str):
        val = assignee_id.strip().lower()
        if val == "me":
            if current_user.employee_id:
                query = query.filter(or_(Task.assignee_id == current_user.id, Task.assigned_to_id == current_user.employee_id))
            else:
                query = query.filter(Task.assignee_id == current_user.id)
        elif val == "unassigned":
            query = query.filter(Task.assignee_id.is_(None), Task.assigned_to_id.is_(None))
        else:
            try:
                auid = uuid.UUID(assignee_id.strip())
                query = query.filter(Task.assignee_id == auid)
            except ValueError:
                raise HTTPException(status_code=400, detail="معرف المكلف غير صالح")
    if status_filter and status_filter.strip():
        query = query.filter(wf.status_condition(status_filter))
    if overdue is True:
        query = query.filter(wf.stage_condition("overdue"))
    elif overdue is False:
        query = query.filter(~wf.stage_condition("overdue"))

    total = query.count()
    sort_key = sort_by.strip().lower() if isinstance(sort_by, str) and sort_by.strip() else "created_desc"
    if cursor and isinstance(cursor, str) and sort_key == "created_desc":
        c_ts, c_id = decode_cursor(cursor)
        if c_ts is not None:
            query = query.filter(
                or_(Task.created_at < c_ts, and_(Task.created_at == c_ts, Task.id < c_id))
            )

    if sort_key == "due_asc":
        order_clauses = (Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.desc(), Task.id)
    elif sort_key == "due_desc":
        order_clauses = (Task.due_date.is_(None), Task.due_date.desc(), Task.created_at.desc(), Task.id)
    elif sort_key == "updated_desc":
        order_clauses = (Task.updated_at.desc(), Task.created_at.desc(), Task.id)
    else:
        order_clauses = (Task.created_at.desc(), Task.id.desc())

    items_q = (
        query.options(
            joinedload(Task.assigned_to),
            joinedload(Task.assignee_user),
            joinedload(Task.assigned_by),
            joinedload(Task.reviewer),
            joinedload(Task.related_asset),
            joinedload(Task.team),
            selectinload(Task.comments),
            selectinload(Task.checklist_items),
            selectinload(Task.subtasks),
        )
        .order_by(*order_clauses)
    )
    if cursor and isinstance(cursor, str) and sort_key == "created_desc":
        fetched = items_q.limit(per_page + 1).all()
    else:
        fetched = items_q.offset((page - 1) * per_page).limit(per_page + 1).all()
    has_more = len(fetched) > per_page
    items = fetched[:per_page]
    next_cursor = encode_cursor(items[-1].created_at, items[-1].id) if (has_more and items) else None

    today = date.today()
    data = []
    for t in items:
        assignee_name = t.assigned_to.full_name if t.assigned_to else (
            t.assignee_user.employee.full_name if (t.assignee_user and t.assignee_user.employee) else (
                t.assignee_user.username if t.assignee_user else None
            )
        )
        assigner_name = t.assigned_by.username if t.assigned_by else None
        reviewer_name = t.reviewer.username if t.reviewer else None
        asset_name = t.related_asset.asset_name if t.related_asset else None
        stage = wf.stage_of(t.status)
        chk_items = t.checklist_items or []
        data.append({
            "id": str(t.id),
            "reference": wf.task_ref(t),
            "company_id": str(t.company_id),
            "branch_id": str(t.branch_id) if t.branch_id else None,
            "team_id": str(t.team_id) if t.team_id else None,
            "team_name": t.team.name if t.team else None,
            "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
            "title": t.title,
            "description": t.description,
            "assigned_to_id": str(t.assigned_to_id) if t.assigned_to_id else None,
            "assigned_to_name": assignee_name,
            "assignee_id": str(t.assignee_id) if t.assignee_id else None,
            "assigned_by_id": str(t.assigned_by_id) if t.assigned_by_id else None,
            "assigned_by_name": assigner_name,
            "reviewer_id": str(t.reviewer_id) if t.reviewer_id else None,
            "reviewer_name": reviewer_name,
            "priority": t.priority,
            "status": t.status,
            "stage": stage,
            "stage_label": wf.STAGE_LABELS_AR.get(stage, t.status),
            "sla_state": t.sla_state or "ok",
            "resolution_due_at": t.resolution_due_at.isoformat() if t.resolution_due_at else None,
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
            "related_ticket_number": t.related_ticket.ticket_number if t.related_ticket else None,
            "project_id": str(t.project_id) if t.project_id else None,
            "notes": t.notes,
            "is_voice_task": bool(t.is_voice_task),
            "voice_note_url": t.voice_note_url,
            "voice_note_duration": t.voice_note_duration,
            "is_overdue": wf.is_overdue(t, today),
            "comments_count": len(t.comments),
            "checklist_total": len(chk_items),
            "checklist_completed": sum(1 for ci in chk_items if ci.is_completed),
            "subtasks_count": len(t.subtasks or []),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page, next_cursor=next_cursor)
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


DEFAULT_TARGET_DURATIONS = {
    "Critical": 60,      # 1 hour
    "Urgent": 240,       # 4 hours
    "High": 1440,        # 24 hours (1 business day)
    "Medium": 4320,      # 3 days
    "Low": 10080,        # 7 days
}

def resolve_task_deadline(priority: str, deadline_type: str = "duration", duration_minutes: Optional[int] = None, explicit_deadline: Optional[datetime] = None) -> datetime:
    if deadline_type == "fixed_datetime" and explicit_deadline:
        return explicit_deadline
    minutes = duration_minutes or DEFAULT_TARGET_DURATIONS.get(priority, 4320)
    return datetime.utcnow() + timedelta(minutes=minutes)


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

    is_voice = bool(payload.is_voice_task or payload.voice_note_url)
    clean_title = (payload.title or "").strip()
    if not clean_title or clean_title == "مهمة جديدة":
        if is_voice:
            clean_title = f"مهمة صوتية ({payload.voice_note_duration or 0} ثانية)"
        else:
            clean_title = "مهمة تشغيلية"

    # Double-submit guard: identical task from the same creator within 20 seconds returns the existing record.
    recent = db.query(Task).filter(
        Task.company_id == target_cid, Task.assigned_by_id == current_user.id, Task.title == clean_title,
        Task.assigned_to_id == payload.assigned_to_id, Task.created_at >= datetime.utcnow() - timedelta(seconds=20),
    ).first()
    if recent:
        return success_response(data={"id": str(recent.id), "delivery_status": None, "duplicate": True},
                                message="تم إنشاء هذه المهمة للتو")

    target_dur = payload.target_duration_minutes or DEFAULT_TARGET_DURATIONS.get(payload.priority, 4320)
    calc_deadline = payload.deadline_at or resolve_task_deadline(payload.priority, payload.deadline_type or "duration", target_dur, payload.deadline_at)

    if getattr(payload, "team_id", None):
        validate_company_fk(db, Team, payload.team_id, target_cid, "الفريق")
    if getattr(payload, "parent_task_id", None):
        validate_company_fk(db, Task, payload.parent_task_id, target_cid, "المهمة الرئيسية")
    if getattr(payload, "sla_policy_id", None):
        validate_company_fk(db, SlaPolicy, payload.sla_policy_id, target_cid, "سياسة SLA")

    synced_uid, synced_eid = sync_task_assignee_fields(
        db,
        target_cid,
        user_id=getattr(payload, "assignee_id", None),
        employee_id=payload.assigned_to_id,
    )

    task = Task(
        company_id=target_cid,
        branch_id=payload.branch_id,
        team_id=getattr(payload, "team_id", None),
        parent_task_id=getattr(payload, "parent_task_id", None),
        sla_policy_id=getattr(payload, "sla_policy_id", None),
        title=clean_title,
        description=payload.description,
        assigned_to_id=synced_eid,
        assignee_id=synced_uid,
        assigned_by_id=current_user.id,
        requester_id=current_user.id,
        priority=payload.priority,
        status=payload.status,
        start_date=payload.start_date or date.today(),
        due_date=payload.due_date or calc_deadline.date(),
        deadline_type=payload.deadline_type or "duration",
        target_duration_minutes=target_dur,
        deadline_at=calc_deadline,
        is_broadcast=bool(payload.is_broadcast),
        broadcast_mode=payload.broadcast_mode,
        is_accountable=payload.is_accountable if payload.is_accountable is not None else True,
        related_asset_id=payload.related_asset_id,
        related_ticket_id=payload.related_ticket_id,
        project_id=payload.project_id,
        notes=payload.notes,
        attachments=payload.attachments,
        is_voice_task=is_voice,
        voice_note_url=payload.voice_note_url,
        voice_note_duration=payload.voice_note_duration or 0,
    )
    db.add(task)
    db.flush()
    apply_sla_to_task(db, task, explicit_policy_id=getattr(payload, "sla_policy_id", None))
    if getattr(payload, "auto_assign", False) and not (synced_uid or synced_eid):
        auto_assign_task(db, task, actor_id=current_user.id, force=True, commit=True)
    else:
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


def _validate_and_apply_task_transition(
    db: Session,
    task: Task,
    to_status: str,
    actor: User,
    comment: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Task:
    """Validate task transition via WorkflowTransition matrix and enforce comment / permission rules."""
    ensure_workflow_transitions(db, task.company_id, entity_type="task")
    old_status = task.status
    target_status = to_status.strip()
    if old_status == target_status:
        return task

    edge = (
        db.query(WorkflowTransition)
        .filter(
            WorkflowTransition.company_id == task.company_id,
            WorkflowTransition.entity_type == "task",
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
                WorkflowTransition.company_id == task.company_id,
                WorkflowTransition.entity_type == "task",
                WorkflowTransition.from_status == old_status,
                WorkflowTransition.is_active == True,
            )
            .all()
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_WORKFLOW_TRANSITION",
                "message_en": f"Task transition from '{old_status}' to '{target_status}' is not allowed.",
                "message_ar": f"لا يمكن نقل حالة المهمة من ({old_status}) إلى ({target_status}).",
                "from_status": old_status,
                "to_status": target_status,
                "allowed_next": [r[0] for r in allowed_rows],
            },
        )

    req_perm = edge.required_permission or GranularPermission.TASK_TRANSITION
    if not has_granular_permission(actor, req_perm, task.company_id, db):
        raise HTTPException(status_code=403, detail=f"ليس لديك صلاحية ({req_perm}) لنقل حالة المهمة")

    if edge.requires_comment and (not comment or not comment.strip()):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "TRANSITION_COMMENT_REQUIRED",
                "message_en": f"A comment is required to transition to '{target_status}'.",
                "message_ar": f"يجب إدخال سبب أو ملاحظة عند الانتقال إلى حالة ({target_status}).",
            },
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    task.status = target_status
    if target_status == "Accepted" and not task.accepted_at:
        task.accepted_at = now
        task.acknowledged_at = task.acknowledged_at or now
    elif target_status == "Blocked":
        task.is_blocked = True
        task.blocked_at = now
        if comment and comment.strip():
            task.blocker_reason = comment.strip()
    elif old_status == "Blocked" and target_status != "Blocked":
        task.is_blocked = False
        task.unblocked_at = now
    elif target_status == "Submitted for Review":
        task.submitted_for_review_at = now
    elif target_status == "Completed":
        task.completed_at = now
        task.is_blocked = False
    elif target_status in ("In Progress", "Assigned", "To Do"):
        task.completed_at = None

    if comment and comment.strip():
        db.add(TaskComment(task_id=task.id, user_id=actor.id, content=f"[{target_status}] {comment.strip()}"))

    log_audit(
        db=db,
        action="TASK_TRANSITION",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=actor.id,
        company_id=task.company_id,
        old_values={"status": old_status},
        new_values={"status": target_status, "comment": comment},
        ip_address=ip_address,
        commit=False,
    )
    return task


@router.post("/bulk")
def bulk_update_tasks(
    payload: TaskBulkRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TASK_BULK)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Apply a bulk action across up to 100 tasks with per-item tenant/RBAC checks and partial results."""
    idem_key = extract_idempotency_key(request)
    if idem_key:
        cached = lookup_idempotent_response(db, active_cid, current_user.id, idem_key, "POST", "/api/v1/tasks/bulk")
        if cached is not None:
            return cached

    ip_addr = request.client.host if request.client else None
    succeeded: List[str] = []
    failed: List[Dict[str, Any]] = []

    for tid in payload.task_ids:
        task = db.query(Task).filter(Task.id == tid).first()
        if not task:
            failed.append({"id": str(tid), "error": "Task not found"})
            continue
        if not current_user.is_superadmin and task.company_id != active_cid:
            failed.append({"id": str(tid), "error": "Forbidden: cross-company access denied"})
            continue

        try:
            if payload.action == "assign":
                if not has_granular_permission(current_user, GranularPermission.TASK_ASSIGN, task.company_id, db):
                    raise HTTPException(status_code=403, detail="Missing task:assign permission")
                manual_assign_task(
                    db=db,
                    task=task,
                    team_id=payload.team_id,
                    assignee_id=payload.assignee_id,
                    employee_id=payload.employee_id,
                    actor_id=current_user.id,
                    reason="bulk_assign",
                    commit=True,
                    ip_address=ip_addr,
                )
            elif payload.action == "team":
                if not payload.team_id:
                    raise HTTPException(status_code=400, detail="team_id is required for action='team'")
                manual_assign_task(
                    db=db,
                    task=task,
                    team_id=payload.team_id,
                    actor_id=current_user.id,
                    reason="bulk_team",
                    commit=True,
                    ip_address=ip_addr,
                )
            elif payload.action == "transition":
                if not payload.to_status:
                    raise HTTPException(status_code=400, detail="to_status is required for action='transition'")
                _validate_and_apply_task_transition(
                    db=db,
                    task=task,
                    to_status=payload.to_status,
                    actor=current_user,
                    comment=payload.comment,
                    ip_address=ip_addr,
                )
                db.commit()
            elif payload.action == "priority":
                if not payload.priority:
                    raise HTTPException(status_code=400, detail="priority is required for action='priority'")
                old_p = task.priority
                task.priority = payload.priority.strip()
                log_audit(
                    db=db,
                    action="BULK_TASK_PRIORITY",
                    resource_type="Task",
                    resource_id=str(task.id),
                    user_id=current_user.id,
                    company_id=task.company_id,
                    old_values={"priority": old_p},
                    new_values={"priority": task.priority},
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
        message=f"تم تنفيذ الإجراء الجماعي على {len(succeeded)} مهمة",
    )
    if idem_key:
        store_idempotent_response(db, active_cid, current_user.id, idem_key, "POST", "/api/v1/tasks/bulk", resp)
    return resp


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
        "team_id": str(task.team_id) if task.team_id else None,
        "team_name": task.team.name if task.team else None,
        "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
        "sla_policy_id": str(task.sla_policy_id) if task.sla_policy_id else None,
        "sla_state": task.sla_state or "ok",
        "resolution_due_at": task.resolution_due_at.isoformat() if task.resolution_due_at else None,
        "title": task.title,
        "description": task.description,
        "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
        "assigned_to_name": task.assigned_to.full_name if task.assigned_to else None,
        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        "checklist_items": [
            {
                "id": str(ci.id),
                "title": ci.title,
                "is_completed": bool(ci.is_completed),
                "position": ci.position,
                "completed_at": ci.completed_at.isoformat() if ci.completed_at else None,
            }
            for ci in db.query(TaskChecklistItem)
            .filter(TaskChecklistItem.task_id == task.id)
            .order_by(TaskChecklistItem.position.asc(), TaskChecklistItem.created_at.asc())
            .all()
        ],
        "subtasks": [
            {
                "id": str(st.id),
                "title": st.title,
                "status": st.status,
                "priority": st.priority,
                "assignee_id": str(st.assignee_id) if st.assignee_id else None,
                "due_date": st.due_date.isoformat() if st.due_date else None,
            }
            for st in db.query(Task)
            .filter(Task.parent_task_id == task.id, Task.company_id == task.company_id)
            .order_by(Task.created_at.asc())
            .all()
        ],
        "watchers": [
            {
                "user_id": str(w.user_id),
                "username": w.user.username if w.user else None,
                "full_name": w.user.employee.full_name if (w.user and w.user.employee) else (w.user.username if w.user else None),
            }
            for w in db.query(TaskWatcher).filter(TaskWatcher.task_id == task.id).all()
        ],
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
        "related_ticket_number": task.related_ticket.ticket_number if task.related_ticket else None,
        "related_ticket_title": task.related_ticket.issue_title if task.related_ticket else None,
        "notes": task.notes,
        "attachments": task.attachments,
        "is_voice_task": bool(task.is_voice_task),
        "voice_note_url": task.voice_note_url,
        "voice_note_duration": task.voice_note_duration,
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
    if 'attachments' in payload.model_fields_set:
        task.attachments = payload.attachments
    if 'is_voice_task' in payload.model_fields_set and payload.is_voice_task is not None:
        task.is_voice_task = payload.is_voice_task
    if 'voice_note_url' in payload.model_fields_set:
        task.voice_note_url = payload.voice_note_url
    if 'voice_note_duration' in payload.model_fields_set and payload.voice_note_duration is not None:
        task.voice_note_duration = payload.voice_note_duration

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
    if payload.attachments:
        task.attachments = _merge_task_attachments(task.attachments, payload.attachments)
    updated = task_service.block_task(task=task, blocker_reason=payload.reason, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "blocker_reason": updated.blocker_reason, "attachments": updated.attachments}, message="تم تسجيل تعليق المهمة لوجود معوق")


@router.post("/{task_id}/attachments")
async def attach_file_to_existing_task(
    task_id: uuid.UUID,
    file: UploadFile = File(...),
    stage_note: Optional[str] = Form(None),
    advance_to_status: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Upload and attach an image or file directly to an existing task, optionally advancing it to the next workflow stage."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    task_service.assert_task_access(task, current_user, active_cid)

    up_resp = await upload_task_attachment(
        file=file,
        stage=advance_to_status or task.status,
        current_user=current_user,
        active_cid=active_cid,
    )
    att_item = up_resp["data"]
    task.attachments = _merge_task_attachments(task.attachments, [att_item])

    comment_text = f"📎 تم إرفاق ملف للمرحلة القادمة: {att_item['name']}"
    if stage_note and stage_note.strip():
        comment_text += f" — {stage_note.strip()}"
    db.add(TaskComment(task_id=task.id, user_id=current_user.id, content=comment_text))

    if advance_to_status:
        if advance_to_status == "Submitted for Review":
            task_service.submit_for_review(task=task, notes=stage_note, user=current_user, db=db)
        elif advance_to_status == "In Progress" and task.status in ("Assigned", "Accepted", "Rework Required"):
            task_service.start_task(task=task, user=current_user, db=db)
        elif advance_to_status == "Accepted" and task.status == "Assigned":
            task_service.accept_task(task=task, user=current_user, db=db)
        elif advance_to_status == "Completed":
            actor = wf.Actor(
                user_id=current_user.id, employee_id=current_user.employee_id, name=current_user.username,
                company_id=active_cid, privileged=task_service.is_manager_or_admin(current_user, db, task.company_id),
                superadmin=bool(current_user.is_superadmin), source="dashboard",
            )
            wf.transition(db, task, actor, "complete", stage_note)

    db.commit()
    db.refresh(task)
    return success_response(
        data={
            "id": str(task.id),
            "status": task.status,
            "attachment": att_item,
            "attachments": task.attachments,
        },
        message="تم إرفاق الملف وإرساله للمرحلة القادمة بنجاح",
    )


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
    if payload.attachments:
        task.attachments = _merge_task_attachments(task.attachments, payload.attachments)
    updated = task_service.submit_for_review(task=task, notes=payload.notes, user=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "attachments": updated.attachments}, message="تم رفع المهمة والمرفقات للمراجعة بنجاح")


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
    if payload.attachments:
        task.attachments = _merge_task_attachments(task.attachments, payload.attachments)
    updated = task_service.approve_task(task=task, review_notes=payload.review_notes, reviewer=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "attachments": updated.attachments}, message="تم اعتماد المهمة وإكمالها بنجاح")


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
    if payload.attachments:
        task.attachments = _merge_task_attachments(task.attachments, payload.attachments)
    updated = task_service.rework_task(task=task, rework_notes=payload.review_notes or "", reviewer=current_user, db=db)
    return success_response(data={"id": str(updated.id), "status": updated.status, "rework_count": updated.rework_count, "attachments": updated.attachments}, message="تم طلب تعديلات إضافية على المهمة")


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


# ── Broadcast & Deadline Intelligence (Phase 2 & 3) ──────────────────────

@router.post("/broadcast")
def broadcast_tasks(
    payload: TaskBroadcastCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "IT Technician"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Fast broadcast task assignment supporting:
    - Individual: Generates distinct tasks for each selected recipient with duplicate prevention.
    - Shared: Generates a single task with an accountable owner and collaborating participants.
    - Announcement: Broadcasts a bulletin without creating task records.
    """
    target_cid = resolve_company_scope(current_user, active_cid, payload.company_id)
    if not payload.recipient_ids:
        raise HTTPException(status_code=400, detail="يرجى تحديد مستلم واحد على الأقل للبث")

    # Deduplicate recipient_ids preserving order
    unique_recipients = list(dict.fromkeys(payload.recipient_ids))
    target_duration = payload.target_duration_minutes or DEFAULT_TARGET_DURATIONS.get(payload.priority, 4320)
    deadline_at = payload.deadline_at or resolve_task_deadline(payload.priority, payload.deadline_type, target_duration, payload.deadline_at)
    broadcast_group_id = uuid.uuid4()

    if payload.broadcast_mode == "announcement":
        notified_count = 0
        for emp_id in unique_recipients:
            emp = db.query(Employee).filter(Employee.id == emp_id, Employee.company_id == target_cid).first()
            if emp and emp.user:
                create_notification(
                    db=db,
                    recipient_user_id=emp.user.id,
                    company_id=target_cid,
                    event_type="announcement",
                    title=f"📢 تعميم إداري: {payload.title}",
                    message=payload.description or payload.title,
                    related_record_type="announcement",
                    related_record_id=broadcast_group_id,
                )
                notified_count += 1
            if payload.notify_telegram:
                link = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp_id, TelegramUserLink.is_verified == True).first()
                if link and link.telegram_chat_id:
                    from app.services.telegram_service import get_telegram_config, send_telegram_direct_message
                    _, bot_token, _ = get_telegram_config(db, target_cid)
                    if bot_token:
                        send_telegram_direct_message(
                            bot_token=bot_token,
                            chat_id=link.telegram_chat_id,
                            text=f"📢 <b>تعميم إداري عاجل</b>\n\n<b>{payload.title}</b>\n\n{payload.description or ''}\n\n<i>المرسل: {current_user.username}</i>",
                        )
        log_audit(
            db=db, action="BROADCAST_ANNOUNCEMENT", resource_type="Announcement",
            resource_id=str(broadcast_group_id), user_id=current_user.id, company_id=target_cid,
            new_values={"title": payload.title, "recipients_count": len(unique_recipients)},
        )
        return success_response(
            data={"broadcast_group_id": str(broadcast_group_id), "notified_count": notified_count, "mode": "announcement"},
            message=f"تم بث التعميم بنجاح إلى {len(unique_recipients)} موظف",
        )

    elif payload.broadcast_mode == "shared":
        accountable_emp_id = payload.accountable_id or unique_recipients[0]
        validate_assignee(db, target_cid, accountable_emp_id)

        shared_task = Task(
            company_id=target_cid,
            branch_id=payload.branch_id,
            title=payload.title.strip(),
            description=payload.description,
            assigned_to_id=accountable_emp_id,
            assigned_by_id=current_user.id,
            priority=payload.priority,
            status="To Do",
            start_date=date.today(),
            due_date=payload.due_date or deadline_at.date(),
            deadline_type=payload.deadline_type,
            target_duration_minutes=target_duration,
            deadline_at=deadline_at,
            is_broadcast=True,
            broadcast_mode="shared",
            broadcast_group_id=broadcast_group_id,
            is_accountable=True,
        )
        db.add(shared_task)
        db.flush()

        for emp_id in unique_recipients:
            role_type = "accountable" if emp_id == accountable_emp_id else "collaborator"
            participant = TaskParticipant(
                task_id=shared_task.id,
                employee_id=emp_id,
                role_type=role_type,
                status="active",
            )
            db.add(participant)

            emp = db.query(Employee).filter(Employee.id == emp_id).first()
            if emp and emp.user:
                create_notification(
                    db=db, recipient_user_id=emp.user.id, company_id=target_cid,
                    event_type="task_assigned",
                    title=f"تم إشراكك في مهمة جماعية ({'المسؤول الأول' if role_type == 'accountable' else 'فريق العمل'})",
                    message=f"المهمة: {shared_task.title}",
                    related_record_type="task",
                    related_record_id=shared_task.id,
                )

        db.commit()
        db.refresh(shared_task)
        if payload.notify_telegram:
            try:
                enqueue_task_notification(db=db, task=shared_task, event_type="task.assigned")
                db.commit()
            except Exception:
                pass

        log_audit(
            db=db, action="CREATE_SHARED_TASK", resource_type="Task",
            resource_id=str(shared_task.id), user_id=current_user.id, company_id=target_cid,
            new_values={"title": shared_task.title, "participants_count": len(unique_recipients)},
        )
        return success_response(
            data={"id": str(shared_task.id), "broadcast_group_id": str(broadcast_group_id), "mode": "shared", "participants_count": len(unique_recipients)},
            message="تم إنشاء وتوزيع المهمة المشتركة بنجاح",
        )

    else:
        # Individual mode
        created_tasks = []
        for emp_id in unique_recipients:
            try:
                validate_assignee(db, target_cid, emp_id)
            except Exception:
                continue

            ind_task = Task(
                company_id=target_cid,
                branch_id=payload.branch_id,
                title=payload.title.strip(),
                description=payload.description,
                assigned_to_id=emp_id,
                assigned_by_id=current_user.id,
                priority=payload.priority,
                status="To Do",
                start_date=date.today(),
                due_date=payload.due_date or deadline_at.date(),
                deadline_type=payload.deadline_type,
                target_duration_minutes=target_duration,
                deadline_at=deadline_at,
                is_broadcast=True,
                broadcast_mode="individual",
                broadcast_group_id=broadcast_group_id,
                is_accountable=True,
            )
            db.add(ind_task)
            db.flush()
            created_tasks.append(ind_task)

            emp = db.query(Employee).filter(Employee.id == emp_id).first()
            if emp and emp.user:
                create_notification(
                    db=db, recipient_user_id=emp.user.id, company_id=target_cid,
                    event_type="task_assigned",
                    title="تم إسناد مهمة جديدة إليك (إسناد فردي متعدد)",
                    message=f"المهمة: {ind_task.title}",
                    related_record_type="task",
                    related_record_id=ind_task.id,
                )
            if payload.notify_telegram:
                try:
                    enqueue_task_notification(db=db, task=ind_task, event_type="task.assigned")
                except Exception:
                    pass

        db.commit()
        log_audit(
            db=db, action="CREATE_BROADCAST_TASKS", resource_type="Task",
            resource_id=str(broadcast_group_id), user_id=current_user.id, company_id=target_cid,
            new_values={"title": payload.title, "tasks_created": len(created_tasks)},
        )
        return success_response(
            data={"broadcast_group_id": str(broadcast_group_id), "tasks_created": len(created_tasks), "mode": "individual"},
            message=f"تم إنشاء وتوزيع {len(created_tasks)} مهمة فردية بنجاح",
        )


@router.get("/metrics/deadlines")
def get_deadline_metrics(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve live countdown and deadline compliance metrics."""
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    now = datetime.utcnow()

    active_tasks = db.query(Task).filter(
        Task.company_id == target_cid,
        Task.status.notin_(["Completed", "Cancelled", "Closed"]),
    ).all()

    on_schedule = 0
    at_risk = 0
    breached = 0

    for t in active_tasks:
        target_deadline = t.deadline_at or (
            datetime.combine(t.due_date, datetime.min.time()) if t.due_date else None
        )
        if not target_deadline:
            on_schedule += 1
            continue

        if now > target_deadline:
            breached += 1
            if not t.escalated_at:
                t.escalated_at = now
                t.escalation_level = max(t.escalation_level, 1)
        else:
            total_duration = (target_deadline - t.created_at).total_seconds()
            elapsed = (now - t.created_at).total_seconds()
            if total_duration > 0 and (elapsed / total_duration) >= 0.8:
                at_risk += 1
                if not t.escalated_at:
                    t.escalated_at = now
                    t.escalation_level = 1
            else:
                on_schedule += 1

    try:
        db.commit()
    except Exception:
        db.rollback()

    total = len(active_tasks)
    rate = round((on_schedule / total * 100) if total else 100.0, 1)

    return success_response(data={
        "total_active": total,
        "on_schedule": on_schedule,
        "at_risk": at_risk,
        "breached": breached,
        "compliance_rate": rate,
    })


# ==============================================================================
# Work-Management Task Extensions: Assign, Transition, Checklists, Subtasks, Watchers
# ==============================================================================

@router.post("/{task_id}/assign")
def assign_task_endpoint(
    task_id: uuid.UUID,
    payload: TaskAssignRequest,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TASK_ASSIGN)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Assign/reassign task manually or via rule-driven auto-assignment (dual-syncs User & Employee)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إسناد هذه المهمة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tasks/{task_id}/assign"
    if idem_key:
        cached = lookup_idempotent_response(db, task.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    ip_addr = request.client.host if request.client else None
    try:
        if payload.auto_assign:
            if payload.team_id:
                validate_company_fk(db, Team, payload.team_id, task.company_id, "الفريق")
                task.team_id = payload.team_id
            decision = auto_assign_task(
                db=db,
                task=task,
                actor_id=current_user.id,
                force=True,
                commit=True,
                ip_address=ip_addr,
            )
            db.refresh(task)
            resp = success_response(
                data={
                    "task_id": str(task.id),
                    "team_id": str(task.team_id) if task.team_id else None,
                    "assignee_id": str(task.assignee_id) if task.assignee_id else None,
                    "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
                    "strategy_used": decision.strategy_used,
                    "reason": decision.reason,
                },
                message="تم تنفيذ التوزيع التلقائي للمهمة",
            )
        else:
            manual_assign_task(
                db=db,
                task=task,
                team_id=payload.team_id,
                assignee_id=payload.assignee_id,
                employee_id=payload.employee_id,
                clear_assignee=payload.clear_assignee,
                actor_id=current_user.id,
                reason=payload.reason or "manual",
                commit=True,
                ip_address=ip_addr,
            )
            resp = success_response(
                data={
                    "task_id": str(task.id),
                    "team_id": str(task.team_id) if task.team_id else None,
                    "assignee_id": str(task.assignee_id) if task.assignee_id else None,
                    "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
                },
                message="تم إسناد المهمة بنجاح",
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if idem_key:
        store_idempotent_response(db, task.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.post("/{task_id}/transition")
def transition_task_endpoint(
    task_id: uuid.UUID,
    payload: TaskTransitionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Transition a task status validated against WorkflowTransition matrix."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل حالة هذه المهمة")

    idem_key = extract_idempotency_key(request)
    req_path = f"/api/v1/tasks/{task_id}/transition"
    if idem_key:
        cached = lookup_idempotent_response(db, task.company_id, current_user.id, idem_key, "POST", req_path)
        if cached is not None:
            return cached

    _validate_and_apply_task_transition(
        db=db,
        task=task,
        to_status=payload.to_status,
        actor=current_user,
        comment=payload.comment,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(task)

    resp = success_response(
        data={
            "task_id": str(task.id),
            "status": task.status,
            "stage": wf.stage_of(task.status),
            "is_blocked": bool(task.is_blocked),
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        },
        message=f"تم تحديث حالة المهمة إلى {task.status}",
    )
    if idem_key:
        store_idempotent_response(db, task.company_id, current_user.id, idem_key, "POST", req_path, resp)
    return resp


@router.get("/{task_id}/checklist")
def list_task_checklist(
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
    rows = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.task_id == task.id, TaskChecklistItem.company_id == task.company_id)
        .order_by(TaskChecklistItem.position.asc(), TaskChecklistItem.created_at.asc())
        .all()
    )
    return success_response(
        data=[
            {
                "id": str(r.id),
                "task_id": str(r.task_id),
                "title": r.title,
                "is_completed": bool(r.is_completed),
                "position": r.position,
                "completed_by_id": str(r.completed_by_id) if r.completed_by_id else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in rows
        ]
    )


@router.post("/{task_id}/checklist")
def add_task_checklist_item(
    task_id: uuid.UUID,
    payload: TaskChecklistCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذه المهمة")
    if not has_granular_permission(current_user, GranularPermission.TASK_TRANSITION, task.company_id, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إضافة عنصر تحقق")

    pos = payload.position
    if pos is None:
        pos = db.query(TaskChecklistItem).filter(TaskChecklistItem.task_id == task.id).count()
    item = TaskChecklistItem(
        company_id=task.company_id,
        task_id=task.id,
        title=payload.title.strip(),
        position=pos,
        is_completed=False,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(
        data={
            "id": str(item.id),
            "task_id": str(item.task_id),
            "title": item.title,
            "is_completed": False,
            "position": item.position,
        },
        message="تمت إضافة عنصر قائمة التحقق بنجاح",
    )


@router.patch("/{task_id}/checklist/{item_id}")
def update_task_checklist_item(
    task_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: TaskChecklistUpdate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    item = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.id == item_id, TaskChecklistItem.task_id == task_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="عنصر قائمة التحقق غير موجود")
    if not current_user.is_superadmin and item.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذا العنصر")
    if not has_granular_permission(current_user, GranularPermission.TASK_TRANSITION, item.company_id, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل قائمة التحقق")

    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"]:
        item.title = updates["title"].strip()
    if "position" in updates and updates["position"] is not None:
        item.position = updates["position"]
    if "is_completed" in updates and updates["is_completed"] is not None:
        item.is_completed = updates["is_completed"]
        if item.is_completed:
            item.completed_by_id = current_user.id
            item.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            item.completed_by_id = None
            item.completed_at = None

    db.commit()
    db.refresh(item)
    return success_response(
        data={
            "id": str(item.id),
            "title": item.title,
            "is_completed": bool(item.is_completed),
            "position": item.position,
            "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        },
        message="تم تحديث عنصر قائمة التحقق",
    )


@router.delete("/{task_id}/checklist/{item_id}")
def delete_task_checklist_item(
    task_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    item = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.id == item_id, TaskChecklistItem.task_id == task_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="عنصر قائمة التحقق غير موجود")
    if not current_user.is_superadmin and item.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذا العنصر")
    if not has_granular_permission(current_user, GranularPermission.TASK_TRANSITION, item.company_id, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف عنصر قائمة التحقق")
    db.delete(item)
    db.commit()
    return success_response(message="تم حذف عنصر قائمة التحقق")


@router.get("/{task_id}/subtasks")
def list_task_subtasks(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    parent = db.query(Task).filter(Task.id == task_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and parent.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")
    subs = (
        db.query(Task)
        .filter(Task.parent_task_id == parent.id, Task.company_id == parent.company_id)
        .order_by(Task.created_at.asc())
        .all()
    )
    return success_response(
        data=[
            {
                "id": str(s.id),
                "title": s.title,
                "status": s.status,
                "priority": s.priority,
                "assignee_id": str(s.assignee_id) if s.assignee_id else None,
                "assigned_to_id": str(s.assigned_to_id) if s.assigned_to_id else None,
                "assigned_to_name": s.assigned_to.full_name if s.assigned_to else None,
                "due_date": s.due_date.isoformat() if s.due_date else None,
            }
            for s in subs
        ]
    )


@router.post("/{task_id}/watchers")
def add_task_watcher(
    task_id: uuid.UUID,
    payload: WatcherAddRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")

    target_uid = payload.user_id or current_user.id
    target_user = db.query(User).filter(User.id == target_uid, User.is_deleted == False).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if not target_user.is_superadmin:
        mem = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == target_uid,
                CompanyMembership.company_id == task.company_id,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if not mem:
            raise HTTPException(status_code=400, detail="المستخدم المحدد غير تابع لهذه الشركة")

    existing = (
        db.query(TaskWatcher)
        .filter(TaskWatcher.task_id == task.id, TaskWatcher.user_id == target_uid)
        .first()
    )
    if not existing:
        db.add(TaskWatcher(company_id=task.company_id, task_id=task.id, user_id=target_uid))
        db.commit()
    return success_response(data={"task_id": str(task.id), "user_id": str(target_uid)}, message="تمت إضافة المتابع بنجاح")


@router.delete("/{task_id}/watchers/{user_id}")
def remove_task_watcher(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not current_user.is_superadmin and task.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول لهذه المهمة")
    w = db.query(TaskWatcher).filter(TaskWatcher.task_id == task.id, TaskWatcher.user_id == user_id).first()
    if w:
        db.delete(w)
        db.commit()
    return success_response(message="تم إزالة المتابع بنجاح")
