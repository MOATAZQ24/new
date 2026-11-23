# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Idempotency-Key replay helper and URL-safe keyset cursor codec."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.work_management import IdempotencyKey


def extract_idempotency_key(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    raw = request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key")
    if not raw:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    if len(cleaned) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header exceeds maximum length of 128 characters.",
        )
    return cleaned


def lookup_idempotent_response(
    db: Session,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    key: Optional[str],
    method: str,
    path: str,
) -> Optional[Dict[str, Any]]:
    """Return cached JSON body for a valid unexpired Idempotency-Key replay."""
    if not key:
        return None
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.company_id == company_id,
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.key == key,
        )
        .first()
    )
    if not existing:
        return None
    if existing.expires_at <= now:
        db.delete(existing)
        db.flush()
        return None
    if existing.method.upper() != method.upper() or existing.path != path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency-Key was already used for a different endpoint.",
        )
    return existing.response_body


def store_idempotent_response(
    db: Session,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    key: Optional[str],
    method: str,
    path: str,
    response_body: Dict[str, Any],
    response_status: int = 200,
    ttl_hours: int = 24,
) -> None:
    """Persist an Idempotency-Key response payload safely."""
    if not key:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Ensure JSON-safe copy
    safe_body = json.loads(json.dumps(response_body, default=str))
    entry = IdempotencyKey(
        company_id=company_id,
        user_id=user_id,
        key=key,
        method=method.upper(),
        path=path,
        response_status=response_status,
        response_body=safe_body,
        expires_at=now + timedelta(hours=ttl_hours),
    )
    try:
        db.add(entry)
        db.commit()
    except IntegrityError:
        db.rollback()


def encode_cursor(created_at: Optional[datetime], item_id: uuid.UUID) -> str:
    payload = {
        "ts": created_at.isoformat() if created_at else None,
        "id": str(item_id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> Tuple[Optional[datetime], uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
        ts = datetime.fromisoformat(data["ts"]) if data.get("ts") else None
        uid = uuid.UUID(data["id"])
        return ts, uid
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination cursor.",
        )
