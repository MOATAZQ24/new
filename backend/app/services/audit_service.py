import uuid
from datetime import date, datetime
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


def _make_json_safe(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable types (UUID, date, datetime) to strings."""
    if isinstance(obj, dict):
        return {k: _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_safe(i) for i in obj]
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


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
    commit: bool = True,
) -> AuditLog:
    """Log an audit entry. All values are JSON-safe serialized before storage."""
    entry = AuditLog(
        user_id=user_id,
        company_id=company_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        old_values=_make_json_safe(old_values),
        new_values=_make_json_safe(new_values),
        ip_address=ip_address,
    )
    db.add(entry)
    if commit:
        db.commit()
    else:
        db.flush()
    return entry
