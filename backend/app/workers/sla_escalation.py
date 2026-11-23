# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Idempotent SLA state updater and breach escalation worker.

Run from CLI / cron / systemd timer:
    python -m app.workers.sla_escalation [--company-id <UUID>]

Or invoke programmatically from the protected system endpoint:
    run_sla_escalation(db, company_id=...)

Idempotency guarantees:
- Each ticket receives at most one `sla_warning` event and one `sla_breach` event per
  due-date milestone; repeated runs are strict no-ops with zero duplicate notifications.
"""

from __future__ import annotations

import argparse
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.task import Task
from app.models.ticket import HelpDeskTicket, SlaPolicy
from app.models.work_management import Team, TicketEvent
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification
from app.services.sla_service import (
    SLA_CLOSED_TASK_STATUSES,
    SLA_CLOSED_TICKET_STATUSES,
    SLA_PAUSE_TICKET_STATUSES,
    compute_sla_state,
    next_higher_priority,
)

logger = logging.getLogger(__name__)


def _has_existing_sla_event(
    db: Session,
    ticket_id: uuid.UUID,
    kind: str,
    milestone_key: str,
) -> bool:
    events = (
        db.query(TicketEvent.payload)
        .filter(TicketEvent.ticket_id == ticket_id, TicketEvent.kind == kind)
        .all()
    )
    for (payload,) in events:
        if isinstance(payload, dict) and payload.get("milestone_key") == milestone_key:
            return True
    return False


def _collect_escalation_recipients(
    db: Session,
    ticket: HelpDeskTicket,
) -> List[uuid.UUID]:
    recipients: Set[uuid.UUID] = set()
    if ticket.assigned_technician_id:
        recipients.add(ticket.assigned_technician_id)
    if ticket.team_id:
        team = db.query(Team).filter(Team.id == ticket.team_id).first()
        if team and team.lead_user_id:
            recipients.add(team.lead_user_id)
    return list(recipients)


def run_sla_escalation(
    db: Session,
    company_id: Optional[uuid.UUID] = None,
    now_utc: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Scan active tickets and SLA-bound tasks, update sla_state, and trigger idempotent escalations."""
    now = (now_utc or datetime.now(timezone.utc)).replace(tzinfo=None)
    summary = {
        "checked_tickets": 0,
        "checked_tasks": 0,
        "states_updated": 0,
        "warnings_sent": 0,
        "breaches_escalated": 0,
        "priority_bumped": 0,
        "reassigned_to_lead": 0,
        "run_at": now.isoformat(),
    }

    pending_notifications: List[Dict[str, Any]] = []

    # 1. Process open Help Desk Tickets
    t_query = db.query(HelpDeskTicket).filter(~HelpDeskTicket.status.in_(SLA_CLOSED_TICKET_STATUSES))
    if company_id is not None:
        t_query = t_query.filter(HelpDeskTicket.company_id == company_id)

    tickets = t_query.all()
    summary["checked_tickets"] = len(tickets)

    for ticket in tickets:
        is_paused = bool(ticket.sla_paused_at) or (ticket.status in SLA_PAUSE_TICKET_STATUSES)
        new_state = compute_sla_state(
            now_utc=now,
            created_at=ticket.created_at or now,
            first_response_due_at=ticket.first_response_due_at or ticket.sla_response_due_at,
            resolution_due_at=ticket.resolution_due_at or ticket.sla_resolution_due_at,
            first_response_at=ticket.first_response_at,
            resolved_at=ticket.resolved_at,
            is_paused=is_paused,
        )
        if ticket.sla_state != new_state:
            ticket.sla_state = new_state
            summary["states_updated"] += 1

        due_anchor = (
            (ticket.resolution_due_at or ticket.sla_resolution_due_at)
            or (ticket.first_response_due_at or ticket.sla_response_due_at)
        )
        milestone_key = due_anchor.isoformat() if due_anchor else "default"

        if new_state == "at_risk":
            if not _has_existing_sla_event(db, ticket.id, "sla_warning", milestone_key):
                db.add(
                    TicketEvent(
                        ticket_id=ticket.id,
                        company_id=ticket.company_id,
                        actor_id=None,
                        kind="sla_warning",
                        payload={
                            "milestone_key": milestone_key,
                            "sla_state": "at_risk",
                            "resolution_due_at": ticket.resolution_due_at.isoformat() if ticket.resolution_due_at else None,
                        },
                        visibility="internal",
                    )
                )
                summary["warnings_sent"] += 1
                for uid in _collect_escalation_recipients(db, ticket):
                    pending_notifications.append(
                        {
                            "recipient_user_id": uid,
                            "company_id": ticket.company_id,
                            "event_type": "sla_warning",
                            "title": f"تنبيه SLA: التذكرة {ticket.ticket_number} تقترب من المهلة",
                            "message": f"التذكرة ({ticket.issue_title}) تجاوزت 80% من وقت اتفاقية مستوى الخدمة.",
                            "related_record_type": "ticket",
                            "related_record_id": ticket.id,
                            "priority": "High",
                        }
                    )

        elif new_state == "breached":
            ticket.sla_breached = True
            if not _has_existing_sla_event(db, ticket.id, "sla_breach", milestone_key):
                policy = (
                    db.query(SlaPolicy).filter(SlaPolicy.id == ticket.sla_policy_id).first()
                    if ticket.sla_policy_id
                    else None
                )
                old_priority = ticket.priority
                old_assignee = ticket.assigned_technician_id
                ticket.escalated_at = now
                if ticket.tier == "L1":
                    ticket.tier = "L2"
                ticket.sla_status = "Breached"

                breach_payload: Dict[str, Any] = {
                    "milestone_key": milestone_key,
                    "sla_state": "breached",
                    "tier": ticket.tier,
                    "priority_bumped": False,
                    "reassigned_to_lead": False,
                }

                if policy and policy.bump_priority_on_breach:
                    bumped = next_higher_priority(ticket.priority)
                    if bumped != ticket.priority:
                        ticket.priority = bumped
                        breach_payload["priority_bumped"] = True
                        breach_payload["from_priority"] = old_priority
                        breach_payload["to_priority"] = bumped
                        summary["priority_bumped"] += 1
                        db.add(
                            TicketEvent(
                                ticket_id=ticket.id,
                                company_id=ticket.company_id,
                                actor_id=None,
                                kind="priority_change",
                                payload={
                                    "from": old_priority,
                                    "to": bumped,
                                    "reason": "auto_sla_escalation",
                                },
                                visibility="public",
                            )
                        )

                if policy and policy.escalate_on_breach and ticket.team_id:
                    team = db.query(Team).filter(Team.id == ticket.team_id).first()
                    if team and team.lead_user_id and team.lead_user_id != ticket.assigned_technician_id:
                        ticket.assigned_technician_id = team.lead_user_id
                        breach_payload["reassigned_to_lead"] = True
                        breach_payload["to_assignee_id"] = str(team.lead_user_id)
                        summary["reassigned_to_lead"] += 1
                        db.add(
                            TicketEvent(
                                ticket_id=ticket.id,
                                company_id=ticket.company_id,
                                actor_id=None,
                                kind="assignment",
                                payload={
                                    "from_assignee_id": str(old_assignee) if old_assignee else None,
                                    "to_assignee_id": str(team.lead_user_id),
                                    "team_id": str(team.id),
                                    "strategy": "escalation",
                                    "reason": "auto_sla_escalation",
                                },
                                visibility="public",
                            )
                        )

                db.add(
                    TicketEvent(
                        ticket_id=ticket.id,
                        company_id=ticket.company_id,
                        actor_id=None,
                        kind="sla_breach",
                        payload=breach_payload,
                        visibility="internal",
                    )
                )
                log_audit(
                    db=db,
                    action="SLA_BREACH_ESCALATE",
                    resource_type="HelpDeskTicket",
                    resource_id=str(ticket.id),
                    user_id=None,
                    company_id=ticket.company_id,
                    old_values={"priority": old_priority, "assigned_technician_id": old_assignee},
                    new_values=breach_payload,
                    commit=False,
                )
                summary["breaches_escalated"] += 1
                for uid in _collect_escalation_recipients(db, ticket):
                    pending_notifications.append(
                        {
                            "recipient_user_id": uid,
                            "company_id": ticket.company_id,
                            "event_type": "sla_breach",
                            "title": f"تجاوز مهلة SLA: التذكرة {ticket.ticket_number}",
                            "message": f"تجاوزت التذكرة ({ticket.issue_title}) المهلة المحددة وتم تصعيدها تلقائياً.",
                            "related_record_type": "ticket",
                            "related_record_id": ticket.id,
                            "priority": "High",
                        }
                    )

    # 2. Process open Tasks with SLA deadlines
    tk_query = db.query(Task).filter(
        ~Task.status.in_(SLA_CLOSED_TASK_STATUSES),
        (Task.resolution_due_at.isnot(None) | Task.deadline_at.isnot(None)),
    )
    if company_id is not None:
        tk_query = tk_query.filter(Task.company_id == company_id)

    tasks = tk_query.all()
    summary["checked_tasks"] = len(tasks)
    for task in tasks:
        is_paused = task.status in ("On Hold", "Waiting for Response", "Blocked")
        new_state = compute_sla_state(
            now_utc=now,
            created_at=task.created_at or now,
            first_response_due_at=task.first_response_due_at,
            resolution_due_at=task.resolution_due_at or task.deadline_at,
            first_response_at=task.acknowledged_at or task.accepted_at,
            resolved_at=task.completed_at,
            is_paused=is_paused,
        )
        if task.sla_state != new_state:
            task.sla_state = new_state
            summary["states_updated"] += 1

        if new_state == "breached" and task.escalated_at is None:
            task.escalated_at = now
            task.escalation_level = (task.escalation_level or 0) + 1
            summary["breaches_escalated"] += 1
            log_audit(
                db=db,
                action="TASK_SLA_BREACH",
                resource_type="Task",
                resource_id=str(task.id),
                user_id=None,
                company_id=task.company_id,
                new_values={"sla_state": "breached", "escalation_level": task.escalation_level},
                commit=False,
            )
            recipients: Set[uuid.UUID] = set()
            if task.assignee_id:
                recipients.add(task.assignee_id)
            if task.team_id:
                team = db.query(Team).filter(Team.id == task.team_id).first()
                if team and team.lead_user_id:
                    recipients.add(team.lead_user_id)
            for uid in recipients:
                pending_notifications.append(
                    {
                        "recipient_user_id": uid,
                        "company_id": task.company_id,
                        "event_type": "task_sla_breach",
                        "title": f"تجاوز مهلة مهمة: {task.title}",
                        "message": f"تجاوزت المهمة ({task.title}) موعدها المستحق وتم تسجيل تصعيد.",
                        "related_record_type": "task",
                        "related_record_id": task.id,
                        "priority": "High",
                    }
                )

    db.commit()

    # Dispatch notifications after main transaction commits
    for notif_kwargs in pending_notifications:
        try:
            create_notification(db=db, **notif_kwargs)
        except Exception as exc:
            logger.warning("SLA escalation notification dispatch error: %s", exc)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run IGOS SLA escalation check.")
    parser.add_argument("--company-id", type=str, default=None, help="Optional UUID of a single company to scan.")
    args = parser.parse_args()
    cid = uuid.UUID(args.company_id) if args.company_id else None

    db = SessionLocal()
    try:
        result = run_sla_escalation(db, company_id=cid)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
