#!/bin/sh
# Update: valideren, backup, image bouwen, migratie, ready. Geen blinde git pull.
set -eu
cd "$(dirname "$0")/.."
echo "1. preflight"
./scripts/preflight-linux.sh
echo "2. configuratie"
NODE_ENV=production npm run config:validate
echo "3. huidige versie"
docker compose exec -T dashboard node -e "console.log(process.env.APP_VERSION||'onbekend', process.env.BUILD_COMMIT||'unknown')" || true
echo "4. databasebackup"
npm run backup:create
echo "5. image bouwen"
export BUILD_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose build dashboard
echo "6. containers vervangen"
docker compose up -d
echo "7. ready"
i=0
while [ "$i" -lt 40 ]; do
  if curl -fsS http://127.0.0.1:8080/api/health/ready >/dev/null; then
    echo "ready"
    curl -fsS http://127.0.0.1:8080/api/version
    echo
    echo "Bij fout: zie docs/ROLLBACK.md en ./scripts/rollback-production.sh"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done
echo "FAIL ready. Start rollbackprocedure: docs/ROLLBACK.md"
exit 1
