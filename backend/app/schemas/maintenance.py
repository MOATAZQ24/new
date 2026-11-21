# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MaintenanceBase(BaseModel):
    target_type: str  # asset, infrastructure
    target_id: uuid.UUID
    action_type: str  # Maintenance, Replacement, Configuration Change
    title: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    cost: Optional[float] = None
    status: str = "Open"  # Open, In Progress, Pending Approval, Completed, Cancelled
    notes: Optional[str] = None

    # Config change specific fields
    old_configuration_reference: Optional[str] = None
    new_configuration_reference: Optional[str] = None
    change_reason: Optional[str] = None
    risk_assessment: Optional[str] = None
    approval_status: str = "Pending"  # Pending, Approved, Rejected, Not Required
    planned_execution_window: Optional[str] = None
    rollback_plan: Optional[str] = None
    verification_result: Optional[str] = None

    # Replacement specific fields
    replacement_asset_id: Optional[uuid.UUID] = None


class MaintenanceCreate(MaintenanceBase):
    company_id: uuid.UUID
    reported_by_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None


class MaintenanceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    reported_by_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None
    start_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    old_configuration_reference: Optional[str] = None
    new_configuration_reference: Optional[str] = None
    change_reason: Optional[str] = None
    risk_assessment: Optional[str] = None
    approval_status: Optional[str] = None
    planned_execution_window: Optional[str] = None
    rollback_plan: Optional[str] = None
    verification_result: Optional[str] = None
    replacement_asset_id: Optional[uuid.UUID] = None


class MaintenanceResponse(MaintenanceBase):
    id: uuid.UUID
    company_id: uuid.UUID
    reported_by_id: Optional[uuid.UUID] = None
    assigned_technician_id: Optional[uuid.UUID] = None
    reported_by_name: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    target_name: Optional[str] = None
    replacement_asset_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
