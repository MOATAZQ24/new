import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, resolve_company_scope
from app.core.response import success_response
from app.models.company import Company, Branch, Department
from app.models.user import Employee, User
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.integration import IntegrationConfig
from app.models.enterprise import Project, CRMCustomer, CRMOpportunity, WorkflowApproval, AttendanceRecord

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Analytics"])


@router.get("")
def get_dashboard_data(
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    from app.api.v1.endpoints.workspace import authorize_company, workspace_permissions
    from app.services import enterprise_service
    from sqlalchemy import or_
    from app.models.enterprise import EmployeeBranchAssignment

    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    enterprise_service.ensure_canonical_five_branches(db, target_cid)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, target_cid, branch_id, branch_ids)
    today = date.today()

    # Query counts for target company & selected branches (strictly deduplicated)
    total_companies = db.query(Company).count() if current_user.is_superadmin else 1
    emp_q = db.query(Employee).filter(Employee.company_id == target_cid)
    if selected_branches:
        sub_emp = (
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(
                EmployeeBranchAssignment.company_id == target_cid,
                EmployeeBranchAssignment.branch_id.in_(selected_branches),
                EmployeeBranchAssignment.status == "Active",
            )
            .subquery()
        )
        emp_q = emp_q.filter(or_(Employee.branch_id.in_(selected_branches), Employee.id.in_(sub_emp)))
    if department_id:
        emp_q = emp_q.filter(Employee.department_id == department_id)
    total_employees = emp_q.distinct().count()

    ast_q = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid)
    if selected_branches:
        ast_q = ast_q.filter(TechnicalAsset.branch_id.in_(selected_branches))
    if department_id:
        ast_q = ast_q.filter(TechnicalAsset.department_id == department_id)
    total_assets = ast_q.count()
    assigned_assets = ast_q.filter(TechnicalAsset.status == "Assigned").count()
    available_assets = ast_q.filter(TechnicalAsset.status == "Available").count()
    maintenance_assets = ast_q.filter(TechnicalAsset.status == "Under Maintenance").count()

    infra_q = db.query(ITInfrastructure).filter(ITInfrastructure.company_id == target_cid)
    if selected_branches:
        infra_q = infra_q.filter(ITInfrastructure.branch_id.in_(selected_branches))
    infra_devices = infra_q.count()

    # Subscriptions (filter branch-bound subscriptions when selected_branches is active)
    subs_q = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid)
    if selected_branches:
        subs_q = subs_q.filter(
            or_(
                ThirdPartySubscription.branch_id.in_(selected_branches),
                ThirdPartySubscription.branch_id.is_(None),
            )
        )
    subs = subs_q.all()
    active_subs = 0
    upcoming_renewals = 0
    monthly_cost = 0.0
    for s in subs:
        if s.status in ["Active", "Expiring Soon"]:
            active_subs += 1
            cost = float(s.price)
            cycle = (s.billing_cycle or "Annual").lower()
            if "month" in cycle:
                monthly_cost += cost
            elif "quarter" in cycle:
                monthly_cost += cost / 3
            elif "semi" in cycle:
                monthly_cost += cost / 6
            else:
                monthly_cost += cost / 12

            if s.renewal_date:
                days = (s.renewal_date - today).days
                if 0 <= days <= 30:
                    upcoming_renewals += 1

    # Tasks (using authoritative workflow stage definitions)
    from app.services import task_workflow as wf
    task_base = db.query(Task).filter(Task.company_id == target_cid)
    if selected_branches:
        task_base = task_base.filter(Task.branch_id.in_(selected_branches))
    open_tasks = task_base.filter(wf.stage_condition("active")).count()
    overdue_tasks = task_base.filter(wf.stage_condition("overdue", today)).count()

    # Tickets
    tix_base = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid)
    if selected_branches:
        tix_base = tix_base.filter(HelpDeskTicket.branch_id.in_(selected_branches))
    open_tickets = tix_base.filter(
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()
    critical_tickets = tix_base.filter(
        HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"]),
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()

    # Pending maintenance & enterprise metrics (branch-reconciled)
    maint_q = db.query(MaintenanceRecord).filter(
        MaintenanceRecord.company_id == target_cid,
        MaintenanceRecord.status.in_(["Open", "Pending Approval", "In Progress"]),
    )
    if selected_branches or department_id:
        filtered_asset_ids = ast_q.with_entities(TechnicalAsset.id)
        filtered_infra_ids = infra_q.with_entities(ITInfrastructure.id)
        maint_q = maint_q.filter(
            or_(
                (MaintenanceRecord.target_type == "asset") & MaintenanceRecord.target_id.in_(filtered_asset_ids),
                (MaintenanceRecord.target_type == "infrastructure") & MaintenanceRecord.target_id.in_(filtered_infra_ids),
            )
        )
    pending_maint = maint_q.count()

    branch_q = db.query(Branch).filter(Branch.company_id == target_cid, Branch.status == "Active")
    if selected_branches:
        branch_q = branch_q.filter(Branch.id.in_(selected_branches))
    total_branches = branch_q.count()

    dept_q = db.query(Department).filter(Department.company_id == target_cid)
    if selected_branches:
        dept_q = dept_q.filter(Department.branch_id.in_(selected_branches))
    total_departments = dept_q.count()

    proj_q = db.query(Project).filter(Project.company_id == target_cid, Project.status == "Active")
    if selected_branches:
        proj_q = proj_q.filter(Project.branch_id.in_(selected_branches))
    active_projects = proj_q.count()

    cust_q = db.query(CRMCustomer).filter(CRMCustomer.company_id == target_cid)
    if selected_branches:
        cust_q = cust_q.filter(CRMCustomer.branch_id.in_(selected_branches))
    total_customers = cust_q.count()

    opp_q = db.query(CRMOpportunity).filter(
        CRMOpportunity.company_id == target_cid,
        CRMOpportunity.stage.notin_(["Won", "Lost"]),
    )
    if selected_branches:
        opp_q = opp_q.filter(CRMOpportunity.customer_id.in_(cust_q.with_entities(CRMCustomer.id)))
    open_opportunities = opp_q.count()

    pending_approvals = db.query(WorkflowApproval).filter(
        WorkflowApproval.company_id == target_cid,
        WorkflowApproval.current_state == "Pending",
    ).count()

    att_q = db.query(AttendanceRecord).filter(
        AttendanceRecord.company_id == target_cid,
        AttendanceRecord.attendance_date == today,
        AttendanceRecord.status.in_(["Present", "Late", "Remote"]),
    )
    if selected_branches or department_id:
        att_q = att_q.filter(AttendanceRecord.employee_id.in_(emp_q.with_entities(Employee.id)))
    present_today = att_q.count()

    # Distributions for charts (computed from the exact same branch/department base queries)
    asset_statuses = {
        "متاح (Available)": available_assets,
        "معيّن (Assigned)": assigned_assets,
        "تحت الصيانة (Maintenance)": maintenance_assets,
        "تالف (Damaged)": ast_q.filter(TechnicalAsset.status == "Damaged").count(),
        "متقاعد (Retired)": ast_q.filter(TechnicalAsset.status == "Retired").count(),
    }

    task_statuses = {
        "بانتظار القبول (New)": task_base.filter(wf.stage_condition("new")).count(),
        "قيد التنفيذ (In Progress)": task_base.filter(wf.stage_condition("in_progress")).count(),
        "بانتظار التوضيح (Waiting)": task_base.filter(wf.stage_condition("waiting")).count(),
        "مكتمل (Completed)": task_base.filter(wf.stage_condition("completed")).count(),
        "مرفوض (Rejected)": task_base.filter(wf.stage_condition("rejected")).count(),
    }

    ticket_priorities = {
        "منخفض (Low)": tix_base.filter(HelpDeskTicket.priority == "Low").count(),
        "متوسط (Medium)": tix_base.filter(HelpDeskTicket.priority == "Medium").count(),
        "مرتفع (High)": tix_base.filter(HelpDeskTicket.priority == "High").count(),
        "حرج (Urgent)": tix_base.filter(HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"])).count(),
    }

    # Recent activities from audit logs
    recent_logs = (
        db.query(AuditLog)
        .filter(AuditLog.company_id == target_cid)
        .order_by(AuditLog.created_at.desc())
        .limit(8)
        .all()
    )
    activities = []
    for log in recent_logs:
        activities.append({
            "id": str(log.id),
            "action": log.action,
            "resource_type": log.resource_type,
            "user_name": log.user.username if log.user else "النظام",
            "created_at": log.created_at,
        })

    active_employees = emp_q.filter(Employee.employment_status == "Active").distinct().count()
    inactive_employees = max(0, total_employees - active_employees)
    total_tickets = tix_base.count()
    closed_tickets = tix_base.filter(HelpDeskTicket.status.in_(["Resolved", "Closed"])).count()
    waiting_tickets = tix_base.filter(HelpDeskTicket.status.in_(["Waiting", "Pending"])).count()
    in_progress_tickets = max(0, total_tickets - closed_tickets - waiting_tickets)

    recent_tickets = [
        {
            "id": str(tx.id),
            "ticket_number": tx.ticket_number,
            "issue_title": tx.issue_title,
            "priority": tx.priority,
            "status": tx.status,
            "created_at": tx.created_at,
        }
        for tx in tix_base.order_by(HelpDeskTicket.created_at.desc()).limit(4).all()
    ]
    recent_notifications = [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "is_read": bool(n.read_at),
            "created_at": n.created_at,
        }
        for n in db.query(Notification)
        .filter(Notification.recipient_user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(4)
        .all()
    ]
    tg_cfg = (
        db.query(IntegrationConfig)
        .filter(
            IntegrationConfig.company_id == target_cid,
            IntegrationConfig.service_name == "telegram",
            IntegrationConfig.is_enabled == True,  # noqa: E712
        )
        .first()
    )

    data = {
        "total_companies": total_companies,
        "total_branches": total_branches,
        "total_departments": total_departments,
        "total_employees": total_employees,
        "active_employees": active_employees,
        "inactive_employees": inactive_employees,
        "present_today": present_today,
        "active_projects": active_projects,
        "total_customers": total_customers,
        "open_opportunities": open_opportunities,
        "pending_approvals": pending_approvals,
        "total_assets": total_assets,
        "assigned_assets": assigned_assets,
        "available_assets": available_assets,
        "maintenance_assets": maintenance_assets,
        "infrastructure_devices": infra_devices,
        "active_subscriptions": active_subs,
        "upcoming_renewals": upcoming_renewals,
        "monthly_subscription_cost": round(monthly_cost, 2),
        "open_tasks": open_tasks,
        "overdue_tasks": overdue_tasks,
        "total_tickets": total_tickets,
        "open_tickets": open_tickets,
        "closed_tickets": closed_tickets,
        "waiting_tickets": waiting_tickets,
        "in_progress_tickets": in_progress_tickets,
        "critical_tickets": critical_tickets,
        "pending_maintenance": pending_maint,
        "telegram_connected": bool(tg_cfg),
        "asset_status_distribution": asset_statuses,
        "task_status_distribution": task_statuses,
        "ticket_priority_distribution": ticket_priorities,
        "recent_tickets": recent_tickets,
        "recent_notifications": recent_notifications,
        "recent_activities": activities,
    }

    allowed = workspace_permissions(db, current_user, target_cid)
    recent = task_base
    if "kpis" not in allowed and "maintenance" not in allowed:
        recent = recent.filter(Task.assigned_to_id == current_user.employee_id) if current_user.employee_id else recent.filter(False)
        tickets = tix_base.filter(HelpDeskTicket.requester_id == current_user.employee_id) if current_user.employee_id else db.query(HelpDeskTicket).filter(False)
        data["critical_tickets"] = tickets.filter(HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"]), HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"])).count()
    data["recent_tasks"] = [{"id": str(t.id), "title": t.title, "status": t.status, "due_date": t.due_date} for t in recent.order_by(Task.created_at.desc()).limit(6)]
    keys = {"critical_tickets", "recent_tasks"}
    if "kpis" in allowed:
        keys = set(data)
    if "maintenance" in allowed:
        keys.add("pending_maintenance")
    data = {key: value for key, value in data.items() if key in keys}
    data["available_widgets"] = allowed
    return success_response(data=data)
