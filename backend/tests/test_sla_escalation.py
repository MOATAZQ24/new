# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Unit & idempotency tests for Business-Hours SLA Calculation & Escalation Worker."""

import os
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.company import Company
from app.models.notification import Notification
from app.models.ticket import HelpDeskTicket, SlaPolicy
from app.models.user import CompanyMembership, Employee, User
from app.models.work_management import Team, TicketEvent
from app.services.sla_service import (
    add_business_minutes,
    apply_sla_to_ticket,
    compute_sla_state,
    handle_ticket_sla_pause_resume,
)
from app.workers.sla_escalation import run_sla_escalation


RIYADH_HOURS = {
    "timezone": "Asia/Riyadh",  # UTC+3
    "working_days": ["sun", "mon", "tue", "wed", "thu"],
    "start": "08:00",
    "end": "17:00",
}


def test_business_hours_math_across_shifts_weekends_holidays():
    # 2026-11-22 is Sunday. 10:00 Asia/Riyadh == 07:00 UTC.
    sun_10_riyadh_utc = datetime(2026, 11, 22, 7, 0, 0)
    res = add_business_minutes(sun_10_riyadh_utc, 90, RIYADH_HOURS, True)
    assert res == datetime(2026, 11, 22, 8, 30, 0)  # Sunday 11:30 Riyadh

    # Across shift boundary: Sunday 16:30 Riyadh (13:30 UTC) + 60m -> Monday 08:30 Riyadh (05:30 UTC)
    sun_1630_utc = datetime(2026, 11, 22, 13, 30, 0)
    res_next = add_business_minutes(sun_1630_utc, 60, RIYADH_HOURS, True)
    assert res_next == datetime(2026, 11, 23, 5, 30, 0)

    # Across Saudi weekend (Fri Nov 27 + Sat Nov 28):
    # Thursday 2026-11-26 16:00 Riyadh (13:00 UTC) + 120m -> Sunday 2026-11-29 09:00 Riyadh (06:00 UTC)
    thu_1600_utc = datetime(2026, 11, 26, 13, 0, 0)
    res_weekend = add_business_minutes(thu_1600_utc, 120, RIYADH_HOURS, True)
    assert res_weekend == datetime(2026, 11, 29, 6, 0, 0)

    # Starting on Friday (weekend): Friday 12:00 Riyadh (09:00 UTC) + 30m -> Sunday 08:30 Riyadh (05:30 UTC)
    fri_1200_utc = datetime(2026, 11, 27, 9, 0, 0)
    res_fri = add_business_minutes(fri_1200_utc, 30, RIYADH_HOURS, True)
    assert res_fri == datetime(2026, 11, 29, 5, 30, 0)

    # Holiday skipping: Sunday 2026-11-29 is holiday -> jumps to Monday 2026-11-30 08:30 Riyadh (05:30 UTC)
    hours_with_holiday = {**RIYADH_HOURS, "holidays": ["2026-11-29"]}
    res_hol = add_business_minutes(fri_1200_utc, 30, hours_with_holiday, True)
    assert res_hol == datetime(2026, 11, 30, 5, 30, 0)

    # 24/7 mode ignores business hours
    res_247 = add_business_minutes(fri_1200_utc, 90, RIYADH_HOURS, False)
    assert res_247 == datetime(2026, 11, 27, 10, 30, 0)
    print("  OK Business-hours SLA math (shifts, Saudi weekends, holidays, 24/7) passed")


def test_sla_states_and_pause_resume():
    created = datetime(2026, 11, 22, 6, 0, 0)
    fr_due = created + timedelta(minutes=60)
    res_due = created + timedelta(minutes=200)

    assert compute_sla_state(created + timedelta(minutes=10), created, fr_due, res_due) == "ok"
    assert compute_sla_state(created + timedelta(minutes=50), created, fr_due, res_due) == "at_risk"
    assert compute_sla_state(created + timedelta(minutes=65), created, fr_due, res_due) == "breached"
    assert compute_sla_state(created + timedelta(minutes=65), created, fr_due, res_due, is_paused=True) == "paused"

    # Pause & resume shifts due dates forward cleanly
    t = HelpDeskTicket(
        ticket_number="TCK-PAUSE-1",
        issue_title="Pause test",
        issue_description="...",
        status="In Progress",
        created_at=created,
        first_response_due_at=fr_due,
        resolution_due_at=res_due,
        sla_paused_total_seconds=0,
    )
    handle_ticket_sla_pause_resume(t, "In Progress", "Waiting for User", now_utc=created + timedelta(minutes=30))
    assert t.sla_state == "paused" and t.sla_paused_at == created + timedelta(minutes=30)

    handle_ticket_sla_pause_resume(t, "Waiting for User", "In Progress", now_utc=created + timedelta(minutes=90))
    assert t.sla_paused_at is None
    assert t.sla_paused_total_seconds == 3600
    assert t.resolution_due_at == res_due + timedelta(hours=1)
    print("  OK SLA state computation & pause/resume clock shifting passed")


def test_escalation_worker_idempotency():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    engine = create_engine(f"sqlite:///{tmp.name.replace(os.sep, '/')}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    try:
        db = SessionFactory()
        co = Company(company_name_ar="ش", company_name_en="SLA Co", company_code="SLA")
        db.add(co)
        db.flush()

        emp_req = Employee(company_id=co.id, employee_number="R1", full_name="Requester")
        db.add(emp_req)
        db.flush()

        u_tech = User(username="tech1", password_hash="x", email="t1@sla.sa", account_status="Active")
        u_lead = User(username="lead1", password_hash="x", email="l1@sla.sa", account_status="Active")
        db.add_all([u_tech, u_lead])
        db.flush()
        db.add_all([
            CompanyMembership(user_id=u_tech.id, company_id=co.id, status="Active"),
            CompanyMembership(user_id=u_lead.id, company_id=co.id, status="Active"),
        ])

        team = Team(company_id=co.id, name="Support Team", lead_user_id=u_lead.id)
        db.add(team)
        db.flush()

        pol = SlaPolicy(
            company_id=co.id,
            name="SLA Medium Escalate",
            priority="Medium",
            first_response_minutes=60,
            resolution_minutes=120,
            business_hours_only=False,
            business_hours=RIYADH_HOURS,
            escalate_on_breach=True,
            bump_priority_on_breach=True,
            is_default=True,
            is_active=True,
        )
        db.add(pol)
        db.flush()

        base_t = datetime(2026, 11, 22, 8, 0, 0)
        # Ticket 1: At Risk (50 / 60 min elapsed = 83%)
        t_risk = HelpDeskTicket(
            company_id=co.id,
            ticket_number="TCK-SLA-0001",
            issue_title="At-risk ticket",
            issue_description="...",
            requester_id=emp_req.id,
            assigned_technician_id=u_tech.id,
            team_id=team.id,
            priority="Medium",
            status="Assigned",
            created_at=base_t,
        )
        db.add(t_risk)
        db.flush()
        apply_sla_to_ticket(db, t_risk, now_utc=base_t)

        # Ticket 2: Breached (130 / 120 min elapsed)
        t_breach = HelpDeskTicket(
            company_id=co.id,
            ticket_number="TCK-SLA-0002",
            issue_title="Breached ticket",
            issue_description="...",
            requester_id=emp_req.id,
            assigned_technician_id=u_tech.id,
            team_id=team.id,
            priority="Medium",
            status="In Progress",
            created_at=base_t - timedelta(minutes=80),
        )
        db.add(t_breach)
        db.flush()
        apply_sla_to_ticket(db, t_breach, now_utc=base_t - timedelta(minutes=80))
        db.commit()

        check_now = base_t + timedelta(minutes=50)

        # Run 1
        res1 = run_sla_escalation(db, company_id=co.id, now_utc=check_now)
        assert res1["warnings_sent"] == 1
        assert res1["breaches_escalated"] == 1
        assert res1["priority_bumped"] == 1
        assert res1["reassigned_to_lead"] == 1

        db.refresh(t_risk)
        db.refresh(t_breach)
        assert t_risk.sla_state == "at_risk"
        assert t_breach.sla_state == "breached"
        assert t_breach.sla_status == "Breached"
        assert t_breach.priority == "High"  # Bumped Medium -> High
        assert t_breach.assigned_technician_id == u_lead.id  # Reassigned to team lead

        events_after_1 = db.query(TicketEvent).count()
        notifs_after_1 = db.query(Notification).count()

        # Run 2 immediately -> STRICT NO-OP!
        res2 = run_sla_escalation(db, company_id=co.id, now_utc=check_now + timedelta(minutes=1))
        assert res2["warnings_sent"] == 0
        assert res2["breaches_escalated"] == 0
        assert res2["priority_bumped"] == 0
        assert res2["reassigned_to_lead"] == 0

        db.refresh(t_breach)
        assert t_breach.priority == "High"  # NOT double-bumped
        assert db.query(TicketEvent).count() == events_after_1
        assert db.query(Notification).count() == notifs_after_1
        print("  OK Escalation worker idempotency (warning + breach + priority bump + lead reassign) passed")
    finally:
        try:
            db.close()
        except Exception:
            pass
        engine.dispose()
        if os.path.exists(tmp.name):
            try:
                os.remove(tmp.name)
            except OSError:
                pass


if __name__ == "__main__":
    print("=" * 65)
    print("RUNNING SLA BUSINESS-HOURS & ESCALATION IDEMPOTENCY TESTS")
    print("=" * 65)
    test_business_hours_math_across_shifts_weekends_holidays()
    test_sla_states_and_pause_resume()
    test_escalation_worker_idempotency()
    print("ALL SLA & ESCALATION TESTS PASSED!")
