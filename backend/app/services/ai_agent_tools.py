"""Validated, RBAC-enforced, multi-tenant tool implementations for Investor Gate OS AI Action Agent.

Security guarantees:
- All database access is scoped strictly to ``target_cid`` (company isolation).
- Every tool checks module & role permissions via ``app.core.rbac`` and ``app.services.task_workflow``.
- Employee resolution always maps human names to internal UUIDs server-side using ``search_assignees``.
- Sensitive or high-impact mutations (cancel, reopen, reject, bulk notify) require explicit server confirmation tokens.
- Never executes dynamic SQL, Python code, or unrestricted URLs.
"""

from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.rbac import Action, Module, get_user_effective_roles, has_module_permission
from app.models.asset import TechnicalAsset
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.telegram import NotificationOutbox, TelegramActionLog, TelegramUserLink
from app.models.ticket import HelpDeskTicket
from app.models.user import Employee, User
from app.services import arabic_nlp, gemini_service, task_service, task_workflow as wf
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.task_assignment import normalize_name, search_assignees, validate_assignee
from app.services.telegram_service import (
    dispatch_outbox_notifications,
    enqueue_task_notification,
    get_telegram_config,
    send_telegram_direct_message,
)

logger = logging.getLogger(__name__)

VALID_PRIORITIES = {"Low", "Medium", "High", "Urgent"}
VALID_TICKET_CATEGORIES = {"Hardware", "Software", "Network", "Email", "Access", "Other"}
STAFF_ROLES = {"Super Admin", "Company Admin", "IT Manager", "IT Technician"}


def _emit(
    progress_cb: Optional[Callable[[Dict[str, Any]], None]],
    key: str,
    label: str,
    status: str = "running",
    detail: Optional[str] = None,
) -> None:
    if progress_cb:
        progress_cb({"key": key, "label": label, "status": status, "detail": detail})


def _user_roles(user: User, company_id: uuid.UUID, db: Session) -> List[str]:
    if user.is_superadmin:
        return ["Super Admin"]
    return get_user_effective_roles(user, company_id, db)


def _safe_str(val: Any) -> str:
    if val is None or isinstance(val, (dict, list, bool)):
        return ""
    return str(val).strip()


def _safe_int(val: Any, default: int = 25, min_v: int = 1, max_v: int = 50) -> int:
    try:
        n = int(val)
    except (TypeError, ValueError):
        return default
    return max(min_v, min(n, max_v))


def _as_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return None


_ROLE_PREFIXES_RE = re.compile(
    r"^(?:لـ\s+|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+الموظفة?\s+|لـ\s*الموظفة?\s+|"
    r"للفني\s+|إلى\s+|الى\s+|to\s+|for\s+|"
    r"الموظفة?\s+|موظفة?\s+|الأستاذة?\s+|الاستاذة?\s+|أستاذة?\s+|استاذة?\s+|"
    r"المهندسة?\s+|مهندسة?\s+|الفني\s+|فني\s+|الدكتورة?\s+|دكتورة?\s+|"
    r"المديرة?\s+|مديرة?\s+|الزميلة?\s+|زميلة?\s+|السيدة?\s+|السيد\s+|الأخ\s+|الأخت\s+|"
    r"أ\.|م\.|د\.|employee\s+|staff\s+|technician\s+|engineer\s+|manager\s+|mr\.?\s+|ms\.?\s+|mrs\.?\s+|eng\.?\s+)+",
    flags=re.I,
)
_NON_NAME_WORDS = {
    "الموظف", "الموظفة", "موظف", "موظفة", "الفني", "فني", "المهندس", "الأستاذ",
    "المدير", "تذكرة", "التذكرة", "مهمة", "المهمة", "مهام", "المهام",
    "بضرورة", "بخصوص", "مراجعة", "فحص", "إشعار", "اشعار", "النظام", "السيرفر",
    "employee", "staff", "technician", "engineer", "task", "ticket", "someone",
}
_BROKEN_TITLES = {"ة", "ه", "ً", "مهمة", "مهمه", "مهام", "task", "tasks", "a task", "new task"}


def clean_employee_query(raw: Optional[str]) -> str:
    txt = _safe_str(raw).strip(" .،,:-'\"«»")
    if not txt:
        return ""
    cleaned = _ROLE_PREFIXES_RE.sub("", txt).strip(" .،,:-'\"«»")
    # Strip trailing punctuation/honorifics or pronouns like "له" / "لها"
    if cleaned.lower() in _NON_NAME_WORDS:
        return ""
    return cleaned


def _sanitize_task_title(raw: Optional[str]) -> str:
    title = _safe_str(raw)
    title = re.sub(r"\s+", " ", title).strip(" .،,:-'\"«»")
    title = re.sub(r"^(?:بعنوان|بخصوص|عن|حول|في|لأجل|كي|title:|regarding|about)\s+", "", title, flags=re.I).strip(" .،,:-")
    # Reject single broken Arabic character markers like "ة" or empty stubs
    letters_only = re.sub(r"[\W_]+", "", title)
    if not title or title.lower() in _BROKEN_TITLES or len(letters_only) < 2:
        return ""
    return title


def _normalize_task_filter_status(raw: Optional[str]) -> Optional[str]:
    low = _safe_str(raw).lower()
    if not low:
        return None
    if any(k in low for k in ["complete", "done", "finished", "مكتمل", "مكتملة", "منته", "منجزة", "منجزه"]):
        return "completed"
    if any(k in low for k in ["overdue", "late", "delayed", "متأخر", "متاخر"]):
        return "overdue"
    if any(k in low for k in ["progress", "working", "started", "قيد التنفيذ", "جاري", "تحت التنفيذ"]):
        return "in_progress"
    if any(k in low for k in ["waiting", "clarif", "توضيح", "انتظار الرد"]):
        return "waiting"
    if any(k in low for k in ["reject", "مرفوض", "رفض"]):
        return "rejected"
    if any(k in low for k in ["cancel", "ملغ", "الغاء", "إلغاء"]):
        return "cancelled"
    if any(k in low for k in ["new", "assigned", "pending", "todo", "to do", "draft", "جديد", "مسند", "بانتظار القبول"]):
        return "new"
    if any(k in low for k in ["active", "open", "نشط", "نشطة", "مفتوح", "مفتوحة"]):
        return "active"
    return None


def _is_staff(user: User, company_id: uuid.UUID, db: Session) -> bool:
    if user.is_superadmin:
        return True
    return any(r in STAFF_ROLES for r in _user_roles(user, company_id, db))


def _serialize_employee(db: Session, company_id: uuid.UUID, emp: Employee) -> Dict[str, Any]:
    link = (
        db.query(TelegramUserLink)
        .filter(
            TelegramUserLink.company_id == company_id,
            TelegramUserLink.employee_id == emp.id,
            TelegramUserLink.is_verified == True,
        )
        .first()
    )
    short_id = str(emp.id).replace("-", "")[:8].upper()
    branch_name = emp.branch.branch_name if emp.branch else None
    dept_name = emp.department.department_name if emp.department else None
    has_user = bool(emp.user and emp.user.account_status == "Active" and not emp.user.is_deleted)
    username = emp.user.username if has_user and emp.user else None
    tg_linked = bool(link and link.is_verified)
    tg_user = link.telegram_username if (link and link.is_verified) else None

    details = [f"رقم وظيفي: {emp.employee_number}"]
    if emp.job_title:
        details.append(emp.job_title)
    if dept_name:
        details.append(dept_name)
    if branch_name:
        details.append(f"فرع: {branch_name}")
    if username:
        details.append(f"حساب: {username}")
    else:
        details.append("بدون حساب مستخدم")
    if tg_linked:
        details.append(f"Telegram مرتبط{f' (@{tg_user})' if tg_user else ''}")
    else:
        details.append("داخلي فقط")

    return {
        "employee_id": str(emp.id),
        "short_id": short_id,
        "full_name": emp.full_name,
        "employee_number": emp.employee_number,
        "job_title": emp.job_title,
        "branch_name": branch_name,
        "department_name": dept_name,
        "has_user_account": has_user,
        "username": username,
        "telegram_linked": tg_linked,
        "telegram_username": tg_user,
        "telegram_notifications_enabled": bool(link and link.is_verified and link.notifications_enabled),
        "distinguishing_label": f"{emp.full_name} ({' • '.join(details)})",
    }


def _parse_due_date(raw: Optional[str]) -> Optional[date]:
    if not raw or not isinstance(raw, str):
        return None
    iso_str, _ = arabic_nlp.extract_natural_date_riyadh(raw.strip())
    if iso_str:
        try:
            return date.fromisoformat(iso_str)
        except ValueError:
            return None
    return None


def _normalize_priority(raw: Optional[str]) -> str:
    if not raw:
        return "Medium"
    low = raw.strip().lower()
    if low in {"urgent", "critical", "عاجل", "عاجلة", "حرج", "حرجة", "فوري", "طارئ"}:
        return "Urgent"
    if low in {"high", "مرتفع", "مرتفعة", "عالي", "عالية", "هام", "مهم", "مهمة"}:
        return "High"
    if low in {"low", "منخفض", "منخفضة", "عادي", "بسيط"}:
        return "Low"
    if low in {"medium", "normal", "متوسط", "متوسطة"}:
        return "Medium"
    for valid in VALID_PRIORITIES:
        if low == valid.lower():
            return valid
    return "Medium"


def _normalize_ticket_category(raw: Optional[str]) -> str:
    if not raw:
        return "Other"
    low = raw.strip().lower()
    if any(k in low for k in ["network", "شبك", "واي فاي", "vpn", "switch", "router"]):
        return "Network"
    if any(k in low for k in ["hardware", "أجهزة", "جهاز", "لابتوب", "شاشة", "طابعة", "عتاد"]):
        return "Hardware"
    if any(k in low for k in ["email", "بريد", "outlook", "ميل"]):
        return "Email"
    if any(k in low for k in ["access", "صلاحية", "صلاحيات", "حساب", "مصادقة", "دخول", "password", "كلمة المرور"]):
        return "Access"
    if any(k in low for k in ["software", "برمجيات", "أنظمة", "تطبيق", "خادم", "خوادم", "سيرفر", "server"]):
        return "Software"
    for valid in VALID_TICKET_CATEGORIES:
        if low == valid.lower():
            return valid
    return "Other"


# ── Tool 1: Server-side Employee Resolution ─────────────────────────────────

def tool_resolve_employee(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    name: str = "",
    employee_id: Optional[str] = None,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    if not (
        has_module_permission(current_user, Module.EMPLOYEES, Action.VIEW, target_cid, db)
        or has_module_permission(current_user, Module.TASKS, Action.VIEW, target_cid, db)
        or has_module_permission(current_user, Module.TICKETS, Action.VIEW, target_cid, db)
    ):
        return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية استعراض دليل الموظفين."}

    _emit(progress_cb, "resolve_employee", "جارٍ التحقق من الموظف...", "running", name or employee_id)

    if employee_id:
        try:
            emp_uuid = uuid.UUID(str(employee_id))
            emp = validate_assignee(db, target_cid, emp_uuid)
            item = _serialize_employee(db, target_cid, emp)
            _emit(progress_cb, "resolve_employee", "تم التحقق من الموظف", "completed", item["full_name"])
            return {"ok": True, "status": "unique", "employee": item, "candidates": [item]}
        except Exception:
            _emit(progress_cb, "resolve_employee", "تعذر التحقق من الموظف المحدد", "failed", "معرف غير صالح أو خارج نطاق المنشأة")
            return {"ok": False, "status": "not_found", "error": "الموظف المحدد غير متاح ضمن المنشأة الحالية.", "candidates": []}

    clean_name = clean_employee_query(name)
    # Support direct UUID passed in name field
    if clean_name:
        try:
            direct_uuid = uuid.UUID(clean_name)
            emp = validate_assignee(db, target_cid, direct_uuid)
            item = _serialize_employee(db, target_cid, emp)
            _emit(progress_cb, "resolve_employee", "تم التحقق من الموظف", "completed", item["full_name"])
            return {
                "ok": True,
                "status": "unique",
                "employee": item,
                "candidates": [item],
                "data": {"type": "employee_list", "count": 1, "total_count": 1, "items": [item]},
            }
        except Exception:
            pass

    if not clean_name:
        _emit(progress_cb, "resolve_employee", "يرجى تحديد اسم الموظف", "warning", "الاسم غير محدد")
        sample = [_serialize_employee(db, target_cid, m) for m in search_assignees(db, target_cid, search="", limit=6)]
        return {
            "ok": False,
            "status": "needs_clarification",
            "error": "لمن ترغب في توجيه هذا الإجراء؟ يرجى كتابة اسم الموظف أو اختياره من القائمة:",
            "candidates": sample,
        }

    # Check exact employee_number match within active company employees
    num_candidate = clean_name.lstrip("#").strip()
    exact_num_emps = (
        db.query(Employee)
        .filter(
            Employee.company_id == target_cid,
            Employee.employment_status == "Active",
            Employee.employee_number == num_candidate,
        )
        .all()
    )
    if len(exact_num_emps) == 1:
        emp_valid = validate_assignee(db, target_cid, exact_num_emps[0].id)
        item = _serialize_employee(db, target_cid, emp_valid)
        _emit(progress_cb, "resolve_employee", "تم التحقق من الموظف برقم الوظيفة", "completed", item["full_name"])
        return {
            "ok": True,
            "status": "unique",
            "employee": item,
            "candidates": [item],
            "data": {"type": "employee_list", "count": 1, "total_count": 1, "items": [item]},
        }

    matches = search_assignees(db, target_cid, search=clean_name, limit=15)
    serialized = [_serialize_employee(db, target_cid, m) for m in matches]

    # Typo-tolerant RapidFuzz fallback across authorized active company employees when exact token search yields 0
    if not serialized:
        all_active = search_assignees(db, target_cid, search="", limit=200)
        all_serialized = [_serialize_employee(db, target_cid, m) for m in all_active]
        serialized = arabic_nlp.fuzzy_rank_employee_candidates(clean_name, all_serialized, threshold=77.0)

    if not serialized:
        _emit(progress_cb, "resolve_employee", "لم يتم العثور على موظف مطابق", "warning", clean_name)
        return {
            "ok": False,
            "status": "not_found",
            "error": f"لم يتم العثور على موظف نشط باسم «{clean_name}» في المنشأة الحالية. يرجى كتابة اسم آخر أو التحقق من الدليل.",
            "candidates": [],
        }

    if len(serialized) == 1:
        _emit(progress_cb, "resolve_employee", "تم التحقق من الموظف", "completed", serialized[0]["full_name"])
        return {
            "ok": True,
            "status": "unique",
            "employee": serialized[0],
            "candidates": serialized,
            "data": {"type": "employee_list", "count": 1, "total_count": 1, "items": serialized},
        }

    # Check if full normalized name matches uniquely when multiple candidates share partial tokens
    norm_query = normalize_name(clean_name)
    exact_matches = [c for c in serialized if normalize_name(c["full_name"]) == norm_query]
    if len(exact_matches) == 1:
        _emit(progress_cb, "resolve_employee", "تم التحقق من الموظف", "completed", exact_matches[0]["full_name"])
        return {
            "ok": True,
            "status": "unique",
            "employee": exact_matches[0],
            "candidates": serialized,
            "data": {"type": "employee_list", "count": 1, "total_count": 1, "items": exact_matches},
        }

    # Never auto-select the first match when multiple valid records share the same name!
    option_lines = [
        f"{idx}) {c['distinguishing_label']}"
        for idx, c in enumerate(serialized[:6], start=1)
    ]
    _emit(progress_cb, "resolve_employee", "تطابق أكثر من موظف — يرجى التوضيح", "warning", f"{len(serialized)} نتائج")
    return {
        "ok": False,
        "status": "ambiguous",
        "error": (
            f"يوجد أكثر من موظف نشط مطابق للاسم «{clean_name}» ({len(serialized)} سجلات). "
            f"يرجى اختيار السجل المقصود من القائمة أو تحديد الرقم الوظيفي:\n" + "\n".join(option_lines)
        ),
        "candidates": serialized,
    }


# ── Tool 2: Create & Assign Task (+ Verified Notification & Confirmation) ───

def _persist_single_task(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    *,
    title: str,
    description: Optional[str],
    resolved_emp_obj: Optional[Employee],
    resolved_emp_info: Optional[Dict[str, Any]],
    priority_val: str,
    due_date_val: Optional[date],
    related_ticket_id: Optional[uuid.UUID],
    notify_employee: bool,
    explicit_notify: bool,
    ip_address: str,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]],
) -> Dict[str, Any]:
    _emit(progress_cb, "create_task", "جارٍ إنشاء المهمة...", "running", title)

    recent = db.query(Task).filter(
        Task.company_id == target_cid,
        Task.assigned_by_id == current_user.id,
        Task.title == title,
        Task.assigned_to_id == (resolved_emp_obj.id if resolved_emp_obj else None),
        Task.created_at >= datetime.utcnow() - timedelta(seconds=20),
    ).first()
    if recent:
        ref = wf.task_ref(recent)
        _emit(progress_cb, "create_task", "تم تجنب تكرار نفس المهمة", "completed", ref)
        return {
            "ok": True,
            "status": "executed",
            "duplicate": True,
            "data": {
                "type": "task",
                "task_id": str(recent.id),
                "reference": ref,
                "title": recent.title,
                "status": recent.status,
                "priority": recent.priority,
                "due_date": recent.due_date.isoformat() if recent.due_date else None,
                "assignee_name": resolved_emp_info["full_name"] if resolved_emp_info else None,
                "in_app_status": "Existing",
                "telegram_status": "DuplicateSkipped",
                "notification_summary": "تم تجنب التكرار — المهمة أُنشئت بالفعل قبل لحظات.",
            },
        }

    task = Task(
        company_id=target_cid,
        title=title,
        description=description,
        assigned_to_id=resolved_emp_obj.id if resolved_emp_obj else None,
        assigned_by_id=current_user.id,
        priority=priority_val,
        status="Assigned" if resolved_emp_obj else "Draft",
        due_date=due_date_val,
        related_ticket_id=related_ticket_id,
    )
    db.add(task)
    if related_ticket_id:
        rel_tk = db.query(HelpDeskTicket).filter(
            HelpDeskTicket.id == related_ticket_id,
            HelpDeskTicket.company_id == target_cid,
        ).first()
        if rel_tk and rel_tk.status == "Open":
            rel_tk.status = "Assigned"
    db.commit()
    db.refresh(task)

    ref = wf.task_ref(task)
    _emit(progress_cb, "create_task", "تم إنشاء المهمة", "completed", ref)

    log_audit(
        db=db,
        action="AI_AGENT_CREATE_TASK",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={
            "reference": ref,
            "title": task.title,
            "priority": task.priority,
            "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        },
        ip_address=ip_address,
    )

    in_app_status = "NotApplicable"
    telegram_status = "Skipped"
    telegram_error = None
    overall_status = "executed"

    if resolved_emp_obj and notify_employee:
        _emit(progress_cb, "send_notification", "جارٍ إرسال الإشعار...", "running", resolved_emp_obj.full_name)

        recipient_user = resolved_emp_obj.user
        if recipient_user:
            try:
                create_notification(
                    db=db,
                    recipient_user_id=recipient_user.id,
                    company_id=target_cid,
                    event_type="task_assigned",
                    title="تم إسناد مهمة جديدة إليك",
                    message=f"المهمة: {task.title} ({ref})",
                    related_record_type="task",
                    related_record_id=task.id,
                    priority="Normal",
                )
                in_app_status = "Sent"
            except Exception as exc:
                in_app_status = f"Failed ({exc})"
        else:
            in_app_status = "NoUserAccount"

        try:
            outbox_entry = enqueue_task_notification(
                db=db,
                task=task,
                event_type="task.assigned",
                dedupe_key=f"ai:{task.id}:{resolved_emp_obj.id}",
            )
            db.commit()
            if outbox_entry:
                if outbox_entry.status == "Pending":
                    dispatch_outbox_notifications(db=db, limit=5, outbox_id=outbox_entry.id)
                    db.refresh(outbox_entry)
                telegram_status = outbox_entry.status
                telegram_error = outbox_entry.last_error
            else:
                telegram_status = "Skipped"
        except Exception as exc:
            telegram_status = "Failed"
            telegram_error = str(exc)

        if telegram_status == "Sent":
            _emit(progress_cb, "send_notification", "تم إرسال إشعار المهمة", "completed", "Telegram + النظام")
        elif telegram_status == "Skipped (Unlinked)":
            _emit(progress_cb, "send_notification", "تعذر إرسال Telegram (الحساب غير مرتبط)", "warning", "تم إرسال إشعار داخلي")
            if explicit_notify or in_app_status != "Sent":
                overall_status = "partial_failure"
        elif telegram_status == "Failed":
            _emit(progress_cb, "send_notification", "فشل تسليم إشعار Telegram", "warning", telegram_error)
            overall_status = "partial_failure"
        else:
            _emit(progress_cb, "send_notification", "حالة إشعار Telegram معلقة", "warning", telegram_error or telegram_status)
            if explicit_notify:
                overall_status = "partial_failure"

    notif_summary_parts = []
    if in_app_status == "Sent":
        notif_summary_parts.append("تم إرسال الإشعار داخل النظام")
    if telegram_status == "Sent":
        notif_summary_parts.append("تم إرسال إشعار Telegram بنجاح")
    elif telegram_status == "Skipped (Unlinked)":
        notif_summary_parts.append("لم يُرسل Telegram لأن الموظف غير مرتبط بالبوت بعد (يتطلب ربطاً من الإدارة)")
    elif telegram_status == "Pending":
        notif_summary_parts.append(f"إشعار Telegram بالانتظار ({telegram_error or 'البوت غير مضبوط'})")
    elif telegram_status == "Failed":
        notif_summary_parts.append(f"فشل إرسال Telegram ({telegram_error or 'خطأ في الإرسال'})")

    return {
        "ok": True,
        "status": overall_status,
        "data": {
            "type": "task",
            "task_id": str(task.id),
            "reference": ref,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "assignee_name": resolved_emp_info["full_name"] if resolved_emp_info else None,
            "assignee_id": resolved_emp_info["employee_id"] if resolved_emp_info else None,
            "in_app_status": in_app_status,
            "telegram_status": telegram_status,
            "telegram_error": telegram_error,
            "notification_summary": " • ".join(notif_summary_parts) if notif_summary_parts else "بدون إشعار مرسل",
        },
    }


def tool_create_task(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    confirmed: bool = False,
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    if not has_module_permission(current_user, Module.TASKS, Action.CREATE, target_cid, db):
        return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية إنشاء المهام."}

    title = _sanitize_task_title(args.get("title"))
    if not title:
        return {
            "ok": False,
            "status": "needs_clarification",
            "error": "يرجى توضيح عنوان واضح ومكتمل للمهمة المطلوب إنشاؤها.",
            "pending_action": {"tool": "create_task", "args": dict(args), "missing_field": "title"},
        }

    assignee_id_raw = args.get("assignee_id") or args.get("assigned_to_id")
    assignee_name = clean_employee_query(args.get("assignee_name")) or None
    notify_employee = bool(args.get("notify_employee", True))
    explicit_notify = bool(args.get("explicit_notify", False))
    due_date_val = _parse_due_date(args.get("due_date"))
    priority_val = _normalize_priority(args.get("priority"))
    description = _safe_str(args.get("description")) or None

    resolved_emp_obj: Optional[Employee] = None
    resolved_emp_info: Optional[Dict[str, Any]] = None

    if assignee_id_raw or assignee_name:
        res_emp = tool_resolve_employee(
            db, current_user, target_cid, name=assignee_name or "", employee_id=assignee_id_raw, progress_cb=progress_cb
        )
        if res_emp["status"] == "denied":
            return res_emp
        if res_emp["status"] != "unique":
            next_args = dict(args)
            next_args["title"] = title
            return {
                "ok": False,
                "status": "needs_clarification",
                "error": res_emp["error"],
                "candidates": res_emp.get("candidates", []),
                "pending_action": {"tool": "create_task", "args": next_args, "missing_field": "assignee"},
            }
        resolved_emp_info = res_emp["employee"]
        resolved_emp_obj = db.query(Employee).filter(
            Employee.id == uuid.UUID(resolved_emp_info["employee_id"]),
            Employee.company_id == target_cid,
        ).first()

        assigning_to_other = resolved_emp_obj and resolved_emp_obj.id != current_user.employee_id
        if assigning_to_other and not (
            _is_staff(current_user, target_cid, db)
            or has_module_permission(current_user, Module.TASKS, Action.ASSIGN, target_cid, db)
        ):
            return {
                "ok": False,
                "status": "denied",
                "error": "صلاحيتك الحالية لا تسمح بإسناد مهام لموظفين آخرين. يمكنك فقط إنشاء مهام شخصية أو تقديم طلب دعم فني.",
            }

    related_ticket_id = None
    if args.get("related_ticket_id"):
        try:
            rt_uuid = uuid.UUID(str(args["related_ticket_id"]))
            tk = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == rt_uuid, HelpDeskTicket.company_id == target_cid).first()
            if tk:
                related_ticket_id = tk.id
        except ValueError:
            pass

    if not confirmed:
        resolved_args = {
            "title": title,
            "description": description,
            "assignee_id": resolved_emp_info["employee_id"] if resolved_emp_info else None,
            "assignee_name": resolved_emp_info["full_name"] if resolved_emp_info else None,
            "priority": priority_val,
            "due_date": due_date_val.isoformat() if due_date_val else None,
            "notify_employee": notify_employee,
            "explicit_notify": explicit_notify,
            "related_ticket_id": str(related_ticket_id) if related_ticket_id else None,
        }
        parts = [f"العنوان: «{title}»", f"الأولوية: {priority_val}"]
        if due_date_val:
            parts.append(f"تاريخ الاستحقاق: {due_date_val.isoformat()}")
        if resolved_emp_info:
            tg_hint = "سيُرسل إشعار Telegram + النظام" if resolved_emp_info.get("telegram_linked") else "إشعار داخلي فقط (غير مرتبط بتيليجرام)"
            parts.append(f"المسند إليه: {resolved_emp_info['full_name']} ({tg_hint if notify_employee else 'بدون إشعار'})")
        else:
            parts.append("الحالة الأولية: مسودة (بدون إسناد)")

        _emit(progress_cb, "confirm_create_task", "بانتظار تأكيد إنشاء المهمة", "warning", title)
        return {
            "ok": False,
            "status": "needs_confirmation",
            "confirmation_action": {
                "tool": "create_task",
                "args": resolved_args,
                "action_label": "تأكيد إنشاء المهمة وإرسال الإشعار" if (resolved_emp_info and notify_employee) else "تأكيد إنشاء المهمة",
                "summary": " • ".join(parts),
            },
        }

    return _persist_single_task(
        db=db,
        current_user=current_user,
        target_cid=target_cid,
        title=title,
        description=description,
        resolved_emp_obj=resolved_emp_obj,
        resolved_emp_info=resolved_emp_info,
        priority_val=priority_val,
        due_date_val=due_date_val,
        related_ticket_id=related_ticket_id,
        notify_employee=notify_employee,
        explicit_notify=explicit_notify,
        ip_address=ip_address,
        progress_cb=progress_cb,
    )


def tool_create_tasks_batch(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    confirmed: bool = False,
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Create multiple tasks or assign one task across multiple employees with full pre-flight validation and confirmation."""
    if not has_module_permission(current_user, Module.TASKS, Action.CREATE, target_cid, db):
        return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية إنشاء المهام."}

    raw_items: List[Dict[str, Any]] = []
    if isinstance(args.get("tasks"), list) and args["tasks"]:
        raw_items = [dict(x) for x in args["tasks"] if isinstance(x, dict)]
    elif args.get("title") and isinstance(args.get("assignee_names"), list) and args["assignee_names"]:
        base_title = args["title"]
        for aname in args["assignee_names"]:
            raw_items.append({
                "title": base_title,
                "assignee_name": aname,
                "priority": args.get("priority"),
                "due_date": args.get("due_date"),
                "description": args.get("description"),
                "notify_employee": args.get("notify_employee", True),
                "explicit_notify": args.get("explicit_notify", False),
            })

    if not raw_items:
        return {
            "ok": False,
            "status": "needs_clarification",
            "error": "يرجى تحديد قائمة المهام المطلوب إنشاؤها بعناوين واضحة.",
        }

    prepared: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_items[:10]):
        title = _sanitize_task_title(item.get("title"))
        if not title:
            return {
                "ok": False,
                "status": "needs_clarification",
                "error": f"تعذر تحديد عنوان واضح للمهمة رقم {idx + 1}. يرجى كتابة العناوين بشكل صريح.",
            }

        emp_id_raw = item.get("assignee_id")
        emp_name_raw = clean_employee_query(item.get("assignee_name")) or None
        resolved_emp_obj: Optional[Employee] = None
        resolved_emp_info: Optional[Dict[str, Any]] = None

        if emp_id_raw or emp_name_raw:
            res_emp = tool_resolve_employee(
                db, current_user, target_cid, name=emp_name_raw or "", employee_id=emp_id_raw, progress_cb=progress_cb
            )
            if res_emp["status"] == "denied":
                return res_emp
            if res_emp["status"] != "unique":
                next_batch = [dict(x) for x in raw_items]
                return {
                    "ok": False,
                    "status": "needs_clarification",
                    "error": f"بخصوص المهمة «{title}»: {res_emp['error']}",
                    "candidates": res_emp.get("candidates", []),
                    "pending_action": {
                        "tool": "create_tasks_batch",
                        "args": {"tasks": next_batch, "clarify_index": idx},
                        "missing_field": "assignee",
                    },
                }
            resolved_emp_info = res_emp["employee"]
            resolved_emp_obj = db.query(Employee).filter(
                Employee.id == uuid.UUID(resolved_emp_info["employee_id"]),
                Employee.company_id == target_cid,
            ).first()

            if resolved_emp_obj and resolved_emp_obj.id != current_user.employee_id and not (
                _is_staff(current_user, target_cid, db)
                or has_module_permission(current_user, Module.TASKS, Action.ASSIGN, target_cid, db)
            ):
                return {"ok": False, "status": "denied", "error": "صلاحيتك الحالية لا تسمح بإسناد مهام لموظفين آخرين."}

        prepared.append({
            "title": title,
            "description": _safe_str(item.get("description")) or None,
            "priority": _normalize_priority(item.get("priority")),
            "due_date": _parse_due_date(item.get("due_date")),
            "notify_employee": bool(item.get("notify_employee", True)),
            "explicit_notify": bool(item.get("explicit_notify", False)),
            "emp_obj": resolved_emp_obj,
            "emp_info": resolved_emp_info,
        })

    if not confirmed:
        resolved_list = [
            {
                "title": p["title"],
                "description": p["description"],
                "priority": p["priority"],
                "due_date": p["due_date"].isoformat() if p["due_date"] else None,
                "assignee_id": p["emp_info"]["employee_id"] if p["emp_info"] else None,
                "assignee_name": p["emp_info"]["full_name"] if p["emp_info"] else None,
                "notify_employee": p["notify_employee"],
                "explicit_notify": p["explicit_notify"],
            }
            for p in prepared
        ]
        summary_lines = []
        for i, p in enumerate(prepared, start=1):
            who = p["emp_info"]["full_name"] if p["emp_info"] else "مسودة (بدون إسناد)"
            summary_lines.append(f"{i}) {p['title']} ← {who} ({p['priority']})")

        _emit(progress_cb, "confirm_create_batch", f"بانتظار تأكيد إنشاء {len(prepared)} مهام", "warning")
        return {
            "ok": False,
            "status": "needs_confirmation",
            "confirmation_action": {
                "tool": "create_tasks_batch",
                "args": {"tasks": resolved_list},
                "action_label": f"تأكيد إنشاء {len(prepared)} مهام",
                "summary": "\n".join(summary_lines),
            },
        }

    created_cards: List[Dict[str, Any]] = []
    any_partial = False
    for p in prepared:
        single_res = _persist_single_task(
            db=db,
            current_user=current_user,
            target_cid=target_cid,
            title=p["title"],
            description=p["description"],
            resolved_emp_obj=p["emp_obj"],
            resolved_emp_info=p["emp_info"],
            priority_val=p["priority"],
            due_date_val=p["due_date"],
            related_ticket_id=None,
            notify_employee=p["notify_employee"],
            explicit_notify=p["explicit_notify"],
            ip_address=ip_address,
            progress_cb=progress_cb,
        )
        if single_res.get("status") == "partial_failure":
            any_partial = True
        if single_res.get("data"):
            created_cards.append(single_res["data"])

    return {
        "ok": bool(created_cards),
        "status": "partial_failure" if any_partial else "executed",
        "data": {
            "type": "task_batch",
            "count": len(created_cards),
            "tasks": created_cards,
        },
    }


# ── Tool 3: Update Task Status ──────────────────────────────────────────────

def _map_status_to_action(raw_status: str) -> Optional[str]:
    low = (raw_status or "").strip().lower()
    if any(k in low for k in ["complete", "done", "finish", "مكتمل", "مكتملة", "إنهاء", "انهاء", "أنه", "اكتمال"]):
        return "complete"
    if any(k in low for k in ["start", "progress", "بدء", "قيد التنفيذ", "جار", "تعمل"]):
        return "start"
    if any(k in low for k in ["accept", "قبول", "مقبول", "استلام"]):
        return "accept"
    if any(k in low for k in ["clarif", "wait", "توضيح", "استفسار"]):
        return "clarify"
    if any(k in low for k in ["reject", "رفض", "مرفوض", "مرفوضة"]):
        return "reject"
    if any(k in low for k in ["cancel", "إلغاء", "الغاء", "ملغ", "ملغاة"]):
        return "cancel"
    if any(k in low for k in ["reopen", "إعادة فتح", "اعادة فتح", "فتح"]):
        return "reopen"
    return None


def tool_update_task_status(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    confirmed: bool = False,
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    task_query = (args.get("task_reference") or args.get("task_id") or args.get("query") or "").strip()
    target_status = (args.get("target_status") or args.get("action") or "").strip()
    reason = (args.get("reason") or "").strip() or None

    action = _map_status_to_action(target_status)
    if not action:
        return {
            "ok": False,
            "status": "needs_clarification",
            "error": "الحالة المطلوبة غير واضحة. الحالات المدعومة: مكتملة، قيد التنفيذ، مقبولة، بانتظار التوضيح، مرفوضة، ملغاة، إعادة فتح.",
        }

    _emit(progress_cb, "find_task", "جارٍ البحث عن المهمة...", "running", task_query or "المهمة المحددة")

    task: Optional[Task] = None
    if task_query:
        try:
            t_uuid = uuid.UUID(task_query)
            task = db.query(Task).filter(Task.id == t_uuid, Task.company_id == target_cid).first()
        except ValueError:
            cond = wf.search_condition(db, task_query)
            q = db.query(Task).filter(Task.company_id == target_cid)
            if cond is not None:
                q = q.filter(cond)
            matches = q.order_by(Task.updated_at.desc()).limit(5).all()
            if len(matches) == 1:
                task = matches[0]
            elif len(matches) > 1:
                _emit(progress_cb, "find_task", "تم العثور على عدة مهام مطابقة", "warning", f"{len(matches)} مهام")
                return {
                    "ok": False,
                    "status": "needs_clarification",
                    "error": f"توجد {len(matches)} مهام مطابقة للبحث «{task_query}». يرجى تحديد رقم المرجع:",
                    "task_candidates": [
                        {
                            "task_id": str(m.id),
                            "reference": wf.task_ref(m),
                            "title": m.title,
                            "status": m.status,
                            "assignee_name": m.assigned_to.full_name if m.assigned_to else None,
                        }
                        for m in matches
                    ],
                }
    elif args.get("selected_task_id"):
        try:
            task = db.query(Task).filter(
                Task.id == uuid.UUID(str(args["selected_task_id"])),
                Task.company_id == target_cid,
            ).first()
        except ValueError:
            task = None
    else:
        # Context fallback: user's single most recently updated active task assigned to or created by them
        q = db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("active"))
        if current_user.employee_id:
            q = q.filter((Task.assigned_to_id == current_user.employee_id) | (Task.assigned_by_id == current_user.id))
        else:
            q = q.filter(Task.assigned_by_id == current_user.id)
        recent_tasks = q.order_by(Task.updated_at.desc(), Task.created_at.desc()).limit(3).all()
        if len(recent_tasks) == 1:
            task = recent_tasks[0]
        elif len(recent_tasks) > 1:
            _emit(progress_cb, "find_task", "يرجى تحديد المهمة المقصودة", "warning")
            return {
                "ok": False,
                "status": "needs_clarification",
                "error": "يرجى تحديد رقم المهمة (مثال: TASK-...) المراد تحديث حالتها:",
                "task_candidates": [
                    {
                        "task_id": str(m.id),
                        "reference": wf.task_ref(m),
                        "title": m.title,
                        "status": m.status,
                        "assignee_name": m.assigned_to.full_name if m.assigned_to else None,
                    }
                    for m in recent_tasks
                ],
            }

    if not task:
        _emit(progress_cb, "find_task", "لم يتم العثور على المهمة", "failed")
        return {"ok": False, "status": "error", "error": f"لم يتم العثور على المهمة المطلوبة ({task_query or 'غير محدد'}) ضمن المنشأة الحالية."}

    ref = wf.task_ref(task)
    _emit(progress_cb, "find_task", "تم التحقق من المهمة", "completed", f"{ref}: {task.title}")

    is_priv = task_service.is_manager_or_admin(current_user, db, task.company_id)
    actor = wf.Actor(
        user_id=current_user.id,
        employee_id=current_user.employee_id,
        name=current_user.username,
        company_id=target_cid,
        privileged=is_priv,
        superadmin=bool(current_user.is_superadmin),
        source="ai_agent",
    )

    # Check high-impact confirmation requirement before mutating
    if action in {"cancel", "reopen", "reject"} and not confirmed:
        # Validate permissions first before asking for confirmation so unauthorized users fail immediately
        is_owner = actor.employee_id and task.assigned_to_id == actor.employee_id
        if not (is_owner or actor.privileged or actor.superadmin):
            return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية تنفيذ هذا الإجراء على هذه المهمة."}
        if action in {"cancel", "reopen"} and not (actor.privileged or actor.superadmin):
            return {"ok": False, "status": "denied", "error": "هذا الإجراء متاح فقط لمديري تقنية المعلومات أو الإدارة."}
        action_ar = {"cancel": "إلغاء المهمة نهائياً", "reopen": "إعادة فتح المهمة", "reject": "رفض المهمة"}[action]
        return {
            "ok": False,
            "status": "needs_confirmation",
            "confirmation_action": {
                "tool": "update_task_status",
                "args": {"task_id": str(task.id), "action": action, "reason": reason},
                "action_label": f"تأكيد {action_ar}",
                "summary": f"سيتم تنفيذ «{action_ar}» على المهمة {ref} ({task.title}) وتحديث السجلات وإشعار الأطراف المعنية.",
            },
        }

    _emit(progress_cb, "update_task", "جارٍ تحديث حالة المهمة...", "running", action)
    try:
        outcome = wf.transition(db, task, actor, action, reason)
    except wf.WorkflowError as exc:
        if exc.http_status == 403:
            _emit(progress_cb, "update_task", "صلاحية غير كافية", "denied", exc.message)
            return {"ok": False, "status": "denied", "error": exc.message}
        _emit(progress_cb, "update_task", "تعذر تغيير الحالة", "failed", exc.message)
        return {"ok": False, "status": "error", "error": exc.message}

    log_audit(
        db=db,
        action="AI_AGENT_UPDATE_TASK_STATUS",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=current_user.id,
        company_id=target_cid,
        old_values={"status": outcome.previous_status},
        new_values={"status": task.status, "action": action, "reason": reason},
        ip_address=ip_address,
    )

    _emit(progress_cb, "update_task", "تم تحديث حالة المهمة", "completed", task.status)
    return {
        "ok": True,
        "status": "executed",
        "data": {
            "type": "task",
            "task_id": str(task.id),
            "reference": ref,
            "title": task.title,
            "previous_status": outcome.previous_status,
            "status": task.status,
            "stage_label": wf.STAGE_LABELS_AR.get(wf.stage_of(task.status), task.status),
            "assignee_name": task.assigned_to.full_name if task.assigned_to else None,
            "notification_summary": outcome.message,
        },
    }


# ── Tool 4: Send Employee Notification (In-App + Telegram Verified) ────────

def tool_send_employee_notification(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    confirmed: bool = False,
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    if not (
        _is_staff(current_user, target_cid, db)
        or has_module_permission(current_user, Module.TASKS, Action.ASSIGN, target_cid, db)
    ):
        return {
            "ok": False,
            "status": "denied",
            "error": "إرسال الإشعارات والتوجيهات المباشرة للموظفين متاح فقط للمديرين وفريق تقنية المعلومات.",
        }

    emp_name = clean_employee_query(args.get("assignee_name") or args.get("employee_name"))
    emp_id = args.get("employee_id")
    message_text = _safe_str(args.get("message"))
    title = _safe_str(args.get("title") or "تنبيه تشغيلي مباشر")
    priority = _normalize_priority(args.get("priority") or "Normal")
    ticket_num = _safe_str(args.get("ticket_number")) or None

    if not message_text:
        return {
            "ok": False,
            "status": "needs_clarification",
            "error": "يرجى كتابة نص الإشعار المراد إرساله.",
            "pending_action": {"tool": "send_employee_notification", "args": dict(args), "missing_field": "message"},
        }

    res_emp = tool_resolve_employee(
        db, current_user, target_cid, name=emp_name, employee_id=emp_id, progress_cb=progress_cb
    )
    if res_emp["status"] != "unique":
        return {
            "ok": False,
            "status": "needs_clarification" if res_emp["status"] != "denied" else "denied",
            "error": res_emp["error"],
            "candidates": res_emp.get("candidates", []),
            "pending_action": {"tool": "send_employee_notification", "args": dict(args), "missing_field": "assignee"},
        }

    emp_info = res_emp["employee"]
    emp = db.query(Employee).filter(
        Employee.id == uuid.UUID(emp_info["employee_id"]),
        Employee.company_id == target_cid,
    ).first()
    if not emp:
        return {"ok": False, "status": "error", "error": "الموظف غير موجود ضمن المنشأة."}

    # Resolve optional referenced ticket within company scope
    related_type = None
    related_id = None
    ticket_ref_label = None
    if ticket_num:
        digits = re.sub(r"\D", "", ticket_num)
        tk_q = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
        matched_tk = (
            tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%{ticket_num}%")).first()
            or (tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%-{digits.zfill(4)}")).first() if digits else None)
            or (tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%{digits}%")).first() if digits else None)
        )
        if matched_tk:
            related_type = "ticket"
            related_id = matched_tk.id
            ticket_ref_label = matched_tk.ticket_number
            title = f"{title} ({matched_tk.ticket_number})"

    if not confirmed:
        resolved_args = {
            "employee_id": str(emp.id),
            "assignee_name": emp.full_name,
            "title": title,
            "message": message_text,
            "ticket_number": ticket_ref_label or ticket_num,
            "priority": priority,
        }
        tg_hint = "عبر النظام و Telegram" if emp_info.get("telegram_linked") else "داخلي فقط (غير مرتبط بتيليجرام)"
        tck_note = f" • مرتبط بالتذكرة: {ticket_ref_label}" if ticket_ref_label else ""
        _emit(progress_cb, "confirm_notification", "بانتظار تأكيد إرسال الإشعار", "warning", emp.full_name)
        return {
            "ok": False,
            "status": "needs_confirmation",
            "confirmation_action": {
                "tool": "send_employee_notification",
                "args": resolved_args,
                "action_label": "تأكيد إرسال الإشعار",
                "summary": f"المستلم: {emp.full_name} ({tg_hint}){tck_note}\nالنص: «{message_text}»",
            },
        }

    _emit(progress_cb, "send_notification", "جارٍ إرسال الإشعار...", "running", emp.full_name)

    in_app_status = "NoUserAccount"
    recipient_user = emp.user
    if recipient_user:
        try:
            create_notification(
                db=db,
                recipient_user_id=recipient_user.id,
                company_id=target_cid,
                event_type="ai_direct_alert",
                title=title,
                message=message_text,
                related_record_type=related_type,
                related_record_id=related_id,
                priority="Normal",  # Handle Telegram delivery directly below for exact verified reporting
            )
            in_app_status = "Sent"
        except Exception as exc:
            in_app_status = f"Failed ({exc})"

    # Direct Telegram delivery if employee link verified + bot token configured
    tlink = (
        db.query(TelegramUserLink)
        .filter(
            TelegramUserLink.company_id == target_cid,
            TelegramUserLink.employee_id == emp.id,
            TelegramUserLink.is_verified == True,
        )
        .first()
    )
    telegram_status = "Skipped (Unlinked)"
    telegram_error = None
    telegram_msg_id = None

    if tlink and tlink.telegram_chat_id:
        if not tlink.notifications_enabled:
            telegram_status = "Muted"
            telegram_error = "الموظف عطّل إشعارات البوت في تفضيلاته"
        else:
            is_cfg, bot_token, _ = get_telegram_config(db, target_cid)
            if not is_cfg or not bot_token:
                telegram_status = "BotNotConfigured"
                telegram_error = "بوت Telegram غير مهيأ لهذه المنشأة"
            else:
                tg_html = f"🔔 <b>{title}</b>\n\n{message_text}\n\n👤 من: {current_user.username}"
                send_res = send_telegram_direct_message(bot_token, tlink.telegram_chat_id, tg_html)
                if send_res.get("success"):
                    telegram_status = "Sent"
                    telegram_msg_id = send_res.get("message_id")
                else:
                    telegram_status = "Failed"
                    telegram_error = send_res.get("message")

                db.add(
                    TelegramActionLog(
                        company_id=target_cid,
                        telegram_user_id=tlink.telegram_user_id or "direct_alert",
                        telegram_chat_id=tlink.telegram_chat_id,
                        action="ai_agent_direct_notification",
                        status="Success" if telegram_status == "Sent" else "Failed",
                        details={"sender": current_user.username, "ticket": ticket_ref_label, "message_id": telegram_msg_id},
                        error_message=telegram_error,
                        ip_address=ip_address,
                    )
                )
                db.commit()

    overall_status = "executed" if (telegram_status == "Sent" or (in_app_status == "Sent" and telegram_status == "Muted")) else "partial_failure"
    if telegram_status == "Failed" or (in_app_status != "Sent" and telegram_status != "Sent"):
        overall_status = "partial_failure"

    if telegram_status == "Sent":
        _emit(progress_cb, "send_notification", "تم إرسال الإشعار", "completed", "Telegram + النظام")
    elif in_app_status == "Sent":
        _emit(progress_cb, "send_notification", "تم الإشعار داخل النظام مع تنبيه Telegram", "warning", telegram_error or telegram_status)
    else:
        _emit(progress_cb, "send_notification", "تعذر إيصال الإشعار", "failed", telegram_error or telegram_status)

    log_audit(
        db=db,
        action="AI_AGENT_NOTIFY_EMPLOYEE",
        resource_type="Employee",
        resource_id=str(emp.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={
            "employee_name": emp.full_name,
            "ticket_ref": ticket_ref_label,
            "in_app_status": in_app_status,
            "telegram_status": telegram_status,
        },
        ip_address=ip_address,
    )

    return {
        "ok": in_app_status == "Sent" or telegram_status == "Sent",
        "status": overall_status,
        "data": {
            "type": "notification",
            "title": title,
            "message": message_text,
            "assignee_name": emp.full_name,
            "ticket_number": ticket_ref_label,
            "in_app_status": in_app_status,
            "telegram_status": telegram_status,
            "telegram_message_id": telegram_msg_id,
            "telegram_error": telegram_error,
            "notification_summary": (
                f"الداخلي: {in_app_status} • Telegram: {telegram_status}"
                + (f" ({telegram_error})" if telegram_error else "")
            ),
        },
    }


# ── Tool 5: Create & Auto-Categorize Ticket ─────────────────────────────────

def tool_create_ticket(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    if not has_module_permission(current_user, Module.TICKETS, Action.CREATE, target_cid, db):
        return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية إنشاء تذاكر الدعم الفني."}

    issue_title = (args.get("issue_title") or args.get("title") or "").strip()
    if not issue_title:
        return {"ok": False, "status": "needs_clarification", "error": "يرجى ذكر عنوان المشكلة أو التذكرة."}

    issue_desc = (args.get("issue_description") or args.get("description") or issue_title).strip()
    _emit(progress_cb, "categorize_ticket", "جارٍ تصنيف التذكرة ذكياً...", "running", issue_title)

    ai_eval = gemini_service.analyze_ticket_ai(title=issue_title, description=issue_desc)
    category = _normalize_ticket_category(args.get("category") or ai_eval.get("suggested_category"))
    priority = _normalize_priority(args.get("priority") or ai_eval.get("suggested_priority"))

    requester_id = current_user.employee_id
    if args.get("requester_name"):
        res_emp = tool_resolve_employee(db, current_user, target_cid, name=args["requester_name"], progress_cb=progress_cb)
        if res_emp["status"] == "unique":
            requester_id = uuid.UUID(res_emp["employee"]["employee_id"])
        elif res_emp["status"] == "ambiguous":
            return {
                "ok": False,
                "status": "needs_clarification",
                "error": res_emp["error"],
                "candidates": res_emp["candidates"],
                "pending_action": {"tool": "create_ticket", "args": args},
            }

    from app.api.v1.endpoints.tickets import generate_ticket_number

    _emit(progress_cb, "create_ticket", "جارٍ فتح التذكرة...", "running")
    t_number = generate_ticket_number(target_cid, db)
    ticket = HelpDeskTicket(
        company_id=target_cid,
        ticket_number=t_number,
        issue_title=issue_title,
        issue_description=issue_desc,
        requester_id=requester_id,
        priority=priority,
        status="Open",
        category=category,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    log_audit(
        db=db,
        action="AI_AGENT_CREATE_TICKET",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"ticket_number": ticket.ticket_number, "category": category, "priority": priority},
        ip_address=ip_address,
    )

    _emit(progress_cb, "create_ticket", "تم فتح التذكرة", "completed", ticket.ticket_number)
    return {
        "ok": True,
        "status": "executed",
        "data": {
            "type": "ticket",
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "title": ticket.issue_title,
            "category": ticket.category,
            "priority": ticket.priority,
            "status": ticket.status,
            "ai_summary": ai_eval.get("summary"),
        },
    }


# ── Tool 6: Convert Help Desk Ticket to Task ────────────────────────────────

def tool_convert_ticket_to_task(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    confirmed: bool = False,
    ip_address: str = "ai_agent",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    if not (
        _is_staff(current_user, target_cid, db)
        and has_module_permission(current_user, Module.TASKS, Action.CREATE, target_cid, db)
    ):
        return {"ok": False, "status": "denied", "error": "تحويل التذاكر إلى مهام متاح فقط للمديرين وفريق تقنية المعلومات."}

    ticket_query = _safe_str(args.get("ticket_number") or args.get("ticket_id"))
    _emit(progress_cb, "find_ticket", "جارٍ البحث عن التذكرة...", "running", ticket_query or "التذكرة")

    ticket: Optional[HelpDeskTicket] = None
    if ticket_query:
        try:
            tk_uuid = uuid.UUID(ticket_query)
            ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == tk_uuid, HelpDeskTicket.company_id == target_cid).first()
        except ValueError:
            digits = re.sub(r"\D", "", ticket_query)
            tk_q = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
            ticket = (
                tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%{ticket_query}%")).first()
                or (tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%-{digits.zfill(4)}")).first() if digits else None)
                or (tk_q.filter(HelpDeskTicket.ticket_number.ilike(f"%{digits}%")).first() if digits else None)
            )
    elif args.get("selected_ticket_id"):
        try:
            ticket = db.query(HelpDeskTicket).filter(
                HelpDeskTicket.id == uuid.UUID(str(args["selected_ticket_id"])),
                HelpDeskTicket.company_id == target_cid,
            ).first()
        except ValueError:
            ticket = None
    else:
        open_recent = (
            db.query(HelpDeskTicket)
            .filter(
                HelpDeskTicket.company_id == target_cid,
                HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
            )
            .order_by(HelpDeskTicket.created_at.desc())
            .limit(3)
            .all()
        )
        if len(open_recent) == 1:
            ticket = open_recent[0]
        elif len(open_recent) > 1:
            return {
                "ok": False,
                "status": "needs_clarification",
                "error": "يرجى تحديد رقم التذكرة المراد تحويلها إلى مهمة (مثال: TCK-2026-0001 أو رقم التذكرة).",
                "ticket_candidates": [
                    {"ticket_id": str(x.id), "ticket_number": x.ticket_number, "title": x.issue_title, "status": x.status}
                    for x in open_recent
                ],
                "pending_action": {"tool": "convert_ticket_to_task", "args": dict(args), "missing_field": "ticket"},
            }

    if not ticket:
        _emit(progress_cb, "find_ticket", "التذكرة غير موجودة", "failed")
        return {"ok": False, "status": "error", "error": "لم يتم العثور على التذكرة المطلوبة ضمن المنشأة."}

    _emit(progress_cb, "find_ticket", "تم التحقق من التذكرة", "completed", ticket.ticket_number)

    assignee_id = args.get("assignee_id") or args.get("employee_id")
    assignee_name = clean_employee_query(args.get("assignee_name"))

    if not assignee_id and not assignee_name:
        if ticket.assigned_technician and ticket.assigned_technician.employee_id:
            assignee_id = str(ticket.assigned_technician.employee_id)

    task_args = {
        "title": f"مهمة من تذكرة {ticket.ticket_number}: {ticket.issue_title}",
        "description": f"التذكرة الأصلية: {ticket.ticket_number}\n\n{ticket.issue_description}",
        "priority": ticket.priority,
        "assignee_id": assignee_id,
        "assignee_name": assignee_name,
        "related_ticket_id": str(ticket.id),
        "notify_employee": True,
        "explicit_notify": bool(assignee_id or assignee_name),
    }
    return tool_create_task(
        db, current_user, target_cid, task_args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb
    )


# ── Tool 7: Query Tasks, Overdue, Tickets, Assets & Summaries ───────────────

def tool_query_operations(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    args: Dict[str, Any],
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    qtype = (_safe_str(args.get("query_type")) or "operational_summary").lower()
    search = _safe_str(args.get("search")) or None
    filter_mode = (_safe_str(args.get("filter_mode")) or "").lower() or None
    assignee_name = clean_employee_query(args.get("assignee_name")) or None
    assignee_id_raw = args.get("assignee_id")
    raw_status = _safe_str(args.get("status")) or None
    norm_status = _normalize_task_filter_status(raw_status)
    if norm_status == "overdue":
        qtype = "overdue_tasks"
    limit = _safe_int(args.get("limit"), default=25, min_v=1, max_v=50)
    today = date.today()
    staff = _is_staff(current_user, target_cid, db)

    if qtype in {"overdue", "overdue_tasks", "tasks"}:
        if not has_module_permission(current_user, Module.TASKS, Action.VIEW, target_cid, db):
            return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية عرض المهام."}

        resolved_assignee_name = None
        target_emp_id = None
        if assignee_id_raw or assignee_name:
            if not staff and assignee_name:
                return {"ok": False, "status": "denied", "error": "صلاحياتك تتيح عرض مهامك الشخصية فقط."}
            res_emp = tool_resolve_employee(
                db, current_user, target_cid, name=assignee_name or "", employee_id=assignee_id_raw, progress_cb=progress_cb
            )
            if res_emp["status"] != "unique":
                return {
                    "ok": False,
                    "status": "needs_clarification" if res_emp["status"] != "denied" else "denied",
                    "error": res_emp["error"],
                    "candidates": res_emp.get("candidates", []),
                    "pending_action": {"tool": "query_operations", "args": dict(args), "missing_field": "assignee"},
                }
            target_emp_id = uuid.UUID(res_emp["employee"]["employee_id"])
            resolved_assignee_name = res_emp["employee"]["full_name"]

        _emit(progress_cb, "query_tasks", "جارٍ مراجعة سجل المهام...", "running")
        query = (
            db.query(Task)
            .options(joinedload(Task.assigned_to))
            .filter(Task.company_id == target_cid)
        )
        scope_note = None
        if target_emp_id:
            query = query.filter(Task.assigned_to_id == target_emp_id)
        elif not staff or filter_mode == "my":
            if current_user.employee_id:
                query = query.filter(Task.assigned_to_id == current_user.employee_id)
            else:
                query = query.filter(Task.assigned_by_id == current_user.id)
            if not staff and filter_mode == "team":
                scope_note = "تعرض المهام ضمن صلاحيات حسابك الشخصي"

        filter_parts = []
        if qtype in {"overdue", "overdue_tasks"}:
            query = query.filter(wf.stage_condition("overdue", today))
            filter_parts.append("المتأخرة")
        elif norm_status:
            query = query.filter(wf.status_condition(norm_status))
            filter_parts.append(wf.STAGE_LABELS_AR.get(norm_status, norm_status))
        elif raw_status and raw_status in wf.STATUS_STAGE:
            query = query.filter(wf.status_condition(raw_status))
            filter_parts.append(raw_status)
        if resolved_assignee_name:
            filter_parts.append(f"الموظف: {resolved_assignee_name}")
        elif filter_mode == "my":
            filter_parts.append("مهامي")
        elif filter_mode == "team":
            filter_parts.append("الفريق")

        if search:
            cond = wf.search_condition(db, search)
            if cond is not None:
                query = query.filter(cond)
            filter_parts.append(f"بحث: {search}")

        total_count = query.count()
        order_clauses = (
            [Task.due_date.asc(), Task.created_at.desc()]
            if qtype in {"overdue", "overdue_tasks"}
            else [Task.created_at.desc()]
        )
        items = query.order_by(*order_clauses).limit(limit).all()

        rows = []
        for t in items:
            due_d = _as_date(t.due_date)
            days_late = (today - due_d).days if (due_d and due_d < today) else 0
            overdue_flag = bool(due_d and wf.stage_of(t.status) in wf.ACTIVE_STAGES + ("unknown",) and due_d < today)
            rows.append({
                "task_id": str(t.id),
                "reference": wf.task_ref(t),
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "due_date": due_d.isoformat() if due_d else None,
                "days_overdue": days_late,
                "assignee_name": t.assigned_to.full_name if t.assigned_to else "غير مسند",
                "is_overdue": overdue_flag,
            })

        _emit(progress_cb, "query_tasks", "تم استرجاع بيانات المهام", "completed", f"{len(rows)} من {total_count}")
        suggestions = []
        if qtype in {"overdue", "overdue_tasks"} and rows and staff:
            first = rows[0]
            if first["assignee_name"] != "غير مسند":
                suggestions.append(f"أرسل إشعارًا لـ {first['assignee_name']} لمتابعة المهمة المتأخرة {first['reference']}")
        return {
            "ok": True,
            "status": "executed",
            "data": {
                "type": "task_list",
                "query_type": qtype,
                "count": len(rows),
                "total_count": total_count,
                "truncated": total_count > len(rows),
                "filter_label": " • ".join(filter_parts) if filter_parts else "كافة المهام",
                "scope_note": scope_note,
                "items": rows,
            },
            "suggested_followups": suggestions,
        }

    if qtype == "tickets":
        if not has_module_permission(current_user, Module.TICKETS, Action.VIEW, target_cid, db):
            return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية عرض تذاكر الدعم."}
        _emit(progress_cb, "query_tickets", "جارٍ البحث في تذاكر الدعم الفني...", "running")
        query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
        if not staff and current_user.employee_id:
            query = query.filter(HelpDeskTicket.requester_id == current_user.employee_id)
        if search:
            s = f"%{search}%"
            query = query.filter(
                HelpDeskTicket.ticket_number.ilike(s)
                | HelpDeskTicket.issue_title.ilike(s)
                | HelpDeskTicket.issue_description.ilike(s)
            )
        total_count = query.count()
        items = query.order_by(HelpDeskTicket.created_at.desc()).limit(limit).all()
        rows = [
            {
                "ticket_id": str(tk.id),
                "ticket_number": tk.ticket_number,
                "title": tk.issue_title,
                "category": tk.category,
                "priority": tk.priority,
                "status": tk.status,
                "requester_name": tk.requester.full_name if tk.requester else None,
            }
            for tk in items
        ]
        _emit(progress_cb, "query_tickets", "تم استرجاع التذاكر", "completed", f"{len(rows)} من {total_count}")
        return {
            "ok": True,
            "status": "executed",
            "data": {
                "type": "ticket_list",
                "count": len(rows),
                "total_count": total_count,
                "truncated": total_count > len(rows),
                "items": rows,
            },
        }

    if qtype == "assets":
        if not has_module_permission(current_user, Module.ASSETS, Action.VIEW, target_cid, db):
            return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية عرض الأصول التقنية."}
        _emit(progress_cb, "query_assets", "جارٍ البحث في سجل الأصول التقنية...", "running")
        query = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid)
        if search:
            s = f"%{search}%"
            query = query.filter(
                TechnicalAsset.asset_name.ilike(s)
                | TechnicalAsset.asset_code.ilike(s)
                | TechnicalAsset.serial_number.ilike(s)
                | TechnicalAsset.asset_type.ilike(s)
            )
        total_count = query.count()
        items = query.order_by(TechnicalAsset.created_at.desc()).limit(limit).all()
        rows = [
            {
                "asset_id": str(a.id),
                "asset_code": a.asset_code,
                "asset_name": a.asset_name,
                "asset_type": a.asset_type,
                "status": a.status,
                "assigned_to": a.assigned_employee.full_name if a.assigned_employee else None,
            }
            for a in items
        ]
        _emit(progress_cb, "query_assets", "تم استرجاع الأصول", "completed", f"{len(rows)} من {total_count}")
        return {
            "ok": True,
            "status": "executed",
            "data": {
                "type": "asset_list",
                "count": len(rows),
                "total_count": total_count,
                "truncated": total_count > len(rows),
                "items": rows,
            },
        }

    # Default: Operational Summary
    if not has_module_permission(current_user, Module.DASHBOARD, Action.VIEW, target_cid, db):
        return {"ok": False, "status": "denied", "error": "ليس لديك صلاحية عرض الملخص التشغيلي."}

    _emit(progress_cb, "query_summary", "جارٍ تجميع المؤشرات التشغيلية...", "running")
    task_scope = db.query(Task).filter(Task.company_id == target_cid)
    if not staff and current_user.employee_id:
        task_scope = task_scope.filter(Task.assigned_to_id == current_user.employee_id)

    open_tasks = task_scope.filter(wf.stage_condition("active")).count()
    overdue_tasks = task_scope.filter(wf.stage_condition("overdue", today)).count()
    completed_tasks = task_scope.filter(wf.stage_condition("completed")).count()

    ticket_scope = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
    if not staff and current_user.employee_id:
        ticket_scope = ticket_scope.filter(HelpDeskTicket.requester_id == current_user.employee_id)
    open_tickets = ticket_scope.filter(HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"])).count()
    urgent_tickets = ticket_scope.filter(
        HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"]),
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()

    total_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid).count() if staff else 0
    pending_maint = db.query(MaintenanceRecord).filter(
        MaintenanceRecord.company_id == target_cid,
        MaintenanceRecord.status.in_(["Open", "Pending Approval", "In Progress"]),
    ).count() if staff else 0

    _emit(progress_cb, "query_summary", "تم إعداد الملخص التشغيلي", "completed")
    suggestions = []
    if overdue_tasks > 0:
        suggestions.append("اعرض المهام المتأخرة الخاصة بفريقي")
    if urgent_tickets > 0:
        suggestions.append("اعرض التذاكر الحرجة المفتوحة")
    return {
        "ok": True,
        "status": "executed",
        "data": {
            "type": "summary",
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "completed_tasks": completed_tasks,
            "open_tickets": open_tickets,
            "urgent_tickets": urgent_tickets,
            "total_assets": total_assets,
            "pending_maintenance": pending_maint,
        },
        "suggested_followups": suggestions,
    }


TOOL_REGISTRY = {
    "resolve_employee": tool_resolve_employee,
    "create_task": tool_create_task,
    "create_tasks_batch": tool_create_tasks_batch,
    "update_task_status": tool_update_task_status,
    "send_employee_notification": tool_send_employee_notification,
    "create_ticket": tool_create_ticket,
    "convert_ticket_to_task": tool_convert_ticket_to_task,
    "query_operations": tool_query_operations,
}
