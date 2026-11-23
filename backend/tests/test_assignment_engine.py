# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Unit, integration, and concurrency tests for the Rule-Driven Assignment Engine."""

import os
import sys
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.company import Branch, Company
from app.models.enterprise import LeaveRequest
from app.models.notification import Notification
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, User
from app.models.work_management import (
    AssignmentRule,
    RoundRobinCursor,
    Team,
    TeamMember,
    TicketCategory,
    TicketEvent,
    TicketWatcher,
)
from app.services.assignment import (
    CandidateSpec,
    RuleSpec,
    auto_assign_task,
    auto_assign_ticket,
    dry_run_assignment,
    evaluate_rules,
    manual_assign_task,
    manual_assign_ticket,
    matches_conditions,
    select_candidate,
    validate_rule_conditions,
)


def _make_temp_session_factory():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    engine = create_engine(
        f"sqlite:///{tmp.name.replace(os.sep, '/')}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, factory, tmp.name


def test_pure_condition_validation_and_matching():
    # Reject unknown keys
    try:
        validate_rule_conditions({"category": "Network", "evil_sql": "1=1"})
        raise AssertionError("Should have rejected unknown condition key")
    except ValueError as e:
        assert "evil_sql" in str(e)

    # Valid conditions
    cleaned = validate_rule_conditions({
        "category": ["Network", "Server"],
        "priority": "High",
        "keywords": ["vpn", "firewall"],
    })
    assert cleaned["category"] == ["Network", "Server"]
    assert cleaned["keywords"] == ["vpn", "firewall"]

    ctx = {
        "category": "Network",
        "priority": "High",
        "title": "Cannot connect to VPN gateway",
        "description": "Timeout on branch office link",
    }
    assert matches_conditions(ctx, cleaned) is True
    assert matches_conditions({**ctx, "priority": "Low"}, cleaned) is False
    assert matches_conditions({**ctx, "title": "Printer offline", "description": "Paper jam"}, cleaned) is False
    assert matches_conditions(ctx, {}) is True
    print("  OK Condition validation and matching tests passed")


def test_pure_rule_ordering_and_stop_on_match():
    t1, t2, t3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    rules = [
        RuleSpec(id=uuid.uuid4(), name="Catch-all", entity_type="ticket", position=3, conditions={}, team_id=t3, strategy="round_robin", stop_on_match=True),
        RuleSpec(id=uuid.uuid4(), name="Inactive high", entity_type="ticket", position=0, conditions={"priority": "High"}, team_id=t2, strategy="manual", is_active=False),
        RuleSpec(id=uuid.uuid4(), name="Network non-stop", entity_type="ticket", position=1, conditions={"category": "Network"}, team_id=t1, strategy="skill_based", stop_on_match=False),
        RuleSpec(id=uuid.uuid4(), name="High priority stop", entity_type="ticket", position=2, conditions={"priority": "High"}, team_id=t2, strategy="least_loaded", stop_on_match=True),
    ]
    matched, trace = evaluate_rules({"category": "Network", "priority": "High"}, rules)
    assert matched is not None
    assert matched.team_id == t2  # pos=1 did not stop, pos=2 matched and stopped
    assert len(trace) == 2  # pos=3 was never evaluated after stop_on_match
    assert trace[0].matched is True and trace[0].stopped is False
    assert trace[1].matched is True and trace[1].stopped is True
    print("  OK Rule ordering and stop_on_match tests passed")


def test_pure_strategies_round_robin_least_loaded_skill_manual():
    u1, u2, u3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    t_old = datetime(2026, 1, 1, 8, 0, 0)
    t_new = datetime(2026, 1, 2, 8, 0, 0)

    cands = [
        CandidateSpec(user_id=u1, team_member_id=uuid.uuid4(), username="u1", skills=("network", "firewall"), open_count=2, weight=1, last_assigned_at=t_old, is_eligible=True),
        CandidateSpec(user_id=u2, team_member_id=uuid.uuid4(), username="u2", skills=("hardware",), open_count=2, weight=3, last_assigned_at=t_new, is_eligible=True),
        CandidateSpec(user_id=u3, team_member_id=uuid.uuid4(), username="u3", skills=("network", "firewall"), open_count=2, weight=1, last_assigned_at=t_new, is_eligible=True),
    ]

    # Manual -> None
    chosen, _, reason = select_candidate("manual", cands)
    assert chosen is None and reason == "manual_queue"

    # Least loaded -> same open_count=2, tie-break by higher weight -> u2 (weight=3)
    chosen, _, reason = select_candidate("least_loaded", cands)
    assert chosen is not None and chosen.user_id == u2

    # Tie-break on equal open_count and equal weight -> oldest last_assigned_at -> u1
    chosen, _, _ = select_candidate("least_loaded", [cands[0], cands[2]])
    assert chosen is not None and chosen.user_id == u1

    # Skill-based matching both ("network", "firewall") -> picks u1 over u3 by oldest last_assigned_at
    chosen, _, reason = select_candidate("skill_based", cands, required_skills=["network", "firewall"])
    assert chosen is not None and chosen.user_id == u1 and reason == "skill_based"

    # Skill-based fallback when no candidate holds required skill
    chosen, _, reason = select_candidate("skill_based", cands, required_skills=["sap_erp"])
    assert chosen is None and reason == "skill_fallback_unassigned"

    # Round-robin cycling with wraparound
    ordered_ids = [c.user_id for c in sorted(cands, key=lambda x: str(x.user_id))]
    idx = -1
    picked = []
    for _ in range(5):
        chosen, idx, reason = select_candidate("round_robin", cands, cursor_last_index=idx)
        assert chosen is not None and reason == "round_robin"
        picked.append(chosen.user_id)
    assert picked == [ordered_ids[0], ordered_ids[1], ordered_ids[2], ordered_ids[0], ordered_ids[1]]
    print("  OK Pure strategy selection tests (manual, round_robin, least_loaded, skill_based) passed")


def test_db_eligibility_leave_watchers_and_cross_company():
    engine, SessionFactory, db_path = _make_temp_session_factory()
    try:
        db = SessionFactory()
        co_a = Company(company_name_ar="أ", company_name_en="Co A", company_code="COA")
        co_b = Company(company_name_ar="ب", company_name_en="Co B", company_code="COB")
        db.add_all([co_a, co_b])
        db.flush()

        br_a = Branch(company_id=co_a.id, branch_name="Main A")
        db.add(br_a)
        db.flush()

        emp_leave = Employee(company_id=co_a.id, branch_id=br_a.id, employee_number="E1", full_name="On Leave")
        emp_ok = Employee(company_id=co_a.id, branch_id=br_a.id, employee_number="E2", full_name="Available Tech")
        emp_req = Employee(company_id=co_a.id, branch_id=br_a.id, employee_number="E3", full_name="Requester")
        db.add_all([emp_leave, emp_ok, emp_req])
        db.flush()

        u_leave = User(username="tech_leave", password_hash="x", email="l@a.sa", employee_id=emp_leave.id, account_status="Active")
        u_ok = User(username="tech_ok", password_hash="x", email="ok@a.sa", employee_id=emp_ok.id, account_status="Active")
        u_watcher = User(username="watcher_a", password_hash="x", email="w@a.sa", account_status="Active")
        u_other_co = User(username="tech_b", password_hash="x", email="b@b.sa", account_status="Active")
        db.add_all([u_leave, u_ok, u_watcher, u_other_co])
        db.flush()

        db.add_all([
            CompanyMembership(user_id=u_leave.id, company_id=co_a.id, status="Active"),
            CompanyMembership(user_id=u_ok.id, company_id=co_a.id, status="Active"),
            CompanyMembership(user_id=u_watcher.id, company_id=co_a.id, status="Active"),
            CompanyMembership(user_id=u_other_co.id, company_id=co_b.id, status="Active"),
        ])

        # Approved leave covering today for emp_leave
        today = date.today()
        db.add(LeaveRequest(
            company_id=co_a.id,
            employee_id=emp_leave.id,
            leave_type="Annual",
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=2),
            days_count=4,
            status="Approved",
        ))

        team = Team(company_id=co_a.id, name="Net Team", default_strategy="least_loaded")
        db.add(team)
        db.flush()

        db.add_all([
            TeamMember(company_id=co_a.id, team_id=team.id, user_id=u_leave.id, skills=["network"], max_open_items=5, is_available=True),
            TeamMember(company_id=co_a.id, team_id=team.id, user_id=u_ok.id, skills=["network"], max_open_items=5, is_available=True),
        ])
        db.add(AssignmentRule(
            company_id=co_a.id,
            entity_type="ticket",
            position=1,
            name="Route Network",
            conditions={"category": "Network"},
            team_id=team.id,
            strategy="least_loaded",
            is_active=True,
            stop_on_match=True,
        ))

        ticket = HelpDeskTicket(
            company_id=co_a.id,
            branch_id=br_a.id,
            ticket_number="TCK-2026-9001",
            issue_title="VPN outage",
            issue_description="Cannot connect",
            requester_id=emp_req.id,
            category="Network",
            priority="High",
            status="Open",
        )
        db.add(ticket)
        db.flush()
        db.add(TicketWatcher(company_id=co_a.id, ticket_id=ticket.id, user_id=u_watcher.id))
        db.commit()

        # Dry run must skip u_leave (approved leave) and pick u_ok
        preview = dry_run_assignment(db, co_a.id, "ticket", {"category": "Network", "priority": "High"})
        assert preview.assignee_user_id == u_ok.id
        leave_cand = next(c for c in preview.candidates if c.user_id == u_leave.id)
        assert leave_cand.is_eligible is False and leave_cand.ineligible_reason == "on_approved_leave"

        # Auto-assign ticket
        dec = auto_assign_ticket(db, ticket, actor_id=None)
        assert dec.assignee_user_id == u_ok.id
        db.refresh(ticket)
        assert ticket.assigned_technician_id == u_ok.id
        assert ticket.status == "Assigned"
        assert ticket.team_id == team.id

        # Assignment event + watcher & assignee notifications verified
        events = db.query(TicketEvent).filter(TicketEvent.ticket_id == ticket.id, TicketEvent.kind == "assignment").all()
        assert len(events) == 1
        notif_uids = {n.recipient_user_id for n in db.query(Notification).filter(Notification.related_record_id == ticket.id).all()}
        assert u_ok.id in notif_uids and u_watcher.id in notif_uids

        # Manual cross-company assign MUST fail
        try:
            manual_assign_ticket(db, ticket, assignee_id=u_other_co.id)
            raise AssertionError("Should reject cross-company assignee")
        except ValueError as e:
            assert "company" in str(e).lower()

        # Task dual-sync assignee_id <-> assigned_to_id
        task = Task(company_id=co_a.id, title="Verify firewall", status="To Do", priority="High")
        db.add(task)
        db.commit()
        manual_assign_task(db, task, team_id=team.id, assignee_id=u_ok.id, actor_id=u_watcher.id)
        db.refresh(task)
        assert task.assignee_id == u_ok.id and task.assigned_to_id == emp_ok.id

        print("  OK DB eligibility (leave, capacity), watchers, cross-company guard & task dual-sync passed")
    finally:
        try:
            db.close()
        except Exception:
            pass
        engine.dispose()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except OSError:
                pass


def test_parallel_concurrency_capacity_and_round_robin():
    engine, SessionFactory, db_path = _make_temp_session_factory()
    try:
        db = SessionFactory()
        co = Company(company_name_ar="ت", company_name_en="Concurrency Co", company_code="CON")
        db.add(co)
        db.flush()

        emp_req = Employee(company_id=co.id, employee_number="REQ1", full_name="Req")
        db.add(emp_req)
        db.flush()

        u1 = User(username="rr_a", password_hash="x", email="a@con.sa", account_status="Active")
        u2 = User(username="rr_b", password_hash="x", email="b@con.sa", account_status="Active")
        db.add_all([u1, u2])
        db.flush()
        db.add_all([
            CompanyMembership(user_id=u1.id, company_id=co.id, status="Active"),
            CompanyMembership(user_id=u2.id, company_id=co.id, status="Active"),
        ])

        team = Team(company_id=co.id, name="RR Team", default_strategy="round_robin")
        db.add(team)
        db.flush()
        # Each member max_open_items=3 => total team capacity = 6
        db.add_all([
            TeamMember(company_id=co.id, team_id=team.id, user_id=u1.id, skills=[], max_open_items=3, is_available=True),
            TeamMember(company_id=co.id, team_id=team.id, user_id=u2.id, skills=[], max_open_items=3, is_available=True),
        ])
        db.add(AssignmentRule(
            company_id=co.id,
            entity_type="ticket",
            position=1,
            name="All RR",
            conditions={},
            team_id=team.id,
            strategy="round_robin",
            is_active=True,
            stop_on_match=True,
        ))

        ticket_ids = []
        for i in range(8):
            t = HelpDeskTicket(
                company_id=co.id,
                ticket_number=f"TCK-CON-{i:04d}",
                issue_title=f"Concurrent ticket {i}",
                issue_description="Load test",
                requester_id=emp_req.id,
                category="Hardware",
                priority="Medium",
                status="Open",
            )
            db.add(t)
            db.flush()
            ticket_ids.append(t.id)
        u1_id, u2_id = u1.id, u2.id
        db.commit()
        db.close()

        barrier = threading.Barrier(8)
        errors = []

        def worker(tid: uuid.UUID):
            s = SessionFactory()
            try:
                barrier.wait(timeout=5)
                tck = s.query(HelpDeskTicket).filter(HelpDeskTicket.id == tid).first()
                auto_assign_ticket(s, tck, commit=True)
            except Exception as exc:
                errors.append(exc)
            finally:
                s.close()

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(worker, ticket_ids))

        assert not errors, f"Concurrency errors occurred: {errors}"

        check_db = SessionFactory()
        c_u1 = check_db.query(HelpDeskTicket).filter(HelpDeskTicket.assigned_technician_id == u1_id).count()
        c_u2 = check_db.query(HelpDeskTicket).filter(HelpDeskTicket.assigned_technician_id == u2_id).count()
        c_unassigned = check_db.query(HelpDeskTicket).filter(HelpDeskTicket.assigned_technician_id.is_(None)).count()
        check_db.close()

        assert c_u1 <= 3 and c_u2 <= 3, f"Capacity exceeded: u1={c_u1}, u2={c_u2}"
        assert c_u1 == 3 and c_u2 == 3 and c_unassigned == 2, (
            f"Expected fair 3/3 + 2 queued, got u1={c_u1}, u2={c_u2}, unassigned={c_unassigned}"
        )
        print(f"  OK Parallel 8-thread concurrency test passed (u1={c_u1}, u2={c_u2}, unassigned={c_unassigned})")
    finally:
        engine.dispose()
        if os.path.exists(db_path):
            os.remove(db_path)


if __name__ == "__main__":
    print("=" * 65)
    print("RUNNING ASSIGNMENT ENGINE UNIT, INTEGRATION & CONCURRENCY TESTS")
    print("=" * 65)
    test_pure_condition_validation_and_matching()
    test_pure_rule_ordering_and_stop_on_match()
    test_pure_strategies_round_robin_least_loaded_skill_manual()
    test_db_eligibility_leave_watchers_and_cross_company()
    test_parallel_concurrency_capacity_and_round_robin()
    print("ALL ASSIGNMENT ENGINE TESTS PASSED!")
