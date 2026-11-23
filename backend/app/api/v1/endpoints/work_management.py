# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Work Management API endpoints:
- Teams & Team Members CRUD
- Assignment Rules CRUD, Reorder, and Dry-Run Preview
- SLA Policies CRUD (with business hours)
- Workflow Transition Matrix CRUD
- Ticket Categories, Macros, and Saved Views CRUD
- Unified /me/work feed (Tickets + Tasks + Pending Approvals)
- /workload capacity & SLA overview
- Protected /system/run-sla-escalation job trigger
"""

from __future__ import annotations

import hmac
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import (
    GranularPermission,
    get_effective_roles_for_granular,
    get_user_granular_permissions,
    has_granular_permission,
    require_granular_permission,
)
from app.core.response import success_response
from app.core.security import get_current_user, get_user_company_id, validate_company_fk
from app.models.company import Branch
from app.models.enterprise import LeaveRequest
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket, SlaPolicy, TicketApproval
from app.models.user import CompanyMembership, Employee, User
from app.models.work_management import (
    AssignmentRule,
    Macro,
    SavedView,
    TaskWatcher,
    Team,
    TeamMember,
    TicketCategory,
    TicketWatcher,
    WorkflowTransition,
)
from app.schemas.work_management import (
    AssignmentDryRunRequest,
    AssignmentRuleCreate,
    AssignmentRuleReorder,
    AssignmentRuleUpdate,
    MacroCreate,
    MacroUpdate,
    SavedViewCreate,
    SavedViewUpdate,
    SlaPolicyCreateV2,
    SlaPolicyUpdateV2,
    TeamCreate,
    TeamMemberUpdate,
    TeamMemberUpsert,
    TeamUpdate,
    TicketCategoryCreate,
    TicketCategoryUpdate,
    WorkflowTransitionCreate,
    WorkflowTransitionUpdate,
)
from app.services.assignment import (
    CLOSED_TASK_STATUSES,
    CLOSED_TICKET_STATUSES,
    MAX_ACTIVE_RULES_PER_COMPANY,
    dry_run_assignment,
    load_team_candidates,
)
from app.services.audit_service import log_audit
from app.services.work_management_defaults import (
    DEFAULT_BUSINESS_HOURS,
    ensure_default_categories,
    ensure_default_sla_policies,
    ensure_workflow_transitions,
)
from app.workers.sla_escalation import run_sla_escalation

router = APIRouter(tags=["Work Management"])


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request and request.client:
        return request.client.host
    return None


def _ensure_user_in_company(db: Session, company_id: uuid.UUID, user_id: uuid.UUID) -> User:
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم المحدد غير موجود")
    if not user.is_superadmin:
        mem = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if not mem:
            raise HTTPException(
                status_code=400,
                detail="المستخدم المحدد غير مرتبط بهذه الشركة",
            )
    return user


# ==============================================================================
# 1. TEAMS & TEAM MEMBERS
# ==============================================================================

def _serialize_team(db: Session, team: Team) -> Dict[str, Any]:
    member_count = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.company_id == team.company_id)
        .count()
    )
    lead_name = None
    if team.lead_user:
        lead_name = team.lead_user.employee.full_name if team.lead_user.employee else team.lead_user.username
    return {
        "id": str(team.id),
        "company_id": str(team.company_id),
        "branch_id": str(team.branch_id) if team.branch_id else None,
        "name": team.name,
        "description": team.description,
        "default_strategy": team.default_strategy,
        "is_active": team.is_active,
        "lead_user_id": str(team.lead_user_id) if team.lead_user_id else None,
        "lead_user_name": lead_name,
        "member_count": member_count,
        "created_at": team.created_at.isoformat() if team.created_at else None,
        "updated_at": team.updated_at.isoformat() if team.updated_at else None,
    }


@router.get("/teams")
def list_teams(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    q = db.query(Team).filter(Team.company_id == active_cid)
    if not include_inactive:
        q = q.filter(Team.is_active == True)
    teams = q.order_by(Team.name.asc()).all()
    return success_response(data=[_serialize_team(db, t) for t in teams])


@router.post("/teams")
def create_team(
    payload: TeamCreate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    if payload.branch_id:
        validate_company_fk(db, Branch, payload.branch_id, active_cid, "الفرع")
    if payload.lead_user_id:
        _ensure_user_in_company(db, active_cid, payload.lead_user_id)

    dup = (
        db.query(Team)
        .filter(Team.company_id == active_cid, Team.name == payload.name.strip())
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="يوجد فريق بهذا الاسم بالفعل في الشركة")

    team = Team(
        company_id=active_cid,
        branch_id=payload.branch_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        default_strategy=payload.default_strategy,
        lead_user_id=payload.lead_user_id,
        is_active=payload.is_active,
    )
    db.add(team)
    db.commit()
    db.refresh(team)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Team",
        resource_id=str(team.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"name": team.name, "default_strategy": team.default_strategy},
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_team(db, team), message="تم إنشاء الفريق بنجاح")


@router.patch("/teams/{team_id}")
def update_team(
    team_id: uuid.UUID,
    payload: TeamUpdate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id, Team.company_id == active_cid).first()
    if not team:
        raise HTTPException(status_code=404, detail="الفريق غير موجود")

    updates = payload.model_dump(exclude_unset=True)
    if "branch_id" in updates and updates["branch_id"]:
        validate_company_fk(db, Branch, updates["branch_id"], active_cid, "الفرع")
    if "lead_user_id" in updates and updates["lead_user_id"]:
        _ensure_user_in_company(db, active_cid, updates["lead_user_id"])
    if "name" in updates and updates["name"]:
        clean_name = updates["name"].strip()
        dup = (
            db.query(Team)
            .filter(Team.company_id == active_cid, Team.name == clean_name, Team.id != team.id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="يوجد فريق آخر بهذا الاسم في الشركة")
        updates["name"] = clean_name

    old_vals = {"name": team.name, "default_strategy": team.default_strategy, "is_active": team.is_active}
    for k, v in updates.items():
        setattr(team, k, v)
    db.commit()
    db.refresh(team)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="Team",
        resource_id=str(team.id),
        user_id=current_user.id,
        company_id=active_cid,
        old_values=old_vals,
        new_values=updates,
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_team(db, team), message="تم تحديث الفريق بنجاح")


@router.delete("/teams/{team_id}")
def delete_team(
    team_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id, Team.company_id == active_cid).first()
    if not team:
        raise HTTPException(status_code=404, detail="الفريق غير موجود")
    team.is_active = False
    db.commit()
    log_audit(
        db=db,
        action="DEACTIVATE",
        resource_type="Team",
        resource_id=str(team.id),
        user_id=current_user.id,
        company_id=active_cid,
        ip_address=_client_ip(request),
    )
    return success_response(data={"id": str(team.id)}, message="تم تعطيل الفريق بنجاح")


@router.get("/teams/{team_id}/members")
def list_team_members(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id, Team.company_id == active_cid).first()
    if not team:
        raise HTTPException(status_code=404, detail="الفريق غير موجود")

    candidates = load_team_candidates(db, active_cid, team.id)
    cand_by_uid = {c.user_id: c for c in candidates}
    members = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.company_id == active_cid)
        .all()
    )
    data = []
    for m in members:
        u = m.user
        c = cand_by_uid.get(m.user_id)
        full_name = u.employee.full_name if (u and u.employee) else (u.username if u else None)
        data.append({
            "id": str(m.id),
            "team_id": str(m.team_id),
            "user_id": str(m.user_id),
            "username": u.username if u else None,
            "full_name": full_name,
            "email": u.email if u else None,
            "skills": m.skills or [],
            "max_open_items": m.max_open_items,
            "is_available": m.is_available,
            "weight": m.weight,
            "open_count": c.open_count if c else 0,
            "is_eligible": c.is_eligible if c else False,
            "ineligible_reason": c.ineligible_reason if c else None,
            "last_assigned_at": m.last_assigned_at.isoformat() if m.last_assigned_at else None,
        })
    return success_response(data=data)


@router.post("/teams/{team_id}/members")
def add_team_member(
    team_id: uuid.UUID,
    payload: TeamMemberUpsert,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id, Team.company_id == active_cid).first()
    if not team:
        raise HTTPException(status_code=404, detail="الفريق غير موجود")

    user = _ensure_user_in_company(db, active_cid, payload.user_id)
    existing = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
        .first()
    )
    if existing:
        existing.skills = payload.skills
        existing.max_open_items = payload.max_open_items
        existing.is_available = payload.is_available
        existing.weight = payload.weight
        db.commit()
        db.refresh(existing)
        member = existing
        action_name = "UPDATE_MEMBER"
    else:
        member = TeamMember(
            company_id=active_cid,
            team_id=team.id,
            user_id=user.id,
            skills=payload.skills,
            max_open_items=payload.max_open_items,
            is_available=payload.is_available,
            weight=payload.weight,
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        action_name = "ADD_MEMBER"

    log_audit(
        db=db,
        action=action_name,
        resource_type="TeamMember",
        resource_id=str(member.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={
            "team_id": str(team.id),
            "user_id": str(user.id),
            "skills": member.skills,
            "max_open_items": member.max_open_items,
        },
        ip_address=_client_ip(request),
    )
    return success_response(data={"id": str(member.id), "user_id": str(user.id)}, message="تم حفظ عضو الفريق بنجاح")


@router.patch("/teams/{team_id}/members/{member_id}")
def update_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: TeamMemberUpdate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.id == member_id,
            TeamMember.team_id == team_id,
            TeamMember.company_id == active_cid,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="عضو الفريق غير موجود")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(member, k, v)
    db.commit()
    db.refresh(member)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="TeamMember",
        resource_id=str(member.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=updates,
        ip_address=_client_ip(request),
    )
    return success_response(data={"id": str(member.id)}, message="تم تحديث بيانات عضو الفريق")


@router.delete("/teams/{team_id}/members/{member_id}")
def remove_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.id == member_id,
            TeamMember.team_id == team_id,
            TeamMember.company_id == active_cid,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="عضو الفريق غير موجود")
    db.delete(member)
    db.commit()
    log_audit(
        db=db,
        action="DELETE",
        resource_type="TeamMember",
        resource_id=str(member_id),
        user_id=current_user.id,
        company_id=active_cid,
        ip_address=_client_ip(request),
    )
    return success_response(message="تم إزالة العضو من الفريق بنجاح")


# ==============================================================================
# 2. ASSIGNMENT RULES + REORDER + DRY-RUN
# ==============================================================================

def _serialize_rule(rule: AssignmentRule) -> Dict[str, Any]:
    return {
        "id": str(rule.id),
        "company_id": str(rule.company_id),
        "entity_type": rule.entity_type,
        "position": rule.position,
        "name": rule.name,
        "conditions": rule.conditions or {},
        "team_id": str(rule.team_id),
        "team_name": rule.team.name if rule.team else None,
        "strategy": rule.strategy,
        "is_active": rule.is_active,
        "stop_on_match": rule.stop_on_match,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


@router.get("/assignment-rules")
def list_assignment_rules(
    entity_type: Optional[str] = Query(None, pattern="^(ticket|task)$"),
    include_inactive: bool = True,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    q = db.query(AssignmentRule).filter(AssignmentRule.company_id == active_cid)
    if entity_type:
        q = q.filter(AssignmentRule.entity_type == entity_type)
    if not include_inactive:
        q = q.filter(AssignmentRule.is_active == True)
    rules = q.order_by(AssignmentRule.entity_type.asc(), AssignmentRule.position.asc(), AssignmentRule.created_at.asc()).all()
    return success_response(data=[_serialize_rule(r) for r in rules])


@router.post("/assignment-rules")
def create_assignment_rule(
    payload: AssignmentRuleCreate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.RULE_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == payload.team_id, Team.company_id == active_cid).first()
    if not team:
        raise HTTPException(status_code=400, detail="الفريق المستهدف غير موجود في الشركة الحالية")

    if payload.is_active:
        active_cnt = (
            db.query(AssignmentRule)
            .filter(AssignmentRule.company_id == active_cid, AssignmentRule.is_active == True)
            .count()
        )
        if active_cnt >= MAX_ACTIVE_RULES_PER_COMPANY:
            raise HTTPException(
                status_code=400,
                detail=f"تم بلوغ الحد الأقصى لعدد قواعد التوزيع النشطة ({MAX_ACTIVE_RULES_PER_COMPANY})",
            )

    rule = AssignmentRule(
        company_id=active_cid,
        entity_type=payload.entity_type,
        position=payload.position,
        name=payload.name.strip(),
        conditions=payload.conditions,
        team_id=team.id,
        strategy=payload.strategy,
        is_active=payload.is_active,
        stop_on_match=payload.stop_on_match,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="AssignmentRule",
        resource_id=str(rule.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=_serialize_rule(rule),
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_rule(rule), message="تم إنشاء قاعدة التوزيع بنجاح")


@router.post("/assignment-rules/reorder")
def reorder_assignment_rules(
    payload: AssignmentRuleReorder,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.RULE_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    rules = (
        db.query(AssignmentRule)
        .filter(
            AssignmentRule.company_id == active_cid,
            AssignmentRule.entity_type == payload.entity_type,
            AssignmentRule.id.in_(payload.rule_ids),
        )
        .all()
    )
    by_id = {r.id: r for r in rules}
    if len(by_id) != len(set(payload.rule_ids)):
        raise HTTPException(status_code=400, detail="بعض قواعد التوزيع غير موجودة أو خارج نطاق الشركة")

    for idx, rid in enumerate(payload.rule_ids, start=1):
        by_id[rid].position = idx
    db.commit()

    log_audit(
        db=db,
        action="REORDER",
        resource_type="AssignmentRule",
        resource_id=payload.entity_type,
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"rule_ids": [str(x) for x in payload.rule_ids]},
        ip_address=_client_ip(request),
    )
    return success_response(message="تم إعادة ترتيب قواعد التوزيع بنجاح")


@router.post("/assignment-rules/dry-run")
def dry_run_assignment_rules(
    payload: AssignmentDryRunRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    if not (
        has_granular_permission(current_user, GranularPermission.RULE_MANAGE, active_cid, db)
        or has_granular_permission(current_user, GranularPermission.TICKET_ASSIGN, active_cid, db)
    ):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تجربة قواعد التوزيع")

    ctx = {
        "category": payload.category,
        "priority": payload.priority,
        "branch_id": str(payload.branch_id) if payload.branch_id else None,
        "department_id": str(payload.department_id) if payload.department_id else None,
        "asset_type": payload.asset_type,
        "title": payload.title or "",
        "description": payload.description or "",
        "requester_role": payload.requester_role,
    }
    decision = dry_run_assignment(
        db=db,
        company_id=active_cid,
        entity_type=payload.entity_type,
        entity_ctx=ctx,
        required_skills=payload.required_skills,
    )

    team_name = None
    if decision.team_id:
        t = db.query(Team).filter(Team.id == decision.team_id).first()
        team_name = t.name if t else None
    assignee_name = None
    if decision.assignee_user_id:
        u = db.query(User).filter(User.id == decision.assignee_user_id).first()
        if u:
            assignee_name = u.employee.full_name if u.employee else u.username

    return success_response(
        data={
            "matched_rule_id": str(decision.matched_rule_id) if decision.matched_rule_id else None,
            "matched_rule_name": decision.matched_rule_name,
            "team_id": str(decision.team_id) if decision.team_id else None,
            "team_name": team_name,
            "strategy_used": decision.strategy_used,
            "assignee_user_id": str(decision.assignee_user_id) if decision.assignee_user_id else None,
            "assignee_name": assignee_name,
            "reason": decision.reason,
            "trace": [
                {
                    "rule_id": tr.rule_id,
                    "rule_name": tr.rule_name,
                    "position": tr.position,
                    "matched": tr.matched,
                    "stopped": tr.stopped,
                    "team_id": tr.team_id,
                    "strategy": tr.strategy,
                }
                for tr in decision.trace
            ],
            "candidates": [
                {
                    "user_id": str(c.user_id),
                    "username": c.username,
                    "skills": list(c.skills),
                    "open_count": c.open_count,
                    "max_open_items": c.max_open_items,
                    "weight": c.weight,
                    "is_available": c.is_available,
                    "is_eligible": c.is_eligible,
                    "ineligible_reason": c.ineligible_reason,
                }
                for c in decision.candidates
            ],
        }
    )


@router.patch("/assignment-rules/{rule_id}")
def update_assignment_rule(
    rule_id: uuid.UUID,
    payload: AssignmentRuleUpdate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.RULE_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    rule = (
        db.query(AssignmentRule)
        .filter(AssignmentRule.id == rule_id, AssignmentRule.company_id == active_cid)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="قاعدة التوزيع غير موجودة")

    updates = payload.model_dump(exclude_unset=True)
    if "team_id" in updates and updates["team_id"]:
        team = db.query(Team).filter(Team.id == updates["team_id"], Team.company_id == active_cid).first()
        if not team:
            raise HTTPException(status_code=400, detail="الفريق المستهدف غير موجود في الشركة الحالية")
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()

    for k, v in updates.items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="AssignmentRule",
        resource_id=str(rule.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=updates,
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_rule(rule), message="تم تحديث قاعدة التوزيع بنجاح")


@router.delete("/assignment-rules/{rule_id}")
def delete_assignment_rule(
    rule_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.RULE_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    rule = (
        db.query(AssignmentRule)
        .filter(AssignmentRule.id == rule_id, AssignmentRule.company_id == active_cid)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="قاعدة التوزيع غير موجودة")
    db.delete(rule)
    db.commit()
    log_audit(
        db=db,
        action="DELETE",
        resource_type="AssignmentRule",
        resource_id=str(rule_id),
        user_id=current_user.id,
        company_id=active_cid,
        ip_address=_client_ip(request),
    )
    return success_response(message="تم حذف قاعدة التوزيع بنجاح")


# ==============================================================================
# 3. SLA POLICIES CRUD
# ==============================================================================

def _serialize_sla(p: SlaPolicy) -> Dict[str, Any]:
    return {
        "id": str(p.id),
        "company_id": str(p.company_id),
        "name": p.name,
        "priority": p.priority,
        "first_response_minutes": p.first_response_minutes,
        "resolution_minutes": p.resolution_minutes,
        "escalation_notify_minutes": p.escalation_notify_minutes,
        "business_hours_only": p.business_hours_only,
        "business_hours": p.business_hours or dict(DEFAULT_BUSINESS_HOURS),
        "is_default": bool(p.is_default),
        "escalate_on_breach": bool(p.escalate_on_breach),
        "bump_priority_on_breach": bool(p.bump_priority_on_breach),
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/sla-policies")
def list_sla_policies_v2(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ensure_default_sla_policies(db, active_cid)
    db.commit()
    q = db.query(SlaPolicy).filter(SlaPolicy.company_id == active_cid)
    if not include_inactive:
        q = q.filter(SlaPolicy.is_active == True)
    policies = q.order_by(SlaPolicy.first_response_minutes.asc()).all()
    return success_response(data=[_serialize_sla(p) for p in policies])


@router.post("/sla-policies")
def create_sla_policy_v2(
    payload: SlaPolicyCreateV2,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.SLA_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    if payload.is_default:
        db.query(SlaPolicy).filter(SlaPolicy.company_id == active_cid, SlaPolicy.is_default == True).update(
            {"is_default": False}
        )

    pol = SlaPolicy(
        company_id=active_cid,
        name=payload.name.strip(),
        priority=payload.priority.strip(),
        first_response_minutes=payload.first_response_minutes,
        resolution_minutes=payload.resolution_minutes,
        escalation_notify_minutes=payload.escalation_notify_minutes,
        business_hours_only=payload.business_hours_only,
        business_hours=payload.business_hours.model_dump() if payload.business_hours else dict(DEFAULT_BUSINESS_HOURS),
        is_default=payload.is_default,
        escalate_on_breach=payload.escalate_on_breach,
        bump_priority_on_breach=payload.bump_priority_on_breach,
        is_active=payload.is_active,
    )
    db.add(pol)
    db.commit()
    db.refresh(pol)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="SlaPolicy",
        resource_id=str(pol.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=_serialize_sla(pol),
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_sla(pol), message="تم إنشاء سياسة SLA بنجاح")


@router.patch("/sla-policies/{policy_id}")
def update_sla_policy_v2(
    policy_id: uuid.UUID,
    payload: SlaPolicyUpdateV2,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.SLA_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    pol = db.query(SlaPolicy).filter(SlaPolicy.id == policy_id, SlaPolicy.company_id == active_cid).first()
    if not pol:
        raise HTTPException(status_code=404, detail="سياسة SLA غير موجودة")

    updates = payload.model_dump(exclude_unset=True)
    if updates.get("is_default") is True:
        db.query(SlaPolicy).filter(
            SlaPolicy.company_id == active_cid, SlaPolicy.id != pol.id
        ).update({"is_default": False})
    if "business_hours" in updates and updates["business_hours"] is not None:
        updates["business_hours"] = dict(updates["business_hours"])

    for k, v in updates.items():
        setattr(pol, k, v)
    db.commit()
    db.refresh(pol)

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="SlaPolicy",
        resource_id=str(pol.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=updates,
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_sla(pol), message="تم تحديث سياسة SLA بنجاح")


@router.delete("/sla-policies/{policy_id}")
def delete_sla_policy_v2(
    policy_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.SLA_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    pol = db.query(SlaPolicy).filter(SlaPolicy.id == policy_id, SlaPolicy.company_id == active_cid).first()
    if not pol:
        raise HTTPException(status_code=404, detail="سياسة SLA غير موجودة")
    pol.is_active = False
    db.commit()
    log_audit(
        db=db,
        action="DEACTIVATE",
        resource_type="SlaPolicy",
        resource_id=str(pol.id),
        user_id=current_user.id,
        company_id=active_cid,
        ip_address=_client_ip(request),
    )
    return success_response(message="تم تعطيل سياسة SLA بنجاح")


# ==============================================================================
# 4. WORKFLOW TRANSITIONS CRUD
# ==============================================================================

def _serialize_transition(tr: WorkflowTransition) -> Dict[str, Any]:
    return {
        "id": str(tr.id),
        "company_id": str(tr.company_id),
        "entity_type": tr.entity_type,
        "from_status": tr.from_status,
        "to_status": tr.to_status,
        "required_permission": tr.required_permission,
        "requires_comment": tr.requires_comment,
        "is_active": tr.is_active,
    }


@router.get("/workflows/transitions")
def list_workflow_transitions(
    entity_type: Optional[str] = Query(None, pattern="^(ticket|task)$"),
    include_inactive: bool = True,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ensure_workflow_transitions(db, active_cid, entity_type=entity_type)
    db.commit()
    q = db.query(WorkflowTransition).filter(WorkflowTransition.company_id == active_cid)
    if entity_type:
        q = q.filter(WorkflowTransition.entity_type == entity_type)
    if not include_inactive:
        q = q.filter(WorkflowTransition.is_active == True)
    rows = q.order_by(
        WorkflowTransition.entity_type.asc(),
        WorkflowTransition.from_status.asc(),
        WorkflowTransition.to_status.asc(),
    ).all()
    return success_response(data=[_serialize_transition(r) for r in rows])


@router.post("/workflows/transitions")
def create_workflow_transition(
    payload: WorkflowTransitionCreate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.WORKFLOW_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    dup = (
        db.query(WorkflowTransition)
        .filter(
            WorkflowTransition.company_id == active_cid,
            WorkflowTransition.entity_type == payload.entity_type,
            WorkflowTransition.from_status == payload.from_status.strip(),
            WorkflowTransition.to_status == payload.to_status.strip(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="هذا الانتقال موجود بالفعل في مصفوفة سير العمل")

    tr = WorkflowTransition(
        company_id=active_cid,
        entity_type=payload.entity_type,
        from_status=payload.from_status.strip(),
        to_status=payload.to_status.strip(),
        required_permission=payload.required_permission,
        requires_comment=payload.requires_comment,
        is_active=payload.is_active,
    )
    db.add(tr)
    db.commit()
    db.refresh(tr)
    log_audit(
        db=db,
        action="CREATE",
        resource_type="WorkflowTransition",
        resource_id=str(tr.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=_serialize_transition(tr),
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_transition(tr), message="تم إضافة انتقال سير العمل بنجاح")


@router.patch("/workflows/transitions/{transition_id}")
def update_workflow_transition(
    transition_id: uuid.UUID,
    payload: WorkflowTransitionUpdate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.WORKFLOW_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    tr = (
        db.query(WorkflowTransition)
        .filter(WorkflowTransition.id == transition_id, WorkflowTransition.company_id == active_cid)
        .first()
    )
    if not tr:
        raise HTTPException(status_code=404, detail="انتقال سير العمل غير موجود")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(tr, k, v)
    db.commit()
    db.refresh(tr)
    log_audit(
        db=db,
        action="UPDATE",
        resource_type="WorkflowTransition",
        resource_id=str(tr.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=updates,
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_transition(tr), message="تم تحديث انتقال سير العمل")


@router.delete("/workflows/transitions/{transition_id}")
def delete_workflow_transition(
    transition_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.WORKFLOW_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    tr = (
        db.query(WorkflowTransition)
        .filter(WorkflowTransition.id == transition_id, WorkflowTransition.company_id == active_cid)
        .first()
    )
    if not tr:
        raise HTTPException(status_code=404, detail="انتقال سير العمل غير موجود")
    db.delete(tr)
    db.commit()
    log_audit(
        db=db,
        action="DELETE",
        resource_type="WorkflowTransition",
        resource_id=str(transition_id),
        user_id=current_user.id,
        company_id=active_cid,
        ip_address=_client_ip(request),
    )
    return success_response(message="تم حذف انتقال سير العمل")


# ==============================================================================
# 5. TICKET CATEGORIES, MACROS & SAVED VIEWS
# ==============================================================================

def _serialize_category(cat: TicketCategory) -> Dict[str, Any]:
    return {
        "id": str(cat.id),
        "company_id": str(cat.company_id),
        "name": cat.name,
        "name_ar": cat.name_ar,
        "description": cat.description,
        "default_priority": cat.default_priority,
        "default_team_id": str(cat.default_team_id) if cat.default_team_id else None,
        "default_team_name": cat.default_team.name if cat.default_team else None,
        "required_skills": cat.required_skills or [],
        "is_active": cat.is_active,
    }


@router.get("/ticket-categories")
def list_ticket_categories(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    ensure_default_categories(db, active_cid)
    db.commit()
    q = db.query(TicketCategory).filter(TicketCategory.company_id == active_cid)
    if not include_inactive:
        q = q.filter(TicketCategory.is_active == True)
    rows = q.order_by(TicketCategory.name.asc()).all()
    return success_response(data=[_serialize_category(c) for c in rows])


@router.post("/ticket-categories")
def create_ticket_category(
    payload: TicketCategoryCreate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    if payload.default_team_id:
        team = db.query(Team).filter(Team.id == payload.default_team_id, Team.company_id == active_cid).first()
        if not team:
            raise HTTPException(status_code=400, detail="الفريق الافتراضي غير موجود في الشركة الحالية")

    dup = (
        db.query(TicketCategory)
        .filter(TicketCategory.company_id == active_cid, TicketCategory.name == payload.name.strip())
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="تصنيف بهذا الاسم موجود بالفعل")

    cat = TicketCategory(
        company_id=active_cid,
        name=payload.name.strip(),
        name_ar=payload.name_ar.strip() if payload.name_ar else None,
        description=payload.description,
        default_priority=payload.default_priority,
        default_team_id=payload.default_team_id,
        required_skills=[s.strip().lower() for s in payload.required_skills if s.strip()],
        is_active=payload.is_active,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_audit(
        db=db,
        action="CREATE",
        resource_type="TicketCategory",
        resource_id=str(cat.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=_serialize_category(cat),
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_category(cat), message="تم إنشاء التصنيف بنجاح")


@router.patch("/ticket-categories/{category_id}")
def update_ticket_category(
    category_id: uuid.UUID,
    payload: TicketCategoryUpdate,
    request: Request,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    cat = (
        db.query(TicketCategory)
        .filter(TicketCategory.id == category_id, TicketCategory.company_id == active_cid)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="التصنيف غير موجود")

    updates = payload.model_dump(exclude_unset=True)
    if "default_team_id" in updates and updates["default_team_id"]:
        team = db.query(Team).filter(Team.id == updates["default_team_id"], Team.company_id == active_cid).first()
        if not team:
            raise HTTPException(status_code=400, detail="الفريق الافتراضي غير موجود في الشركة الحالية")
    if "required_skills" in updates and updates["required_skills"] is not None:
        updates["required_skills"] = [s.strip().lower() for s in updates["required_skills"] if s.strip()]
    for k, v in updates.items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return success_response(data=_serialize_category(cat), message="تم تحديث التصنيف بنجاح")


@router.delete("/ticket-categories/{category_id}")
def delete_ticket_category(
    category_id: uuid.UUID,
    current_user: User = Depends(require_granular_permission(GranularPermission.TEAM_MANAGE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    cat = (
        db.query(TicketCategory)
        .filter(TicketCategory.id == category_id, TicketCategory.company_id == active_cid)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="التصنيف غير موجود")
    cat.is_active = False
    db.commit()
    return success_response(message="تم تعطيل التصنيف بنجاح")


def _serialize_macro(m: Macro) -> Dict[str, Any]:
    return {
        "id": str(m.id),
        "company_id": str(m.company_id),
        "title": m.title,
        "body": m.body,
        "visibility": m.visibility,
        "is_shared": m.is_shared,
        "created_by_id": str(m.created_by_id) if m.created_by_id else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/macros")
def list_macros(
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    roles = get_effective_roles_for_granular(current_user, active_cid, db)
    is_staff = any(r in ("Super Admin", "Company Admin", "IT Manager", "IT Technician") for r in roles)
    q = db.query(Macro).filter(
        Macro.company_id == active_cid,
        or_(Macro.is_shared == True, Macro.created_by_id == current_user.id),
    )
    if not is_staff:
        q = q.filter(Macro.visibility == "public")
    rows = q.order_by(Macro.title.asc()).all()
    return success_response(data=[_serialize_macro(m) for m in rows])


@router.post("/macros")
def create_macro(
    payload: MacroCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    can_manage = has_granular_permission(current_user, GranularPermission.MACRO_MANAGE, active_cid, db)
    can_ticket = has_granular_permission(current_user, GranularPermission.TICKET_TRANSITION, active_cid, db)
    if payload.is_shared and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إنشاء ردود جاهزة مشتركة على مستوى الشركة")
    if not can_manage and not can_ticket:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إنشاء ردود جاهزة")

    macro = Macro(
        company_id=active_cid,
        title=payload.title.strip(),
        body=payload.body.strip(),
        visibility=payload.visibility,
        is_shared=payload.is_shared,
        created_by_id=current_user.id,
    )
    db.add(macro)
    db.commit()
    db.refresh(macro)
    log_audit(
        db=db,
        action="CREATE",
        resource_type="Macro",
        resource_id=str(macro.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"title": macro.title, "visibility": macro.visibility, "is_shared": macro.is_shared},
        ip_address=_client_ip(request),
    )
    return success_response(data=_serialize_macro(macro), message="تم إنشاء الرد الجاهز بنجاح")


@router.patch("/macros/{macro_id}")
def update_macro(
    macro_id: uuid.UUID,
    payload: MacroUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    macro = db.query(Macro).filter(Macro.id == macro_id, Macro.company_id == active_cid).first()
    if not macro:
        raise HTTPException(status_code=404, detail="الرد الجاهز غير موجود")

    can_manage = has_granular_permission(current_user, GranularPermission.MACRO_MANAGE, active_cid, db)
    if macro.created_by_id != current_user.id and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذا الرد الجاهز")
    if payload.is_shared is True and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية مشاركة الرد على مستوى الشركة")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(macro, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(macro)
    return success_response(data=_serialize_macro(macro), message="تم تحديث الرد الجاهز بنجاح")


@router.delete("/macros/{macro_id}")
def delete_macro(
    macro_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    macro = db.query(Macro).filter(Macro.id == macro_id, Macro.company_id == active_cid).first()
    if not macro:
        raise HTTPException(status_code=404, detail="الرد الجاهز غير موجود")
    can_manage = has_granular_permission(current_user, GranularPermission.MACRO_MANAGE, active_cid, db)
    if macro.created_by_id != current_user.id and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذا الرد الجاهز")
    db.delete(macro)
    db.commit()
    return success_response(message="تم حذف الرد الجاهز بنجاح")


def _serialize_saved_view(v: SavedView) -> Dict[str, Any]:
    return {
        "id": str(v.id),
        "company_id": str(v.company_id),
        "user_id": str(v.user_id),
        "scope": v.scope,
        "name": v.name,
        "filters": v.filters or {},
        "sort": v.sort or {},
        "columns": v.columns or [],
        "is_shared": v.is_shared,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.get("/saved-views")
def list_saved_views(
    scope: Optional[str] = Query(None, pattern="^(tickets|tasks|my_work)$"),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    q = db.query(SavedView).filter(
        SavedView.company_id == active_cid,
        or_(SavedView.user_id == current_user.id, SavedView.is_shared == True),
    )
    if scope:
        q = q.filter(SavedView.scope == scope)
    rows = q.order_by(SavedView.is_shared.desc(), SavedView.name.asc()).all()
    return success_response(data=[_serialize_saved_view(v) for v in rows])


@router.post("/saved-views")
def create_saved_view(
    payload: SavedViewCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    if payload.is_shared and not has_granular_permission(current_user, GranularPermission.TEAM_MANAGE, active_cid, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية مشاركة العروض المحفوظة على مستوى الشركة")

    view = SavedView(
        company_id=active_cid,
        user_id=current_user.id,
        scope=payload.scope,
        name=payload.name.strip(),
        filters=payload.filters,
        sort=payload.sort,
        columns=payload.columns,
        is_shared=payload.is_shared,
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return success_response(data=_serialize_saved_view(view), message="تم حفظ العرض بنجاح")


@router.patch("/saved-views/{view_id}")
def update_saved_view(
    view_id: uuid.UUID,
    payload: SavedViewUpdate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    view = db.query(SavedView).filter(SavedView.id == view_id, SavedView.company_id == active_cid).first()
    if not view:
        raise HTTPException(status_code=404, detail="العرض المحفوظ غير موجود")
    can_manage = has_granular_permission(current_user, GranularPermission.TEAM_MANAGE, active_cid, db)
    if view.user_id != current_user.id and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعديل هذا العرض")
    if payload.is_shared is True and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية مشاركة العرض")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(view, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(view)
    return success_response(data=_serialize_saved_view(view), message="تم تحديث العرض المحفوظ")


@router.delete("/saved-views/{view_id}")
def delete_saved_view(
    view_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    view = db.query(SavedView).filter(SavedView.id == view_id, SavedView.company_id == active_cid).first()
    if not view:
        raise HTTPException(status_code=404, detail="العرض المحفوظ غير موجود")
    can_manage = has_granular_permission(current_user, GranularPermission.TEAM_MANAGE, active_cid, db)
    if view.user_id != current_user.id and not can_manage:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذا العرض")
    db.delete(view)
    db.commit()
    return success_response(message="تم حذف العرض المحفوظ")


# ==============================================================================
# 6. UNIFIED "MY WORK" FEED (/me/work)
# ==============================================================================

def _classify_due_bucket(due_dt: Optional[datetime], now: datetime) -> str:
    if due_dt is None:
        return "later"
    if due_dt < now:
        return "overdue"
    if due_dt.date() == now.date():
        return "today"
    if due_dt.date() <= (now.date() + timedelta(days=7)):
        return "this_week"
    return "later"


@router.get("/me/work")
def get_my_work(
    kind: Optional[str] = Query(None, pattern="^(all|ticket|task|approval)$"),
    priority: Optional[str] = None,
    sla_state: Optional[str] = Query(None, pattern="^(ok|at_risk|breached|paused)$"),
    bucket: Optional[str] = Query(None, pattern="^(overdue|today|this_week|later)$"),
    include_watching: bool = True,
    q: Optional[str] = Query(None, max_length=160),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Unified feed of tickets, tasks, and pending approvals assigned to or watched by current_user."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    roles = get_effective_roles_for_granular(current_user, active_cid, db)
    is_manager = any(r in ("Super Admin", "Company Admin", "IT Manager") for r in roles)
    q_lower = q.strip().lower() if q and q.strip() else None

    items: List[Dict[str, Any]] = []

    # 1. Tickets assigned to or watched by current_user
    if kind in (None, "all", "ticket"):
        watched_t_ids = [
            r[0]
            for r in db.query(TicketWatcher.ticket_id)
            .filter(TicketWatcher.company_id == active_cid, TicketWatcher.user_id == current_user.id)
            .all()
        ] if include_watching else []

        t_conds = [HelpDeskTicket.assigned_technician_id == current_user.id]
        if watched_t_ids:
            t_conds.append(HelpDeskTicket.id.in_(watched_t_ids))
        if current_user.employee_id and not any(
            r in ("Super Admin", "Company Admin", "IT Manager", "IT Technician") for r in roles
        ):
            t_conds.append(HelpDeskTicket.requester_id == current_user.employee_id)

        tickets = (
            db.query(HelpDeskTicket)
            .filter(
                HelpDeskTicket.company_id == active_cid,
                ~HelpDeskTicket.status.in_(CLOSED_TICKET_STATUSES),
                or_(*t_conds),
            )
            .all()
        )
        watched_set = set(watched_t_ids)
        for t in tickets:
            due_dt = t.resolution_due_at or t.sla_resolution_due_at or t.sla_target_at
            bkt = "overdue" if t.sla_state == "breached" else _classify_due_bucket(due_dt, now)
            rel = "assigned" if t.assigned_technician_id == current_user.id else (
                "watching" if t.id in watched_set else "requester"
            )
            items.append({
                "kind": "ticket",
                "id": str(t.id),
                "ref": t.ticket_number,
                "title": t.issue_title,
                "status": t.status,
                "priority": t.priority,
                "category": t.category,
                "sla_state": t.sla_state or "ok",
                "due_at": due_dt.isoformat() if due_dt else None,
                "bucket": bkt,
                "relationship": rel,
                "team_id": str(t.team_id) if t.team_id else None,
                "assignee_id": str(t.assigned_technician_id) if t.assigned_technician_id else None,
                "url": f"/tickets?ticket={t.id}",
                "created_at": t.created_at.isoformat() if t.created_at else None,
            })

    # 2. Tasks assigned to or watched by current_user
    if kind in (None, "all", "task"):
        watched_tk_ids = [
            r[0]
            for r in db.query(TaskWatcher.task_id)
            .filter(TaskWatcher.company_id == active_cid, TaskWatcher.user_id == current_user.id)
            .all()
        ] if include_watching else []

        tk_conds = [Task.assignee_id == current_user.id]
        if current_user.employee_id:
            tk_conds.append(Task.assigned_to_id == current_user.employee_id)
        if watched_tk_ids:
            tk_conds.append(Task.id.in_(watched_tk_ids))

        tasks = (
            db.query(Task)
            .filter(
                Task.company_id == active_cid,
                ~Task.status.in_(CLOSED_TASK_STATUSES),
                or_(*tk_conds),
            )
            .all()
        )
        watched_tk_set = set(watched_tk_ids)
        for tk in tasks:
            due_dt = tk.resolution_due_at or tk.deadline_at or (
                datetime.combine(tk.due_date, datetime.max.time().replace(microsecond=0)) if tk.due_date else None
            )
            bkt = _classify_due_bucket(due_dt, now)
            is_mine = (tk.assignee_id == current_user.id) or (
                current_user.employee_id is not None and tk.assigned_to_id == current_user.employee_id
            )
            items.append({
                "kind": "task",
                "id": str(tk.id),
                "ref": f"TSK-{str(tk.id)[:6].upper()}",
                "title": tk.title,
                "status": tk.status,
                "priority": tk.priority,
                "category": None,
                "sla_state": tk.sla_state or ("breached" if bkt == "overdue" else "ok"),
                "due_at": due_dt.isoformat() if due_dt else None,
                "bucket": bkt,
                "relationship": "assigned" if is_mine else ("watching" if tk.id in watched_tk_set else "other"),
                "team_id": str(tk.team_id) if tk.team_id else None,
                "assignee_id": str(tk.assignee_id) if tk.assignee_id else None,
                "related_ticket_id": str(tk.related_ticket_id) if tk.related_ticket_id else None,
                "url": f"/tasks?task={tk.id}",
                "created_at": tk.created_at.isoformat() if tk.created_at else None,
            })

    # 3. Pending Approvals (TicketApprovals + Maintenance change approvals)
    if kind in (None, "all", "approval"):
        appr_q = db.query(TicketApproval).filter(
            TicketApproval.company_id == active_cid,
            TicketApproval.status == "Pending",
        )
        if not is_manager:
            appr_q = appr_q.filter(TicketApproval.assigned_approver_id == current_user.id)
        for appr in appr_q.all():
            t = appr.ticket
            items.append({
                "kind": "approval",
                "id": str(appr.id),
                "ref": t.ticket_number if t else "APR",
                "title": f"اعتماد ({appr.approval_stage}): {t.issue_title if t else ''}",
                "status": "Pending Approval",
                "priority": t.priority if t else "Medium",
                "category": t.category if t else None,
                "sla_state": t.sla_state if t else "ok",
                "due_at": t.resolution_due_at.isoformat() if (t and t.resolution_due_at) else None,
                "bucket": "today",
                "relationship": "approver",
                "ticket_id": str(appr.ticket_id),
                "url": f"/tickets?ticket={appr.ticket_id}",
                "created_at": appr.created_at.isoformat() if appr.created_at else None,
            })

        if is_manager:
            pending_maint = (
                db.query(MaintenanceRecord)
                .filter(
                    MaintenanceRecord.company_id == active_cid,
                    MaintenanceRecord.approval_status == "Pending",
                )
                .all()
            )
            for m in pending_maint:
                items.append({
                    "kind": "approval",
                    "id": str(m.id),
                    "ref": f"CHG-{str(m.id)[:6].upper()}",
                    "title": f"اعتماد تغيير/صيانة: {m.title}",
                    "status": "Pending Approval",
                    "priority": "High",
                    "category": m.action_type,
                    "sla_state": "ok",
                    "due_at": None,
                    "bucket": "this_week",
                    "relationship": "approver",
                    "url": "/maintenance",
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                })

    # Apply filters
    if priority:
        p_low = priority.strip().lower()
        items = [i for i in items if (i["priority"] or "").lower() == p_low]
    if sla_state:
        items = [i for i in items if i["sla_state"] == sla_state]
    if q_lower:
        items = [
            i for i in items
            if q_lower in (i["title"] or "").lower() or q_lower in (i["ref"] or "").lower()
        ]

    # Counts BEFORE bucket filter (for tab badges)
    counts = {
        "total": len(items),
        "overdue": sum(1 for i in items if i["bucket"] == "overdue"),
        "today": sum(1 for i in items if i["bucket"] == "today"),
        "this_week": sum(1 for i in items if i["bucket"] == "this_week"),
        "later": sum(1 for i in items if i["bucket"] == "later"),
        "tickets": sum(1 for i in items if i["kind"] == "ticket"),
        "tasks": sum(1 for i in items if i["kind"] == "task"),
        "approvals": sum(1 for i in items if i["kind"] == "approval"),
        "sla_breached": sum(1 for i in items if i["sla_state"] == "breached"),
        "sla_at_risk": sum(1 for i in items if i["sla_state"] == "at_risk"),
    }

    if bucket:
        items = [i for i in items if i["bucket"] == bucket]

    bucket_rank = {"overdue": 0, "today": 1, "this_week": 2, "later": 3}
    items.sort(key=lambda i: (bucket_rank.get(i["bucket"], 9), i["due_at"] or "9999", i["created_at"] or ""))

    paged = items[offset : offset + limit]
    grouped = {
        "overdue": [i for i in paged if i["bucket"] == "overdue"],
        "today": [i for i in paged if i["bucket"] == "today"],
        "this_week": [i for i in paged if i["bucket"] == "this_week"],
        "later": [i for i in paged if i["bucket"] == "later"],
    }

    return success_response(
        data={
            "items": paged,
            "grouped": grouped,
            "counts": counts,
            "total": len(items),
            "limit": limit,
            "offset": offset,
            "permissions": get_user_granular_permissions(current_user, active_cid, db),
        }
    )


# ==============================================================================
# 7. TEAM & TECHNICIAN WORKLOAD (/workload)
# ==============================================================================

@router.get("/workload")
def get_workload_summary(
    team_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(require_granular_permission(GranularPermission.WORKLOAD_VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Per-technician and per-team workload, overdue counts, capacity utilization, and avg resolution time."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = date.today()
    thirty_days_ago = now - timedelta(days=30)

    teams_q = db.query(Team).filter(Team.company_id == active_cid, Team.is_active == True)
    if team_id:
        teams_q = teams_q.filter(Team.id == team_id)
    teams = teams_q.order_by(Team.name.asc()).all()

    open_tickets_all = (
        db.query(HelpDeskTicket)
        .filter(
            HelpDeskTicket.company_id == active_cid,
            ~HelpDeskTicket.status.in_(CLOSED_TICKET_STATUSES),
        )
        .all()
    )
    resolved_30d = (
        db.query(HelpDeskTicket)
        .filter(
            HelpDeskTicket.company_id == active_cid,
            HelpDeskTicket.resolved_at.isnot(None),
            HelpDeskTicket.resolved_at >= thirty_days_ago,
        )
        .all()
    )
    open_tasks_all = (
        db.query(Task)
        .filter(Task.company_id == active_cid, ~Task.status.in_(CLOSED_TASK_STATUSES))
        .all()
    )

    # Pre-index resolution durations by technician user_id
    res_hours_by_user: Dict[uuid.UUID, List[float]] = {}
    for t in resolved_30d:
        if t.assigned_technician_id and t.created_at and t.resolved_at:
            hrs = max(0.0, (t.resolved_at - t.created_at).total_seconds() / 3600.0)
            res_hours_by_user.setdefault(t.assigned_technician_id, []).append(hrs)

    # Collect technicians from TeamMembers (or all company staff if no team_id filter)
    member_q = db.query(TeamMember).filter(TeamMember.company_id == active_cid)
    if team_id:
        member_q = member_q.filter(TeamMember.team_id == team_id)
    members = member_q.all()

    # Aggregate unique technicians with their max capacity & team list
    tech_map: Dict[uuid.UUID, Dict[str, Any]] = {}
    for m in members:
        u = m.user
        if not u or u.is_deleted or u.account_status != "Active":
            continue
        entry = tech_map.get(u.id)
        if not entry:
            on_leave = False
            if u.employee_id:
                on_leave = (
                    db.query(LeaveRequest.id)
                    .filter(
                        LeaveRequest.company_id == active_cid,
                        LeaveRequest.employee_id == u.employee_id,
                        LeaveRequest.status == "Approved",
                        LeaveRequest.start_date <= today,
                        LeaveRequest.end_date >= today,
                    )
                    .first()
                    is not None
                )
            entry = {
                "user_id": str(u.id),
                "username": u.username,
                "full_name": u.employee.full_name if u.employee else u.username,
                "employee_id": str(u.employee_id) if u.employee_id else None,
                "team_ids": [],
                "skills": set(),
                "max_open_items": m.max_open_items,
                "is_available": m.is_available,
                "on_leave": on_leave,
                "open_tickets": 0,
                "open_tasks": 0,
                "overdue_count": 0,
                "sla_breached_count": 0,
            }
            tech_map[u.id] = entry
        entry["team_ids"].append(str(m.team_id))
        entry["skills"].update(m.skills or [])
        entry["max_open_items"] = max(entry["max_open_items"], m.max_open_items)
        entry["is_available"] = entry["is_available"] or bool(m.is_available)

    # Tally tickets & tasks per technician
    for t in open_tickets_all:
        if t.assigned_technician_id in tech_map:
            row = tech_map[t.assigned_technician_id]
            row["open_tickets"] += 1
            if t.sla_state == "breached":
                row["sla_breached_count"] += 1
                row["overdue_count"] += 1
            elif t.resolution_due_at and t.resolution_due_at < now:
                row["overdue_count"] += 1

    emp_to_uid = {
        uuid.UUID(v["employee_id"]): uid
        for uid, v in tech_map.items()
        if v["employee_id"]
    }
    for tk in open_tasks_all:
        uid = tk.assignee_id or (emp_to_uid.get(tk.assigned_to_id) if tk.assigned_to_id else None)
        if uid in tech_map:
            row = tech_map[uid]
            row["open_tasks"] += 1
            if (tk.due_date and tk.due_date < today) or (tk.deadline_at and tk.deadline_at < now):
                row["overdue_count"] += 1

    technicians_out = []
    for uid, row in tech_map.items():
        total_open = row["open_tickets"] + row["open_tasks"]
        cap = max(1, row["max_open_items"])
        hrs_list = res_hours_by_user.get(uid, [])
        avg_res = round(sum(hrs_list) / len(hrs_list), 2) if hrs_list else None
        technicians_out.append({
            "user_id": row["user_id"],
            "username": row["username"],
            "full_name": row["full_name"],
            "team_ids": row["team_ids"],
            "skills": sorted(row["skills"]),
            "open_tickets": row["open_tickets"],
            "open_tasks": row["open_tasks"],
            "total_open": total_open,
            "overdue_count": row["overdue_count"],
            "sla_breached_count": row["sla_breached_count"],
            "max_open_items": cap,
            "utilization_pct": round((total_open / cap) * 100.0, 1),
            "is_available": row["is_available"] and not row["on_leave"],
            "on_leave": row["on_leave"],
            "avg_resolution_hours_30d": avg_res,
        })
    technicians_out.sort(key=lambda x: (-x["utilization_pct"], -x["total_open"]))

    teams_out = []
    for tm in teams:
        tm_tickets = [t for t in open_tickets_all if t.team_id == tm.id]
        tm_tasks = [tk for tk in open_tasks_all if tk.team_id == tm.id]
        teams_out.append({
            "team_id": str(tm.id),
            "name": tm.name,
            "default_strategy": tm.default_strategy,
            "open_tickets": len(tm_tickets),
            "unassigned_tickets": sum(1 for t in tm_tickets if t.assigned_technician_id is None),
            "open_tasks": len(tm_tasks),
            "unassigned_tasks": sum(1 for tk in tm_tasks if tk.assignee_id is None and tk.assigned_to_id is None),
            "breached_tickets": sum(1 for t in tm_tickets if t.sla_state == "breached"),
        })

    return success_response(
        data={
            "teams": teams_out,
            "technicians": technicians_out,
            "unassigned_tickets_total": sum(1 for t in open_tickets_all if t.assigned_technician_id is None),
            "unassigned_tasks_total": sum(1 for tk in open_tasks_all if tk.assignee_id is None and tk.assigned_to_id is None),
        }
    )


# ==============================================================================
# 8. PROTECTED SLA ESCALATION TRIGGER
# ==============================================================================

@router.post("/system/run-sla-escalation")
def trigger_sla_escalation(
    request: Request,
    company_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Run idempotent SLA state check & escalation.

    Protected by EITHER:
    - `X-Service-Token` header matching `IGOS_SERVICE_TOKEN` env var (>= 16 chars), OR
    - Authenticated Super Admin / Company Admin / IT Manager session.
    """
    configured_token = (os.environ.get("IGOS_SERVICE_TOKEN") or "").strip()
    header_token = (request.headers.get("X-Service-Token") or "").strip()
    if configured_token and len(configured_token) >= 16 and header_token:
        if hmac.compare_digest(configured_token, header_token):
            result = run_sla_escalation(db, company_id=company_id)
            return success_response(data=result, message="SLA escalation job executed via service token")
        raise HTTPException(status_code=403, detail="Invalid service token")

    # Fallback: require authenticated manager session
    user = get_current_user(request=request, db=db)
    active_cid = get_user_company_id(request=request, user=user, db=db)
    if not has_granular_permission(user, GranularPermission.SLA_MANAGE, active_cid, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تشغيل مهمة تصعيد SLA")

    target_cid = company_id if (user.is_superadmin and company_id) else active_cid
    result = run_sla_escalation(db, company_id=target_cid)
    return success_response(data=result, message="تم تنفيذ فحص وتصعيد SLA بنجاح")
