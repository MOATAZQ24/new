import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class BranchBase(BaseModel):
    branch_name: str
    location: Optional[str] = None
    contact_details: Optional[str] = None
    status: str = "Active"


class BranchCreate(BaseModel):
    branch_name: str
    location: Optional[str] = None
    contact_details: Optional[str] = None
    status: str = "Active"
    company_id: Optional[uuid.UUID] = None


class BranchUpdate(BaseModel):
    branch_name: Optional[str] = None
    location: Optional[str] = None
    contact_details: Optional[str] = None
    status: Optional[str] = None


class BranchResponse(BranchBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DepartmentBase(BaseModel):
    department_name: str
    branch_id: Optional[uuid.UUID] = None
    manager_id: Optional[uuid.UUID] = None
    status: str = "Active"


class DepartmentCreate(BaseModel):
    department_name: str
    branch_id: Optional[uuid.UUID] = None
    manager_id: Optional[uuid.UUID] = None
    status: str = "Active"
    company_id: Optional[uuid.UUID] = None


class DepartmentUpdate(BaseModel):
    department_name: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    manager_id: Optional[uuid.UUID] = None
    status: Optional[str] = None


class DepartmentResponse(DepartmentBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CompanyBase(BaseModel):
    company_name_ar: str
    company_name_en: str
    company_code: str
    company_logo: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    company_type: str = "Internal"
    parent_company_id: Optional[uuid.UUID] = None
    status: str = "Active"


class CompanyCreate(CompanyBase):
    initial_branches: Optional[List[str]] = None
    initial_departments: Optional[List[str]] = None


class CompanyUpdate(BaseModel):
    company_name_ar: Optional[str] = None
    company_name_en: Optional[str] = None
    company_code: Optional[str] = None
    company_logo: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    company_type: Optional[str] = None
    parent_company_id: Optional[uuid.UUID] = None
    status: Optional[str] = None


class CompanyResponse(CompanyBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    branches_count: Optional[int] = 0
    employees_count: Optional[int] = 0

    class Config:
        from_attributes = True
