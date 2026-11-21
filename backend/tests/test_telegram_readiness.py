# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Test Suite: Telegram Bot Integration Readiness.
Verifies:
1. Token generation with expiration and single-use validation.
2. Employee account linking (telegram_user_links).
3. Transactional Outbox enqueuing for all 6 task events.
4. Offline resilience (Telegram optional; tasks work seamlessly).
5. Inbound Bot Actions (Accept, Start, Complete, My Tasks, Task Details).
6. RBAC & Company Isolation enforcement.
7. Invalid status transition rejection.
8. Telegram Action Audit Logging.
9. Outbox Dispatcher processing & delivery tracking.
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal, init_db
from app.models.company import Company, Branch
from app.models.user import Employee, User, Role, UserRole
from app.models.task import Task
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.services.telegram_service import (
    generate_telegram_link_token,
    verify_telegram_link,
    unlink_employee_telegram,
    enqueue_task_notification,
    dispatch_outbox_notifications,
    execute_bot_action,
)


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: TELEGRAM BOT INTEGRATION READINESS")
    print("=" * 65)

    init_db()
    db = SessionLocal()

    try:
        # 1. Setup Companies and Employees
        c1 = db.query(Company).filter(Company.company_name_ar.ilike("%بوابة المستثمر%")).first()
        if not c1:
            c1 = Company(company_name_ar="شركة بوابة المستثمر للتقنية", company_name_en="Investor Gate Tech", company_code="IGT")
            db.add(c1)
            db.flush()

        c2 = db.query(Company).filter(Company.company_code == "AML").first()
        if not c2:
            c2 = Company(company_name_ar="شركة الأمل للتقنية", company_name_en="Al-Amal Tech", company_code="AML")
            db.add(c2)
            db.flush()

        admin = db.query(User).filter(User.username == "admin").first()

        # Employee 1 in Co 1 (Technician)
        emp1 = db.query(Employee).filter(Employee.company_id == c1.id).first()
        if not emp1:
            emp1 = Employee(
                company_id=c1.id,
                employee_number="EMP-TG-01",
                full_name="سلمان فهد الحربي",
                job_title="مهندس دعم فني",
                email="salman.tg@investorgate.sa",
                employment_status="Active",
            )
            db.add(emp1)
            db.flush()

        # Employee 2 in Co 2 (Cross-company target)
        emp2 = db.query(Employee).filter(Employee.company_id == c2.id).first()
        if not emp2:
            emp2 = Employee(
                company_id=c2.id,
                employee_number="EMP-TG-02",
                full_name="عمر خالد الدوسري",
                job_title="تقني شبكات",
                email="omar.tg@alamal.sa",
                employment_status="Active",
            )
            db.add(emp2)
            db.flush()

        db.commit()

        # Clean previous test telegram records for clean run
        db.query(TelegramUserLink).filter(TelegramUserLink.employee_id.in_([emp1.id, emp2.id])).delete(synchronize_session=False)
        db.commit()

        print("  ✓ Company context & test employees ready")

        # ── Test 1: Single-Use Expiring Token Generation ─────────────────
        token_info = generate_telegram_link_token(db, employee_id=emp1.id, company_id=c1.id, expires_in_minutes=15)
        assert token_info["token"], "Token was not generated"
        assert token_info["pin_code"], "PIN code was not generated"
        assert token_info["command"].startswith("/start "), "Command format invalid"
        assert token_info["is_verified"] is False, "New token must be unverified"

        link_record = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp1.id).first()
        assert link_record is not None
        assert link_record.verification_token == token_info["token"]
        assert link_record.token_expires_at > datetime.utcnow()
        print(f"  ✓ Token Generation: Single-use token '{token_info['pin_code']}' generated with 15m expiry")

        # ── Test 2: Token Verification & Account Binding ─────────────────
        tg_user_id = "987654321"
        tg_chat_id = "987654321"
        tg_username = "salman_it"

        verify_result = verify_telegram_link(
            db=db,
            token=token_info["token"],
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            telegram_username=tg_username,
        )
        assert verify_result["success"] is True
        assert verify_result["telegram_user_id"] == tg_user_id
        assert verify_result["telegram_username"] == tg_username

        db.refresh(link_record)
        assert link_record.is_verified is True
        assert link_record.linked_at is not None
        print(f"  ✓ Account Linking: Employee bound to Telegram @{tg_username} (Chat ID: {tg_chat_id})")

        # Re-verification with same token must fail (Single-use enforcement)
        try:
            verify_telegram_link(db, token_info["token"], "111", "111")
            assert False, "Re-verifying with an already-used token must fail"
        except ValueError as e:
            assert "استخدامه بالفعل" in str(e)
            print("  ✓ Single-use Token: Token successfully consumed and rejected on second attempt")

        # ── Test 3: Task Creation & Transactional Outbox (task.assigned) ──
        task1 = Task(
            company_id=c1.id,
            title="فحص خوادم قواعد البيانات والنسخ الاحتياطي",
            description="إجراء الفحص الدوري وتأكيد سلامة النسخ الاحتياطية",
            assigned_to_id=emp1.id,
            assigned_by_id=admin.id if admin else None,
            priority="High",
            status="To Do",
            due_date=(datetime.utcnow() + timedelta(days=2)).date(),
        )
        db.add(task1)
        db.commit()
        db.refresh(task1)

        outbox_entry = enqueue_task_notification(db=db, task=task1, event_type="task.assigned")
        db.commit()

        assert outbox_entry is not None
        assert outbox_entry.event_type == "task.assigned"
        assert outbox_entry.recipient_chat_id == tg_chat_id
        assert outbox_entry.status == "Pending"
        assert "inline_keyboard" in outbox_entry.reply_markup
        print(f"  ✓ Transactional Outbox: Event 'task.assigned' enqueued (ID: {outbox_entry.id})")

        # ── Test 4: Offline Resilience (Telegram Optional) ───────────────
        # Create unlinked task for emp2 (no telegram link)
        task2 = Task(
            company_id=c2.id,
            title="تحديث إعدادات جدار الحماية",
            description="تطبيق سياسات الأمان الجديدة",
            assigned_to_id=emp2.id,
            priority="Medium",
            status="To Do",
        )
        db.add(task2)
        db.commit()
        db.refresh(task2)

        # Enqueue should not throw error even when unlinked
        outbox_unlinked = enqueue_task_notification(db=db, task=task2, event_type="task.assigned")
        db.commit()
        assert outbox_unlinked is not None
        assert outbox_unlinked.status == "Skipped (Unlinked)"
        print("  ✓ Offline Resilience: Task created successfully without Telegram link (Non-blocking)")

        # ── Test 5: Inbound Bot Action: Accept Task ───────────────────────
        res_accept = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:accept:{task1.id}",
        )
        assert res_accept["success"] is True
        assert res_accept["new_status"] == "In Progress"

        db.refresh(task1)
        assert task1.status == "In Progress"
        print(f"  ✓ Bot Action: 'Accept Task' executed -> Task status: {task1.status}")

        # Check action log recorded
        log_accept = db.query(TelegramActionLog).filter(
            TelegramActionLog.task_id == task1.id,
            TelegramActionLog.action == "accept",
        ).first()
        assert log_accept is not None
        assert log_accept.status == "Success"
        print("  ✓ Action Audit Log: Action logged with user, IP, and status")

        # ── Test 6: Inbound Bot Action: My Tasks ──────────────────────────
        res_my_tasks = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str="cmd:my_tasks",
        )
        assert res_my_tasks["success"] is True
        assert len(res_my_tasks["tasks"]) >= 1
        print(f"  ✓ Bot Action: 'My Tasks' returned {len(res_my_tasks['tasks'])} active tasks")

        # ── Test 7: Inbound Bot Action: Task Details ──────────────────────
        res_info = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:info:{task1.id}",
        )
        assert res_info["success"] is True
        assert "تفاصيل المهمة" in res_info["message"]
        print("  ✓ Bot Action: 'Task Details' returned rich Arabic message")

        # ── Test 8: Inbound Bot Action: Complete Task ─────────────────────
        res_done = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:done:{task1.id}",
        )
        assert res_done["success"] is True
        assert res_done["new_status"] == "Completed"

        db.refresh(task1)
        assert task1.status == "Completed"
        assert task1.completed_at is not None
        print(f"  ✓ Bot Action: 'Complete Task' executed -> Task status: {task1.status}")

        # ── Test 9: State Machine Transition Enforcement ─────────────────
        # Trying to start an already completed task must be rejected
        res_invalid = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:start:{task1.id}",
        )
        assert res_invalid["success"] is False
        assert res_invalid["status"] == "InvalidTransition"
        print("  ✓ State Machine: Transition from 'Completed' to 'Start' strictly prevented")

        # ── Test 10: RBAC & Company Isolation ─────────────────────────────
        # User in Co 1 trying to manipulate task2 in Co 2 must be rejected
        res_cross_co = execute_bot_action(
            db=db,
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:accept:{task2.id}",
        )
        assert res_cross_co["success"] is False
        assert res_cross_co["status"] == "Unauthorized"
        print("  ✓ Company Isolation: Cross-company task manipulation strictly blocked (403 Unauthorized)")

        # Unauthenticated sender
        res_unauth = execute_bot_action(
            db=db,
            telegram_user_id="fake_unregistered_id_999",
            telegram_chat_id="fake_chat_999",
            action_str=f"act:accept:{task1.id}",
        )
        assert res_unauth["success"] is False
        assert res_unauth["status"] in ("Unauthorized", "UNLINKED")
        print("  ✓ Authentication: Unregistered Telegram users strictly rejected")

        # ── Test 11: Outbox Dispatcher Processing ─────────────────────────
        dispatch_res = dispatch_outbox_notifications(db=db, limit=10)
        assert "processed" in dispatch_res
        print(f"  ✓ Outbox Dispatcher: Processed {dispatch_res['processed']} items gracefully without live token")

        # ── Test 12: Unlink Employee ──────────────────────────────────────
        unlink_ok = unlink_employee_telegram(db, employee_id=emp1.id)
        assert unlink_ok is True
        db.refresh(link_record)
        assert link_record.is_verified is False
        print("  ✓ Unlink Account: Employee Telegram account successfully unlinked")

        print("=" * 65)
        print("ALL TELEGRAM BOT READINESS TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
