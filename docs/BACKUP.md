# Investor Gate IT Operations Management System — Backup & Disaster Recovery Guide

## 1. Backup Strategy Overview
The backup routine safeguards two core components:
1. **Relational Database (`it_ops`):** Complete schema, constraints, sequences, tables, and relationships.
2. **File Uploads Volume (`/data/uploads`):** Handover receipt signatures, device receipts, attachments, and company logos.

---

## 2. Running an On-Demand Backup

To trigger an immediate backup:
```bash
./scripts/backup.sh
```

This creates a self-contained compressed archive in `./backups/` named:
`itops_backup_YYYYMMDD_HHMMSS.tar.gz`

### Content of the Backup Package:
- `database.dump`: Binary custom format PostgreSQL dump created via `pg_dump -F c`.
- `uploads.tar.gz`: Compressed tarball of all user-uploaded files.
- `env_snapshot`: Configuration parameters for quick recovery.

---

## 3. Automated Daily Cron Job

To run the backup automatically every night at 02:00 AM:
```bash
sudo crontab -e
```
Add the following line:
```cron
0 2 * * * cd /opt/itops && ./scripts/backup.sh >> /var/log/itops_backup.log 2>&1
```

The script automatically enforces a **30-day retention window**, pruning older backup archives automatically.

---

## 4. Disaster Recovery & Restoration

To restore a system from a backup package:
```bash
./scripts/restore.sh ./backups/itops_backup_20261113_020000.tar.gz
```

The script will:
1. Prompt for explicit confirmation before altering existing state.
2. Stop active write operations.
3. Clean and restore the PostgreSQL database using `pg_restore --clean`.
4. Restore upload assets into the Docker persistent volume.
5. Restart the backend and frontend application containers.
6. Verify service health.

---

## 5. Off-Site Backup Synchronization

To prevent data loss from physical server failure, sync the backup folder to an offsite secure destination via `rsync` or `rclone`:
```bash
rsync -avz -e "ssh -p 22" /opt/itops/backups/ backupuser@remote-storage.local:/backups/itops/
```
