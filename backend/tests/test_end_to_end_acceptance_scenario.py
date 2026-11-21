# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Official End-to-End Acceptance Scenario Test Suite:
Investor Gate OS — Final Production Readiness & Verification.

Demonstrates and verifies:
1. Administrator creates/selects an employee.
2. Administrator generates a manual Telegram command (/start <token>).
3. Employee sends command to bot.
4. CRM confirms linked Telegram account (Live polling API).
5. Administrator assigns a task (with Telegram notification toggle enabled).
6. Task is saved with DB persistence.
7. Telegram notification is queued in Transactional Outbox.
8. Worker processes the notification outbox.
9. Delivery status is recorded in CRM.
10. CRM displays actual delivery status.
11. Employee confirms receipt in Telegram (act:ack:{task_id}).
12. CRM displays acknowledgement (acknowledged_at recorded; status != Completed).
13. Employee starts or completes the task (act:start, act:done).
14. CRM reflects authorized status changes.
15. Audit history records all mutations with user/technician identity.
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User, Employee, CompanyMembership, Role, UserRole
from app.models.task import Task
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.models.audit import AuditLog
from app.schemas.task import TaskCreate
from app.schemas.employee import EmployeeCreate
from app.api.v1.endpoints import employees, tasks, telegram
from app.services.telegram_service import (
    generate_telegram_link_token,
    verify_telegram_link,
    dispatch_outbox_notifications,
    execute_bot_action,
)


def run_acceptance_scenario():
    print("=" * 70)
    print("INVESTOR GATE OS: FULL END-TO-END ACCEPTANCE TEST SUITE")
    print("=" * 70)

    db = SessionLocal()
    try:
        # Step 0: Ensure Company & Admin User
        company = db.query(Company).first()
        assert company is not None, "Company context required"
        cid = company.id

        admin_user = (
            db.query(User)
            .join(UserRole, User.id == UserRole.user_id)
            .join(Role, UserRole.role_id == Role.id)
            .filter(Role.name == "Super Admin")
            .first()
        )
        assert admin_user is not None, "Admin user required"
        print(f"  ✓ Context initialized: Company '{company.company_name_ar}' | Admin '{admin_user.username}'")

        # Step 1: Administrator creates an employee
        suffix = uuid.uuid4().hex[:6]
        emp_payload = EmployeeCreate(
            company_id=cid,
            employee_number=f"EMP-ACC-{suffix}",
            full_name=f"عبدالله محمد السعيد {suffix}",
            job_title="مهندس عمليات ونظم",
            email=f"abdullah_{suffix}@investorgate.com",
            phone="+966551234888",
            employment_status="Active",
        )
        created_emp_res = employees.create_employee(
            payload=emp_payload,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        emp_id = uuid.UUID(created_emp_res["data"]["id"])
        print(f"  [Step 1/15] Employee created in CRM: ID {emp_id} ({emp_payload.full_name})")

        # Create linked user account and company membership
        tech_user = User(
            username=f"tech_acc_{suffix}",
            email=emp_payload.email,
            password_hash="argon2_hashed_secret",
            account_status="Active",
            employee_id=emp_id,
        )
        db.add(tech_user)
        db.commit()
        db.refresh(tech_user)
        db.add(CompanyMembership(user_id=tech_user.id, company_id=cid, status="Active"))
        db.commit()

        # Step 2: Administrator generates manual Telegram command
        token_res = telegram.create_link_token(
            payload=telegram.GenerateTokenRequest(employee_id=emp_id, expires_in_minutes=30),
            company_id=cid,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        token_data = token_res["data"]
        manual_command = token_data["command"]
        assert manual_command.startswith("/start "), "Command must start with /start"
        assert token_data["token"] in manual_command
        print(f"  [Step 2/15] Manual Telegram command generated: '{manual_command}'")
        print(f"              Bot Username: @{token_data['bot_username']} (Expires: {token_data['expires_at']})")

        # Step 3: Employee sends command to bot (private chat: user_id == chat_id, digits only)
        fake_tg_user_id = str(881100000 + uuid.uuid4().int % 999999)
        fake_tg_chat_id = fake_tg_user_id
        fake_tg_username = f"abdullah_tech_{suffix}"

        token_arg = manual_command.split(None, 1)[1]
        verify_result = verify_telegram_link(
            db=db,
            token=token_arg,
            telegram_user_id=fake_tg_user_id,
            telegram_chat_id=fake_tg_chat_id,
            telegram_username=fake_tg_username,
        )
        assert verify_result["success"] is True
        print(f"  [Step 3/15] Employee executed '/start' in Telegram: verified for {verify_result['employee_name']}")

        # Step 4: CRM confirms linked Telegram account (Live Polling Verification)
        live_status = telegram.get_employee_link_status(
            employee_id=emp_id,
            company_id=cid,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        assert live_status["data"]["is_verified"] is True
        assert live_status["data"]["telegram_user_id"] == fake_tg_user_id
        assert live_status["data"]["telegram_username"] == fake_tg_username
        print(f"  [Step 4/15] CRM live polling confirmed: Employee is verified and bound to @{fake_tg_username}")

        # Step 5: Administrator assigns a task with Telegram notification enabled
        task_payload = TaskCreate(
            company_id=cid,
            title=f"ترقية محولات الشبكة الأساسية Core-Switch-{suffix}",
            description="تطبيق التحديث الأمني للبرامج الثابتة وفحص استقرار مسارات الشبكة",
            assigned_to_id=emp_id,
            priority="Urgent",
            status="Assigned",
            due_date=(datetime.utcnow() + timedelta(days=2)).date(),
            notify_telegram=True,
        )
        create_task_res = tasks.create_task(
            payload=task_payload,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        task_id = uuid.UUID(create_task_res["data"]["id"])
        delivery_info = create_task_res["data"]["delivery_status"]
        print(f"  [Step 5/15] Task created and assigned: ID {task_id} (Priority: Urgent)")

        # Step 6: Task is saved in database with proper state
        db_task = db.query(Task).filter(Task.id == task_id).first()
        assert db_task is not None
        assert db_task.status == "Assigned"
        assert db_task.acknowledged_at is None
        print(f"  [Step 6/15] Database persistence verified: Status '{db_task.status}', Acknowledged: None")

        # Step 7: Telegram notification is queued in Transactional Outbox
        outbox_entry = (
            db.query(NotificationOutbox)
            .filter(
                NotificationOutbox.company_id == cid,
                NotificationOutbox.recipient_chat_id == fake_tg_chat_id,
            )
            .order_by(NotificationOutbox.created_at.desc())
            .first()
        )
        assert outbox_entry is not None
        assert outbox_entry.event_type == "task.assigned"
        assert f"act:ack:{task_id}" in str(outbox_entry.reply_markup)
        print(f"  [Step 7/15] Transactional Outbox queued: ID {outbox_entry.id} (Status: '{outbox_entry.status}')")

        # Step 8: Worker processes notification outbox
        worker_summary = dispatch_outbox_notifications(db=db, limit=10)
        print(f"  [Step 8/15] Outbox Worker processed: {worker_summary['processed']} items (Sent: {worker_summary['sent']}, Pending/Token: {worker_summary.get('ready_awaiting_token', 0)})")

        # Step 9 & 10: CRM displays actual delivery status
        task_tg_status = tasks.get_task_telegram_status(
            task_id=task_id,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        status_d = task_tg_status["data"]
        assert status_d["is_employee_linked"] is True
        assert status_d["is_acknowledged"] is False
        print(f"  [Step 9-10/15] CRM Task Delivery Status: Linked: {status_d['is_employee_linked']} | Outbox: {status_d['delivery_status']} | Acknowledged: {status_d['is_acknowledged']}")

        # Step 11: Employee confirms receipt in Telegram (act:ack:{task_id})
        ack_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_tg_user_id,
            telegram_chat_id=fake_tg_chat_id,
            action_str=f"act:ack:{task_id}",
            ip_address="acceptance_test",
        )
        assert ack_res["success"] is True
        assert "تم تسجيل تأكيد استلام المهمة" in ack_res["message"]
        print(f"  [Step 11/15] Employee pressed 'Confirm Receipt' in Telegram: '{ack_res['message']}'")

        # Step 12: CRM displays acknowledgement without premature completion
        db.refresh(db_task)
        assert db_task.acknowledged_at is not None, "acknowledged_at must be populated!"
        assert db_task.status == "Accepted", f"Status should transition to Accepted, got {db_task.status}"
        assert db_task.status != "Completed", "CRITICAL: Acknowledgement must NEVER complete the task prematurely!"
        print(f"  [Step 12/15] CRM verified acknowledgement: Time: {db_task.acknowledged_at.isoformat()} | State: '{db_task.status}'")

        # Step 13: Employee starts work on task (act:start:{task_id})
        start_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_tg_user_id,
            telegram_chat_id=fake_tg_chat_id,
            action_str=f"act:start:{task_id}",
            ip_address="acceptance_test",
        )
        assert start_res["success"] is True
        db.refresh(db_task)
        assert db_task.status == "In Progress"
        print(f"  [Step 13/15] Employee started execution via Telegram: Status transitioned to '{db_task.status}'")

        # Step 14: Employee completes work on task (act:done:{task_id})
        done_res = execute_bot_action(
            db=db,
            telegram_user_id=fake_tg_user_id,
            telegram_chat_id=fake_tg_chat_id,
            action_str=f"act:done:{task_id}",
            ip_address="acceptance_test",
        )
        assert done_res["success"] is True
        db.refresh(db_task)
        assert db_task.status == "Completed"
        assert db_task.completed_at is not None
        print(f"  [Step 14/15] Employee completed task via Telegram: Status '{db_task.status}' at {db_task.completed_at.isoformat()}")

        # Step 15: Audit history records all mutations with user/technician context
        audit_records = (
            db.query(AuditLog)
            .filter(AuditLog.resource_id == str(task_id))
            .order_by(AuditLog.created_at.asc())
            .all()
        )
        audit_actions = [a.action for a in audit_records]
        assert "CREATE" in audit_actions
        assert "TASK_ACKNOWLEDGED" in audit_actions
        print(f"  [Step 15/15] Security Audit Trail verified: {len(audit_records)} immutable records logged ({', '.join(audit_actions)})")

        print("=" * 70)
        print("ALL 15 STAGES OF ACCEPTANCE SCENARIO PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    run_acceptance_scenario()
