#!/usr/bin/env bash
# Restore a backup made by backup-mongo.sh.
#   MONGODB_URI='mongodb://...' ./restore-mongo.sh /var/backups/daredevil-gears/ddg-20261027-023000.archive.gz
# Restores into the database named in MONGODB_URI and DROPS existing collections first.
# Practise this on a staging database at least once a quarter.
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
FILE="${1:?usage: restore-mongo.sh <archive.gz>}"
[[ -f "$FILE" ]] || { echo "No such file: $FILE"; exit 1; }

read -r -p "This replaces the data in $(echo "$MONGODB_URI" | sed -E 's#//[^@]+@#//***@#'). Type RESTORE to continue: " ok
[[ "$ok" == "RESTORE" ]] || { echo "Aborted"; exit 1; }

mongorestore --uri="$MONGODB_URI" --archive="$FILE" --gzip --drop
echo "Restored $FILE. Now run: (cd backend && npm run indexes)"
