#!/bin/sh
set -e

DATA_PATH="${DATA_DIR:-/app/data}"
BACKUP_PATH="${BACKUP_DIRECTORY:-/backups}"
mkdir -p "$DATA_PATH" "$BACKUP_PATH"

# Volume-mounts vanaf de host hebben vaak een andere owner; appuser moet kunnen schrijven.
if [ "$(id -u)" = "0" ]; then
  chown -R appuser:appuser "$DATA_PATH" || true
  mkdir -p "$BACKUP_PATH"
  chmod 1777 "$BACKUP_PATH" || true
  exec setpriv --reuid=appuser --regid=appuser --clear-groups -- "$0" "$@"
fi

if [ -n "$DATABASE_URL" ]; then
  # Wacht op PostgreSQL en pas migraties toe (migrate.ts retried connectie).
  node /app/dist/server/scripts/db-migrate.js
  # Idempotente seed: organisatie + ontbrekende planning/ict. Bestaande dashboards blijven.
  node /app/dist/server/scripts/db-seed.js
fi

exec "$@"
