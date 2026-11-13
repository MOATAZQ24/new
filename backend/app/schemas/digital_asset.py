import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class DigitalAssetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    category: str = Field(..., max_length=100)  # Domain, Hosting, SaaS, Cloud Service, Social Media, Email, API Service, Database, Other
    platform: str = Field(..., max_length=100)  # AWS, Cloudflare, Google Cloud, Microsoft 365, GitHub, OpenAI, etc.
    company_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    url: Optional[str] = None
    username: Optional[str] = None
    account_email: Optional[str] = None
    recovery_email: Optional[str] = None
    recovery_phone: Optional[str] = None
    two_factor_method: Optional[str] = "Authenticator App (TOTP)"
    two_factor_phone: Optional[str] = None
    domain_registrar: Optional[str] = None
    nameservers: Optional[str] = None
    subscription_tier: Optional[str] = None
    payment_method: Optional[str] = None
    assigned_employee_id: Optional[uuid.UUID] = None
    status: str = "Active"
    expires_at: Optional[datetime] = None
    subscription_cost: Optional[float] = 0.0
    two_factor_enabled: bool = False
    notes: Optional[str] = None


class DigitalAssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    platform: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    url: Optional[str] = None
    username: Optional[str] = None
    account_email: Optional[str] = None
    recovery_email: Optional[str] = None
    recovery_phone: Optional[str] = None
    two_factor_method: Optional[str] = "Authenticator App (TOTP)"
    two_factor_phone: Optional[str] = None
    domain_registrar: Optional[str] = None
    nameservers: Optional[str] = None
    subscription_tier: Optional[str] = None
    payment_method: Optional[str] = None
    assigned_employee_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    expires_at: Optional[datetime] = None
    subscription_cost: Optional[float] = None
    two_factor_enabled: Optional[bool] = None
    notes: Optional[str] = None


class AssetSecretCreate(BaseModel):
    secret_type: str = Field(..., description="Password, API Key, Token, Recovery Code")
    secret_value: str = Field(..., min_length=1, description="Secret payload sent directly to HashiCorp Vault")
    access_policy: str = "Reauth Required"
    rotation_due: Optional[datetime] = None


class AssetSecretRotate(BaseModel):
    new_secret_value: str = Field(..., min_length=1)
    reauth_password: str = Field(..., min_length=1)


class AssetSecretRevealRequest(BaseModel):
    reauth_password: str = Field(..., min_length=1, description="Password confirmation required to reveal credential")


class AssetAccessPermissionCreate(BaseModel):
    user_id: uuid.UUID
    access_level: str = "Viewer"  # Owner, Admin, Editor, Viewer
    can_reveal_secrets: bool = False
    expires_at: Optional[datetime] = None


class AssetAccessPermissionUpdate(BaseModel):
    access_level: Optional[str] = None
    can_reveal_secrets: Optional[bool] = None
    status: Optional[str] = None
    expires_at: Optional[datetime] = None
