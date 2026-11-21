#!/usr/bin/env bash
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

# ==============================================================================
# Investor Gate IT Operations Management System — Database & Files Restore Script
# Usage: ./scripts/restore.sh /path/to/itops_backup_YYYYMMDD_HHMMSS.tar.gz
# ==============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Error: Backup file path required."
    echo "Usage: $0 <path_to_backup_archive.tar.gz>"
    exit 1
fi

ARCHIVE_FILE="$1"
if [ ! -f "$ARCHIVE_FILE" ]; then
    echo "Error: Archive file not found at $ARCHIVE_FILE"
    exit 1
fi

echo "=========================================================="
echo " WARNING: THIS WILL OVERWRITE CURRENT DATABASE AND UPLOADS "
echo " Target Archive: $ARCHIVE_FILE                             "
echo "=========================================================="
read -p "Are you absolutely sure you want to proceed? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restoration aborted by user."
    exit 0
fi

TEMP_RESTORE_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_RESTORE_DIR"' EXIT

echo "--> Extracting archive..."
tar -xzf "$ARCHIVE_FILE" -C "$TEMP_RESTORE_DIR"
UNPACKED_DIR=$(find "$TEMP_RESTORE_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)

# 1. Restore PostgreSQL Database
if [ -f "${UNPACKED_DIR}/database.dump" ]; then
    echo "--> Restoring PostgreSQL database from dump..."
    docker cp "${UNPACKED_DIR}/database.dump" itops-db:/tmp/restore.dump
    docker exec -t itops-db pg_restore -U postgres -d it_ops --clean --if-exists /tmp/restore.dump || true
    docker exec -t itops-db rm /tmp/restore.dump
    echo "--> Database restored."
fi

# 2. Restore Uploads
if [ -f "${UNPACKED_DIR}/uploads.tar.gz" ]; then
    echo "--> Restoring uploads volume..."
    docker run --rm -v itops_upload_data:/data -v "${UNPACKED_DIR}:/backup" alpine sh -c "rm -rf /data/* && tar xzf /backup/uploads.tar.gz -C /data"
    echo "--> Uploads restored."
fi

echo "--> Restarting application containers..."
docker compose restart backend frontend

echo "=========================================================="
echo " Restoration completed successfully!                     "
echo "=========================================================="
