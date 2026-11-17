"""Role-Based Access Control (RBAC) & Fine-Grained Permission Matrix.
Enforces multi-company isolation and server-side authorization across all modules.
"""

import uuid
from typing import List, Dict, Set, Optional
from fastapi import HTTPException, Depends, status, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, CompanyMembership, UserRole, Role


# Standard Operational Actions
class Action:
    VIEW = "view"
    CREATE = "create"
    EDIT = "edit"
    DELETE = "delete"
    ASSIGN = "assign"
    APPROVE = "approve"
    EXPORT = "export"
    MANAGE_ACCESS = "manage_access"
    REVEAL_SECRETS = "reveal_secrets"


# System Modules
class Module:
    DASHBOARD = "dashboard"
    COMPANIES = "companies"
    EMPLOYEES = "employees"
    HRM = "hrm"
    CRM = "crm"
    PROJECTS = "projects"
    APPROVALS = "approvals"
    USERS = "users"
    ASSETS = "assets"
    CUSTODY = "custody"
    INFRASTRUCTURE = "infrastructure"
    SUBSCRIPTIONS = "subscriptions"
    MAINTENANCE = "maintenance"
    TASKS = "tasks"
    TICKETS = "tickets"
    DIGITAL_ASSETS = "digital_assets"
    SECRETS_VAULT = "secrets_vault"
    REPORTS = "reports"
    AUDIT = "audit"
    SETTINGS = "settings"


# Role Permission Matrix Definition
# Map: Role -> Module -> Set of Actions
ROLE_PERMISSION_MATRIX: Dict[str, Dict[str, Set[str]]] = {
    "Super Admin": {
        m: {
            Action.VIEW,
            Action.CREATE,
            Action.EDIT,
            Action.DELETE,
            Action.ASSIGN,
            Action.APPROVE,
            Action.EXPORT,
            Action.MANAGE_ACCESS,
            Action.REVEAL_SECRETS,
        }
        for m in [
            Module.DASHBOARD,
            Module.COMPANIES,
            Module.EMPLOYEES,
            Module.HRM,
            Module.CRM,
            Module.PROJECTS,
            Module.APPROVALS,
            Module.USERS,
            Module.ASSETS,
            Module.CUSTODY,
            Module.INFRASTRUCTURE,
            Module.SUBSCRIPTIONS,
            Module.MAINTENANCE,
            Module.TASKS,
            Module.TICKETS,
            Module.DIGITAL_ASSETS,
            Module.SECRETS_VAULT,
            Module.REPORTS,
            Module.AUDIT,
            Module.SETTINGS,
        ]
    },
    "Company Admin": {
        Module.DASHBOARD: {Action.VIEW, Action.EXPORT},
        Module.COMPANIES: {Action.VIEW, Action.EDIT, Action.MANAGE_ACCESS},
        Module.EMPLOYEES: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.HRM: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.CRM: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.PROJECTS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.APPROVALS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.APPROVE, Action.EXPORT},
        Module.USERS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.MANAGE_ACCESS, Action.EXPORT},
        Module.ASSETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.EXPORT},
        Module.CUSTODY: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.INFRASTRUCTURE: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.EXPORT},
        Module.SUBSCRIPTIONS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.APPROVE, Action.EXPORT},
        Module.MAINTENANCE: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.APPROVE, Action.EXPORT},
        Module.TASKS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.EXPORT},
        Module.TICKETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.DIGITAL_ASSETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.MANAGE_ACCESS, Action.EXPORT},
        Module.SECRETS_VAULT: {Action.VIEW, Action.MANAGE_ACCESS}, # Reveal requires explicit asset-level permission
        Module.REPORTS: {Action.VIEW, Action.EXPORT},
        Module.AUDIT: {Action.VIEW, Action.EXPORT},
        Module.SETTINGS: {Action.VIEW, Action.EDIT},
    },
    "IT Manager": {
        Module.DASHBOARD: {Action.VIEW, Action.EXPORT},
        Module.COMPANIES: {Action.VIEW},
        Module.EMPLOYEES: {Action.VIEW, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.HRM: {Action.VIEW, Action.CREATE, Action.EDIT, Action.APPROVE, Action.EXPORT},
        Module.CRM: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.EXPORT},
        Module.PROJECTS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.APPROVALS: {Action.VIEW, Action.CREATE, Action.APPROVE, Action.EXPORT},
        Module.USERS: {Action.VIEW, Action.ASSIGN},
        Module.ASSETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.EXPORT},
        Module.CUSTODY: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.INFRASTRUCTURE: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.EXPORT},
        Module.SUBSCRIPTIONS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.APPROVE, Action.EXPORT},
        Module.MAINTENANCE: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.APPROVE, Action.EXPORT},
        Module.TASKS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.TICKETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.APPROVE, Action.EXPORT},
        Module.DIGITAL_ASSETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN, Action.EXPORT},
        Module.SECRETS_VAULT: {Action.VIEW}, # Reveal requires explicit asset-level permission
        Module.REPORTS: {Action.VIEW, Action.EXPORT},
        Module.AUDIT: {Action.VIEW},
        Module.SETTINGS: {Action.VIEW},
    },
    "IT Technician": {
        Module.DASHBOARD: {Action.VIEW},
        Module.COMPANIES: {Action.VIEW},
        Module.EMPLOYEES: {Action.VIEW},
        Module.HRM: {Action.VIEW, Action.CREATE},
        Module.CRM: {Action.VIEW, Action.CREATE, Action.EDIT},
        Module.PROJECTS: {Action.VIEW, Action.CREATE, Action.EDIT},
        Module.APPROVALS: {Action.VIEW, Action.CREATE},
        Module.USERS: {Action.VIEW},
        Module.ASSETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN},
        Module.CUSTODY: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN},
        Module.INFRASTRUCTURE: {Action.VIEW, Action.CREATE, Action.EDIT},
        Module.SUBSCRIPTIONS: {Action.VIEW},
        Module.MAINTENANCE: {Action.VIEW, Action.CREATE, Action.EDIT},
        Module.TASKS: {Action.VIEW, Action.CREATE, Action.EDIT},
        Module.TICKETS: {Action.VIEW, Action.CREATE, Action.EDIT, Action.ASSIGN},
        Module.DIGITAL_ASSETS: {Action.VIEW},
        Module.SECRETS_VAULT: set(),
        Module.REPORTS: {Action.VIEW},
        Module.AUDIT: set(),
        Module.SETTINGS: {Action.VIEW},
    },
    "Employee": {
        Module.DASHBOARD: {Action.VIEW},
        Module.COMPANIES: set(),
        Module.EMPLOYEES: {Action.VIEW},
        Module.HRM: {Action.VIEW, Action.CREATE},
        Module.CRM: {Action.VIEW},
        Module.PROJECTS: {Action.VIEW},
        Module.APPROVALS: {Action.VIEW, Action.CREATE},
        Module.USERS: set(),
        Module.ASSETS: {Action.VIEW},
        Module.CUSTODY: {Action.VIEW},
        Module.INFRASTRUCTURE: set(),
        Module.SUBSCRIPTIONS: set(),
        Module.MAINTENANCE: set(),
        Module.TASKS: {Action.VIEW, Action.CREATE},
        Module.TICKETS: {Action.VIEW, Action.CREATE},
        Module.DIGITAL_ASSETS: set(),
        Module.SECRETS_VAULT: set(),
        Module.REPORTS: set(),
        Module.AUDIT: set(),
        Module.SETTINGS: {Action.VIEW},
    },
    "Auditor": {
        Module.DASHBOARD: {Action.VIEW, Action.EXPORT},
        Module.COMPANIES: {Action.VIEW, Action.EXPORT},
        Module.EMPLOYEES: {Action.VIEW, Action.EXPORT},
        Module.HRM: {Action.VIEW, Action.EXPORT},
        Module.CRM: {Action.VIEW, Action.EXPORT},
        Module.PROJECTS: {Action.VIEW, Action.EXPORT},
        Module.APPROVALS: {Action.VIEW, Action.EXPORT},
        Module.USERS: {Action.VIEW, Action.EXPORT},
        Module.ASSETS: {Action.VIEW, Action.EXPORT},
        Module.CUSTODY: {Action.VIEW, Action.EXPORT},
        Module.INFRASTRUCTURE: {Action.VIEW, Action.EXPORT},
        Module.SUBSCRIPTIONS: {Action.VIEW, Action.EXPORT},
        Module.MAINTENANCE: {Action.VIEW, Action.EXPORT},
        Module.TASKS: {Action.VIEW, Action.EXPORT},
        Module.TICKETS: {Action.VIEW, Action.EXPORT},
        Module.DIGITAL_ASSETS: {Action.VIEW, Action.EXPORT},
        Module.SECRETS_VAULT: set(),
        Module.REPORTS: {Action.VIEW, Action.EXPORT},
        Module.AUDIT: {Action.VIEW, Action.EXPORT},
        Module.SETTINGS: {Action.VIEW},
    },
}


def get_user_effective_roles(user: User, company_id: Optional[uuid.UUID], db: Session) -> List[str]:
    """Retrieve roles for the user strictly within the context of the active company."""
    if user.is_superadmin:
        return ["Super Admin"]

    if company_id:
        membership = (
            db.query(CompanyMembership)
            .filter(
                CompanyMembership.user_id == user.id,
                CompanyMembership.company_id == company_id,
                CompanyMembership.status == "Active",
            )
            .first()
        )
        if membership and membership.role:
            return [membership.role.name]
        return ["Employee"]

    user_roles = db.query(UserRole).filter(UserRole.user_id == user.id).all()
    roles = [ur.role.name for ur in user_roles if ur.role]
    return roles if roles else ["Employee"]


def has_module_permission(
    user: User,
    module: str,
    action: str,
    company_id: Optional[uuid.UUID],
    db: Session,
) -> bool:
    """Verify if a user has permission to perform an action on a module."""
    if user.is_superadmin:
        return True

    effective_roles = get_user_effective_roles(user, company_id, db)

    for role_name in effective_roles:
        role_perms = ROLE_PERMISSION_MATRIX.get(role_name, {})
        mod_perms = role_perms.get(module, set())
        if action in mod_perms:
            return True

    return False


def require_permission(module: str, action: str):
    """FastAPI Dependency for server-side RBAC validation."""
    from app.core.security import get_current_user, get_user_company_id

    def checker(
        current_user: User = Depends(get_current_user),
        active_cid: uuid.UUID = Depends(get_user_company_id),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_module_permission(current_user, module, action, active_cid, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"ليس لديك صلاحية ({action}) على قسم ({module}) في هذه الشركة",
            )
        return current_user

    return checker


def get_permission_matrix_serializable() -> Dict[str, Dict[str, List[str]]]:
    """Returns the matrix in a clean JSON-serializable format for frontend display."""
    result = {}
    for role, mods in ROLE_PERMISSION_MATRIX.items():
        result[role] = {m: sorted(list(actions)) for m, actions in mods.items()}
    return result
