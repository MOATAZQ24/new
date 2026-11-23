# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""End-to-end API integration tests for Work Management, Help Desk, Tasks,
Bulk Actions, Merge, Idempotency-Key, /me/work, /workload, and SLA Reports.
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
from app.models.user import CompanyMembership, Employee, Role, User, UserRole, UserSession


def _build_env():
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

    co = Company(company_name_ar="بوابة", company_name_en="IGT", company_code="IGT")
    db.add(co)
    db.flush()
    br = Branch(company_id=co.id, branch_name="Riyadh HQ")
    db.add(br)
    db.flush()

    def make_user(uname: str, role_name: str, is_sa: bool = False):
        emp = Employee(company_id=co.id, branch_id=br.id, employee_number=f"E-{uname}", full_name=f"Emp {uname}", email=f"{uname}@igt.sa")
        db.add(emp)
        db.flush()
        u = User(username=uname, email=f"{uname}@igt.sa", password_hash="x", employee_id=emp.id, account_status="Active", is_superadmin=is_sa)
        db.add(u)
        db.flush()
        db.add(UserRole(user_id=u.id, role_id=roles[role_name].id))
        db.add(CompanyMembership(user_id=u.id, company_id=co.id, role_id=roles[role_name].id, status="Active", is_default=True))
        tok = f"tok_{uname}_{uuid.uuid4().hex}"
        db.add(UserSession(user_id=u.id, session_token=tok, expires_at=datetime.utcnow() + timedelta(hours=2), is_active=True))
        db.flush()
        return u, emp, {"Authorization": f"Bearer {tok}", "X-Company-ID": str(co.id)}

    mgr, mgr_emp, mgr_h = make_user("mgr", "IT Manager")
    t1, t1_emp, t1_h = make_user("tech1", "IT Technician")
    t2, t2_emp, t2_h = make_user("tech2", "IT Technician")
    emp_u, emp_rec, emp_h = make_user("emp1", "Employee")
    db.commit()

    ctx = {
        "engine": engine,
        "db_path": tmp.name,
        "co_id": str(co.id),
        "br_id": str(br.id),
        "mgr_id": str(mgr.id),
        "t1_id": str(t1.id),
        "t1_emp_id": str(t1_emp.id),
        "t2_id": str(t2.id),
        "emp_id": str(emp_rec.id),
        "mgr_h": mgr_h,
        "t1_h": t1_h,
        "t2_h": t2_h,
        "emp_h": emp_h,
    }
    db.close()
    return ctx


def test_full_work_management_api_flow():
    ctx = _build_env()
    client = TestClient(app)
    mgr_h = ctx["mgr_h"]
    t1_h = ctx["t1_h"]
    emp_h = ctx["emp_h"]

    try:
        # 1. Create Team & Members
        r = client.post("/api/v1/teams", json={"name": "Infra Team", "default_strategy": "round_robin", "lead_user_id": ctx["mgr_id"]}, headers=mgr_h)
        assert r.status_code == 200, r.text
        team_id = r.json()["data"]["id"]

        r = client.post(f"/api/v1/teams/{team_id}/members", json={"user_id": ctx["t1_id"], "skills": ["network", "vpn"], "max_open_items": 5}, headers=mgr_h)
        assert r.status_code == 200, r.text
        r = client.post(f"/api/v1/teams/{team_id}/members", json={"user_id": ctx["t2_id"], "skills": ["hardware"], "max_open_items": 5}, headers=mgr_h)
        assert r.status_code == 200, r.text

        # 2. Assignment Rule validation (reject invalid condition key -> 422)
        r_bad = client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 1, "name": "Bad", "conditions": {"bogus_key": "x"}, "team_id": team_id}, headers=mgr_h)
        assert r_bad.status_code == 422

        # Valid rules + reorder + dry-run
        r1 = client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 2, "name": "Fallback", "conditions": {}, "team_id": team_id, "strategy": "round_robin"}, headers=mgr_h)
        assert r1.status_code == 200
        r2 = client.post("/api/v1/assignment-rules", json={"entity_type": "ticket", "position": 1, "name": "Net Skill", "conditions": {"category": "Network", "keywords": ["vpn"]}, "team_id": team_id, "strategy": "skill_based"}, headers=mgr_h)
        assert r2.status_code == 200
        rule1_id, rule2_id = r1.json()["data"]["id"], r2.json()["data"]["id"]

        r_re = client.post("/api/v1/assignment-rules/reorder", json={"entity_type": "ticket", "rule_ids": [rule2_id, rule1_id]}, headers=mgr_h)
        assert r_re.status_code == 200

        r_dry = client.post("/api/v1/assignment-rules/dry-run", json={"entity_type": "ticket", "category": "Network", "title": "VPN down", "required_skills": ["vpn"]}, headers=mgr_h)
        assert r_dry.status_code == 200
        dry_data = r_dry.json()["data"]
        assert dry_data["matched_rule_id"] == rule2_id
        assert dry_data["assignee_user_id"] == ctx["t1_id"]

        # 3. Ensure default SLA policies exist, then create ticket with Idempotency-Key
        assert client.get("/api/v1/sla-policies", headers=mgr_h).status_code == 200
        idem_headers = {**emp_h, "Idempotency-Key": "idem-ticket-create-001"}
        t_payload = {
            "issue_title": "VPN disconnect in Riyadh",
            "issue_description": "Cannot reach internal app via VPN",
            "category": "Network",
            "priority": "High",
            "branch_id": ctx["br_id"],
        }
        rt1 = client.post("/api/v1/tickets", json=t_payload, headers=idem_headers)
        assert rt1.status_code == 200, rt1.text
        rt1_replay = client.post("/api/v1/tickets", json=t_payload, headers=idem_headers)
        assert rt1_replay.status_code == 200
        assert rt1.json()["data"]["id"] == rt1_replay.json()["data"]["id"]  # Idempotent!
        ticket1_id = rt1.json()["data"]["id"]
        assert rt1.json()["data"]["team_id"] == team_id
        assert rt1.json()["data"]["assigned_technician_id"] is not None
        assert rt1.json()["data"]["resolution_due_at"] is not None

        # 4. Macro creation + event posting + internal visibility check
        rm = client.post("/api/v1/macros", json={"title": "Ack", "body": "We received your ticket.", "visibility": "public", "is_shared": True}, headers=mgr_h)
        assert rm.status_code == 200
        macro_id = rm.json()["data"]["id"]

        re_pub = client.post(f"/api/v1/tickets/{ticket1_id}/events", json={"macro_id": macro_id, "content": "Checking firewall now.", "visibility": "public"}, headers=t1_h)
        assert re_pub.status_code == 200
        re_int = client.post(f"/api/v1/tickets/{ticket1_id}/events", json={"content": "Internal root cause note", "visibility": "internal"}, headers=t1_h)
        assert re_int.status_code == 200

        # Staff sees internal note; Employee does NOT!
        ev_staff = client.get(f"/api/v1/tickets/{ticket1_id}/events", headers=t1_h).json()["data"]
        ev_emp = client.get(f"/api/v1/tickets/{ticket1_id}/events", headers=emp_h).json()["data"]
        assert any(e["visibility"] == "internal" for e in ev_staff)
        assert all(e["visibility"] != "internal" for e in ev_emp)

        # 5. Linked task with require_tasks_done_to_close=True blocks closing ticket!
        r_lt = client.post(
            f"/api/v1/tickets/{ticket1_id}/tasks",
            json={"title": "Replace VPN cert", "assignee_id": ctx["t1_id"], "require_tasks_done_to_close": True},
            headers=t1_h,
        )
        assert r_lt.status_code == 200, r_lt.text
        linked_task_id = r_lt.json()["data"]["task_id"]
        assert r_lt.json()["data"]["assigned_to_id"] == ctx["t1_emp_id"]

        # Transition: invalid status -> 409
        r_bad_tr = client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "BogusStatus"}, headers=t1_h)
        assert r_bad_tr.status_code == 409
        assert r_bad_tr.json()["detail"]["code"] == "INVALID_WORKFLOW_TRANSITION"

        # Valid transitions: Assigned -> In Progress -> Waiting for User (pauses SLA) -> In Progress
        assert client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "In Progress"}, headers=t1_h).status_code == 200
        r_wait = client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "Waiting for User"}, headers=t1_h)
        assert r_wait.status_code == 200 and r_wait.json()["data"]["sla_state"] == "paused"
        assert client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "In Progress"}, headers=t1_h).status_code == 200

        # Trying to Close while linked task is open -> 409 OPEN_LINKED_TASKS
        r_close_blocked = client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "Closed"}, headers=t1_h)
        assert r_close_blocked.status_code == 409
        assert r_close_blocked.json()["detail"]["code"] == "OPEN_LINKED_TASKS"

        # Complete linked task checklist + transition linked task to Completed
        r_chk = client.post(f"/api/v1/tasks/{linked_task_id}/checklist", json={"title": "Upload new PEM"}, headers=t1_h)
        assert r_chk.status_code == 200
        chk_id = r_chk.json()["data"]["id"]
        assert client.patch(f"/api/v1/tasks/{linked_task_id}/checklist/{chk_id}", json={"is_completed": True}, headers=t1_h).status_code == 200
        assert client.post(f"/api/v1/tasks/{linked_task_id}/transition", json={"to_status": "Completed"}, headers=t1_h).status_code == 200

        # Now closing ticket succeeds!
        r_close_ok = client.post(f"/api/v1/tickets/{ticket1_id}/transition", json={"to_status": "Closed"}, headers=t1_h)
        assert r_close_ok.status_code == 200 and r_close_ok.json()["data"]["status"] == "Closed"

        # 6. Ticket Merge + Bulk partial result
        rt2 = client.post("/api/v1/tickets", json={"issue_title": "Dup 1", "issue_description": "x", "category": "Hardware", "priority": "Low"}, headers=emp_h)
        rt3 = client.post("/api/v1/tickets", json={"issue_title": "Dup 2", "issue_description": "y", "category": "Hardware", "priority": "Low"}, headers=emp_h)
        t2_id, t3_id = rt2.json()["data"]["id"], rt3.json()["data"]["id"]

        r_merge = client.post(f"/api/v1/tickets/{t2_id}/merge", json={"target_ticket_id": t3_id, "comment": "Duplicate report"}, headers=t1_h)
        assert r_merge.status_code == 200
        t2_detail = client.get(f"/api/v1/tickets/{t2_id}", headers=t1_h).json()["data"]
        assert t2_detail["status"] == "Closed" and t2_detail["merged_into_ticket_id"] == t3_id

        r_bulk = client.post(
            "/api/v1/tickets/bulk",
            json={"ticket_ids": [t3_id, str(uuid.uuid4())], "action": "priority", "priority": "High"},
            headers=t1_h,
        )
        assert r_bulk.status_code == 200
        assert r_bulk.json()["data"]["succeeded_count"] == 1
        assert r_bulk.json()["data"]["failed_count"] == 1

        # 7. Cursor pagination on /tickets & SavedView
        r_sv = client.post("/api/v1/saved-views", json={"scope": "tickets", "name": "High Priority", "filters": {"priority": "High"}}, headers=t1_h)
        assert r_sv.status_code == 200
        sv_id = r_sv.json()["data"]["id"]
        r_list = client.get(f"/api/v1/tickets?per_page=1&saved_view_id={sv_id}", headers=t1_h)
        assert r_list.status_code == 200 and len(r_list.json()["data"]) == 1

        # 8. Unified /me/work (including legacy ticket with resolution_due_at=None), static ticket routes, /workload, SLA report & exports
        from app.models.ticket import HelpDeskTicket
        db_sess = sessionmaker(bind=ctx["engine"])()
        try:
            legacy_t = HelpDeskTicket(
                company_id=uuid.UUID(ctx["co_id"]),
                ticket_number="TCK-LEGACY-0001",
                issue_title="Legacy ticket without resolution_due_at",
                issue_description="Pre-migration row",
                requester_id=uuid.UUID(ctx["emp_id"]),
                assigned_technician_id=uuid.UUID(ctx["t1_id"]),
                priority="Medium",
                status="In Progress",
                resolution_due_at=None,
            )
            db_sess.add(legacy_t)
            db_sess.commit()
        finally:
            db_sess.close()

        r_work = client.get("/api/v1/me/work", headers=t1_h)
        assert r_work.status_code == 200
        assert "grouped" in r_work.json()["data"] and "counts" in r_work.json()["data"]

        # Static GET routes must never be shadowed by /{ticket_id}
        for static_ep in ("/api/v1/tickets/catalog", "/api/v1/tickets/approvals", "/api/v1/tickets/workflows", "/api/v1/tickets/slas", "/api/v1/tickets/problems/list", "/api/v1/tickets/knowledge/list"):
            r_st = client.get(static_ep, headers=t1_h)
            assert r_st.status_code == 200, f"{static_ep} returned {r_st.status_code}: {r_st.text}"

        r_wl = client.get("/api/v1/workload", headers=mgr_h)
        assert r_wl.status_code == 200 and len(r_wl.json()["data"]["technicians"]) >= 2

        r_rep = client.get("/api/v1/reports/helpdesk-sla", headers=mgr_h)
        assert r_rep.status_code == 200 and "sla_compliance_pct" in r_rep.json()["data"]["summary"]

        r_csv = client.get("/api/v1/reports/export?report_type=sla_compliance&format_type=excel", headers=mgr_h)
        assert r_csv.status_code == 200 and r_csv.content.startswith(b"\xef\xbb\xbf")

        r_html = client.get("/api/v1/reports/export?report_type=workload&format_type=html", headers=mgr_h)
        assert r_html.status_code == 200 and "text/html" in r_html.headers["content-type"]

        # 9. Protected SLA Escalation endpoint via service token & manager
        os.environ["IGOS_SERVICE_TOKEN"] = "test-super-secret-token-123456"
        try:
            assert client.post("/api/v1/system/run-sla-escalation", headers={"X-Service-Token": "wrong"}).status_code == 403
            r_svc = client.post("/api/v1/system/run-sla-escalation", headers={"X-Service-Token": "test-super-secret-token-123456"})
            assert r_svc.status_code == 200 and "checked_tickets" in r_svc.json()["data"]
            assert client.post("/api/v1/system/run-sla-escalation", headers=emp_h).status_code == 403
            assert client.post("/api/v1/system/run-sla-escalation", headers=mgr_h).status_code == 200
        finally:
            os.environ.pop("IGOS_SERVICE_TOKEN", None)

        print("  OK Full Work Management API integration test passed (teams, rules, dry-run, idempotency, transitions, close-gate, merge, bulk, /me/work, /workload, SLA reports, service-token)")
    finally:
        app.dependency_overrides.clear()
        ctx["engine"].dispose()
        if os.path.exists(ctx["db_path"]):
            try:
                os.remove(ctx["db_path"])
            except OSError:
                pass


if __name__ == "__main__":
    print("=" * 65)
    print("RUNNING WORK MANAGEMENT END-TO-END API TESTS")
    print("=" * 65)
    test_full_work_management_api_flow()
    print("ALL WORK MANAGEMENT API TESTS PASSED!")
