from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    companies,
    employees,
    assets,
    custody,
    infrastructure,
    subscriptions,
    maintenance,
    tasks,
    tickets,
    notifications,
    dashboard,
    reports,
    audit,
    integrations,
    customization,
    digital_assets,
    users,
    telegram,
)

api_router = APIRouter(prefix="/v1")

api_router.include_router(auth.router)
api_router.include_router(companies.router)
api_router.include_router(employees.router)
api_router.include_router(users.router)
api_router.include_router(assets.router)
api_router.include_router(custody.router)
api_router.include_router(infrastructure.router)
api_router.include_router(subscriptions.router)
api_router.include_router(maintenance.router)
api_router.include_router(tasks.router)
api_router.include_router(tickets.router)
api_router.include_router(notifications.router)
api_router.include_router(dashboard.router)
api_router.include_router(reports.router)
api_router.include_router(audit.router)
api_router.include_router(integrations.router)
api_router.include_router(customization.router)
api_router.include_router(digital_assets.router)
api_router.include_router(telegram.router)

from app.api.v1.endpoints import workspace, system, enterprise
api_router.include_router(workspace.router)
api_router.include_router(system.router)
api_router.include_router(enterprise.hrm_router)
api_router.include_router(enterprise.crm_router)
api_router.include_router(enterprise.projects_router)
api_router.include_router(enterprise.approvals_router)
