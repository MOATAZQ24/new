import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel


class TechnicalAssetBase(BaseModel):
    asset_code: str
    asset_name: str
    asset_type: str  # Laptop, Desktop, Mobile Phone, Tablet, Monitor, Printer, Other
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    condition: str = "Good"  # New, Excellent, Good, Fair, Poor
    status: str = "Available"  # Available, Assigned, Under Maintenance, Damaged, Retired, Lost
    notes: Optional[str] = None


class TechnicalAssetCreate(TechnicalAssetBase):
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    assigned_employee_id: Optional[uuid.UUID] = None


class TechnicalAssetUpdate(BaseModel):
    asset_name: Optional[str] = None
    asset_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    assigned_employee_id: Optional[uuid.UUID] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    condition: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class TechnicalAssetResponse(TechnicalAssetBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    assigned_employee_id: Optional[uuid.UUID] = None
    assigned_employee_name: Optional[str] = None
    branch_name: Optional[str] = None
    department_name: Optional[str] = None
    qr_code_data: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AssetCustodyAssign(BaseModel):
    asset_id: uuid.UUID
    employee_id: uuid.UUID
    expected_return_date: Optional[date] = None
    condition_on_assignment: str = "Good"
    notes: Optional[str] = None
    acknowledgment: bool = False


class AssetCustodyReturn(BaseModel):
    condition_on_return: str
    notes: Optional[str] = None


class AssetCustodyTransfer(BaseModel):
    new_employee_id: uuid.UUID
    condition: str = "Good"
    notes: Optional[str] = None


class AssetCustodyResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    company_id: uuid.UUID
    employee_id: uuid.UUID
    assigned_by: Optional[uuid.UUID] = None
    assignment_date: datetime
    expected_return_date: Optional[date] = None
    actual_return_date: Optional[datetime] = None
    condition_on_assignment: str
    condition_on_return: Optional[str] = None
    acknowledgment: bool
    status: str
    notes: Optional[str] = None
    asset_name: Optional[str] = None
    asset_code: Optional[str] = None
    employee_name: Optional[str] = None
    assigner_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
