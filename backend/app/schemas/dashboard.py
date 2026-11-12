from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class DashboardKPIsResponse(BaseModel):
    total_companies: int
    total_employees: int
    total_assets: int
    assigned_assets: int
    available_assets: int
    maintenance_assets: int
    infrastructure_devices: int
    active_subscriptions: int
    upcoming_renewals: int
    monthly_subscription_cost: float
    open_tasks: int
    overdue_tasks: int
    open_tickets: int
    critical_tickets: int
    pending_maintenance: int
    asset_status_distribution: Dict[str, int]
    task_status_distribution: Dict[str, int]
    ticket_priority_distribution: Dict[str, int]
    recent_activities: List[Dict[str, Any]]
