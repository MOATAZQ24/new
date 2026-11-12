import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: uuid.UUID
    recipient_user_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    event_type: str
    title: str
    message: str
    related_record_type: Optional[str] = None
    related_record_id: Optional[uuid.UUID] = None
    channel: str
    delivery_status: str
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
