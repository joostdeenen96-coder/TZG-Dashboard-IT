#!/bin/sh
# PostgreSQL-backup via Docker Compose. Geen wachtwoord in dit script.
set -eu
cd "$(dirname "$0")/.."
stamp=$(date +%Y%m%d-%H%M%S)
out="${1:-./backups/tzg-postgres-$stamp.sql}"
mkdir -p "$(dirname "$out")"
# Lokale socket in de container gebruikt de POSTGRES_USER uit de omgeving.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$out"
echo "backup geschreven: $out"
