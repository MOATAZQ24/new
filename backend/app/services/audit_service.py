import uuid
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


def log_audit(
    db: Session,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    company_id: Optional[uuid.UUID] = None,
    old_values: Optional[Any] = None,
    new_values: Optional[Any] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    """Log an audit entry."""
    entry = AuditLog(
        user_id=user_id,
        company_id=company_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return entry
