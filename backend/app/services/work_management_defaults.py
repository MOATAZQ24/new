# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Idempotent default seeders for Work Management:
- Default WorkflowTransition graphs for tickets & tasks (preserving existing progressions)
- Default TicketCategory rows mapped from legacy category strings
- Default SLAPolicy schedules (Asia/Riyadh Sun-Thu 08:00-17:00)
- Demo Teams, TeamMembers (skills), AssignmentRules, and Macros (dev/demo only)
"""

import uuid
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.ticket import SlaPolicy
from app.models.work_management import (
    Team,
    TeamMember,
    AssignmentRule,
    TicketCategory,
    WorkflowTransition,
    Macro,
)

DEFAULT_BUSINESS_HOURS = {
    "timezone": "Asia/Riyadh",
    "working_days": ["sun", "mon", "tue", "wed", "thu"],
    "start": "08:00",
    "end": "17:00",
}

# (from_status, to_status, required_permission, requires_comment)
DEFAULT_TICKET_TRANSITIONS: List[Tuple[str, str, Optional[str], bool]] = [
    ("Open", "Assigned", "ticket:transition", False),
    ("Open", "In Progress", "ticket:transition", False),
    ("Open", "Pending Approval", "ticket:transition", False),
    ("Open", "Waiting for User", "ticket:transition", False),
    ("Open", "Waiting for Vendor", "ticket:transition", False),
    ("Open", "Resolved", "ticket:transition", False),
    ("Open", "Closed", "ticket:close", False),
    ("Open", "Cancelled", "ticket:close", True),
    ("Assigned", "In Progress", "ticket:transition", False),
    ("Assigned", "Pending Approval", "ticket:transition", False),
    ("Assigned", "Waiting for User", "ticket:transition", False),
    ("Assigned", "Waiting for Vendor", "ticket:transition", False),
    ("Assigned", "Resolved", "ticket:transition", False),
    ("Assigned", "Closed", "ticket:close", False),
    ("Assigned", "Cancelled", "ticket:close", True),
    ("Pending Approval", "Assigned", "ticket:transition", False),
    ("Pending Approval", "In Progress", "ticket:transition", False),
    ("Pending Approval", "Cancelled", "ticket:close", False),
    ("In Progress", "Assigned", "ticket:transition", False),
    ("In Progress", "Pending Approval", "ticket:transition", False),
    ("In Progress", "Waiting for User", "ticket:transition", False),
    ("In Progress", "Waiting for Vendor", "ticket:transition", False),
    ("In Progress", "Resolved", "ticket:transition", False),
    ("In Progress", "Closed", "ticket:close", False),
    ("In Progress", "Cancelled", "ticket:close", True),
    ("Waiting for User", "In Progress", "ticket:transition", False),
    ("Waiting for User", "Resolved", "ticket:transition", False),
    ("Waiting for User", "Closed", "ticket:close", False),
    ("Waiting for User", "Cancelled", "ticket:close", False),
    ("Waiting for Vendor", "In Progress", "ticket:transition", False),
    ("Waiting for Vendor", "Waiting for User", "ticket:transition", False),
    ("Waiting for Vendor", "Resolved", "ticket:transition", False),
    ("Waiting for Vendor", "Cancelled", "ticket:close", False),
    ("Resolved", "Closed", "ticket:close", False),
    ("Resolved", "In Progress", "ticket:transition", False),
    ("Resolved", "Open", "ticket:transition", False),
    ("Resolved", "Reopened", "ticket:transition", False),
    ("Reopened", "Assigned", "ticket:transition", False),
    ("Reopened", "In Progress", "ticket:transition", False),
    ("Reopened", "Resolved", "ticket:transition", False),
    ("Reopened", "Closed", "ticket:close", False),
    ("Closed", "Reopened", "ticket:transition", True),
    ("Closed", "Open", "ticket:transition", False),
]

DEFAULT_TASK_TRANSITIONS: List[Tuple[str, str, Optional[str], bool]] = [
    ("Draft", "Assigned", "task:transition", False),
    ("Draft", "To Do", "task:transition", False),
    ("Draft", "Cancelled", "task:transition", False),
    ("To Do", "Accepted", "task:transition", False),
    ("To Do", "In Progress", "task:transition", False),
    ("To Do", "Blocked", "task:transition", True),
    ("To Do", "On Hold", "task:transition", False),
    ("To Do", "Completed", "task:transition", False),
    ("To Do", "Cancelled", "task:transition", False),
    ("Pending", "Accepted", "task:transition", False),
    ("Pending", "In Progress", "task:transition", False),
    ("Pending", "Completed", "task:transition", False),
    ("Pending", "Cancelled", "task:transition", False),
    ("Assigned", "Accepted", "task:transition", False),
    ("Assigned", "In Progress", "task:transition", False),
    ("Assigned", "Blocked", "task:transition", True),
    ("Assigned", "On Hold", "task:transition", False),
    ("Assigned", "Waiting for Response", "task:transition", False),
    ("Assigned", "Rejected", "task:transition", True),
    ("Assigned", "Completed", "task:transition", False),
    ("Assigned", "Cancelled", "task:transition", False),
    ("Accepted", "In Progress", "task:transition", False),
    ("Accepted", "Blocked", "task:transition", True),
    ("Accepted", "On Hold", "task:transition", False),
    ("Accepted", "Waiting for Response", "task:transition", False),
    ("Accepted", "Submitted for Review", "task:transition", False),
    ("Accepted", "Completed", "task:transition", False),
    ("Accepted", "Cancelled", "task:transition", False),
    ("In Progress", "Blocked", "task:transition", True),
    ("In Progress", "On Hold", "task:transition", False),
    ("In Progress", "Waiting for Response", "task:transition", False),
    ("In Progress", "Submitted for Review", "task:transition", False),
    ("In Progress", "Completed", "task:transition", False),
    ("In Progress", "Cancelled", "task:transition", False),
    ("Blocked", "In Progress", "task:transition", False),
    ("Blocked", "Waiting for Response", "task:transition", False),
    ("Blocked", "Cancelled", "task:transition", False),
    ("On Hold", "In Progress", "task:transition", False),
    ("On Hold", "Cancelled", "task:transition", False),
    ("Waiting for Response", "In Progress", "task:transition", False),
    ("Waiting for Response", "Blocked", "task:transition", True),
    ("Waiting for Response", "Submitted for Review", "task:transition", False),
    ("Waiting for Response", "Completed", "task:transition", False),
    ("Waiting for Response", "Cancelled", "task:transition", False),
    ("Submitted for Review", "Completed", "task:transition", False),
    ("Submitted for Review", "Rework Required", "task:transition", True),
    ("Submitted for Review", "Cancelled", "task:transition", False),
    ("Rework Required", "In Progress", "task:transition", False),
    ("Rework Required", "Submitted for Review", "task:transition", False),
    ("Rework Required", "Blocked", "task:transition", True),
    ("Rework Required", "Cancelled", "task:transition", False),
    ("Rejected", "Assigned", "task:transition", False),
    ("Rejected", "Cancelled", "task:transition", False),
    ("Completed", "In Progress", "task:transition", False),
    ("Completed", "Assigned", "task:transition", False),
    ("Cancelled", "Assigned", "task:transition", False),
]

DEFAULT_CATEGORIES = [
    ("Hardware", "الأجهزة والعتاد", "High", ["hardware", "workstations"]),
    ("Software", "البرمجيات والتطبيقات", "Medium", ["software", "os"]),
    ("Network", "الشبكات والاتصال", "Urgent", ["network", "firewall"]),
    ("Internet", "الإنترنت والاتصال الخارجي", "High", ["network", "isp"]),
    ("Email", "البريد الإلكتروني", "High", ["email", "m365"]),
    ("Access / Account", "الصلاحيات والحسابات", "Medium", ["iam", "security"]),
    ("Server", "الخوادم والبنية التحتية", "Critical", ["servers", "infra"]),
    ("Other", "أخرى", "Low", ["general"]),
]


def ensure_workflow_transitions(db: Session, company_id: uuid.UUID, entity_type: Optional[str] = None) -> None:
    """Idempotently seed default WorkflowTransition rows for a company."""
    targets = []
    if entity_type in (None, "ticket"):
        targets.append(("ticket", DEFAULT_TICKET_TRANSITIONS))
    if entity_type in (None, "task"):
        targets.append(("task", DEFAULT_TASK_TRANSITIONS))

    for etype, edges in targets:
        existing_count = (
            db.query(WorkflowTransition)
            .filter(
                WorkflowTransition.company_id == company_id,
                WorkflowTransition.entity_type == etype,
            )
            .count()
        )
        if existing_count > 0:
            continue
        for frm, to, perm, req_comment in edges:
            db.add(
                WorkflowTransition(
                    company_id=company_id,
                    entity_type=etype,
                    from_status=frm,
                    to_status=to,
                    required_permission=perm,
                    requires_comment=req_comment,
                    is_active=True,
                )
            )
    db.flush()


def ensure_default_categories(db: Session, company_id: uuid.UUID) -> List[TicketCategory]:
    """Idempotently seed standard IT Help Desk categories for a company."""
    existing = (
        db.query(TicketCategory)
        .filter(TicketCategory.company_id == company_id)
        .all()
    )
    existing_names = {c.name.lower(): c for c in existing}
    created = []
    for name, name_ar, prio, skills in DEFAULT_CATEGORIES:
        if name.lower() not in existing_names:
            cat = TicketCategory(
                company_id=company_id,
                name=name,
                name_ar=name_ar,
                default_priority=prio,
                required_skills=skills,
                is_active=True,
            )
            db.add(cat)
            created.append(cat)
    if created:
        db.flush()
    return existing + created


def ensure_default_sla_policies(db: Session, company_id: uuid.UUID) -> List[SlaPolicy]:
    """Idempotently seed default SLA policies with Asia/Riyadh business hours."""
    existing = db.query(SlaPolicy).filter(SlaPolicy.company_id == company_id).all()
    if existing:
        updated = False
        for p in existing:
            if not p.business_hours:
                p.business_hours = dict(DEFAULT_BUSINESS_HOURS)
                updated = True
        if updated:
            db.flush()
        return existing

    defaults = [
        ("SLA - Critical", "Critical", 15, 240, 30, False, True, True),
        ("SLA - Urgent", "Urgent", 30, 480, 60, False, True, False),
        ("SLA - High", "High", 60, 1440, 120, False, True, False),
        ("SLA - Medium (Default)", "Medium", 240, 2880, 480, True, False, False),
        ("SLA - Low", "Low", 480, 5760, 960, False, False, False),
    ]
    created = []
    for name, prio, fr, res, esc, is_def, esc_breach, bump in defaults:
        pol = SlaPolicy(
            company_id=company_id,
            name=name,
            priority=prio,
            first_response_minutes=fr,
            resolution_minutes=res,
            escalation_notify_minutes=esc,
            business_hours_only=True,
            business_hours=dict(DEFAULT_BUSINESS_HOURS),
            is_default=is_def,
            escalate_on_breach=esc_breach,
            bump_priority_on_breach=bump,
            is_active=True,
        )
        db.add(pol)
        created.append(pol)
    db.flush()
    return created


def seed_company_work_management_demo(
    db: Session,
    company_id: uuid.UUID,
    lead_user_id: Optional[uuid.UUID],
    member_user_ids: List[uuid.UUID],
    branch_id: Optional[uuid.UUID] = None,
) -> None:
    """Seed demo teams, members with skills, rules, categories, SLA policies,
    workflow transitions, and macros for a company (idempotent, no credentials created).
    """
    ensure_workflow_transitions(db, company_id)
    policies = ensure_default_sla_policies(db, company_id)
    categories = ensure_default_categories(db, company_id)

    # Seed Demo Teams
    existing_teams = {
        t.name: t for t in db.query(Team).filter(Team.company_id == company_id).all()
    }
    team_specs = [
        ("فريق الدعم الفني (L1 Service Desk)", "الفرز الأولي ودعم أجهزة المستخدمين والبرمجيات", "round_robin"),
        ("فريق الشبكات والبنية التحتية (Infra & Net)", "إدارة الشبكات، الخوادم، وجدران الحماية", "skill_based"),
        ("فريق الصلاحيات والأمن السيبراني (IAM & Sec)", "إدارة الصلاحيات، البريد، وأمن المعلومات", "least_loaded"),
    ]
    teams: List[Team] = []
    for t_name, t_desc, t_strat in team_specs:
        if t_name in existing_teams:
            teams.append(existing_teams[t_name])
        else:
            tm = Team(
                company_id=company_id,
                branch_id=branch_id,
                name=t_name,
                description=t_desc,
                default_strategy=t_strat,
                is_active=True,
                lead_user_id=lead_user_id,
            )
            db.add(tm)
            db.flush()
            teams.append(tm)

    # Attach category default teams
    cat_team_map = {
        "Hardware": teams[0].id,
        "Software": teams[0].id,
        "Network": teams[1].id,
        "Internet": teams[1].id,
        "Server": teams[1].id,
        "Email": teams[2].id,
        "Access / Account": teams[2].id,
    }
    for cat in categories:
        if not cat.default_team_id and cat.name in cat_team_map:
            cat.default_team_id = cat_team_map[cat.name]

    # Seed Team Members with skills
    skill_sets = [
        ["hardware", "workstations", "software", "general"],
        ["network", "firewall", "servers", "infra", "isp"],
        ["iam", "security", "email", "m365", "os"],
    ]
    for idx, team in enumerate(teams):
        for m_idx, uid in enumerate(member_user_ids):
            exists = (
                db.query(TeamMember)
                .filter(TeamMember.team_id == team.id, TeamMember.user_id == uid)
                .first()
            )
            if not exists:
                db.add(
                    TeamMember(
                        company_id=company_id,
                        team_id=team.id,
                        user_id=uid,
                        skills=skill_sets[(idx + m_idx) % len(skill_sets)],
                        max_open_items=10,
                        is_available=True,
                        weight=1,
                    )
                )

    # Seed Assignment Rules
    if db.query(AssignmentRule).filter(AssignmentRule.company_id == company_id).count() == 0:
        demo_rules = [
            (
                "ticket",
                1,
                "توجيه بلاغات الشبكات والخوادم للفريق المتخصص",
                {"category": ["Network", "Internet", "Server"]},
                teams[1].id,
                "skill_based",
            ),
            (
                "ticket",
                2,
                "توجيه طلبات الصلاحيات والبريد لفريق الأمن",
                {"category": ["Access / Account", "Email"]},
                teams[2].id,
                "least_loaded",
            ),
            (
                "ticket",
                3,
                "التوزيع الدوري لبلاغات الأجهزة والبرمجيات",
                {"category": ["Hardware", "Software", "Other"]},
                teams[0].id,
                "round_robin",
            ),
            (
                "task",
                1,
                "توزيع المهام التشغيلية حسب أقل حمل عمل",
                {"priority": ["High", "Urgent", "Critical", "Medium", "Low"]},
                teams[0].id,
                "least_loaded",
            ),
        ]
        for etype, pos, name, cond, tid, strat in demo_rules:
            db.add(
                AssignmentRule(
                    company_id=company_id,
                    entity_type=etype,
                    position=pos,
                    name=name,
                    conditions=cond,
                    team_id=tid,
                    strategy=strat,
                    is_active=True,
                    stop_on_match=True,
                )
            )

    # Seed Canned Macros
    if db.query(Macro).filter(Macro.company_id == company_id).count() == 0:
        demo_macros = [
            (
                "تأكيد استلام البلاغ",
                "مرحباً، تم استلام بلاغكم بنجاح وجاري الفحص الفني. سنقوم بتحديثكم فور توفر المستجدات.",
                "public",
            ),
            (
                "طلب معلومات إضافية من الموظف",
                "نرجو تزويدنا بلقطة شاشة للرسالة الظاهرة ووقت حدوث المشكلة لنتمكن من تسريع المعالجة.",
                "public",
            ),
            (
                "تأكيد الحل والإغلاق",
                "تم تنفيذ الحل والتحقق من عودة الخدمة للعمل بشكل طبيعي. يرجى تأكيد الحل أو إبلاغنا في حال استمرار المشكلة.",
                "public",
            ),
            (
                "ملاحظة فنية: تصعيد للمستوى الثاني L2",
                "تم التحقق من الفحوصات الأولية L1؛ يلزم تصعيد التذكرة لفريق البنية التحتية للمراجعة المتقدمة.",
                "internal",
            ),
        ]
        for title, body, vis in demo_macros:
            db.add(
                Macro(
                    company_id=company_id,
                    title=title,
                    body=body,
                    visibility=vis,
                    created_by_id=lead_user_id,
                    is_shared=True,
                )
            )

    db.flush()
    _ = policies
