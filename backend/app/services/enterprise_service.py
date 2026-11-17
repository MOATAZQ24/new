"""Canonical Employee Directory, 360° Employee Profile, HRM, CRM, Projects, Approval Workflows, and Analytics service.

Implements:
- One Authoritative Employee Identity across all modules
- Arabic/English search, normalization, RapidFuzz typo tolerance, duplicate-name disambiguation
-Immutable EmployeeAssignmentHistory recording on onboarding, transfers, promotions, and status changes
- 360° Employee Profile aggregation (Overview, Performance, Attendance, Tasks & Projects, Assets & Custody, Tickets, Documents & History)
- Separation of operational telemetry from formal confidential HR PerformanceEvaluations
- Real Attendance check-in/check-out & Leave Request workflows (never inferred from app login)
- Unified BPMN-inspired Approval state machine
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.rbac import Action, Module, get_user_effective_roles, has_module_permission
from app.models.asset import AssetCustody, TechnicalAsset
from app.models.audit import AuditLog
from app.models.company import Branch, Company, Department
from app.models.digital_asset import DigitalAsset
from app.models.infrastructure import ITInfrastructure
from app.models.enterprise import (
    CANONICAL_BRANCH_NAMES,
    CANONICAL_BRANCH_SPEC,
    AssetBranchTransfer,
    AttendanceRecord,
    CRMActivity,
    CRMCustomer,
    CRMOpportunity,
    EmployeeAssignmentHistory,
    EmployeeBranchAssignment,
    EmployeeDocument,
    EmployeeObjective,
    LeaveRequest,
    PerformanceEvaluation,
    PhysicalBranchLocation,
    Project,
    ProjectMilestone,
    PurchaseRequest,
    WorkflowApproval,
    WorkSchedule,
)
from app.models.maintenance import MaintenanceRecord
from app.models.subscription import ThirdPartySubscription
from app.models.task import Task
from app.models.telegram import TelegramUserLink
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, User
from app.services import arabic_nlp, task_workflow as wf
from app.services.audit_service import log_audit
from app.services.task_assignment import normalize_name


# ── Permission Helpers for Confidential HR Records ───────────────────────────

HR_PRIVILEGED_ROLES = {"Super Admin", "Company Admin", "IT Manager", "Auditor"}


def can_view_confidential_hr(user: User, company_id: uuid.UUID, db: Session) -> bool:
    """Return True if the user is authorized to view confidential HR evaluations/documents."""
    if user.is_superadmin:
        return True
    roles = set(get_user_effective_roles(user, company_id, db))
    return bool(roles & HR_PRIVILEGED_ROLES)


def can_view_employee_self_or_staff(user: User, employee: Employee, company_id: uuid.UUID, db: Session) -> bool:
    """Verify company isolation and allow self-service or authorized directory access."""
    if not user.is_superadmin and employee.company_id != company_id:
        return False
    if user.employee_id == employee.id:
        return True
    return has_module_permission(user, Module.EMPLOYEES, Action.VIEW, company_id, db)


# ── 0. Canonical Five-Branch Normalization & Reconciliation ─────────────────

def resolve_canonical_branch_name(raw_name: Optional[str]) -> str:
    """Map any Arabic/English alias or legacy branch name to one of the 5 canonical display names."""
    norm = normalize_name(raw_name or "")
    if not norm:
        return CANONICAL_BRANCH_NAMES[2]  # الرياض – العليا
    if any(k in norm for k in ("سلي", "مخرج 17", "exit 17", "sulai")):
        return CANONICAL_BRANCH_NAMES[0]  # الرياض – السلي (مخرج 17)
    if any(k in norm for k in ("فيصليه", "فيصلية", "مخرج 18", "exit 18", "faisaliah")):
        return CANONICAL_BRANCH_NAMES[1]  # الرياض – الفيصلية (مخرج 18)
    if any(k in norm for k in ("دمام", "خبر", "ظهران", "جبيل", "الشرقيه", "الشرقية", "dammam", "khobar", "dhahran", "jubail")):
        return CANONICAL_BRANCH_NAMES[3]  # الدمام
    if any(k in norm for k in ("جده", "جدة", "jeddah")):
        return CANONICAL_BRANCH_NAMES[4]  # جدة
    # Default Riyadh / Main / Olaya aliases -> الرياض – العليا
    return CANONICAL_BRANCH_NAMES[2]


def ensure_canonical_five_branches(db: Session, company_id: uuid.UUID) -> List[Branch]:
    """Ensure the 5 canonical physical locations exist and the company has exactly the 5 active operational branches.

    Safely reconciles legacy branch aliases (e.g. 'الفرع الرئيسي', 'الرياض الرئيسي', 'فرع العليا')
    onto the 5 canonical branches and re-points any orphaned foreign keys so zero historical data is lost.
    """
    # 1. Ensure shared PhysicalBranchLocation master rows exist
    existing_locs = {loc.canonical_code: loc for loc in db.query(PhysicalBranchLocation).all()}
    for code, display_name, city, addr in CANONICAL_BRANCH_SPEC:
        if code not in existing_locs:
            loc = PhysicalBranchLocation(
                canonical_code=code,
                display_name=display_name,
                city=city,
                address=addr,
                is_active=True,
            )
            db.add(loc)
            existing_locs[code] = loc
        else:
            existing_locs[code].display_name = display_name
            existing_locs[code].is_active = True
    db.flush()

    name_to_loc = {display_name: existing_locs[code] for code, display_name, _, _ in CANONICAL_BRANCH_SPEC}

    # 2. Inspect existing branches for this company
    company_branches = (
        db.query(Branch)
        .filter(Branch.company_id == company_id)
        .order_by(Branch.created_at.asc())
        .all()
    )

    canonical_map: Dict[str, Branch] = {}
    duplicates_or_legacy: List[Branch] = []

    # First pass: claim exact canonical matches
    for br in company_branches:
        if br.branch_name in CANONICAL_BRANCH_NAMES and br.branch_name not in canonical_map:
            br.status = "Active"
            br.physical_branch_id = name_to_loc[br.branch_name].id
            canonical_map[br.branch_name] = br
        else:
            duplicates_or_legacy.append(br)

    # Second pass: repurpose legacy branches into missing canonical slots or merge into target canonical branch
    for br in list(duplicates_or_legacy):
        mapped_name = resolve_canonical_branch_name(br.branch_name)
        if mapped_name not in canonical_map:
            spec_row = next((s for s in CANONICAL_BRANCH_SPEC if s[1] == mapped_name), None)
            br.branch_name = mapped_name
            br.physical_branch_id = name_to_loc[mapped_name].id
            if spec_row and not br.location:
                br.location = spec_row[3]
            br.status = "Active"
            canonical_map[mapped_name] = br
            duplicates_or_legacy.remove(br)

    # Third pass: create any remaining missing canonical branches for this company
    for code, display_name, city, addr in CANONICAL_BRANCH_SPEC:
        if display_name not in canonical_map:
            new_br = Branch(
                company_id=company_id,
                physical_branch_id=name_to_loc[display_name].id,
                branch_name=display_name,
                location=addr,
                contact_details=city,
                status="Active",
            )
            db.add(new_br)
            db.flush()
            canonical_map[display_name] = new_br

    # Fourth pass: safely re-point ALL references from any extra legacy/duplicate branch rows and archive them
    for extra_br in duplicates_or_legacy:
        target_name = resolve_canonical_branch_name(extra_br.branch_name)
        target_br = canonical_map[target_name]
        if extra_br.id != target_br.id:
            # Merge EmployeeBranchAssignment safely without violating (employee_id, company_id, branch_id) uniqueness
            extra_assigns = (
                db.query(EmployeeBranchAssignment)
                .filter(EmployeeBranchAssignment.branch_id == extra_br.id)
                .all()
            )
            for row in extra_assigns:
                existing_target = (
                    db.query(EmployeeBranchAssignment)
                    .filter(
                        EmployeeBranchAssignment.employee_id == row.employee_id,
                        EmployeeBranchAssignment.company_id == row.company_id,
                        EmployeeBranchAssignment.branch_id == target_br.id,
                    )
                    .first()
                )
                if existing_target:
                    if row.is_primary:
                        existing_target.is_primary = True
                    db.delete(row)
                else:
                    row.branch_id = target_br.id
            db.flush()

            for model in (
                Employee,
                Department,
                TechnicalAsset,
                Task,
                HelpDeskTicket,
                AttendanceRecord,
                Project,
                CRMCustomer,
                PurchaseRequest,
                DigitalAsset,
                ITInfrastructure,
                CompanyMembership,
            ):
                db.query(model).filter(model.branch_id == extra_br.id).update({"branch_id": target_br.id})
            extra_br.physical_branch_id = name_to_loc[target_name].id
            extra_br.status = "Archived"

    # Also ensure any assets or employees with NULL branch_id in this company default to 'الرياض – العليا'
    default_olaya = canonical_map[CANONICAL_BRANCH_NAMES[2]]
    db.query(Employee).filter(Employee.company_id == company_id, Employee.branch_id == None).update(  # noqa: E711
        {"branch_id": default_olaya.id}
    )
    db.query(TechnicalAsset).filter(TechnicalAsset.company_id == company_id, TechnicalAsset.branch_id == None).update(  # noqa: E711
        {"branch_id": default_olaya.id}
    )

    # Backfill person_id & primary EmployeeBranchAssignment rows idempotently
    emps = db.query(Employee).filter(Employee.company_id == company_id).all()
    existing_primary = {
        row[0]
        for row in db.query(EmployeeBranchAssignment.employee_id)
        .filter(EmployeeBranchAssignment.company_id == company_id, EmployeeBranchAssignment.status == "Active")
        .all()
    }
    for emp in emps:
        if not emp.person_id:
            emp.person_id = uuid.uuid4()
        if emp.branch_id and emp.id not in existing_primary:
            db.add(
                EmployeeBranchAssignment(
                    employee_id=emp.id,
                    company_id=company_id,
                    branch_id=emp.branch_id,
                    department_id=emp.department_id,
                    job_title=emp.job_title,
                    is_primary=True,
                    status="Active",
                )
            )

    db.commit()
    return [canonical_map[name] for name in CANONICAL_BRANCH_NAMES]


def parse_branch_ids_filter(
    db: Session,
    company_id: uuid.UUID,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids_csv: Optional[str] = None,
) -> List[uuid.UUID]:
    """Parse single branch_id or comma-separated branch_ids into validated company branch UUIDs."""
    selected: List[uuid.UUID] = []
    if branch_id:
        selected.append(branch_id)
    if branch_ids_csv:
        for part in branch_ids_csv.split(","):
            p = part.strip()
            if not p:
                continue
            try:
                u = uuid.UUID(p)
                if u not in selected:
                    selected.append(u)
            except ValueError:
                # Allow matching by canonical branch name or alias
                target_name = resolve_canonical_branch_name(p)
                br = (
                    db.query(Branch)
                    .filter(Branch.company_id == company_id, Branch.branch_name == target_name, Branch.status == "Active")
                    .first()
                )
                if br and br.id not in selected:
                    selected.append(br.id)
    return selected


def serialize_canonical_employee(
    db: Session,
    emp: Employee,
    telegram_map: Optional[Dict[uuid.UUID, TelegramUserLink]] = None,
    assignments_map: Optional[Dict[uuid.UUID, List[EmployeeBranchAssignment]]] = None,
) -> Dict[str, Any]:
    """Serialize canonical employee identity with distinguishing details and multi-branch assignments."""
    tlink = (
        telegram_map.get(emp.id)
        if telegram_map is not None
        else db.query(TelegramUserLink)
        .filter(TelegramUserLink.company_id == emp.company_id, TelegramUserLink.employee_id == emp.id)
        .first()
    )
    is_t_linked = bool(tlink and tlink.is_verified)
    t_user = tlink.telegram_username if is_t_linked and tlink else None
    t_notifs = bool(tlink.notifications_enabled) if is_t_linked and tlink else False

    b_name = emp.branch.branch_name if emp.branch else None
    d_name = emp.department.department_name if emp.department else None
    c_name = emp.company.company_name_ar if emp.company else None
    mgr_name = emp.manager.full_name if emp.manager else None
    has_account = bool(emp.user and emp.user.account_status == "Active" and not emp.user.is_deleted)
    username = emp.user.username if has_account and emp.user else None

    emp_assigns = (
        assignments_map.get(emp.id, [])
        if assignments_map is not None
        else db.query(EmployeeBranchAssignment)
        .options(joinedload(EmployeeBranchAssignment.branch), joinedload(EmployeeBranchAssignment.company))
        .filter(EmployeeBranchAssignment.employee_id == emp.id, EmployeeBranchAssignment.status == "Active")
        .all()
    )
    assigned_branches_list: List[Dict[str, Any]] = []
    seen_branch_ids = set()
    if emp.branch_id and emp.branch:
        seen_branch_ids.add(emp.branch_id)
        assigned_branches_list.append(
            {
                "branch_id": str(emp.branch_id),
                "branch_name": emp.branch.branch_name,
                "company_id": str(emp.company_id),
                "company_name": c_name,
                "is_primary": True,
            }
        )
    for asg in emp_assigns:
        if asg.branch_id not in seen_branch_ids and asg.branch:
            seen_branch_ids.add(asg.branch_id)
            assigned_branches_list.append(
                {
                    "branch_id": str(asg.branch_id),
                    "branch_name": asg.branch.branch_name,
                    "company_id": str(asg.company_id),
                    "company_name": asg.company.company_name_ar if asg.company else c_name,
                    "is_primary": asg.is_primary,
                }
            )

    all_branch_names = [b["branch_name"] for b in assigned_branches_list if b.get("branch_name")]

    details = [f"#{emp.employee_number}"]
    if emp.job_title:
        details.append(emp.job_title)
    if d_name:
        details.append(d_name)
    if all_branch_names:
        details.append(" + ".join(all_branch_names))
    elif b_name:
        details.append(b_name)
    if username:
        details.append(f"@{username}")

    return {
        "id": str(emp.id),
        "employee_id": str(emp.id),
        "person_id": str(emp.person_id or emp.id),
        "company_id": str(emp.company_id),
        "branch_id": str(emp.branch_id) if emp.branch_id else None,
        "branch_ids": [b["branch_id"] for b in assigned_branches_list],
        "branch_names": all_branch_names,
        "branch_assignments": assigned_branches_list,
        "is_multi_branch": len(assigned_branches_list) > 1,
        "department_id": str(emp.department_id) if emp.department_id else None,
        "manager_id": str(emp.manager_id) if emp.manager_id else None,
        "employee_number": emp.employee_number,
        "full_name": emp.full_name,
        "job_title": emp.job_title,
        "email": emp.email,
        "phone": emp.phone,
        "employment_status": emp.employment_status,
        "employment_type": getattr(emp, "employment_type", "Full-Time") or "Full-Time",
        "hire_date": emp.hire_date.isoformat() if getattr(emp, "hire_date", None) else None,
        "work_location": getattr(emp, "work_location", None),
        "avatar_url": getattr(emp, "avatar_url", None),
        "branch_name": b_name or (all_branch_names[0] if all_branch_names else None),
        "department_name": d_name,
        "company_name": c_name,
        "manager_name": mgr_name,
        "has_user_account": has_account,
        "username": username,
        "is_telegram_linked": is_t_linked,
        "telegram_linked": is_t_linked,
        "telegram_username": t_user,
        "telegram_notifications_enabled": t_notifs,
        "distinguishing_label": f"{emp.full_name} ({' • '.join(details)})",
        "created_at": emp.created_at,
    }


def search_canonical_directory(
    db: Session,
    company_id: uuid.UUID,
    search: Optional[str] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[List[uuid.UUID]] = None,
    department_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = None,
    multi_branch_only: bool = False,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Unified employee directory search supporting multi-branch assignments, Arabic normalization, and RapidFuzz."""
    from sqlalchemy import or_

    effective_branches = list(branch_ids or [])
    if branch_id and branch_id not in effective_branches:
        effective_branches.append(branch_id)

    query = (
        db.query(Employee)
        .options(
            joinedload(Employee.branch),
            joinedload(Employee.department),
            joinedload(Employee.company),
            joinedload(Employee.manager),
            joinedload(Employee.user),
        )
        .filter(Employee.company_id == company_id)
    )
    if effective_branches:
        sub_emp_ids = (
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(
                EmployeeBranchAssignment.company_id == company_id,
                EmployeeBranchAssignment.branch_id.in_(effective_branches),
                EmployeeBranchAssignment.status == "Active",
            )
            .subquery()
        )
        query = query.filter(
            or_(
                Employee.branch_id.in_(effective_branches),
                Employee.id.in_(sub_emp_ids),
            )
        )
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if status_filter:
        query = query.filter(Employee.employment_status == status_filter)

    all_rows = query.order_by(Employee.created_at.desc()).all()
    tlinks = {
        t.employee_id: t
        for t in db.query(TelegramUserLink).filter(TelegramUserLink.company_id == company_id).all()
    }
    assign_rows = (
        db.query(EmployeeBranchAssignment)
        .options(joinedload(EmployeeBranchAssignment.branch), joinedload(EmployeeBranchAssignment.company))
        .filter(EmployeeBranchAssignment.company_id == company_id, EmployeeBranchAssignment.status == "Active")
        .all()
    )
    assign_map: Dict[uuid.UUID, List[EmployeeBranchAssignment]] = {}
    for ar in assign_rows:
        assign_map.setdefault(ar.employee_id, []).append(ar)

    serialized = [serialize_canonical_employee(db, e, tlinks, assign_map) for e in all_rows]
    if multi_branch_only:
        serialized = [item for item in serialized if item.get("is_multi_branch")]

    raw_q = (search or "").strip()
    if not raw_q:
        return serialized[:limit]

    norm_q = normalize_name(raw_q)
    q_tokens = norm_q.split()

    # 1. Exact/substring normalized token match across full_name, employee_number, email, job_title, department
    direct_matches: List[Dict[str, Any]] = []
    for item in serialized:
        haystack = normalize_name(
            f"{item['full_name']} {item['employee_number']} {item.get('email') or ''} "
            f"{item.get('job_title') or ''} {item.get('department_name') or ''} {item.get('branch_name') or ''}"
        )
        if all(tok in haystack for tok in q_tokens):
            direct_matches.append(item)

    if direct_matches:
        return direct_matches[:limit]

    # 2. RapidFuzz typo-tolerant fallback across authorized company employees
    fuzzy_matches = arabic_nlp.fuzzy_rank_employee_candidates(raw_q, serialized, threshold=75.0)
    return fuzzy_matches[:limit]


def record_employee_assignment_history(
    db: Session,
    employee: Employee,
    change_type: str = "Onboarding",
    changed_by_id: Optional[uuid.UUID] = None,
    notes: Optional[str] = None,
) -> EmployeeAssignmentHistory:
    """Close any open assignment record and append a new immutable history entry."""
    today = arabic_nlp.riyadh_today()
    open_records = (
        db.query(EmployeeAssignmentHistory)
        .filter(
            EmployeeAssignmentHistory.employee_id == employee.id,
            EmployeeAssignmentHistory.effective_to == None,  # noqa: E711
        )
        .all()
    )
    for rec in open_records:
        rec.effective_to = today

    entry = EmployeeAssignmentHistory(
        employee_id=employee.id,
        company_id=employee.company_id,
        branch_id=employee.branch_id,
        department_id=employee.department_id,
        manager_id=getattr(employee, "manager_id", None),
        job_title=employee.job_title,
        employment_status=employee.employment_status,
        change_type=change_type,
        effective_from=today,
        changed_by_id=changed_by_id,
        notes=notes,
    )
    db.add(entry)
    return entry


# ── 2. Complete 360° Employee Profile Workspace ──────────────────────────────

def get_employee_360_profile(
    db: Session,
    current_user: User,
    company_id: uuid.UUID,
    employee_id: uuid.UUID,
) -> Dict[str, Any]:
    """Assemble the complete 360° Employee Profile from canonical shared services."""
    emp = (
        db.query(Employee)
        .options(
            joinedload(Employee.branch),
            joinedload(Employee.department),
            joinedload(Employee.company),
            joinedload(Employee.manager),
            joinedload(Employee.user),
        )
        .filter(Employee.id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if not can_view_employee_self_or_staff(current_user, emp, company_id, db):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول إلى ملف هذا الموظف")

    target_cid = emp.company_id
    today = arabic_nlp.riyadh_today()
    is_hr_privileged = can_view_confidential_hr(current_user, target_cid, db)

    # A. Overview
    overview = serialize_canonical_employee(db, emp)
    direct_reports = (
        db.query(Employee)
        .filter(Employee.company_id == target_cid, Employee.manager_id == emp.id, Employee.employment_status == "Active")
        .all()
    )
    overview["direct_reports"] = [
        {"id": str(r.id), "full_name": r.full_name, "job_title": r.job_title, "employee_number": r.employee_number}
        for r in direct_reports
    ]

    # B. Tasks & Projects + Operational Performance Metrics
    all_tasks = (
        db.query(Task)
        .filter(Task.company_id == target_cid, Task.assigned_to_id == emp.id)
        .order_by(Task.created_at.desc())
        .all()
    )
    total_tasks = len(all_tasks)
    completed_tasks = [t for t in all_tasks if t.status == "Completed"]
    cancelled_tasks = [t for t in all_tasks if t.status == "Cancelled"]
    active_tasks = [t for t in all_tasks if t.status not in ("Completed", "Cancelled", "Rejected")]
    overdue_tasks = [
        t for t in active_tasks if t.due_date and t.due_date < today
    ]
    on_time_completed = [
        t for t in completed_tasks
        if not t.due_date or not t.completed_at or t.completed_at.date() <= t.due_date
    ]
    valid_denominator = max(0, total_tasks - len(cancelled_tasks))
    completion_rate = round((len(completed_tasks) / valid_denominator) * 100, 1) if valid_denominator > 0 else 0.0
    deadline_adherence = (
        round((len(on_time_completed) / len(completed_tasks)) * 100, 1)
        if completed_tasks
        else (100.0 if valid_denominator == 0 else 0.0)
    )

    # Projects where employee is manager or has assigned tasks
    project_ids = {t.project_id for t in all_tasks if getattr(t, "project_id", None)}
    managed_projects = db.query(Project).filter(Project.company_id == target_cid, Project.manager_id == emp.id).all()
    for mp in managed_projects:
        project_ids.add(mp.id)
    projects_list = (
        db.query(Project).filter(Project.company_id == target_cid, Project.id.in_(project_ids)).all()
        if project_ids
        else []
    )

    # C. Attendance & Departure (Last 30 days + Monthly Calendar)
    month_start = today.replace(day=1)
    attendance_rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.company_id == target_cid,
            AttendanceRecord.employee_id == emp.id,
            AttendanceRecord.attendance_date >= today - timedelta(days=30),
        )
        .order_by(AttendanceRecord.attendance_date.desc())
        .all()
    )
    present_days = sum(1 for a in attendance_rows if a.status in ("Present", "Late", "Early Departure", "Remote"))
    late_days = sum(1 for a in attendance_rows if a.status == "Late" or a.late_minutes > 0)
    absent_days = sum(1 for a in attendance_rows if a.status == "Absent")
    leave_days = sum(1 for a in attendance_rows if a.status == "On Leave")
    total_worked_hours = round(sum(a.worked_minutes for a in attendance_rows) / 60.0, 1)

    leave_requests = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.company_id == target_cid, LeaveRequest.employee_id == emp.id)
        .order_by(LeaveRequest.created_at.desc())
        .limit(20)
        .all()
    )

    # D. Assets & Custody (Active + Historical)
    custody_rows = (
        db.query(AssetCustody)
        .options(joinedload(AssetCustody.asset))
        .filter(AssetCustody.company_id == target_cid, AssetCustody.employee_id == emp.id)
        .order_by(AssetCustody.assignment_date.desc())
        .all()
    )
    active_custody_items = []
    custody_history_items = []
    for c in custody_rows:
        a = c.asset
        entry = {
            "custody_id": str(c.id),
            "asset_id": str(a.id) if a else None,
            "asset_code": a.asset_code if a else "—",
            "asset_name": a.asset_name if a else "أصل غير متاح",
            "asset_type": a.asset_type if a else "—",
            "brand": a.brand if a else None,
            "model": a.model if a else None,
            "serial_number": a.serial_number if (a and (is_hr_privileged or current_user.employee_id == emp.id)) else None,
            "assignment_date": c.assignment_date.isoformat() if c.assignment_date else None,
            "expected_return_date": c.expected_return_date.isoformat() if c.expected_return_date else None,
            "actual_return_date": c.actual_return_date.isoformat() if c.actual_return_date else None,
            "condition_on_assignment": c.condition_on_assignment,
            "condition_on_return": c.condition_on_return,
            "status": c.status,
        }
        custody_history_items.append(entry)
        if c.status == "Active":
            active_custody_items.append(entry)

    # E. Tickets & Technical Activities
    requested_tickets = (
        db.query(HelpDeskTicket)
        .filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.requester_id == emp.id)
        .order_by(HelpDeskTicket.created_at.desc())
        .limit(25)
        .all()
    )
    tech_tickets: List[HelpDeskTicket] = []
    if emp.user:
        tech_tickets = (
            db.query(HelpDeskTicket)
            .filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.assigned_technician_id == emp.user.id)
            .order_by(HelpDeskTicket.created_at.desc())
            .limit(25)
            .all()
        )
    resolved_tech_tickets = [t for t in tech_tickets if t.status in ("Resolved", "Closed")]

    # F. Objectives & Formal Performance Evaluations (Protected by HR RBAC)
    objectives = (
        db.query(EmployeeObjective)
        .filter(EmployeeObjective.company_id == target_cid, EmployeeObjective.employee_id == emp.id)
        .order_by(EmployeeObjective.created_at.desc())
        .all()
    )
    formal_evaluations = []
    if is_hr_privileged:
        eval_rows = (
            db.query(PerformanceEvaluation)
            .filter(PerformanceEvaluation.company_id == target_cid, PerformanceEvaluation.employee_id == emp.id)
            .order_by(PerformanceEvaluation.created_at.desc())
            .all()
        )
        formal_evaluations = [
            {
                "id": str(ev.id),
                "period_label": ev.period_label,
                "quality_score": float(ev.quality_score),
                "reliability_score": float(ev.reliability_score),
                "collaboration_score": float(ev.collaboration_score),
                "overall_score": float(ev.overall_score),
                "rating_band": ev.rating_band,
                "strengths": ev.strengths,
                "improvement_plan": ev.improvement_plan,
                "status": ev.status,
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in eval_rows
        ]

    # G. Documents & Immutable Assignment History
    doc_query = db.query(EmployeeDocument).filter(
        EmployeeDocument.company_id == target_cid,
        EmployeeDocument.employee_id == emp.id,
    )
    if not is_hr_privileged:
        doc_query = doc_query.filter(EmployeeDocument.is_confidential == False)  # noqa: E712
    documents = [
        {
            "id": str(d.id),
            "title": d.title,
            "document_type": d.document_type,
            "reference_number": d.reference_number,
            "issue_date": d.issue_date.isoformat() if d.issue_date else None,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "is_confidential": d.is_confidential,
        }
        for d in doc_query.order_by(EmployeeDocument.created_at.desc()).all()
    ]

    history_rows = (
        db.query(EmployeeAssignmentHistory)
        .filter(EmployeeAssignmentHistory.employee_id == emp.id)
        .order_by(EmployeeAssignmentHistory.created_at.desc())
        .all()
    )
    assignment_history = [
        {
            "id": str(h.id),
            "change_type": h.change_type,
            "job_title": h.job_title,
            "department_name": h.department.department_name if h.department else None,
            "branch_name": h.branch.branch_name if h.branch else None,
            "employment_status": h.employment_status,
            "effective_from": h.effective_from.isoformat() if h.effective_from else None,
            "effective_to": h.effective_to.isoformat() if h.effective_to else None,
            "notes": h.notes,
        }
        for h in history_rows
    ]

    return {
        "overview": overview,
        "permissions": {
            "can_view_confidential_hr": is_hr_privileged,
            "can_edit_employee": has_module_permission(current_user, Module.EMPLOYEES, Action.EDIT, target_cid, db),
            "can_record_attendance": current_user.employee_id == emp.id or has_module_permission(current_user, Module.HRM, Action.CREATE, target_cid, db),
        },
        "performance": {
            "methodology_note": "تُفصل مؤشرات الإنجاز التشغيلي (المهام والتذاكر) عن التقييم الوظيفي الرسمي المعتمد من الموارد البشرية.",
            "operational_metrics": {
                "total_assigned_tasks": total_tasks,
                "completed_tasks": len(completed_tasks),
                "active_tasks": len(active_tasks),
                "overdue_tasks": len(overdue_tasks),
                "valid_denominator": valid_denominator,
                "completion_rate_percent": completion_rate,
                "deadline_adherence_percent": deadline_adherence,
                "tickets_assigned_as_tech": len(tech_tickets),
                "tickets_resolved_as_tech": len(resolved_tech_tickets),
                "projects_contributed": len(projects_list),
            },
            "objectives": [
                {
                    "id": str(obj.id),
                    "title": obj.title,
                    "period_label": obj.period_label,
                    "target_value": float(obj.target_value),
                    "current_value": float(obj.current_value),
                    "progress_percent": round((float(obj.current_value) / max(1.0, float(obj.target_value))) * 100, 1),
                    "weight": obj.weight,
                    "status": obj.status,
                    "due_date": obj.due_date.isoformat() if obj.due_date else None,
                }
                for obj in objectives
            ],
            "formal_evaluations": formal_evaluations,
        },
        "attendance": {
            "policy_note": "تُسجل أحداث الحضور والانصراف الفعلية فقط ولا يُستنتج الحضور من تسجيل الدخول للنظام.",
            "month_start": month_start.isoformat(),
            "summary_30d": {
                "recorded_days": len(attendance_rows),
                "present_days": present_days,
                "late_days": late_days,
                "absent_days": absent_days,
                "on_leave_days": leave_days,
                "total_worked_hours": total_worked_hours,
            },
            "records": [
                {
                    "id": str(a.id),
                    "attendance_date": a.attendance_date.isoformat(),
                    "check_in_at": a.check_in_at.strftime("%H:%M") if a.check_in_at else None,
                    "check_out_at": a.check_out_at.strftime("%H:%M") if a.check_out_at else None,
                    "status": a.status,
                    "late_minutes": a.late_minutes,
                    "early_leave_minutes": a.early_leave_minutes,
                    "worked_minutes": a.worked_minutes,
                    "source": a.source,
                    "notes": a.notes,
                }
                for a in attendance_rows
            ],
            "leave_requests": [
                {
                    "id": str(lr.id),
                    "leave_type": lr.leave_type,
                    "start_date": lr.start_date.isoformat(),
                    "end_date": lr.end_date.isoformat(),
                    "days_count": lr.days_count,
                    "status": lr.status,
                    "reason": lr.reason,
                }
                for lr in leave_requests
            ],
        },
        "tasks_and_projects": {
            "tasks": [
                {
                    "id": str(t.id),
                    "reference": f"TASK-{str(t.id).replace('-', '')[:8].upper()}",
                    "title": t.title,
                    "priority": t.priority,
                    "status": t.status,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "is_overdue": bool(t.due_date and t.due_date < today and t.status not in ("Completed", "Cancelled", "Rejected")),
                    "project_id": str(t.project_id) if getattr(t, "project_id", None) else None,
                }
                for t in all_tasks[:40]
            ],
            "projects": [
                {
                    "id": str(p.id),
                    "project_code": p.project_code,
                    "name": p.name,
                    "status": p.status,
                    "priority": p.priority,
                    "progress_percent": p.progress_percent,
                    "target_end_date": p.target_end_date.isoformat() if p.target_end_date else None,
                    "is_manager": p.manager_id == emp.id,
                }
                for p in projects_list
            ],
        },
        "assets_and_custody": {
            "active_custody": active_custody_items,
            "custody_history": custody_history_items,
        },
        "tickets_and_activities": {
            "requested_tickets": [
                {
                    "id": str(tk.id),
                    "ticket_number": tk.ticket_number,
                    "issue_title": tk.issue_title,
                    "priority": tk.priority,
                    "status": tk.status,
                    "category": tk.category,
                    "created_at": tk.created_at.isoformat() if tk.created_at else None,
                }
                for tk in requested_tickets
            ],
            "assigned_tech_tickets": [
                {
                    "id": str(tk.id),
                    "ticket_number": tk.ticket_number,
                    "issue_title": tk.issue_title,
                    "priority": tk.priority,
                    "status": tk.status,
                    "category": tk.category,
                    "resolved_at": tk.resolved_at.isoformat() if tk.resolved_at else None,
                }
                for tk in tech_tickets
            ],
        },
        "documents_and_history": {
            "documents": documents,
            "assignment_history": assignment_history,
        },
    }


# ── 3. Attendance Check-In / Check-Out & Leave Workflows ─────────────────────

def record_attendance_event(
    db: Session,
    current_user: User,
    company_id: uuid.UUID,
    employee_id: uuid.UUID,
    event_type: str,  # "check_in" | "check_out" | "absent" | "remote"
    attendance_date: Optional[date] = None,
    notes: Optional[str] = None,
) -> AttendanceRecord:
    """Record a verified check-in/check-out or HR status event for an authorized employee."""
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.company_id == company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود في الشركة الحالية")

    is_self = current_user.employee_id == emp.id
    is_hr = has_module_permission(current_user, Module.HRM, Action.EDIT, company_id, db)
    if not (is_self or is_hr or current_user.is_superadmin):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية تسجيل حضور لموظف آخر")

    target_date = attendance_date or arabic_nlp.riyadh_today()
    now_dt = datetime.now(arabic_nlp.RIYADH_TZ).replace(tzinfo=None)

    schedule = (
        db.query(WorkSchedule)
        .filter(WorkSchedule.company_id == company_id, WorkSchedule.is_default == True)  # noqa: E712
        .first()
    )
    shift_start_str = schedule.shift_start if schedule else "08:30"
    grace = schedule.grace_minutes if schedule else 15

    record = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.company_id == company_id,
            AttendanceRecord.employee_id == emp.id,
            AttendanceRecord.attendance_date == target_date,
        )
        .first()
    )
    if not record:
        record = AttendanceRecord(
            company_id=company_id,
            branch_id=emp.branch_id,
            employee_id=emp.id,
            attendance_date=target_date,
            recorded_by_id=current_user.id,
            source="SelfCheckIn" if is_self else "HRManual",
        )
        db.add(record)

    if event_type == "check_in":
        record.check_in_at = now_dt
        try:
            sh_h, sh_m = [int(x) for x in shift_start_str.split(":")]
            scheduled_dt = now_dt.replace(hour=sh_h, minute=sh_m, second=0, microsecond=0)
            diff_min = int((now_dt - scheduled_dt).total_seconds() // 60)
            if diff_min > grace:
                record.late_minutes = diff_min
                record.status = "Late"
            else:
                record.late_minutes = 0
                record.status = "Present"
        except Exception:
            record.status = "Present"
    elif event_type == "check_out":
        if not record.check_in_at:
            record.check_in_at = now_dt - timedelta(hours=8)
        record.check_out_at = now_dt
        worked = max(0, int((record.check_out_at - record.check_in_at).total_seconds() // 60))
        record.worked_minutes = worked
        if record.status not in ("Late", "Remote"):
            record.status = "Present"
    elif event_type == "remote":
        record.check_in_at = record.check_in_at or now_dt
        record.status = "Remote"
        record.worked_minutes = record.worked_minutes or 480
    elif event_type == "absent":
        if not is_hr and not current_user.is_superadmin:
            raise HTTPException(status_code=403, detail="تسجيل الغياب يتطلب صلاحية الموارد البشرية")
        record.status = "Absent"
        record.worked_minutes = 0

    if notes:
        record.notes = notes

    db.commit()
    db.refresh(record)

    log_audit(
        db=db,
        action=f"ATTENDANCE_{event_type.upper()}",
        resource_type="AttendanceRecord",
        resource_id=str(record.id),
        user_id=current_user.id,
        company_id=company_id,
        new_values={"employee_id": str(emp.id), "date": target_date.isoformat(), "status": record.status},
    )
    return record


# ── 4. Unified BPMN Workflow State Transitions ───────────────────────────────

ALLOWED_APPROVAL_TRANSITIONS = {
    "Pending": {"Approved", "Rejected", "Cancelled"},
    "Approved": {"Executed"},
    "Rejected": set(),
    "Executed": set(),
    "Cancelled": set(),
}


def decide_workflow_approval(
    db: Session,
    current_user: User,
    company_id: uuid.UUID,
    approval_id: uuid.UUID,
    decision: str,  # "Approved" | "Rejected" | "Cancelled"
    notes: Optional[str] = None,
) -> WorkflowApproval:
    """Enforce BPMN approval state machine and cascade decision to underlying domain record."""
    if not has_module_permission(current_user, Module.APPROVALS, Action.APPROVE, company_id, db):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية اعتماد أو رفض الطلبات في هذه الشركة")

    wf_rec = (
        db.query(WorkflowApproval)
        .filter(WorkflowApproval.id == approval_id, WorkflowApproval.company_id == company_id)
        .first()
    )
    if not wf_rec:
        raise HTTPException(status_code=404, detail="طلب الاعتماد غير موجود")

    allowed = ALLOWED_APPROVAL_TRANSITIONS.get(wf_rec.current_state, set())
    if decision not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"انتقال حالة غير صالح من ({wf_rec.current_state}) إلى ({decision})",
        )

    now_dt = datetime.utcnow()
    wf_rec.current_state = decision
    wf_rec.assigned_approver_id = current_user.id
    wf_rec.decision_notes = notes
    wf_rec.decided_at = now_dt

    # Cascade state change to linked domain entity
    try:
        target_uuid = uuid.UUID(wf_rec.target_resource_id)
    except ValueError:
        target_uuid = None

    if target_uuid:
        if wf_rec.workflow_type == "LeaveRequest":
            lr = db.query(LeaveRequest).filter(LeaveRequest.id == target_uuid, LeaveRequest.company_id == company_id).first()
            if lr:
                lr.status = decision
                lr.approved_by_id = current_user.id
                lr.reviewed_at = now_dt
                lr.review_notes = notes
                if decision == "Approved":
                    cur = lr.start_date
                    while cur <= lr.end_date:
                        existing_att = (
                            db.query(AttendanceRecord)
                            .filter(
                                AttendanceRecord.company_id == company_id,
                                AttendanceRecord.employee_id == lr.employee_id,
                                AttendanceRecord.attendance_date == cur,
                            )
                            .first()
                        )
                        if not existing_att:
                            db.add(
                                AttendanceRecord(
                                    company_id=company_id,
                                    employee_id=lr.employee_id,
                                    attendance_date=cur,
                                    status="On Leave",
                                    source="LeaveApproved",
                                    recorded_by_id=current_user.id,
                                    notes=f"إجازة معتمدة ({lr.leave_type})",
                                )
                            )
                        cur += timedelta(days=1)
        elif wf_rec.workflow_type == "PurchaseRequest":
            pr = db.query(PurchaseRequest).filter(PurchaseRequest.id == target_uuid, PurchaseRequest.company_id == company_id).first()
            if pr:
                pr.status = decision
                pr.approved_by_id = current_user.id
                pr.reviewed_at = now_dt
                pr.review_notes = notes
        elif wf_rec.workflow_type == "MaintenanceChange":
            mr = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == target_uuid, MaintenanceRecord.company_id == company_id).first()
            if mr:
                mr.approval_status = decision
                if decision == "Approved" and mr.status == "Pending Approval":
                    mr.status = "In Progress"
        elif wf_rec.workflow_type == "ProjectApproval":
            proj = db.query(Project).filter(Project.id == target_uuid, Project.company_id == company_id).first()
            if proj:
                proj.status = "Active" if decision == "Approved" else "Cancelled"
        elif wf_rec.workflow_type == "AssetTransfer":
            tr = db.query(AssetBranchTransfer).filter(AssetBranchTransfer.id == target_uuid, AssetBranchTransfer.company_id == company_id).first()
            if tr:
                tr.status = "Completed" if decision == "Approved" else decision
                tr.approved_by_id = current_user.id
                if decision == "Approved":
                    tr.transferred_at = now_dt
                    ast = db.query(TechnicalAsset).filter(TechnicalAsset.id == tr.asset_id, TechnicalAsset.company_id == company_id).first()
                    if ast:
                        ast.branch_id = tr.to_branch_id

    db.commit()
    db.refresh(wf_rec)

    log_audit(
        db=db,
        action=f"WORKFLOW_{decision.upper()}",
        resource_type=wf_rec.workflow_type,
        resource_id=str(wf_rec.id),
        user_id=current_user.id,
        company_id=company_id,
        new_values={"decision": decision, "target_id": wf_rec.target_resource_id, "notes": notes},
    )
    return wf_rec


# ── 5. Branch-Aware Asset Analytics & Physical Branch Transfer Workflows ─────

def transfer_asset_to_branch(
    db: Session,
    current_user: User,
    company_id: uuid.UUID,
    asset_id: uuid.UUID,
    to_branch_id: uuid.UUID,
    reason: Optional[str] = None,
    require_approval: bool = False,
) -> Dict[str, Any]:
    """Execute or request an asset branch transfer: Current Branch -> Request -> Approval -> Physical Transfer -> New Branch."""
    asset = db.query(TechnicalAsset).filter(TechnicalAsset.id == asset_id, TechnicalAsset.company_id == company_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل غير موجود في المنشأة الحالية")

    target_branch = db.query(Branch).filter(Branch.id == to_branch_id, Branch.company_id == company_id).first()
    if not target_branch:
        raise HTTPException(status_code=400, detail="الفرع المستهدف غير صالح أو لا يتبع للشركة الحالية")

    from_branch_id = asset.branch_id
    from_branch_name = asset.branch.branch_name if asset.branch else "غير محدد"
    now_dt = datetime.utcnow()

    transfer_status = "Pending Approval" if require_approval else "Completed"
    tr = AssetBranchTransfer(
        company_id=company_id,
        asset_id=asset.id,
        from_branch_id=from_branch_id,
        to_branch_id=target_branch.id,
        custodian_employee_id=asset.assigned_employee_id,
        requested_by_id=current_user.id,
        approved_by_id=None if require_approval else current_user.id,
        status=transfer_status,
        reason=reason or f"نقل الأصل من ({from_branch_name}) إلى ({target_branch.branch_name})",
        transferred_at=None if require_approval else now_dt,
    )
    db.add(tr)
    db.flush()

    approval_id = None
    if require_approval:
        wf_item = WorkflowApproval(
            company_id=company_id,
            workflow_type="AssetTransfer",
            target_resource_type="AssetBranchTransfer",
            target_resource_id=str(tr.id),
            title=f"نقل الأصل {asset.asset_code} ({asset.asset_name}) إلى فرع {target_branch.branch_name}",
            initiator_employee_id=current_user.employee_id,
            requested_by_user_id=current_user.id,
            current_state="Pending",
            priority="Medium",
        )
        db.add(wf_item)
        db.flush()
        approval_id = str(wf_item.id)
    else:
        asset.branch_id = target_branch.id

    db.commit()
    db.refresh(tr)

    log_audit(
        db=db,
        action="ASSET_BRANCH_TRANSFER",
        resource_type="TechnicalAsset",
        resource_id=str(asset.id),
        user_id=current_user.id,
        company_id=company_id,
        old_values={"branch_id": str(from_branch_id) if from_branch_id else None, "branch_name": from_branch_name},
        new_values={
            "to_branch_id": str(target_branch.id),
            "to_branch_name": target_branch.branch_name,
            "transfer_status": transfer_status,
        },
    )
    return {
        "transfer_id": str(tr.id),
        "asset_id": str(asset.id),
        "asset_code": asset.asset_code,
        "from_branch_name": from_branch_name,
        "to_branch_id": str(target_branch.id),
        "to_branch_name": target_branch.branch_name,
        "status": transfer_status,
        "approval_id": approval_id,
    }


def get_branch_aware_asset_analytics(
    db: Session,
    company_id: uuid.UUID,
    branch_ids: Optional[List[uuid.UUID]] = None,
    department_id: Optional[uuid.UUID] = None,
    asset_category: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute strictly deduplicated branch-aware asset analytics.

    Rule: Each asset is counted ONCE by its own `TechnicalAsset.id` and `TechnicalAsset.branch_id`
    (never duplicated when its custodian works across multiple branches).
    """
    ensure_canonical_five_branches(db, company_id)
    today = arabic_nlp.riyadh_today()

    canonical_branches = (
        db.query(Branch)
        .filter(Branch.company_id == company_id, Branch.status == "Active", Branch.branch_name.in_(CANONICAL_BRANCH_NAMES))
        .all()
    )
    branch_lookup = {b.id: b.branch_name for b in canonical_branches}

    q = (
        db.query(TechnicalAsset)
        .options(
            joinedload(TechnicalAsset.branch),
            joinedload(TechnicalAsset.department),
            joinedload(TechnicalAsset.assigned_employee),
        )
        .filter(TechnicalAsset.company_id == company_id)
    )
    if branch_ids:
        q = q.filter(TechnicalAsset.branch_id.in_(branch_ids))
    if department_id:
        q = q.filter(TechnicalAsset.department_id == department_id)
    if asset_category:
        q = q.filter(TechnicalAsset.asset_category == asset_category)

    # Deduplicate by TechnicalAsset.id
    assets_by_id: Dict[uuid.UUID, TechnicalAsset] = {}
    for a in q.all():
        assets_by_id[a.id] = a
    assets = list(assets_by_id.values())

    total_assets = len(assets)
    it_assets = sum(1 for a in assets if (getattr(a, "asset_category", "IT") or "IT") == "IT")
    general_assets = total_assets - it_assets
    assigned_assets = sum(1 for a in assets if a.status == "Assigned")
    available_assets = sum(1 for a in assets if a.status == "Available")
    maintenance_assets = sum(1 for a in assets if a.status == "Under Maintenance")
    retired_assets = sum(1 for a in assets if a.status in ("Retired", "Damaged", "Lost"))
    warranty_expiring_30d = sum(
        1 for a in assets if a.warranty_expiry and 0 <= (a.warranty_expiry - today).days <= 30
    )

    # Active custody awaiting return (expected_return_date <= today + 7)
    asset_uuid_set = set(assets_by_id.keys())
    awaiting_return = 0
    if asset_uuid_set:
        awaiting_return = (
            db.query(AssetCustody)
            .filter(
                AssetCustody.company_id == company_id,
                AssetCustody.status == "Active",
                AssetCustody.asset_id.in_(asset_uuid_set),
                AssetCustody.expected_return_date != None,  # noqa: E711
                AssetCustody.expected_return_date <= today + timedelta(days=7),
            )
            .count()
        )

    # Aggregations by the 5 canonical branches (always in canonical order)
    by_branch: Dict[str, int] = {name: 0 for name in CANONICAL_BRANCH_NAMES if not branch_ids or any(branch_lookup.get(bid) == name for bid in branch_ids)}
    branch_comparison_matrix: List[Dict[str, Any]] = []
    branch_assets_bucket: Dict[str, List[TechnicalAsset]] = {name: [] for name in CANONICAL_BRANCH_NAMES}

    for a in assets:
        b_label = a.branch.branch_name if a.branch else CANONICAL_BRANCH_NAMES[2]
        by_branch[b_label] = by_branch.get(b_label, 0) + 1
        branch_assets_bucket.setdefault(b_label, []).append(a)

    for b in canonical_branches:
        if branch_ids and b.id not in branch_ids:
            continue
        b_list = branch_assets_bucket.get(b.branch_name, [])
        # Find branch asset custodian / IT manager if any
        custodians = sorted({x.assigned_employee.full_name for x in b_list if x.assigned_employee})
        branch_comparison_matrix.append(
            {
                "branch_id": str(b.id),
                "branch_name": b.branch_name,
                "total_assets": len(b_list),
                "it_assets": sum(1 for x in b_list if (getattr(x, "asset_category", "IT") or "IT") == "IT"),
                "general_assets": sum(1 for x in b_list if getattr(x, "asset_category", "IT") == "General"),
                "assigned": sum(1 for x in b_list if x.status == "Assigned"),
                "available": sum(1 for x in b_list if x.status == "Available"),
                "under_maintenance": sum(1 for x in b_list if x.status == "Under Maintenance"),
                "retired_or_damaged": sum(1 for x in b_list if x.status in ("Retired", "Damaged")),
                "custodians": custodians[:5],
            }
        )

    by_type: Dict[str, int] = {}
    by_condition: Dict[str, int] = {}
    by_department: Dict[str, int] = {}
    for a in assets:
        by_type[a.asset_type] = by_type.get(a.asset_type, 0) + 1
        by_condition[a.condition] = by_condition.get(a.condition, 0) + 1
        d_label = a.department.department_name if a.department else "غير محدد"
        by_department[d_label] = by_department.get(d_label, 0) + 1

    transfer_q = (
        db.query(AssetBranchTransfer)
        .options(
            joinedload(AssetBranchTransfer.asset),
            joinedload(AssetBranchTransfer.from_branch),
            joinedload(AssetBranchTransfer.to_branch),
            joinedload(AssetBranchTransfer.custodian),
        )
        .filter(AssetBranchTransfer.company_id == company_id)
        .order_by(AssetBranchTransfer.created_at.desc())
        .limit(25)
        .all()
    )

    return {
        "kpis": {
            "total_assets": total_assets,
            "it_assets": it_assets,
            "general_assets": general_assets,
            "assigned_assets": assigned_assets,
            "available_assets": available_assets,
            "maintenance_assets": maintenance_assets,
            "retired_assets": retired_assets,
            "warranty_expiring_30d": warranty_expiring_30d,
            "awaiting_return": awaiting_return,
        },
        "distributions": {
            "by_branch": by_branch,
            "by_type": by_type,
            "by_condition": by_condition,
            "by_department": by_department,
        },
        "branch_comparison": branch_comparison_matrix,
        "recent_transfers": [
            {
                "id": str(tr.id),
                "asset_id": str(tr.asset_id),
                "asset_code": tr.asset.asset_code if tr.asset else "—",
                "asset_name": tr.asset.asset_name if tr.asset else "—",
                "from_branch_name": tr.from_branch.branch_name if tr.from_branch else "—",
                "to_branch_name": tr.to_branch.branch_name if tr.to_branch else "—",
                "custodian_name": tr.custodian.full_name if tr.custodian else None,
                "status": tr.status,
                "reason": tr.reason,
                "transferred_at": tr.transferred_at.isoformat() if tr.transferred_at else tr.created_at.isoformat(),
            }
            for tr in transfer_q
        ],
    }

