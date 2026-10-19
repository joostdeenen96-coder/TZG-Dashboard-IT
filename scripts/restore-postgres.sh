#!/bin/sh
# Herstel een pg_dump in de PostgreSQL-container.
# Vereist RESTORE_CONFIRM=yes zodat een restore niet per ongeluk draait.
set -eu
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Zet RESTORE_CONFIRM=yes om te herstellen." >&2
  exit 1
fi
dump="${1:-}"
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "Gebruik: RESTORE_CONFIRM=yes scripts/restore-postgres.sh backups/bestand.sql" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"
echo "restore klaar"
