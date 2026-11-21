# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Enterprise HRM, CRM, Projects, Approvals, and Visual Intelligence Analytics API endpoints for Investor Gate OS 3.0."""

import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.rbac import Action, Module, has_module_permission, require_permission
from app.core.response import paginate, success_response
from app.core.security import get_current_user, get_user_company_id, resolve_company_scope, validate_company_fk
from app.models.asset import AssetCustody, TechnicalAsset
from app.models.company import Branch, Company, Department
from app.models.enterprise import (
    AttendanceRecord,
    CRMActivity,
    CRMCustomer,
    CRMOpportunity,
    EmployeeAssignmentHistory,
    EmployeeDocument,
    EmployeeObjective,
    LeaveRequest,
    PerformanceEvaluation,
    Project,
    ProjectMilestone,
    PurchaseRequest,
    WorkflowApproval,
    WorkSchedule,
)
from app.models.maintenance import MaintenanceRecord
from app.models.subscription import ThirdPartySubscription
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.user import Employee, User
from app.services import arabic_nlp, enterprise_service, task_workflow as wf
from app.services.audit_service import log_audit


# ── Pydantic Request Schemas ─────────────────────────────────────────────────

class AttendanceEventCreate(BaseModel):
    employee_id: uuid.UUID
    event_type: str = Field(default="check_in", pattern="^(check_in|check_out|remote|absent)$")
    attendance_date: Optional[date] = None
    notes: Optional[str] = None


class LeaveRequestCreate(BaseModel):
    employee_id: uuid.UUID
    leave_type: str = "Annual"
    start_date: date
    end_date: date
    reason: Optional[str] = None


class ObjectiveCreate(BaseModel):
    employee_id: uuid.UUID
    title: str
    description: Optional[str] = None
    period_label: str = "Q4-2026"
    target_value: float = 100.0
    current_value: float = 0.0
    weight: int = 25
    due_date: Optional[date] = None


class EvaluationCreate(BaseModel):
    employee_id: uuid.UUID
    period_label: str = "2026-Q4"
    quality_score: float = Field(default=4.0, ge=1.0, le=5.0)
    reliability_score: float = Field(default=4.0, ge=1.0, le=5.0)
    collaboration_score: float = Field(default=4.0, ge=1.0, le=5.0)
    strengths: Optional[str] = None
    improvement_plan: Optional[str] = None


class CRMCustomerCreate(BaseModel):
    customer_code: str
    name_ar: str
    name_en: Optional[str] = None
    industry: Optional[str] = None
    customer_type: str = "Enterprise"
    status: str = "Active"
    account_owner_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None


class CRMOpportunityCreate(BaseModel):
    reference_code: str
    title: str
    customer_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    stage: str = "Lead"
    expected_value_sar: float = 0.0
    probability: int = Field(default=30, ge=0, le=100)
    expected_close_date: Optional[date] = None
    next_followup_date: Optional[date] = None
    source: Optional[str] = "Direct"
    notes: Optional[str] = None


class CRMOpportunityStageUpdate(BaseModel):
    stage: str
    probability: Optional[int] = None
    notes: Optional[str] = None


class CRMActivityCreate(BaseModel):
    subject: str
    activity_type: str = "FollowUp"
    customer_id: Optional[uuid.UUID] = None
    opportunity_id: Optional[uuid.UUID] = None
    employee_id: Optional[uuid.UUID] = None
    status: str = "Completed"
    due_date: Optional[date] = None
    notes: Optional[str] = None


class ProjectCreate(BaseModel):
    project_code: str
    name: str
    description: Optional[str] = None
    manager_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    status: str = "Active"
    priority: str = "High"
    start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    budget_sar: float = 0.0
    progress_percent: int = Field(default=0, ge=0, le=100)


class MilestoneCreate(BaseModel):
    title: str
    owner_id: Optional[uuid.UUID] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: str = "In Progress"
    completion_percent: int = Field(default=0, ge=0, le=100)


class PurchaseRequestCreate(BaseModel):
    request_number: str
    item_name: str
    category: str = "Hardware"
    vendor_name: Optional[str] = None
    requester_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    quantity: int = Field(default=1, ge=1)
    unit_cost_sar: float = Field(default=0.0, ge=0.0)
    justification: Optional[str] = None


class ApprovalDecisionInput(BaseModel):
    decision: str = Field(..., pattern="^(Approved|Rejected|Cancelled)$")
    notes: Optional[str] = None


# ── 1. HRM Router (/api/v1/hrm) ──────────────────────────────────────────────

hrm_router = APIRouter(prefix="/hrm", tags=["HRM & Attendance"])


@hrm_router.get("/overview")
def get_hrm_overview(
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    month: Optional[str] = None,  # YYYY-MM
    current_user: User = Depends(require_permission(Module.HRM, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return HR Dashboard KPIs, headcount distributions, attendance analytics, and leave requests."""
    from sqlalchemy import or_
    from app.models.enterprise import EmployeeBranchAssignment

    enterprise_service.ensure_canonical_five_branches(db, active_cid)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, active_cid, branch_id, branch_ids)
    today = arabic_nlp.riyadh_today()
    if month and len(month) == 7 and "-" in month:
        try:
            yr, mo = [int(x) for x in month.split("-")]
            period_start = date(yr, mo, 1)
            period_end = (period_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        except Exception:
            period_start = today.replace(day=1)
            period_end = today
    else:
        period_start = today.replace(day=1)
        period_end = today

    emp_q = db.query(Employee).filter(Employee.company_id == active_cid)
    if selected_branches:
        sub_emp = (
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(
                EmployeeBranchAssignment.company_id == active_cid,
                EmployeeBranchAssignment.branch_id.in_(selected_branches),
                EmployeeBranchAssignment.status == "Active",
            )
            .subquery()
        )
        emp_q = emp_q.filter(or_(Employee.branch_id.in_(selected_branches), Employee.id.in_(sub_emp)))
    if department_id:
        emp_q = emp_q.filter(Employee.department_id == department_id)
    # Deduplicate by Employee.id
    emp_map = {e.id: e for e in emp_q.all()}
    employees = list(emp_map.values())

    total_headcount = len(employees)
    active_headcount = sum(1 for e in employees if e.employment_status == "Active")
    on_leave_headcount = sum(1 for e in employees if e.employment_status == "On Leave")

    # Department distribution
    dept_counts: Dict[str, int] = {}
    branch_counts: Dict[str, int] = {}
    for e in employees:
        d_label = e.department.department_name if e.department else "غير محدد"
        b_label = e.branch.branch_name if e.branch else "المركز الرئيسي"
        dept_counts[d_label] = dept_counts.get(d_label, 0) + 1
        branch_counts[b_label] = branch_counts.get(b_label, 0) + 1

    # Attendance records for period
    emp_ids = [e.id for e in employees]
    att_rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.company_id == active_cid,
            AttendanceRecord.attendance_date >= period_start,
            AttendanceRecord.attendance_date <= period_end,
            AttendanceRecord.employee_id.in_(emp_ids) if emp_ids else False,
        )
        .order_by(AttendanceRecord.attendance_date.desc())
        .all()
        if emp_ids
        else []
    )
    today_att = [a for a in att_rows if a.attendance_date == today]
    present_today = sum(1 for a in today_att if a.status in ("Present", "Late", "Remote"))
    late_today = sum(1 for a in today_att if a.status == "Late" or a.late_minutes > 0)
    absent_today = sum(1 for a in today_att if a.status == "Absent")
    unrecorded_today = max(0, active_headcount - len(today_att))

    att_status_dist: Dict[str, int] = {
        "حاضر (Present)": sum(1 for a in att_rows if a.status == "Present"),
        "متأخر (Late)": sum(1 for a in att_rows if a.status == "Late"),
        "عن بُعد (Remote)": sum(1 for a in att_rows if a.status == "Remote"),
        "إجازة (On Leave)": sum(1 for a in att_rows if a.status == "On Leave"),
        "غائب مؤكد (Absent)": sum(1 for a in att_rows if a.status == "Absent"),
    }

    leave_q = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.employee))
        .filter(LeaveRequest.company_id == active_cid)
    )
    if selected_branches or department_id:
        leave_rows = (
            leave_q.filter(LeaveRequest.employee_id.in_(emp_ids))
            .order_by(LeaveRequest.created_at.desc())
            .limit(30)
            .all()
            if emp_ids
            else []
        )
    else:
        leave_rows = leave_q.order_by(LeaveRequest.created_at.desc()).limit(30).all()

    # Workload distribution (batch query — zero N+1)
    top_emps = employees[:20]
    top_emp_ids = [e.id for e in top_emps]
    tasks_for_top = (
        db.query(Task)
        .filter(Task.company_id == active_cid, Task.assigned_to_id.in_(top_emp_ids))
        .all()
        if top_emp_ids
        else []
    )
    tasks_by_emp: Dict[uuid.UUID, List[Task]] = {}
    for t in tasks_for_top:
        if t.assigned_to_id:
            tasks_by_emp.setdefault(t.assigned_to_id, []).append(t)

    workload_rows = []
    for e in top_emps:
        emp_tasks = tasks_by_emp.get(e.id, [])
        done_c = sum(1 for t in emp_tasks if t.status == "Completed")
        act_c = sum(1 for t in emp_tasks if t.status not in ("Completed", "Cancelled", "Rejected"))
        ovd_c = sum(
            1
            for t in emp_tasks
            if t.due_date and t.due_date < today and t.status not in ("Completed", "Cancelled", "Rejected")
        )
        workload_rows.append(
            {
                "employee_id": str(e.id),
                "full_name": e.full_name,
                "employee_number": e.employee_number,
                "job_title": e.job_title,
                "department_name": e.department.department_name if e.department else "—",
                "active_tasks": act_c,
                "completed_tasks": done_c,
                "overdue_tasks": ovd_c,
            }
        )

    return success_response(
        data={
            "kpis": {
                "total_headcount": total_headcount,
                "active_headcount": active_headcount,
                "on_leave_headcount": on_leave_headcount,
                "present_today": present_today,
                "late_today": late_today,
                "absent_today": absent_today,
                "unrecorded_today": unrecorded_today,
                "pending_leave_requests": sum(1 for lr in leave_rows if lr.status == "Pending"),
            },
            "distributions": {
                "by_department": dept_counts,
                "by_branch": branch_counts,
                "attendance_status": att_status_dist,
            },
            "workload_by_employee": workload_rows,
            "recent_attendance": [
                {
                    "id": str(a.id),
                    "employee_id": str(a.employee_id),
                    "employee_name": a.employee.full_name if a.employee else "—",
                    "employee_number": a.employee.employee_number if a.employee else "—",
                    "attendance_date": a.attendance_date.isoformat(),
                    "check_in_at": a.check_in_at.strftime("%H:%M") if a.check_in_at else None,
                    "check_out_at": a.check_out_at.strftime("%H:%M") if a.check_out_at else None,
                    "status": a.status,
                    "late_minutes": a.late_minutes,
                    "worked_minutes": a.worked_minutes,
                    "source": a.source,
                }
                for a in att_rows[:50]
            ],
            "leave_requests": [
                {
                    "id": str(lr.id),
                    "employee_id": str(lr.employee_id),
                    "employee_name": lr.employee.full_name if lr.employee else "—",
                    "leave_type": lr.leave_type,
                    "start_date": lr.start_date.isoformat(),
                    "end_date": lr.end_date.isoformat(),
                    "days_count": lr.days_count,
                    "status": lr.status,
                    "reason": lr.reason,
                }
                for lr in leave_rows
            ],
        }
    )


@hrm_router.post("/attendance")
def post_attendance_event(
    payload: AttendanceEventCreate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Record a verified attendance check-in/check-out or remote/absent event."""
    rec = enterprise_service.record_attendance_event(
        db=db,
        current_user=current_user,
        company_id=active_cid,
        employee_id=payload.employee_id,
        event_type=payload.event_type,
        attendance_date=payload.attendance_date,
        notes=payload.notes,
    )
    return success_response(
        data={
            "id": str(rec.id),
            "employee_id": str(rec.employee_id),
            "attendance_date": rec.attendance_date.isoformat(),
            "status": rec.status,
            "check_in_at": rec.check_in_at.strftime("%H:%M") if rec.check_in_at else None,
            "check_out_at": rec.check_out_at.strftime("%H:%M") if rec.check_out_at else None,
            "worked_minutes": rec.worked_minutes,
        },
        message="تم تسجيل حركة الحضور والانصراف بنجاح",
    )


@hrm_router.post("/leaves")
def create_leave_request(
    payload: LeaveRequestCreate,
    current_user: User = Depends(require_permission(Module.HRM, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Submit a leave request and automatically register a BPMN WorkflowApproval item."""
    emp = db.query(Employee).filter(Employee.id == payload.employee_id, Employee.company_id == active_cid).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود في الشركة الحالية")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="تاريخ نهاية الإجازة يجب أن يكون بعد أو مساوياً لتاريخ البداية")

    days = (payload.end_date - payload.start_date).days + 1
    lr = LeaveRequest(
        company_id=active_cid,
        employee_id=emp.id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=days,
        reason=payload.reason,
        status="Pending",
        requested_by_id=current_user.id,
    )
    db.add(lr)
    db.flush()

    wf_item = WorkflowApproval(
        company_id=active_cid,
        workflow_type="LeaveRequest",
        target_resource_type="LeaveRequest",
        target_resource_id=str(lr.id),
        title=f"طلب إجازة ({payload.leave_type}) — {emp.full_name} ({days} أيام)",
        initiator_employee_id=emp.id,
        requested_by_user_id=current_user.id,
        current_state="Pending",
        priority="Medium",
    )
    db.add(wf_item)
    db.commit()
    db.refresh(lr)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="LeaveRequest",
        resource_id=str(lr.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"employee_id": str(emp.id), "days": days, "leave_type": payload.leave_type},
    )
    return success_response(
        data={"id": str(lr.id), "approval_id": str(wf_item.id)},
        message="تم تقديم طلب الإجازة وإرساله للاعتماد",
    )


@hrm_router.post("/objectives")
def create_employee_objective(
    payload: ObjectiveCreate,
    current_user: User = Depends(require_permission(Module.HRM, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    emp = db.query(Employee).filter(Employee.id == payload.employee_id, Employee.company_id == active_cid).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    obj = EmployeeObjective(
        company_id=active_cid,
        employee_id=emp.id,
        title=payload.title.strip(),
        description=payload.description,
        period_label=payload.period_label,
        target_value=payload.target_value,
        current_value=payload.current_value,
        weight=payload.weight,
        due_date=payload.due_date,
        created_by_id=current_user.id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return success_response(data={"id": str(obj.id)}, message="تمت إضافة الهدف الوظيفي بنجاح")


@hrm_router.post("/evaluations")
def create_performance_evaluation(
    payload: EvaluationCreate,
    current_user: User = Depends(require_permission(Module.HRM, Action.APPROVE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a formal HR performance evaluation (restricted to authorized HR/Manager roles)."""
    emp = db.query(Employee).filter(Employee.id == payload.employee_id, Employee.company_id == active_cid).first()
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    overall = round((payload.quality_score + payload.reliability_score + payload.collaboration_score) / 3.0, 2)
    band = (
        "Exceeds Expectations"
        if overall >= 4.3
        else ("Meets Expectations" if overall >= 3.2 else "Needs Improvement")
    )
    ev = PerformanceEvaluation(
        company_id=active_cid,
        employee_id=emp.id,
        reviewer_id=current_user.id,
        period_label=payload.period_label,
        quality_score=payload.quality_score,
        reliability_score=payload.reliability_score,
        collaboration_score=payload.collaboration_score,
        overall_score=overall,
        rating_band=band,
        strengths=payload.strengths,
        improvement_plan=payload.improvement_plan,
        is_confidential=True,
        status="Approved",
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="PerformanceEvaluation",
        resource_id=str(ev.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"employee_id": str(emp.id), "period": payload.period_label, "overall_score": overall},
    )
    return success_response(data={"id": str(ev.id), "overall_score": overall, "rating_band": band}, message="تم اعتماد التقييم الوظيفي الرسمي")


# ── 2. CRM Router (/api/v1/crm) ──────────────────────────────────────────────

crm_router = APIRouter(prefix="/crm", tags=["CRM & Pipeline"])


@crm_router.get("/overview")
def get_crm_overview(
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    stage: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.CRM, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return CRM Dashboard KPIs, pipeline stages, customers, opportunities, and follow-up activities."""
    enterprise_service.ensure_canonical_five_branches(db, active_cid)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, active_cid, branch_id, branch_ids)
    cust_q = (
        db.query(CRMCustomer)
        .options(joinedload(CRMCustomer.account_owner), joinedload(CRMCustomer.branch))
        .filter(CRMCustomer.company_id == active_cid)
    )
    if selected_branches:
        cust_q = cust_q.filter(CRMCustomer.branch_id.in_(selected_branches))
    if search:
        s = f"%{search.strip()}%"
        cust_q = cust_q.filter(
            (CRMCustomer.name_ar.ilike(s))
            | (CRMCustomer.customer_code.ilike(s))
            | (CRMCustomer.contact_person.ilike(s))
        )
    customers = cust_q.order_by(CRMCustomer.created_at.desc()).all()

    filtered_customer_ids = [c.id for c in customers]
    opp_q = (
        db.query(CRMOpportunity)
        .options(joinedload(CRMOpportunity.customer), joinedload(CRMOpportunity.owner))
        .filter(CRMOpportunity.company_id == active_cid)
    )
    if selected_branches or search:
        opportunities = (
            opp_q.filter(CRMOpportunity.customer_id.in_(filtered_customer_ids))
            .filter(CRMOpportunity.stage == stage if stage else True)
            .order_by(CRMOpportunity.created_at.desc())
            .all()
            if filtered_customer_ids
            else []
        )
    else:
        if stage:
            opp_q = opp_q.filter(CRMOpportunity.stage == stage)
        opportunities = opp_q.order_by(CRMOpportunity.created_at.desc()).all()

    act_q = (
        db.query(CRMActivity)
        .options(joinedload(CRMActivity.customer), joinedload(CRMActivity.employee))
        .filter(CRMActivity.company_id == active_cid)
    )
    if selected_branches or search:
        activities = (
            act_q.filter(CRMActivity.customer_id.in_(filtered_customer_ids))
            .order_by(CRMActivity.created_at.desc())
            .limit(30)
            .all()
            if filtered_customer_ids
            else []
        )
    else:
        activities = act_q.order_by(CRMActivity.created_at.desc()).limit(30).all()

    stages_order = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
    stage_counts: Dict[str, int] = {st: 0 for st in stages_order}
    stage_values: Dict[str, float] = {st: 0.0 for st in stages_order}
    for op in opportunities:
        st = op.stage if op.stage in stage_counts else "Lead"
        stage_counts[st] = stage_counts.get(st, 0) + 1
        stage_values[st] = round(stage_values.get(st, 0.0) + float(op.expected_value_sar or 0), 2)

    won_count = stage_counts.get("Won", 0)
    closed_count = won_count + stage_counts.get("Lost", 0)
    conversion_rate = round((won_count / len(opportunities)) * 100, 1) if opportunities else 0.0
    win_rate = round((won_count / closed_count) * 100, 1) if closed_count > 0 else 0.0
    open_pipeline_value = round(
        sum(float(o.expected_value_sar or 0) for o in opportunities if o.stage not in ("Won", "Lost")), 2
    )
    won_revenue = round(sum(float(o.expected_value_sar or 0) for o in opportunities if o.stage == "Won"), 2)

    return success_response(
        data={
            "kpis": {
                "total_customers": len(customers),
                "active_customers": sum(1 for c in customers if c.status == "Active"),
                "total_opportunities": len(opportunities),
                "open_pipeline_value_sar": open_pipeline_value,
                "won_revenue_sar": won_revenue,
                "conversion_rate_percent": conversion_rate,
                "win_rate_percent": win_rate,
            },
            "pipeline_by_stage": stage_counts,
            "pipeline_value_by_stage": stage_values,
            "customers": [
                {
                    "id": str(c.id),
                    "customer_code": c.customer_code,
                    "name_ar": c.name_ar,
                    "name_en": c.name_en,
                    "industry": c.industry,
                    "customer_type": c.customer_type,
                    "status": c.status,
                    "contact_person": c.contact_person,
                    "email": c.email,
                    "phone": c.phone,
                    "city": c.city,
                    "account_owner_id": str(c.account_owner_id) if c.account_owner_id else None,
                    "account_owner_name": c.account_owner.full_name if c.account_owner else "غير مسند",
                    "branch_name": c.branch.branch_name if c.branch else None,
                }
                for c in customers
            ],
            "opportunities": [
                {
                    "id": str(o.id),
                    "reference_code": o.reference_code,
                    "title": o.title,
                    "stage": o.stage,
                    "expected_value_sar": float(o.expected_value_sar or 0),
                    "probability": o.probability,
                    "expected_close_date": o.expected_close_date.isoformat() if o.expected_close_date else None,
                    "next_followup_date": o.next_followup_date.isoformat() if o.next_followup_date else None,
                    "customer_id": str(o.customer_id) if o.customer_id else None,
                    "customer_name": o.customer.name_ar if o.customer else "—",
                    "owner_id": str(o.owner_id) if o.owner_id else None,
                    "owner_name": o.owner.full_name if o.owner else "غير مسند",
                }
                for o in opportunities
            ],
            "activities": [
                {
                    "id": str(a.id),
                    "activity_type": a.activity_type,
                    "subject": a.subject,
                    "status": a.status,
                    "due_date": a.due_date.isoformat() if a.due_date else None,
                    "customer_name": a.customer.name_ar if a.customer else "—",
                    "employee_name": a.employee.full_name if a.employee else "—",
                }
                for a in activities
            ],
        }
    )


@crm_router.post("/customers")
def create_crm_customer(
    payload: CRMCustomerCreate,
    current_user: User = Depends(require_permission(Module.CRM, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(CRMCustomer)
        .filter(CRMCustomer.company_id == active_cid, CRMCustomer.customer_code == payload.customer_code.strip())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="كود العميل مسجل مسبقاً في هذه الشركة")

    validate_company_fk(db, Branch, payload.branch_id, active_cid, "الفرع")
    if payload.account_owner_id:
        owner = db.query(Employee).filter(Employee.id == payload.account_owner_id, Employee.company_id == active_cid).first()
        if not owner:
            raise HTTPException(status_code=400, detail="مسؤول الحساب لا يتبع للشركة الحالية")

    cust = CRMCustomer(
        company_id=active_cid,
        branch_id=payload.branch_id,
        account_owner_id=payload.account_owner_id,
        customer_code=payload.customer_code.strip(),
        name_ar=payload.name_ar.strip(),
        name_en=payload.name_en,
        industry=payload.industry,
        customer_type=payload.customer_type,
        status=payload.status,
        contact_person=payload.contact_person,
        email=payload.email,
        phone=payload.phone,
        city=payload.city,
        notes=payload.notes,
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    log_audit(
        db=db,
        action="CREATE",
        resource_type="CRMCustomer",
        resource_id=str(cust.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=payload.model_dump(mode="json"),
    )
    return success_response(data={"id": str(cust.id)}, message="تم تسجيل العميل بنجاح")


@crm_router.post("/opportunities")
def create_crm_opportunity(
    payload: CRMOpportunityCreate,
    current_user: User = Depends(require_permission(Module.CRM, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(CRMOpportunity)
        .filter(CRMOpportunity.company_id == active_cid, CRMOpportunity.reference_code == payload.reference_code.strip())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="الرقم المرجعي للفرصة البيعية مسجل مسبقاً")

    validate_company_fk(db, CRMCustomer, payload.customer_id, active_cid, "العميل")
    if payload.owner_id:
        owner = db.query(Employee).filter(Employee.id == payload.owner_id, Employee.company_id == active_cid).first()
        if not owner:
            raise HTTPException(status_code=400, detail="الموظف المسؤول لا يتبع للشركة الحالية")

    opp = CRMOpportunity(
        company_id=active_cid,
        customer_id=payload.customer_id,
        owner_id=payload.owner_id,
        reference_code=payload.reference_code.strip(),
        title=payload.title.strip(),
        stage=payload.stage,
        expected_value_sar=payload.expected_value_sar,
        probability=payload.probability,
        expected_close_date=payload.expected_close_date,
        next_followup_date=payload.next_followup_date,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)
    log_audit(
        db=db,
        action="CREATE",
        resource_type="CRMOpportunity",
        resource_id=str(opp.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=payload.model_dump(mode="json"),
    )
    return success_response(data={"id": str(opp.id)}, message="تم إنشاء الفرصة البيعية بنجاح")


@crm_router.put("/opportunities/{opportunity_id}/stage")
def update_opportunity_stage(
    opportunity_id: uuid.UUID,
    payload: CRMOpportunityStageUpdate,
    current_user: User = Depends(require_permission(Module.CRM, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    opp = (
        db.query(CRMOpportunity)
        .filter(CRMOpportunity.id == opportunity_id, CRMOpportunity.company_id == active_cid)
        .first()
    )
    if not opp:
        raise HTTPException(status_code=404, detail="الفرصة البيعية غير موجودة")

    valid_stages = {"Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"}
    if payload.stage not in valid_stages:
        raise HTTPException(status_code=400, detail="مرحلة الفرصة البيعية غير صالحة")

    old_stage = opp.stage
    opp.stage = payload.stage
    if payload.probability is not None:
        opp.probability = payload.probability
    elif payload.stage == "Won":
        opp.probability = 100
    elif payload.stage == "Lost":
        opp.probability = 0
    if payload.notes:
        opp.notes = payload.notes

    db.commit()
    log_audit(
        db=db,
        action="STAGE_TRANSITION",
        resource_type="CRMOpportunity",
        resource_id=str(opp.id),
        user_id=current_user.id,
        company_id=active_cid,
        old_values={"stage": old_stage},
        new_values={"stage": opp.stage, "probability": opp.probability},
    )
    return success_response(data={"id": str(opp.id), "stage": opp.stage}, message="تم تحديث مرحلة الفرصة البيعية")


@crm_router.post("/activities")
def create_crm_activity(
    payload: CRMActivityCreate,
    current_user: User = Depends(require_permission(Module.CRM, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    act = CRMActivity(
        company_id=active_cid,
        customer_id=payload.customer_id,
        opportunity_id=payload.opportunity_id,
        employee_id=payload.employee_id or current_user.employee_id,
        activity_type=payload.activity_type,
        subject=payload.subject.strip(),
        status=payload.status,
        due_date=payload.due_date or arabic_nlp.riyadh_today(),
        notes=payload.notes,
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return success_response(data={"id": str(act.id)}, message="تم تسجيل نشاط المتابعة بنجاح")


# ── 3. Projects Router (/api/v1/projects) ────────────────────────────────────

projects_router = APIRouter(prefix="/projects", tags=["Enterprise Projects"])


@projects_router.get("")
def list_projects(
    branch_id: Optional[uuid.UUID] = None,
    branch_ids: Optional[str] = None,
    department_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.PROJECTS, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return Projects Dashboard KPIs, project progress, milestones, Gantt schedule data, and task counts."""
    enterprise_service.ensure_canonical_five_branches(db, active_cid)
    selected_branches = enterprise_service.parse_branch_ids_filter(db, active_cid, branch_id, branch_ids)
    today = arabic_nlp.riyadh_today()
    q = (
        db.query(Project)
        .options(joinedload(Project.manager), joinedload(Project.department), joinedload(Project.branch))
        .filter(Project.company_id == active_cid)
    )
    if selected_branches:
        q = q.filter(Project.branch_id.in_(selected_branches))
    if department_id:
        q = q.filter(Project.department_id == department_id)
    if status:
        q = q.filter(Project.status == status)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter((Project.name.ilike(s)) | (Project.project_code.ilike(s)))

    projects = q.order_by(Project.created_at.desc()).all()
    milestones = (
        db.query(ProjectMilestone)
        .options(joinedload(ProjectMilestone.owner))
        .filter(ProjectMilestone.company_id == active_cid)
        .order_by(ProjectMilestone.due_date.asc())
        .all()
    )

    project_ids = [p.id for p in projects]
    all_proj_tasks = (
        db.query(Task)
        .filter(Task.company_id == active_cid, Task.project_id.in_(project_ids))
        .all()
        if project_ids
        else []
    )
    tasks_by_project: Dict[uuid.UUID, List[Task]] = {}
    for pt in all_proj_tasks:
        if pt.project_id:
            tasks_by_project.setdefault(pt.project_id, []).append(pt)

    project_items = []
    delayed_projects = 0
    for p in projects:
        p_tasks = tasks_by_project.get(p.id, [])
        done_t = sum(1 for t in p_tasks if t.status == "Completed")
        overdue_t = sum(
            1
            for t in p_tasks
            if t.due_date and t.due_date < today and t.status not in ("Completed", "Cancelled", "Rejected")
        )
        p_milestones = [m for m in milestones if m.project_id == p.id]
        computed_progress = (
            round((done_t / len(p_tasks)) * 100) if p_tasks else p.progress_percent
        )
        is_delayed = bool(
            (p.target_end_date and p.target_end_date < today and p.status not in ("Completed", "Cancelled"))
            or overdue_t > 0
        )
        if is_delayed:
            delayed_projects += 1

        project_items.append(
            {
                "id": str(p.id),
                "project_code": p.project_code,
                "name": p.name,
                "description": p.description,
                "status": p.status,
                "priority": p.priority,
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "target_end_date": p.target_end_date.isoformat() if p.target_end_date else None,
                "budget_sar": float(p.budget_sar or 0),
                "spent_sar": float(p.spent_sar or 0),
                "progress_percent": computed_progress,
                "manager_id": str(p.manager_id) if p.manager_id else None,
                "manager_name": p.manager.full_name if p.manager else "غير معين",
                "department_name": p.department.department_name if p.department else "—",
                "branch_name": p.branch.branch_name if p.branch else "—",
                "total_tasks": len(p_tasks),
                "completed_tasks": done_t,
                "overdue_tasks": overdue_t,
                "is_delayed": is_delayed,
                "milestones": [
                    {
                        "id": str(m.id),
                        "title": m.title,
                        "status": m.status,
                        "start_date": m.start_date.isoformat() if m.start_date else None,
                        "due_date": m.due_date.isoformat() if m.due_date else None,
                        "completion_percent": m.completion_percent,
                        "owner_name": m.owner.full_name if m.owner else "—",
                    }
                    for m in p_milestones
                ],
            }
        )

    status_dist: Dict[str, int] = {}
    for p in projects:
        status_dist[p.status] = status_dist.get(p.status, 0) + 1

    return success_response(
        data={
            "kpis": {
                "total_projects": len(projects),
                "active_projects": sum(1 for p in projects if p.status == "Active"),
                "completed_projects": sum(1 for p in projects if p.status == "Completed"),
                "delayed_projects": delayed_projects,
                "total_budget_sar": round(sum(float(p.budget_sar or 0) for p in projects), 2),
                "total_spent_sar": round(sum(float(p.spent_sar or 0) for p in projects), 2),
            },
            "status_distribution": status_dist,
            "projects": project_items,
        }
    )


@projects_router.post("")
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_permission(Module.PROJECTS, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Project)
        .filter(Project.company_id == active_cid, Project.project_code == payload.project_code.strip())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="كود المشروع مسجل مسبقاً في هذه الشركة")

    validate_company_fk(db, Branch, payload.branch_id, active_cid, "الفرع")
    validate_company_fk(db, Department, payload.department_id, active_cid, "القسم")
    if payload.manager_id:
        mgr = db.query(Employee).filter(Employee.id == payload.manager_id, Employee.company_id == active_cid).first()
        if not mgr:
            raise HTTPException(status_code=400, detail="مدير المشروع لا يتبع للشركة الحالية")

    proj = Project(
        company_id=active_cid,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        project_code=payload.project_code.strip(),
        name=payload.name.strip(),
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        start_date=payload.start_date or arabic_nlp.riyadh_today(),
        target_end_date=payload.target_end_date,
        budget_sar=payload.budget_sar,
        progress_percent=payload.progress_percent,
        created_by_id=current_user.id,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="Project",
        resource_id=str(proj.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=payload.model_dump(mode="json"),
    )
    return success_response(data={"id": str(proj.id)}, message="تم إنشاء المشروع بنجاح")


@projects_router.post("/{project_id}/milestones")
def create_project_milestone(
    project_id: uuid.UUID,
    payload: MilestoneCreate,
    current_user: User = Depends(require_permission(Module.PROJECTS, Action.EDIT)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    proj = db.query(Project).filter(Project.id == project_id, Project.company_id == active_cid).first()
    if not proj:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    ms = ProjectMilestone(
        company_id=active_cid,
        project_id=proj.id,
        owner_id=payload.owner_id,
        title=payload.title.strip(),
        start_date=payload.start_date,
        due_date=payload.due_date,
        status=payload.status,
        completion_percent=payload.completion_percent,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return success_response(data={"id": str(ms.id)}, message="تمت إضافة مرحلة المشروع بنجاح")


# ── 4. Approvals & Procurement Router (/api/v1/approvals) ────────────────────

approvals_router = APIRouter(prefix="/approvals", tags=["Workflows & Approvals"])


@approvals_router.get("")
def list_approvals_and_procurement(
    state: Optional[str] = None,
    workflow_type: Optional[str] = None,
    current_user: User = Depends(require_permission(Module.APPROVALS, Action.VIEW)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return unified BPMN approval center items and ERP purchase requisitions."""
    wf_q = (
        db.query(WorkflowApproval)
        .options(joinedload(WorkflowApproval.initiator_employee), joinedload(WorkflowApproval.assigned_approver))
        .filter(WorkflowApproval.company_id == active_cid)
    )
    if state:
        wf_q = wf_q.filter(WorkflowApproval.current_state == state)
    if workflow_type:
        wf_q = wf_q.filter(WorkflowApproval.workflow_type == workflow_type)
    approvals = wf_q.order_by(WorkflowApproval.created_at.desc()).all()

    purchases = (
        db.query(PurchaseRequest)
        .options(joinedload(PurchaseRequest.requester), joinedload(PurchaseRequest.department))
        .filter(PurchaseRequest.company_id == active_cid)
        .order_by(PurchaseRequest.created_at.desc())
        .all()
    )

    can_approve = has_module_permission(current_user, Module.APPROVALS, Action.APPROVE, active_cid, db)

    return success_response(
        data={
            "can_approve": can_approve,
            "kpis": {
                "total_approvals": len(approvals),
                "pending_approvals": sum(1 for a in approvals if a.current_state == "Pending"),
                "approved_count": sum(1 for a in approvals if a.current_state == "Approved"),
                "rejected_count": sum(1 for a in approvals if a.current_state == "Rejected"),
                "total_purchase_requests": len(purchases),
                "pending_purchase_amount_sar": round(
                    sum(float(p.total_cost_sar or 0) for p in purchases if p.status == "Pending Approval"), 2
                ),
            },
            "approvals": [
                {
                    "id": str(a.id),
                    "workflow_type": a.workflow_type,
                    "target_resource_type": a.target_resource_type,
                    "target_resource_id": a.target_resource_id,
                    "title": a.title,
                    "current_state": a.current_state,
                    "priority": a.priority,
                    "amount_sar": float(a.amount_sar) if a.amount_sar is not None else None,
                    "initiator_employee_id": str(a.initiator_employee_id) if a.initiator_employee_id else None,
                    "initiator_name": a.initiator_employee.full_name if a.initiator_employee else "النظام",
                    "approver_name": a.assigned_approver.username if a.assigned_approver else None,
                    "decision_notes": a.decision_notes,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                    "decided_at": a.decided_at.isoformat() if a.decided_at else None,
                }
                for a in approvals
            ],
            "purchase_requests": [
                {
                    "id": str(p.id),
                    "request_number": p.request_number,
                    "item_name": p.item_name,
                    "category": p.category,
                    "vendor_name": p.vendor_name,
                    "quantity": p.quantity,
                    "unit_cost_sar": float(p.unit_cost_sar or 0),
                    "total_cost_sar": float(p.total_cost_sar or 0),
                    "status": p.status,
                    "requester_name": p.requester.full_name if p.requester else "—",
                    "department_name": p.department.department_name if p.department else "—",
                    "justification": p.justification,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in purchases
            ],
        }
    )


@approvals_router.post("/purchase-requests")
def create_purchase_request(
    payload: PurchaseRequestCreate,
    current_user: User = Depends(require_permission(Module.APPROVALS, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(PurchaseRequest)
        .filter(PurchaseRequest.company_id == active_cid, PurchaseRequest.request_number == payload.request_number.strip())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="رقم طلب الشراء مسجل مسبقاً")

    validate_company_fk(db, Branch, payload.branch_id, active_cid, "الفرع")
    validate_company_fk(db, Department, payload.department_id, active_cid, "القسم")
    requester_id = payload.requester_id or current_user.employee_id
    validate_company_fk(db, Employee, requester_id, active_cid, "مقدم الطلب")
    total_cost = round(payload.quantity * payload.unit_cost_sar, 2)
    pr = PurchaseRequest(
        company_id=active_cid,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        requester_id=requester_id,
        request_number=payload.request_number.strip(),
        item_name=payload.item_name.strip(),
        category=payload.category,
        vendor_name=payload.vendor_name,
        quantity=payload.quantity,
        unit_cost_sar=payload.unit_cost_sar,
        total_cost_sar=total_cost,
        justification=payload.justification,
        status="Pending Approval",
    )
    db.add(pr)
    db.flush()

    wf_item = WorkflowApproval(
        company_id=active_cid,
        workflow_type="PurchaseRequest",
        target_resource_type="PurchaseRequest",
        target_resource_id=str(pr.id),
        title=f"طلب شراء {payload.request_number}: {payload.item_name} ({total_cost:,.2f} ر.س)",
        initiator_employee_id=requester_id,
        requested_by_user_id=current_user.id,
        current_state="Pending",
        priority="High" if total_cost >= 10000 else "Medium",
        amount_sar=total_cost,
    )
    db.add(wf_item)
    db.commit()
    db.refresh(pr)

    log_audit(
        db=db,
        action="CREATE",
        resource_type="PurchaseRequest",
        resource_id=str(pr.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values=payload.model_dump(mode="json"),
    )
    return success_response(
        data={"id": str(pr.id), "approval_id": str(wf_item.id), "total_cost_sar": total_cost},
        message="تم إنشاء طلب الشراء وإرساله للاعتماد",
    )


@approvals_router.post("/{approval_id}/decide")
def decide_approval_endpoint(
    approval_id: uuid.UUID,
    payload: ApprovalDecisionInput,
    current_user: User = Depends(require_permission(Module.APPROVALS, Action.APPROVE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    wf_rec = enterprise_service.decide_workflow_approval(
        db=db,
        current_user=current_user,
        company_id=active_cid,
        approval_id=approval_id,
        decision=payload.decision,
        notes=payload.notes,
    )
    return success_response(
        data={"id": str(wf_rec.id), "current_state": wf_rec.current_state},
        message=f"تم تحديث حالة الطلب إلى ({wf_rec.current_state})",
    )


@approvals_router.post("/purchase-requests/{pr_id}/provision-asset")
def provision_asset_from_purchase_request(
    pr_id: uuid.UUID,
    current_user: User = Depends(require_permission(Module.ASSETS, Action.CREATE)),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Provision technical asset(s) into inventory from an Approved purchase request."""
    pr = db.query(PurchaseRequest).filter(PurchaseRequest.id == pr_id, PurchaseRequest.company_id == active_cid).first()
    if not pr:
        raise HTTPException(status_code=404, detail="طلب الشراء غير موجود")
    if pr.status != "Approved":
        raise HTTPException(status_code=400, detail="يجب اعتماد طلب الشراء أولاً قبل تحويله لأصل مسجل")

    canonical_branches = enterprise_service.ensure_canonical_five_branches(db, active_cid)
    target_branch_id = pr.branch_id or (canonical_branches[2].id if len(canonical_branches) >= 3 else canonical_branches[0].id)

    created_ids = []
    for idx in range(max(1, pr.quantity or 1)):
        code = f"PR-{pr.request_number.strip()}-{idx + 1}-{uuid.uuid4().hex[:4].upper()}"
        asset = TechnicalAsset(
            company_id=active_cid,
            branch_id=target_branch_id,
            department_id=pr.department_id,
            asset_code=code,
            asset_name=pr.item_name,
            asset_category="General" if pr.category == "General" else "IT",
            asset_type=pr.category or "Hardware",
            brand=pr.vendor_name,
            condition="New",
            status="Available",
            notes=f"تم التوريد من طلب شراء رقم {pr.request_number}",
        )
        db.add(asset)
        db.flush()
        created_ids.append(str(asset.id))

    pr.status = "Fulfilled"
    wf_item = (
        db.query(WorkflowApproval)
        .filter(
            WorkflowApproval.company_id == active_cid,
            WorkflowApproval.workflow_type == "PurchaseRequest",
            WorkflowApproval.target_resource_id == str(pr.id),
        )
        .first()
    )
    if wf_item and wf_item.current_state == "Approved":
        wf_item.current_state = "Executed"
    db.commit()

    log_audit(
        db=db,
        action="PROVISION_ASSETS",
        resource_type="PurchaseRequest",
        resource_id=str(pr.id),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"asset_ids": created_ids, "count": len(created_ids)},
    )
    return success_response(
        data={"purchase_request_id": str(pr.id), "asset_ids": created_ids, "status": pr.status},
        message=f"تم ترحيل {len(created_ids)} أصل إلى سجل الأصول بنجاح",
    )
