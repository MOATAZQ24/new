# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Models module exports."""

from app.models.base import Base, UUIDMixin, TimestampMixin
from app.models.company import Company, Branch, Department
from app.models.user import Employee, User, Role, UserRole, CompanyMembership, UserSession, PasswordResetToken
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription, EmployeeSubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task, TaskComment, TaskParticipant
from app.models.ticket import HelpDeskTicket, TicketComment, ProblemRecord, KnowledgeArticle
from app.models.notification import Notification
from app.models.audit import AuditLog
from app.models.integration import IntegrationConfig, IntegrationLog
from app.models.customization import UserWorkspacePreference, CompanyBranding
from app.models.digital_asset import DigitalAsset, AssetSecret, AssetAccessPermission
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog, TelegramBotMenuConfig, TelegramMessageTemplate
from app.models.enterprise import (
    CANONICAL_BRANCH_SPEC,
    CANONICAL_BRANCH_NAMES,
    PhysicalBranchLocation,
    EmployeeBranchAssignment,
    AssetBranchTransfer,
    EmployeeAssignmentHistory,
    WorkSchedule,
    AttendanceRecord,
    LeaveRequest,
    EmployeeObjective,
    PerformanceEvaluation,
    EmployeeDocument,
    Project,
    ProjectMilestone,
    CRMCustomer,
    CRMOpportunity,
    CRMActivity,
    PurchaseRequest,
    WorkflowApproval,
)

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "Company",
    "Branch",
    "Department",
    "Employee",
    "User",
    "Role",
    "UserRole",
    "CompanyMembership",
    "UserSession",
    "PasswordResetToken",
    "TechnicalAsset",
    "AssetCustody",
    "ITInfrastructure",
    "ThirdPartySubscription",
    "EmployeeSubscription",
    "MaintenanceRecord",
    "Task",
    "TaskComment",
    "TaskParticipant",
    "HelpDeskTicket",
    "TicketComment",
    "ProblemRecord",
    "KnowledgeArticle",
    "Notification",
    "AuditLog",
    "IntegrationConfig",
    "IntegrationLog",
    "UserWorkspacePreference",
    "CompanyBranding",
    "DigitalAsset",
    "AssetSecret",
    "AssetAccessPermission",
    "TelegramUserLink",
    "NotificationOutbox",
    "TelegramActionLog",
    "TelegramBotMenuConfig",
    "TelegramMessageTemplate",
    "EmployeeAssignmentHistory",
    "WorkSchedule",
    "AttendanceRecord",
    "LeaveRequest",
    "EmployeeObjective",
    "PerformanceEvaluation",
    "EmployeeDocument",
    "Project",
    "ProjectMilestone",
    "CRMCustomer",
    "CRMOpportunity",
    "CRMActivity",
    "PurchaseRequest",
    "WorkflowApproval",
]

from app.models.workspace import WorkspacePreference, CompanyWorkspace
