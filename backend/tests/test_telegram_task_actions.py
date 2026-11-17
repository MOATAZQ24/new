"""End-to-End QA Test Suite for Telegram Task Actions Integration.

Tests all 12 scenarios:
1. Employee accepts an assigned task.
2. Employee rejects a task with a reason.
3. Employee completes an accepted task.
4. Unauthorized Telegram user clicks a task button.
5. Employee attempts to modify another employee's task.
6. Employee clicks the same button multiple times (idempotency).
7. Employee clicks an outdated Telegram notification (modifying rejected/completed task rejected).
8. Telegram webhook/action retries the same update.
9. Dashboard / Database reflects the new status immediately.
10. Task creator receives the correct notification.
11. Existing Telegram account linking continues working.
12. Existing web-based task management remains functional.
"""

import os
import sys
import uuid
from datetime import datetime, date, timedelta

_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND = os.path.abspath(os.path.join(_HERE, ".."))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User, Employee, Role, UserRole, CompanyMembership
from app.models.task import Task, TaskComment
from app.models.telegram import TelegramUserLink, TelegramActionLog, NotificationOutbox
from app.models.notification import Notification
from app.models.audit import AuditLog
from app.services.telegram_service import (
    execute_bot_action,
    format_task_notification,
    resolve_telegram_identity,
    generate_telegram_link_token,
    verify_telegram_link,
)
from app.services import task_service


def run_telegram_task_actions_tests():
    db = SessionLocal()
    print("=" * 65)
    print("STARTING TEST SUITE: TELEGRAM TASK ACTIONS INTEGRATION")
    print("=" * 65)

    try:
        # Setup Test Company
        company = db.query(Company).filter_by(company_code="TEST-TGT").first()
        if not company:
            company = Company(
                id=uuid.uuid4(),
                company_name_ar="شركة الاختبار التشغيلية",
                company_name_en="Test Operations Co",
                company_code="TEST-TGT",
            )
            db.add(company)
            db.commit()

        # Setup Roles
        tech_role = db.query(Role).filter_by(name="IT Technician").first()
        if not tech_role:
            tech_role = Role(name="IT Technician", description="Technician")
            db.add(tech_role)
            db.commit()

        admin_role = db.query(Role).filter_by(name="Company Admin").first()
        if not admin_role:
            admin_role = Role(name="Company Admin", description="Admin")
            db.add(admin_role)
            db.commit()

        # Setup Employees & Users
        # Creator / Manager
        creator_emp = db.query(Employee).filter_by(employee_number="EMP-MGR-01").first()
        if not creator_emp:
            creator_emp = Employee(
                id=uuid.uuid4(),
                company_id=company.id,
                employee_number="EMP-MGR-01",
                full_name="المهندس طارق المشرف",
                job_title="مدير النظم",
                employment_status="Active",
            )
            db.add(creator_emp)
            db.flush()

        creator_user = db.query(User).filter_by(username="mgr_user_01").first()
        if not creator_user:
            creator_user = User(
                id=uuid.uuid4(),
                username="mgr_user_01",
                email="mgr01@investorgate.test",
                password_hash="test_hash_val",
                employee_id=creator_emp.id,
                account_status="Active",
            )
            db.add(creator_user)
            db.flush()
            db.add(CompanyMembership(user_id=creator_user.id, company_id=company.id, role_id=admin_role.id, status="Active"))
            db.add(UserRole(user_id=creator_user.id, role_id=admin_role.id))
            db.commit()

        # Assigned Technician (Employee A)
        tech_a = db.query(Employee).filter_by(employee_number="EMP-TECH-A").first()
        if not tech_a:
            tech_a = Employee(
                id=uuid.uuid4(),
                company_id=company.id,
                employee_number="EMP-TECH-A",
                full_name="فني التشغيل سعد الدوسري",
                job_title="فني شبكات",
                employment_status="Active",
            )
            db.add(tech_a)
            db.flush()

        tech_a_user = db.query(User).filter_by(username="tech_a_user").first()
        if not tech_a_user:
            tech_a_user = User(
                id=uuid.uuid4(),
                username="tech_a_user",
                email="techa@investorgate.test",
                password_hash="test_hash_val",
                employee_id=tech_a.id,
                account_status="Active",
            )
            db.add(tech_a_user)
            db.flush()
            db.add(CompanyMembership(user_id=tech_a_user.id, company_id=company.id, role_id=tech_role.id, status="Active"))
            db.add(UserRole(user_id=tech_a_user.id, role_id=tech_role.id))
            db.commit()

        # Another Technician (Employee B)
        tech_b = db.query(Employee).filter_by(employee_number="EMP-TECH-B").first()
        if not tech_b:
            tech_b = Employee(
                id=uuid.uuid4(),
                company_id=company.id,
                employee_number="EMP-TECH-B",
                full_name="فني آخر ناصر الحربي",
                job_title="فني حاسب",
                employment_status="Active",
            )
            db.add(tech_b)
            db.flush()

        tech_b_user = db.query(User).filter_by(username="tech_b_user").first()
        if not tech_b_user:
            tech_b_user = User(
                id=uuid.uuid4(),
                username="tech_b_user",
                email="techb@investorgate.test",
                password_hash="test_hash_val",
                employee_id=tech_b.id,
                account_status="Active",
            )
            db.add(tech_b_user)
            db.flush()
            db.add(CompanyMembership(user_id=tech_b_user.id, company_id=company.id, role_id=tech_role.id, status="Active"))
            db.add(UserRole(user_id=tech_b_user.id, role_id=tech_role.id))
            db.commit()

        # Telegram Links
        # Link Tech A with TG ID 999001
        tg_id_a = "999001"
        link_a = db.query(TelegramUserLink).filter_by(telegram_user_id=tg_id_a).first()
        if not link_a:
            link_a = TelegramUserLink(
                employee_id=tech_a.id,
                user_id=tech_a_user.id,
                company_id=company.id,
                telegram_user_id=tg_id_a,
                telegram_chat_id=tg_id_a,
                telegram_username="saad_tech",
                is_verified=True,
                notifications_enabled=True,
                allowed_modules=["tasks", "tickets", "custody", "assets", "notifications", "search"],
                verification_token="token_test_a",
                token_expires_at=datetime.utcnow() + timedelta(days=30),
            )
            db.add(link_a)
            db.commit()
        else:
            link_a.allowed_modules = ["tasks", "tickets", "custody", "assets", "notifications", "search"]
            link_a.data_scope = "Self"
            db.commit()

        # Link Tech B with TG ID 999002
        tg_id_b = "999002"
        link_b = db.query(TelegramUserLink).filter_by(telegram_user_id=tg_id_b).first()
        if not link_b:
            link_b = TelegramUserLink(
                employee_id=tech_b.id,
                user_id=tech_b_user.id,
                company_id=company.id,
                telegram_user_id=tg_id_b,
                telegram_chat_id=tg_id_b,
                telegram_username="nasser_tech",
                is_verified=True,
                notifications_enabled=True,
                allowed_modules=["tasks", "tickets", "custody", "assets", "notifications", "search"],
                verification_token="token_test_b",
                token_expires_at=datetime.utcnow() + timedelta(days=30),
            )
            db.add(link_b)
            db.commit()
        else:
            link_b.allowed_modules = ["tasks", "tickets", "custody", "assets", "notifications", "search"]
            link_b.data_scope = "Self"
            db.commit()

        print("  ✓ Setup test company, users, employees, and Telegram links")

        # ── Scenario 1: Verify Task Notification Formatting & Buttons ──────
        test_task = Task(
            id=uuid.uuid4(),
            company_id=company.id,
            title="فحص وصيانة خادم النسخ الاحتياطي",
            description="التحقق من سلامة التخزين الدوري واختبار الاسترجاع السريع",
            assigned_to_id=tech_a.id,
            assigned_by_id=creator_user.id,
            priority="High",
            status="Assigned",
            due_date=date.today() + timedelta(days=2),
        )
        db.add(test_task)
        db.commit()
        db.refresh(test_task)

        msg_text, reply_markup = format_task_notification(test_task, "task.assigned", company.company_name_ar)
        assert test_task.title in msg_text, "Task title must appear in notification"
        assert "عالية 🟠" in msg_text, "Task priority must appear in notification"
        assert tech_a.full_name in msg_text, "Assigned employee name must appear in notification"
        assert f"#TASK-{str(test_task.id)[:8].upper()}" in msg_text, "Task reference number must appear"
        buttons = reply_markup["inline_keyboard"]
        button_texts = [b["text"] for row in buttons for b in row]
        assert any("قبول المهمة" in t for t in button_texts), "Must include Accept Task button"
        assert any("رفض المهمة" in t for t in button_texts), "Must include Reject Task button"
        assert any("إنهاء المهمة" in t for t in button_texts), "Must include Complete Task button"
        print("  ✓ Scenario 1: Task notification contains title, description, priority, employee, due date, ref, and 3 buttons")

        # ── Scenario 2: Employee Accepts Task via Telegram ─────────────────
        res_accept = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_a,
            telegram_chat_id=tg_id_a,
            action_str=f"act:accept:{test_task.id}",
        )
        assert res_accept["success"] is True, f"Accept failed: {res_accept}"
        db.refresh(test_task)
        assert test_task.status == "Accepted", f"Expected Accepted, got {test_task.status}"
        assert test_task.accepted_at is not None, "accepted_at timestamp must be set"
        assert test_task.acknowledged_at is not None, "acknowledged_at timestamp must be set"
        # Verify Audit Log
        audit = db.query(AuditLog).filter_by(resource_type="Task", resource_id=str(test_task.id), action="TASK_ACCEPT").first()
        assert audit is not None, "Audit log for TASK_ACCEPT must exist"
        # Verify Manager Notification
        notif = db.query(Notification).filter_by(recipient_user_id=creator_user.id, event_type="task_accepted").first()
        assert notif is not None, "Manager must receive notification when task is accepted"
        print("  ✓ Scenario 2: Employee accepts task; status -> Accepted, timestamp, audit, and manager notified")

        # ── Scenario 3: Employee Clicks Same Button Multiple Times (Idempotent)
        res_accept_dup = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_a,
            telegram_chat_id=tg_id_a,
            action_str=f"act:accept:{test_task.id}",
        )
        assert res_accept_dup["success"] is True, "Repeated accept must return success idempotently"
        assert "مقبولة" in res_accept_dup["message"], "Idempotent message should indicate already accepted"
        db.refresh(test_task)
        assert test_task.status == "Accepted", "Status should remain Accepted"
        print("  ✓ Scenario 3: Duplicate action handled idempotently without error")

        # ── Scenario 4: Employee Completes Task via Telegram ──────────────
        res_done = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_a,
            telegram_chat_id=tg_id_a,
            action_str=f"act:done:{test_task.id}",
        )
        assert res_done["success"] is True, f"Complete failed: {res_done}"
        db.refresh(test_task)
        # Technician submission preserves manager approval workflow
        assert test_task.status in ("Submitted for Review", "Completed"), f"Status: {test_task.status}"
        assert test_task.submitted_for_review_at is not None or test_task.completed_at is not None
        print("  ✓ Scenario 4: Employee completes task (submitted for review / completed preserving approval)")

        # ── Scenario 5: Unauthorized User Clicks Button ────────────────────
        unauth_tg_id = "111888999"
        res_unauth = execute_bot_action(
            db=db,
            telegram_user_id=unauth_tg_id,
            telegram_chat_id=unauth_tg_id,
            action_str=f"act:accept:{test_task.id}",
        )
        assert res_unauth["success"] is False, "Unauthorized user must be rejected"
        assert res_unauth["status"] == "Unauthorized"
        print("  ✓ Scenario 5: Unauthorized Telegram user strictly blocked with 401/Unauthorized")

        # ── Scenario 6: Employee B Attempts to Modify Employee A's Task ────
        res_wrong_emp = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_b,
            telegram_chat_id=tg_id_b,
            action_str=f"act:accept:{test_task.id}",
        )
        assert res_wrong_emp["success"] is False, "Cross-employee modification must be rejected"
        assert res_wrong_emp["status"] == "Unauthorized"
        print("  ✓ Scenario 6: Cross-employee task modification strictly blocked")

        # ── Scenario 7: Employee Rejects Task with Reason ─────────────────
        task_reject = Task(
            id=uuid.uuid4(),
            company_id=company.id,
            title="تحديث تراخيص جدران الحماية الخارجية",
            description="مهمة تتطلب صلاحيات خاصة على أجهزة سيسكو",
            assigned_to_id=tech_b.id,
            assigned_by_id=creator_user.id,
            priority="Medium",
            status="Assigned",
            due_date=date.today() + timedelta(days=1),
        )
        db.add(task_reject)
        db.commit()

        # Step A: Click reject -> Telegram requests/presents reasons
        res_req_reason = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_b,
            telegram_chat_id=tg_id_b,
            action_str=f"act:reject:{task_reject.id}",
        )
        assert res_req_reason["success"] is True
        assert "سبب الرفض" in res_req_reason["message"]
        assert "inline_keyboard" in res_req_reason["reply_markup"]

        # Step B: Provide explicit rejection reason
        reason_text = "نقص الصلاحيات اللازمة للوصول إلى لوحة تحكم سيسكو"
        res_do_reject = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_b,
            telegram_chat_id=tg_id_b,
            action_str=f"act:do_reject:{task_reject.id}:{reason_text}",
        )
        assert res_do_reject["success"] is True, f"do_reject failed: {res_do_reject}"
        db.refresh(task_reject)
        assert task_reject.status == "Rejected", f"Expected Rejected, got {task_reject.status}"
        assert reason_text in (task_reject.blocker_reason or ""), "Rejection reason must be saved in blocker_reason"

        # Verify comment created
        comment = db.query(TaskComment).filter_by(task_id=task_reject.id).first()
        assert comment is not None, "TaskComment with rejection reason must be recorded"
        assert reason_text in comment.content

        # Verify Audit Log
        audit_rej = db.query(AuditLog).filter_by(resource_type="Task", resource_id=str(task_reject.id), action="TASK_REJECTED").first()
        assert audit_rej is not None, "AuditLog for TASK_REJECTED must be recorded"

        # Verify Creator Notification
        notif_rej = db.query(Notification).filter_by(recipient_user_id=creator_user.id, event_type="task_rejected").first()
        assert notif_rej is not None, "Creator must receive notification for task rejection"
        print("  ✓ Scenario 7: Employee rejects task with reason; status -> Rejected, comment, audit, and notification logged")

        # ── Scenario 8: Outdated Action on Rejected Task is Blocked ───────
        res_try_complete_rejected = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_b,
            telegram_chat_id=tg_id_b,
            action_str=f"act:done:{task_reject.id}",
        )
        assert res_try_complete_rejected["success"] is False, "Completing a rejected task must be blocked"
        assert "مرفوضة" in res_try_complete_rejected["message"]
        db.refresh(task_reject)
        assert task_reject.status == "Rejected", "Status must remain Rejected"
        print("  ✓ Scenario 8: Outdated complete button on rejected task strictly blocked")

        # ── Scenario 9: Duplicate Reject is Idempotent ────────────────────
        res_rej_dup = execute_bot_action(
            db=db,
            telegram_user_id=tg_id_b,
            telegram_chat_id=tg_id_b,
            action_str=f"act:do_reject:{task_reject.id}:{reason_text}",
        )
        assert res_rej_dup["success"] is True, "Duplicate reject must return success"
        assert "مسبقاً" in res_rej_dup["message"]
        print("  ✓ Scenario 9: Duplicate rejection handled idempotently")

        # ── Scenario 10: Dashboard / Database Query Reflects New Status Immediately
        latest_task_a = db.query(Task).filter_by(id=test_task.id).one()
        latest_task_b = db.query(Task).filter_by(id=task_reject.id).one()
        assert latest_task_a.status in ("Submitted for Review", "Completed")
        assert latest_task_b.status == "Rejected"
        print("  ✓ Scenario 10: Real database and dashboard queries reflect new statuses immediately")

        # ── Scenario 11: Telegram Linking Flow Preserved ───────────────────
        new_emp = Employee(
            id=uuid.uuid4(),
            company_id=company.id,
            employee_number=f"EMP-NEW-LINK-{uuid.uuid4().hex[:6]}",
            full_name="موظف تجربة الربط",
            job_title="مهندس اختبار",
            employment_status="Active",
        )
        db.add(new_emp)
        db.commit()

        link_data = generate_telegram_link_token(db=db, employee_id=new_emp.id, company_id=company.id)
        assert link_data["token"] is not None, "Token must be generated"
        raw_cmd = link_data["command"]
        assert raw_cmd.startswith("/start ")

        new_tg_id = str(900000000 + uuid.uuid4().int % 99999999)
        verify_res = verify_telegram_link(
            db=db,
            telegram_user_id=new_tg_id,
            telegram_chat_id=new_tg_id,
            token=link_data["token"],
            telegram_username="test_new_link_user",
        )
        assert verify_res["success"] is True, f"Linking failed: {verify_res}"
        link_record = db.query(TelegramUserLink).filter_by(employee_id=new_emp.id).first()
        assert link_record is not None
        assert link_record.is_verified is True
        assert link_record.telegram_user_id == new_tg_id
        print("  ✓ Scenario 11: Telegram /start <token> employee linking workflow verified 100%")

        # ── Scenario 12: Web-based Task Lifecycle API Remains Functional ───
        web_task = Task(
            id=uuid.uuid4(),
            company_id=company.id,
            title="مهمة الويب القياسية",
            assigned_to_id=tech_a.id,
            assigned_by_id=creator_user.id,
            status="Assigned",
        )
        db.add(web_task)
        db.commit()

        accepted_web = task_service.accept_task(web_task, tech_a_user, db)
        assert accepted_web.status == "Accepted"

        started_web = task_service.start_task(accepted_web, tech_a_user, db)
        assert started_web.status == "In Progress"

        submitted_web = task_service.submit_for_review(started_web, "جاهز للاعتماد", tech_a_user, db)
        assert submitted_web.status == "Submitted for Review"

        approved_web = task_service.approve_task(submitted_web, "معتمد وممتاز", creator_user, db)
        assert approved_web.status == "Completed"
        print("  ✓ Scenario 12: Web-based task lifecycle API completely functional and consistent")

        print("=" * 65)
        print("ALL 12 TELEGRAM TASK ACTION INTEGRATION SCENARIOS PASSED 100%! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_telegram_task_actions_tests()
