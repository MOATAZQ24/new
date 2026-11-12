from app.schemas.auth import LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest
from app.schemas.company import (
    CompanyCreate, CompanyUpdate, CompanyResponse,
    BranchCreate, BranchUpdate, BranchResponse,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse
)
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    UserCreate, UserUpdate, UserResponse
)
from app.schemas.asset import (
    TechnicalAssetCreate, TechnicalAssetUpdate, TechnicalAssetResponse,
    AssetCustodyAssign, AssetCustodyReturn, AssetCustodyTransfer, AssetCustodyResponse
)
from app.schemas.infrastructure import (
    InfrastructureCreate, InfrastructureUpdate, InfrastructureResponse
)
from app.schemas.subscription import (
    SubscriptionCreate, SubscriptionUpdate, SubscriptionResponse, CostSummaryResponse
)
from app.schemas.maintenance import (
    MaintenanceCreate, MaintenanceUpdate, MaintenanceResponse
)
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse, TaskCommentCreate, TaskCommentResponse
)
from app.schemas.ticket import (
    TicketCreate, TicketUpdate, TicketResponse, TicketCommentCreate, TicketCommentResponse
)
from app.schemas.notification import NotificationResponse
from app.schemas.audit import AuditLogResponse
from app.schemas.dashboard import DashboardKPIsResponse

__all__ = [
    "LoginRequest", "LoginResponse", "UserInfo", "ChangePasswordRequest",
    "CompanyCreate", "CompanyUpdate", "CompanyResponse",
    "BranchCreate", "BranchUpdate", "BranchResponse",
    "DepartmentCreate", "DepartmentUpdate", "DepartmentResponse",
    "EmployeeCreate", "EmployeeUpdate", "EmployeeResponse",
    "UserCreate", "UserUpdate", "UserResponse",
    "TechnicalAssetCreate", "TechnicalAssetUpdate", "TechnicalAssetResponse",
    "AssetCustodyAssign", "AssetCustodyReturn", "AssetCustodyTransfer", "AssetCustodyResponse",
    "InfrastructureCreate", "InfrastructureUpdate", "InfrastructureResponse",
    "SubscriptionCreate", "SubscriptionUpdate", "SubscriptionResponse", "CostSummaryResponse",
    "MaintenanceCreate", "MaintenanceUpdate", "MaintenanceResponse",
    "TaskCreate", "TaskUpdate", "TaskResponse", "TaskCommentCreate", "TaskCommentResponse",
    "TicketCreate", "TicketUpdate", "TicketResponse", "TicketCommentCreate", "TicketCommentResponse",
    "NotificationResponse",
    "AuditLogResponse",
    "DashboardKPIsResponse"
]
