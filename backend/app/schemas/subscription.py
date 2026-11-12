import uuid
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class SubscriptionBase(BaseModel):
    service_name: str
    provider: Optional[str] = None
    subscription_type: str = "SaaS"
    package_type: str = "Standard"  # Basic, Standard, Professional, Business, Enterprise, Custom
    account_email: Optional[str] = None
    start_date: Optional[date] = None
    renewal_date: Optional[date] = None
    expiry_date: Optional[date] = None
    billing_cycle: str = "Annual"  # Monthly, Quarterly, Semi-Annual, Annual, Custom
    price: float = 0.0
    currency: str = "SAR"
    auto_renewal: bool = False
    status: str = "Active"  # Active, Expiring Soon, Expired, Suspended, Cancelled
    notes: Optional[str] = None


class SubscriptionCreate(SubscriptionBase):
    company_id: uuid.UUID
    assigned_owner_id: Optional[uuid.UUID] = None
    payment_responsible_id: Optional[uuid.UUID] = None


class SubscriptionUpdate(BaseModel):
    service_name: Optional[str] = None
    provider: Optional[str] = None
    subscription_type: Optional[str] = None
    package_type: Optional[str] = None
    assigned_owner_id: Optional[uuid.UUID] = None
    payment_responsible_id: Optional[uuid.UUID] = None
    account_email: Optional[str] = None
    start_date: Optional[date] = None
    renewal_date: Optional[date] = None
    expiry_date: Optional[date] = None
    billing_cycle: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    auto_renewal: Optional[bool] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionResponse(SubscriptionBase):
    id: uuid.UUID
    company_id: uuid.UUID
    assigned_owner_id: Optional[uuid.UUID] = None
    payment_responsible_id: Optional[uuid.UUID] = None
    assigned_owner_name: Optional[str] = None
    payment_responsible_name: Optional[str] = None
    days_to_renewal: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CostSummaryResponse(BaseModel):
    total_monthly_cost: float
    total_annual_cost: float
    currency: str = "SAR"
    active_subscriptions_count: int
    expiring_soon_count: int
