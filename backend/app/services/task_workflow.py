"""Single authoritative task workflow shared by Telegram, the Dashboard API and workers.

* Stored ``Task.status`` values are never rewritten. Legacy values are mapped onto
  canonical *stages* (new / in_progress / waiting / completed / rejected / cancelled).
* "Overdue" is not a status: it is derived from ``due_date`` for non-terminal tasks.
* Every state change goes through :func:`transition` (ownership, valid source stage,
  idempotency, history comment, audit log, notifications after the commit).
"""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, cast, func, or_, String
from sqlalchemy.orm import Session

from app.models.task import Task, TaskComment

logger = logging.getLogger(__name__)

# ── Canonical stages (legacy-safe mapping, nothing is rewritten in the DB) ──
STAGE_STATUSES: Dict[str, List[str]] = {
    "new": ["Draft", "Assigned", "To Do", "Pending", "Pending Acceptance"],
    "in_progress": ["Accepted", "In Progress", "Rework Required", "Blocked", "On Hold", "Submitted for Review"],
    "waiting": ["Waiting for Response", "Waiting for Clarification"],
    "completed": ["Completed", "Done", "Approved / Completed"],
    "rejected": ["Rejected"],
    "cancelled": ["Cancelled"],
}
STATUS_STAGE = {s: stage for stage, items in STAGE_STATUSES.items() for s in items}
TERMINAL_STAGES = ("completed", "rejected", "cancelled")
TERMINAL_STATUSES = [s for st in TERMINAL_STAGES for s in STAGE_STATUSES[st]]
ACTIVE_STAGES = ("new", "in_progress", "waiting")
STAGE_LABELS_AR = {
    "new": "بانتظار القبول", "in_progress": "قيد التنفيذ", "waiting": "بانتظار التوضيح",
    "completed": "مكتملة", "rejected": "مرفوضة", "cancelled": "ملغاة", "unknown": "غير معروفة",
}
STAGE_EMOJI = {"new": "📨", "in_progress": "🔵", "waiting": "🟡", "completed": "🟢",
               "rejected": "⛔", "cancelled": "⚫", "unknown": "▫️"}
# Stored value used for the "Waiting for Clarification" stage (existing legacy value).
STATUS_WAITING = "Waiting for Response"
FILTER_KEYS = set(STAGE_STATUSES) | {"active", "overdue"}

REJECTION_REASONS = {
    "1": "عبء عمل مرتفع", "2": "نقص الصلاحيات أو المعدات",
    "3": "خارج التخصص الفني", "4": "اعتذار عن استلام المهمة",
}


def stage_of(status: Optional[str]) -> str:
    return STATUS_STAGE.get((status or "").strip(), "unknown")


def task_ref(task_or_id) -> str:
    raw = str(getattr(task_or_id, "id", task_or_id)).replace("-", "")
    return f"TASK-{raw[:8].upper()}"


def is_overdue(task: Task, today: Optional[date] = None) -> bool:
    return bool(task.due_date and stage_of(task.status) in ACTIVE_STAGES + ("unknown",)
                and task.due_date < (today or date.today()))


# ── Query helpers (one definition of every filter, used by API + Telegram) ──
def stage_condition(key: str, today: Optional[date] = None):
    if key == "active":
        return Task.status.notin_(TERMINAL_STATUSES)
    if key == "overdue":
        return and_(Task.due_date != None, Task.due_date < (today or date.today()),  # noqa: E711
                    Task.status.notin_(TERMINAL_STATUSES))
    return Task.status.in_(STAGE_STATUSES[key])


def status_condition(value: str):
    """Filter value may be a stage key (new, completed, active, overdue…) or an exact stored status."""
    value = (value or "").strip()
    if value in FILTER_KEYS:
        return stage_condition(value)
    return Task.status == value


def _normalized(db: Session, column):
    from app.services.task_assignment import normalize_name, DIACRITICS  # local import avoids cycles
    if db.get_bind().dialect.name == "sqlite":
        return func.normalize_employee_name(func.coalesce(column, ""))
    return func.lower(func.translate(func.coalesce(column, ""), "أإآٱةى" + DIACRITICS, "ااااهي"))


def search_condition(db: Session, text: str):
    """Match task reference/UUID prefix, title or description (Arabic-normalized, all tokens must match)."""
    from app.services.task_assignment import normalize_name
    text = (text or "").strip()[:160]
    if not text:
        return None
    clauses = []
    for token in normalize_name(re.sub(r"^#?TASK-", "", text, flags=re.I)).split():
        like = token.replace("%", "").replace("_", "")
        id_hex = func.replace(cast(Task.id, String), "-", "")
        clauses.append(or_(
            _normalized(db, Task.title).contains(like, autoescape=True),
            _normalized(db, Task.description).contains(like, autoescape=True),
            func.lower(id_hex).contains(re.sub(r"[^0-9a-f]", "", like) or "\0", autoescape=True),
        ))
    return and_(*clauses) if clauses else None


# ── Actor + result types ────────────────────────────────────────────────
@dataclass
class Actor:
    user_id: Optional[uuid.UUID]
    employee_id: Optional[uuid.UUID]
    name: str
    company_id: uuid.UUID
    privileged: bool = False
    superadmin: bool = False
    source: str = "dashboard"  # dashboard | telegram | system


class WorkflowError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


@dataclass
class Outcome:
    changed: bool
    task: Task
    previous_status: str
    message: str


# action → (allowed source stages, target status, needs manager?)
ACTIONS = {
    "accept": ({"new"}, "Accepted", False),
    "start": ({"new", "in_progress", "waiting"}, "In Progress", False),
    "reject": ({"new", "in_progress", "waiting"}, "Rejected", False),
    "complete": ({"new", "in_progress", "waiting"}, "Completed", False),
    "clarify": ({"new", "in_progress", "waiting"}, STATUS_WAITING, False),
    "reopen": ({"completed", "rejected", "cancelled"}, "Assigned", True),
    "cancel": ({"new", "in_progress", "waiting", "rejected"}, "Cancelled", True),
}
_NOOP_IF_ALREADY = {  # idempotent re-delivery of the same callback
    "accept": {"Accepted", "In Progress"}, "start": {"In Progress"},
    "reject": {"Rejected"}, "complete": {"Completed", "Done", "Approved / Completed"},
    "cancel": {"Cancelled"}, "reopen": {"Assigned"},
}
_NOOP_MESSAGES = {
    "accept": "ℹ️ المهمة مقبولة وقيد التنفيذ بالفعل مسبقاً.",
    "start": "ℹ️ المهمة قيد التنفيذ بالفعل.",
    "complete": "🏁 المهمة مكتملة ومغلقة بالفعل مسبقاً.",
    "reject": "ℹ️ تم تسجيل رفض هذه المهمة مسبقاً.",
}
_EVENT = {"accept": "task.accepted", "start": "task.started", "reject": "task.rejected",
          "complete": "task.completed", "clarify": "task.clarification_requested",
          "reopen": "task.reassigned", "cancel": "task.cancelled"}
_AUDIT = {"accept": "TASK_ACCEPT", "start": "TASK_STARTED", "reject": "TASK_REJECTED",
          "complete": "TASK_COMPLETED", "clarify": "TASK_CLARIFICATION_REQUESTED",
          "reopen": "TASK_REOPENED", "cancel": "TASK_CANCELLED"}


def _history_text(action: str, actor: Actor, reason: Optional[str]) -> str:
    via = "عبر Telegram" if actor.source == "telegram" else "عبر لوحة التحكم"
    return {
        "accept": f"✅ قبل {actor.name} المهمة {via}.",
        "start": f"🚀 بدأ {actor.name} العمل على المهمة {via}.",
        "reject": f"❌ رفض {actor.name} المهمة {via}. السبب: {reason}",
        "complete": f"🏁 أنهى {actor.name} المهمة {via}.",
        "clarify": f"❓ طلب {actor.name} توضيحاً {via}: {reason}",
        "reopen": f"♻️ أعاد {actor.name} فتح المهمة {via}.",
        "cancel": f"🚫 ألغى {actor.name} المهمة {via}.",
    }[action]


def transition(db: Session, task: Task, actor: Actor, action: str, reason: Optional[str] = None) -> Outcome:
    """Apply one workflow action atomically. Raises WorkflowError for invalid/unauthorized requests."""
    if action not in ACTIONS:
        raise WorkflowError("unknown_action", "إجراء غير مدعوم.")
    if not actor.superadmin and task.company_id != actor.company_id:
        raise WorkflowError("forbidden", "غير مصرح لك بالوصول لمهام منشأة أخرى.", 403)
    allowed_stages, target, manager_only = ACTIONS[action]
    is_assignee = bool(actor.employee_id and task.assigned_to_id == actor.employee_id)
    if manager_only and not actor.privileged:
        raise WorkflowError("forbidden", "هذا الإجراء يتطلب صلاحية إدارية.", 403)
    if not (is_assignee or actor.privileged):
        raise WorkflowError("forbidden", "هذه المهمة مسندة إلى موظف آخر وليس لديك صلاحية تعديلها.", 403)

    previous = task.status
    stage = stage_of(previous)
    if previous in _NOOP_IF_ALREADY.get(action, ()):
        return Outcome(False, task, previous, _NOOP_MESSAGES.get(action, "ℹ️ تم تنفيذ هذا الإجراء مسبقاً ولا حاجة لتكراره."))
    if previous == "Submitted for Review" and action == "complete" and not actor.privileged:
        raise WorkflowError("awaiting_review", "ℹ️ المهمة مرفوعة للمراجعة وبانتظار اعتماد الإدارة.")
    if stage not in allowed_stages:
        raise WorkflowError("invalid_transition",
                            f"⚠️ لا يمكن تنفيذ هذا الإجراء على مهمة بحالة «{STAGE_LABELS_AR.get(stage, previous)}».")
    reason = (reason or "").strip()[:1000] or None
    if action in ("reject", "clarify") and not reason:
        raise WorkflowError("reason_required", "يلزم إدخال السبب أو نص السؤال.")

    now = datetime.utcnow()
    task.status = target
    if action in ("accept", "start") and not task.acknowledged_at:
        task.acknowledged_at = now
    if action == "accept":
        task.accepted_at = now
    elif action == "complete":
        task.completed_at, task.is_blocked = now, False
        task.reviewer_id = actor.user_id if actor.privileged else task.reviewer_id
    elif action == "reject":
        task.blocker_reason = f"سبب الرفض: {reason}"
        task.review_notes = f"سبب الرفض: {reason}"
    elif action == "reopen":
        task.completed_at = None
        task.blocker_reason = None
    if action != "complete" and previous in ("Completed",):
        task.completed_at = None
    if actor.user_id:
        db.add(TaskComment(task_id=task.id, user_id=actor.user_id, content=_history_text(action, actor, reason)))
    db.commit()  # state is durable before anything is confirmed or notified
    db.refresh(task)

    _after_commit(db, task, actor, action, reason, previous)
    return Outcome(True, task, previous, _confirmation(action, task, reason))


def _confirmation(action: str, task: Task, reason: Optional[str]) -> str:
    ref = task_ref(task)
    return {
        "accept": f"✅ تم قبول المهمة {ref}. حالتها الآن: قيد التنفيذ.",
        "start": f"🚀 تم بدء العمل على المهمة {ref}.",
        "reject": f"❌ تم تسجيل رفض المهمة {ref}.\nالسبب: {reason}",
        "complete": f"🏁 تم إنهاء المهمة {ref} وحفظ حالتها «مكتملة».",
        "clarify": f"❓ تم إرسال طلب التوضيح للمشرف على المهمة {ref}. حالتها: بانتظار التوضيح.",
        "reopen": f"♻️ أُعيد فتح المهمة {ref}.",
        "cancel": f"🚫 تم إلغاء المهمة {ref}.",
    }[action]


def _after_commit(db: Session, task: Task, actor: Actor, action: str, reason: Optional[str], previous: str) -> None:
    """Audit + notifications. Failures here must never undo or hide the committed state change."""
    try:
        from app.services.audit_service import log_audit
        log_audit(db=db, action=_AUDIT[action], resource_type="Task", resource_id=str(task.id),
                  user_id=actor.user_id, company_id=task.company_id,
                  new_values={"status": task.status, "previous_status": previous, "reason": reason,
                              "source": actor.source, "employee_id": str(actor.employee_id) if actor.employee_id else None})
    except Exception:  # pragma: no cover
        logger.exception("task audit failed")
        db.rollback()
    try:
        notify_creator(db, task, actor, action, reason)
        db.commit()
    except Exception:  # pragma: no cover
        logger.exception("task notification failed")
        db.rollback()


def notify_creator(db: Session, task: Task, actor: Actor, action: str, reason: Optional[str]) -> None:
    """In-app + Telegram notification to the task creator (never to the acting user)."""
    if action in ("start",) or not task.assigned_by_id or task.assigned_by_id == actor.user_id:
        return
    from app.services.notification_service import create_notification
    from app.services.telegram_service import enqueue_task_notification
    from app.models.user import User
    titles = {"accept": "تم قبول المهمة", "reject": "تم رفض المهمة", "complete": "اكتملت المهمة",
              "clarify": "طلب توضيح على مهمة", "cancel": "أُلغيت المهمة", "reopen": "أُعيد فتح المهمة"}
    detail = f" ({reason})" if reason else ""
    create_notification(db=db, recipient_user_id=task.assigned_by_id, company_id=task.company_id,
                        event_type=_EVENT[action].replace(".", "_"), title=titles[action],
                        message=f"{actor.name}: {titles[action]} — {task.title}{detail}",
                        related_record_type="task", related_record_id=task.id)
    creator = db.query(User).filter(User.id == task.assigned_by_id).first()
    if creator and creator.employee_id and creator.employee_id != task.assigned_to_id:
        enqueue_task_notification(db, task, _EVENT[action], target_employee_id=creator.employee_id,
                                  extra_payload={"actor": actor.name, "reason": reason},
                                  dedupe_key=f"{action}:{task.id}:{task.status}:{creator.employee_id}:{task.updated_at}")


# ── Telegram keyboards: only actions valid for the current status ───────
def task_keyboard(task: Task, *, can_act: bool, can_manage: bool = False, back: str = "cmd:my_tasks") -> Dict[str, Any]:
    tid, stage, rows = str(task.id), stage_of(task.status), []
    btn = lambda text, data: {"text": text, "callback_data": data}  # noqa: E731
    if can_act:
        if stage == "new":
            rows += [[btn("✅ قبول المهمة | Accept Task", f"act:accept:{tid}"), btn("❌ رفض المهمة | Reject Task", f"act:reject:{tid}")],
                     [btn("☑️ إنهاء المهمة | Complete Task", f"act:done:{tid}"), btn("📨 تأكيد الاستلام", f"act:ack:{tid}")],
                     [btn("❓ طلب توضيح | Clarify", f"act:clarify:{tid}"), btn("📋 تفاصيل", f"act:info:{tid}")]]
        elif stage == "in_progress" and task.status != "Submitted for Review":
            rows += [[btn("☑️ إنهاء المهمة | Complete Task", f"act:done:{tid}")],
                     [btn("❓ طلب توضيح | Clarify", f"act:clarify:{tid}"), btn("❌ رفض المهمة | Reject Task", f"act:reject:{tid}")]]
        elif stage == "waiting":
            rows += [[btn("▶️ استئناف العمل", f"act:start:{tid}"), btn("☑️ إنهاء المهمة | Complete Task", f"act:done:{tid}")]]
    if can_manage and task.status == "Submitted for Review":
        rows.append([btn("✅ اعتماد", f"act:approve:{tid}"), btn("🔄 إعادة عمل", f"act:rework:{tid}")])
    if can_manage and stage in TERMINAL_STAGES:
        rows.append([btn("♻️ إعادة فتح", f"act:reopen:{tid}")])
    rows.append([btn("🔙 مهامي", back), btn("🏠 الرئيسية", "cmd:main_menu")])
    return {"inline_keyboard": rows}


# ── Pending free-text actions (clarification question / custom rejection reason) ──
PENDING_KEY = "_pending_action"
PENDING_TTL_SECONDS = 600


def set_pending(db: Session, link, kind: str, task_id: uuid.UUID) -> None:
    prefs = dict(link.notification_preferences or {})
    prefs[PENDING_KEY] = {"kind": kind, "task_id": str(task_id), "at": datetime.utcnow().isoformat()}
    link.notification_preferences = prefs  # reassign so the JSON change is persisted
    db.commit()


def pop_pending(db: Session, link) -> Optional[Dict[str, str]]:
    prefs = dict(link.notification_preferences or {})
    pending = prefs.pop(PENDING_KEY, None)
    if pending is None:
        return None
    link.notification_preferences = prefs
    db.commit()
    try:
        age = (datetime.utcnow() - datetime.fromisoformat(pending["at"])).total_seconds()
    except Exception:
        return None
    return pending if age <= PENDING_TTL_SECONDS else None


def has_pending(link) -> bool:
    return PENDING_KEY in (link.notification_preferences or {}) if link else False
