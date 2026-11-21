# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class UserCreateForm(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    username: str = Field(..., min_length=3, max_length=100)
    email: str = Field(..., min_length=5, max_length=255)
    phone: Optional[str] = None
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    role: str = Field("Employee", description="Super Admin, Company Admin, IT Manager, IT Technician, Employee, Auditor")
    account_status: str = "Active"
    password: Optional[str] = Field(None, min_length=6, description="Optional. If omitted, a secure temporary password is automatically generated")
    must_change_password: bool = True
    send_invitation: bool = True


class UserUpdateForm(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    account_status: Optional[str] = None
    role: Optional[str] = None
    is_superadmin: Optional[bool] = None


class UserStatusUpdate(BaseModel):
    account_status: str = Field(..., description="Active, Inactive, Suspended")


class UserResetPasswordAdmin(BaseModel):
    new_password: Optional[str] = Field(None, min_length=6, description="Optional custom password; auto-generated if omitted")
    must_change_password: bool = True
    reauth_password: str = Field(..., min_length=1, description="Admin password confirmation for sensitive reauthentication")


class CompanyAccessAssign(BaseModel):
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    role: str = "Employee"
    is_default: bool = False


class BulkUserItem(BaseModel):
    full_name: str
    username: str
    email: str
    phone: Optional[str] = None
    role: Optional[str] = "Employee"
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None


class BulkUserImportRequest(BaseModel):
    users: List[BulkUserItem]
