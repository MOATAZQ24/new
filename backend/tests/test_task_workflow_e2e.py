"""End-to-end workflow regression: Dashboard API functions + Telegram callbacks against the real database.

Covers the P0 defects: Telegram completion must persist and be visible to the Dashboard list, filters,
search and KPIs; Telegram "My Tasks" must separate active from completed tasks.
Run: backend\\.venv\\Scripts\\python.exe backend/tests/test_task_workflow_e2e.py
"""
import os
import sys
import uuid
from datetime import date, timedelta

_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND = os.path.abspath(os.path.join(_HERE, ".."))
for p in (_HERE, _BACKEND):
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy import func

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User
from app.models.task import Task, TaskComment
from app.models.telegram import TelegramUserLink, NotificationOutbox
from app.models.audit import AuditLog
from app.api.v1.endpoints.tasks import create_task, list_tasks, task_summary
from app.schemas.task import TaskCreate
from app.services.telegram_service import execute_bot_action, execute_pending_text
from app.services import task_workflow as wf

TG_A, TG_B = "999001", "999002"
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  {'PASS' if condition else 'FAIL'}  {name} {detail if not condition else ''}")
    assert condition, f"{name} {detail}"


def tg(db, tg_id, action):
    return execute_bot_action(db=db, telegram_user_id=tg_id, telegram_chat_id=tg_id, action_str=action)


def listing(db, user, cid, **kw):
    args = dict(page=1, per_page=100, company_id=None, branch_id=None, assigned_to_id=None, created_by_id=None,
                filter_mode=None, priority=None, status_filter=None, overdue=None, due_from=None, due_to=None,
                search=None, current_user=user, active_cid=cid, db=db)
    args.update(kw)
    return list_tasks(**args)["data"]


def summary(db, user, cid, **kw):
    args = dict(company_id=None, branch_id=None, assigned_to_id=None, created_by_id=None, filter_mode=None,
                priority=None, search=None, due_from=None, due_to=None, current_user=user, active_cid=cid, db=db)
    args.update(kw)
    return task_summary(**args)["data"]


def main():
    db = SessionLocal()
    company = db.query(Company).filter_by(company_code="TEST-TGT").first()
    link_a = db.query(TelegramUserLink).filter_by(telegram_user_id=TG_A).first()
    if not company or not link_a:  # seed fixtures through the existing suite
        from test_telegram_task_actions import run_telegram_task_actions_tests
        run_telegram_task_actions_tests()
        company = db.query(Company).filter_by(company_code="TEST-TGT").first()
    cid = company.id
    manager = db.query(User).filter_by(username="mgr_user_01").first()
    tech_a = db.query(User).filter_by(username="tech_a_user").first()
    for tid in (TG_A, TG_B):
        link = db.query(TelegramUserLink).filter_by(telegram_user_id=tid).first()
        link.allowed_modules = ["tasks", "tickets", "custody", "assets", "notifications", "search"]
        link.data_scope, link.notification_preferences = "Self", {}
        db.commit()
    print("\n== Task workflow end-to-end (real DB) ==")
    marker = uuid.uuid4().hex[:6]
    title = f"[E2E {marker}] تحديث خادم النسخ الاحتياطي"

    # 1. Dashboard creates + persists
    created = create_task(TaskCreate(title=title, description="اختبار", assigned_to_id=tech_a.employee_id, priority="High",
                                     status="Assigned", due_date=date.today() + timedelta(days=3), notify_telegram=True),
                          current_user=manager, active_cid=cid, db=db)
    task_id = uuid.UUID(created["data"]["id"])
    with SessionLocal() as fresh:
        t = fresh.get(Task, task_id)
        check("1 Dashboard creates and persists the task", t and t.status == "Assigned")
    # duplicate submission guard
    again = create_task(TaskCreate(title=title, assigned_to_id=tech_a.employee_id, status="Assigned"),
                        current_user=manager, active_cid=cid, db=db)
    check("1b double-submit returns the same task", again["data"]["id"] == str(task_id))

    # 2. Telegram assignment queued once (delivery to Telegram itself is not verifiable offline)
    outbox = db.query(NotificationOutbox).filter(NotificationOutbox.idempotency_key == f"task.assigned:{task_id}:{tech_a.employee_id}").all()
    check("2 assignment notification enqueued exactly once, with action buttons",
          len(outbox) == 1 and "act:accept" in str(outbox[0].reply_markup) and "act:clarify" in str(outbox[0].reply_markup))
    sent_keyboard = str(outbox[0].reply_markup)
    check("2b callback_data of every button fits Telegram's 64-byte limit",
          all(len(b["callback_data"].encode()) <= 64 for row in outbox[0].reply_markup["inline_keyboard"] for b in row))

    # 3-5. accept
    res = tg(db, TG_A, f"act:accept:{task_id}")
    db.expire_all()
    check("3 employee accepts the task", res["success"], res.get("message"))
    task = db.get(Task, task_id)
    check("4 database records accepted/in-progress stage", wf.stage_of(task.status) == "in_progress", task.status)
    rows = listing(db, manager, cid, status_filter="in_progress", search=marker)
    check("5 dashboard immediately reflects in-progress", len(rows) == 1 and rows[0]["stage"] == "in_progress")
    check("5b detail keyboard offers only valid actions (no Accept)", "act:accept" not in str(res["reply_markup"]) and "act:done" in str(res["reply_markup"]))

    # 6-7. clarification
    q = tg(db, TG_A, f"act:clarify:{task_id}")
    check("6a clarify prompts for a question", q["success"] and "اكتب" in q["message"])
    r = execute_pending_text(db, TG_A, TG_A, "أي خادم تقصد بالضبط؟")
    db.expire_all()
    check("6b clarification saved and status waiting", r and r["success"] and wf.stage_of(db.get(Task, task_id).status) == "waiting", r)
    comments = [c.content for c in db.query(TaskComment).filter_by(task_id=task_id)]
    check("7 clarification appears in task history", any("أي خادم تقصد" in c for c in comments))
    check("7b free text without a pending action is not captured", execute_pending_text(db, TG_A, TG_A, "مرحبا") is None)

    # 8-10. complete
    done = tg(db, TG_A, f"act:done:{task_id}")
    db.expire_all()
    check("8 employee completes", done["success"], done.get("message"))
    with SessionLocal() as fresh:
        t = fresh.get(Task, task_id)
        check("9 database records Completed (new session)", t.status == "Completed" and t.completed_at is not None)
    rows = listing(db, manager, cid, search=marker)
    check("10 dashboard displays Completed", rows and rows[0]["status"] == "Completed" and rows[0]["stage"] == "completed")

    # 11-15. search / filters / telegram lists
    check("11a search by partial Arabic text (normalized)", any(r["id"] == str(task_id) for r in listing(db, manager, cid, search="الإحتياطي خادم")) or
          any(r["id"] == str(task_id) for r in listing(db, manager, cid, search="خادم النسخ")))
    by_title = [r for r in listing(db, manager, cid, search=f"E2E {marker} الاحتياطي")]
    check("11 search returns correct task + status", len(by_title) == 1 and by_title[0]["status"] == "Completed")
    by_ref = listing(db, manager, cid, search=wf.task_ref(task_id))
    check("11b search by task reference", any(r["id"] == str(task_id) for r in by_ref))
    check("12 Completed filter includes it", any(r["id"] == str(task_id) for r in listing(db, manager, cid, status_filter="completed")))
    for key in ("new", "active", "in_progress", "overdue"):
        check(f"13 '{key}' filter excludes it", not any(r["id"] == str(task_id) for r in listing(db, manager, cid, status_filter=key, search=marker)))
    check("14 Telegram Completed list includes it", any(t["id"] == str(task_id) for t in tg(db, TG_A, "cmd:my_tasks:completed")["tasks"]))
    active = tg(db, TG_A, "cmd:my_tasks")
    check("15 Telegram Active list excludes it", all(t["id"] != str(task_id) for t in active["tasks"]) and active["view"] == "active")
    check("15b active list never shows completed/rejected stages", all(t["stage"] in wf.ACTIVE_STAGES for t in active["tasks"]))
    check("16 status survives a brand-new session (refresh/restart equivalent)", SessionLocal().get(Task, task_id).status == "Completed")

    # 17. duplicate callback
    n_comments, n_audit = db.query(TaskComment).filter_by(task_id=task_id).count(), db.query(AuditLog).filter_by(resource_id=str(task_id)).count()
    again = tg(db, TG_A, f"act:done:{task_id}")
    db.expire_all()
    check("17 duplicate callback causes no duplicate action",
          db.query(TaskComment).filter_by(task_id=task_id).count() == n_comments
          and db.query(AuditLog).filter_by(resource_id=str(task_id)).count() == n_audit and again["success"])
    check("17b completed task shows no stale action buttons", "act:done" not in str(again["reply_markup"]) and "act:accept" not in str(again["reply_markup"]))

    # 18. unauthorized
    t2 = Task(company_id=cid, title=f"[E2E {marker}] مهمة ثانية", assigned_to_id=tech_a.employee_id, assigned_by_id=manager.id,
              priority="Medium", status="Assigned")
    db.add(t2)
    db.commit()
    denied = tg(db, TG_B, f"act:done:{t2.id}")
    db.expire_all()
    check("18 another employee cannot modify the task", not denied["success"] and db.get(Task, t2.id).status == "Assigned")
    check("18b unknown telegram user cannot act", not tg(db, "123456789", f"act:done:{t2.id}")["success"])
    check("18c employee cannot reopen (manager-only)", not tg(db, TG_A, f"act:reopen:{task_id}")["success"] and db.get(Task, task_id).status == "Completed")

    # 19. rejection reasons (predefined code + custom text)
    pick = tg(db, TG_A, f"act:reject:{t2.id}")
    check("19a reason picker uses short callback codes", all(len(b["callback_data"].encode()) <= 64 for row in pick["reply_markup"]["inline_keyboard"] for b in row))
    rej = tg(db, TG_A, f"act:do_reject:{t2.id}:2")
    db.expire_all()
    check("19 predefined rejection reason saved", db.get(Task, t2.id).status == "Rejected" and "نقص الصلاحيات" in (db.get(Task, t2.id).review_notes or ""), rej.get("message"))
    t3 = Task(company_id=cid, title=f"[E2E {marker}] مهمة ثالثة", assigned_to_id=tech_a.employee_id, assigned_by_id=manager.id, priority="Low", status="Assigned")
    db.add(t3)
    db.commit()
    tg(db, TG_A, f"act:reject_custom:{t3.id}")
    execute_pending_text(db, TG_A, TG_A, "الجهاز غير متوفر لدي")
    db.expire_all()
    check("19b custom rejection reason saved", db.get(Task, t3.id).status == "Rejected" and "الجهاز غير متوفر" in (db.get(Task, t3.id).review_notes or ""))
    from app.models.notification import Notification
    check("19c manager notified of rejection (in-app + telegram outbox entry)",
          db.query(Notification).filter(Notification.recipient_user_id == manager.id, Notification.related_record_id == t3.id,
                                        Notification.event_type == "task_rejected").count() == 1
          and db.query(NotificationOutbox).filter(NotificationOutbox.idempotency_key.like(f"task.rejected:reject:{t3.id}%")).count() == 1)

    # 20. KPIs equal the database
    s = summary(db, manager, cid, search=marker)
    raw = {st: n for st, n in db.query(Task.status, func.count()).filter(Task.company_id == cid, Task.title.like(f"[E2E {marker}]%")).group_by(Task.status)}
    check("20 KPI totals equal real database counts",
          s["total"] == sum(raw.values()) and s["completed"] == raw.get("Completed", 0) and s["rejected"] == raw.get("Rejected", 0),
          f"{s} vs {raw}")
    check("20b no task falls outside a stage", s["unknown_status"] == 0)

    # overdue is independent from status
    late = Task(company_id=cid, title=f"[E2E {marker}] متأخرة", assigned_to_id=tech_a.employee_id, assigned_by_id=manager.id,
                status="To Do", due_date=date.today() - timedelta(days=2))
    db.add(late)
    db.commit()
    check("overdue derived from due date, status untouched",
          any(r["id"] == str(late.id) and r["is_overdue"] and r["status"] == "To Do" and r["stage"] == "new"
              for r in listing(db, manager, cid, overdue=True)))
    check("legacy 'To Do' maps to the New stage filter", any(r["id"] == str(late.id) for r in listing(db, manager, cid, status_filter="new")))

    print(f"\n{sum(ok for _, ok in results)}/{len(results)} checks passed")
    db.close()


if __name__ == "__main__":
    main()
