import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    old_values: Optional[Any] = None
    new_values: Optional[Any] = None
    ip_address: Optional[str] = None
    user_name: Optional[str] = None
    company_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
