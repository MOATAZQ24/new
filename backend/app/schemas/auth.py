# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str



class UserInfo(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    account_status: str
    is_superadmin: bool
    must_change_password: Optional[bool] = False
    roles: List[str]
    companies: List[dict]
    active_company_id: Optional[uuid.UUID] = None
    employee_id: Optional[uuid.UUID] = None
    full_name: Optional[str] = None


class LoginResponse(BaseModel):
    user: UserInfo
    message: str = "تم تسجيل الدخول بنجاح"
