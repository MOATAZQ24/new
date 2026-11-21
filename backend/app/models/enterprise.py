# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Enterprise HRM, CRM, Projects, Procurement, and Approval Workflow models for Investor Gate OS 3.0.

All entities share the canonical `Employee` (employees.id), `Company` (companies.id),
`Branch` (branches.id), and `Department` (departments.id) tables — One Authoritative Identity,
One Source of Truth, Everywhere.
"""

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    String,
    Boolean,
    Text,
    Date,
    DateTime,
    Integer,
    Numeric,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


# ── 1. HRM & Canonical Employee Assignment History ───────────────────────────

class EmployeeAssignmentHistory(UUIDMixin, TimestampMixin, Base):
    """Immutable history of organizational assignments (company, branch, department, manager, title, status)."""

    __tablename__ = "employee_assignment_history"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    employment_status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    change_type: Mapped[str] = mapped_column(
        String(50), default="Assignment", nullable=False
    )  # Onboarding, Transfer, Promotion, StatusChange, Deactivation
    effective_from: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    changed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    manager: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[manager_id])
    changed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[changed_by_id])

    __table_args__ = (
        Index("ix_emp_assign_hist_employee_id", "employee_id"),
        Index("ix_emp_assign_hist_company_id", "company_id"),
    )


class WorkSchedule(UUIDMixin, TimestampMixin, Base):
    """Company/department working hours schedule for accurate attendance evaluation."""

    __tablename__ = "work_schedules"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), default="الدوام الرسمي", nullable=False)
    shift_start: Mapped[str] = mapped_column(String(10), default="08:30", nullable=False)  # HH:MM
    shift_end: Mapped[str] = mapped_column(String(10), default="17:00", nullable=False)    # HH:MM
    grace_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    working_days: Mapped[str] = mapped_column(
        String(100), default="Sun,Mon,Tue,Wed,Thu", nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Riyadh", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        Index("ix_work_schedules_company_id", "company_id"),
    )


class AttendanceRecord(UUIDMixin, TimestampMixin, Base):
    """Authoritative daily attendance & departure record. Never inferred from app login."""

    __tablename__ = "attendance_records"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="Present", nullable=False
    )  # Present, Late, Early Departure, Absent, On Leave, Remote, Excused
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    early_leave_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    worked_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(
        String(50), default="SelfCheckIn", nullable=False
    )  # SelfCheckIn, HRManual, BiometricDevice, CorrectionApproved
    recorded_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    recorded_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[recorded_by_id])

    __table_args__ = (
        UniqueConstraint("company_id", "employee_id", "attendance_date", name="uq_company_emp_attendance_date"),
        Index("ix_attendance_company_id", "company_id"),
        Index("ix_attendance_employee_id", "employee_id"),
        Index("ix_attendance_date", "attendance_date"),
        Index("ix_attendance_status", "status"),
    )


class LeaveRequest(UUIDMixin, TimestampMixin, Base):
    """Employee leave / absence workflow with state transitions and approval audit."""

    __tablename__ = "leave_requests"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    leave_type: Mapped[str] = mapped_column(
        String(50), default="Annual", nullable=False
    )  # Annual, Sick, Emergency, Unpaid, BusinessTrip
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="Pending", nullable=False
    )  # Pending, Approved, Rejected, Cancelled
    requested_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    requested_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[requested_by_id])
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        Index("ix_leave_requests_company_id", "company_id"),
        Index("ix_leave_requests_employee_id", "employee_id"),
        Index("ix_leave_requests_status", "status"),
    )


class EmployeeObjective(UUIDMixin, TimestampMixin, Base):
    """Defined employee OKR / goal separated from raw task counts."""

    __tablename__ = "employee_objectives"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    period_label: Mapped[str] = mapped_column(String(50), default="Q4-2026", nullable=False)
    target_value: Mapped[float] = mapped_column(Numeric(10, 2), default=100.0, nullable=False)
    current_value: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    weight: Mapped[int] = mapped_column(Integer, default=25, nullable=False)  # 1-100%
    status: Mapped[str] = mapped_column(
        String(50), default="In Progress", nullable=False
    )  # In Progress, Achieved, At Risk, Deferred
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("ix_employee_objectives_company_id", "company_id"),
        Index("ix_employee_objectives_employee_id", "employee_id"),
    )


class PerformanceEvaluation(UUIDMixin, TimestampMixin, Base):
    """Formal, permission-protected HR performance evaluation separate from operational telemetry."""

    __tablename__ = "performance_evaluations"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    period_label: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "2026-Q4"
    quality_score: Mapped[float] = mapped_column(Numeric(4, 2), default=4.0, nullable=False)      # 1.0 - 5.0
    reliability_score: Mapped[float] = mapped_column(Numeric(4, 2), default=4.0, nullable=False)  # 1.0 - 5.0
    collaboration_score: Mapped[float] = mapped_column(Numeric(4, 2), default=4.0, nullable=False)  # 1.0 - 5.0
    overall_score: Mapped[float] = mapped_column(Numeric(4, 2), default=4.0, nullable=False)      # 1.0 - 5.0
    rating_band: Mapped[str] = mapped_column(
        String(50), default="Meets Expectations", nullable=False
    )  # Exceeds Expectations, Meets Expectations, Needs Improvement
    strengths: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    improvement_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_confidential: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="Approved", nullable=False
    )  # Draft, Submitted, Approved

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewer_id])

    __table_args__ = (
        Index("ix_perf_eval_company_id", "company_id"),
        Index("ix_perf_eval_employee_id", "employee_id"),
    )


class EmployeeDocument(UUIDMixin, TimestampMixin, Base):
    """Authorized employee HR / technical certification & custody documents."""

    __tablename__ = "employee_documents"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[str] = mapped_column(
        String(100), default="Contract", nullable=False
    )  # Contract, NationalID, Certification, CustodyAcknowledgment, NDA, Other
    reference_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_confidential: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    uploaded_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[uploaded_by_id])

    __table_args__ = (
        Index("ix_employee_documents_company_id", "company_id"),
        Index("ix_employee_documents_employee_id", "employee_id"),
    )


# ── 2. Enterprise Projects & Milestones ──────────────────────────────────────

class Project(UUIDMixin, TimestampMixin, Base):
    """Enterprise project linking departments, project manager (canonical Employee), milestones, and tasks."""

    __tablename__ = "projects"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    project_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="Active", nullable=False
    )  # Planning, Pending Approval, Active, On Hold, Completed, Cancelled
    priority: Mapped[str] = mapped_column(String(50), default="High", nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    budget_sar: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0, nullable=False)
    spent_sar: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0, nullable=False)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    manager: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[manager_id])
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        UniqueConstraint("company_id", "project_code", name="uq_company_project_code"),
        Index("ix_projects_company_id", "company_id"),
        Index("ix_projects_manager_id", "manager_id"),
        Index("ix_projects_status", "status"),
    )


class ProjectMilestone(UUIDMixin, TimestampMixin, Base):
    """Project milestone / phase for schedule & Gantt tracking."""

    __tablename__ = "project_milestones"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="In Progress", nullable=False
    )  # Planned, In Progress, Completed, Delayed
    completion_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])
    owner: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[owner_id])

    __table_args__ = (
        Index("ix_project_milestones_project_id", "project_id"),
    )


# ── 3. CRM (Customers, Contacts, Leads, Opportunities, Quotations, Activities) ─

class CRMCustomer(UUIDMixin, TimestampMixin, Base):
    """Enterprise customer / client organization or account."""

    __tablename__ = "crm_customers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    account_owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    customer_type: Mapped[str] = mapped_column(
        String(50), default="Enterprise", nullable=False
    )  # Enterprise, Government, SMB, Strategic Partner
    status: Mapped[str] = mapped_column(
        String(50), default="Active", nullable=False
    )  # Prospect, Active, Inactive, Churned
    contact_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    account_owner: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[account_owner_id])

    __table_args__ = (
        UniqueConstraint("company_id", "customer_code", name="uq_company_customer_code"),
        Index("ix_crm_customers_company_id", "company_id"),
        Index("ix_crm_customers_owner_id", "account_owner_id"),
    )


class CRMOpportunity(UUIDMixin, TimestampMixin, Base):
    """CRM sales lead / opportunity pipeline stage with real revenue & probability."""

    __tablename__ = "crm_opportunities"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_customers.id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    reference_code: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    stage: Mapped[str] = mapped_column(
        String(50), default="Lead", nullable=False
    )  # Lead, Qualified, Proposal, Negotiation, Won, Lost
    expected_value_sar: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, default=30, nullable=False)  # 0 - 100
    expected_close_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_followup_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(100), default="Direct", nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    customer: Mapped[Optional["CRMCustomer"]] = relationship("CRMCustomer", foreign_keys=[customer_id])
    owner: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[owner_id])

    __table_args__ = (
        UniqueConstraint("company_id", "reference_code", name="uq_company_opp_ref"),
        Index("ix_crm_opportunities_company_id", "company_id"),
        Index("ix_crm_opportunities_stage", "stage"),
        Index("ix_crm_opportunities_owner_id", "owner_id"),
    )


class CRMActivity(UUIDMixin, TimestampMixin, Base):
    """CRM follow-up activity, call, meeting, or quotation record."""

    __tablename__ = "crm_activities"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_customers.id", ondelete="SET NULL"),
        nullable=True,
    )
    opportunity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_opportunities.id", ondelete="SET NULL"),
        nullable=True,
    )
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    activity_type: Mapped[str] = mapped_column(
        String(50), default="FollowUp", nullable=False
    )  # Call, Meeting, Proposal, Quotation, FollowUp
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="Completed", nullable=False
    )  # Planned, Completed, Overdue, Cancelled
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    customer: Mapped[Optional["CRMCustomer"]] = relationship("CRMCustomer", foreign_keys=[customer_id])
    opportunity: Mapped[Optional["CRMOpportunity"]] = relationship("CRMOpportunity", foreign_keys=[opportunity_id])
    employee: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[employee_id])

    __table_args__ = (
        Index("ix_crm_activities_company_id", "company_id"),
        Index("ix_crm_activities_employee_id", "employee_id"),
    )


# ── 4. ERP Procurement & Unified Approval Workflows ──────────────────────────

class PurchaseRequest(UUIDMixin, TimestampMixin, Base):
    """ERP purchase / device requisition with formal approval workflow."""

    __tablename__ = "purchase_requests"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    requester_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    request_number: Mapped[str] = mapped_column(String(50), nullable=False)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(100), default="Hardware", nullable=False
    )  # Hardware, Software, Network, CloudSubscription, OfficeEquipment, Service
    vendor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_cost_sar: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    total_cost_sar: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0, nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="Pending Approval", nullable=False
    )  # Draft, Pending Approval, Approved, Ordered, Received, Rejected, Cancelled
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    requester: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[requester_id])
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        UniqueConstraint("company_id", "request_number", name="uq_company_purchase_req_num"),
        Index("ix_purchase_requests_company_id", "company_id"),
        Index("ix_purchase_requests_requester_id", "requester_id"),
        Index("ix_purchase_requests_status", "status"),
    )


class WorkflowApproval(UUIDMixin, TimestampMixin, Base):
    """Unified cross-module BPMN approval request & state transition record."""

    __tablename__ = "workflow_approvals"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    workflow_type: Mapped[str] = mapped_column(
        String(80), nullable=False
    )  # LeaveRequest, PurchaseRequest, MaintenanceChange, AssetTransfer, EmployeeTransfer, ProjectApproval, SubscriptionRenewal
    target_resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    initiator_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    requested_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_approver_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_state: Mapped[str] = mapped_column(
        String(50), default="Pending", nullable=False
    )  # Pending, Approved, Rejected, Executed, Cancelled
    priority: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)
    amount_sar: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    decision_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    initiator_employee: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[initiator_employee_id])
    requested_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[requested_by_user_id])
    assigned_approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_approver_id])

    __table_args__ = (
        Index("ix_workflow_approvals_company_id", "company_id"),
        Index("ix_workflow_approvals_state", "current_state"),
        Index("ix_workflow_approvals_initiator", "initiator_employee_id"),
    )


# ── 5. Canonical Physical Branch Locations, Multi-Branch Assignments & Asset Transfers ──

CANONICAL_BRANCH_SPEC = [
    ("BR-RYD-SUL", "الرياض – السلي (مخرج 17)", "الرياض", "حي السلي - مخرج 17"),
    ("BR-RYD-FSL", "الرياض – الفيصلية (مخرج 18)", "الرياض", "حي الفيصلية - مخرج 18"),
    ("BR-RYD-OLY", "الرياض – العليا", "الرياض", "حي العليا - طريق الملك فهد"),
    ("BR-DMM", "الدمام", "الدمام", "المنطقة الشرقية - الدمام"),
    ("BR-JED", "جدة", "جدة", "منطقة مكة المكرمة - جدة"),
]

CANONICAL_BRANCH_NAMES = [item[1] for item in CANONICAL_BRANCH_SPEC]


class PhysicalBranchLocation(UUIDMixin, TimestampMixin, Base):
    """Canonical physical operational branch shared across companies (exactly 5 authorized active locations)."""

    __tablename__ = "physical_branch_locations"

    canonical_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class EmployeeBranchAssignment(UUIDMixin, TimestampMixin, Base):
    """Allows a canonical person/employee to work across multiple companies and multiple branches."""

    __tablename__ = "employee_branch_assignments"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    role_name: Mapped[Optional[str]] = mapped_column(String(100), default="Employee", nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    section: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    team: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)

    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped["Branch"] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    manager: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[manager_id])

    __table_args__ = (
        UniqueConstraint("employee_id", "company_id", "branch_id", name="uq_emp_company_branch_assignment"),
        Index("ix_emp_branch_assign_emp", "employee_id"),
        Index("ix_emp_branch_assign_company", "company_id"),
        Index("ix_emp_branch_assign_branch", "branch_id"),
    )


class AssetBranchTransfer(UUIDMixin, TimestampMixin, Base):
    """Tracks physical branch transfers of assets: Current Branch -> Request -> Approval -> Physical Transfer -> New Branch."""

    __tablename__ = "asset_branch_transfers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technical_assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    custodian_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    requested_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), default="Completed", nullable=False
    )  # Pending Approval, Approved, Completed, Rejected, Cancelled
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transferred_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    asset: Mapped["TechnicalAsset"] = relationship("TechnicalAsset", foreign_keys=[asset_id])
    from_branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[from_branch_id])
    to_branch: Mapped["Branch"] = relationship("Branch", foreign_keys=[to_branch_id])
    custodian: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[custodian_employee_id])

    __table_args__ = (
        Index("ix_asset_branch_transfers_company", "company_id"),
        Index("ix_asset_branch_transfers_asset", "asset_id"),
        Index("ix_asset_branch_transfers_to_branch", "to_branch_id"),
    )
