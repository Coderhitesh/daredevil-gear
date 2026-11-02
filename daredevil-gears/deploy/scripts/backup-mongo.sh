#!/usr/bin/env bash
# Nightly MongoDB backup with retention. Cron (02:30 IST):
#   30 2 * * * MONGODB_URI='mongodb://...' /opt/daredevil-gears/deploy/scripts/backup-mongo.sh >> /var/log/ddg-backup.log 2>&1
# Optional off-site copy: set BACKUP_S3_URI=s3://bucket/path (needs aws cli) or rclone remote in BACKUP_RCLONE_REMOTE.
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/daredevil-gears}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/ddg-$STAMP.archive.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
mongodump --uri="$MONGODB_URI" --archive="$FILE" --gzip
chmod 600 "$FILE"
echo "$(date -Is) backup written: $FILE ($(du -h "$FILE" | cut -f1))"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then aws s3 cp "$FILE" "$BACKUP_S3_URI/" --only-show-errors; fi
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE"; fi

find "$BACKUP_DIR" -name 'ddg-*.archive.gz' -mtime +"$RETENTION_DAYS" -delete
