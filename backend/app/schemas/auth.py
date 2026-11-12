import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UserInfo(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    account_status: str
    is_superadmin: bool
    roles: List[str]
    companies: List[dict]
    active_company_id: Optional[uuid.UUID] = None
    employee_id: Optional[uuid.UUID] = None
    full_name: Optional[str] = None


class LoginResponse(BaseModel):
    user: UserInfo
    message: str = "تم تسجيل الدخول بنجاح"
