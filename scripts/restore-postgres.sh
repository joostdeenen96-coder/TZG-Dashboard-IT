#!/bin/sh
# Productierestore. Vereist expliciete bevestiging, host en database.
set -eu
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Zet RESTORE_CONFIRM=yes om te herstellen." >&2
  exit 1
fi
dump="${1:-}"
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "Gebruik: RESTORE_CONFIRM=yes RESTORE_DB=tzg scripts/restore-postgres.sh backups/bestand.dump" >&2
  exit 1
fi
db="${RESTORE_DB:-}"
if [ -z "$db" ]; then
  echo "Zet RESTORE_DB op de doeldatabase." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
case "$dump" in
  *.dump)
    docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -U "$POSTGRES_USER" -d '"$db" < "$dump"
    ;;
  *)
    docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d '"$db" < "$dump"
    ;;
esac
echo "restore klaar"
