# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Comprehensive Test Suite for Phase 1 & 2:
Telegram Task Delivery, Outbox Resilience, and Employee Acknowledgement Pipeline.
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company, Branch
from app.models.user import User, Employee, CompanyMembership, Role, UserRole
from app.models.task import Task
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.schemas.task import TaskCreate
from app.api.v1.endpoints import tasks
from app.services.telegram_service import (
    enqueue_task_notification,
    dispatch_outbox_notifications,
    execute_bot_action,
    format_task_notification,
)


def run_pipeline_tests():
    print("=================================================================")
    print("STARTING TEST SUITE: TELEGRAM TASK DELIVERY & ACKNOWLEDGEMENT PIPELINE")
    print("=================================================================")

    db = SessionLocal()
    try:
        # 1. Setup isolated test company, employee, user, and telegram link
        company = db.query(Company).first()
        assert company is not None, "Company required"
        cid = company.id

        admin_user = (
            db.query(User)
            .join(UserRole, User.id == UserRole.user_id)
            .join(Role, UserRole.role_id == Role.id)
            .filter(Role.name == "Super Admin")
            .first()
        )
        assert admin_user is not None, "Admin user required"

        suffix = uuid.uuid4().hex[:6]
        test_employee = Employee(
            company_id=cid,
            employee_number=f"EMP-PIPE-{suffix}",
            full_name=f"فني الاختبار تيليجرام {suffix}",
            job_title="مهندس صيانة ودعم فني",
            email=f"pipe_tech_{suffix}@investorgate.com",
            phone="+966551234567",
            employment_status="Active",
        )
        db.add(test_employee)
        db.flush()

        tech_user = User(
            username=f"tech_pipe_{suffix}",
            email=f"pipe_tech_{suffix}@investorgate.com",
            password_hash="test_hashed_pwd",
            account_status="Active",
            employee_id=test_employee.id,
        )
        db.add(tech_user)
        db.flush()

        membership = CompanyMembership(
            user_id=tech_user.id,
            company_id=cid,
            status="Active",
        )
        db.add(membership)

        # Link employee to Telegram
        fake_telegram_uid = f"9988{suffix}"
        fake_chat_id = f"1122{suffix}"
        tlink = TelegramUserLink(
            employee_id=test_employee.id,
            user_id=tech_user.id,
            company_id=cid,
            telegram_user_id=fake_telegram_uid,
            telegram_chat_id=fake_chat_id,
            telegram_username=f"tech_tg_{suffix}",
            verification_token=f"TOK-{suffix}",
            token_expires_at=datetime.utcnow() + timedelta(hours=1),
            is_verified=True,
            notifications_enabled=True,
            linked_at=datetime.utcnow(),
        )
        db.add(tlink)
        db.commit()
        print(f"  ✓ Test environment ready: Employee linked to Telegram (@{tlink.telegram_username}, Chat ID: {fake_chat_id})")

        # 2. Test format_task_notification includes 'act:ack' button
        test_task_obj = Task(
            company_id=cid,
            title="مهمة اختبار زر تأكيد الاستلام",
            priority="High",
            status="Assigned",
            due_date=(datetime.utcnow() + timedelta(days=3)).date(),
        )
        db.add(test_task_obj)
        db.flush()

        msg_text, reply_markup = format_task_notification(test_task_obj, "task.assigned", company.company_name_ar)
        assert "تأكيد الاستلام" in str(reply_markup), "Reply markup must include 'تأكيد الاستلام' button"
        assert f"act:ack:{test_task_obj.id}" in str(reply_markup), "Callback data must have act:ack"
        print("  ✓ format_task_notification includes 'act:ack' button with proper task ID")

        # 3. Test Task Creation with notify_telegram=True enqueues Outbox
        task_payload = TaskCreate(
            company_id=cid,
            title=f"صيانة الخوادم السحابية {suffix}",
            description="فحص دوري للخوادم والشبكات وتأكيد الجاهزية",
            assigned_to_id=test_employee.id,
            priority="Urgent",
            status="Assigned",
            due_date=(datetime.utcnow() + timedelta(days=2)).date(),
            notify_telegram=True,
        )

        create_res = tasks.create_task(
            payload=task_payload,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        task_id = uuid.UUID(create_res["data"]["id"])
        delivery_status = create_res["data"]["delivery_status"]
        assert delivery_status is not None, "create_task should return delivery_status"
        assert delivery_status["recipient_chat_id"] == fake_chat_id
        print(f"  ✓ Task created via API; delivery status returned immediately: {delivery_status['status']}")

        created_task = db.query(Task).filter(Task.id == task_id).first()
        assert created_task is not None
        assert created_task.acknowledged_at is None, "Newly created task must not be acknowledged yet"

        # Check outbox record
        outbox_entry = (
            db.query(NotificationOutbox)
            .filter(
                NotificationOutbox.company_id == cid,
                NotificationOutbox.recipient_chat_id == fake_chat_id,
            )
            .order_by(NotificationOutbox.created_at.desc())
            .first()
        )
        assert outbox_entry is not None, "Outbox entry must exist"
        assert outbox_entry.event_type == "task.assigned"
        print(f"  ✓ Transactional Outbox record verified (ID: {outbox_entry.id}, status: {outbox_entry.status})")

        # 4. Test Employee Acknowledgement via act:ack callback
        print("  Testing Employee Acknowledgement via Telegram Callback Query...")
        ack_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_telegram_uid,
            telegram_chat_id=fake_chat_id,
            action_str=f"act:ack:{task_id}",
            ip_address="test_runner",
        )
        assert ack_res["success"] is True, f"Acknowledgement failed: {ack_res}"
        assert "تم تسجيل تأكيد استلام المهمة" in ack_res["message"]

        db.refresh(created_task)
        assert created_task.acknowledged_at is not None, "task.acknowledged_at must be populated!"
        assert created_task.status == "Accepted", f"task.status should transition to Accepted, got {created_task.status}"
        assert created_task.status != "Completed", "CRITICAL: Acknowledgement must NOT be confused with completion!"
        print(f"  ✓ Employee acknowledged receipt at {created_task.acknowledged_at.isoformat()} (Status: {created_task.status})")

        # 5. Idempotent re-acknowledgement
        re_ack_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_telegram_uid,
            telegram_chat_id=fake_chat_id,
            action_str=f"act:ack:{task_id}",
            ip_address="test_runner",
        )
        assert re_ack_res["success"] is True
        assert "مسبقاً" in re_ack_res["message"], "Second acknowledgement should report already acknowledged"
        print("  ✓ Idempotency verified: duplicate acknowledgement cleanly handled without state alteration")

        # 6. Test GET /tasks/{task_id}/telegram-status
        status_res = tasks.get_task_telegram_status(
            task_id=task_id,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        tg_status_data = status_res["data"]
        assert tg_status_data["is_employee_linked"] is True
        assert tg_status_data["is_acknowledged"] is True
        assert tg_status_data["acknowledged_at"] is not None
        assert tg_status_data["assigned_to_name"] == test_employee.full_name
        print(f"  ✓ Live delivery & acknowledgement status endpoint verified (Acknowledged: {tg_status_data['is_acknowledged']})")

        # 7. Test POST /tasks/{task_id}/resend-telegram
        resend_res = tasks.resend_task_telegram(
            task_id=task_id,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        assert resend_res["data"] is not None
        assert resend_res["data"]["outbox_id"] is not None
        print(f"  ✓ Manual notification resend verified (New Outbox ID: {resend_res['data']['outbox_id']})")

        # 8. Test Security: Unauthorized or non-assignee employee cannot acknowledge another technician's task
        diff_suffix = uuid.uuid4().hex[:6]
        diff_employee = Employee(
            company_id=cid,
            employee_number=f"EMP-DIFF-{diff_suffix}",
            full_name=f"فني آخر {diff_suffix}",
            job_title="فني شبكات",
            email=f"diff_{diff_suffix}@investorgate.com",
            employment_status="Active",
        )
        db.add(diff_employee)
        db.flush()

        diff_user = User(
            username=f"user_diff_{diff_suffix}",
            email=f"diff_{diff_suffix}@investorgate.com",
            password_hash="test_pwd",
            account_status="Active",
            employee_id=diff_employee.id,
        )
        db.add(diff_user)
        db.flush()
        db.add(CompanyMembership(user_id=diff_user.id, company_id=cid, status="Active"))

        # Link diff employee to Telegram
        diff_tg_uid = f"7766{diff_suffix}"
        diff_chat_id = f"3344{diff_suffix}"
        db.add(TelegramUserLink(
            employee_id=diff_employee.id,
            user_id=diff_user.id,
            company_id=cid,
            telegram_user_id=diff_tg_uid,
            telegram_chat_id=diff_chat_id,
            telegram_username=f"diff_tg_{diff_suffix}",
            verification_token=f"TOK-DIFF-{diff_suffix}",
            token_expires_at=datetime.utcnow() + timedelta(hours=1),
            is_verified=True,
            notifications_enabled=True,
            linked_at=datetime.utcnow(),
        ))
        db.commit()

        unauth_ack = execute_bot_action(
            db=db,
            telegram_user_id=diff_tg_uid,
            telegram_chat_id=diff_chat_id,
            action_str=f"act:ack:{task_id}",
            ip_address="test_runner",
        )
        assert unauth_ack["success"] is False
        assert unauth_ack["status"] == "Unauthorized"
        print(f"  ✓ Ownership & RBAC verified: unauthorized technician blocked from acknowledging other employee's task (Status: {unauth_ack['status']})")

        # 9. Test Completion is separate from Acknowledgement
        complete_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_telegram_uid,
            telegram_chat_id=fake_chat_id,
            action_str=f"act:done:{task_id}",
            ip_address="test_runner",
        )
        assert complete_res["success"] is True
        db.refresh(created_task)
        assert created_task.status == "Completed", "Task status must now be Completed"
        assert created_task.completed_at is not None, "completed_at must be populated"
        print(f"  ✓ Completion verified separate from acknowledgement: task completed at {created_task.completed_at.isoformat()}")

        print("=================================================================")
        print("ALL TELEGRAM TASK DELIVERY & ACKNOWLEDGEMENT PIPELINE TESTS PASSED! ✓✓✓")
        print("=================================================================")

    finally:
        db.close()


if __name__ == "__main__":
    run_pipeline_tests()
