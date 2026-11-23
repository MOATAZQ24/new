# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Business-hours SLA calculation and state evaluation service.

Pure calculation helpers accept explicit UTC datetimes so they can be
deterministically unit-tested across weekends, holidays, and timezones.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone, tzinfo
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.ticket import HelpDeskTicket, SlaPolicy
from app.services.work_management_defaults import DEFAULT_BUSINESS_HOURS

DAY_NAME_TO_WEEKDAY = {
    "mon": 0,
    "monday": 0,
    "tue": 1,
    "tuesday": 1,
    "wed": 2,
    "wednesday": 2,
    "thu": 3,
    "thursday": 3,
    "fri": 4,
    "friday": 4,
    "sat": 5,
    "saturday": 5,
    "sun": 6,
    "sunday": 6,
}

# Deterministic UTC-offset fallback for environments without OS tzdata (e.g. Windows dev)
FALLBACK_TZ_OFFSETS_MINUTES: Dict[str, int] = {
    "UTC": 0,
    "Etc/UTC": 0,
    "GMT": 0,
    "Europe/London": 0,
    "Africa/Cairo": 120,
    "Asia/Riyadh": 180,
    "Asia/Kuwait": 180,
    "Asia/Qatar": 180,
    "Asia/Bahrain": 180,
    "Asia/Amman": 180,
    "Asia/Baghdad": 180,
    "Europe/Istanbul": 180,
    "Asia/Dubai": 240,
    "Asia/Muscat": 240,
}

SLA_PAUSE_TICKET_STATUSES = {
    "Waiting for User",
    "Waiting for Requester",
    "Waiting for Vendor",
    "Pending Approval",
}

SLA_CLOSED_TICKET_STATUSES = {"Resolved", "Closed", "Cancelled"}
SLA_CLOSED_TASK_STATUSES = {"Completed", "Cancelled", "Rejected"}

PRIORITY_LADDER = ["Low", "Medium", "High", "Urgent", "Critical"]


@dataclass(frozen=True)
class BusinessHoursConfig:
    tz_name: str
    tz: tzinfo
    working_days: Set[int]
    start_time: time
    end_time: time
    holidays: Set[str]  # YYYY-MM-DD strings


def resolve_timezone(tz_name: Optional[str]) -> tzinfo:
    """Resolve an IANA timezone name with safe fallback when tzdata is absent."""
    name = (tz_name or "Asia/Riyadh").strip()
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, KeyError, ValueError):
        pass

    if name in FALLBACK_TZ_OFFSETS_MINUTES:
        return timezone(timedelta(minutes=FALLBACK_TZ_OFFSETS_MINUTES[name]))

    upper = name.upper()
    if upper.startswith("UTC") and len(upper) >= 5 and upper[3] in ("+", "-"):
        sign = 1 if upper[3] == "+" else -1
        parts = upper[4:].split(":")
        try:
            hours = int(parts[0])
            mins = int(parts[1]) if len(parts) > 1 else 0
            return timezone(timedelta(minutes=sign * (hours * 60 + mins)))
        except ValueError:
            pass

    # Default to Asia/Riyadh (UTC+3)
    return timezone(timedelta(hours=3))


def _parse_hhmm(value: str, fallback: time) -> time:
    try:
        parts = value.strip().split(":")
        return time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        return fallback


def parse_business_hours(business_hours: Optional[Dict[str, Any]]) -> BusinessHoursConfig:
    """Parse and normalize a business_hours JSON config dict."""
    cfg = dict(DEFAULT_BUSINESS_HOURS)
    if isinstance(business_hours, dict):
        cfg.update({k: v for k, v in business_hours.items() if v is not None})

    tz_name = str(cfg.get("timezone") or "Asia/Riyadh")
    tz = resolve_timezone(tz_name)

    raw_days = cfg.get("working_days") or DEFAULT_BUSINESS_HOURS["working_days"]
    working_days: Set[int] = set()
    for d in raw_days:
        if isinstance(d, int) and 0 <= d <= 6:
            working_days.add(d)
        elif isinstance(d, str):
            mapped = DAY_NAME_TO_WEEKDAY.get(d.strip().lower())
            if mapped is not None:
                working_days.add(mapped)
    if not working_days:
        working_days = {6, 0, 1, 2, 3}  # Sun-Thu

    start_t = _parse_hhmm(str(cfg.get("start") or "08:00"), time(8, 0))
    end_t = _parse_hhmm(str(cfg.get("end") or "17:00"), time(17, 0))
    if end_t <= start_t:
        start_t, end_t = time(8, 0), time(17, 0)

    holidays = {str(h).strip() for h in (cfg.get("holidays") or []) if h}
    return BusinessHoursConfig(
        tz_name=tz_name,
        tz=tz,
        working_days=working_days,
        start_time=start_t,
        end_time=end_t,
        holidays=holidays,
    )


def normalize_priority(priority: Optional[str]) -> str:
    """Normalize legacy priority labels to canonical SLA ladder values."""
    if not priority:
        return "Medium"
    raw = priority.strip().lower()
    if "critical" in raw:
        return "Critical"
    if "urgent" in raw:
        return "Urgent"
    if "high" in raw:
        return "High"
    if "low" in raw:
        return "Low"
    return "Medium"


def next_higher_priority(priority: Optional[str]) -> str:
    """Return the next higher priority tier on the SLA ladder."""
    norm = normalize_priority(priority)
    try:
        idx = PRIORITY_LADDER.index(norm)
    except ValueError:
        return "High"
    if idx + 1 < len(PRIORITY_LADDER):
        return PRIORITY_LADDER[idx + 1]
    return PRIORITY_LADDER[-1]


def _ensure_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def add_business_minutes(
    start_utc: datetime,
    minutes: int,
    business_hours: Optional[Dict[str, Any]] = None,
    business_hours_only: bool = True,
) -> datetime:
    """Add `minutes` to `start_utc`, optionally counting only business hours.

    Returns a naive UTC datetime consistent with SQLAlchemy DateTime columns.
    """
    start_aware = _ensure_utc_aware(start_utc)
    if minutes <= 0:
        return _to_naive_utc(start_aware)

    if not business_hours_only:
        return _to_naive_utc(start_aware + timedelta(minutes=minutes))

    cfg = parse_business_hours(business_hours)
    cursor = start_aware.astimezone(cfg.tz)
    remaining_seconds = float(minutes * 60)

    # Safety bound (3660 days = 10 years) prevents infinite loops on malformed calendars
    for _ in range(3660):
        day_str = cursor.date().isoformat()
        is_working = (cursor.weekday() in cfg.working_days) and (day_str not in cfg.holidays)
        if not is_working:
            next_day = cursor.date() + timedelta(days=1)
            cursor = datetime.combine(next_day, cfg.start_time, tzinfo=cfg.tz)
            continue

        window_start = datetime.combine(cursor.date(), cfg.start_time, tzinfo=cfg.tz)
        window_end = datetime.combine(cursor.date(), cfg.end_time, tzinfo=cfg.tz)

        if cursor < window_start:
            cursor = window_start
        elif cursor >= window_end:
            next_day = cursor.date() + timedelta(days=1)
            cursor = datetime.combine(next_day, cfg.start_time, tzinfo=cfg.tz)
            continue

        available_seconds = (window_end - cursor).total_seconds()
        if remaining_seconds <= available_seconds:
            target = cursor + timedelta(seconds=remaining_seconds)
            return _to_naive_utc(target)

        remaining_seconds -= available_seconds
        next_day = cursor.date() + timedelta(days=1)
        cursor = datetime.combine(next_day, cfg.start_time, tzinfo=cfg.tz)

    # Fallback if loop exhausted
    return _to_naive_utc(start_aware + timedelta(minutes=minutes))


def compute_sla_state(
    now_utc: datetime,
    created_at: datetime,
    first_response_due_at: Optional[datetime],
    resolution_due_at: Optional[datetime],
    first_response_at: Optional[datetime] = None,
    resolved_at: Optional[datetime] = None,
    is_paused: bool = False,
    at_risk_ratio: float = 0.80,
) -> str:
    """Compute SLA state: 'ok', 'at_risk', 'breached', or 'paused'."""
    now = _to_naive_utc(now_utc)
    created = _to_naive_utc(created_at)
    fr_due = _to_naive_utc(first_response_due_at) if first_response_due_at else None
    res_due = _to_naive_utc(resolution_due_at) if resolution_due_at else None
    fr_at = _to_naive_utc(first_response_at) if first_response_at else None
    res_at = _to_naive_utc(resolved_at) if resolved_at else None

    if res_at is not None:
        if res_due is not None and res_at > res_due:
            return "breached"
        if fr_due is not None and fr_at is not None and fr_at > fr_due:
            return "breached"
        return "ok"

    if is_paused:
        return "paused"

    # Breach checks on active clocks
    if fr_at is None and fr_due is not None and now > fr_due:
        return "breached"
    if res_due is not None and now > res_due:
        return "breached"

    # At-risk checks (>= 80% elapsed on any active clock)
    if fr_at is None and fr_due is not None:
        total = (fr_due - created).total_seconds()
        elapsed = (now - created).total_seconds()
        if total > 0 and (elapsed / total) >= at_risk_ratio:
            return "at_risk"

    if res_due is not None:
        total = (res_due - created).total_seconds()
        elapsed = (now - created).total_seconds()
        if total > 0 and (elapsed / total) >= at_risk_ratio:
            return "at_risk"

    return "ok"


def resolve_sla_policy(
    db: Session,
    company_id: uuid.UUID,
    priority: Optional[str],
    explicit_policy_id: Optional[uuid.UUID] = None,
) -> Optional[SlaPolicy]:
    """Find the active SlaPolicy for a company by explicit ID, priority, or default."""
    if explicit_policy_id:
        pol = (
            db.query(SlaPolicy)
            .filter(
                SlaPolicy.id == explicit_policy_id,
                SlaPolicy.company_id == company_id,
                SlaPolicy.is_active == True,
            )
            .first()
        )
        if pol:
            return pol

    norm_prio = normalize_priority(priority)
    policies = (
        db.query(SlaPolicy)
        .filter(SlaPolicy.company_id == company_id, SlaPolicy.is_active == True)
        .all()
    )
    for p in policies:
        if normalize_priority(p.priority) == norm_prio:
            return p
    for p in policies:
        if getattr(p, "is_default", False):
            return p
    return policies[0] if policies else None


def apply_sla_to_ticket(
    db: Session,
    ticket: HelpDeskTicket,
    now_utc: Optional[datetime] = None,
    explicit_policy_id: Optional[uuid.UUID] = None,
) -> HelpDeskTicket:
    """Attach SLA policy and compute first_response_due_at / resolution_due_at / sla_state."""
    now = _to_naive_utc(now_utc or datetime.now(timezone.utc))
    base_time = _to_naive_utc(ticket.created_at) if ticket.created_at else now

    pol = resolve_sla_policy(
        db,
        ticket.company_id,
        ticket.priority,
        explicit_policy_id=explicit_policy_id or ticket.sla_policy_id,
    )
    if pol:
        ticket.sla_policy_id = pol.id
        pause_shift = timedelta(seconds=ticket.sla_paused_total_seconds or 0)
        fr_due = add_business_minutes(
            base_time,
            pol.first_response_minutes,
            business_hours=pol.business_hours,
            business_hours_only=pol.business_hours_only,
        ) + pause_shift
        res_due = add_business_minutes(
            base_time,
            pol.resolution_minutes,
            business_hours=pol.business_hours,
            business_hours_only=pol.business_hours_only,
        ) + pause_shift
        ticket.first_response_due_at = fr_due
        ticket.resolution_due_at = res_due

    is_paused = bool(ticket.sla_paused_at) or (ticket.status in SLA_PAUSE_TICKET_STATUSES)
    ticket.sla_state = compute_sla_state(
        now_utc=now,
        created_at=base_time,
        first_response_due_at=ticket.first_response_due_at,
        resolution_due_at=ticket.resolution_due_at,
        first_response_at=ticket.first_response_at,
        resolved_at=ticket.resolved_at,
        is_paused=is_paused,
    )
    if ticket.sla_state == "breached":
        ticket.sla_status = "Breached"
    elif ticket.sla_state == "at_risk":
        ticket.sla_status = "At_Risk"
    else:
        ticket.sla_status = "Within_SLA"
    return ticket


def apply_sla_to_task(
    db: Session,
    task: Task,
    now_utc: Optional[datetime] = None,
    explicit_policy_id: Optional[uuid.UUID] = None,
) -> Task:
    """Compute SLA deadlines and state for a Task when an SLA policy is linked."""
    now = _to_naive_utc(now_utc or datetime.now(timezone.utc))
    base_time = _to_naive_utc(task.created_at) if task.created_at else now

    pol = None
    if explicit_policy_id or task.sla_policy_id:
        pol = resolve_sla_policy(
            db,
            task.company_id,
            task.priority,
            explicit_policy_id=explicit_policy_id or task.sla_policy_id,
        )
    if pol:
        task.sla_policy_id = pol.id
        task.first_response_due_at = add_business_minutes(
            base_time,
            pol.first_response_minutes,
            business_hours=pol.business_hours,
            business_hours_only=pol.business_hours_only,
        )
        task.resolution_due_at = add_business_minutes(
            base_time,
            pol.resolution_minutes,
            business_hours=pol.business_hours,
            business_hours_only=pol.business_hours_only,
        )

    is_paused = task.status in ("On Hold", "Waiting for Response", "Blocked")
    task.sla_state = compute_sla_state(
        now_utc=now,
        created_at=base_time,
        first_response_due_at=task.first_response_due_at,
        resolution_due_at=task.resolution_due_at or task.deadline_at,
        first_response_at=task.acknowledged_at or task.accepted_at,
        resolved_at=task.completed_at,
        is_paused=is_paused,
    )
    return task


def handle_ticket_sla_pause_resume(
    ticket: HelpDeskTicket,
    old_status: str,
    new_status: str,
    now_utc: Optional[datetime] = None,
) -> None:
    """Pause SLA clock when entering a waiting state; shift deadlines on resume."""
    now = _to_naive_utc(now_utc or datetime.now(timezone.utc))
    was_paused = (old_status in SLA_PAUSE_TICKET_STATUSES) or (ticket.sla_paused_at is not None)
    will_pause = new_status in SLA_PAUSE_TICKET_STATUSES

    if not was_paused and will_pause:
        ticket.sla_paused_at = now
        ticket.sla_state = "paused"
    elif was_paused and not will_pause:
        if ticket.sla_paused_at is not None:
            paused_delta = max(0, int((now - _to_naive_utc(ticket.sla_paused_at)).total_seconds()))
            ticket.sla_paused_total_seconds = (ticket.sla_paused_total_seconds or 0) + paused_delta
            shift = timedelta(seconds=paused_delta)
            if ticket.first_response_due_at:
                ticket.first_response_due_at = ticket.first_response_due_at + shift
            if ticket.resolution_due_at:
                ticket.resolution_due_at = ticket.resolution_due_at + shift
        ticket.sla_paused_at = None
        ticket.sla_state = compute_sla_state(
            now_utc=now,
            created_at=ticket.created_at or now,
            first_response_due_at=ticket.first_response_due_at,
            resolution_due_at=ticket.resolution_due_at,
            first_response_at=ticket.first_response_at,
            resolved_at=ticket.resolved_at,
            is_paused=False,
        )
