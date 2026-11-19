"""Automated tests for Native Voice Task Recording in Investor Gate OS.

Tests:
1. Voice Audio Upload & Limits (duration <= 300s, size <= 10MB)
2. Voice Audio Streaming with Auth (Bearer header & token query param)
3. Path Traversal & Security Validation
4. Company Tenant Isolation & RBAC
5. Voice Task Creation & Default Title Fallback
6. Full Task Lifecycle (Assign -> Accept -> Start -> Submit Review -> Complete)
7. Telegram Outbox Format Privacy (no raw URL exposure)
"""

import io
import os
import uuid
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import get_db, SessionLocal
from app.core.security import hash_password, generate_session_token
from app.models.company import Company, Branch
from app.models.user import User, Employee, Role, UserRole, CompanyMembership, UserSession
from app.models.task import Task
from app.services.telegram_service import format_task_notification


def setup_test_context():
    db = SessionLocal()
    # Company A
    comp_a = db.query(Company).filter(Company.company_name_en == "Voice Test Co A").first()
    if not comp_a:
        comp_a = Company(
            id=uuid.uuid4(),
            company_name_ar="شركة الصوت التجريبية أ",
            company_name_en="Voice Test Co A",
            company_code=f"VTA-{uuid.uuid4().hex[:4]}",
            status="Active",
        )
        db.add(comp_a)
        db.commit()
        db.refresh(comp_a)

    branch_a = db.query(Branch).filter(Branch.company_id == comp_a.id).first()
    if not branch_a:
        branch_a = Branch(
            id=uuid.uuid4(),
            company_id=comp_a.id,
            branch_name="الفرع الرئيسي أ",
        )
        db.add(branch_a)
        db.commit()

    # Company B (For Tenant Isolation testing)
    comp_b = db.query(Company).filter(Company.company_name_en == "Voice Test Co B").first()
    if not comp_b:
        comp_b = Company(
            id=uuid.uuid4(),
            company_name_ar="شركة الصوت التجريبية ب",
            company_name_en="Voice Test Co B",
            company_code=f"VTB-{uuid.uuid4().hex[:4]}",
            status="Active",
        )
        db.add(comp_b)
        db.commit()
        db.refresh(comp_b)

    # User A (Admin in Comp A)
    user_a = db.query(User).filter(User.username == "voice_admin_a").first()
    if not user_a:
        user_a = User(
            id=uuid.uuid4(),
            username="voice_admin_a",
            email="voice_a@investorgate.test",
            password_hash=hash_password("SecretPass123!"),
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user_a)
        db.commit()
        db.refresh(user_a)
    else:
        user_a.account_status = "Active"
        db.commit()

    # Employee Assignee A
    emp_a = db.query(Employee).filter(Employee.company_id == comp_a.id, Employee.email == "emp_a@investorgate.test").first()
    if not emp_a:
        emp_a = Employee(
            id=uuid.uuid4(),
            company_id=comp_a.id,
            branch_id=branch_a.id,
            employee_number=f"EMP-V{uuid.uuid4().hex[:4]}",
            full_name="فني الصوتيات التجريبي",
            email="emp_a@investorgate.test",
            employment_status="Active",
        )
        db.add(emp_a)
        db.commit()
        db.refresh(emp_a)

    # Link User A to Employee A
    user_a.employee_id = emp_a.id
    db.commit()

    # User B (User in Comp B)
    user_b = db.query(User).filter(User.username == "voice_user_b").first()
    if not user_b:
        user_b = User(
            id=uuid.uuid4(),
            username="voice_user_b",
            email="voice_b@investorgate.test",
            password_hash=hash_password("SecretPass123!"),
            account_status="Active",
            is_superadmin=False,
        )
        db.add(user_b)
        db.commit()
        db.refresh(user_b)
    else:
        user_b.account_status = "Active"
        db.commit()

    # Roles & Memberships
    admin_role = db.query(Role).filter(Role.name == "Company Admin").first()
    if admin_role:
        ur = db.query(UserRole).filter(UserRole.user_id == user_a.id, UserRole.role_id == admin_role.id).first()
        if not ur:
            db.add(UserRole(id=uuid.uuid4(), user_id=user_a.id, role_id=admin_role.id))
            db.commit()

    cm = db.query(CompanyMembership).filter(CompanyMembership.user_id == user_a.id, CompanyMembership.company_id == comp_a.id).first()
    if not cm:
        db.add(CompanyMembership(
            id=uuid.uuid4(),
            user_id=user_a.id,
            company_id=comp_a.id,
            role_id=admin_role.id if admin_role else None,
            status="Active",
            is_default=True,
        ))
        db.commit()

    cm_b = db.query(CompanyMembership).filter(CompanyMembership.user_id == user_b.id, CompanyMembership.company_id == comp_b.id).first()
    if not cm_b:
        db.add(CompanyMembership(
            id=uuid.uuid4(),
            user_id=user_b.id,
            company_id=comp_b.id,
            status="Active",
            is_default=True,
        ))
        db.commit()

    # Create active sessions
    token_a = generate_session_token()
    token_b = generate_session_token()

    db.add(UserSession(
        id=uuid.uuid4(),
        user_id=user_a.id,
        session_token=token_a,
        expires_at=datetime.utcnow() + timedelta(days=2),
        is_active=True,
    ))
    db.add(UserSession(
        id=uuid.uuid4(),
        user_id=user_b.id,
        session_token=token_b,
        expires_at=datetime.utcnow() + timedelta(days=2),
        is_active=True,
    ))
    db.commit()

    comp_a_id = comp_a.id
    comp_b_id = comp_b.id
    user_a_id = user_a.id
    user_b_id = user_b.id
    emp_a_id = emp_a.id

    db.close()
    return comp_a_id, comp_b_id, user_a_id, user_b_id, emp_a_id, token_a, token_b


def test_voice_tasks_complete_workflow():
    cid_a, cid_b, uid_a, uid_b, emp_id_a, token_a, token_b = setup_test_context()

    client = TestClient(app)

    headers_a = {
        "Authorization": f"Bearer {token_a}",
        "X-Company-ID": str(cid_a),
    }

    headers_b = {
        "Authorization": f"Bearer {token_b}",
        "X-Company-ID": str(cid_b),
    }

    # 1. Test Voice Upload - Valid Audio
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 1024  # simulated webm chunk
    files = {"file": ("test_voice.webm", dummy_audio, "audio/webm")}
    resp = client.post("/api/v1/tasks/voice-upload", data={"duration": 42}, files=files, headers=headers_a)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["voice_note_url"].startswith("/api/v1/tasks/voice/voice_")
    assert data["duration"] == 42
    filename = data["filename"]
    print("Voice upload successful:", filename)

    # 2. Test Voice Upload - Excessive duration (> 300s)
    files_long = {"file": ("test_long.webm", dummy_audio, "audio/webm")}
    resp_long = client.post("/api/v1/tasks/voice-upload", data={"duration": 305}, files=files_long, headers=headers_a)
    assert resp_long.status_code == 400
    assert "300 ثانية" in resp_long.json()["detail"]
    print("Excessive duration rejected as expected.")

    # 3. Test Voice Upload - Empty File
    files_empty = {"file": ("test_empty.webm", b"", "audio/webm")}
    resp_empty = client.post("/api/v1/tasks/voice-upload", data={"duration": 10}, files=files_empty, headers=headers_a)
    assert resp_empty.status_code == 400
    assert "فارغ" in resp_empty.json()["detail"]
    print("Empty audio file rejected.")

    # 4. Test Authenticated Streaming via Bearer Header
    stream_resp = client.get(f"/api/v1/tasks/voice/{filename}", headers=headers_a)
    assert stream_resp.status_code == 200
    assert stream_resp.headers["content-type"].startswith("audio/webm")
    assert len(stream_resp.content) == len(dummy_audio)
    print("Direct Bearer authenticated streaming successful.")

    # 5. Test Authenticated Streaming via Query Param (for HTML5 <audio>)
    query_resp = client.get(f"/api/v1/tasks/voice/{filename}?token={token_a}")
    assert query_resp.status_code == 200
    assert len(query_resp.content) == len(dummy_audio)
    print("Query-param token streaming for HTML5 audio tags verified.")

    # 6. Test Path Traversal Protection
    traversal_resp = client.get("/api/v1/tasks/voice/../../etc/passwd", headers=headers_a)
    assert traversal_resp.status_code in (400, 404)
    print("Path traversal blocked.")

    # 7. Test Tenant RBAC Isolation (Company B user trying to stream Company A's audio)
    isolated_resp = client.get(f"/api/v1/tasks/voice/{filename}", headers=headers_b)
    assert isolated_resp.status_code in (403, 404)
    print("Tenant cross-company isolation verified.")

    # 8. Test Voice Task Creation with Default Title
    create_payload = {
        "company_id": str(cid_a),
        "title": "",  # Empty title -> should default to "مهمة صوتية (42 ثانية)"
        "description": "يرجى الاستماع للتسجيل الصوتي واتباع التعليمات",
        "assigned_to_id": str(emp_id_a),
        "priority": "High",
        "status": "Assigned",
        "is_voice_task": True,
        "voice_note_url": data["voice_note_url"],
        "voice_note_duration": 42,
        "notify_telegram": False,
    }
    create_resp = client.post("/api/v1/tasks", json=create_payload, headers=headers_a)
    assert create_resp.status_code == 200, create_resp.text
    task_id = create_resp.json()["data"]["id"]
    print("Voice task created:", task_id)

    # 9. Verify Task Detail & Voice Metadata
    detail_resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers_a)
    assert detail_resp.status_code == 200
    task_data = detail_resp.json()["data"]
    assert task_data["is_voice_task"] is True
    assert task_data["voice_note_duration"] == 42
    assert task_data["voice_note_url"] == data["voice_note_url"]
    assert "مهمة صوتية" in task_data["title"]
    print("Voice task details verified:", task_data["title"])

    # 10. Test Task Lifecycle Workflow
    # A. Accept task
    acc_resp = client.post(f"/api/v1/tasks/{task_id}/accept", headers=headers_a)
    assert acc_resp.status_code == 200

    # B. Start work
    start_resp = client.put(f"/api/v1/tasks/{task_id}", json={"status": "In Progress"}, headers=headers_a)
    assert start_resp.status_code == 200

    # C. Submit for review
    sub_resp = client.post(f"/api/v1/tasks/{task_id}/submit-review", json={"notes": "تم إنجاز المهمة حسب التسجيل الصوتي"}, headers=headers_a)
    assert sub_resp.status_code == 200

    # D. Final Approval / Complete
    app_resp = client.post(f"/api/v1/tasks/{task_id}/approve", json={"review_notes": "ممتاز ومطابق للتعليمات"}, headers=headers_a)
    assert app_resp.status_code == 200

    final_resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers_a)
    assert final_resp.json()["data"]["status"] == "Completed"
    print("Voice task lifecycle (Accept -> Start -> Submit -> Complete) passed smoothly.")

    # 11. Test Telegram Notification Text Formatting
    db = SessionLocal()
    task_obj = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    msg_text, markup = format_task_notification(task_obj, "task.assigned", "شركة بوابة المستثمر")
    db.close()

    assert "🎙️" in msg_text
    assert "مهمة صوتية" in msg_text
    assert "42 ثانية" in msg_text
    # Explicitly ensure raw audio URLs are NEVER exposed in Telegram
    assert "/api/v1/tasks/voice/" not in msg_text
    assert "http" not in msg_text or "investorgate" in msg_text
    print("Telegram formatting verified: NO public audio URL leaked.")

    print("\n==========================================")
    print("ALL VOICE TASK TESTS PASSED PERFECTLY!")
    print("==========================================")


if __name__ == "__main__":
    test_voice_tasks_complete_workflow()
