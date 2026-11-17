import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class EmployeeBase(BaseModel):
    employee_number: str
    full_name: str
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    employment_status: str = "Active"  # Active, On Leave, Suspended, Terminated
    manager_id: Optional[uuid.UUID] = None
    hire_date: Optional[date] = None
    employment_type: Optional[str] = "Full-Time"
    work_location: Optional[str] = None
    avatar_url: Optional[str] = None


class EmployeeBranchAssignmentInput(BaseModel):
    company_id: Optional[uuid.UUID] = None
    branch_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    role_name: Optional[str] = "Employee"
    job_title: Optional[str] = None
    is_primary: bool = False


class EmployeeCreate(EmployeeBase):
    company_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    branch_ids: Optional[List[uuid.UUID]] = None
    company_ids: Optional[List[uuid.UUID]] = None
    assignments: Optional[List[EmployeeBranchAssignmentInput]] = None
    role_name: Optional[str] = "Employee"
    create_user_account: Optional[bool] = False
    username: Optional[str] = None
    password: Optional[str] = None


class EmployeeUpdate(BaseModel):
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    branch_ids: Optional[List[uuid.UUID]] = None
    employee_number: Optional[str] = None
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    employment_status: Optional[str] = None
    manager_id: Optional[uuid.UUID] = None
    hire_date: Optional[date] = None
    employment_type: Optional[str] = None
    work_location: Optional[str] = None
    avatar_url: Optional[str] = None
    change_reason: Optional[str] = None


class EmployeeResponse(EmployeeBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    branch_name: Optional[str] = None
    department_name: Optional[str] = None
    company_name: Optional[str] = None
    has_user_account: Optional[bool] = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    username: str
    email: str
    account_status: str = "Active"
    is_superadmin: bool = False


class UserCreate(UserBase):
    password: str
    employee_id: Optional[uuid.UUID] = None
    company_ids: Optional[List[uuid.UUID]] = None
    role_names: Optional[List[str]] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_status: Optional[str] = None
    is_superadmin: Optional[bool] = None
    role_names: Optional[List[str]] = None
    company_ids: Optional[List[uuid.UUID]] = None


class UserResponse(UserBase):
    id: uuid.UUID
    employee_id: Optional[uuid.UUID] = None
    full_name: Optional[str] = None
    roles: List[str] = []
    companies: List[dict] = []
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
