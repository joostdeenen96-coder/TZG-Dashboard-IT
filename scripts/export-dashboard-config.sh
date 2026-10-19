#!/bin/sh
# Exporteer dashboards uit PostgreSQL naar data/dashboards.export.json in de container (host: ./data).
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T dashboard node dist/server/scripts/db-export.js
echo "export klaar: data/dashboards.export.json"
