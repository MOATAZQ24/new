import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, resolve_company_scope
from app.core.response import success_response
from app.models.company import Company
from app.models.user import Employee, User
from app.models.asset import TechnicalAsset
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.audit import AuditLog

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Analytics"])


@router.get("")
def get_dashboard_data(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    from app.api.v1.endpoints.workspace import authorize_company, workspace_permissions
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    today = date.today()

    # Query counts for target company
    total_companies = db.query(Company).count() if current_user.is_superadmin else 1
    total_employees = db.query(Employee).filter(Employee.company_id == target_cid).count()

    total_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid).count()
    assigned_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid, TechnicalAsset.status == "Assigned").count()
    available_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid, TechnicalAsset.status == "Available").count()
    maintenance_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid, TechnicalAsset.status == "Under Maintenance").count()

    infra_devices = db.query(ITInfrastructure).filter(ITInfrastructure.company_id == target_cid).count()

    # Subscriptions
    subs = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid).all()
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
    open_tasks = db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("active")).count()
    overdue_tasks = db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("overdue", today)).count()

    # Tickets
    open_tickets = db.query(HelpDeskTicket).filter(
        HelpDeskTicket.company_id == target_cid,
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()
    critical_tickets = db.query(HelpDeskTicket).filter(
        HelpDeskTicket.company_id == target_cid,
        HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"]),
        HelpDeskTicket.status.notin_(["Resolved", "Closed", "Cancelled"]),
    ).count()

    # Pending maintenance
    pending_maint = db.query(MaintenanceRecord).filter(
        MaintenanceRecord.company_id == target_cid,
        MaintenanceRecord.status.in_(["Open", "Pending Approval", "In Progress"]),
    ).count()

    # Distributions for charts
    asset_statuses = {
        "متاح (Available)": available_assets,
        "معيّن (Assigned)": assigned_assets,
        "تحت الصيانة (Maintenance)": maintenance_assets,
        "تالف (Damaged)": db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid, TechnicalAsset.status == "Damaged").count(),
        "متقاعد (Retired)": db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid, TechnicalAsset.status == "Retired").count(),
    }

    task_statuses = {
        "بانتظار القبول (New)": db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("new")).count(),
        "قيد التنفيذ (In Progress)": db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("in_progress")).count(),
        "بانتظار التوضيح (Waiting)": db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("waiting")).count(),
        "مكتمل (Completed)": db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("completed")).count(),
        "مرفوض (Rejected)": db.query(Task).filter(Task.company_id == target_cid, wf.stage_condition("rejected")).count(),
    }

    ticket_priorities = {
        "منخفض (Low)": db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.priority == "Low").count(),
        "متوسط (Medium)": db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.priority == "Medium").count(),
        "مرتفع (High)": db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.priority == "High").count(),
        "حرج (Urgent)": db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.priority.in_(["Urgent", "Critical", "Urgent / Critical"])).count(),
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

    data = {
        "total_companies": total_companies,
        "total_employees": total_employees,
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
        "open_tickets": open_tickets,
        "critical_tickets": critical_tickets,
        "pending_maintenance": pending_maint,
        "asset_status_distribution": asset_statuses,
        "task_status_distribution": task_statuses,
        "ticket_priority_distribution": ticket_priorities,
        "recent_activities": activities,
    }

    allowed = workspace_permissions(db, current_user, target_cid)
    recent = db.query(Task).filter(Task.company_id == target_cid)
    if "kpis" not in allowed and "maintenance" not in allowed:
        recent = recent.filter(Task.assigned_to_id == current_user.employee_id) if current_user.employee_id else recent.filter(False)
        tickets = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid, HelpDeskTicket.requester_id == current_user.employee_id) if current_user.employee_id else db.query(HelpDeskTicket).filter(False)
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
