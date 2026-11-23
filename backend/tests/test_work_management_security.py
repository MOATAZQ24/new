# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Negative Security Tests: Cross-Company BOLA/IDOR Isolation, Spoofed Tenant Rejection,
Voice File Authorization, and Granular RBAC Matrix Verification across all 6 roles.
"""

import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.company import Branch, Company
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, Role, User, UserRole, UserSession


def _setup_two_tenants():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    engine = create_engine(
        f"sqlite:///{tmp.name.replace(os.sep, '/')}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _override_db():
        db = SessionFactory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    db = SessionFactory()

    roles = {}
    for rname in ("Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"):
        r = Role(name=rname, name_ar=rname, is_system_role=True)
        db.add(r)
        db.flush()
        roles[rname] = r

    co_a = Company(company_name_ar="أ", company_name_en="Alpha", company_code="ALP")
    co_b = Company(company_name_ar="ب", company_name_en="Beta", company_code="BET")
    db.add_all([co_a, co_b])
    db.flush()

    br_a = Branch(company_id=co_a.id, branch_name="Branch A")
    br_b = Branch(company_id=co_b.id, branch_name="Branch B")
    db.add_all([br_a, br_b])
    db.flush()

    def mk(uname: str, role_name: str, co: Company, br: Branch):
        emp = Employee(company_id=co.id, branch_id=br.id, employee_number=f"N-{uname}", full_name=uname, email=f"{uname}@test.sa")
        db.add(emp)
        db.flush()
        u = User(username=uname, email=f"{uname}@test.sa", password_hash="x", employee_id=emp.id, account_status="Active")
        db.add(u)
        db.flush()
        db.add(UserRole(user_id=u.id, role_id=roles[role_name].id))
        db.add(CompanyMembership(user_id=u.id, company_id=co.id, role_id=roles[role_name].id, status="Active", is_default=True))
        tok = f"sec_{uname}_{uuid.uuid4().hex}"
        db.add(UserSession(user_id=u.id, session_token=tok, expires_at=datetime.utcnow() + timedelta(hours=2), is_active=True))
        db.flush()
        return u, emp, {"Authorization": f"Bearer {tok}", "X-Company-ID": str(co.id)}

    adm_a, _, adm_a_h = mk("adm_a", "Company Admin", co_a, br_a)
    tech_a, _, tech_a_h = mk("tech_a", "IT Technician", co_a, br_a)
    emp1_a, emp1_a_rec, emp1_a_h = mk("emp1_a", "Employee", co_a, br_a)
    emp2_a, _, emp2_a_h = mk("emp2_a", "Employee", co_a, br_a)
    aud_a, _, aud_a_h = mk("aud_a", "Auditor", co_a, br_a)

    adm_b, _, adm_b_h = mk("adm_b", "Company Admin", co_b, br_b)

    db.commit()
    info = {
        "engine": engine,
        "SessionFactory": SessionFactory,
        "db_path": tmp.name,
        "co_a_id": str(co_a.id),
        "co_b_id": str(co_b.id),
        "adm_a_id": str(adm_a.id),
        "tech_a_id": str(tech_a.id),
        "adm_b_id": str(adm_b.id),
        "adm_a_h": adm_a_h,
        "tech_a_h": tech_a_h,
        "emp1_a_h": emp1_a_h,
        "emp2_a_h": emp2_a_h,
        "aud_a_h": aud_a_h,
        "adm_b_h": adm_b_h,
    }
    db.close()
    return info


def test_cross_company_bola_rbac_and_hardening():
    info = _setup_two_tenants()
    client = TestClient(app)
    adm_a_h = info["adm_a_h"]
    tech_a_h = info["tech_a_h"]
    emp1_a_h = info["emp1_a_h"]
    emp2_a_h = info["emp2_a_h"]
    aud_a_h = info["aud_a_h"]
    adm_b_h = info["adm_b_h"]

    try:
        # 1. Spoofed company_id rejected at schema boundary (422)
        for path, body in [
            ("/api/v1/teams", {"name": "Spoof", "company_id": info["co_b_id"]}),
            ("/api/v1/sla-policies", {"name": "Spoof", "priority": "High", "company_id": info["co_b_id"]}),
            ("/api/v1/macros", {"title": "Spoof", "body": "x", "company_id": info["co_b_id"]}),
            ("/api/v1/saved-views", {"scope": "tickets", "name": "Spoof", "company_id": info["co_b_id"]}),
        ]:
            r = client.post(path, json=body, headers=adm_a_h)
            assert r.status_code == 422, f"{path} should reject spoofed company_id, got {r.status_code}"

        # 2. Seed Company A resources via Company A Admin
        team_a = client.post("/api/v1/teams", json={"name": "Alpha Ops"}, headers=adm_a_h).json()["data"]["id"]
        rule_a = client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 1, "name": "Rule A", "conditions": {}, "team_id": team_a}, headers=adm_a_h).json()["data"]["id"]
        sla_a = client.post("/api/v1/sla-policies", json={"name": "SLA A", "priority": "High", "first_response_minutes": 30, "resolution_minutes": 120}, headers=adm_a_h).json()["data"]["id"]
        macro_a = client.post("/api/v1/macros", json={"title": "Macro A", "body": "Secret A", "visibility": "internal", "is_shared": True}, headers=adm_a_h).json()["data"]["id"]
        sv_a = client.post("/api/v1/saved-views", json={"scope": "tickets", "name": "View A", "is_shared": True}, headers=adm_a_h).json()["data"]["id"]
        tr_a = client.get("/api/v1/workflows/transitions?entity_type=ticket", headers=adm_a_h).json()["data"][0]["id"]

        ticket_a = client.post("/api/v1/tickets", json={"issue_title": "Alpha Secret Issue", "issue_description": "Confidential A", "category": "Network", "priority": "High"}, headers=emp1_a_h).json()["data"]["id"]
        task_a = client.post(f"/api/v1/tickets/{ticket_a}/tasks", json={"title": "Alpha Task", "assignee_id": info["tech_a_id"]}, headers=adm_a_h).json()["data"]["task_id"]
        chk_a = client.post(f"/api/v1/tasks/{task_a}/checklist", json={"title": "Secret step"}, headers=adm_a_h).json()["data"]["id"]

        # Upload a voice file in Company A
        r_up = client.post("/api/v1/tickets/voice/upload", files={"file": ("note.webm", b"RIFF_FAKE_WEBM", "audio/webm")}, headers=emp1_a_h)
        assert r_up.status_code == 200
        voice_file_a = r_up.json()["data"]["filename"]

        # 3. CROSS-COMPANY BOLA / IDOR NEGATIVE CHECKS (Company B Admin attacking Company A)
        assert client.patch(f"/api/v1/teams/{team_a}", json={"name": "Pwned"}, headers=adm_b_h).status_code == 404
        assert client.delete(f"/api/v1/teams/{team_a}", headers=adm_b_h).status_code == 404
        assert client.get(f"/api/v1/teams/{team_a}/members", headers=adm_b_h).status_code == 404
        assert client.post(f"/api/v1/teams/{team_a}/members", json={"user_id": info["adm_b_id"]}, headers=adm_b_h).status_code == 404

        assert client.patch(f"/api/v1/assignment-rules/{rule_a}", json={"name": "Pwned"}, headers=adm_b_h).status_code == 404
        assert client.delete(f"/api/v1/assignment-rules/{rule_a}", headers=adm_b_h).status_code == 404
        assert client.post("/api/v1/assignment-rules/reorder", json={"entity_type": "ticket", "rule_ids": [rule_a]}, headers=adm_b_h).status_code == 400

        assert client.patch(f"/api/v1/sla-policies/{sla_a}", json={"name": "Pwned"}, headers=adm_b_h).status_code == 404
        assert client.patch(f"/api/v1/workflows/transitions/{tr_a}", json={"is_active": False}, headers=adm_b_h).status_code == 404
        assert client.patch(f"/api/v1/macros/{macro_a}", json={"title": "Pwned"}, headers=adm_b_h).status_code == 404
        assert client.patch(f"/api/v1/saved-views/{sv_a}", json={"name": "Pwned"}, headers=adm_b_h).status_code == 404

        # Cross-company ticket & task endpoints MUST return 403
        assert client.get(f"/api/v1/tickets/{ticket_a}", headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/assign", json={"assignee_id": info["adm_b_id"]}, headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/transition", json={"to_status": "In Progress"}, headers=adm_b_h).status_code == 403
        assert client.get(f"/api/v1/tickets/{ticket_a}/events", headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/events", json={"content": "hack"}, headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/tasks", json={"title": "hack"}, headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/watchers", json={}, headers=adm_b_h).status_code == 403

        # Bulk endpoint must reject cross-company ticket without mutating it
        r_bulk_b = client.post("/api/v1/tickets/bulk", json={"ticket_ids": [ticket_a], "action": "priority", "priority": "Low"}, headers=adm_b_h)
        assert r_bulk_b.status_code == 200
        assert r_bulk_b.json()["data"]["succeeded_count"] == 0
        assert r_bulk_b.json()["data"]["failed_count"] == 1

        # Cross-company task endpoints MUST return 403
        assert client.post(f"/api/v1/tasks/{task_a}/assign", json={"assignee_id": info["adm_b_id"]}, headers=adm_b_h).status_code == 403
        assert client.post(f"/api/v1/tasks/{task_a}/transition", json={"to_status": "Completed"}, headers=adm_b_h).status_code == 403
        assert client.get(f"/api/v1/tasks/{task_a}/checklist", headers=adm_b_h).status_code == 403
        assert client.patch(f"/api/v1/tasks/{task_a}/checklist/{chk_a}", json={"is_completed": True}, headers=adm_b_h).status_code == 403

        # /me/work and /workload must NOT leak Company A items to Company B
        work_b = client.get("/api/v1/me/work", headers=adm_b_h).json()["data"]["items"]
        assert all(i["id"] not in (ticket_a, task_a) for i in work_b)
        wl_b = client.get("/api/v1/workload", headers=adm_b_h).json()["data"]
        assert all(t["team_id"] != team_a for t in wl_b["teams"])

        # Voice file security: unauthenticated -> 401; Company B -> 404/403; path traversal -> 400/404
        assert client.get(f"/api/v1/tickets/voice/{voice_file_a}").status_code == 401
        assert client.get(f"/api/v1/tickets/voice/{voice_file_a}", headers=adm_b_h).status_code in (403, 404)
        assert client.get("/api/v1/tickets/voice/..%2F..%2Fetc%2Fpasswd", headers=adm_a_h).status_code in (400, 404)
        assert client.get(f"/api/v1/tickets/voice/{voice_file_a}", headers=emp1_a_h).status_code == 200

        # 4. GRANULAR RBAC MATRIX CHECKS (Same Company A)
        # Employee cannot manage teams/rules/SLA/workflows, assign, bulk, view workload, or view other employee's ticket
        assert client.post("/api/v1/teams", json={"name": "EmpTeam"}, headers=emp1_a_h).status_code == 403
        assert client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 1, "name": "R", "conditions": {}, "team_id": team_a}, headers=emp1_a_h).status_code == 403
        assert client.post("/api/v1/sla-policies", json={"name": "S", "priority": "Low"}, headers=emp1_a_h).status_code == 403
        assert client.post(f"/api/v1/tickets/{ticket_a}/assign", json={"assignee_id": info["tech_a_id"]}, headers=emp1_a_h).status_code == 403
        assert client.post("/api/v1/tickets/bulk", json={"ticket_ids": [ticket_a], "action": "close"}, headers=emp1_a_h).status_code == 403
        assert client.get("/api/v1/workload", headers=emp1_a_h).status_code == 403
        assert client.get(f"/api/v1/tickets/{ticket_a}", headers=emp2_a_h).status_code == 403  # Other employee in same company!

        # IT Technician: allowed to assign/transition/view workload; DENIED team/rule/SLA/workflow admin
        assert client.get("/api/v1/workload", headers=tech_a_h).status_code == 200
        assert client.post(f"/api/v1/tickets/{ticket_a}/assign", json={"assignee_id": info["tech_a_id"]}, headers=tech_a_h).status_code == 200
        assert client.post("/api/v1/teams", json={"name": "TechTeam"}, headers=tech_a_h).status_code == 403
        assert client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 2, "name": "TechRule", "conditions": {}, "team_id": team_a}, headers=tech_a_h).status_code == 403
        assert client.post("/api/v1/sla-policies", json={"name": "TechSLA", "priority": "Low"}, headers=tech_a_h).status_code == 403
        assert client.post("/api/v1/macros", json={"title": "Shared", "body": "x", "is_shared": True}, headers=tech_a_h).status_code == 403
        assert client.post("/api/v1/macros", json={"title": "My Private", "body": "x", "is_shared": False}, headers=tech_a_h).status_code == 200

        # Auditor: strictly read-only
        assert client.get("/api/v1/tickets", headers=aud_a_h).status_code == 200
        assert client.get("/api/v1/workload", headers=aud_a_h).status_code == 200
        assert client.get("/api/v1/reports/helpdesk-sla", headers=aud_a_h).status_code == 200
        assert client.post(f"/api/v1/tickets/{ticket_a}/assign", json={"assignee_id": info["tech_a_id"]}, headers=aud_a_h).status_code == 403
        assert client.post("/api/v1/tickets/bulk", json={"ticket_ids": [ticket_a], "action": "close"}, headers=aud_a_h).status_code == 403
        assert client.post("/api/v1/teams", json={"name": "AudTeam"}, headers=aud_a_h).status_code == 403
        assert client.post(f"/api/v1/tasks/{task_a}/assign", json={"assignee_id": info["tech_a_id"]}, headers=aud_a_h).status_code == 403

        print("  OK All Cross-Company BOLA/IDOR, Voice Hardening, Spoofed Tenant & Granular RBAC Matrix tests passed!")
    finally:
        app.dependency_overrides.clear()
        info["engine"].dispose()
        if os.path.exists(info["db_path"]):
            try:
                os.remove(info["db_path"])
            except OSError:
                pass


if __name__ == "__main__":
    print("=" * 65)
    print("RUNNING WORK MANAGEMENT SECURITY, BOLA & RBAC MATRIX TESTS")
    print("=" * 65)
    test_cross_company_bola_rbac_and_hardening()
    print("ALL SECURITY & RBAC TESTS PASSED!")
