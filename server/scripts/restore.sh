#!/bin/sh
# Återställer från en backup. Användning: restore.sh /var/backups/lydia/db-20260101-0300.sql.gz /var/backups/lydia/files-20260101-0300.tar.gz
set -e
DB_GZ="$1"
FILES_GZ="$2"
[ -z "$DB_GZ" ] && { echo "Användning: restore.sh <db.sql.gz> <files.tar.gz>"; exit 1; }
PGPASS="${PG_SUPERUSER_URL:?Sätt PG_SUPERUSER_URL}"
echo "Återställer PostgreSQL från $DB_GZ ..."
gunzip -c "$DB_GZ" | psql "$PGPASS" --set ON_ERROR_STOP=on
if [ -n "$FILES_GZ" ]; then
  echo "Återställer filer från $FILES_GZ ..."
  mkdir -p "${STORAGE_DIR:-/var/lydia/files}"
  tar xzf "$FILES_GZ" -C "${STORAGE_DIR:-/var/lydia/files}"
fi
echo "Återställning klar."