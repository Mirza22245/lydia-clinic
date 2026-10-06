#!/bin/sh
# Daglig krypterad backup av PostgreSQL + filer. Körs via cron på Hostinger VPS.
# Schemalägg: 0 3 * * * /app/server/scripts/backup.sh
set -e
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lydia}"
DATE=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"
PGPASS="${PG_SUPERUSER_URL:?Sätt PG_SUPERUSER_URL}"
echo "Dumpar PostgreSQL..."
pg_dump "$PGPASS" --no-owner --no-acl | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"
echo "Paketerar filer..."
tar czf "$BACKUP_DIR/files-$DATE.tar.gz" -C "${STORAGE_DIR:-/var/lydia/files}" .
# Behåll 14 dagar
find "$BACKUP_DIR" -name "*.gz" -mtime +14 -delete
echo "Backup klar: $BACKUP_DIR/db-$DATE.sql.gz + files-$DATE.tar.gz"