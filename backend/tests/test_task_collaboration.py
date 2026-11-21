# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Test Suite: Task Collaboration Engine & 9-State Lifecycle (Phase 1).

Covers:
- 9-state formal lifecycle transitions
- Blocker tracking with mandatory reason and unblocking
- Strict separation of duties: employee cannot self-approve completion
- Managerial rework request with mandatory feedback and counter tracking
- Final manager approval and completion workflow
- Multi-company data isolation enforcement
- Telegram Transactional Outbox integration
"""

import os
import sys
import uuid
from datetime import datetime, date, timedelta

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.models.company import Company, Branch
from app.models.user import User, Employee, Role, CompanyMembership
from app.models.task import Task, TaskComment
from app.models.telegram import NotificationOutbox
from app.core.security import hash_password
from app.services import task_service
from fastapi import HTTPException


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: TASK COLLABORATION ENGINE (PHASE 1)")
    print("=" * 65)

    init_db()
    db: Session = SessionLocal()

    try:
        # 1. Setup Test Companies & Roles
        comp_a = db.query(Company).filter(Company.company_code == "IGT").first()
        if not comp_a:
            comp_a = Company(
                company_name_ar="شركة بوابة المستثمر الأولى",
                company_name_en="Investor Gate Tech A",
                company_code="IGT",
            )
            db.add(comp_a)
            db.commit()

        comp_b = db.query(Company).filter(Company.company_code == "EXT").first()
        if not comp_b:
            comp_b = Company(
                company_name_ar="الشركة الخارجية المستقلة",
                company_name_en="External Company B",
                company_code="EXT",
            )
            db.add(comp_b)
            db.commit()

        tech_role = db.query(Role).filter(Role.name == "IT Technician").first()
        mgr_role = db.query(Role).filter(Role.name == "IT Manager").first()

        # 2. Setup Test Employees & Users
        # Employee 1: IT Technician in Comp A (The Assignee)
        unique_suffix = str(uuid.uuid4())[:8]
        emp_assignee = Employee(
            company_id=comp_a.id,
            employee_number=f"EMP-COL-{unique_suffix}",
            full_name=f"فهد المهام {unique_suffix}",
            email=f"fahad_{unique_suffix}@investorgate.sa",
            job_title="فني شبكات",
            employment_status="Active",
        )
        db.add(emp_assignee)
        db.commit()

        user_assignee = User(
            username=f"tech_{unique_suffix}",
            email=emp_assignee.email,
            password_hash=hash_password("Pass@123456"),
            employee_id=emp_assignee.id,
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user_assignee)
        db.commit()

        mem_tech = CompanyMembership(
            user_id=user_assignee.id,
            company_id=comp_a.id,
            role_id=tech_role.id if tech_role else None,
            status="Active",
        )
        db.add(mem_tech)
        db.commit()

        # User 2: IT Manager in Comp A (The Reviewer/Approver)
        user_manager = User(
            username=f"mgr_{unique_suffix}",
            email=f"manager_{unique_suffix}@investorgate.sa",
            password_hash=hash_password("Pass@123456"),
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user_manager)
        db.commit()

        mem_mgr = CompanyMembership(
            user_id=user_manager.id,
            company_id=comp_a.id,
            role_id=mgr_role.id if mgr_role else None,
            status="Active",
        )
        db.add(mem_mgr)
        db.commit()

        # User 3: Technician in Comp B (Cross-company attacker)
        user_external = User(
            username=f"ext_{unique_suffix}",
            email=f"ext_{unique_suffix}@othercomp.sa",
            password_hash=hash_password("Pass@123456"),
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user_external)
        db.commit()

        mem_ext = CompanyMembership(
            user_id=user_external.id,
            company_id=comp_b.id,
            role_id=tech_role.id if tech_role else None,
            status="Active",
        )
        db.add(mem_ext)
        db.commit()

        print("  ✓ Setup test company, technician, and manager identities")

        # ── Test 1: Task Creation ─────────────────────────────────────
        task = Task(
            company_id=comp_a.id,
            title=f"ترقية خوادم قواعد البيانات {unique_suffix}",
            description="تنفيذ الترقية الدورية وضبط محددات الأداء",
            priority="High",
            status="Assigned",
            assigned_to_id=emp_assignee.id,
            assigned_by_id=user_manager.id,
            due_date=date.today() + timedelta(days=3),
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        assert task.status == "Assigned"
        assert task.is_blocked is False
        assert task.rework_count == 0
        print(f"  ✓ Task created with initial status 'Assigned' (ID: {task.id})")

        # ── Test 2: Assignee Accepts Task ─────────────────────────────
        task_service.accept_task(task=task, user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "Accepted"
        assert task.accepted_at is not None
        print("  ✓ Assignee formally accepted the task (Status -> Accepted)")

        # ── Test 3: Assignee Starts Working ───────────────────────────
        task_service.start_task(task=task, user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "In Progress"
        print("  ✓ Task started (Status -> In Progress)")

        # ── Test 4: Blocker Flow ──────────────────────────────────────
        # Reject blocking without reason
        try:
            task_service.block_task(task=task, blocker_reason="", user=user_assignee, db=db)
            assert False, "Should fail when blocker reason is empty"
        except HTTPException as e:
            assert e.status_code == 400
            print("  ✓ Empty blocker reason correctly rejected with 400 Bad Request")

        # Valid block
        block_msg = "انقطاع التيار الكهربائي في غرفة البيانات الرئيسية"
        task_service.block_task(task=task, blocker_reason=block_msg, user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "Blocked"
        assert task.is_blocked is True
        assert task.blocker_reason == block_msg
        assert task.blocked_at is not None

        # Verify comment was automatically posted
        c_block = db.query(TaskComment).filter(TaskComment.task_id == task.id).order_by(TaskComment.created_at.desc()).first()
        assert c_block is not None
        assert block_msg in c_block.content
        print("  ✓ Task blocked with mandatory reason and automated audit comment")

        # Unblock task
        task_service.unblock_task(task=task, user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "In Progress"
        assert task.is_blocked is False
        assert task.unblocked_at is not None
        print("  ✓ Blocker resolved; task resumed (Status -> In Progress)")

        # ── Test 5: Submission for Review ─────────────────────────────
        submit_notes = "تم تثبيت الحزم بنجاح وإعادة تشغيل الخدمة بنجاح 100%"
        task_service.submit_for_review(task=task, notes=submit_notes, user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "Submitted for Review"
        assert task.submitted_for_review_at is not None
        # CRITICAL RULE: Submission must NOT mark the task completed!
        assert task.status != "Completed"
        assert task.completed_at is None
        print("  ✓ Task submitted for review (NOT completed; awaiting manager approval)")

        # ── Test 6: Separation of Duties (Employee Cannot Self-Approve)
        try:
            task_service.approve_task(task=task, review_notes="أوافق لنفسي", reviewer=user_assignee, db=db)
            assert False, "Employee should not be able to self-approve completion!"
        except HTTPException as e:
            assert e.status_code == 403
            print("  ✓ Separation of duties enforced: Employee self-approval strictly blocked (403 Forbidden)")

        # ── Test 7: Rework Flow ───────────────────────────────────────
        # Manager requests rework
        rework_feedback = "يرجى تقديم تقرير النسخ الاحتياطي قبل وبعد الترقية"
        task_service.rework_task(task=task, rework_notes=rework_feedback, reviewer=user_manager, db=db)
        db.refresh(task)
        assert task.status == "Rework Required"
        assert task.rework_count == 1
        assert task.review_notes == rework_feedback
        assert task.reviewer_id == user_manager.id

        c_rework = db.query(TaskComment).filter(TaskComment.task_id == task.id).order_by(TaskComment.created_at.desc()).first()
        assert "مطلوب تعديلات" in c_rework.content
        print("  ✓ Manager requested rework with required instructions (Counter: 1)")

        # Assignee fulfills rework and re-submits
        task_service.start_task(task=task, user=user_assignee, db=db)
        task_service.submit_for_review(task=task, notes="تم إرفاق تقارير النسخ الاحتياطي", user=user_assignee, db=db)
        db.refresh(task)
        assert task.status == "Submitted for Review"
        print("  ✓ Assignee fulfilled rework and re-submitted for review")

        # ── Test 8: Manager Approval and Completion ───────────────────
        approval_notes = "تم التحقق من كافة التقارير والاعتماد النهائي"
        task_service.approve_task(task=task, review_notes=approval_notes, reviewer=user_manager, db=db)
        db.refresh(task)
        assert task.status == "Completed"
        assert task.completed_at is not None
        assert task.reviewer_id == user_manager.id
        print("  ✓ Manager approved task; officially completed (Status -> Completed)")

        # ── Test 9: Multi-Company Data Isolation ──────────────────────
        try:
            task_service.assert_task_access(task, user_external, comp_b.id)
            assert False, "Cross-company access must be blocked!"
        except HTTPException as e:
            assert e.status_code == 403
            print("  ✓ Multi-company isolation strictly enforced (Company B user blocked from Company A task)")

        # ── Test 10: Invalid Transition Defense ───────────────────────
        draft_task = Task(
            company_id=comp_a.id,
            title="مهمة مسودة تجريبية",
            status="Draft",
        )
        db.add(draft_task)
        db.commit()

        try:
            # Illegal leap from Draft directly to Completed
            task_service.validate_transition(draft_task, "Completed", user_assignee, db)
            assert False, "Illegal transition from Draft directly to Completed must be rejected"
        except HTTPException as e:
            assert e.status_code == 400
            print("  ✓ Invalid transition defense verified: illegal leaps strictly rejected (400 Bad Request)")

        # ── Test 11: Telegram Outbox Integration ──────────────────────
        outbox_items = db.query(NotificationOutbox).filter(
            NotificationOutbox.company_id == comp_a.id,
        ).all()
        # Find items related to our task
        task_outbox = [item for item in outbox_items if item.payload and str(item.payload.get("task_id")) == str(task.id)]
        assert len(task_outbox) > 0
        event_types = [item.event_type for item in task_outbox]
        assert any(e in ["task.accepted", "task.started", "task.submitted", "task.completed"] for e in event_types)
        print(f"  ✓ Telegram Outbox verified: {len(task_outbox)} task lifecycle events safely recorded")

        print("=" * 65)
        print("ALL 11 TASK COLLABORATION TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
