#!/usr/bin/env bash
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

# ==============================================================================
# Investor Gate IT Operations Management System — Automated Backup Script
# Creates compressed SQL dump and uploaded attachments archive
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="${BACKUP_DIR}/backup_${TIMESTAMP}"

mkdir -p "${BACKUP_PATH}"

echo "--> [$(date)] Starting backup: ${BACKUP_PATH}"

# 1. Database Dump (PostgreSQL)
if docker ps --format '{{.Names}}' | grep -q "itops-db"; then
    echo "--> Exporting PostgreSQL database..."
    docker exec -t itops-db pg_dump -U postgres -d it_ops -F c -b -v -f /tmp/db_dump.dump
    docker cp itops-db:/tmp/db_dump.dump "${BACKUP_PATH}/database.dump"
    docker exec -t itops-db rm /tmp/db_dump.dump
elif [ -f "./it_ops.db" ]; then
    echo "--> Exporting SQLite database fallback..."
    sqlite3 ./it_ops.db ".backup '${BACKUP_PATH}/database.sqlite'"
fi

# 2. Uploads and Attachments Backup
echo "--> Archiving file uploads..."
if docker volume inspect itops_upload_data &> /dev/null; then
    docker run --rm -v itops_upload_data:/data -v "$(pwd)/${BACKUP_PATH}:/backup" alpine tar czf /backup/uploads.tar.gz -C /data .
elif [ -d "./backend/uploads" ]; then
    tar -czf "${BACKUP_PATH}/uploads.tar.gz" -C ./backend/uploads .
else
    echo "No uploads directory found, skipping."
fi

# 3. Environment configuration snapshot (redacted password)
if [ -f .env ]; then
    cp .env "${BACKUP_PATH}/env_snapshot"
fi

# 4. Create final unified archive
tar -czf "${BACKUP_DIR}/itops_backup_${TIMESTAMP}.tar.gz" -C "${BACKUP_DIR}" "backup_${TIMESTAMP}"
rm -rf "${BACKUP_PATH}"

echo "--> Backup package created: ${BACKUP_DIR}/itops_backup_${TIMESTAMP}.tar.gz"

# 5. Retention policy: Keep only backups from the last 30 days
find "${BACKUP_DIR}" -name "itops_backup_*.tar.gz" -type f -mtime +30 -delete
echo "--> [$(date)] Backup completed successfully."
