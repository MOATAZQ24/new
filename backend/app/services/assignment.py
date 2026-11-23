# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Rule-driven Assignment Engine for Help Desk Tickets and Tasks.

Architecture:
- Pure evaluation & selection helpers (`validate_rule_conditions`, `matches_conditions`,
  `evaluate_rules`, `select_candidate`) have zero DB dependencies for deterministic unit testing.
- DB orchestrators (`auto_assign_ticket`, `manual_assign_ticket`, `auto_assign_task`,
  `manual_assign_task`, `dry_run_assignment`) enforce strict multi-company isolation,
  eligibility (active user, company membership, availability, capacity, approved leave),
  transactional concurrency control (PostgreSQL advisory locks / SQLite serialized locks),
  and side effects (TicketEvent, AuditLog, in-app Notifications).
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import and_, or_, text
from sqlalchemy.orm import Session

from app.models.asset import TechnicalAsset
from app.models.enterprise import LeaveRequest
from app.models.task import Task, TaskComment
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, Role, User, UserRole
from app.models.work_management import (
    ALLOWED_RULE_CONDITION_KEYS,
    ASSIGNMENT_STRATEGIES,
    AssignmentRule,
    RoundRobinCursor,
    TaskWatcher,
    Team,
    TeamMember,
    TicketCategory,
    TicketEvent,
    TicketWatcher,
)
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification

MAX_ACTIVE_RULES_PER_COMPANY = 100
CLOSED_TICKET_STATUSES = {"Resolved", "Closed", "Cancelled"}
CLOSED_TASK_STATUSES = {"Completed", "Cancelled", "Rejected"}

# Process-local per-(company, team) mutex used alongside SQLite transactions to prevent
# concurrent multi-threaded assignment races when running against SQLite in dev/tests.
_SQLITE_LOCK_REGISTRY_GUARD = threading.Lock()
_SQLITE_TEAM_LOCKS: Dict[str, threading.Lock] = {}


def _get_sqlite_team_lock(lock_key: str) -> threading.Lock:
    with _SQLITE_LOCK_REGISTRY_GUARD:
        lock = _SQLITE_TEAM_LOCKS.get(lock_key)
        if lock is None:
            lock = threading.Lock()
            _SQLITE_TEAM_LOCKS[lock_key] = lock
        return lock


# ==============================================================================
# Pure Data Structures & Rule/Strategy Evaluators (Zero DB Coupling)
# ==============================================================================

@dataclass(frozen=True)
class RuleSpec:
    id: uuid.UUID
    name: str
    entity_type: str
    position: int
    conditions: Dict[str, Any]
    team_id: uuid.UUID
    strategy: Optional[str]
    is_active: bool = True
    stop_on_match: bool = True


@dataclass(frozen=True)
class CandidateSpec:
    user_id: uuid.UUID
    team_member_id: uuid.UUID
    username: str = ""
    skills: Tuple[str, ...] = field(default_factory=tuple)
    max_open_items: int = 10
    open_count: int = 0
    weight: int = 1
    last_assigned_at: Optional[datetime] = None
    is_available: bool = True
    is_eligible: bool = True
    ineligible_reason: Optional[str] = None


@dataclass
class RuleTraceEntry:
    rule_id: str
    rule_name: str
    position: int
    matched: bool
    stopped: bool
    team_id: str
    strategy: Optional[str]


@dataclass
class AssignmentDecision:
    matched_rule_id: Optional[uuid.UUID]
    matched_rule_name: Optional[str]
    team_id: Optional[uuid.UUID]
    strategy_used: str
    assignee_user_id: Optional[uuid.UUID]
    reason: str
    trace: List[RuleTraceEntry] = field(default_factory=list)
    candidates: List[CandidateSpec] = field(default_factory=list)


def validate_rule_conditions(conditions: Any) -> Dict[str, Any]:
    """Validate AssignmentRule.conditions JSON structure against the strict allowlist."""
    if not isinstance(conditions, dict):
        raise ValueError("Rule conditions must be a JSON object.")

    unknown = set(conditions.keys()) - ALLOWED_RULE_CONDITION_KEYS
    if unknown:
        raise ValueError(
            f"Unsupported rule condition key(s): {', '.join(sorted(unknown))}. "
            f"Allowed keys: {', '.join(sorted(ALLOWED_RULE_CONDITION_KEYS))}."
        )

    cleaned: Dict[str, Any] = {}
    for key, val in conditions.items():
        if val is None:
            continue
        if key == "keywords":
            if isinstance(val, str):
                tokens = [v.strip() for v in val.split(",") if v.strip()]
            elif isinstance(val, list):
                if not all(isinstance(item, str) for item in val):
                    raise ValueError("Condition 'keywords' must be a list of strings.")
                tokens = [item.strip() for item in val if item.strip()]
            else:
                raise ValueError("Condition 'keywords' must be a string or list of strings.")
            if tokens:
                cleaned[key] = tokens[:50]
        else:
            if isinstance(val, str):
                s = val.strip()
                if s:
                    cleaned[key] = s
            elif isinstance(val, list):
                if not all(isinstance(item, str) for item in val):
                    raise ValueError(f"Condition '{key}' list items must be strings.")
                items = [item.strip() for item in val if item.strip()]
                if items:
                    cleaned[key] = items[:50]
            else:
                raise ValueError(f"Condition '{key}' must be a string or list of strings.")
    return cleaned


def _norm_str(value: Any) -> str:
    return str(value).strip().lower() if value is not None else ""


def matches_conditions(entity_ctx: Dict[str, Any], conditions: Dict[str, Any]) -> bool:
    """Evaluate whether an entity context dict satisfies all condition predicates."""
    if not conditions:
        return True

    for key, expected in conditions.items():
        if expected is None:
            continue

        if key == "keywords":
            haystack = (
                f"{entity_ctx.get('title') or ''} {entity_ctx.get('description') or ''}"
            ).lower()
            kw_list = [expected] if isinstance(expected, str) else list(expected)
            kw_list = [k.strip().lower() for k in kw_list if str(k).strip()]
            if kw_list and not any(kw in haystack for kw in kw_list):
                return False
            continue

        actual = entity_ctx.get(key)
        if actual is None:
            return False

        if isinstance(actual, (list, tuple, set)):
            actual_norm = {_norm_str(a) for a in actual if a is not None}
            if isinstance(expected, list):
                expected_norm = {_norm_str(e) for e in expected if e is not None}
                if not (actual_norm & expected_norm):
                    return False
            else:
                if _norm_str(expected) not in actual_norm:
                    return False
        else:
            actual_s = _norm_str(actual)
            if isinstance(expected, list):
                expected_norm = {_norm_str(e) for e in expected if e is not None}
                if actual_s not in expected_norm:
                    return False
            else:
                if actual_s != _norm_str(expected):
                    return False
    return True


def evaluate_rules(
    entity_ctx: Dict[str, Any],
    rules: Sequence[RuleSpec],
) -> Tuple[Optional[RuleSpec], List[RuleTraceEntry]]:
    """Evaluate active rules in position order, respecting `stop_on_match`."""
    active_sorted = sorted(
        (r for r in rules if r.is_active),
        key=lambda r: (r.position, str(r.id)),
    )
    chosen: Optional[RuleSpec] = None
    trace: List[RuleTraceEntry] = []

    for rule in active_sorted:
        matched = matches_conditions(entity_ctx, rule.conditions or {})
        stopped = bool(matched and rule.stop_on_match)
        trace.append(
            RuleTraceEntry(
                rule_id=str(rule.id),
                rule_name=rule.name,
                position=rule.position,
                matched=matched,
                stopped=stopped,
                team_id=str(rule.team_id),
                strategy=rule.strategy,
            )
        )
        if matched:
            chosen = rule
            if rule.stop_on_match:
                break

    return chosen, trace


def _pick_least_loaded(eligible: Sequence[CandidateSpec]) -> CandidateSpec:
    """Pick fewest open items; tie-break by higher weight, then oldest last_assigned_at."""
    return min(
        eligible,
        key=lambda c: (
            c.open_count,
            -c.weight,
            c.last_assigned_at or datetime.min,
            str(c.user_id),
        ),
    )


def select_candidate(
    strategy: str,
    candidates: Sequence[CandidateSpec],
    cursor_last_index: int = -1,
    required_skills: Optional[Sequence[str]] = None,
) -> Tuple[Optional[CandidateSpec], int, str]:
    """Select an assignee candidate according to the configured strategy.

    Returns (chosen_candidate_or_None, next_cursor_index, outcome_reason).
    """
    strat = (strategy or "least_loaded").strip().lower()
    if strat not in ASSIGNMENT_STRATEGIES:
        strat = "least_loaded"

    if strat == "manual":
        return None, cursor_last_index, "manual_queue"

    eligible = [c for c in candidates if c.is_eligible]
    if not eligible:
        return None, cursor_last_index, "no_eligible_candidates"

    if strat == "round_robin":
        ordered = sorted(eligible, key=lambda c: str(c.user_id))
        next_idx = (cursor_last_index + 1) % len(ordered)
        return ordered[next_idx], next_idx, "round_robin"

    if strat == "least_loaded":
        return _pick_least_loaded(eligible), cursor_last_index, "least_loaded"

    if strat == "skill_based":
        req = {s.strip().lower() for s in (required_skills or []) if str(s).strip()}
        if not req:
            return _pick_least_loaded(eligible), cursor_last_index, "skill_based_no_skills_least_loaded"

        skilled = [
            c for c in eligible
            if req.issubset({s.strip().lower() for s in c.skills})
        ]
        if not skilled:
            return None, cursor_last_index, "skill_fallback_unassigned"
        return _pick_least_loaded(skilled), cursor_last_index, "skill_based"

    return _pick_least_loaded(eligible), cursor_last_index, "least_loaded"


# ==============================================================================
# Database Orchestration & Concurrency Control
# ==============================================================================

def _is_postgres(db: Session) -> bool:
    bind = db.get_bind()
    return bind is not None and bind.dialect.name == "postgresql"


def _acquire_team_lock(db: Session, company_id: uuid.UUID, team_id: uuid.UUID) -> Optional[threading.Lock]:
    """Acquire a transactional lock scoped to (company_id, team_id).

    - PostgreSQL: pg_advisory_xact_lock(hashtext(...)) released automatically on commit/rollback.
    - SQLite: returns a process-local threading.Lock to be released in a finally block.
    """
    lock_key = f"igos_assign:{company_id}:{team_id}"
    if _is_postgres(db):
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": lock_key})
        return None

    lock = _get_sqlite_team_lock(lock_key)
    lock.acquire()
    return lock


def _count_user_open_items(
    db: Session,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    employee_id: Optional[uuid.UUID] = None,
) -> int:
    """Count open HelpDeskTickets + open Tasks assigned to a user within `company_id`."""
    open_tickets = (
        db.query(HelpDeskTicket)
        .filter(
            HelpDeskTicket.company_id == company_id,
            HelpDeskTicket.assigned_technician_id == user_id,
            ~HelpDeskTicket.status.in_(CLOSED_TICKET_STATUSES),
        )
        .count()
    )

    if employee_id is not None:
        task_assignee_cond = or_(
            Task.assignee_id == user_id,
            and_(Task.assignee_id.is_(None), Task.assigned_to_id == employee_id),
        )
    else:
        task_assignee_cond = Task.assignee_id == user_id

    open_tasks = (
        db.query(Task)
        .filter(
            Task.company_id == company_id,
            task_assignee_cond,
            ~Task.status.in_(CLOSED_TASK_STATUSES),
        )
        .count()
    )
    return open_tickets + open_tasks


def _is_employee_on_approved_leave(
    db: Session,
    company_id: uuid.UUID,
    employee_id: Optional[uuid.UUID],
    check_date: date,
) -> bool:
    if employee_id is None:
        return False
    leave = (
        db.query(LeaveRequest.id)
        .filter(
            LeaveRequest.company_id == company_id,
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == "Approved",
            LeaveRequest.start_date <= check_date,
            LeaveRequest.end_date >= check_date,
        )
        .first()
    )
    return leave is not None


def _user_has_company_access(db: Session, company_id: uuid.UUID, user: User) -> bool:
    if user.is_superadmin:
        return True
    mem = (
        db.query(CompanyMembership.id)
        .filter(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "Active",
        )
        .first()
    )
    return mem is not None


def load_team_candidates(
    db: Session,
    company_id: uuid.UUID,
    team_id: uuid.UUID,
    today: Optional[date] = None,
    now_utc: Optional[datetime] = None,
) -> List[CandidateSpec]:
    """Load all TeamMembers for a team and evaluate live eligibility & workload."""
    check_date = today or date.today()
    now = now_utc or datetime.now(timezone.utc).replace(tzinfo=None)

    members = (
        db.query(TeamMember)
        .filter(TeamMember.company_id == company_id, TeamMember.team_id == team_id)
        .all()
    )
    candidates: List[CandidateSpec] = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        if not user:
            continue

        open_count = _count_user_open_items(db, company_id, user.id, user.employee_id)
        reason: Optional[str] = None
        if user.is_deleted or user.account_status != "Active":
            reason = "user_inactive"
        elif user.locked_until and user.locked_until > now:
            reason = "user_locked"
        elif not _user_has_company_access(db, company_id, user):
            reason = "outside_company"
        elif not m.is_available:
            reason = "unavailable"
        elif _is_employee_on_approved_leave(db, company_id, user.employee_id, check_date):
            reason = "on_approved_leave"
        elif open_count >= m.max_open_items:
            reason = "at_capacity"

        candidates.append(
            CandidateSpec(
                user_id=user.id,
                team_member_id=m.id,
                username=user.username,
                skills=tuple(m.skills or []),
                max_open_items=m.max_open_items,
                open_count=open_count,
                weight=max(1, m.weight or 1),
                last_assigned_at=m.last_assigned_at,
                is_available=bool(m.is_available),
                is_eligible=(reason is None),
                ineligible_reason=reason,
            )
        )
    return candidates


def sync_task_assignee_fields(
    db: Session,
    company_id: uuid.UUID,
    user_id: Optional[uuid.UUID] = None,
    employee_id: Optional[uuid.UUID] = None,
) -> Tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
    """Dual-sync Task.assignee_id (User.id) and Task.assigned_to_id (Employee.id)."""
    resolved_user_id = user_id
    resolved_employee_id = employee_id

    if resolved_user_id and not resolved_employee_id:
        u = db.query(User).filter(User.id == resolved_user_id).first()
        if u and u.employee_id:
            emp = (
                db.query(Employee)
                .filter(Employee.id == u.employee_id, Employee.company_id == company_id)
                .first()
            )
            if emp:
                resolved_employee_id = emp.id
    elif resolved_employee_id and not resolved_user_id:
        u = (
            db.query(User)
            .filter(User.employee_id == resolved_employee_id, User.is_deleted == False)
            .first()
        )
        if u:
            resolved_user_id = u.id

    return resolved_user_id, resolved_employee_id


def build_ticket_context(db: Session, ticket: HelpDeskTicket) -> Tuple[Dict[str, Any], List[str]]:
    """Build rule evaluation context + required skills list for a ticket."""
    category_name = ticket.category
    required_skills: List[str] = []
    if ticket.category_id:
        cat = (
            db.query(TicketCategory)
            .filter(
                TicketCategory.id == ticket.category_id,
                TicketCategory.company_id == ticket.company_id,
            )
            .first()
        )
        if cat:
            category_name = cat.name
            required_skills = list(cat.required_skills or [])
    elif ticket.category:
        cat = (
            db.query(TicketCategory)
            .filter(
                TicketCategory.company_id == ticket.company_id,
                TicketCategory.name == ticket.category,
            )
            .first()
        )
        if cat:
            required_skills = list(cat.required_skills or [])

    department_id: Optional[str] = None
    requester_roles: List[str] = []
    if ticket.requester_id:
        emp = db.query(Employee).filter(Employee.id == ticket.requester_id).first()
        if emp and emp.department_id:
            department_id = str(emp.department_id)
        req_user = db.query(User).filter(User.employee_id == ticket.requester_id).first()
        if req_user:
            roles = (
                db.query(Role.name)
                .join(UserRole, UserRole.role_id == Role.id)
                .filter(UserRole.user_id == req_user.id)
                .all()
            )
            requester_roles = [r[0] for r in roles]

    asset_type: Optional[str] = None
    if ticket.related_asset_id:
        asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == ticket.related_asset_id).first()
        if asset:
            asset_type = asset.asset_type

    ctx = {
        "category": category_name,
        "priority": ticket.priority,
        "branch_id": str(ticket.branch_id) if ticket.branch_id else None,
        "department_id": department_id,
        "asset_type": asset_type,
        "title": ticket.issue_title or "",
        "description": ticket.issue_description or "",
        "requester_role": requester_roles,
    }
    return ctx, required_skills


def build_task_context(db: Session, task: Task) -> Tuple[Dict[str, Any], List[str]]:
    """Build rule evaluation context + required skills list for a task."""
    category_name = None
    required_skills: List[str] = []
    if task.related_ticket_id:
        tck = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == task.related_ticket_id).first()
        if tck:
            category_name = tck.category
            if tck.category_id:
                cat = db.query(TicketCategory).filter(TicketCategory.id == tck.category_id).first()
                if cat:
                    required_skills = list(cat.required_skills or [])

    asset_type = None
    if task.related_asset_id:
        asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == task.related_asset_id).first()
        if asset:
            asset_type = asset.asset_type

    ctx = {
        "category": category_name,
        "priority": task.priority,
        "branch_id": str(task.branch_id) if task.branch_id else None,
        "department_id": None,
        "asset_type": asset_type,
        "title": task.title or "",
        "description": task.description or "",
        "requester_role": [],
    }
    return ctx, required_skills


def _load_company_rule_specs(db: Session, company_id: uuid.UUID, entity_type: str) -> List[RuleSpec]:
    rows = (
        db.query(AssignmentRule)
        .filter(
            AssignmentRule.company_id == company_id,
            AssignmentRule.entity_type == entity_type,
            AssignmentRule.is_active == True,
        )
        .order_by(AssignmentRule.position.asc(), AssignmentRule.created_at.asc())
        .all()
    )
    return [
        RuleSpec(
            id=r.id,
            name=r.name,
            entity_type=r.entity_type,
            position=r.position,
            conditions=r.conditions or {},
            team_id=r.team_id,
            strategy=r.strategy,
            is_active=r.is_active,
            stop_on_match=r.stop_on_match,
        )
        for r in rows
    ]


def _get_or_create_rr_cursor(
    db: Session,
    company_id: uuid.UUID,
    team_id: uuid.UUID,
    for_update: bool = True,
) -> RoundRobinCursor:
    q = db.query(RoundRobinCursor).filter(
        RoundRobinCursor.company_id == company_id,
        RoundRobinCursor.scope_type == "team",
        RoundRobinCursor.scope_id == team_id,
    )
    if for_update and _is_postgres(db):
        q = q.with_for_update()
    cursor = q.first()
    if cursor is None:
        cursor = RoundRobinCursor(
            company_id=company_id,
            scope_type="team",
            scope_id=team_id,
            last_user_id=None,
            last_index=-1,
        )
        db.add(cursor)
        db.flush()
    return cursor


def dry_run_assignment(
    db: Session,
    company_id: uuid.UUID,
    entity_type: str,
    entity_ctx: Dict[str, Any],
    required_skills: Optional[List[str]] = None,
) -> AssignmentDecision:
    """Read-only rule evaluation and candidate selection preview (never mutates DB)."""
    rules = _load_company_rule_specs(db, company_id, entity_type)
    matched_rule, trace = evaluate_rules(entity_ctx, rules)

    target_team_id: Optional[uuid.UUID] = matched_rule.team_id if matched_rule else None
    skills = list(required_skills or [])

    # Fallback to TicketCategory.default_team_id if no rule matched and category provided
    if target_team_id is None and entity_ctx.get("category"):
        cat = (
            db.query(TicketCategory)
            .filter(
                TicketCategory.company_id == company_id,
                TicketCategory.name == str(entity_ctx["category"]),
                TicketCategory.is_active == True,
            )
            .first()
        )
        if cat:
            target_team_id = cat.default_team_id
            if not skills:
                skills = list(cat.required_skills or [])

    if target_team_id is None:
        return AssignmentDecision(
            matched_rule_id=None,
            matched_rule_name=None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="no_matching_rule",
            trace=trace,
            candidates=[],
        )

    team = (
        db.query(Team)
        .filter(Team.id == target_team_id, Team.company_id == company_id, Team.is_active == True)
        .first()
    )
    if not team:
        return AssignmentDecision(
            matched_rule_id=matched_rule.id if matched_rule else None,
            matched_rule_name=matched_rule.name if matched_rule else None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="team_inactive_or_missing",
            trace=trace,
            candidates=[],
        )

    strategy = (matched_rule.strategy if matched_rule and matched_rule.strategy else team.default_strategy) or "least_loaded"
    candidates = load_team_candidates(db, company_id, team.id)

    cursor = (
        db.query(RoundRobinCursor)
        .filter(
            RoundRobinCursor.company_id == company_id,
            RoundRobinCursor.scope_type == "team",
            RoundRobinCursor.scope_id == team.id,
        )
        .first()
    )
    last_idx = cursor.last_index if cursor else -1
    chosen, _, outcome = select_candidate(strategy, candidates, cursor_last_index=last_idx, required_skills=skills)

    return AssignmentDecision(
        matched_rule_id=matched_rule.id if matched_rule else None,
        matched_rule_name=matched_rule.name if matched_rule else None,
        team_id=team.id,
        strategy_used=strategy,
        assignee_user_id=chosen.user_id if chosen else None,
        reason=outcome,
        trace=trace,
        candidates=candidates,
    )


def _notify_assignment_parties(
    db: Session,
    company_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    title_label: str,
    new_assignee_id: Optional[uuid.UUID],
    prev_assignee_id: Optional[uuid.UUID],
    watcher_user_ids: Sequence[uuid.UUID],
    actor_id: Optional[uuid.UUID],
) -> None:
    """Dispatch safe post-commit notifications to new assignee, previous assignee, and watchers."""
    notified: set[uuid.UUID] = set()

    if new_assignee_id and new_assignee_id != actor_id:
        create_notification(
            db=db,
            recipient_user_id=new_assignee_id,
            company_id=company_id,
            event_type=f"{entity_type}_assigned",
            title=f"تم إسناد {'تذكرة دعم فني' if entity_type == 'ticket' else 'مهمة تشغيلية'} إليك",
            message=f"{title_label}",
            related_record_type=entity_type,
            related_record_id=entity_id,
            priority="High",
        )
        notified.add(new_assignee_id)

    if prev_assignee_id and prev_assignee_id != new_assignee_id and prev_assignee_id != actor_id:
        create_notification(
            db=db,
            recipient_user_id=prev_assignee_id,
            company_id=company_id,
            event_type=f"{entity_type}_reassigned",
            title=f"تم إعادة إسناد {'تذكرة' if entity_type == 'ticket' else 'مهمة'} من قائمتك",
            message=f"{title_label}",
            related_record_type=entity_type,
            related_record_id=entity_id,
            priority="Normal",
        )
        notified.add(prev_assignee_id)

    for wid in watcher_user_ids:
        if wid not in notified and wid != actor_id:
            create_notification(
                db=db,
                recipient_user_id=wid,
                company_id=company_id,
                event_type=f"{entity_type}_assignment_updated",
                title=f"تحديث إسناد {'تذكرة متابعة' if entity_type == 'ticket' else 'مهمة متابعة'}",
                message=f"{title_label}",
                related_record_type=entity_type,
                related_record_id=entity_id,
                priority="Normal",
            )
            notified.add(wid)


def auto_assign_ticket(
    db: Session,
    ticket: HelpDeskTicket,
    actor_id: Optional[uuid.UUID] = None,
    force: bool = False,
    commit: bool = True,
    ip_address: Optional[str] = None,
) -> AssignmentDecision:
    """Evaluate assignment rules for a ticket and atomically assign team & technician."""
    if not force and ticket.assigned_technician_id is not None:
        return AssignmentDecision(
            matched_rule_id=None,
            matched_rule_name=None,
            team_id=ticket.team_id,
            strategy_used="manual",
            assignee_user_id=ticket.assigned_technician_id,
            reason="already_assigned",
        )

    ctx, required_skills = build_ticket_context(db, ticket)
    rules = _load_company_rule_specs(db, ticket.company_id, "ticket")
    matched_rule, trace = evaluate_rules(ctx, rules)

    target_team_id = matched_rule.team_id if matched_rule else ticket.team_id
    if target_team_id is None and ticket.category_id:
        cat = db.query(TicketCategory).filter(TicketCategory.id == ticket.category_id).first()
        if cat:
            target_team_id = cat.default_team_id
    elif target_team_id is None and ticket.category:
        cat = (
            db.query(TicketCategory)
            .filter(
                TicketCategory.company_id == ticket.company_id,
                TicketCategory.name == ticket.category,
                TicketCategory.is_active == True,
            )
            .first()
        )
        if cat:
            target_team_id = cat.default_team_id

    if target_team_id is None:
        return AssignmentDecision(
            matched_rule_id=None,
            matched_rule_name=None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="no_matching_rule",
            trace=trace,
        )

    team = (
        db.query(Team)
        .filter(Team.id == target_team_id, Team.company_id == ticket.company_id, Team.is_active == True)
        .first()
    )
    if not team:
        return AssignmentDecision(
            matched_rule_id=matched_rule.id if matched_rule else None,
            matched_rule_name=matched_rule.name if matched_rule else None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="team_inactive_or_missing",
            trace=trace,
        )

    strategy = (matched_rule.strategy if matched_rule and matched_rule.strategy else team.default_strategy) or "least_loaded"
    prev_assignee = ticket.assigned_technician_id
    prev_team = ticket.team_id
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    sqlite_lock = _acquire_team_lock(db, ticket.company_id, team.id)
    try:
        candidates = load_team_candidates(db, ticket.company_id, team.id, now_utc=now_naive)
        cursor: Optional[RoundRobinCursor] = None
        last_idx = -1
        if strategy == "round_robin":
            cursor = _get_or_create_rr_cursor(db, ticket.company_id, team.id, for_update=True)
            last_idx = cursor.last_index

        chosen, next_idx, outcome = select_candidate(
            strategy=strategy,
            candidates=candidates,
            cursor_last_index=last_idx,
            required_skills=required_skills,
        )

        ticket.team_id = team.id
        new_assignee_id: Optional[uuid.UUID] = None
        if chosen is not None:
            new_assignee_id = chosen.user_id
            ticket.assigned_technician_id = new_assignee_id
            if ticket.status == "Open":
                ticket.status = "Assigned"
            tm = db.query(TeamMember).filter(TeamMember.id == chosen.team_member_id).first()
            if tm:
                tm.last_assigned_at = now_naive
            if cursor is not None:
                cursor.last_user_id = new_assignee_id
                cursor.last_index = next_idx

        event_payload = {
            "from_assignee_id": str(prev_assignee) if prev_assignee else None,
            "to_assignee_id": str(new_assignee_id) if new_assignee_id else None,
            "from_team_id": str(prev_team) if prev_team else None,
            "to_team_id": str(team.id),
            "strategy": strategy,
            "reason": outcome,
            "rule_id": str(matched_rule.id) if matched_rule else None,
            "rule_name": matched_rule.name if matched_rule else None,
        }
        db.add(
            TicketEvent(
                ticket_id=ticket.id,
                company_id=ticket.company_id,
                actor_id=actor_id,
                kind="assignment",
                payload=event_payload,
                visibility="public",
            )
        )
        log_audit(
            db=db,
            action="AUTO_ASSIGN_TICKET",
            resource_type="HelpDeskTicket",
            resource_id=str(ticket.id),
            user_id=actor_id,
            company_id=ticket.company_id,
            old_values={"assigned_technician_id": prev_assignee, "team_id": prev_team},
            new_values=event_payload,
            ip_address=ip_address,
            commit=False,
        )
        if commit:
            db.commit()
        else:
            db.flush()
    finally:
        if sqlite_lock is not None:
            sqlite_lock.release()

    if commit and (new_assignee_id != prev_assignee):
        watchers = [
            w[0]
            for w in db.query(TicketWatcher.user_id)
            .filter(TicketWatcher.ticket_id == ticket.id)
            .all()
        ]
        _notify_assignment_parties(
            db=db,
            company_id=ticket.company_id,
            entity_type="ticket",
            entity_id=ticket.id,
            title_label=f"{ticket.ticket_number}: {ticket.issue_title}",
            new_assignee_id=new_assignee_id,
            prev_assignee_id=prev_assignee,
            watcher_user_ids=watchers,
            actor_id=actor_id,
        )

    return AssignmentDecision(
        matched_rule_id=matched_rule.id if matched_rule else None,
        matched_rule_name=matched_rule.name if matched_rule else None,
        team_id=team.id,
        strategy_used=strategy,
        assignee_user_id=new_assignee_id,
        reason=outcome,
        trace=trace,
        candidates=candidates,
    )


def manual_assign_ticket(
    db: Session,
    ticket: HelpDeskTicket,
    team_id: Optional[uuid.UUID] = None,
    assignee_id: Optional[uuid.UUID] = None,
    clear_assignee: bool = False,
    actor_id: Optional[uuid.UUID] = None,
    reason: str = "manual",
    commit: bool = True,
    ip_address: Optional[str] = None,
) -> HelpDeskTicket:
    """Manually assign/reassign a ticket to a team and/or technician within the same company."""
    prev_assignee = ticket.assigned_technician_id
    prev_team = ticket.team_id
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    if team_id is not None:
        team = (
            db.query(Team)
            .filter(Team.id == team_id, Team.company_id == ticket.company_id)
            .first()
        )
        if not team:
            raise ValueError("Selected team does not exist in the active company.")
        ticket.team_id = team.id

    if clear_assignee:
        ticket.assigned_technician_id = None
    elif assignee_id is not None:
        user = db.query(User).filter(User.id == assignee_id, User.is_deleted == False).first()
        if not user or user.account_status != "Active":
            raise ValueError("Selected assignee user is not active.")
        if not _user_has_company_access(db, ticket.company_id, user):
            raise ValueError("Selected assignee does not belong to this company.")
        ticket.assigned_technician_id = user.id
        if ticket.status == "Open":
            ticket.status = "Assigned"
        # Update last_assigned_at if member of ticket's team
        if ticket.team_id:
            tm = (
                db.query(TeamMember)
                .filter(
                    TeamMember.team_id == ticket.team_id,
                    TeamMember.user_id == user.id,
                    TeamMember.company_id == ticket.company_id,
                )
                .first()
            )
            if tm:
                tm.last_assigned_at = now_naive

    event_payload = {
        "from_assignee_id": str(prev_assignee) if prev_assignee else None,
        "to_assignee_id": str(ticket.assigned_technician_id) if ticket.assigned_technician_id else None,
        "from_team_id": str(prev_team) if prev_team else None,
        "to_team_id": str(ticket.team_id) if ticket.team_id else None,
        "strategy": "manual",
        "reason": reason,
    }
    db.add(
        TicketEvent(
            ticket_id=ticket.id,
            company_id=ticket.company_id,
            actor_id=actor_id,
            kind="assignment",
            payload=event_payload,
            visibility="public",
        )
    )
    log_audit(
        db=db,
        action="ASSIGN_TICKET",
        resource_type="HelpDeskTicket",
        resource_id=str(ticket.id),
        user_id=actor_id,
        company_id=ticket.company_id,
        old_values={"assigned_technician_id": prev_assignee, "team_id": prev_team},
        new_values=event_payload,
        ip_address=ip_address,
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(ticket)
        if ticket.assigned_technician_id != prev_assignee:
            watchers = [
                w[0]
                for w in db.query(TicketWatcher.user_id)
                .filter(TicketWatcher.ticket_id == ticket.id)
                .all()
            ]
            _notify_assignment_parties(
                db=db,
                company_id=ticket.company_id,
                entity_type="ticket",
                entity_id=ticket.id,
                title_label=f"{ticket.ticket_number}: {ticket.issue_title}",
                new_assignee_id=ticket.assigned_technician_id,
                prev_assignee_id=prev_assignee,
                watcher_user_ids=watchers,
                actor_id=actor_id,
            )
    else:
        db.flush()
    return ticket


def auto_assign_task(
    db: Session,
    task: Task,
    actor_id: Optional[uuid.UUID] = None,
    force: bool = False,
    commit: bool = True,
    ip_address: Optional[str] = None,
) -> AssignmentDecision:
    """Evaluate assignment rules for a task and atomically assign team & user/employee."""
    if not force and (task.assignee_id is not None or task.assigned_to_id is not None):
        uid, eid = sync_task_assignee_fields(db, task.company_id, task.assignee_id, task.assigned_to_id)
        task.assignee_id = uid
        task.assigned_to_id = eid
        return AssignmentDecision(
            matched_rule_id=None,
            matched_rule_name=None,
            team_id=task.team_id,
            strategy_used="manual",
            assignee_user_id=task.assignee_id,
            reason="already_assigned",
        )

    ctx, required_skills = build_task_context(db, task)
    rules = _load_company_rule_specs(db, task.company_id, "task")
    matched_rule, trace = evaluate_rules(ctx, rules)

    target_team_id = matched_rule.team_id if matched_rule else task.team_id
    if target_team_id is None:
        return AssignmentDecision(
            matched_rule_id=None,
            matched_rule_name=None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="no_matching_rule",
            trace=trace,
        )

    team = (
        db.query(Team)
        .filter(Team.id == target_team_id, Team.company_id == task.company_id, Team.is_active == True)
        .first()
    )
    if not team:
        return AssignmentDecision(
            matched_rule_id=matched_rule.id if matched_rule else None,
            matched_rule_name=matched_rule.name if matched_rule else None,
            team_id=None,
            strategy_used="manual",
            assignee_user_id=None,
            reason="team_inactive_or_missing",
            trace=trace,
        )

    strategy = (matched_rule.strategy if matched_rule and matched_rule.strategy else team.default_strategy) or "least_loaded"
    prev_assignee = task.assignee_id
    prev_team = task.team_id
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    sqlite_lock = _acquire_team_lock(db, task.company_id, team.id)
    try:
        candidates = load_team_candidates(db, task.company_id, team.id, now_utc=now_naive)
        cursor: Optional[RoundRobinCursor] = None
        last_idx = -1
        if strategy == "round_robin":
            cursor = _get_or_create_rr_cursor(db, task.company_id, team.id, for_update=True)
            last_idx = cursor.last_index

        chosen, next_idx, outcome = select_candidate(
            strategy=strategy,
            candidates=candidates,
            cursor_last_index=last_idx,
            required_skills=required_skills,
        )

        task.team_id = team.id
        new_assignee_id: Optional[uuid.UUID] = None
        if chosen is not None:
            uid, eid = sync_task_assignee_fields(db, task.company_id, user_id=chosen.user_id)
            new_assignee_id = uid
            task.assignee_id = uid
            task.assigned_to_id = eid
            tm = db.query(TeamMember).filter(TeamMember.id == chosen.team_member_id).first()
            if tm:
                tm.last_assigned_at = now_naive
            if cursor is not None:
                cursor.last_user_id = new_assignee_id
                cursor.last_index = next_idx

        log_audit(
            db=db,
            action="AUTO_ASSIGN_TASK",
            resource_type="Task",
            resource_id=str(task.id),
            user_id=actor_id,
            company_id=task.company_id,
            old_values={"assignee_id": prev_assignee, "team_id": prev_team},
            new_values={
                "assignee_id": new_assignee_id,
                "team_id": team.id,
                "strategy": strategy,
                "reason": outcome,
                "rule_id": matched_rule.id if matched_rule else None,
            },
            ip_address=ip_address,
            commit=False,
        )
        if commit:
            db.commit()
        else:
            db.flush()
    finally:
        if sqlite_lock is not None:
            sqlite_lock.release()

    if commit and new_assignee_id != prev_assignee:
        watchers = [
            w[0]
            for w in db.query(TaskWatcher.user_id).filter(TaskWatcher.task_id == task.id).all()
        ]
        _notify_assignment_parties(
            db=db,
            company_id=task.company_id,
            entity_type="task",
            entity_id=task.id,
            title_label=task.title,
            new_assignee_id=new_assignee_id,
            prev_assignee_id=prev_assignee,
            watcher_user_ids=watchers,
            actor_id=actor_id,
        )

    return AssignmentDecision(
        matched_rule_id=matched_rule.id if matched_rule else None,
        matched_rule_name=matched_rule.name if matched_rule else None,
        team_id=team.id,
        strategy_used=strategy,
        assignee_user_id=new_assignee_id,
        reason=outcome,
        trace=trace,
        candidates=candidates,
    )


def manual_assign_task(
    db: Session,
    task: Task,
    team_id: Optional[uuid.UUID] = None,
    assignee_id: Optional[uuid.UUID] = None,
    employee_id: Optional[uuid.UUID] = None,
    clear_assignee: bool = False,
    actor_id: Optional[uuid.UUID] = None,
    reason: str = "manual",
    commit: bool = True,
    ip_address: Optional[str] = None,
) -> Task:
    """Manually assign/reassign a task with strict company checks and dual-sync."""
    prev_assignee = task.assignee_id
    prev_team = task.team_id
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    if team_id is not None:
        team = (
            db.query(Team)
            .filter(Team.id == team_id, Team.company_id == task.company_id)
            .first()
        )
        if not team:
            raise ValueError("Selected team does not exist in the active company.")
        task.team_id = team.id

    if clear_assignee:
        task.assignee_id = None
        task.assigned_to_id = None
    elif assignee_id is not None or employee_id is not None:
        if assignee_id is not None:
            user = db.query(User).filter(User.id == assignee_id, User.is_deleted == False).first()
            if not user or user.account_status != "Active":
                raise ValueError("Selected assignee user is not active.")
            if not _user_has_company_access(db, task.company_id, user):
                raise ValueError("Selected assignee does not belong to this company.")
        if employee_id is not None:
            emp = (
                db.query(Employee)
                .filter(Employee.id == employee_id, Employee.company_id == task.company_id)
                .first()
            )
            if not emp:
                raise ValueError("Selected employee does not belong to this company.")

        uid, eid = sync_task_assignee_fields(
            db, task.company_id, user_id=assignee_id, employee_id=employee_id
        )
        task.assignee_id = uid
        task.assigned_to_id = eid
        if task.team_id and uid:
            tm = (
                db.query(TeamMember)
                .filter(
                    TeamMember.team_id == task.team_id,
                    TeamMember.user_id == uid,
                    TeamMember.company_id == task.company_id,
                )
                .first()
            )
            if tm:
                tm.last_assigned_at = now_naive

    if actor_id:
        db.add(
            TaskComment(
                task_id=task.id,
                user_id=actor_id,
                content=f"تحديث إسناد المهمة ({reason})",
            )
        )

    log_audit(
        db=db,
        action="ASSIGN_TASK",
        resource_type="Task",
        resource_id=str(task.id),
        user_id=actor_id,
        company_id=task.company_id,
        old_values={"assignee_id": prev_assignee, "team_id": prev_team},
        new_values={
            "assignee_id": task.assignee_id,
            "assigned_to_id": task.assigned_to_id,
            "team_id": task.team_id,
            "reason": reason,
        },
        ip_address=ip_address,
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(task)
        if task.assignee_id != prev_assignee:
            watchers = [
                w[0]
                for w in db.query(TaskWatcher.user_id).filter(TaskWatcher.task_id == task.id).all()
            ]
            _notify_assignment_parties(
                db=db,
                company_id=task.company_id,
                entity_type="task",
                entity_id=task.id,
                title_label=task.title,
                new_assignee_id=task.assignee_id,
                prev_assignee_id=prev_assignee,
                watcher_user_ids=watchers,
                actor_id=actor_id,
            )
    else:
        db.flush()
    return task
