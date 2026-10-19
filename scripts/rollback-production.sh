#!/bin/sh
# Non-destructieve applicatierollback. Geen automatische database-downgrade.
set -eu
cd "$(dirname "$0")/.."
image="${1:-}"
if [ -z "$image" ]; then
  echo "Gebruik: scripts/rollback-production.sh tzg-dashboard:vorige-tag"
  echo "Dit herstart alleen de applicatie-image. Database blijft onaangeraakt."
  echo "Databaseherstel: RESTORE_CONFIRM=yes RESTORE_DB=tzg scripts/restore-postgres.sh backups/bestand.dump"
  exit 1
fi
echo "Applicatierollback naar $image (geen schemadowngrade)"
docker compose stop dashboard
docker compose rm -f dashboard
# Laat de operator de image-tag in compose of als IMAGE zetten.
IMAGE_OVERRIDE="$image"
docker run --rm --network container:tzg-postgres "$IMAGE_OVERRIDE" true >/dev/null 2>&1 || true
echo "Zet image: $image in docker-compose.yml of: docker tag $image tzg-dashboard:local"
echo "Daarna: docker compose up -d dashboard"
echo "Controle: curl -fsS http://127.0.0.1:8080/api/health/ready"
echo "Geen pg_dump restore uitgevoerd."
