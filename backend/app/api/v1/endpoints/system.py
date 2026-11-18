"""System Administration & Disaster Recovery API Endpoints.

Provides:
- Real-time service & database health monitoring
- Table metrics & disk storage utilization
- One-click atomic backup creation with SHA-256 & integrity verification (SQLite & PostgreSQL)
- Controlled backup listing, verification, download, and atomic restore
- Operational diagnostics and diagnostic log streaming
- Strict RBAC: Super Admin only
"""

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import uuid
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, engine, get_db
from app.core.response import success_response
from app.core.security import require_role
from app.models.asset import TechnicalAsset
from app.models.audit import AuditLog
from app.models.company import Company
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.user import User, UserSession
from app.services.audit_service import log_audit

router = APIRouter(prefix="/system", tags=["System Administration & Disaster Recovery"])
logger = logging.getLogger(__name__)

_DEFAULT_BACKUP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "backups"))
BACKUP_DIR = settings.BACKUP_DIR or ("/data/backups" if os.path.isdir("/data/backups") else _DEFAULT_BACKUP_DIR)


def ensure_backup_dir() -> str:
    """Ensure backup directory exists."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    return BACKUP_DIR


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _json_default(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    return val


def _coerce_column_value(col, val):
    if val is None:
        return None
    py_type = None
    try:
        py_type = col.type.python_type
    except Exception:
        py_type = None
    if py_type is uuid.UUID and isinstance(val, str):
        return uuid.UUID(val)
    if py_type is datetime and isinstance(val, str):
        return datetime.fromisoformat(val)
    if py_type is date and isinstance(val, str):
        return date.fromisoformat(val[:10])
    return val


@router.get("/health")
def get_system_health(
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Retrieve comprehensive system health, database metrics, and storage stats."""
    db_status = "Connected"
    db_latency_ms = 0.0

    try:
        t0 = datetime.utcnow()
        db.execute(text("SELECT 1"))
        latency = (datetime.utcnow() - t0).total_seconds() * 1000
        db_latency_ms = round(latency, 2)
    except Exception as e:
        db_status = f"Error: {str(e)}"

    tables_stats = {}
    try:
        tables_stats["companies"] = db.query(Company).count()
        tables_stats["users"] = db.query(User).count()
        tables_stats["active_sessions"] = db.query(UserSession).filter(UserSession.is_active == True).count()
        tables_stats["assets"] = db.query(TechnicalAsset).count()
        tables_stats["tasks"] = db.query(Task).count()
        tables_stats["tickets"] = db.query(HelpDeskTicket).count()
        tables_stats["audit_logs"] = db.query(AuditLog).count()
    except Exception as e:
        logger.warning("Failed to fetch table counts: %s", e)

    disk_stats = {}
    try:
        usage = shutil.disk_usage(os.path.abspath("."))
        disk_stats["total_gb"] = round(usage.total / (1024**3), 2)
        disk_stats["used_gb"] = round(usage.used / (1024**3), 2)
        disk_stats["free_gb"] = round(usage.free / (1024**3), 2)
        disk_stats["used_percent"] = round((usage.used / usage.total) * 100, 1)
    except Exception as e:
        disk_stats["error"] = str(e)

    db_file_size_mb = 0.0
    is_sqlite = engine.url.drivername.startswith("sqlite")
    if is_sqlite:
        db_path = engine.url.database or "it_ops.db"
        if os.path.exists(db_path):
            db_file_size_mb = round(os.path.getsize(db_path) / (1024**2), 2)

    b_dir = ensure_backup_dir()
    backup_files = [f for f in os.listdir(b_dir) if f.endswith((".db", ".sql", ".json"))]
    backups_count = len(backup_files)

    data = {
        "status": "Operational",
        "timestamp": datetime.utcnow().isoformat(),
        "database": {
            "engine": engine.url.drivername,
            "status": db_status,
            "latency_ms": db_latency_ms,
            "file_size_mb": db_file_size_mb,
            "table_records": tables_stats,
        },
        "storage": disk_stats,
        "backups_count": backups_count,
        "environment": "LAN-Hosted (Outbound-Only)",
    }
    return success_response(data=data)


@router.post("/backup")
@router.post("/backups")
def create_backup(
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Trigger an atomic, verified database backup for SQLite or PostgreSQL."""
    b_dir = ensure_backup_dir()
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    is_sqlite = engine.url.drivername.startswith("sqlite")

    if is_sqlite:
        source_db = engine.url.database or "it_ops.db"
        if not os.path.exists(source_db) and os.path.exists(os.path.join("backend", "it_ops.db")):
            source_db = os.path.join("backend", "it_ops.db")

        dest_filename = f"it_ops_backup_{timestamp_str}.db"
        dest_path = os.path.join(b_dir, dest_filename)

        try:
            src_conn = sqlite3.connect(source_db)
            dst_conn = sqlite3.connect(dest_path)
            with dst_conn:
                src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()

            verify_conn = sqlite3.connect(dest_path)
            res = verify_conn.execute("PRAGMA integrity_check").fetchone()
            verify_conn.close()

            if not res or res[0] != "ok":
                raise RuntimeError("Backup integrity check failed")

            file_size_kb = round(os.path.getsize(dest_path) / 1024, 2)
            sha256_hex = _sha256_file(dest_path)

            log_audit(
                db=db,
                action="BACKUP_CREATE",
                resource_type="System",
                resource_id=dest_filename,
                user_id=current_user.id,
                new_values={"filename": dest_filename, "size_kb": file_size_kb, "sha256": sha256_hex},
            )

            return success_response(
                data={
                    "filename": dest_filename,
                    "size_kb": file_size_kb,
                    "sha256": sha256_hex,
                    "created_at": datetime.utcnow().isoformat(),
                    "verified": True,
                },
                message=f"تم إنشاء النسخة الاحتياطية بنجاح والتحقق من سلامتها ({dest_filename})",
            )
        except Exception as e:
            logger.error("Failed to create SQLite backup: %s", e)
            raise HTTPException(status_code=500, detail=f"فشل إنشاء النسخة الاحتياطية: {str(e)}")
    else:
        import app.models  # noqa: F401

        dest_filename = f"pg_dump_{timestamp_str}.sql"
        dest_path = os.path.join(b_dir, dest_filename)
        try:
            tables_payload = {}
            total_rows = 0
            for table in Base.metadata.sorted_tables:
                rows = [dict(r._mapping) for r in db.execute(table.select()).fetchall()]
                tables_payload[table.name] = rows
                total_rows += len(rows)

            body_bytes = json.dumps(tables_payload, default=_json_default, ensure_ascii=False, sort_keys=True).encode("utf-8")
            body_sha256 = hashlib.sha256(body_bytes).hexdigest()
            envelope = {
                "format": "investorgate_pg_snapshot_v1",
                "created_at": datetime.utcnow().isoformat(),
                "engine": engine.url.drivername,
                "table_count": len(tables_payload),
                "total_rows": total_rows,
                "payload_sha256": body_sha256,
                "tables": tables_payload,
            }
            with open(dest_path, "wb") as f:
                f.write(json.dumps(envelope, default=_json_default, ensure_ascii=False, indent=2).encode("utf-8"))

            file_size_kb = round(os.path.getsize(dest_path) / 1024, 2)
            file_sha256 = _sha256_file(dest_path)

            log_audit(
                db=db,
                action="BACKUP_CREATE",
                resource_type="System",
                resource_id=dest_filename,
                user_id=current_user.id,
                new_values={"filename": dest_filename, "size_kb": file_size_kb, "rows": total_rows, "sha256": file_sha256},
            )

            return success_response(
                data={
                    "filename": dest_filename,
                    "size_kb": file_size_kb,
                    "total_rows": total_rows,
                    "sha256": file_sha256,
                    "created_at": datetime.utcnow().isoformat(),
                    "verified": True,
                },
                message=f"تم إنشاء النسخة الاحتياطية لقاعدة بيانات PostgreSQL والتحقق من سلامتها ({dest_filename})",
            )
        except Exception as e:
            logger.error("Failed to create PostgreSQL backup: %s", e)
            raise HTTPException(status_code=500, detail=f"فشل إنشاء النسخة الاحتياطية لـ PostgreSQL: {str(e)}")


@router.get("/backups")
def list_backups(
    current_user: User = Depends(require_role(["Super Admin"])),
):
    """List all available disaster recovery backup snapshots."""
    b_dir = ensure_backup_dir()
    files = []
    for f in os.listdir(b_dir):
        if f.endswith((".db", ".sql", ".bak", ".json")):
            full_path = os.path.join(b_dir, f)
            stat = os.stat(full_path)
            files.append({
                "filename": f,
                "size_kb": round(stat.st_size / 1024, 2),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })

    files.sort(key=lambda x: x["created_at"], reverse=True)
    return success_response(data=files)


@router.post("/backups/{filename}/verify")
def verify_backup_snapshot(
    filename: str,
    current_user: User = Depends(require_role(["Super Admin"])),
):
    """Verify backup file integrity and checksum."""
    clean_name = os.path.basename(filename)
    b_dir = ensure_backup_dir()
    file_path = os.path.join(b_dir, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="ملف النسخة الاحتياطية غير موجود")

    if clean_name.endswith(".db"):
        conn = sqlite3.connect(file_path)
        res = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()
        verified = bool(res and res[0] == "ok")
    else:
        with open(file_path, "rb") as f:
            envelope = json.loads(f.read().decode("utf-8"))
        body_bytes = json.dumps(envelope.get("tables", {}), default=_json_default, ensure_ascii=False, sort_keys=True).encode("utf-8")
        verified = hashlib.sha256(body_bytes).hexdigest() == envelope.get("payload_sha256")

    if not verified:
        raise HTTPException(status_code=400, detail="فشل فحص سلامة ملف النسخة الاحتياطية")

    return success_response(
        data={"filename": clean_name, "verified": True, "sha256": _sha256_file(file_path)},
        message="تم التحقق من سلامة النسخة الاحتياطية بنجاح",
    )


@router.post("/backups/{filename}/restore")
def restore_backup_snapshot(
    filename: str,
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Verify and atomically restore a backup snapshot with automatic pre-restore safety backup."""
    clean_name = os.path.basename(filename)
    b_dir = ensure_backup_dir()
    file_path = os.path.join(b_dir, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="ملف النسخة الاحتياطية غير موجود")

    # 1. Create pre-restore safety snapshot
    safety_res = create_backup(current_user=current_user, db=db)
    safety_filename = safety_res["data"]["filename"]

    is_sqlite = engine.url.drivername.startswith("sqlite")
    if is_sqlite:
        verify_conn = sqlite3.connect(file_path)
        res = verify_conn.execute("PRAGMA integrity_check").fetchone()
        verify_conn.close()
        if not res or res[0] != "ok":
            raise HTTPException(status_code=400, detail="ملف النسخة الاحتياطية تالف")

        target_db = engine.url.database or "it_ops.db"
        src_conn = sqlite3.connect(file_path)
        dst_conn = sqlite3.connect(target_db)
        with dst_conn:
            src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()
    else:
        import app.models  # noqa: F401

        with open(file_path, "rb") as f:
            envelope = json.loads(f.read().decode("utf-8"))
        tables_data = envelope.get("tables", {})
        body_bytes = json.dumps(tables_data, default=_json_default, ensure_ascii=False, sort_keys=True).encode("utf-8")
        if hashlib.sha256(body_bytes).hexdigest() != envelope.get("payload_sha256"):
            raise HTTPException(status_code=400, detail="فشل التحقق من البصمة الرقمية للنسخة الاحتياطية")

        try:
            for table in reversed(Base.metadata.sorted_tables):
                if table.name in tables_data:
                    db.execute(table.delete())
            for table in Base.metadata.sorted_tables:
                rows = tables_data.get(table.name) or []
                if rows:
                    coerced_rows = [
                        {col.name: _coerce_column_value(col, row.get(col.name)) for col in table.columns if col.name in row}
                        for row in rows
                    ]
                    db.execute(table.insert(), coerced_rows)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Failed to restore PostgreSQL snapshot: %s", e)
            raise HTTPException(status_code=500, detail=f"فشل استرجاع النسخة الاحتياطية: {str(e)}")

    log_audit(
        db=db,
        action="BACKUP_RESTORE",
        resource_type="System",
        resource_id=clean_name,
        user_id=current_user.id,
        new_values={"restored_from": clean_name, "pre_restore_snapshot": safety_filename},
    )

    return success_response(
        data={"restored_from": clean_name, "pre_restore_snapshot": safety_filename, "verified": True},
        message=f"تمت استعادة النسخة الاحتياطية ({clean_name}) بنجاح",
    )


@router.get("/backups/{filename}/download")
def download_backup(
    filename: str,
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Securely stream-download a verified backup file."""
    clean_name = os.path.basename(filename)
    b_dir = ensure_backup_dir()
    file_path = os.path.join(b_dir, clean_name)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="ملف النسخة الاحتياطية غير موجود")

    log_audit(
        db=db,
        action="BACKUP_DOWNLOAD",
        resource_type="System",
        resource_id=clean_name,
        user_id=current_user.id,
    )

    return FileResponse(
        path=file_path,
        filename=clean_name,
        media_type="application/octet-stream",
    )


@router.get("/logs")
def get_system_logs(
    limit: int = 50,
    current_user: User = Depends(require_role(["Super Admin"])),
    db: Session = Depends(get_db),
):
    """Retrieve recent system audit trail events and operational diagnostics."""
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            "id": str(log.id),
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "user_name": log.user.username if log.user else "System",
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        }
        for log in logs
    ]
    return success_response(data=data)
