# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Verification of Tasks Collaboration Endpoints with direct API routing."""

import os
import sys
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User, Employee, Role, CompanyMembership
from app.models.task import Task
from app.core.security import hash_password
from app.api.v1.endpoints import tasks
from app.schemas.task import TaskCreate, TaskBlockRequest, TaskSubmitReviewRequest, TaskReviewRequest
from fastapi import HTTPException

def test_tasks_endpoint_flow():
    print("=" * 65)
    print("STARTING DIRECT ENDPOINT TEST: TASKS COLLABORATION LIFECYCLE")
    print("=" * 65)

    init_db()
    db = SessionLocal()

    try:
        # 1. Obtain test company and users
        comp = db.query(Company).filter(Company.company_code == "IGT").first()
        assert comp is not None

        mgr_user = db.query(User).filter(User.username == "admin").first()
        assert mgr_user is not None

        unique_suffix = str(uuid.uuid4())[:8]
        emp = Employee(
            company_id=comp.id,
            employee_number=f"EMP-API-{unique_suffix}",
            full_name=f"فني الاختبار {unique_suffix}",
            email=f"tech_api_{unique_suffix}@investorgate.sa",
            job_title="فني دعم",
            employment_status="Active",
        )
        db.add(emp)
        db.commit()

        tech_role = db.query(Role).filter(Role.name == "IT Technician").first()
        tech_user = User(
            username=f"tech_api_{unique_suffix}",
            email=emp.email,
            password_hash=hash_password("Pass@123456"),
            employee_id=emp.id,
            account_status="Active",
            is_superadmin=False,
        )
        db.add(tech_user)
        db.commit()

        mem = CompanyMembership(
            user_id=tech_user.id,
            company_id=comp.id,
            role_id=tech_role.id if tech_role else None,
            status="Active",
            is_default=True,
        )
        db.add(mem)
        db.commit()

        # 2. tasks.create_task (Manager creates task assigned to technician)
        create_payload = TaskCreate(
            company_id=comp.id,
            title=f"فحص جدار الحماية الرئيسي {unique_suffix}",
            description="فحص قواعد الأمان وقوائم النفاذ",
            priority="High",
            status="Assigned",
            assigned_to_id=emp.id,
            due_date=date.today() + timedelta(days=2),
        )
        res_create = tasks.create_task(payload=create_payload, current_user=mgr_user, active_cid=comp.id, db=db)
        task_id = uuid.UUID(res_create["data"]["id"])
        print(f"  ✓ tasks.create_task: Created task (ID: {task_id})")

        # 3. tasks.accept_task_endpoint (Technician accepts)
        res_accept = tasks.accept_task_endpoint(task_id=task_id, current_user=tech_user, active_cid=comp.id, db=db)
        assert res_accept["data"]["status"] == "Accepted"
        print("  ✓ tasks.accept_task_endpoint: Status -> Accepted")

        # 4. tasks.start_task_endpoint (Technician starts)
        res_start = tasks.start_task_endpoint(task_id=task_id, current_user=tech_user, active_cid=comp.id, db=db)
        assert res_start["data"]["status"] == "In Progress"
        print("  ✓ tasks.start_task_endpoint: Status -> In Progress")

        # 5. tasks.block_task_endpoint (Technician blocks with reason)
        block_payload = TaskBlockRequest(reason="انتظار مفتاح التشفير من الإدارة")
        res_block = tasks.block_task_endpoint(task_id=task_id, payload=block_payload, current_user=tech_user, active_cid=comp.id, db=db)
        assert res_block["data"]["status"] == "Blocked"
        print("  ✓ tasks.block_task_endpoint: Status -> Blocked")

        # 6. tasks.unblock_task_endpoint (Technician unblocks)
        res_unblock = tasks.unblock_task_endpoint(task_id=task_id, current_user=tech_user, active_cid=comp.id, db=db)
        assert res_unblock["data"]["status"] == "In Progress"
        print("  ✓ tasks.unblock_task_endpoint: Status -> In Progress")

        # 7. tasks.submit_for_review_endpoint (Technician submits for review)
        submit_payload = TaskSubmitReviewRequest(notes="تم الانتهاء من الفحص وتحديث القواعد")
        res_submit = tasks.submit_for_review_endpoint(task_id=task_id, payload=submit_payload, current_user=tech_user, active_cid=comp.id, db=db)
        assert res_submit["data"]["status"] == "Submitted for Review"
        print("  ✓ tasks.submit_for_review_endpoint: Status -> Submitted for Review")

        # 8. tasks.approve_task_endpoint (Technician attempts self-approval -> MUST FAIL 403)
        try:
            tasks.approve_task_endpoint(task_id=task_id, payload=TaskReviewRequest(review_notes="محاولة اعتماد ذاتي"), current_user=tech_user, active_cid=comp.id, db=db)
            assert False, "Technician self-approval must raise 403 Forbidden!"
        except HTTPException as e:
            assert e.status_code == 403
            print("  ✓ tasks.approve_task_endpoint (Self-approval by technician): Blocked with 403 Forbidden")

        # 9. tasks.rework_task_endpoint (Manager requests rework)
        rework_payload = TaskReviewRequest(review_notes="يرجى إعادة اختبار المنفذ 443")
        res_rework = tasks.rework_task_endpoint(task_id=task_id, payload=rework_payload, current_user=mgr_user, active_cid=comp.id, db=db)
        assert res_rework["data"]["status"] == "Rework Required"
        assert res_rework["data"]["rework_count"] == 1
        print("  ✓ tasks.rework_task_endpoint: Status -> Rework Required (Count: 1)")

        # 10. Technician resumes and re-submits
        tasks.start_task_endpoint(task_id=task_id, current_user=tech_user, active_cid=comp.id, db=db)
        tasks.submit_for_review_endpoint(task_id=task_id, payload=TaskSubmitReviewRequest(notes="تم فحص المنفذ 443 بنجاح"), current_user=tech_user, active_cid=comp.id, db=db)

        # 11. tasks.approve_task_endpoint (Manager approves)
        approve_payload = TaskReviewRequest(review_notes="معتمد ومكتمل بعد إعادة الفحص")
        res_approve = tasks.approve_task_endpoint(task_id=task_id, payload=approve_payload, current_user=mgr_user, active_cid=comp.id, db=db)
        assert res_approve["data"]["status"] == "Completed"
        print("  ✓ tasks.approve_task_endpoint: Status -> Completed (Officially approved by manager)")

        # 12. tasks.get_task (Verify response metadata)
        res_detail = tasks.get_task(task_id=task_id, current_user=mgr_user, active_cid=comp.id, db=db)
        d = res_detail["data"]
        assert d["status"] == "Completed"
        assert d["reviewer_name"] == mgr_user.username
        assert d["review_notes"] == "معتمد ومكتمل بعد إعادة الفحص"
        assert d["rework_count"] == 1
        assert d["completed_at"] is not None
        assert d["accepted_at"] is not None
        assert len(d["comments"]) >= 4
        print("  ✓ tasks.get_task: Verified complete collaboration timeline and metadata")

        print("=" * 65)
        print("ALL DIRECT TASKS ENDPOINT TESTS PASSED 100%! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()

if __name__ == "__main__":
    test_tasks_endpoint_flow()
